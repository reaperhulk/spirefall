import { describe, expect, it } from 'vitest'
import { AFFIX_FIRST_WAVE, ENEMIES, TOWERS } from '../../data/content'
import { buildCandidates } from '../../harness/bots'
import { cellCenter, distSq } from '../grid'
import { getRunMap } from '../mapgen'
import { VICTORY_WAVE } from '../../data/content'
import { createMeta, createRun } from '../meta'
import { deriveStream } from '../rng'
import { step } from '../step'
import { generateWave } from '../waves'
import type { Enemy, RunState } from '../types'

// Focused tests for the M4 content systems: fliers, healers, splitters,
// mint/sniper towers, wave affixes, and the endless victory milestone.

function freshRun(seed = 'm4-test'): RunState {
  return createRun(createMeta(), seed)
}

function makeEnemy(state: RunState, overrides: Partial<Enemy> & { type: Enemy['type'] }): RunState {
  const id = state.nextEntityId
  const def = ENEMIES[overrides.type]
  const enemy: Enemy = {
    id,
    pos: cellCenter({ cx: 10, cy: 6 }),
    hp: def.hp,
    maxHp: def.hp,
    speed: def.speed,
    slowFactor: 100,
    slowTicks: 0,
    bounty: def.bounty,
    damage: def.damage,
    shield: def.shield,
    armor: 0,
    healCooldown: def.heal ? def.heal.everyTicks : 0,
    broodCooldown: def.brood ? def.brood.everyTicks : 0,
    phased: false,
    phaseCooldown: def.phasing ? def.phasing.visibleTicks : 0,
    burnTicks: 0,
    burnPerTick: 0,
    overcharge: 0,
    mechCooldown: 0,
    mechActiveTicks: 0,
    brittleTicks: 0,
    targetCell: null,
    ...overrides,
  }
  return {
    ...state,
    phase: 'wave',
    wave: Math.max(state.wave, 1),
    nextEntityId: id + 1,
    enemies: [...state.enemies, enemy].sort((a, b) => a.id - b.id),
  }
}

describe('fliers', () => {
  it('fly straight at the spire, ignoring the maze', () => {
    let s = makeEnemy(freshRun(), { type: 'flier', pos: cellCenter({ cx: 2, cy: 2 }) })
    const map = getRunMap(s)
    const spire = cellCenter(map.spire)
    const before = distSq(s.enemies[0]!.pos, spire)
    s = step(s, []).state
    expect(distSq(s.enemies[0]!.pos, spire)).toBeLessThan(before)
  })

  it('ground-only towers cannot touch them; air towers can', () => {
    expect(TOWERS.cannon.hitsAir).toBe(false)
    expect(TOWERS.frost.hitsAir).toBe(false)
    expect(TOWERS.arrow.hitsAir).toBe(true)
    expect(TOWERS.sniper.hitsAir).toBe(true)

    // A flier parked inside cannon range takes no cannon fire.
    let s = { ...freshRun(), gold: 10_000 }
    const spot = buildCandidates(s)[0]!
    s = step(s, [{ type: 'place_tower', tower: 'cannon', cell: spot }]).state
    s = makeEnemy(s, { type: 'flier', pos: cellCenter(spot), hp: 1000, maxHp: 1000 })
    for (let i = 0; i < 60; i++) s = step(s, []).state
    // It may have flown onward or reached the spire, but it was never shot.
    expect(s.towers[0]!.damageDealt).toBe(0)
  })
})

describe('healers', () => {
  it('pulse healing to nearby wounded allies', () => {
    let s = freshRun()
    s = makeEnemy(s, { type: 'healer', pos: cellCenter({ cx: 10, cy: 6 }), healCooldown: 1 })
    s = makeEnemy(s, { type: 'brute', pos: cellCenter({ cx: 10, cy: 7 }), hp: 50, maxHp: 130 })
    s = step(s, []).state // cooldown ticks to 0
    const before = s.enemies.find((e) => e.type === 'brute')!.hp
    const result = step(s, [])
    const after = result.state.enemies.find((e) => e.type === 'brute')!.hp
    expect(after).toBeGreaterThan(before)
    expect(result.events.some((e) => e.type === 'enemy_healed')).toBe(true)
  })
})

