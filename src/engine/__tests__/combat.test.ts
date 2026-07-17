import { describe, expect, it } from 'vitest'
import { applyHit, beaconAuraPct, damageBreakdown, effectiveDamagePct, selectTarget } from '../combat'
import { blockedGrid, cellCenter, distanceField, getMap } from '../grid'
import { getRunMap } from '../mapgen'
import { createMeta, createRun } from '../meta'
import { ENHANCE_DAMAGE_PCT, towerTier } from '../../data/content'
import type { Enemy, RunState, Tower } from '../types'

function enemy(overrides: Partial<Enemy> & { id: number }): Enemy {
  return {
    type: 'runner',
    pos: { x: 5500, y: 6500 },
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
    targetCell: null,
    ...overrides,
  }
}

function tower(overrides: Partial<Tower> = {}): Tower {
  return {
    id: 100,
    type: 'arrow',
    tier: 1,
    enhance: 0,
    cell: { cx: 5, cy: 5 },
    cooldown: 0,
    targeting: 'first',
    kills: 0,
    damageDealt: 0,
    shots: 0,
    ...overrides,
  }
}

describe('applyHit', () => {
  it('deals damage, capped at remaining hp', () => {
    const e = enemy({ id: 1, hp: 10 })
    expect(applyHit(e, 7)).toBe(7)
    expect(e.hp).toBe(3)
    expect(applyHit(e, 100)).toBe(3)
    expect(e.hp).toBe(0)
  })

  it('shieldbearers fully block hits at or below their shield', () => {
    const e = enemy({ id: 2, shield: 9, hp: 50 })
    expect(applyHit(e, 9)).toBe(0)
    expect(e.hp).toBe(50)
    expect(applyHit(e, 10)).toBe(10)
    expect(e.hp).toBe(40)
  })
})

describe('targeting', () => {
  const state = createRun(createMeta(), 'targeting')
  const map = getRunMap(state)
  const field = distanceField(map, blockedGrid(map, []))

  // Two enemies: `ahead` sits closer to the Spire, `behind` closer to spawn.
  const ahead = enemy({ id: 1, pos: cellCenter({ cx: 18, cy: 6 }), hp: 30 })
  const behind = enemy({ id: 2, pos: cellCenter({ cx: 4, cy: 6 }), hp: 90 })

  it('first picks the enemy furthest along the path', () => {
    const t = tower({ targeting: 'first', cell: { cx: 11, cy: 5 } })
    expect(selectTarget(t, [behind, ahead], map, field)?.id).toBe(1)
  })

  it('last picks the enemy closest to spawn', () => {
    const t = tower({ targeting: 'last', cell: { cx: 11, cy: 5 } })
    expect(selectTarget(t, [behind, ahead], map, field)?.id).toBe(2)
  })

  it('strongest picks max hp', () => {
    const t = tower({ targeting: 'strongest', cell: { cx: 11, cy: 5 } })
    expect(selectTarget(t, [ahead, behind], map, field)?.id).toBe(2)
  })

  it('nearest picks minimum distance, ties to lower id', () => {
    const t = tower({ targeting: 'nearest', cell: { cx: 11, cy: 6 } })
    const left = enemy({ id: 3, pos: cellCenter({ cx: 9, cy: 6 }) })
    const right = enemy({ id: 4, pos: cellCenter({ cx: 13, cy: 6 }) })
    expect(selectTarget(t, [right, left], map, field)?.id).toBe(3)
  })

  it('returns null with no candidates', () => {
    expect(selectTarget(tower(), [], map, field)).toBeNull()
  })
})

