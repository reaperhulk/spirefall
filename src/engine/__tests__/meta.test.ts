import { describe, expect, it } from 'vitest'
import {
  META_CRIT_CHANCE_PCT_PER_LEVEL,
  META_SPIRE_HP_PER_LEVEL,
  META_TOWER_DAMAGE_PCT_PER_LEVEL,
  META_TREE,
  metaNode,
  metaNodeEffect,
} from '../../data/metaTree'
import { ABILITIES, STARTING_GOLD, STARTING_SPIRE_HP } from '../../data/content'
import { MAPS, RANDOM_MAP_POOL } from '../../data/maps'
import {
  ascend,
  buyEmberUpgrade,
  buyMetaUpgrade,
  canAscend,
  createMeta,
  createRun,
  emberGainOnAscend,
  HISTORY_LIMIT,
  metaUpgradeCost,
  settleRun,
} from '../meta'
import { computeSparks, step } from '../step'
import { cloneRun } from '../clone'

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
    const node = metaNode('spire_hp')
    let meta = { ...createMeta(), sparks: 1_000_000 }
    for (let i = 0; i < node.maxLevel; i++) meta = buyMetaUpgrade(meta, 'spire_hp').meta
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
    expect(run.gold).toBe(STARTING_GOLD)
    expect(run.spireMaxHp).toBe(STARTING_SPIRE_HP)
    expect(run.availableTowers).not.toContain('tesla')
    expect(Object.keys(run.abilities)).not.toContain('gold_rush')
    expect(run.mods).toEqual({ damagePct: 0, goldPct: 0, sparkPct: 0, critChancePct: 0, abilityCdPct: 0 })
  })

  it('upgrades show up as run bonuses and unlocks', () => {
    let meta = { ...createMeta(), sparks: 100_000 }
    meta = buyMetaUpgrade(meta, 'starting_gold').meta
    meta = buyMetaUpgrade(meta, 'spire_hp').meta
    meta = buyMetaUpgrade(meta, 'tower_damage').meta
    meta = buyMetaUpgrade(meta, 'crit_chance').meta
    meta = buyMetaUpgrade(meta, 'crit_chance').meta
    meta = buyMetaUpgrade(meta, 'unlock_tesla').meta
    meta = buyMetaUpgrade(meta, 'unlock_gold_rush').meta
    const run = createRun(meta, 'meta-rich')
    expect(run.gold).toBe(STARTING_GOLD + 30)
    expect(run.spireMaxHp).toBe(STARTING_SPIRE_HP + META_SPIRE_HP_PER_LEVEL)
    expect(run.mods.damagePct).toBe(META_TOWER_DAMAGE_PCT_PER_LEVEL)
    expect(run.mods.critChancePct).toBe(2 * META_CRIT_CHANCE_PCT_PER_LEVEL)
    expect(run.availableTowers).toContain('tesla')
    expect(Object.keys(run.abilities)).toContain('gold_rush')
  })

  it('Ashen Road skips starting waves with catch-up gold, and skipped waves pay no sparks', () => {
    let meta = { ...createMeta(), sparks: 1_000 }
    meta = buyMetaUpgrade(meta, 'wave_skip').meta // level 1 = start at wave 2
    const run = createRun(meta, 'skip-run')
    expect(run.startWave).toBe(2)
    expect(run.wave).toBe(2)
    expect(run.wavesCleared).toBe(2)
    expect(run.waveBudget).toBeGreaterThan(0) // budget curve advanced to match
    expect(run.gold).toBeGreaterThan(STARTING_GOLD) // catch-up gold for the skipped waves
    // Sparks only pay for waves cleared THIS run — a skip-then-abandon pays 0.
    expect(computeSparks({ ...run, wavesCleared: 2, kills: 0 })).toBe(0)
    expect(computeSparks({ ...run, wavesCleared: 12, kills: 0 })).toBe(10 * 15)
  })

  it('metaNodeEffect reports the cumulative value at any level', () => {
    expect(metaNodeEffect('spire_hp', 3)).toBe('+6 max HP')
    expect(metaNodeEffect('tower_damage', 5)).toBe('+40% damage')
    expect(metaNodeEffect('crit_chance', 4)).toBe('8% crit chance')
    expect(metaNodeEffect('starting_gold', 2)).toBe('+60 starting gold')
    expect(metaNodeEffect('wave_skip', 2)).toBe('start at wave 5')
    expect(metaNodeEffect('unlock_tesla', 1)).toBeNull() // binary unlocks have no running total
  })

  it('the same meta and seed always create the identical run', () => {
    const meta = { ...createMeta(), sparks: 50 }
    expect(createRun(meta, 'same')).toEqual(createRun(meta, 'same'))
  })

  it('trials apply their handicaps at run creation', () => {
    const meta = createMeta()
    const plain = createRun(meta, 'trial-run')
    const glass = createRun(meta, 'trial-run', undefined, ['glass_spire'])
    expect(glass.spireMaxHp).toBe(Math.max(1, Math.floor(plain.spireMaxHp / 2)))
    expect(glass.trials).toEqual(['glass_spire'])
    const famine = createRun(meta, 'trial-run', undefined, ['famine'])
    expect(famine.mods.goldPct).toBe(plain.mods.goldPct - 25)
    // Bogus and duplicate entries are dropped; RNG streams are untouched.
    const messy = createRun(meta, 'trial-run', undefined, ['famine', 'famine', 'bogus' as never])
    expect(messy.trials).toEqual(['famine'])
    expect(messy.rng).toEqual(plain.rng)
  })

  it('an explicit map choice overrides the roll without touching anything else', () => {
    const meta = createMeta()
    const rolled = createRun(meta, 'map-choice')
    expect(createRun(meta, 'map-choice', 3).mapId).toBe(3)
    // Invalid choices fall back to the seed's roll.
    expect(createRun(meta, 'map-choice', 99).mapId).toBe(rolled.mapId)
    expect(createRun(meta, 'map-choice', -1).mapId).toBe(rolled.mapId)
    // The choice must not shift any RNG stream — only the battlefield.
    const chosen = createRun(meta, 'map-choice', 2)
    expect(chosen.rng).toEqual(rolled.rng)
    expect({ ...chosen, mapId: 0 }).toEqual({ ...rolled, mapId: 0 })
  })

  it('picker-only maps never come up on the seed roll but remain choosable', () => {
    const meta = createMeta()
    expect(MAPS.length).toBeGreaterThan(RANDOM_MAP_POOL)
    for (let i = 0; i < 40; i++) {
      expect(createRun(meta, `pool-${i}`).mapId).toBeLessThan(RANDOM_MAP_POOL)
    }
    expect(createRun(meta, 'pool-x', MAPS.length - 1).mapId).toBe(MAPS.length - 1)
  })
})