describe('splitters', () => {
  it('burst into shards where they fall', () => {
    let s = { ...freshRun(), gold: 10_000 }
    // A sniper one-shots a wounded splitter standing two cells away.
    const spot = buildCandidates(s)[0]!
    s = step(s, [{ type: 'place_tower', tower: 'sniper', cell: spot }]).state
    const at = { cx: spot.cx + 2, cy: spot.cy }
    s = makeEnemy(s, { type: 'splitter', hp: 1, maxHp: 80, pos: cellCenter(at) })
    const result = step(s, [])
    const shards = result.state.enemies.filter((e) => e.type === 'splitling')
    expect(shards).toHaveLength(2)
    // Shards appear where the splitter fell (it moved at most one tick first).
    for (const shard of shards) {
      const moved = Math.abs(shard.pos.x - cellCenter(at).x) + Math.abs(shard.pos.y - cellCenter(at).y)
      expect(moved).toBeLessThanOrEqual(ENEMIES.splitter.speed)
    }
    expect(result.events.filter((e) => e.type === 'enemy_spawned' && e.enemy === 'splitling')).toHaveLength(2)
  })
})

describe('carriers', () => {
  it('hatch broods on a cadence while alive, preserving spawn order', () => {
    const every = ENEMIES.carrier.brood!.everyTicks
    let s = makeEnemy({ ...freshRun(), spireHp: 1000, spireMaxHp: 1000 }, { type: 'carrier', broodCooldown: 2 })
    const before = s.enemies.length
    s = step(s, []).state // cooldown 2 → 1
    s = step(s, []).state // 1 → 0
    expect(s.enemies.length).toBe(before)
    s = step(s, []).state // 0 → hatch
    const brood = s.enemies.filter((e) => e.type === ENEMIES.carrier.brood!.type)
    expect(brood.length).toBe(ENEMIES.carrier.brood!.count)
    const carrier = s.enemies.find((e) => e.type === 'carrier')!
    expect(carrier.broodCooldown).toBe(every)
    // Spawn order stays strictly ascending (the structural invariant).
    for (let i = 1; i < s.enemies.length; i++) {
      expect(s.enemies[i]!.id).toBeGreaterThan(s.enemies[i - 1]!.id)
    }
  })

  it('broods hatch where the carrier is and inherit the wave HP curve', () => {
    let s = makeEnemy(
      { ...freshRun(), spireHp: 1000, spireMaxHp: 1000, hpScalePct: 400 },
      { type: 'carrier', broodCooldown: 1 },
    )
    const carrierPos = { ...s.enemies.find((e) => e.type === 'carrier')!.pos }
    s = step(s, []).state
    s = step(s, []).state
    const brood = s.enemies.filter((e) => e.type === ENEMIES.carrier.brood!.type)
    expect(brood.length).toBeGreaterThan(0)
    for (const b of brood) {
      // Hatched at (or one movement-tick from) the carrier's position...
      const moved = Math.abs(b.pos.x - carrierPos.x) + Math.abs(b.pos.y - carrierPos.y)
      expect(moved).toBeLessThanOrEqual(ENEMIES.carrier.speed + b.speed)
      // ...with hp scaled by the current wave curve (5 base × 4).
      expect(b.maxHp).toBe(Math.floor((ENEMIES[b.type].hp * 400) / 100))
    }
  })
})

describe('spawn-on-spire arrival', () => {
  it('an enemy standing on the spire cell arrives instead of stalling the wave forever', () => {
    // Regression: brood swarmlings hatched by a carrier dying at the gate —
    // or splitlings from a splitter killed there — used to stand on the
    // spire cell with no waypoint, unkillable and unarriving.
    const base = freshRun()
    const map = getRunMap(base) // the run's GENERATED battlefield — its spire, not a fixed map's
    let s = makeEnemy(
      { ...base, spireHp: 100, spireMaxHp: 100 },
      { type: 'boss', pos: cellCenter(map.spire) },
    )
    s = step(s, []).state
    expect(s.enemies).toHaveLength(0)
    // Boss damage lands, then the wave clears and the spire knits +1.
    expect(s.spireHp).toBe(100 - ENEMIES.boss.damage + 1)
    expect(s.phase).toBe('build') // the wave can actually end
  })
})

