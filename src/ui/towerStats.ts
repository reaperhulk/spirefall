import { towerTier } from '../data/content'
import { damageBreakdown, effectiveTowerCooldown, towerRangeOnBoard } from '../engine/combat'
import { getRunMap } from '../engine/mapgen'
import type { RunState, Tower } from '../engine/types'

// One source for the numbers the tooltip and the tower panel quote, so they
// can never disagree with each other or with the shot the engine rolls.
export function towerStats(state: RunState, tower: Tower) {
  const breakdown = damageBreakdown(state, tower)
  const baseCooldown = towerTier(tower.type, tower.tier).cooldown
  const cooldown = effectiveTowerCooldown(state, tower.type, tower.tier, tower.spec)
  const rate = 30 / cooldown
  // Capacitor: 3 normal + 1 triple per cycle = ×1.5 sustained.
  const sustained = tower.spec === 'capacitor' ? 1.5 : 1
  return {
    breakdown,
    rate,
    ratePct: cooldown < baseCooldown ? Math.round((baseCooldown / cooldown - 1) * 100) : 0,
    dps: Math.round(breakdown.effective * rate * sustained),
    range: towerRangeOnBoard(state, getRunMap(state), tower),
  }
}
