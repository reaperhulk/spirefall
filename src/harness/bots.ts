import { enhanceCost, TOWER_SPECS, towerTier, TOWERS } from '../data/content'
import { densestEnemyCell } from '../engine/combat'
import { cellCenter, distSq, sameCell } from '../engine/grid'
import { getRunMap } from '../engine/mapgen'
import type { Command, RelicId, RunState, Targeting, TowerType } from '../engine/types'
import { buildCandidates, pickBuildCell, type PlacementStrategy } from './placement'

// Bots are deterministic pure functions of the state — no randomness, so a
// (seed, bot) pair always produces the same run. Called once per tick; they
// issue at most one command per tick to keep validation simple.
export type Bot = (state: RunState) => Command[]

// Placement geometry lives in placement.ts; re-exported for existing users.
export { buildCandidates } from './placement'

// Does nothing but send waves. The floor of the difficulty envelope.
export const afkBot: Bot = (state) => {
  if (state.phase === 'build') return [{ type: 'start_wave' }]
  return []
}

// Max cheap DPS, no plan: arrow towers until broke, then send the wave.
export const greedyBot: Bot = (state) => {
  if (state.phase !== 'build') return []
  if (state.relicOffer !== null) return [{ type: 'choose_relic', relic: state.relicOffer[0]! }]
  if (state.gold >= TOWERS.arrow.tiers[0].cost) {
    const spot = buildCandidates(state)[0]
    if (spot) return [{ type: 'place_tower', tower: 'arrow', cell: spot }]
  }
  return [{ type: 'start_wave' }]
}

export const RELIC_PRIORITY: RelicId[] = [
  'colossus',
  // Transformative picks are COMP-DEPENDENT: the reference comp leans
  // cannon/sniper, so Cinder Shells and Deadeye slot right below the
  // universal +25%; the rest sit where their tower density justifies.
  'cinder_shells',
  'deadeye_sigil',
  'spark_siphon',
  'glass_cannon',
  'ricochet_strings',
  'last_stand',
  'shatter',
  'piercing_arrows',
  'quickdraw',
  'longsight',
  'keen_sights',
  'executioners_seal',
  'storm_coils',
  'overcharge',
  'echo_chamber',
  'bounty_banner',
  'fortune_idol',
  'deep_pockets',
  'field_medicine',
  'stoneskin',
  'heavy_powder',
  'winters_grip',
  'overclock',
  'mint_condition',
  'shatterheart',
  'golden_ledger',
  'prism_lens',
  'soul_harvest',
  'golden_touch',
]

// The reference comp is phase-aware: the opening horde is cheap chip fodder
// (arrows shred it, cannons are slow overkill), but armor scales on the hp
// curve, so from the midgame the competent answer leans on cannons and
// snipers — heavy hits barely feel flat reduction, rapid fire bleeds it.
const EARLY_RATIO: Record<TowerType, number> = { arrow: 5, cannon: 2, frost: 1, tesla: 3, sniper: 2, mint: 1, beacon: 1 }
const LATE_RATIO: Record<TowerType, number> = { arrow: 4, cannon: 4, frost: 1, tesla: 2, sniper: 3, mint: 1, beacon: 1 }
const HEAVY_META_WAVE = 9 // armor starts to bite; the build plan pivots

// Transformative relics reward building AROUND them — that's their point.
// When the bot owns one, its comp leans toward that relic's tower.
const RELIC_LEAN: Partial<Record<RelicId, TowerType>> = {
  cinder_shells: 'cannon',
  deadeye_sigil: 'sniper',
  ricochet_strings: 'arrow',
  storm_coils: 'tesla',
  shatterheart: 'frost',
}

function pickBuildType(state: RunState): TowerType {
  // Early game is all about cheap single-target DPS.
  if (state.wave < 3) return 'arrow'
  // After that, build toward the ratio: pick the available type most below quota.
  const base = state.wave < HEAVY_META_WAVE ? EARLY_RATIO : LATE_RATIO
  let ratio = base
  for (const [relic, type] of Object.entries(RELIC_LEAN) as [RelicId, TowerType][]) {
    if (state.relics.includes(relic)) {
      if (ratio === base) ratio = { ...base }
      ratio[type] += 2
    }
  }
  const counts: Record<TowerType, number> = { arrow: 0, cannon: 0, frost: 0, tesla: 0, sniper: 0, mint: 0, beacon: 0 }
  for (const t of state.towers) counts[t.type] += 1
  let best: TowerType = 'arrow'
  let bestScore = -Infinity
  for (const type of state.availableTowers) {
    const score = ratio[type] - counts[type] * (10 / ratio[type])
    if (score > bestScore) {
      best = type
      bestScore = score
    }
  }
  return best
}