describe('settleRun', () => {
  it('banks sparks and counts the run', () => {
    const run = createRun(createMeta(), 'settle')
    const ended = {
      ...run,
      phase: 'defeat' as const,
      wavesCleared: 7,
      kills: 40,
      sparksEarned: 85,
      damageByTower: { arrow: 900 },
      killsByEnemy: { runner: 40 },
    }
    const { meta, summary } = settleRun(createMeta(), ended)
    expect(summary).toEqual({
      outcome: 'defeat',
      wavesCleared: 7,
      kills: 40,
      sparks: 85 + 25, // +25: the First Blood achievement bounty
      damageByTower: { arrow: 900 },
      killsByEnemy: { runner: 40 },
      hpByWave: [],
      trials: [],
      unlocked: [{ id: 'first_blood', name: 'First Blood', sparks: 25 }],
    })
    expect(meta.sparks).toBe(110)
    expect(meta.totalSparks).toBe(110)
    expect(meta.runs).toBe(1)
    expect(meta.achievements).toEqual(['first_blood'])
    // Second settle of a similar run earns nothing new.
    const again = settleRun(meta, { ...ended, seed: 'again' })
    expect(again.summary.unlocked).toEqual([])
    expect(again.summary.sparks).toBe(85)
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
    expect(defeat).toBe(10 * 15 + Math.floor(40 / 12))
    expect(victory).toBe(defeat + 500)

    const boosted = computeSparks({ ...base, mods: { ...base.mods, sparkPct: 24 } })
    expect(boosted).toBe(Math.floor((defeat * 124) / 100))

    const siphoned = computeSparks({ ...base, relics: ['spark_siphon'] })
    expect(siphoned).toBe(Math.floor((defeat * 125) / 100))
  })
})

