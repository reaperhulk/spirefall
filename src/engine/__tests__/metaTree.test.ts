import { describe, expect, it } from 'vitest'
import {
  BRANCH_GATES,
  DAMAGE_NODE_IDS,
  KEYSTONE_BASTION_DAMAGE_PCT,
  KEYSTONE_BASTION_HP,
  META_BRANCHES,
  META_TREE,
  META_TOWER_DAMAGE_PCT_PER_LEVEL,
  branchNodes,
  keystoneRivals,
  metaNode,
  sparksSpentOn,
} from '../../data/metaTree'
import {
  branchSpend,
  buyMetaUpgrade,
  createMeta,
  createRun,
  glassforgeDamageBonus,
  isNodeUnlocked,
  keystoneConflict,
  metaLevel,
  respecKeystone,
} from '../meta'
import type { MetaState, RunState, Tower } from '../types'
import type { MetaUpgradeId } from '../../data/metaTree'
import { commandChargeCap } from '../../data/doctrines'
import { damageBreakdown, veteranDamagePct } from '../combat'
import { relicOfferSize, step } from '../step'

// The Spire Tree as a TREE: branches, gates that open tiers, keystones that
// exclude their rivals, and a respec that makes taking one safe.

function rich(sparks: number): MetaState {
  return { ...createMeta(), sparks }
}

describe('tree shape', () => {
  it('every node is well formed and placed', () => {
    const seen = new Set<string>()
    for (const node of META_TREE) {
      expect(node.costs, node.id).toHaveLength(node.maxLevel)
      expect(seen.has(node.id), `duplicate id ${node.id}`).toBe(false)
      seen.add(node.id)
      expect(META_BRANCHES).toContain(node.branch)
      expect([1, 2, 3]).toContain(node.tier)
      // Authored coordinates, both layouts, or the graph view cannot place it.
      for (const layout of [node.wide, node.compact]) {
        expect(Number.isFinite(layout.x), node.id).toBe(true)
        expect(Number.isFinite(layout.y), node.id).toBe(true)
      }
    }
  })

  it('no two nodes sit on top of each other in either layout', () => {
    for (const layout of ['wide', 'compact'] as const) {
      const spots = new Set<string>()
      for (const node of META_TREE) {
        const key = `${node[layout].x},${node[layout].y}`
        expect(spots.has(key), `${node.id} overlaps another node in ${layout}`).toBe(false)
        spots.add(key)
      }
    }
  })

  it('every keystone has a rival — a "choice" of one is not a choice', () => {
    for (const node of META_TREE.filter((n) => n.keystone === true)) {
      expect(keystoneRivals(node.id).length, node.id).toBeGreaterThanOrEqual(1)
    }
  })

  it('every gate is payable from the tiers below it — no node is stranded', () => {
    for (const branch of META_BRANCHES) {
      for (const tier of [2, 3] as const) {
        // Everything a player could buy strictly below this tier.
        const supply = branchNodes(branch)
          .filter((n) => n.tier < tier)
          .reduce((sum, n) => sum + sparksSpentOn(n.id, n.maxLevel), 0)
        expect(supply, `${branch} tier ${tier} gate is unreachable`).toBeGreaterThanOrEqual(BRANCH_GATES[tier])
      }
    }
  })

  it('Honed Edge keeps its original price curve, cut at twenty levels', () => {
    const levels = DAMAGE_NODE_IDS.reduce((sum, id) => sum + metaNode(id).maxLevel, 0)
    expect(levels).toBe(20) // 8 + 8 + 4: the pre-split node's first twenty levels
    expect(levels * META_TOWER_DAMAGE_PCT_PER_LEVEL).toBe(160)
    const price = DAMAGE_NODE_IDS.reduce((sum, id) => sum + sparksSpentOn(id, metaNode(id).maxLevel), 0)
    // The pre-split node's own cost curve (155,816 for 25 levels) minus its
    // last five levels (121,134): those were 70% of the tree for +40%.
    expect(price).toBe(155_816 - 121_134)
  })

  it('no single node is most of the tree', () => {
    const total = META_TREE.reduce((sum, n) => sum + sparksSpentOn(n.id, n.maxLevel), 0)
    for (const node of META_TREE) {
      expect(sparksSpentOn(node.id, node.maxLevel), node.id).toBeLessThan(total / 4)
    }
  })
})

