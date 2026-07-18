import { describe, expect, it } from 'vitest'
import { CARAPACE_BREAK_DAMAGE, ENEMIES, GALE_SPEED_PCT } from '../../data/content'
import { applyHit, bossMechanics, carrierBroods, enemyAuras, tickStatuses } from '../combat'
import { cellCenter } from '../grid'
import { createMeta, createRun } from '../meta'
import { deriveStream } from '../rng'
import type { Enemy, GameEvent, RunState } from '../types'
import { generateWave } from '../waves'

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
    brittleTicks: 0,
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

describe('endless-tier bosses (Veilwarden, Blightmother)', () => {
  it('the roster cycles into them at waves 40 and 50', () => {
    const rng = deriveStream('boss-roster', 'waves')
    expect(generateWave(rng, 40, 10_000).spawns.some((sp) => sp.type === 'boss4')).toBe(true)
    expect(generateWave(rng, 50, 12_000).spawns.some((sp) => sp.type === 'boss5')).toBe(true)
  })

  it('Veilwarden flickers on the wraith machinery', () => {
    const veil = enemy({ id: 1, type: 'boss4', phaseCooldown: 1 })
    const s = waveState([veil])
    tickStatuses(s)
    expect(veil.phased).toBe(true) // untargetable window opens
    expect(veil.phaseCooldown).toBe(ENEMIES.boss4.phasing!.hiddenTicks)
  })

  it('Blightmother mends the horde on the healer pulse, scaled by the hp curve', () => {
    const blight = enemy({ id: 1, type: 'boss5', healCooldown: 0, hp: 600, maxHp: 620 })
    const hurt = enemy({ id: 2, hp: 400, maxHp: 500 })
    const s = waveState([blight, hurt])
    enemyAuras(s, [])
    const expected = Math.max(1, Math.floor((ENEMIES.boss5.heal!.amount * s.hpScalePct) / 100))
    expect(hurt.hp).toBe(400 + expected)
    expect(blight.hp).toBe(600) // never heals itself
    expect(blight.healCooldown).toBe(ENEMIES.boss5.heal!.everyTicks)
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
