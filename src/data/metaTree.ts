// The Spire Tree: permanent upgrades bought with Sparks between runs.
// Effects are applied by createRun (src/engine/meta.ts).

export type MetaUpgradeId =
  | 'starting_gold'
  | 'spire_hp'
  | 'tower_damage'
  | 'gold_income'
  | 'spark_gain'
  | 'unlock_tesla'
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
    maxLevel: 5,
    costs: [20, 40, 80, 160, 320],
  },
  {
    id: 'spire_hp',
    name: 'Reinforced Core',
    description: '+25 Spire max HP per level.',
    maxLevel: 5,
    costs: [25, 50, 100, 200, 400],
  },
  {
    id: 'tower_damage',
    name: 'Honed Arsenal',
    description: '+6% tower damage per level.',
    maxLevel: 10,
    costs: [30, 60, 110, 200, 340, 560, 900, 1400, 2100, 3000],
  },
  {
    id: 'gold_income',
    name: 'Tithe of the Fallen',
    description: '+10% gold from kills and wave clears per level.',
    maxLevel: 5,
    costs: [40, 80, 150, 280, 500],
  },
  {
    id: 'spark_gain',
    name: 'Ember Memory',
    description: '+12% Sparks earned per level.',
    maxLevel: 6,
    costs: [50, 100, 200, 400, 800, 1600],
  },
  {
    id: 'unlock_tesla',
    name: 'Storm Coils',
    description: 'Unlock the Tesla tower.',
    maxLevel: 1,
    costs: [120],
  },
  {
    id: 'unlock_gold_rush',
    name: 'Prospector’s Charm',
    description: 'Unlock the Gold Rush ability.',
    maxLevel: 1,
    costs: [100],
  },
]

export const META_STARTING_GOLD_PER_LEVEL = 30
export const META_SPIRE_HP_PER_LEVEL = 25
export const META_TOWER_DAMAGE_PCT_PER_LEVEL = 6
export const META_GOLD_INCOME_PCT_PER_LEVEL = 10
export const META_SPARK_GAIN_PCT_PER_LEVEL = 12

export function metaNode(id: MetaUpgradeId): MetaNodeDef {
  const node = META_TREE.find((n) => n.id === id)
  if (!node) throw new Error(`unknown meta upgrade: ${id}`)
  return node
}
