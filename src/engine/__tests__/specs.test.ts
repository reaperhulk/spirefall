import { describe, expect, it } from 'vitest'
import {
  BREAKER_DAMAGE_PCT,
  CAPACITOR_DAMAGE_PCT,
  CAPACITOR_EVERY_SHOTS,
  EXECUTOR_THRESHOLD_PCT,
  LANCE_MAX_STACKS,
  LANCE_RAMP_PCT,
  LATTICE_EXTRA_CHAIN,
  LONGBOW_RANGE_PCT,
  LONGSIGHT_RANGE_PCT,
  MOMENTUM_RAMP_PCT,
  MORTAR_COOLDOWN_PCT,
  MORTAR_DAMAGE_PCT,
  OVERCHARGE_DAMAGE_PCT,
  PERMAFROST_BONUS_PCT,
  TOWER_SPECS,
  towerTier,
  VOLLEY_PCT,
} from '../../data/content'
import { MESA_RANGE_PCT } from '../../data/biomes'
import { ACHIEVEMENTS } from '../../data/achievements'
import { applyHit, damageBreakdown, effectiveTowerCooldown, effectiveTowerRange, tickStatuses, towerRangeOnBoard, towersFire } from '../combat'
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

describe('towerRangeOnBoard: the ring is the engine', () => {
  it('folds spec, Longsight, and mesa into one radius', () => {
    const s = battle([tower('sniper', null)], [])
    const map = getRunMap(s)
    const raw = towerTier('sniper', 3).range
    expect(towerRangeOnBoard(s, map, s.towers[0]!)).toBe(raw)
    // Longbow spec stretches it…
    s.towers[0]!.spec = 'longbow'
    const bowed = Math.floor((raw * LONGBOW_RANGE_PCT) / 100)
    expect(towerRangeOnBoard(s, map, s.towers[0]!)).toBe(bowed)
    // …Longsight multiplies on top…
    s.relics.push('longsight')
    const sighted = Math.floor((bowed * LONGSIGHT_RANGE_PCT) / 100)
    expect(towerRangeOnBoard(s, map, s.towers[0]!)).toBe(sighted)
    // …and a mesa underfoot multiplies again — the exact towersFire math.
    const mesa: boolean[] = Array(map.width * map.height).fill(false)
    mesa[s.towers[0]!.cell.cy * map.width + s.towers[0]!.cell.cx] = true
    expect(towerRangeOnBoard(s, { ...map, mesa }, s.towers[0]!)).toBe(Math.floor((sighted * MESA_RANGE_PCT) / 100))
  })
})

describe('overcharge: the attention verb', () => {
  it('arms via command, doubles exactly one shot, then recharges', () => {
    // Arm while the rifle is between shots, so the charge visibly holds.
    let s = battle([tower('sniper', null, { id: 1, cooldown: 5 })], [enemy({ id: 1, hp: 100_000, maxHp: 100_000 })])
    s.pendingSpawns = [{ type: 'runner', tick: 1_000_000 }]
    s = step(s, [{ type: 'overcharge_tower', id: 1 }]).state
    expect(s.towers[0]!.overcharged).toBe(true)
    // The armed shot lands at double weight (sniper t3 = 260 base)…
    const before = s.enemies[0]!.hp
    s.towers[0]!.cooldown = 0
    s = step(s, []).state
    expect(before - s.enemies[0]!.hp).toBe(Math.floor((260 * OVERCHARGE_DAMAGE_PCT) / 100))
    // …the charge is spent, and the personal recharge begins.
    expect(s.towers[0]!.overcharged).toBe(false)
    expect(s.towers[0]!.overchargeCd).toBeGreaterThan(0)
    const r = step(s, [{ type: 'overcharge_tower', id: 1 }])
    expect(r.events.some((e) => e.type === 'command_rejected')).toBe(true)
    // The next un-charged shot is back to base weight.
    s.towers[0]!.cooldown = 0
    const hpBefore = s.enemies[0]!.hp
    s = step(s, []).state
    expect(hpBefore - s.enemies[0]!.hp).toBe(260)
  })

  it('support towers cannot overcharge; the recharge ticks only in waves', () => {
    let s = battle([tower('mint', null, { id: 1 }), tower('sniper', null, { id: 2, overchargeCd: 10 })], [])
    s.pendingSpawns = [{ type: 'runner', tick: 1_000_000 }]
    const r = step(s, [{ type: 'overcharge_tower', id: 1 }])
    expect(r.events.some((e) => e.type === 'command_rejected')).toBe(true)
    s = step(s, []).state
    expect(s.towers[1]!.overchargeCd).toBe(9)
    s.phase = 'build'
    s = step(s, []).state
    expect(s.towers[1]!.overchargeCd).toBe(9) // build time is not wave time
  })
})

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

