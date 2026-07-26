import type { MetaUpgradeId } from '../data/metaTree'
import { createMeta } from '../engine/meta'
import type { MetaState } from '../engine/types'
import { spendSparks } from './autoplay'
import { BOTS, type BotName } from './bots'

// Named, fully deterministic playthroughs used by the golden tests and the
// balance envelope. Changing engine behavior or content changes their
// outcomes — that's the point.

export const DEFAULT_BUY_PRIORITY: MetaUpgradeId[] = [
  // With per-type spire damage, surviving leaks is the first problem to buy
  // your way out of — Reinforced Core leads. Crit sits late: shields judge
  // shots by pre-crit weight, so raw damage breaks walls and crit only
  // multiplies what already lands.
  'spire_hp',
  'unlock_tesla',
  'tower_damage',
  'starting_gold',
  'unlock_mint',
  'unlock_beacon',
  'gold_income',
  'wave_skip',
  'unlock_gold_rush',
  'unlock_bulwark',
  'crit_chance',
  'spark_gain',
]

export function richMeta(sparks: number): MetaState {
  return spendSparks({ ...createMeta(), sparks }, DEFAULT_BUY_PRIORITY)
}

export interface Scenario {
  name: string
  seed: string
  bot: BotName
  meta: () => MetaState
  maxTicks: number
}

export const SCENARIOS: Scenario[] = [
  { name: 'afk-fresh', seed: 'golden-afk', bot: 'afk', meta: createMeta, maxTicks: 400_000 },
  { name: 'greedy-fresh', seed: 'golden-greedy', bot: 'greedy', meta: createMeta, maxTicks: 400_000 },
  { name: 'balanced-fresh', seed: 'golden-balanced', bot: 'balanced', meta: createMeta, maxTicks: 400_000 },
  { name: 'balanced-rich', seed: 'golden-rich', bot: 'balanced', meta: () => richMeta(2000), maxTicks: 600_000 },
  // The four above all play PASSIVELY — `balancedBot` never overcharges,
  // executes, beams, or takes a boon. So for the whole life of the
  // active-play layer (entries 192-199) nothing pinned it, and every trim to
  // it came back "free" because the goldens were measuring a player who
  // wasn't using it. These two watch the verbs: a fresh account and a banked
  // one, same seeds-and-shape as the passive pair so the diffs read side by
  // side. A change to overcharge, execute, the beam, boons, or the coin
  // sweep moves these and only these.
  { name: 'active-fresh', seed: 'golden-balanced', bot: 'active', meta: createMeta, maxTicks: 400_000 },
  { name: 'active-rich', seed: 'golden-rich', bot: 'active', meta: () => richMeta(2000), maxTicks: 600_000 },
]

export const BOT_FOR: typeof BOTS = BOTS
