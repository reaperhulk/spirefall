import { describe, expect, it } from 'vitest'
import {
  COMBO_HASTE_THRESHOLD,
  COMBO_MILESTONE,
  COMBO_WINDOW_TICKS,
  ENEMIES,
} from '../../data/content'
import { cellCenter } from '../grid'
import { getRunMap } from '../mapgen'
import { createMeta, createRun, settleRun } from '../meta'
import { step } from '../step'
import type { Enemy, RunState } from '../types'

// The kill-streak combo: unbroken kills pay a small capped bonus, silence
// or a leak breaks the chain, and the run remembers its best.

function makeEnemy(state: RunState, overrides: Partial<Enemy> & { id: number }): Enemy {
  const def = ENEMIES.runner
  return {
    type: 'runner',
    pos: cellCenter({ cx: 10, cy: 6 }),
    hp: 0, // most tests want an already-dead body for collectDead to book
    maxHp: def.hp,
    speed: 0,
    slowFactor: 100,
    slowTicks: 0,
    bounty: 1,
    damage: 1,
    shield: 0,
    armor: 0,
    healCooldown: 0,
    broodCooldown: 0,
    phased: false,
    phaseCooldown: 0,
    burnTicks: 0,
    burnPerTick: 0,
    overcharge: 0,
    mechCooldown: 0,
    mechActiveTicks: 0,
    brittleTicks: 0,
    targetCell: null,
    ...overrides,
  }
}

function waveState(): RunState {
  const s = createRun(createMeta(), 'combo-lab')
  s.phase = 'wave'
  s.wave = 3
  // A far-future pending spawn keeps the wave from clearing under us.
  s.pendingSpawns = [{ type: 'runner', tick: 1_000_000 }]
  return s
}

function killOne(s: RunState, id: number): RunState {
  s.enemies = [makeEnemy(s, { id })]
  return step(s, []).state
}

describe('kill-streak combo', () => {
  it('kills chain the streak, refresh the window, and remember the best', () => {
    let s = waveState()
    for (let i = 1; i <= 4; i++) s = killOne(s, i)
    expect(s.combo).toBe(4)
    expect(s.bestCombo).toBe(4)
    expect(s.comboTicks).toBe(COMBO_WINDOW_TICKS - 1) // decays the same tick it was set
  })

  it('the streak pays TEMPO, never gold: held streaks double ability recharge', () => {
    // Gold is untouched by the streak — the Bounty Banner lesson.
    let s = waveState()
    s.combo = 99
    s.comboTicks = COMBO_WINDOW_TICKS
    const before = s.gold
    s = killOne(s, 1)
    expect(s.gold).toBe(before + 1) // base runner bounty only

    // Below the threshold, cooldowns tick by 1…
    let slow = waveState()
    slow.combo = COMBO_HASTE_THRESHOLD - 1
    slow.comboTicks = COMBO_WINDOW_TICKS
    slow.abilities = { meteor: 100 }
    slow = step(slow, []).state
    expect(slow.abilities['meteor']).toBe(99)

    // …at the threshold, they tick by 2.
    let fast = waveState()
    fast.combo = COMBO_HASTE_THRESHOLD
    fast.comboTicks = COMBO_WINDOW_TICKS
    fast.abilities = { meteor: 100 }
    fast = step(fast, []).state
    expect(fast.abilities['meteor']).toBe(98)
  })

  it('silence breaks it; the best survives', () => {
    let s = waveState()
    for (let i = 1; i <= 3; i++) s = killOne(s, i)
    s.enemies = []
    for (let t = 0; t < COMBO_WINDOW_TICKS; t++) s = step(s, []).state
    expect(s.combo).toBe(0)
    expect(s.bestCombo).toBe(3)
  })

  it('a leak zeroes the streak instantly', () => {
    let s = waveState()
    for (let i = 1; i <= 3; i++) s = killOne(s, i)
    expect(s.combo).toBe(3)
    // A live runner standing ON the spire cell counts as arrived this tick.
    const map = getRunMap(s)
    s.enemies = [makeEnemy(s, { id: 99, hp: 5, speed: 100, pos: cellCenter(map.spire) })]
    s = step(s, []).state
    expect(s.combo).toBe(0)
    expect(s.comboTicks).toBe(0)
    expect(s.bestCombo).toBe(3)
  })

  it('every COMBO_MILESTONE kills announces itself once', () => {
    const s = waveState()
    s.combo = COMBO_MILESTONE - 1
    s.comboTicks = COMBO_WINDOW_TICKS
    s.enemies = [makeEnemy(s, { id: 1 })]
    const r = step(s, [])
    expect(r.events.filter((e) => e.type === 'combo_milestone')).toHaveLength(1)
    expect(r.state.combo).toBe(COMBO_MILESTONE)
  })

  it('the summary carries the best streak', () => {
    let s = waveState()
    for (let i = 1; i <= 12; i++) s = killOne(s, i)
    s.phase = 'defeat'
    const { summary } = settleRun(createMeta(), s)
    expect(summary.bestCombo).toBe(12)
  })
})
