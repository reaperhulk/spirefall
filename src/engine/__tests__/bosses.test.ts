import { describe, expect, it } from 'vitest'
import { CARAPACE_BREAK_DAMAGE, ENEMIES, GALE_SPEED_PCT } from '../../data/content'
import { applyHit, bossMechanics, carrierBroods } from '../combat'
import { cellCenter } from '../grid'
import { createMeta, createRun } from '../meta'
import type { Enemy, GameEvent, RunState } from '../types'

// Boss signature mechanics: every 10th wave is an encounter with explicit
// counterplay, not a stat check. Exact arithmetic throughout.

function enemy(overrides: Partial<Enemy> & { id: number }): Enemy {
  return {
    type: 'runner',
    pos: cellCenter({ cx: 10, cy: 6 }),
    hp: 500,
    maxHp: 500,
    speed: 100,
    slowFactor: 100,
    slowTicks: 0,
    bounty: 3,
    damage: 2,
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
    targetCell: null,
    ...overrides,
  }
}

function waveState(enemies: Enemy[]): RunState {
  const s = createRun(createMeta(), 'boss-lab')
  s.phase = 'wave'
  s.wave = 10
  s.enemies = enemies
  return s
}

describe('Spirebreaker carapace', () => {
  it('caps hits at 1 while raised; a heavy blow shatters it and lands full', () => {
    const boss = enemy({ id: 1, type: 'boss', mechActiveTicks: 60 })
    // Chip: capped at 1 no matter the armor math.
    expect(applyHit(boss, CARAPACE_BREAK_DAMAGE - 1)).toBe(1)
    expect(boss.hp).toBe(499)
    expect(boss.mechActiveTicks).toBe(60) // still up
    // The breaker: shatters the shell AND lands in full (minus armor 0 here).
    expect(applyHit(boss, CARAPACE_BREAK_DAMAGE)).toBe(CARAPACE_BREAK_DAMAGE)
    expect(boss.mechActiveTicks).toBe(0) // shattered
    // With the shell down, everything lands normally again.
    expect(applyHit(boss, 10)).toBe(10)
  })

  it('raises on its period through bossMechanics and announces itself', () => {
    const boss = enemy({ id: 1, type: 'boss', mechCooldown: 2 })
    const s = waveState([boss])
    const events: GameEvent[] = []
    bossMechanics(s, events) // 2 -> 1
    bossMechanics(s, events) // 1 -> 0
    bossMechanics(s, events) // trigger
    expect(boss.mechActiveTicks).toBe(ENEMIES.boss.mech!.durationTicks)
    expect(boss.mechCooldown).toBe(ENEMIES.boss.mech!.everyTicks)
    expect(events.some((e) => e.type === 'boss_carapace')).toBe(true)
  })
})

describe('Stormcaller gale', () => {
  it('hastens every other enemy — but never overrides an active slow', () => {
    const boss = enemy({ id: 1, type: 'boss3', mechCooldown: 0 })
    const runner = enemy({ id: 2 })
    const chilled = enemy({ id: 3, slowTicks: 30, slowFactor: 60 })
    const s = waveState([boss, runner, chilled])
    const events: GameEvent[] = []
    bossMechanics(s, events)
    expect(runner.slowFactor).toBe(GALE_SPEED_PCT) // hastened
    expect(runner.slowTicks).toBe(ENEMIES.boss3.mech!.durationTicks)
    expect(chilled.slowFactor).toBe(60) // frost holds — the storm is cancelled
    expect(boss.slowFactor).toBe(100) // the caster never buffs itself
    const gale = events.find((e) => e.type === 'boss_gale')
    expect(gale).toBeDefined()
    expect((gale as { hastened: number }).hastened).toBe(1)
  })
})

describe('Gravemind broods', () => {
  it('births bounty-less splitlings while alive, on the carrier machinery', () => {
    const boss = enemy({ id: 1, type: 'boss2', broodCooldown: 0 })
    const s = waveState([boss])
    carrierBroods(s, [])
    const children = s.enemies.filter((e) => e.type === 'splitling')
    expect(children.length).toBe(ENEMIES.boss2.brood!.count)
    for (const c of children) expect(c.bounty).toBe(0) // stalling it is never profit
    expect(boss.broodCooldown).toBe(ENEMIES.boss2.brood!.everyTicks)
  })
})
