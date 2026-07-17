// The Ember Tree: the ascension layer above the Spire Tree. Ascending wipes
// spark upgrades and banks Embers; these upgrades survive every ascension and
// compound with (not replace) the spark tree. Applied by createRun and ascend.

export type EmberUpgradeId = 'kindled_arsenal' | 'eternal_core' | 'ember_memory' | 'ashen_legacy'

export interface EmberNodeDef {
  id: EmberUpgradeId
  name: string
  description: string
  maxLevel: number
  costs: number[] // embers per level
}

export const EMBER_TREE: EmberNodeDef[] = [
  {
    id: 'kindled_arsenal',
    name: 'Kindled Arsenal',
    description: '+10% tower damage per level — forever, across ascensions.',
    maxLevel: 5,
    costs: [1, 2, 3, 5, 8],
  },
  {
    id: 'eternal_core',
    name: 'Eternal Core',
    description: '+2 Spire max HP per level — forever.',
    maxLevel: 5,
    costs: [1, 2, 3, 5, 8],
  },
  {
    id: 'ember_memory',
    name: 'Ember Memory',
    description: '+25% Sparks earned per level — forever.',
    maxLevel: 4,
    costs: [2, 3, 5, 8],
  },
  {
    id: 'ashen_legacy',
    name: 'Ashen Legacy',
    description: 'Begin each new cycle with 300 banked Sparks per level.',
    maxLevel: 3,
    costs: [2, 4, 7],
  },
]

export const EMBER_DAMAGE_PCT_PER_LEVEL = 10
export const EMBER_SPIRE_HP_PER_LEVEL = 2
export const EMBER_SPARK_PCT_PER_LEVEL = 25
export const EMBER_LEGACY_SPARKS_PER_LEVEL = 300

export function emberNode(id: EmberUpgradeId): EmberNodeDef {
  const node = EMBER_TREE.find((n) => n.id === id)
  if (!node) throw new Error(`unknown ember upgrade: ${id}`)
  return node
}
