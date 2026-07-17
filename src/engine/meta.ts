import {
  BASE_WAVE_BUDGET,
  hpGrowthPct,
  STARTING_GOLD,
  STARTING_SPIRE_HP,
  WAVE_BUDGET_GROWTH_PCT,
  WAVE_CLEAR_GOLD_BASE,
  WAVE_CLEAR_GOLD_PER_WAVE,
} from '../data/content'
import { MAPS } from '../data/maps'
import {
  META_CRIT_CHANCE_PCT_PER_LEVEL,
  META_GOLD_INCOME_PCT_PER_LEVEL,
  META_SPARK_GAIN_PCT_PER_LEVEL,
  META_SPIRE_HP_PER_LEVEL,
  META_STARTING_GOLD_PER_LEVEL,
  META_TOWER_DAMAGE_PCT_PER_LEVEL,
  META_WAVE_SKIP_PER_LEVEL,
  metaNode,
  type MetaUpgradeId,
} from '../data/metaTree'
import { ACHIEVEMENTS } from '../data/achievements'
import {
  EMBER_DAMAGE_PCT_PER_LEVEL,
  EMBER_LEGACY_SPARKS_PER_LEVEL,
  EMBER_SPARK_PCT_PER_LEVEL,
  EMBER_SPIRE_HP_PER_LEVEL,
  emberNode,
  type EmberUpgradeId,
} from '../data/emberTree'
import { deriveStream, nextInt } from './rng'
import type { AbilityId, MetaState, RunState, RunSummary, TowerType } from './types'

export function createMeta(): MetaState {
  return {
    schemaVersion: 1,
    sparks: 0,
    totalSparks: 0,
    runs: 0,
    victories: 0,
    cycleVictories: 0,
    embers: 0,
    ascensions: 0,
    upgrades: {},
    emberUpgrades: {},
    bestWave: 0,
    lifetimeKills: 0,
    achievements: [],
    history: [],
  }
}

// Keep the recent-run ledger small enough to live in the save forever.
export const HISTORY_LIMIT = 12

// --- Ascension: the prestige layer above the Spire Tree -------------------

export function emberLevel(meta: MetaState, id: EmberUpgradeId): number {
  return meta.emberUpgrades[id] ?? 0
}

export function emberUpgradeCost(meta: MetaState, id: EmberUpgradeId): number | null {
  const node = emberNode(id)
  const level = emberLevel(meta, id)
  if (level >= node.maxLevel) return null
  return node.costs[level]!
}

export function buyEmberUpgrade(meta: MetaState, id: EmberUpgradeId): { meta: MetaState; ok: boolean } {
  const cost = emberUpgradeCost(meta, id)
  if (cost === null || meta.embers < cost) return { meta, ok: false }
  return {
    meta: {
      ...meta,
      embers: meta.embers - cost,
      emberUpgrades: { ...meta.emberUpgrades, [id]: emberLevel(meta, id) + 1 },
    },
    ok: true,
  }
}

export function canAscend(meta: MetaState): boolean {
  return meta.cycleVictories > 0
}

// Each ascension pays 1 Ember plus 1 per victory won this cycle — winning
// repeatedly before ascending is a real strategy, not wasted effort.
export function emberGainOnAscend(meta: MetaState): number {
  return 1 + meta.cycleVictories
}

// Burn the Spire Tree down for Embers. Spark upgrades, unlocks, and banked
// sparks are wiped; ember upgrades, lifetime stats, and the Ember Tree stay.
export function ascend(meta: MetaState): MetaState {
  if (!canAscend(meta)) return meta
  return {
    ...meta,
    sparks: emberLevel(meta, 'ashen_legacy') * EMBER_LEGACY_SPARKS_PER_LEVEL,
    upgrades: {},
    cycleVictories: 0,
    embers: meta.embers + emberGainOnAscend(meta),
    ascensions: meta.ascensions + 1,
  }
}

export function metaLevel(meta: MetaState, id: MetaUpgradeId): number {
  return meta.upgrades[id] ?? 0
}

export function metaUpgradeCost(meta: MetaState, id: MetaUpgradeId): number | null {
  const node = metaNode(id)
  const level = metaLevel(meta, id)
  if (level >= node.maxLevel) return null
  return node.costs[level]!
}

export function buyMetaUpgrade(meta: MetaState, id: MetaUpgradeId): { meta: MetaState; ok: boolean; reason: string } {
  const cost = metaUpgradeCost(meta, id)
  if (cost === null) return { meta, ok: false, reason: 'already at max level' }
  if (meta.sparks < cost) return { meta, ok: false, reason: 'not enough sparks' }
  return {
    meta: {
      ...meta,
      sparks: meta.sparks - cost,
      upgrades: { ...meta.upgrades, [id]: metaLevel(meta, id) + 1 },
    },
    ok: true,
    reason: '',
  }
}