describe('mints', () => {
  it('pay out on every cleared wave, scaled by enhance and relics', () => {
    // A tall spire tanks the undefended horde so the wave actually clears.
    let s = {
      ...freshRun(),
      gold: 10_000,
      spireHp: 1000,
      spireMaxHp: 1000,
      availableTowers: [...freshRun().availableTowers, 'mint' as const],
    }
    const spot = buildCandidates(s)[0]!
    s = step(s, [{ type: 'place_tower', tower: 'mint', cell: spot }]).state
    s = step(s, [{ type: 'start_wave' }]).state
    let events: ReturnType<typeof step>['events'] = []
    while (s.phase === 'wave' && s.tick < 20_000) {
      const r = step(s, [])
      s = r.state
      if (r.events.length > 0) events = events.concat(r.events)
    }
    const income = events.find((e) => e.type === 'mint_income')
    expect(income).toBeDefined()
    expect(income!.type === 'mint_income' && income!.amount).toBe(12)
    // The lifetime ledger tracks exactly what was paid out.
    expect(s.towers[0]!.earned).toBe(12)
  })

  it('never fire and never record kills', () => {
    let s = { ...freshRun(), gold: 10_000, availableTowers: [...freshRun().availableTowers, 'mint' as const] }
    const spot = buildCandidates(s)[0]!
    s = step(s, [{ type: 'place_tower', tower: 'mint', cell: spot }]).state
    s = makeEnemy(s, { type: 'runner', pos: cellCenter(spot), hp: 5, maxHp: 26 })
    for (let i = 0; i < 30; i++) s = step(s, []).state
    expect(s.towers[0]!.damageDealt).toBe(0)
    expect(s.towers[0]!.kills).toBe(0)
  })
})

describe('endless victory', () => {
  it('clearing the victory wave is a milestone, not the end — the run continues', () => {
    const s: RunState = {
      ...freshRun('endless'),
      phase: 'wave',
      wave: VICTORY_WAVE,
      wavesCleared: VICTORY_WAVE - 1,
      waveBudget: 500, // realistic mid-game budget so wave 45 isn't empty
      enemies: [],
      pendingSpawns: [],
    }
    const cleared = step(s, [])
    expect(cleared.events.some((e) => e.type === 'victory_achieved')).toBe(true)
    expect(cleared.state.victoryClaimed).toBe(true)
    expect(cleared.state.phase).toBe('build') // endless: keep playing

    // The next wave can still be sent...
    const next = step(cleared.state, [{ type: 'start_wave' }])
    expect(next.state.phase).toBe('wave')
    expect(next.state.wave).toBe(VICTORY_WAVE + 1)

    // ...and however the run finally ends, the cycle counts as won.
    const ended = step(next.state, [{ type: 'abandon_run' }])
    const runEnded = ended.events.find((e) => e.type === 'run_ended')
    expect(runEnded).toMatchObject({ type: 'run_ended', outcome: 'victory' })
    expect(ended.state.phase).toBe('victory')
    // The victory bonus is in the payout.
    expect(ended.state.sparksEarned).toBeGreaterThan(500)
  })

  it('victory_achieved fires exactly once even across later waves', () => {
    let s: RunState = {
      ...freshRun('endless-once'),
      phase: 'wave',
      wave: VICTORY_WAVE,
      wavesCleared: VICTORY_WAVE - 1,
      enemies: [],
      pendingSpawns: [],
    }
    let achieved = 0
    let r = step(s, [])
    achieved += r.events.filter((e) => e.type === 'victory_achieved').length
    s = { ...r.state, phase: 'wave', wave: VICTORY_WAVE + 1, enemies: [], pendingSpawns: [] }
    r = step(s, [])
    achieved += r.events.filter((e) => e.type === 'victory_achieved').length
    expect(achieved).toBe(1)
  })
})

