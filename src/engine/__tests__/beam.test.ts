import { describe, expect, it } from 'vitest'
import {
  BEAM_COOL_PER_TICK,
  BEAM_DAMAGE_PER_TICK,
  BEAM_HEAT_MAX,
  ENEMIES,
} from '../../data/content'
import { cellCenter } from '../grid'
import { createMeta, createRun } from '../meta'
import { step } from '../step'
import type { Enemy, RunState } from '../types'

// The Spire beam: a steered pressure hose with a heat rhythm.

function makeEnemy(state: RunState, overrides: Partial<Enemy> & { id: number }): Enemy {
  return {
    type: 'runner',
    pos: cellCenter({ cx: 10, cy: 6 }),
    hp: 1000,
    maxHp: 1000,
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
  const s = createRun(createMeta(), 'beam-lab')
  s.phase = 'wave'
  s.wave = 5
  s.pendingSpawns = [{ type: 'runner', tick: 1_000_000 }]
  return s
}

const AIM = cellCenter({ cx: 10, cy: 6 })

describe('the Spire beam', () => {
  it('bites EVERYTHING along the spire→aim path — the line you see burns', () => {
    let s = waveState()
    // The spire sits on the right edge; the ray to AIM crosses these two…
    s.enemies = [
      makeEnemy(s, { id: 1, pos: { ...AIM } }),
      makeEnemy(s, { id: 2, pos: { x: AIM.x + 4000, y: AIM.y } }), // mid-path
      makeEnemy(s, { id: 3, pos: { x: AIM.x, y: AIM.y + 3000 } }), // well off the line
      makeEnemy(s, { id: 4, pos: { x: AIM.x - 4000, y: AIM.y } }), // BEYOND the aim point
    ]
    s = step(s, [{ type: 'set_beam', target: { ...AIM } }]).state
    expect(s.beamTarget).toEqual(AIM)
    expect(s.beamHeat).toBe(1)
    expect(s.enemies.find((e) => e.id === 1)!.hp).toBe(1000 - BEAM_DAMAGE_PER_TICK)
    expect(s.enemies.find((e) => e.id === 2)!.hp).toBe(1000 - BEAM_DAMAGE_PER_TICK)
    expect(s.enemies.find((e) => e.id === 3)!.hp).toBe(1000) // off the path
    expect(s.enemies.find((e) => e.id === 4)!.hp).toBe(1000) // the ray STOPS at the aim
    // Armor taxes to the min-1 floor; shields block outright.
    s.enemies[0]!.armor = 5
    const hpBefore = s.enemies[0]!.hp
    s = step(s, []).state
    expect(hpBefore - s.enemies.find((e) => e.id === 1)!.hp).toBe(1) // max(1, 1-5)
    s.enemies.find((e) => e.id === 1)!.shield = 3
    const shielded = s.enemies.find((e) => e.id === 1)!.hp
    s = step(s, []).state
    expect(s.enemies.find((e) => e.id === 1)!.hp).toBe(shielded) // bounced
  })

  it('the barrel vents during the build phase too', () => {
    let s = createRun(createMeta(), 'beam-lab')
    s.beamHeat = BEAM_HEAT_MAX
    s.beamOverheated = true
    while (s.beamHeat > 0) s = step(s, []).state
    expect(s.beamOverheated).toBe(false)
  })

  it('overheats at max, stays locked until fully vented, then fires again', () => {
    let s = waveState()
    s.enemies = [makeEnemy(s, { id: 1, pos: { ...AIM } })]
    s.beamTarget = { ...AIM }
    s.beamHeat = BEAM_HEAT_MAX - 1
    const r = step(s, [])
    s = r.state
    expect(s.beamOverheated).toBe(true)
    expect(r.events.some((e) => e.type === 'beam_overheated')).toBe(true)
    // Locked: still aimed, but only venting — no bites.
    const hp = s.enemies[0]!.hp
    s = step(s, []).state
    expect(s.enemies[0]!.hp).toBe(hp)
    expect(s.beamHeat).toBe(BEAM_HEAT_MAX - BEAM_COOL_PER_TICK)
    // A full vent unlocks.
    while (s.beamHeat > 0) s = step(s, []).state
    expect(s.beamOverheated).toBe(false)
    const hp2 = s.enemies[0]!.hp
    s = step(s, []).state
    expect(s.enemies[0]!.hp).toBe(hp2 - BEAM_DAMAGE_PER_TICK)
  })

  it('releasing the aim vents; targets clamp to the board', () => {
    let s = waveState()
    s.beamTarget = { ...AIM }
    s.beamHeat = 10
    s = step(s, [{ type: 'set_beam', target: null }]).state
    expect(s.beamTarget).toBeNull()
    expect(s.beamHeat).toBe(10 - BEAM_COOL_PER_TICK)
    s = step(s, [{ type: 'set_beam', target: { x: -5000, y: 99_999_999 } }]).state
    expect(s.beamTarget!.x).toBe(0)
    expect(s.beamTarget!.y).toBe(14 * 1000) // clamped to the board's south edge
  })

  it('beam kills collect like any other: bounty, combo, tallies', () => {
    let s = waveState()
    s.enemies = [makeEnemy(s, { id: 1, pos: { ...AIM }, hp: 1, maxHp: ENEMIES.runner.hp })]
    const gold = s.gold
    s = step(s, [{ type: 'set_beam', target: { ...AIM } }]).state
    expect(s.kills).toBe(1)
    expect(s.combo).toBe(1)
    expect(s.gold).toBe(gold + 1)
  })
})
