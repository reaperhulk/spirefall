import { describe, expect, it } from 'vitest'
import { META_TREE } from '../../data/metaTree'
import { buyMetaUpgrade, createMeta, createRun, metaUpgradeCost, settleRun } from '../meta'
import { computeSparks } from '../step'

describe('meta tree', () => {
  it('node cost tables match their max levels', () => {
    for (const node of META_TREE) {
      expect(node.costs, node.id).toHaveLength(node.maxLevel)
    }
  })

  it('buying spends sparks and levels up; overspending is rejected', () => {
    let meta = { ...createMeta(), sparks: 100 }
    const first = buyMetaUpgrade(meta, 'starting_gold')
    expect(first.ok).toBe(true)
    meta = first.meta
    expect(meta.sparks).toBe(80)
    expect(meta.upgrades['starting_gold']).toBe(1)

    const broke = buyMetaUpgrade({ ...meta, sparks: 0 }, 'starting_gold')
    expect(broke.ok).toBe(false)
    expect(broke.meta.upgrades['starting_gold']).toBe(1)
  })

  it('max level upgrades cannot be bought', () => {
    let meta = { ...createMeta(), sparks: 10_000 }
    for (let i = 0; i < 5; i++) meta = buyMetaUpgrade(meta, 'spire_hp').meta
    expect(metaUpgradeCost(meta, 'spire_hp')).toBeNull()
    expect(buyMetaUpgrade(meta, 'spire_hp').ok).toBe(false)
  })

  it('purchases never mutate the input meta', () => {
    const meta = { ...createMeta(), sparks: 100 }
    buyMetaUpgrade(meta, 'starting_gold')
    expect(meta.sparks).toBe(100)
    expect(meta.upgrades).toEqual({})
  })
})

describe('createRun applies meta', () => {
  it('fresh meta yields base stats and locked content', () => {
    const run = createRun(createMeta(), 'meta-fresh')
    expect(run.gold).toBe(100)
    expect(run.spireMaxHp).toBe(100)
    expect(run.availableTowers).not.toContain('tesla')
    expect(Object.keys(run.abilities)).not.toContain('gold_rush')
    expect(run.mods).toEqual({ damagePct: 0, goldPct: 0, sparkPct: 0 })
  })

  it('upgrades show up as run bonuses and unlocks', () => {
    let meta = { ...createMeta(), sparks: 100_000 }
    meta = buyMetaUpgrade(meta, 'starting_gold').meta
    meta = buyMetaUpgrade(meta, 'spire_hp').meta
    meta = buyMetaUpgrade(meta, 'tower_damage').meta
    meta = buyMetaUpgrade(meta, 'unlock_tesla').meta
    meta = buyMetaUpgrade(meta, 'unlock_gold_rush').meta
    const run = createRun(meta, 'meta-rich')
    expect(run.gold).toBe(130)
    expect(run.spireMaxHp).toBe(125)
    expect(run.mods.damagePct).toBe(6)
    expect(run.availableTowers).toContain('tesla')
    expect(Object.keys(run.abilities)).toContain('gold_rush')
  })

  it('the same meta and seed always create the identical run', () => {
    const meta = { ...createMeta(), sparks: 50 }
    expect(createRun(meta, 'same')).toEqual(createRun(meta, 'same'))
  })
})

describe('settleRun', () => {
  it('banks sparks and counts the run', () => {
    const run = createRun(createMeta(), 'settle')
    const ended = { ...run, phase: 'defeat' as const, wavesCleared: 7, kills: 40, sparksEarned: 85 }
    const { meta, summary } = settleRun(createMeta(), ended)
    expect(summary).toEqual({ outcome: 'defeat', wavesCleared: 7, kills: 40, sparks: 85 })
    expect(meta.sparks).toBe(85)
    expect(meta.totalSparks).toBe(85)
    expect(meta.runs).toBe(1)
  })

  it('refuses to settle a live run', () => {
    const run = createRun(createMeta(), 'live')
    expect(() => settleRun(createMeta(), run)).toThrow()
  })
})

describe('computeSparks', () => {
  it('failure pays, a claimed victory pays more, spark mods multiply', () => {
    const run = createRun(createMeta(), 'sparks')
    const base = { ...run, wavesCleared: 10, kills: 40 }
    const defeat = computeSparks(base)
    const victory = computeSparks({ ...base, victoryClaimed: true })
    expect(defeat).toBe(10 * 10 + Math.floor(40 / 6) + 5)
    expect(victory).toBe(defeat + 500)

    const boosted = computeSparks({ ...base, mods: { ...base.mods, sparkPct: 24 } })
    expect(boosted).toBe(Math.floor((defeat * 124) / 100))

    const siphoned = computeSparks({ ...base, relics: ['spark_siphon'] })
    expect(siphoned).toBe(Math.floor((defeat * 125) / 100))
  })
})