// Snapshot the meta tree into a fresh run. The run never reads meta again.
export function createRun(meta: MetaState, seed: string): RunState {
  const mapRoll = nextInt(deriveStream(seed, 'map'), 0, MAPS.length - 1)

  const availableTowers: TowerType[] = ['arrow', 'cannon', 'frost', 'sniper']
  if (metaLevel(meta, 'unlock_tesla') > 0) availableTowers.push('tesla')
  if (metaLevel(meta, 'unlock_mint') > 0) availableTowers.push('mint')

  const abilities: Record<string, number> = { meteor: 0, frost_nova: 0 }
  if (metaLevel(meta, 'unlock_gold_rush') > 0) abilities['gold_rush' satisfies AbilityId] = 0

  const spireHp =
    STARTING_SPIRE_HP +
    metaLevel(meta, 'spire_hp') * META_SPIRE_HP_PER_LEVEL +
    emberLevel(meta, 'eternal_core') * EMBER_SPIRE_HP_PER_LEVEL

  // Ashen Road: start further in, with the gold those waves would roughly
  // have paid (clear income plus ~a quarter of each wave's budget in
  // bounties). The trade: skipped waves never offer relics.
  const startWave = metaLevel(meta, 'wave_skip') * META_WAVE_SKIP_PER_LEVEL
  let waveBudget = 0
  let hpScalePct = 100
  let catchUpGold = 0
  for (let w = 1; w <= startWave; w++) {
    waveBudget = w === 1 ? BASE_WAVE_BUDGET : Math.floor((waveBudget * WAVE_BUDGET_GROWTH_PCT) / 100)
    if (w > 1) hpScalePct = Math.floor((hpScalePct * hpGrowthPct(w)) / 100)
    catchUpGold += WAVE_CLEAR_GOLD_BASE + w * WAVE_CLEAR_GOLD_PER_WAVE + Math.floor(waveBudget / 4)
  }

  return {
    schemaVersion: 1,
    seed,
    tick: 0,
    phase: 'build',
    rng: {
      waves: deriveStream(seed, 'waves'),
      combat: deriveStream(seed, 'combat'),
      relics: deriveStream(seed, 'relics'),
    },
    mapId: mapRoll.value,
    wave: startWave,
    startWave,
    wavesCleared: startWave,
    kills: 0,
    gold: STARTING_GOLD + metaLevel(meta, 'starting_gold') * META_STARTING_GOLD_PER_LEVEL + catchUpGold,
    spireHp,
    spireMaxHp: spireHp,
    waveBudget,
    hpScalePct,
    nextEntityId: 1,
    towers: [],
    enemies: [],
    pendingSpawns: [],
    abilities,
    goldRushTicks: 0,
    relics: [],
    relicOffer: null,
    relicRerolled: false,
    availableTowers,
    activeAffix: null,
    cataclysms: [],
    damageByTower: {},
    killsByEnemy: {},
    victoryClaimed: false,
    mods: {
      damagePct:
        metaLevel(meta, 'tower_damage') * META_TOWER_DAMAGE_PCT_PER_LEVEL +
        emberLevel(meta, 'kindled_arsenal') * EMBER_DAMAGE_PCT_PER_LEVEL,
      goldPct: metaLevel(meta, 'gold_income') * META_GOLD_INCOME_PCT_PER_LEVEL,
      sparkPct:
        metaLevel(meta, 'spark_gain') * META_SPARK_GAIN_PCT_PER_LEVEL +
        emberLevel(meta, 'ember_memory') * EMBER_SPARK_PCT_PER_LEVEL,
      critChancePct: metaLevel(meta, 'crit_chance') * META_CRIT_CHANCE_PCT_PER_LEVEL,
    },
    sparksEarned: 0,
  }
}

// Bank a finished run's Sparks into the meta state.
export function settleRun(meta: MetaState, run: RunState): { meta: MetaState; summary: RunSummary } {
  if (run.phase !== 'defeat' && run.phase !== 'victory') {
    throw new Error(`settleRun: run is not over (phase=${run.phase})`)
  }
  // Achievements: first run to satisfy a predicate earns its spark bounty.
  const unlocked = ACHIEVEMENTS.filter((a) => !meta.achievements.includes(a.id) && a.earned(run, meta)).map(
    (a) => ({ id: a.id, name: a.name, sparks: a.sparks }),
  )
  const bounty = unlocked.reduce((sum, a) => sum + a.sparks, 0)
  const summary: RunSummary = {
    outcome: run.phase,
    wavesCleared: run.wavesCleared,
    kills: run.kills,
    sparks: run.sparksEarned + bounty,
    damageByTower: { ...run.damageByTower },
    killsByEnemy: { ...run.killsByEnemy },
    unlocked,
  }
  const won = run.phase === 'victory' ? 1 : 0
  return {
    meta: {
      ...meta,
      sparks: meta.sparks + summary.sparks,
      totalSparks: meta.totalSparks + summary.sparks,
      runs: meta.runs + 1,
      victories: meta.victories + won,
      cycleVictories: meta.cycleVictories + won,
      bestWave: Math.max(meta.bestWave, summary.wavesCleared),
      achievements: [...meta.achievements, ...unlocked.map((a) => a.id)],
      lifetimeKills: meta.lifetimeKills + summary.kills,
      history: [
        { outcome: summary.outcome, wavesCleared: summary.wavesCleared, kills: summary.kills, sparks: summary.sparks },
        ...meta.history,
      ].slice(0, HISTORY_LIMIT),
    },
    summary,
  }
}
