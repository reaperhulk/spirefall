import { describe, expect, it } from 'vitest'
import {
  CINDER_BURN_TICKS,
  DEADEYE_EXECUTE_PCT,
  GOLDEN_LEDGER_PCT,
  RICOCHET_PCT,
  SHATTERHEART_PCT,
  STORM_COILS_PCT_PER_STACK,
} from '../../data/content'
import { collectDead, tickStatuses, towerCritChancePct, towersFire } from '../combat'
import { blockedGrid, cellCenter, distanceField, getMap } from '../grid'
import { createMeta, createRun } from '../meta'
import { step } from '../step'
import type { Enemy, GameEvent, RelicId, RunState, Tower, TowerType } from '../types'

// The transformative relic tier: each changes HOW a tower plays. These tests
// drive towersFire/collectDead/tickStatuses directly with hand-placed
// combatants so every mechanic is pinned by exact arithmetic.

function enemy(overrides: Partial<Enemy> & { id: number }): Enemy {
  return {
    type: 'runner',
    pos: cellCenter({ cx: 5, cy: 6 }),
    hp: 50,
    maxHp: 50,
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

function tower(type: TowerType, overrides: Partial<Tower> = {}): Tower {
  return {
    id: 100,
    type,
    tier: 1,
    spec: null,
    enhance: 0,
    cell: { cx: 5, cy: 5 },
    cooldown: 0,
    targeting: 'nearest',
    kills: 0,
    damageDealt: 0,
    shots: 0,
    ...overrides,
  }
}

function battle(relics: RelicId[], towers: Tower[], enemies: Enemy[]): RunState {
  const s = createRun(createMeta(), 'relic-lab')
  s.phase = 'wave'
  s.wave = 3
  s.relics = relics
  s.towers = towers
  s.enemies = enemies
  return s
}

function fire(s: RunState): GameEvent[] {
  const map = getMap(s.mapId)
  const field = distanceField(map, blockedGrid(map, s.towers))
  const events: GameEvent[] = []
  towersFire(s, map, field, events)
  return events
}

describe('transformative relics', () => {
  it('Ricochet Strings: the arrow bounces to the nearest other enemy at half weight', () => {
    const a = enemy({ id: 1, hp: 50 })
    const b = enemy({ id: 2, hp: 50, pos: { x: a.pos.x + 800, y: a.pos.y } }) // in ricochet reach
    const c = enemy({ id: 3, hp: 50, pos: { x: a.pos.x + 3000, y: a.pos.y } }) // out of reach
    const s = battle(['ricochet_strings'], [tower('arrow')], [a, b, c])
    const dmg = 7 // arrow tier 1
    fire(s)
    expect(a.hp).toBe(50 - dmg)
    expect(b.hp).toBe(50 - Math.floor((dmg * RICOCHET_PCT) / 100))
    expect(c.hp).toBe(50) // beyond the bounce
    // Without the relic, only the primary target is hit.
    const a2 = enemy({ id: 1, hp: 50 })
    const b2 = enemy({ id: 2, hp: 50, pos: { x: a2.pos.x + 800, y: a2.pos.y } })
    const s2 = battle([], [tower('arrow')], [a2, b2])
    fire(s2)
    expect(b2.hp).toBe(50)
  })

  it('Cinder Shells: cannon hits ignite — the burn ticks through armor and can kill', () => {
    const e = enemy({ id: 1, hp: 100, maxHp: 100, armor: 5 })
    const s = battle(['cinder_shells'], [tower('cannon')], [e])
    fire(s)
    const dealt = 22 - 5 // cannon tier 1 through armor
    expect(e.hp).toBe(100 - dealt)
    expect(e.burnTicks).toBe(CINDER_BURN_TICKS)
    expect(e.burnPerTick).toBeGreaterThanOrEqual(1)
    // The burn ignores armor: exactly burnPerTick per tick, min 1.
    const before = e.hp
    const perTick = e.burnPerTick // captured — it resets when the burn ends
    tickStatuses(s)
    expect(e.hp).toBe(before - perTick)
    // Run the burn out: total burn = perTick × CINDER_BURN_TICKS.
    for (let i = 1; i < CINDER_BURN_TICKS; i++) tickStatuses(s)
    expect(e.hp).toBe(before - perTick * CINDER_BURN_TICKS)
    expect(e.burnTicks).toBe(0)
    expect(e.burnPerTick).toBe(0)
  })

  it('Shatterheart: a slowed death detonates for a share of max HP nearby', () => {
    const dead = enemy({ id: 1, hp: 0, maxHp: 60, slowTicks: 4, slowFactor: 60 })
    const near = enemy({ id: 2, hp: 50, pos: { x: dead.pos.x + 900, y: dead.pos.y } })
    const far = enemy({ id: 3, hp: 50, pos: { x: dead.pos.x + 3000, y: dead.pos.y } })
    const s = battle(['shatterheart'], [], [dead, near, far])
    const events: GameEvent[] = []
    collectDead(s, events)
    const burst = Math.floor((60 * SHATTERHEART_PCT) / 100)
    expect(near.hp).toBe(50 - burst)
    expect(far.hp).toBe(50)
    expect(s.damageByTower.frost).toBe(burst)
    // An unslowed death does not detonate.
    const dead2 = enemy({ id: 1, hp: 0, maxHp: 60 })
    const near2 = enemy({ id: 2, hp: 50, pos: { x: dead2.pos.x + 900, y: dead2.pos.y } })
    const s2 = battle(['shatterheart'], [], [dead2, near2])
    collectDead(s2, [])
    expect(near2.hp).toBe(50)
  })

  it('Storm Coils: repeat tesla hits ramp damage on that enemy, capped', () => {
    const e = enemy({ id: 1, hp: 1000, maxHp: 1000 })
    const s = battle(['storm_coils'], [tower('tesla')], [e])
    const dmg = 11 // tesla tier 1
    fire(s)
    expect(e.hp).toBe(1000 - dmg) // first hit: no stacks yet
    expect(e.overcharge).toBe(1)
    s.towers[0]!.cooldown = 0
    fire(s)
    expect(e.hp).toBe(1000 - dmg - Math.floor((dmg * (100 + STORM_COILS_PCT_PER_STACK)) / 100))
    expect(e.overcharge).toBe(2)
  })

  it('Deadeye Sigil: snipers execute wounded regulars — never bosses', () => {
    // Brutes and bosses are both elites: the sniper hit lands 60 × 1.5 = 90.
    // 100 hp − 90 = 10 left of 1000 max — under the 15% execute threshold.
    const brute = enemy({ id: 1, type: 'brute', hp: 100, maxHp: 1000 })
    const s = battle(['deadeye_sigil'], [tower('sniper')], [brute])
    fire(s)
    expect(brute.hp).toBe(0) // executed, not merely wounded
    expect(s.towers[0]!.kills).toBe(1)
    expect(s.towers[0]!.damageDealt).toBe(100) // 90 hit + 10 execute, all attributed

    const boss = enemy({ id: 1, type: 'boss', hp: 100, maxHp: 1000 })
    const s2 = battle(['deadeye_sigil'], [tower('sniper')], [boss])
    fire(s2)
    expect(boss.hp).toBe(10) // same threshold, but bosses shrug executes off
    expect(10 * 100).toBeLessThanOrEqual(1000 * DEADEYE_EXECUTE_PCT) // sanity: it WAS under threshold
  })

  it('Golden Ledger: wave clear pays interest on banked gold, capped', () => {
    const s = battle(['golden_ledger'], [], [])
    s.gold = 400
    const { state: after, events } = step(s, [])
    const interest = events.find((e) => e.type === 'gold_interest')
    expect(interest).toBeDefined()
    // Interest lands on the post-clear-bonus balance, 10%, ≤ the cap.
    const clearBonus = (events.find((e) => e.type === 'wave_cleared') as { goldAwarded: number }).goldAwarded
    const expected = Math.min(60, Math.floor(((400 + clearBonus) * GOLDEN_LEDGER_PCT) / 100))
    expect((interest as { amount: number }).amount).toBe(expected)
    expect(after.gold).toBe(400 + clearBonus + expected)
    // A fortune hits the cap.
    const rich = battle(['golden_ledger'], [], [])
    rich.gold = 5000
    const richEvents = step(rich, []).events
    expect((richEvents.find((e) => e.type === 'gold_interest') as { amount: number }).amount).toBe(60)
  })

  it('Prism Lens: beacon auras grant crit chance to towers standing in them', () => {
    const s = battle(['prism_lens'], [tower('arrow'), tower('beacon', { id: 101, cell: { cx: 5, cy: 6 } })], [])
    expect(towerCritChancePct(s, s.towers[0]!)).toBe(10)
    // Out of aura range: nothing.
    const s2 = battle(['prism_lens'], [tower('arrow'), tower('beacon', { id: 101, cell: { cx: 15, cy: 6 } })], [])
    expect(towerCritChancePct(s2, s2.towers[0]!)).toBe(0)
    // No lens: aura is damage-only.
    const s3 = battle([], [tower('arrow'), tower('beacon', { id: 101, cell: { cx: 5, cy: 6 } })], [])
    expect(towerCritChancePct(s3, s3.towers[0]!)).toBe(0)
  })
})
