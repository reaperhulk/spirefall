import { expect, it } from 'vitest'
import { COIN_LIFETIME_TICKS, towerTier } from '../../data/content'
import { BIOME_IDS, biomeUnlocked } from '../../data/biomes'
import { bankGuardianMilestones, specializationCost, stormNetwork } from '../campaign'
import { collectDead, tickCoins, towersFire } from '../combat'
import { blockedGrid, cellCenter, cellIndex, distanceField, getMap } from '../grid'
import { tacticalMap } from '../mapgen'
import { ascend, createMeta, createRun } from '../meta'
import { previewNextWave, step } from '../step'
import type { Enemy, GameEvent, RunState, Tower, TowerType } from '../types'
import { parseRecording, validRun } from '../../ui/validation'

function enemy(id = 10, overrides: Partial<Enemy> = {}): Enemy {
  return { id, type: 'runner', pos: cellCenter({ cx: 5, cy: 6 }), hp: 10000, maxHp: 10000,
    speed: 0, slowFactor: 100, slowTicks: 0, bounty: 1, damage: 2, shield: 0, armor: 0,
    healCooldown: 0, broodCooldown: 0, phased: false, phaseCooldown: 0, burnTicks: 0,
    burnPerTick: 0, overcharge: 0, mechCooldown: 0, mechActiveTicks: 0, brittleTicks: 0, targetCell: null, ...overrides }
}
function tower(type: TowerType, id = 1, x = 5): Tower {
  return { id, type, tier: 2, spec: null, enhance: 0, cell: { cx: x, cy: 5 },
    cooldown: 0, targeting: 'nearest', kills: 0, damageDealt: 0, shots: 0 }
}
function lab(): RunState {
  const s = createRun(createMeta(), 'second-review')
  s.mapSeed = ''; s.mapId = 0; s.wave = 2; s.wavesCleared = 2
  s.gold = 1000; s.nextEntityId = 100
  return s
}
function fire(s: RunState): GameEvent[] {
  const map = getMap(0), events: GameEvent[] = []
  towersFire(s, map, distanceField(map, blockedGrid(map, s.towers)), events)
  return events
}
it('automatically banks 95% of bounty with exact fractional conservation and optional pickups', () => {
  const s = lab(), before = s.gold
  for (let i = 0; i < 20; i++) { s.enemies = [enemy(10 + i, { hp: 0 })]; collectDead(s, []) }
  expect(s.gold - before).toBe(19)
  expect(s.coins.reduce((n, c) => n + c.gold, 0)).toBe(1)
  expect(s.bountyRemainder).toBe(0)
  const picked = JSON.parse(JSON.stringify(s)) as RunState
  picked.collectAt = cellCenter({ cx: 5, cy: 6 }); tickCoins(picked, getMap(0), [])
  expect(picked.gold - before).toBe(20)
  s.phase = 'wave'; s.tick = COIN_LIFETIME_TICKS; tickCoins(s, getMap(0), [])
  expect(s.coins).toHaveLength(0); expect(s.gold - before).toBe(19)
})
it('legacy runs retain full physical bounties and replay rules 3 and 4 remain importable', () => {
  const s = lab(); delete s.rulesVersion
  const before = s.gold; s.enemies = [enemy(10, { hp: 0, bounty: 20 })]; collectDead(s, [])
  expect(s.gold).toBe(before); expect(s.coins[0]!.gold).toBe(20)
  for (const rules of [3, 4]) expect(parseRecording(JSON.stringify({ v: 3, rules, initial: s, log: [], endTick: s.tick }))).not.toBeNull()
})
it('opening commission specializes tier two once and is not restored by selling', () => {
  let s = lab(); s.towers = [tower('arrow')]
  expect(specializationCost(s, s.towers[0]!, 'longbow')).toBe(20)
  s = step(s, [{ type: 'specialize_tower', id: 1, spec: 'longbow' }]).state
  expect(s.gold).toBe(980); expect(s.towers[0]!.spec).toBe('longbow'); expect(validRun(s)).toBe(true)
  expect(step(s, [{ type: 'specialize_tower', id: 1, spec: 'volley' }]).events[0]!.type).toBe('command_rejected')
  s = step(s, [{ type: 'sell_tower', id: 1 }]).state
  expect(s.commissionUsed).toBe(true)
  expect(specializationCost(s, tower('arrow'), 'longbow')).toBeGreaterThan(20)
})
it('Shatter stores Frost crystals, consumes them on heavy damage, and cannot consume blocked hits', () => {
  const s = lab(); s.doctrine = 'shatter'; s.enemies = [enemy()]; s.towers = [tower('frost')]
  fire(s); expect(s.enemies[0]!.frostStacks).toBe(1)
  s.towers = [tower('cannon')]; const before = s.enemies[0]!.hp
  expect(fire(s).some(e => e.type === 'doctrine_trigger')).toBe(true)
  expect(before - s.enemies[0]!.hp).toBe(Math.floor(towerTier('cannon', 2).damage * 120 / 100))
  expect(s.enemies[0]!.frostStacks).toBe(0)
  s.enemies[0]!.frostStacks = 3; s.enemies[0]!.shield = 9999; s.towers[0]!.cooldown = 0
  fire(s); expect(s.enemies[0]!.frostStacks).toBe(3); expect(s.towers[0]!.waveBlocked).toBe(1)
})
it('Storm charges connected networks and isolated Teslas cannot borrow their discharge', () => {
  const s = lab(); s.doctrine = 'storm'; s.enemies = [enemy()]
  const a = tower('tesla'), b = tower('tesla', 2, 8), isolated = tower('tesla', 3, 20)
  b.cooldown = 100; s.towers = [a, b, isolated]; a.stormCharge = 5
  expect(stormNetwork(s, a).map(t => t.id)).toEqual([1, 2])
  expect(stormNetwork(s, isolated)).toHaveLength(1)
  expect(fire(s).some(e => e.type === 'doctrine_trigger' && e.doctrine === 'storm')).toBe(true)
  expect(a.stormCharge).toBe(0)
})
it('Siege rewards held aim and resets when the marked enemy changes', () => {
  const s = lab(); s.doctrine = 'siege'; s.enemies = [enemy()]; s.towers = [tower('sniper')]
  const t = s.towers[0]!; t.siegeTarget = 10; t.siegeAim = 44
  expect(fire(s).some(e => e.type === 'doctrine_trigger' && e.doctrine === 'siege')).toBe(true)
  expect(t.siegeAim).toBe(0)
  t.cooldown = 0; t.siegeAim = 45; s.enemies = [enemy(11)]
  expect(fire(s).some(e => e.type === 'doctrine_trigger')).toBe(false); expect(t.siegeAim).toBe(0)
})
it('War Economy supply is capped per wave and requisition consumes it exactly once', () => {
  let s = lab(); s.doctrine = 'war_economy'; s.supply = 2; s.towers = [tower('mint'), tower('mint', 2, 7), tower('arrow', 3, 9)]
  s.phase = 'wave'; s = step(s, []).state
  expect(s.supply).toBe(3)
  s.phase = 'wave'; s.pendingSpawns = [{ type: 'runner', tick: 10000 }]
  s = step(s, [{ type: 'requisition', id: 3 }, { type: 'requisition', id: 3 }]).state
  expect(s.supply).toBe(2); expect(s.towers[2]!.overcharged).toBe(true)
  expect(step(s, [{ type: 'requisition', id: 1 }]).state.supply).toBe(2)
})
it('assault choices telegraph exact HP and pay only after all three waves', () => {
  for (const id of ['iron_column', 'swift_swarm'] as const) {
    let s = lab(); s.wave = s.wavesCleared = 6; s.assaultOffer = true
    s = step(s, [{ type: 'choose_assault', assault: id }]).state
    const preview = previewNextWave(s)!
    let started = step(s, [{ type: 'start_wave' }]).state
    started.towers = []; started.spireMaxHp = started.spireHp = 100000
    let hp = started.enemies.reduce((n, e) => n + e.maxHp, 0)
    const seen = new Set(started.enemies.map(e => e.id))
    while (started.pendingSpawns.length) {
      started = step(started, []).state
      for (const e of started.enemies) if (!seen.has(e.id)) { seen.add(e.id); hp += e.maxHp }
    }
    expect(hp).toBe(preview.totalHp)
    s.wave = 8; s.phase = 'wave'; s = step(s, []).state
    expect(s.assault).not.toBeNull()
    s.wave = 9; s.phase = 'wave'; const result = step(s, [])
    expect(result.events.filter(e => e.type === 'assault_reward')).toHaveLength(1)
    expect(result.state.assault).toBeNull()
    if (id === 'iron_column') expect(result.state.relics).toContain('stoneskin')
    expect(step(result.state, []).events.some(e => e.type === 'assault_reward')).toBe(false)
  }
})
it('guardian unlocks bank before run end, persist through ascension, and ignore daily rewards', () => {
  const s = lab(); s.killsByEnemy = { boss: 1, boss2: 1, boss3: 1 }; s.kills = 3
  const meta = bankGuardianMilestones(createMeta(), s)
  for (const id of BIOME_IDS) expect(biomeUnlocked(meta, id)).toBe(true)
  expect(bankGuardianMilestones(meta, s)).toBe(meta)
  expect(ascend({ ...meta, cycleVictories: 1 }).guardianMilestones).toEqual(meta.guardianMilestones)
  expect(bankGuardianMilestones(createMeta(), { ...s, seed: 'daily-test' }).guardianMilestones).toBeUndefined()
})
it('six authored situations stay connected and retain both terrain and replay identity', () => {
  const names = new Set<string>()
  for (const biome of BIOME_IDS) for (let n = 0; n < 40; n++) {
    const map = tacticalMap(biome, `review-map-${n}`); names.add(map.situation!)
    expect(distanceField(map, blockedGrid(map, []))[cellIndex(map, map.spawn)]).toBeGreaterThan(0)
    expect(map.tactic!.length).toBeGreaterThan(20)
  }
  expect(names.size).toBe(6)
})