describe('wave affixes', () => {
  it('appear deterministically from the waves stream, never before their first wave or on boss waves', () => {
    let found = 0
    for (let wave = 1; wave <= 30; wave++) {
      const { affix } = generateWave(deriveStream('affix-seed', 'waves'), wave, 500)
      if (wave < AFFIX_FIRST_WAVE || wave % 10 === 0) {
        expect(affix, `wave ${wave}`).toBeNull()
      } else if (affix !== null) {
        found += 1
      }
    }
    expect(found).toBeGreaterThan(0) // 35% chance across 20+ eligible waves
    // Deterministic: same stream state, same result.
    const a = generateWave(deriveStream('affix-seed', 'waves'), 9, 500)
    const b = generateWave(deriveStream('affix-seed', 'waves'), 9, 500)
    expect(a.affix).toBe(b.affix)
    expect(a.spawns).toEqual(b.spawns)
  })

  it('armored spawns tougher enemies; frenzied spawns faster ones', () => {
    const base = freshRun('affix-stats')
    const armored = { ...base, activeAffix: 'armored' as const, phase: 'wave' as const, wave: 1, hpScalePct: 100 }
    const normal = { ...base, phase: 'wave' as const, wave: 1, hpScalePct: 100 }
    const spawnAt = (st: RunState) => ({ ...st, pendingSpawns: [{ type: 'runner' as const, tick: st.tick + 1 }] })
    const armoredEnemy = step(spawnAt(armored), []).state.enemies[0]!
    const normalEnemy = step(spawnAt(normal), []).state.enemies[0]!
    expect(armoredEnemy.maxHp).toBeGreaterThan(normalEnemy.maxHp)

    const frenzied = { ...base, activeAffix: 'frenzied' as const, phase: 'wave' as const, wave: 1 }
    const fastEnemy = step(spawnAt(frenzied), []).state.enemies[0]!
    expect(fastEnemy.speed).toBeGreaterThan(normalEnemy.speed)
  })
})

describe('wraiths', () => {
  it('phase in and out; towers cannot touch them while phased, abilities can', () => {
    const phasing = ENEMIES.wraith.phasing!
    let s = { ...freshRun(), gold: 10_000 }
    const spot = buildCandidates(s)[0]!
    s = step(s, [{ type: 'place_tower', tower: 'sniper', cell: spot }]).state
    s = makeEnemy(s, {
      type: 'wraith',
      pos: cellCenter({ cx: spot.cx + 2, cy: spot.cy }),
      hp: 1000,
      maxHp: 1000,
      speed: 0,
      phased: true,
      phaseCooldown: 5,
    })
    // Phased: five ticks pass, the sniper (cooldown 0, in range) never fires.
    for (let i = 0; i < 4; i++) s = step(s, []).state
    expect(s.towers[0]!.shots).toBe(0)
    // The flip back to corporeal: now it gets shot.
    for (let i = 0; i < 3; i++) s = step(s, []).state
    const wraith = s.enemies.find((e) => e.type === 'wraith')!
    expect(wraith.phased).toBe(false)
    expect(s.towers[0]!.shots).toBeGreaterThan(0)
    // And the cycle keeps flipping on the defined cadence.
    expect(wraith.phaseCooldown).toBeLessThanOrEqual(phasing.visibleTicks)

    // Meteor ignores the veil entirely.
    let m = makeEnemy({ ...freshRun(), gold: 10_000 }, {
      type: 'wraith',
      pos: cellCenter({ cx: 10, cy: 6 }),
      hp: 1000,
      maxHp: 1000,
      speed: 0,
      phased: true,
      phaseCooldown: 500,
    })
    m = step(m, [{ type: 'cast_ability', ability: 'meteor', cell: { cx: 10, cy: 6 } }]).state
    expect(m.enemies[0]!.hp).toBeLessThan(1000)
  })
})