describe('the Lance: ramp on a held target', () => {
  const volley = (s: RunState, shots: number) => {
    for (let i = 0; i < shots; i++) {
      s.towers[0]!.cooldown = 0
      fire(s)
    }
  }

  it('consecutive hits climb the additive stack and cap at LANCE_MAX_STACKS', () => {
    const mark = enemy({ id: 1, hp: 100_000, maxHp: 100_000 })
    const s = battle([tower('lance', null)], [mark])
    volley(s, 1)
    expect(mark.hp).toBe(100_000 - 30) // stack 0: base tier-3 damage
    volley(s, 1)
    expect(mark.hp).toBe(100_000 - 30 - Math.floor((30 * (100 + LANCE_RAMP_PCT)) / 100)) // stack 1
    volley(s, LANCE_MAX_STACKS + 5)
    // Deep into the climb the ramp is pinned at the cap.
    const capped = Math.floor((30 * (100 + LANCE_RAMP_PCT * LANCE_MAX_STACKS)) / 100)
    const before = s.enemies[0]!.hp
    volley(s, 1)
    expect(before - s.enemies[0]!.hp).toBe(capped)
    expect(s.towers[0]!.rampStacks).toBe(LANCE_MAX_STACKS)
    // The run remembers the deepest climb (Unwavering) — and keeps it even
    // after the tower's own stacks reset.
    expect(s.maxRampStacks).toBe(LANCE_MAX_STACKS)
    expect(ACHIEVEMENTS.find((a) => a.id === 'unwavering')!.earned(s, createMeta())).toBe(true)
  })

  it('topping out fires ramp_capped once per climb, not once per capped shot', () => {
    const mark = enemy({ id: 1, hp: 500_000, maxHp: 500_000 })
    const s = battle([tower('lance', null)], [mark])
    let caps = 0
    for (let i = 0; i < LANCE_MAX_STACKS + 4; i++) {
      s.towers[0]!.cooldown = 0
      caps += fire(s).filter((e) => e.type === 'ramp_capped').length
    }
    expect(s.towers[0]!.rampStacks).toBe(LANCE_MAX_STACKS)
    expect(caps).toBe(1)
    // A fresh climb on a new mark can cap — and announce — again.
    s.towers[0]!.rampTarget = 999
    let recaps = 0
    for (let i = 0; i < LANCE_MAX_STACKS + 2; i++) {
      s.towers[0]!.cooldown = 0
      recaps += fire(s).filter((e) => e.type === 'ramp_capped').length
    }
    expect(recaps).toBe(1)
  })

  it('the deepest climb survives a reset — the tally is run-lifetime', () => {
    const a = enemy({ id: 1, hp: 200_000, maxHp: 200_000 })
    const b = enemy({ id: 2, hp: 100_000, maxHp: 100_000, pos: cellCenter({ cx: 6, cy: 6 }) })
    const s = battle([tower('lance', null, { targeting: 'strongest' })], [a, b])
    volley(s, 5)
    expect(s.maxRampStacks).toBe(4)
    a.hp = 0
    s.towers[0]!.cooldown = 0
    fire(s)
    expect(s.towers[0]!.rampStacks).toBe(0)
    expect(s.maxRampStacks).toBe(4)
    expect(ACHIEVEMENTS.find((a2) => a2.id === 'unwavering')!.earned(s, createMeta())).toBe(false)
  })

  it('switching targets resets the climb to zero', () => {
    // The mark must stay decisively strongest or 'strongest' targeting
    // itself would bounce between equals and never hold a ramp.
    const a = enemy({ id: 1, hp: 200_000, maxHp: 200_000 })
    const b = enemy({ id: 2, hp: 100_000, maxHp: 100_000, pos: cellCenter({ cx: 6, cy: 6 }) })
    const s = battle([tower('lance', null, { targeting: 'strongest' })], [a, b])
    volley(s, 4)
    expect(s.towers[0]!.rampStacks).toBe(3)
    // The held mark dies; the lance re-aims and starts over.
    a.hp = 0
    s.towers[0]!.cooldown = 0
    fire(s)
    expect(s.towers[0]!.rampTarget).toBe(2)
    expect(s.towers[0]!.rampStacks).toBe(0)
    expect(b.hp).toBe(100_000 - 30) // base damage again
  })

  it('Momentum ramps steeper; Skewer pierces shields outright', () => {
    const mark = enemy({ id: 1, hp: 100_000, maxHp: 100_000 })
    const m = battle([tower('lance', 'momentum')], [mark])
    volley(m, 2)
    expect(mark.hp).toBe(100_000 - 30 - Math.floor((30 * (100 + MOMENTUM_RAMP_PCT)) / 100))

    const walled = enemy({ id: 1, hp: 1000, maxHp: 1000, shield: 100 })
    const plain = battle([tower('lance', null)], [walled])
    volley(plain, 1)
    expect(walled.hp).toBe(1000) // shot ≤ shield: fully blocked
    const pierced = enemy({ id: 1, hp: 1000, maxHp: 1000, shield: 100 })
    const skewer = battle([tower('lance', 'skewer')], [pierced])
    volley(skewer, 1)
    expect(pierced.hp).toBe(1000 - 30) // Skewer ignores the wall
  })

  it("a placed lance defaults to Strongest targeting — 'first' would bounce the ramp", () => {
    const s = createRun(createMeta(), 'lance-default')
    s.gold = 1000
    s.availableTowers.push('lance')
    const cell = { cx: 3, cy: 3 }
    const placedLance = step(s, [{ type: 'place_tower', tower: 'lance', cell }]).state
    expect(placedLance.towers[0]!.targeting).toBe('strongest')
    const placedArrow = step(s, [{ type: 'place_tower', tower: 'arrow', cell }]).state
    expect(placedArrow.towers[0]!.targeting).toBe('first')
  })

  it("Duelist's Oath keeps half the ramp across a switch", () => {
    const a = enemy({ id: 1, hp: 200_000, maxHp: 200_000 })
    const b = enemy({ id: 2, hp: 100_000, maxHp: 100_000, pos: cellCenter({ cx: 6, cy: 6 }) })
    const s = battle([tower('lance', null, { targeting: 'strongest' })], [a, b])
    s.relics.push('duelists_oath')
    volley(s, 7)
    expect(s.towers[0]!.rampStacks).toBe(6)
    a.hp = 0
    s.towers[0]!.cooldown = 0
    fire(s)
    // The climb resumes from half, not from nothing.
    expect(s.towers[0]!.rampTarget).toBe(2)
    expect(s.towers[0]!.rampStacks).toBe(3)
    expect(b.hp).toBe(100_000 - Math.floor((30 * (100 + LANCE_RAMP_PCT * 3)) / 100))
  })

  it('the panel reads exactly what the next shot deals, and the unlock gates the shop', () => {
    const mark = enemy({ id: 1, hp: 100_000, maxHp: 100_000 })
    const s = battle([tower('lance', null, { rampTarget: 1, rampStacks: 4 })], [mark])
    // Bookkeeping increments to 5 before the shot — the panel shown between
    // shots (stacks 4 → next shot at 5)... the breakdown reports the LIVE
    // stack count; fire, then compare the post-shot panel to the shot dealt.
    s.towers[0]!.cooldown = 0
    fire(s)
    const dealt = 100_000 - mark.hp
    const b = damageBreakdown(s, s.towers[0]!)
    expect(b.effective).toBe(dealt)
    expect(b.parts.some((p) => p.source.startsWith('Ramp'))).toBe(true)

    // Duelist Doctrine gates availability.
    expect(createRun(createMeta(), 'lance-locked').availableTowers).not.toContain('lance')
    const meta = { ...createMeta(), upgrades: { unlock_lance: 1 } }
    expect(createRun(meta, 'lance-open').availableTowers).toContain('lance')
  })
})