describe('gates', () => {
  it('tier 1 is open to a fresh account; deeper tiers are not', () => {
    const meta = createMeta()
    expect(isNodeUnlocked(meta, 'tower_damage')).toBe(true) // iron t1
    expect(isNodeUnlocked(meta, 'starting_gold')).toBe(true) // gold t1
    expect(isNodeUnlocked(meta, 'unlock_gold_rush')).toBe(true) // ash t1
    expect(isNodeUnlocked(meta, 'crit_chance')).toBe(false) // iron t2
    expect(isNodeUnlocked(meta, 'spark_gain')).toBe(false) // gold t3
  })

  it('a locked buy is refused, and says what it wants', () => {
    const r = buyMetaUpgrade(rich(100_000), 'crit_chance')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/spend .* more in Iron/)
    expect(r.meta.sparks).toBe(100_000) // and it costs nothing to be told no
  })

  it('spending opens the tier — but only spending in THAT branch', () => {
    let meta = rich(100_000)
    // Pour into Gold: Gold's tier 2 opens, Iron's does not.
    for (let i = 0; i < 8; i++) meta = buyMetaUpgrade(meta, 'starting_gold').meta
    expect(branchSpend(meta, 'gold')).toBeGreaterThanOrEqual(BRANCH_GATES[2])
    expect(branchSpend(meta, 'iron')).toBe(0)
    expect(isNodeUnlocked(meta, 'gold_income')).toBe(true)
    expect(isNodeUnlocked(meta, 'crit_chance')).toBe(false)
  })

  it('branch spend counts levels bought, not sparks earned', () => {
    let meta = rich(100_000)
    expect(branchSpend(meta, 'iron')).toBe(0) // a fat wallet opens nothing
    meta = buyMetaUpgrade(meta, 'tower_damage').meta
    expect(branchSpend(meta, 'iron')).toBe(metaNode('tower_damage').costs[0])
  })
})

describe('keystones', () => {
  function ironOpened(sparks = 100_000): MetaState {
    let meta = rich(sparks)
    while (!isNodeUnlocked(meta, 'ks_glassforge')) meta = buyMetaUpgrade(meta, 'spire_hp').meta
    return meta
  }

  it('taking one locks out its rival until respec', () => {
    let meta = ironOpened()
    const bought = buyMetaUpgrade(meta, 'ks_glassforge')
    expect(bought.ok).toBe(true)
    meta = bought.meta
    expect(keystoneConflict(meta, 'ks_bastion')).toBe('ks_glassforge')
    const blocked = buyMetaUpgrade(meta, 'ks_bastion')
    expect(blocked.ok).toBe(false)
    expect(blocked.reason).toMatch(/Glassforge is taken/)
    expect(metaLevel(blocked.meta, 'ks_bastion')).toBe(0)
  })

  it('respec refunds in full and frees the rival — changing your mind is free', () => {
    let meta = ironOpened()
    const before = meta.sparks
    meta = buyMetaUpgrade(meta, 'ks_glassforge').meta
    expect(meta.sparks).toBe(before - metaNode('ks_glassforge').costs[0]!)
    const undone = respecKeystone(meta, 'ks_glassforge')
    expect(undone.ok).toBe(true)
    expect(undone.meta.sparks).toBe(before) // every spark back
    expect(metaLevel(undone.meta, 'ks_glassforge')).toBe(0)
    expect(buyMetaUpgrade(undone.meta, 'ks_bastion').ok).toBe(true)
  })

  it('refunds do not count toward a gate once handed back', () => {
    let meta = ironOpened()
    meta = buyMetaUpgrade(meta, 'ks_glassforge').meta
    const withKeystone = branchSpend(meta, 'iron')
    const after = respecKeystone(meta, 'ks_glassforge').meta
    expect(branchSpend(after, 'iron')).toBe(withKeystone - metaNode('ks_glassforge').costs[0]!)
  })

  it('only keystones can be respecced — veins are permanent', () => {
    let meta = rich(100_000)
    meta = buyMetaUpgrade(meta, 'tower_damage').meta
    const r = respecKeystone(meta, 'tower_damage')
    expect(r.ok).toBe(false)
    expect(metaLevel(r.meta, 'tower_damage')).toBe(1)
  })

  it('the Iron keystones actually bend the run they are taken into', () => {
    const base = buyMetaUpgrade(ironOpened(), 'tower_damage').meta
    const plain = createRun(base, 'ks-lab')
    const glass = createRun(buyMetaUpgrade(base, 'ks_glassforge').meta, 'ks-lab')
    const bastion = createRun(buyMetaUpgrade(base, 'ks_bastion').meta, 'ks-lab')
    // Glassforge: more teeth, much less wall.
    expect(glass.mods.damagePct).toBe(plain.mods.damagePct + glassforgeDamageBonus(base))
    expect(glass.spireMaxHp).toBeLessThan(plain.spireMaxHp)
    // Bastion Line: the trade, in reverse.
    expect(bastion.mods.damagePct).toBe(plain.mods.damagePct - KEYSTONE_BASTION_DAMAGE_PCT)
    expect(bastion.spireMaxHp).toBe(plain.spireMaxHp + KEYSTONE_BASTION_HP)
  })
})

