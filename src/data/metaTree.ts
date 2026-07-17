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
  | 'gold_income'
  | 'spark_gain'
  | 'wave_skip'
  | 'unlock_tesla'
  | 'unlock_mint'
  | 'unlock_gold_rush'

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
    id: 'unlock_gold_rush',
    name: 'Prospector\u2019s Charm',
    description: 'Unlock the Gold Rush ability.',
    maxLevel: 1,
    costs: [100],
  },
]

export const META_STARTING_GOLD_PER_LEVEL = 30
export const META_SPIRE_HP_PER_LEVEL = 2
export const META_TOWER_DAMAGE_PCT_PER_LEVEL = 8
export const META_GOLD_INCOME_PCT_PER_LEVEL = 8
export const META_SPARK_GAIN_PCT_PER_LEVEL = 10
export const META_WAVE_SKIP_PER_LEVEL = 2

export function metaNode(id: MetaUpgradeId): MetaNodeDef {
  const node = META_TREE.find((n) => n.id === id)
  if (!node) throw new Error(`unknown meta upgrade: ${id}`)
  return node
}
