import { describe, expect, it } from 'vitest'
import {
  AUTO_COLLECT_PULL_SPEED,
  COIN_LIFETIME_TICKS,
  COLLECT_RADIUS_BASE,
  ENEMIES,
} from '../../data/content'
import { cellCenter, distSq } from '../grid'
import { getRunMap } from '../mapgen'
import { createMeta, createRun } from '../meta'
import { step } from '../step'
import type { Enemy, RunState } from '../types'

// Physical gold: kills drop coins, hands (or the Spire Magnet) collect
// them, and neglect loses them. Every rule pinned.

function makeEnemy(state: RunState, overrides: Partial<Enemy> & { id: number }): Enemy {
  return {
    type: 'runner',
    pos: cellCenter({ cx: 10, cy: 6 }),
    hp: 0, // dead on arrival — collected on the next step's pass
    maxHp: ENEMIES.runner.hp,
    speed: 0,
    slowFactor: 100,
    slowTicks: 0,
    bounty: 4,
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
  const s = createRun(createMeta(), 'coin-lab')
  s.phase = 'wave'
  s.wave = 5
  s.pendingSpawns = [{ type: 'runner', tick: 1_000_000 }]
  return s
}

const AT = cellCenter({ cx: 10, cy: 6 })

describe('physical gold', () => {
  it('a kill drops its full bounty as a coin where the enemy fell', () => {
    let s = waveState()
    s.enemies = [makeEnemy(s, { id: 1 })]
    const gold = s.gold
    s = step(s, []).state
    expect(s.gold).toBe(gold) // NOT banked — dropped
    expect(s.coins).toHaveLength(1)
    expect(s.coins[0]!.gold).toBe(4)
    expect(s.coins[0]!.pos).toEqual(AT)
  })

  it('the collector banks coins in reach; out of reach they wait', () => {
    let s = waveState()
    s.coins = [
      { id: 1, pos: { ...AT }, gold: 4, bornTick: s.tick, pulling: false },
      { id: 2, pos: { x: AT.x + COLLECT_RADIUS_BASE + 500, y: AT.y }, gold: 2, bornTick: s.tick, pulling: false },
    ]
    const gold = s.gold
    const r = step(s, [{ type: 'set_collect', at: { ...AT } }])
    s = r.state
    expect(s.gold).toBe(gold + 4)
    expect(s.coins).toHaveLength(1) // the far one waits
    expect(r.events.some((e) => e.type === 'coin_collected' && !e.auto)).toBe(true)
  })

  it('unclaimed coins expire at the lifetime — the gold is LOST', () => {
    const s = waveState()
    s.coins = [{ id: 1, pos: { ...AT }, gold: 4, bornTick: s.tick - COIN_LIFETIME_TICKS + 1, pulling: false }]
    const gold = s.gold
    const r = step(s, [])
    expect(r.state.coins).toHaveLength(0)
    expect(r.state.gold).toBe(gold)
    expect(r.events.some((e) => e.type === 'coin_expired')).toBe(true)
  })

  it('the Spire Magnet reels coins home visibly, and a caught coin never expires', () => {
    let s = waveState()
    const map = getRunMap(s)
    const spire = cellCenter(map.spire)
    s.mods.autoCollectRadius = 4000
    const start = { x: spire.x - 3000, y: spire.y }
    // Born a tick from expiry: the pull must save it anyway.
    s.coins = [{ id: 1, pos: { ...start }, gold: 4, bornTick: s.tick - COIN_LIFETIME_TICKS + 1, pulling: false }]
    s = step(s, []).state
    expect(s.coins[0]!.pulling).toBe(true)
    expect(distSq(s.coins[0]!.pos, spire)).toBeLessThan(distSq(start, spire)) // drifting home
    const gold = s.gold
    let banked = false
    for (let i = 0; i < 30 && !banked; i++) {
      const r = step(s, [])
      s = r.state
      banked = r.events.some((e) => e.type === 'coin_collected' && e.auto)
    }
    expect(banked).toBe(true)
    expect(s.gold).toBe(gold + 4)
    expect(s.coins).toHaveLength(0)
  })

  it('coins keep ticking (and can be swept) during the build phase', () => {
    let s = createRun(createMeta(), 'coin-lab')
    s.coins = [{ id: 1, pos: { ...AT }, gold: 3, bornTick: 0, pulling: false }]
    const gold = s.gold
    s = step(s, [{ type: 'set_collect', at: { ...AT } }]).state
    expect(s.gold).toBe(gold + 3)
    // And an ignored build-phase coin still ages out.
    s.coins = [{ id: 2, pos: { x: 0, y: 0 }, gold: 3, bornTick: s.tick - COIN_LIFETIME_TICKS, pulling: false }]
    s = step(s, [{ type: 'set_collect', at: null }]).state
    expect(s.coins).toHaveLength(0)
  })

  it('Collector’s Reach and Spire Magnet meta levels widen the mods', () => {
    const meta = createMeta()
    meta.sparks = 10_000
    meta.upgrades = { magnet_reach: 2, spire_magnet: 1 }
    const s = createRun(meta, 'coin-lab')
    expect(s.mods.collectRadius).toBe(COLLECT_RADIUS_BASE + 2 * 500)
    expect(s.mods.autoCollectRadius).toBe(2500)
    expect(AUTO_COLLECT_PULL_SPEED).toBeGreaterThan(0)
  })
})
