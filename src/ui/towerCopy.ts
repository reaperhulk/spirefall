// Shop and panel copy: the orderings the UI iterates, and the one-line
// descriptions that answer "what is this tower for?" and "what does the next
// tier actually buy?". Pure formatting over the content tables.
import { towerTier } from '../data/content'
import type { AbilityId, Targeting, TowerType } from '../engine/types'


export const TOWER_KEYS: TowerType[] = ['arrow', 'cannon', 'frost', 'tesla', 'sniper', 'mint', 'beacon', 'lance']

export const SPEEDS = [0, 1, 2, 3, 5, 10]


// One-line combat role, shown in tooltips and the tower panel.
export function towerRole(type: TowerType): string {
  if (type === 'arrow') return 'hits ground & air ✈ · 2× vs fliers'
  if (type === 'sniper') return 'hits ground & air ✈ · 1.5× vs elites, pierces shields'
  if (type === 'tesla') return 'hits ground & air ✈'
  if (type === 'beacon') return 'support — amplifies towers in range, never fires'
  if (type === 'lance') return 'hits ground & air ✈ · ramps +15%/hit on a held target'
  return 'ground only — cannot hit fliers'
}


// What the next tier actually buys, shown on the Upgrade button. Base
// stats only — relic/aura percentages multiply both sides equally, so
// the base delta is the honest one.
export function upgradeDelta(type: TowerType, tier: 1 | 2): string {
  const a = towerTier(type, tier)
  const b = towerTier(type, (tier + 1) as 2 | 3)
  if (type === 'mint') return `Yield ⛀${a.mintYield} → ⛀${b.mintYield} per cleared wave`
  if (type === 'beacon') return `Aura +${a.auraPct}% → +${b.auraPct}% damage`
  const parts = [
    `DMG ${a.damage} → ${b.damage}`,
    `${(30 / a.cooldown).toFixed(1)} → ${(30 / b.cooldown).toFixed(1)} shots/s`,
    `range ${(a.range / 1000).toFixed(1)} → ${(b.range / 1000).toFixed(1)}`,
  ]
  if (a.splashRadius !== undefined && a.splashRadius !== b.splashRadius) {
    parts.push(`splash ${((b.splashRadius ?? 0) / 1000).toFixed(1)}`)
  }
  if (a.chain !== undefined && a.chain !== b.chain) parts.push(`chains ${a.chain} → ${b.chain}`)
  if (a.slowFactor !== undefined && a.slowFactor !== b.slowFactor) {
    parts.push(`slows to ${b.slowFactor}% speed`)
  }
  return parts.join(' · ')
}

export const ABILITY_KEYS: AbilityId[] = ['meteor', 'frost_nova', 'gold_rush', 'bulwark']

export const TARGETING_OPTIONS: Targeting[] = ['first', 'last', 'strongest', 'weakest', 'nearest', 'elites']