// Tunable thresholds for the shared bot machinery. The named bots use the
// defaults; the build fuzzer (src/harness/fuzz.ts) searches over them.
export interface BuildKnobs {
  upgradeAtTowers: number // start tier-upgrading once this many towers exist
  // Tier-3 path: one index for every type, or a per-type map (fuzzer).
  specChoice: 0 | 1 | Partial<Record<TowerType, 0 | 1>>
  targetBase: number // desired tower count = base + perWave·wave, capped
  targetPerWave: number
  targetMax: number
  repairDeficit: number // build-phase repair when missing ≥ this much HP...
  repairMinGold: number // ...and holding at least this much gold
  enhanceStrategy: 'cheapest' | TowerType // which tier-3 tower(s) to enhance
  enhanceFocus: 'spread' | 'focus' // spread = cheapest next; focus = max ONE tower out
  placement: PlacementStrategy // where towers go (see placement.ts)
  targeting: Partial<Record<TowerType, Targeting>> | null // per-type mode, null = engine default
  relicPriority: RelicId[]
}

export const DEFAULT_KNOBS: BuildKnobs = {
  upgradeAtTowers: 6,
  specChoice: 0,
  targetBase: 4,
  targetPerWave: 1,
  targetMax: 24,
  repairDeficit: 2,
  repairMinGold: 150,
  enhanceStrategy: 'cheapest',
  enhanceFocus: 'spread',
  placement: 'pathAdjacent',
  targeting: null,
  relicPriority: RELIC_PRIORITY,
}

// Build-phase economy shared by the competent bots: relic pick, tier
// upgrades, expansion via pickType, repairs, then enhancements.
export function buildActions(
  state: RunState,
  pickType: (s: RunState) => TowerType,
  knobs: BuildKnobs = DEFAULT_KNOBS,
): Command[] {
  if (state.relicOffer !== null) {
    const pick = knobs.relicPriority.find((r) => state.relicOffer!.includes(r)) ?? state.relicOffer[0]!
    return [{ type: 'choose_relic', relic: pick }]
  }

  // Targeting doctrine first — it's free, one tower per tick.
  if (knobs.targeting) {
    for (const t of state.towers) {
      const want = knobs.targeting[t.type]
      if (want && t.targeting !== want) return [{ type: 'set_targeting', id: t.id, targeting: want }]
    }
  }

  // Once a small killbox exists, tier-2 upgrades beat new tier-1 towers.
  let upgrade: { id: number; cost: number; tier: number } | null = null
  for (const t of state.towers) {
    if (t.tier >= 3) continue
    const cost = towerTier(t.type, (t.tier + 1) as 2 | 3).cost
    if (state.gold >= cost && (upgrade === null || t.tier < upgrade.tier)) {
      upgrade = { id: t.id, cost, tier: t.tier }
    }
  }
  if (upgrade !== null && upgrade.tier === 1 && state.towers.length >= knobs.upgradeAtTowers) {
    return [{ type: 'upgrade_tower', id: upgrade.id }]
  }

  const targetTowers = Math.min(knobs.targetBase + state.wave * knobs.targetPerWave, knobs.targetMax)
  if (state.towers.length < targetTowers) {
    const type = pickType(state)
    const cost = towerTier(type, 1).cost
    if (state.gold >= cost) {
      const spot = pickBuildCell(state, knobs.placement)
      if (spot) return [{ type: 'place_tower', tower: type, cell: spot }]
    }
  }
  if (upgrade !== null) return [{ type: 'upgrade_tower', id: upgrade.id }]

  // Tier-3 towers commit to a path once the gold is there.
  for (const t of state.towers) {
    if (t.tier !== 3 || t.spec !== null) continue
    const options = TOWER_SPECS[t.type]
    if (!options) continue
    const choice = typeof knobs.specChoice === 'number' ? knobs.specChoice : (knobs.specChoice[t.type] ?? 0)
    const pick = options[choice]!
    if (state.gold >= pick.cost) return [{ type: 'specialize_tower', id: t.id, spec: pick.id }]
  }

  // Patch the spire up between waves before banking gold.
  if (state.spireHp <= state.spireMaxHp - knobs.repairDeficit && state.gold >= knobs.repairMinGold) {
    return [{ type: 'repair_spire' }]
  }

  // Everything built and maxed: sink gold into an enhancement. 'spread'
  // feeds whichever eligible tower is cheapest next (round-robins as costs
  // scale); 'focus' always feeds the SAME tower — the most-enhanced one —
  // expressing the max-one-tower-out archetype the spread rule cannot.
  let enhance: { id: number; cost: number; level: number } | null = null
  for (const t of state.towers) {
    if (t.tier !== 3) continue
    if (knobs.enhanceStrategy !== 'cheapest' && t.type !== knobs.enhanceStrategy) continue
    const cost = enhanceCost(t.type, t.enhance)
    const better =
      enhance === null || (knobs.enhanceFocus === 'focus' ? t.enhance > enhance.level : cost < enhance.cost)
    if (better) enhance = { id: t.id, cost, level: t.enhance }
  }
  if (enhance !== null && state.gold >= enhance.cost) return [{ type: 'upgrade_tower', id: enhance.id }]

  return [{ type: 'start_wave' }]
}

