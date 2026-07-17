import { enhanceCost, towerTier, TOWERS } from '../data/content'
import { densestEnemyCell } from '../engine/combat'
import { blockedGrid, canPlaceTower, cellCenter, distanceField, distSq, getMap, inBounds, pathFrom, sameCell } from '../engine/grid'
import type { CellPos, Command, RelicId, RunState, TowerType } from '../engine/types'

// Bots are deterministic pure functions of the state — no randomness, so a
// (seed, bot) pair always produces the same run. Called once per tick; they
// issue at most one command per tick to keep validation simple.
export type Bot = (state: RunState) => Command[]

// Buildable cells adjacent to the enemies' natural path, in walk order.
export function buildCandidates(state: RunState): CellPos[] {
  const map = getMap(state.mapId)
  const field = distanceField(map, blockedGrid(map, state.towers))
  const path = [map.spawn, ...pathFrom(map, field, map.spawn)]
  const seen = new Set<string>()
  const candidates: CellPos[] = []
  for (const cell of path) {
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ] as const) {
      const c = { cx: cell.cx + dx, cy: cell.cy + dy }
      const key = `${c.cx},${c.cy}`
      if (seen.has(key) || !inBounds(map, c)) continue
      seen.add(key)
      if (canPlaceTower(state, map, c).ok) candidates.push(c)
    }
  }
  return candidates
}

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

const RELIC_PRIORITY: RelicId[] = [
  'spark_siphon',
  'glass_cannon',
  'piercing_arrows',
  'keen_sights',
  'executioners_seal',
  'overcharge',
  'bounty_banner',
  'fortune_idol',
  'stoneskin',
  'heavy_powder',
  'winters_grip',
  'overclock',
  'mint_condition',
  'golden_touch',
]

const BUILD_RATIO: Record<TowerType, number> = { arrow: 5, cannon: 2, frost: 1, tesla: 3, sniper: 2, mint: 1 }

function pickBuildType(state: RunState): TowerType {
  // Early game is all about cheap single-target DPS.
  if (state.wave < 3) return 'arrow'
  // After that, build toward the ratio: pick the available type most below quota.
  const counts: Record<TowerType, number> = { arrow: 0, cannon: 0, frost: 0, tesla: 0, sniper: 0, mint: 0 }
  for (const t of state.towers) counts[t.type] += 1
  let best: TowerType = 'arrow'
  let bestScore = -Infinity
  for (const type of state.availableTowers) {
    const score = BUILD_RATIO[type] - counts[type] * (10 / BUILD_RATIO[type])
    if (score > bestScore) {
      best = type
      bestScore = score
    }
  }
  return best
}

// A competent heuristic player: mixes tower types, upgrades, uses abilities.
// This is the reference point of the balance envelope.
export const balancedBot: Bot = (state) => {
  const map = getMap(state.mapId)

  if (state.phase === 'build') {
    if (state.relicOffer !== null) {
      const pick = RELIC_PRIORITY.find((r) => state.relicOffer!.includes(r)) ?? state.relicOffer[0]!
      return [{ type: 'choose_relic', relic: pick }]
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
    if (upgrade !== null && upgrade.tier === 1 && state.towers.length >= 6) {
      return [{ type: 'upgrade_tower', id: upgrade.id }]
    }

    const targetTowers = Math.min(4 + state.wave, 24)
    if (state.towers.length < targetTowers) {
      const type = pickBuildType(state)
      const cost = towerTier(type, 1).cost
      if (state.gold >= cost) {
        const spot = buildCandidates(state)[0]
        if (spot) return [{ type: 'place_tower', tower: type, cell: spot }]
      }
    }
    if (upgrade !== null) return [{ type: 'upgrade_tower', id: upgrade.id }]

    // Patch the spire up between waves before banking gold.
    if (state.spireHp <= state.spireMaxHp - 2 && state.gold >= 150) return [{ type: 'repair_spire' }]

    // Everything built and maxed: sink gold into the cheapest enhancement.
    let enhance: { id: number; cost: number } | null = null
    for (const t of state.towers) {
      if (t.tier !== 3) continue
      const cost = enhanceCost(t.type, t.enhance)
      if (state.gold >= cost && (enhance === null || cost < enhance.cost)) enhance = { id: t.id, cost }
    }
    if (enhance !== null) return [{ type: 'upgrade_tower', id: enhance.id }]

    return [{ type: 'start_wave' }]
  }

  if (state.phase === 'wave') {
    // Emergency repairs mid-assault — but not in the early game, where gold
    // is better spent on towers than triage.
    if (state.wave >= 10 && state.spireHp < state.spireMaxHp / 2 && state.gold >= 100) {
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
  }

  return []
}

export const BOTS = { afk: afkBot, greedy: greedyBot, balanced: balancedBot } as const
export type BotName = keyof typeof BOTS