describe('ascension', () => {
  const winner = (meta = createMeta()) => {
    const run = createRun(meta, 'asc')
    const won = { ...run, phase: 'victory' as const, victoryClaimed: true, wavesCleared: 24, kills: 500, sparksEarned: 900 }
    return settleRun(meta, won).meta
  }

  it('victories are counted at settle, lifetime and per-cycle', () => {
    const meta = winner()
    expect(meta.victories).toBe(1)
    expect(meta.cycleVictories).toBe(1)
    expect(canAscend(meta)).toBe(true)
    expect(canAscend(createMeta())).toBe(false)
  })

  it('ascending burns the Spire Tree for embers and keeps the Ember Tree', () => {
    let meta = winner({ ...createMeta(), sparks: 5000 })
    meta = buyMetaUpgrade(meta, 'unlock_tesla').meta
    meta = buyMetaUpgrade(meta, 'tower_damage').meta
    expect(emberGainOnAscend(meta)).toBe(2) // 1 base + 1 victory this cycle
    const after = ascend(meta)
    expect(after.embers).toBe(2)
    expect(after.ascensions).toBe(1)
    expect(after.upgrades).toEqual({}) // spark tree burned
    expect(after.sparks).toBe(0) // no Ashen Legacy yet
    expect(after.cycleVictories).toBe(0)
    expect(after.victories).toBe(1) // lifetime record survives
    // Without a fresh victory, a second ascension is refused.
    expect(ascend(after)).toBe(after)
  })

  it('ember upgrades persist and apply to runs on top of the spark tree', () => {
    let meta = { ...winner(), embers: 10 }
    meta = buyEmberUpgrade(meta, 'kindled_arsenal').meta
    meta = buyEmberUpgrade(meta, 'eternal_core').meta
    meta = buyEmberUpgrade(meta, 'ashen_legacy').meta
    const run = createRun(meta, 'ember-run')
    expect(run.mods.damagePct).toBe(10)
    expect(run.spireMaxHp).toBe(STARTING_SPIRE_HP + 2)
    const after = ascend(meta)
    expect(after.emberUpgrades).toEqual(meta.emberUpgrades) // forever
    expect(after.sparks).toBe(300) // Ashen Legacy head start
    // Broke accounts cannot buy.
    expect(buyEmberUpgrade({ ...meta, embers: 0 }, 'ember_memory').ok).toBe(false)
  })

  it('Molten Vaults and Swift Sigils bend gold and ability cooldowns', () => {
    let meta = { ...winner(), embers: 20 }
    meta = buyEmberUpgrade(meta, 'molten_vaults').meta
    meta = buyEmberUpgrade(meta, 'swift_sigils').meta
    const plain = createRun(createMeta(), 'sigil-run')
    const run = createRun(meta, 'sigil-run')
    expect(run.mods.goldPct).toBe(plain.mods.goldPct + 15)
    expect(run.mods.abilityCdPct).toBe(10)
    // The discount lands when an ability actually goes on cooldown.
    const live = { ...cloneRun(run), phase: 'wave' as const, wave: 1 }
    const cast = step(live, [{ type: 'cast_ability', ability: 'frost_nova', cell: { cx: 5, cy: 5 } }]).state
    // −1: the cast's own tick already counted down once.
    expect(cast.abilities['frost_nova']).toBe(Math.floor((ABILITIES.frost_nova.cooldown * 90) / 100) - 1)
  })
})

describe('records', () => {
  it('settleRun tracks best wave, lifetime kills, and a capped history', () => {
    let meta = createMeta()
    for (let i = 0; i < 15; i++) {
      const run = createRun(meta, `rec-${i}`)
      const ended = {
        ...run,
        phase: 'defeat' as const,
        wavesCleared: i,
        kills: 10,
        sparksEarned: 5,
        damageByTower: {},
        killsByEnemy: { runner: 10 },
      }
      meta = settleRun(meta, ended).meta
    }
    expect(meta.bestWave).toBe(14)
    expect(meta.lifetimeKills).toBe(150)
    expect(meta.history).toHaveLength(HISTORY_LIMIT)
    expect(meta.history[0]!.wavesCleared).toBe(14) // newest first
  })

  it('per-map bests track each battlefield separately and never regress', () => {
    let meta = createMeta()
    const settle = (mapId: number, wavesCleared: number) => {
      const run = { ...createRun(meta, 'map-rec', mapId), phase: 'defeat' as const, wavesCleared, kills: 0, sparksEarned: 0 }
      meta = settleRun(meta, run).meta
    }
    settle(2, 9)
    settle(4, 12)
    settle(2, 6) // worse run on map 2 — the record stands
    expect(meta.bestWaveByMap).toEqual({ '2': 9, '4': 12 })
    expect(meta.bestWave).toBe(12)
    // Zero-progress runs leave no record entry.
    settle(1, 0)
    expect(meta.bestWaveByMap['1']).toBeUndefined()
  })
})