// Wave-phase triage and ability usage shared by the competent bots.
export function waveActions(state: RunState, waveRepairPct = 50): Command[] {
  const map = getRunMap(state)
  // Emergency repairs mid-assault — but not in the early game, where gold
  // is better spent on towers than triage.
  if (
    waveRepairPct > 0 &&
    state.wave >= 10 &&
    state.spireHp < (state.spireMaxHp * waveRepairPct) / 100 &&
    state.gold >= 100
  ) {
    return [{ type: 'repair_spire' }]
  }
  const alive = state.enemies.length
  if ((state.abilities['meteor'] ?? 1) === 0 && alive >= 6) {
    const cell = densestEnemyCell(state, 1500)
    if (cell) return [{ type: 'cast_ability', ability: 'meteor', cell }]
  }
  if ((state.abilities['frost_nova'] ?? 1) === 0 && alive >= 5) {
    const spireCenter = cellCenter(map.spire)
    const threats = state.enemies.filter((e) => distSq(e.pos, spireCenter) <= 6000 * 6000)
    if (threats.length >= 5) {
      const nearest = threats.reduce((a, b) => (distSq(a.pos, spireCenter) <= distSq(b.pos, spireCenter) ? a : b))
      const cell = { cx: Math.floor(nearest.pos.x / 1000), cy: Math.floor(nearest.pos.y / 1000) }
      if (!sameCell(cell, map.spire)) return [{ type: 'cast_ability', ability: 'frost_nova', cell }]
    }
  }
  if ((state.abilities['gold_rush'] ?? 1) === 0 && alive >= 10) {
    return [{ type: 'cast_ability', ability: 'gold_rush', cell: map.spawn }]
  }
  if ((state.abilities['bulwark'] ?? 1) === 0 && state.spireHp <= Math.max(2, state.spireMaxHp / 3) && alive >= 4) {
    return [{ type: 'cast_ability', ability: 'bulwark', cell: map.spire }]
  }
  return []
}

// A competent heuristic player: mixes tower types, upgrades, uses abilities.
// This is the reference point of the balance envelope.
export const balancedBot: Bot = (state) => {
  if (state.phase === 'build') return buildActions(state, pickBuildType)
  if (state.phase === 'wave') return waveActions(state)
  return []
}

// The degenerate strategy a playtester actually won with: nothing but arrow
// towers, buffed by meta damage and gold. Scaling shields exist to kill it —
// the balance envelope pins this bot as a LOSER at any realistic spark depth.
export const arrowOnlyBot: Bot = (state) => {
  if (state.phase === 'build') return buildActions(state, () => 'arrow')
  if (state.phase === 'wave') return waveActions(state)
  return []
}

export const BOTS = { afk: afkBot, greedy: greedyBot, balanced: balancedBot, arrowOnly: arrowOnlyBot } as const
export type BotName = keyof typeof BOTS