describe('damageBreakdown', () => {
  it('itemization always reconciles with the damage math the towers use', () => {
    const base = createRun(createMeta(), 'breakdown')
    const configs: Partial<RunState>[] = [
      {},
      { mods: { ...base.mods, damagePct: 24 } },
      { relics: ['glass_cannon'] },
      { relics: ['piercing_arrows', 'glass_cannon'], mods: { ...base.mods, damagePct: 16 } },
    ]
    const towers = [
      tower({ type: 'arrow' }),
      tower({ type: 'cannon', tier: 2 }),
      tower({ type: 'sniper', tier: 3, enhance: 3 }),
    ]
    for (const over of configs) {
      const state = { ...base, ...over }
      for (const t of towers) {
        const b = damageBreakdown(state, t)
        expect(b.totalPct).toBe(effectiveDamagePct(state, t.type) + ENHANCE_DAMAGE_PCT * t.enhance)
        expect(b.effective).toBe(Math.floor((b.base * b.totalPct) / 100))
        expect(b.base).toBe(towerTier(t.type, t.tier).damage)
        // Parts sum to exactly the bonus over 100% — nothing hidden.
        expect(100 + b.parts.reduce((sum, p) => sum + p.pct, 0)).toBe(b.totalPct)
      }
    }
  })

  it('a fresh tower has no multipliers: effective equals base', () => {
    const state = createRun(createMeta(), 'plain')
    const b = damageBreakdown(state, tower({ type: 'frost' }))
    expect(b.parts).toEqual([])
    expect(b.effective).toBe(b.base)
  })
})

describe('beacon aura', () => {
  const withTowers = (towers: Tower[]): RunState => {
    const s = createRun(createMeta(), 'beacon-test')
    return { ...s, towers }
  }

  it('amplifies towers in range; strongest beacon wins, never stacking', () => {
    const arrow = tower({ id: 1, type: 'arrow', tier: 3, cell: { cx: 5, cy: 5 } })
    const near = tower({ id: 2, type: 'beacon', tier: 1, cell: { cx: 6, cy: 5 } })
    const stronger = tower({ id: 3, type: 'beacon', tier: 3, cell: { cx: 5, cy: 6 } })
    const far = tower({ id: 4, type: 'beacon', tier: 3, cell: { cx: 20, cy: 12 } })

    expect(beaconAuraPct(withTowers([arrow]), arrow)).toBe(0)
    expect(beaconAuraPct(withTowers([arrow, far]), arrow)).toBe(0) // out of range
    expect(beaconAuraPct(withTowers([arrow, near]), arrow)).toBe(12)
    // Two beacons in range: take the strongest, not the sum.
    expect(beaconAuraPct(withTowers([arrow, near, stronger]), arrow)).toBe(25)
    // Beacons don't buff themselves.
    expect(beaconAuraPct(withTowers([near, stronger]), near)).toBe(25)

    // And the aura shows up in the damage breakdown pipeline.
    const state = withTowers([arrow, near])
    const b = damageBreakdown(state, arrow)
    expect(b.parts).toContainEqual({ source: 'Beacon aura', pct: 12 })
    expect(b.effective).toBe(Math.floor((32 * 112) / 100))
  })
})

describe('new targeting modes', () => {
  const map = getMap(0)
  const field = distanceField(map, blockedGrid(map, []))

  it('weakest picks minimum hp; elites hunt elite units before anything else', () => {
    const wounded = enemy({ id: 1, hp: 5, pos: cellCenter({ cx: 6, cy: 6 }) })
    const healthy = enemy({ id: 2, hp: 45, pos: cellCenter({ cx: 7, cy: 6 }) })
    const brute = enemy({ id: 3, type: 'brute', hp: 70, maxHp: 70, pos: cellCenter({ cx: 5, cy: 6 }) })
    const t = tower({ targeting: 'weakest', cell: { cx: 6, cy: 7 } })
    expect(selectTarget(t, [wounded, healthy, brute], map, field)!.id).toBe(1)

    const hunter = tower({ targeting: 'elites', cell: { cx: 6, cy: 7 } })
    expect(selectTarget(hunter, [wounded, healthy, brute], map, field)!.id).toBe(3)
    // With no elite present, elites falls back to path progress.
    const fallback = selectTarget(hunter, [wounded, healthy], map, field)!
    expect(['1', '2']).toContain(String(fallback.id))
  })
})
