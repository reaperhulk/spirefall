// The Spire Tree: permanent upgrades bought with Sparks between runs.
// Effects are applied by createRun (src/engine/meta.ts).
//
// The tree is deliberately DEEP: in-run difficulty grows geometrically, so
// bridging the gap between the fresh wall (~wave 10) and victory (wave 26)
// takes many runs of compounding investment. This is the rogue-lite engine.

export type MetaUpgradeId =
  | 'starting_gold'
  | 'spire_hp'
  | 'tower_damage'
  | 'crit_chance'
  | 'gold_income'
  | 'spark_gain'
  | 'wave_skip'
  | 'magnet_reach'
  | 'spire_magnet'
  | 'unlock_tesla'
  | 'unlock_mint'
  | 'unlock_beacon'
  | 'unlock_gold_rush'
  | 'unlock_bulwark'
  | 'unlock_lance'

export interface MetaNodeDef {
  id: MetaUpgradeId
  name: string
  description: string
  maxLevel: number
  costs: number[] // sparks per level, length === maxLevel
}

export const META_TREE: MetaNodeDef[] = [
  {
    id: 'starting_gold',
    name: 'War Chest',
    description: '+30 starting gold per level.',
    maxLevel: 8,
    costs: [20, 32, 50, 80, 130, 210, 340, 540],
  },
  {
    id: 'spire_hp',
    name: 'Reinforced Core',
    description: '+2 Spire max HP per level.',
    maxLevel: 12,
    costs: [25, 38, 57, 85, 130, 190, 290, 430, 650, 970, 1460, 2190],
  },
  {
    id: 'tower_damage',
    name: 'Honed Arsenal',
    description: '+8% tower damage per level.',
    maxLevel: 25,
    costs: [
      30, 41, 55, 74, 100, 135, 182, 246, 332, 448, 605, 817, 1103, 1489, 2010, 2714, 3664, 4946, 6677, 9014,
      12169, 16428, 22178, 29940, 40419,
    ],
  },
  {
    id: 'crit_chance',
    name: 'Killer Instinct',
    description: '+2% critical hit chance per level. Crits deal double damage.',
    maxLevel: 12,
    costs: [35, 50, 72, 104, 150, 216, 311, 448, 645, 929, 1338, 1927],
  },
  {
    id: 'gold_income',
    name: 'Tithe of the Fallen',
    description: '+8% gold from kills, wave clears, and mints per level.',
    maxLevel: 12,
    costs: [40, 60, 90, 135, 203, 304, 456, 684, 1026, 1539, 2309, 3463],
  },
  {
    id: 'spark_gain',
    name: 'Ember Memory',
    description: '+10% Sparks earned per level.',
    maxLevel: 10,
    costs: [50, 80, 128, 205, 328, 524, 839, 1342, 2147, 3436],
  },
  {
    id: 'wave_skip',
    name: 'Ashen Road',
    description: 'Start 2 waves further in per level, with catch-up gold. (Skipped waves offer no relics.)',
    maxLevel: 5,
    costs: [200, 500, 1200, 2800, 6000],
  },
  {
    id: 'unlock_tesla',
    name: 'Storm Coils',
    description: 'Unlock the Tesla tower.',
    maxLevel: 1,
    costs: [120],
  },
  {
    id: 'unlock_mint',
    name: 'Deep Vaults',
    description: 'Unlock the Mint — a tower that earns gold every cleared wave.',
    maxLevel: 1,
    costs: [150],
  },
  {
    id: 'unlock_beacon',
    name: 'Signal Fires',
    description: 'Unlock the Beacon — a pylon that amplifies nearby towers.',
    maxLevel: 1,
    costs: [130],
  },
  {
    id: 'unlock_gold_rush',
    name: 'Prospector\u2019s Charm',
    description: 'Unlock the Gold Rush ability.',
    maxLevel: 1,
    costs: [100],
  },
  {
    id: 'unlock_lance',
    name: 'Duelist Doctrine',
    description: 'Unlock the Lance — its shots ramp against a sustained target. Bosses hate it.',
    maxLevel: 1,
    costs: [180],
  },
  {
    id: 'magnet_reach',
    name: 'Collector\u2019s Reach',
    description: 'Widen the coin-collection radius around your cursor or finger.',
    maxLevel: 3,
    costs: [40, 90, 160],
  },
  {
    id: 'spire_magnet',
    name: 'Spire Magnet',
    description: 'The Spire pulls nearby coins home by itself — each level widens its reach.',
    maxLevel: 3,
    costs: [200, 400, 650],
  },
  {
    id: 'unlock_bulwark',
    name: 'Aegis Sigil',
    description: 'Unlock Bulwark — 5 seconds of Spire invulnerability.',
    maxLevel: 1,
    costs: [250],
  },
]

export const META_STARTING_GOLD_PER_LEVEL = 30
export const META_SPIRE_HP_PER_LEVEL = 2
export const META_TOWER_DAMAGE_PCT_PER_LEVEL = 8
export const META_CRIT_CHANCE_PCT_PER_LEVEL = 2
export const META_GOLD_INCOME_PCT_PER_LEVEL = 8
export const META_SPARK_GAIN_PCT_PER_LEVEL = 10
// Consolidation-era note: skipping drops a bare board into waves of tanky
// singles, so the skip is only honest if the catch-up bankroll (meta.ts)
// can stand up a real opening army — the depth of the skip itself is fine.
export const META_WAVE_SKIP_PER_LEVEL = 2

export function metaNode(id: MetaUpgradeId): MetaNodeDef {
  const node = META_TREE.find((n) => n.id === id)
  if (!node) throw new Error(`unknown meta upgrade: ${id}`)
  return node
}

// The cumulative effect of a node AT a given level, for "now → after next
// level" displays. Returns null for binary unlocks, where a running total
// adds nothing over the description.
export function metaNodeEffect(id: MetaUpgradeId, level: number): string | null {
  switch (id) {
    case 'starting_gold':
      return `+${level * META_STARTING_GOLD_PER_LEVEL} starting gold`
    case 'spire_hp':
      return `+${level * META_SPIRE_HP_PER_LEVEL} max HP`
    case 'tower_damage':
      return `+${level * META_TOWER_DAMAGE_PCT_PER_LEVEL}% damage`
    case 'crit_chance':
      return `${level * META_CRIT_CHANCE_PCT_PER_LEVEL}% crit chance`
    case 'gold_income':
      return `+${level * META_GOLD_INCOME_PCT_PER_LEVEL}% gold`
    case 'spark_gain':
      return `+${level * META_SPARK_GAIN_PCT_PER_LEVEL}% sparks`
    case 'wave_skip':
      return `start at wave ${1 + level * META_WAVE_SKIP_PER_LEVEL}`
    case 'magnet_reach':
      return `+${(level * 500) / 1000} cells of pickup reach`
    case 'spire_magnet':
      return level === 0 ? null : `auto-collects within ${(level * 2500) / 1000} cells of the Spire`
    default:
      return null
  }
}
