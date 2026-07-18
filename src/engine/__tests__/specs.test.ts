import { describe, expect, it } from 'vitest'
import {
  BREAKER_DAMAGE_PCT,
  CAPACITOR_DAMAGE_PCT,
  CAPACITOR_EVERY_SHOTS,
  EXECUTOR_THRESHOLD_PCT,
  LATTICE_EXTRA_CHAIN,
  MORTAR_COOLDOWN_PCT,
  MORTAR_DAMAGE_PCT,
  PERMAFROST_BONUS_PCT,
  TOWER_SPECS,
  VOLLEY_PCT,
} from '../../data/content'
import { applyHit, damageBreakdown, effectiveTowerCooldown, effectiveTowerRange, tickStatuses, towersFire } from '../combat'
import { blockedGrid, cellCenter, distanceField } from '../grid'
import { getRunMap } from '../mapgen'
import { createMeta, createRun } from '../meta'
import { step } from '../step'
import type { TowerSpecId } from '../../data/content'
import type { Enemy, GameEvent, RunState, Tower, TowerType } from '../types'

// Tier-3 specializations: ten path commitments, each pinned by exact
// arithmetic. The battle helpers mirror the relics suite.

function enemy(overrides: Partial<Enemy> & { id: number }): Enemy {
  return {
    type: 'runner',
    pos: cellCenter({ cx: 5, cy: 6 }),
    hp: 1000,
    maxHp: 1000,
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

function tower(type: TowerType, spec: TowerSpecId | null, overrides: Partial<Tower> = {}): Tower {
  return {
    id: 100,
    type,
    tier: 3,
    spec,
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

function battle(towers: Tower[], enemies: Enemy[]): RunState {
  const s = createRun(createMeta(), 'spec-lab')
  s.phase = 'wave'
  s.wave = 5
  s.towers = towers
  s.enemies = enemies
  return s
}

function fire(s: RunState): GameEvent[] {
  const map = getRunMap(s)
  const events: GameEvent[] = []
  towersFire(s, map, distanceField(map, blockedGrid(map, s.towers)), events)
  return events
}

describe('specialize_tower command', () => {
  it('validates tier, ownership, uniqueness, and gold', () => {
    const s = createRun(createMeta(), 'spec-cmd')
    s.gold = 1000
    s.towers = [tower('arrow', null, { id: 1, tier: 1 }), tower('cannon', null, { id: 2 })]
    // Tier gate.
    let r = step(s, [{ type: 'specialize_tower', id: 1, spec: 'volley' }])
    expect(r.events.some((e) => e.type === 'command_rejected')).toBe(true)
    // Wrong tower's spec.
    r = step(s, [{ type: 'specialize_tower', id: 2, spec: 'volley' }])
    expect(r.events.some((e) => e.type === 'command_rejected')).toBe(true)
    // A legal pick: gold drains, spec sticks, event fires.
    r = step(s, [{ type: 'specialize_tower', id: 2, spec: 'mortar' }])
    const specced = r.state.towers.find((t) => t.id === 2)!
    expect(specced.spec).toBe('mortar')
    expect(r.state.gold).toBe(1000 - TOWER_SPECS.cannon![0].cost)
    expect(r.events.some((e) => e.type === 'tower_specialized')).toBe(true)
    // No double-dipping.
    const again = step(r.state, [{ type: 'specialize_tower', id: 2, spec: 'breaker' }])
    expect(again.events.some((e) => e.type === 'command_rejected')).toBe(true)
  })
})

describe('panel truthfulness', () => {
  it('damageBreakdown mirrors the exact shot math for specced towers', () => {
    const s = battle([], [])
    const mortar = tower('cannon', 'mortar')
    const b = damageBreakdown(s, mortar)
    expect(b.specPct).toBe(MORTAR_DAMAGE_PCT)
    expect(b.effective).toBe(Math.floor((Math.floor((95 * b.totalPct) / 100) * MORTAR_DAMAGE_PCT) / 100))
    // And the mirrored number is what the shot actually lands.
    const victim = enemy({ id: 1 })
    const live = battle([tower('cannon', 'breaker')], [victim])
    const bb = damageBreakdown(live, live.towers[0]!)
    fire(live)
    expect(victim.hp).toBe(1000 - bb.effective)
  })
})

describe('the ten paths', () => {
  it('Volley: extra targets at reduced weight; Longbow: range and shield-piercing', () => {
    const a = enemy({ id: 1 })
    const b = enemy({ id: 2, pos: { x: a.pos.x + 700, y: a.pos.y } })
    const c = enemy({ id: 3, pos: { x: a.pos.x + 900, y: a.pos.y } })
    const s = battle([tower('arrow', 'volley')], [a, b, c])
    fire(s)
    const dmg = 32 // arrow tier 3
    expect(a.hp).toBe(1000 - dmg)
    expect(b.hp).toBe(1000 - Math.floor((dmg * VOLLEY_PCT) / 100))
    expect(c.hp).toBe(1000 - Math.floor((dmg * VOLLEY_PCT) / 100))

    const s2 = battle([], [])
    expect(effectiveTowerRange(s2, 'arrow', 3, 'longbow')).toBe(Math.floor((3600 * 130) / 100))
    const shielded = enemy({ id: 1, shield: 50 })
    const s3 = battle([tower('arrow', 'longbow')], [shielded])
    fire(s3)
    expect(shielded.hp).toBe(1000 - 32) // 32 <= shield 50, but longbow pierces
  })

  it('Mortar trades speed for weight; Breaker trades splash for a single crushing hit', () => {
    const s = battle([], [])
    expect(effectiveTowerCooldown(s, 'cannon', 3, 'mortar')).toBe(Math.floor((36 * MORTAR_COOLDOWN_PCT) / 100))
    const a = enemy({ id: 1 })
    const near = enemy({ id: 2, pos: { x: a.pos.x + 600, y: a.pos.y } })
    const m = battle([tower('cannon', 'mortar')], [a, near])
    fire(m)
    const mortarHit = Math.floor((95 * MORTAR_DAMAGE_PCT) / 100)
    expect(a.hp).toBe(1000 - mortarHit)
    expect(near.hp).toBe(1000 - mortarHit) // splash carries the same weight

    const a2 = enemy({ id: 1 })
    const near2 = enemy({ id: 2, pos: { x: a2.pos.x + 600, y: a2.pos.y } })
    const brk = battle([tower('cannon', 'breaker')], [a2, near2])
    fire(brk)
    expect(a2.hp).toBe(1000 - Math.floor((95 * BREAKER_DAMAGE_PCT) / 100))
    expect(near2.hp).toBe(1000) // no splash at all
  })

  it('Blizzard slows the crowd; Permafrost makes its victims brittle', () => {
    const a = enemy({ id: 1 })
    const near = enemy({ id: 2, pos: { x: a.pos.x + 800, y: a.pos.y } })
    const far = enemy({ id: 3, pos: { x: a.pos.x + 2000, y: a.pos.y } })
    const s = battle([tower('frost', 'blizzard')], [a, near, far])
    fire(s)
    expect(a.slowTicks).toBeGreaterThan(0)
    expect(near.slowTicks).toBeGreaterThan(0) // the blizzard reached it
    expect(far.slowTicks).toBe(0)

    const v = enemy({ id: 1 })
    const p = battle([tower('frost', 'permafrost')], [v])
    fire(p)
    expect(v.brittleTicks).toBeGreaterThan(0)
    // Brittle amplifies EVERY source: a 100 hit lands at 125.
    const hp = v.hp
    expect(applyHit(v, 100)).toBe(Math.floor((100 * (100 + PERMAFROST_BONUS_PCT)) / 100))
    expect(v.hp).toBe(hp - 125)
    // And it decays.
    const ticks = v.brittleTicks
    tickStatuses(p)
    expect(v.brittleTicks).toBe(ticks - 1)
  })

  it('Arc Lattice chains further; Capacitor discharges every 4th shot', () => {
    const line = Array.from({ length: 12 }, (_, i) =>
      enemy({ id: i + 1, pos: { x: cellCenter({ cx: 5, cy: 6 }).x + i * 900, y: cellCenter({ cx: 5, cy: 6 }).y } }),
    )
    const s = battle([tower('tesla', 'lattice')], line)
    const ev = fire(s)
    const fired = ev.find((e) => e.type === 'tower_fired') as { targets: number[] }
    expect(fired.targets.length).toBe(6 + LATTICE_EXTRA_CHAIN) // tier-3 chain 6, +3

    const t = tower('tesla', 'capacitor', { shots: CAPACITOR_EVERY_SHOTS - 1 }) // next shot is the 4th
    const victim = enemy({ id: 1 })
    const c = battle([t], [victim])
    fire(c)
    expect(victim.hp).toBe(1000 - Math.floor((34 * CAPACITOR_DAMAGE_PCT) / 100))
  })

  it('Executor finishes the wounded; Overpenetration carries through', () => {
    // 1000 max, sniper t3 hits 260: leave the target just above the line.
    const v = enemy({ id: 1, hp: 260 + Math.floor((1000 * EXECUTOR_THRESHOLD_PCT) / 100) })
    const s = battle([tower('sniper', 'executor')], [v])
    fire(s)
    expect(v.hp).toBe(0) // wounded under 10% -> executed

    const a = enemy({ id: 1 })
    const behind = enemy({ id: 2, pos: { x: a.pos.x + 1000, y: a.pos.y } })
    const o = battle([tower('sniper', 'overpen')], [a, behind])
    fire(o)
    expect(a.hp).toBe(1000 - 260)
    expect(behind.hp).toBe(1000 - 260) // full weight, carried through
  })
})
