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
import { deriveStream, nextInt } from './rng'
import type { AbilityId, MetaState, RunState, RunSummary, TowerType } from './types'

export function createMeta(): MetaState {
  return { schemaVersion: 1, sparks: 0, totalSparks: 0, runs: 0, upgrades: {} }
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

  const spireHp = STARTING_SPIRE_HP + metaLevel(meta, 'spire_hp') * META_SPIRE_HP_PER_LEVEL

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
    availableTowers,
    activeAffix: null,
    victoryClaimed: false,
    mods: {
      damagePct: metaLevel(meta, 'tower_damage') * META_TOWER_DAMAGE_PCT_PER_LEVEL,
      goldPct: metaLevel(meta, 'gold_income') * META_GOLD_INCOME_PCT_PER_LEVEL,
      sparkPct: metaLevel(meta, 'spark_gain') * META_SPARK_GAIN_PCT_PER_LEVEL,
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
  const summary: RunSummary = {
    outcome: run.phase,
    wavesCleared: run.wavesCleared,
    kills: run.kills,
    sparks: run.sparksEarned,
  }
  return {
    meta: {
      ...meta,
      sparks: meta.sparks + summary.sparks,
      totalSparks: meta.totalSparks + summary.sparks,
      runs: meta.runs + 1,
    },
    summary,
  }
}