describe('the split damage veins', () => {
  it('sum into one damage number', () => {
    let meta = rich(500_000)
    for (let i = 0; i < 8; i++) meta = buyMetaUpgrade(meta, 'tower_damage').meta
    for (let i = 0; i < 8; i++) meta = buyMetaUpgrade(meta, 'tower_damage_2').meta
    expect(metaLevel(meta, 'tower_damage_2')).toBe(8) // tier 2 opened along the way
    expect(createRun(meta, 'vein-lab').mods.damagePct).toBe(16 * META_TOWER_DAMAGE_PCT_PER_LEVEL)
  })
})

// Early identity keeps a cost; deeper Iron investment grows its niche. Extra
// relic/Ember damage must not be multiplied or these budgets become misleading.
it('Glassforge scales with Honed Edge alone and rounds once across the veins', () => {
  for (const [upgrades, expected] of [
    [{}, 0],
    [{tower_damage: 8}, 9],
    [{tower_damage: 8, tower_damage_2: 8}, 19],
    [{tower_damage: 8, tower_damage_2: 8, tower_damage_3: 4}, 24],
  ] as const) {
    const meta: MetaState = {...createMeta(), upgrades: {...upgrades, ks_glassforge: 1}}
    const plain = createRun({...meta, upgrades: {...upgrades}}, 'glass-scaling')
    const glass = createRun(meta, 'glass-scaling')
    expect(glass.mods.damagePct - plain.mods.damagePct).toBe(expected)
    expect(glass.spireMaxHp).toBe(Math.floor(plain.spireMaxHp * 0.6))
  }
})

describe('play-changing tier-3 nodes', () => {
  const opened = (ids: MetaUpgradeId[]) => {
    // Pay every gate with tier-1/2 levels, then take the node under test.
    let meta = rich(1_000_000)
    for (let pass = 0; pass < 12; pass++) {
      for (const id of ['spire_hp', 'tower_damage', 'tower_damage_2', 'starting_gold', 'gold_income', 'unlock_gold_rush', 'quick_hands', 'steady_aim', 'unlock_bulwark', 'spark_gain', 'wave_skip'] as const) {
        meta = buyMetaUpgrade(meta, id).meta
      }
    }
    for (const id of ids) {
      const result = buyMetaUpgrade(meta, id)
      expect(result.ok, `${id}: ${result.reason}`).toBe(true)
      meta = result.meta
    }
    return meta
  }

  it('Battle-Hardened turns veterancy stars into damage, and the panel says so', () => {
    const meta = opened(['battle_hardened', 'battle_hardened'])
    const run = createRun(meta, 'veterans')
    expect(run.mods.veteranDamagePct).toBe(8)
    const rookie: Tower = { id: 1, type: 'arrow', tier: 1, spec: null, enhance: 0, cell: { cx: 3, cy: 3 }, cooldown: 0, targeting: 'first', kills: 9, damageDealt: 0, shots: 0 }
    const veteran: Tower = { ...rookie, id: 2, kills: 50 } // two stars
    expect(veteranDamagePct(run, rookie)).toBe(0)
    expect(veteranDamagePct(run, veteran)).toBe(16)
    const parts = damageBreakdown(run, veteran).parts
    expect(parts.find((p) => p.source.startsWith('Battle-Hardened'))?.pct).toBe(16)
    expect(veteranDamagePct(createRun(createMeta(), 'plain'), veteran)).toBe(0)
  })

  it('Relic Cartography widens every offer by one relic', () => {
    const meta = opened(['relic_cartography'])
    const run = createRun(meta, 'cartography')
    expect(run.mods.relicChoices).toBe(1)
    expect(relicOfferSize(run)).toBe(4)
    const offered = step({ ...run, wave: 5, phase: 'wave', pendingSpawns: [], enemies: [] }, []).state
    expect(offered.relicOffer).toHaveLength(4)
  })

  it('Deep Reserves deepens the command pool, and it refills to the new cap', () => {
    const meta = opened(['deep_reserves', 'deep_reserves'])
    const run = createRun(meta, 'reserves')
    expect(run.commandCharges).toBe(5)
    expect(commandChargeCap(run.mods)).toBe(5)
    let live: RunState = { ...run, phase: 'wave', wave: 1, commandCharges: 3, pendingSpawns: [{ type: 'brute', tick: 1_000_000 }] }
    for (let i = 0; i < 20_000 && (live.commandCharges ?? 0) < 5; i++) live = step(live, []).state
    expect(live.commandCharges).toBe(5)
    for (let i = 0; i < 2000; i++) live = step(live, []).state
    expect(live.commandCharges).toBe(5) // never past the cap
  })
})
