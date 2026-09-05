// The Spire Tree: permanent upgrades bought with Sparks between runs.
// Effects are applied by createRun (src/engine/meta.ts).
//
// The tree is deliberately DEEP: in-run difficulty grows geometrically, so
// bridging the gap between the fresh wall (~wave 10) and victory (wave 24)
// takes many runs of compounding investment. This is the rogue-lite engine.
//
// It is also a TREE and not a list (see docs/spire-tree-redesign.md). Three
// branches hang off the Spire, matching the three things the game already
// measures about a player: Iron kills, Gold pays, Ash is what you do with
// your hands. Within a branch, tiers open by GATE — spend enough in this
// branch and the next tier unlocks — and a tier may offer KEYSTONES, which
// are mutually exclusive and change how you play rather than by how much.
//
// The list had no choice in it, only an order, and DEFAULT_BUY_PRIORITY
// already knew the answer; at 20k sparks every account was the same account.

export type MetaUpgradeId =
  | 'starting_gold'
  | 'spire_hp'
  | 'tower_damage'
  | 'tower_damage_2'
  | 'tower_damage_3'
  | 'crit_chance'
  | 'gold_income'
  | 'spark_gain'
  | 'wave_skip'
  | 'magnet_reach'
  | 'spire_magnet'
  | 'quick_hands'
  | 'steady_aim'
  | 'ks_patron'
  | 'ks_treasury'
  | 'ks_executioner'
  | 'ks_conductor'
  | 'ks_glassforge'
  | 'ks_bastion'
  | 'unlock_tesla'
  | 'unlock_mint'
  | 'unlock_beacon'
  | 'unlock_gold_rush'
  | 'unlock_bulwark'
  | 'unlock_lance'

export type MetaBranch = 'iron' | 'gold' | 'ash'
export const META_BRANCHES: readonly MetaBranch[] = ['iron', 'gold', 'ash']

export const BRANCH_NAMES: Record<MetaBranch, string> = {
  iron: 'Iron',
  gold: 'Gold',
  ash: 'Ash',
}

export const BRANCH_BLURBS: Record<MetaBranch, string> = {
  iron: 'Things that kill.',
  gold: 'Things that pay.',
  ash: 'Things you do with your hands.',
}

// Sparks that must already be SPENT inside a branch before its tier opens.
// Tier 1 is always free — a fresh account can shop in all three branches.
// Reachability is not eyeballed: metaTree.test.ts proves every gate can be
// paid for out of the tiers below it, so no node is ever stranded.
export const BRANCH_GATES: Record<1 | 2 | 3, number> = { 1: 0, 2: 400, 3: 2000 }

export interface MetaNodeDef {
  id: MetaUpgradeId
  name: string
  description: string
  maxLevel: number
  costs: number[] // sparks per level, length === maxLevel
  branch: MetaBranch
  tier: 1 | 2 | 3
  // Keystones are exclusive within their (branch, tier) group: taking one
  // locks its rivals until you respec, which is free between runs.
  keystone?: boolean
  // A short label for the graph view — full names collide at node spacing.
  short: string
  // Authored graph coordinates, 0-100 in both axes. NEVER auto-layout: hand
  // coordinates are deterministic, reviewable in a diff, and let the shape
  // carry meaning. `compact` is the phone layout (branches stacked).
  wide: { x: number; y: number }
  compact: { x: number; y: number }
  // The node this one hangs off. Undefined means it hangs off the Spire
  // itself. Edges are authored, not inferred, so the graph can be SHAPED —
  // and so the purchase animation knows exactly which line to run down.
  parent?: MetaUpgradeId
}

// Honed Edge is one 25-level slider split into three veins at three depths,
// so "buy damage" means "walk a path" and the path costs you position
// elsewhere. The levels and the cost entries are the ORIGINAL ones in
// original order (8 + 8 + 9 = 25), so the damage ceiling and the total price
// of reaching it are unchanged — only where they sit in the tree moved.
export const META_TREE: MetaNodeDef[] = [
  // --- IRON: things that kill ---------------------------------------------
  {
    id: 'tower_damage',
    name: 'Honed Edge',
    description: '+8% tower damage per level.',
    maxLevel: 8,
    costs: [30, 41, 55, 74, 100, 135, 182, 246],
    branch: 'iron',
    tier: 1,
    short: 'Edge I',
    wide: { x: 10, y: 72 },
    compact: { x: 18, y: 15 },
  },
  {
    id: 'spire_hp',
    name: 'Reinforced Core',
    description: '+2 Spire max HP per level.',
    maxLevel: 12,
    costs: [25, 38, 57, 85, 130, 190, 290, 430, 650, 970, 1460, 2190],
    branch: 'iron',
    tier: 1,
    short: 'Core',
    wide: { x: 21, y: 76 },
    compact: { x: 50, y: 15 },
  },
  {
    id: 'unlock_tesla',
    name: 'Storm Coils',
    description: 'Unlock the Tesla tower.',
    maxLevel: 1,
    costs: [120],
    branch: 'iron',
    tier: 1,
    short: 'Tesla',
    wide: { x: 32, y: 72 },
    compact: { x: 82, y: 15 },
  },
  {
    id: 'tower_damage_2',
    parent: 'tower_damage',
    name: 'Honed Edge II',
    description: '+8% tower damage per level.',
    maxLevel: 8,
    costs: [332, 448, 605, 817, 1103, 1489, 2010, 2714],
    branch: 'iron',
    tier: 2,
    short: 'Edge II',
    wide: { x: 10, y: 50 },
    compact: { x: 18, y: 26 },
  },
  {
    id: 'crit_chance',
    parent: 'spire_hp',
    name: 'Killer Instinct',
    description: '+2% critical hit chance per level. Crits deal double damage.',
    maxLevel: 12,
    costs: [35, 50, 72, 104, 150, 216, 311, 448, 645, 929, 1338, 1927],
    branch: 'iron',
    tier: 2,
    short: 'Crit',
    wide: { x: 21, y: 54 },
    compact: { x: 50, y: 26 },
  },
  {
    id: 'unlock_lance',
    parent: 'unlock_tesla',
    name: 'Duelist Doctrine',
    description: 'Unlock the Lance — its shots ramp against a sustained target. Bosses hate it.',
    maxLevel: 1,
    costs: [180],
    branch: 'iron',
    tier: 2,
    short: 'Lance',
    wide: { x: 32, y: 50 },
    compact: { x: 82, y: 26 },
  },
  {
    id: 'ks_glassforge',
    parent: 'tower_damage_2',
    name: 'Glassforge',
    description: 'KEYSTONE — +35% tower damage, but the Spire has 40% less max HP. Kill it before it reaches you.',
    maxLevel: 1,
    costs: [1200],
    branch: 'iron',
    tier: 2,
    keystone: true,
    short: 'Glass',
    wide: { x: 12, y: 30 },
    compact: { x: 30, y: 36 },
  },
  {
    id: 'ks_bastion',
    parent: 'crit_chance',
    name: 'Bastion Line',
    description: 'KEYSTONE — +6 Spire max HP, but towers deal 10% less damage. Let them come.',
    maxLevel: 1,
    costs: [1200],
    branch: 'iron',
    tier: 2,
    keystone: true,
    short: 'Bastion',
    wide: { x: 28, y: 30 },
    compact: { x: 70, y: 36 },
  },
  {
    id: 'tower_damage_3',
    parent: 'ks_glassforge',
    name: 'Honed Edge III',
    description: '+8% tower damage per level.',
    maxLevel: 9,
    costs: [3664, 4946, 6677, 9014, 12169, 16428, 22178, 29940, 40419],
    branch: 'iron',
    tier: 3,
    short: 'Edge III',
    wide: { x: 20, y: 12 },
    compact: { x: 50, y: 45 },
  },

  // --- GOLD: things that pay ----------------------------------------------
  {
    id: 'starting_gold',
    name: 'War Chest',
    description: '+30 starting gold per level.',
    maxLevel: 8,
    costs: [20, 32, 50, 80, 130, 210, 340, 540],
    branch: 'gold',
    tier: 1,
    short: 'Chest',
    wide: { x: 44, y: 72 },
    compact: { x: 18, y: 58 },
  },
  {
    id: 'magnet_reach',
    name: 'Collector’s Reach',
    description: 'Widen the coin-collection radius around your cursor or finger.',
    maxLevel: 3,
    costs: [40, 90, 160],
    branch: 'gold',
    tier: 1,
    short: 'Reach',
    wide: { x: 54, y: 76 },
    compact: { x: 50, y: 58 },
  },
  {
    id: 'unlock_mint',
    name: 'Deep Vaults',
    description: 'Unlock the Mint — a tower that earns gold every cleared wave.',
    maxLevel: 1,
    costs: [150],
    branch: 'gold',
    tier: 1,
    short: 'Mint',
    wide: { x: 64, y: 72 },
    compact: { x: 82, y: 58 },
  },
  {
    id: 'gold_income',
    parent: 'starting_gold',
    name: 'Tithe of the Fallen',
    description: '+8% gold from kills, wave clears, and mints per level.',
    maxLevel: 12,
    costs: [40, 60, 90, 135, 203, 304, 456, 684, 1026, 1539, 2309, 3463],
    branch: 'gold',
    tier: 2,
    short: 'Tithe',
    wide: { x: 44, y: 50 },
    compact: { x: 18, y: 69 },
  },
  {
    id: 'spire_magnet',
    parent: 'magnet_reach',
    name: 'Spire Magnet',
    description: 'The Spire pulls nearby coins home by itself — each level widens its reach.',
    maxLevel: 3,
    costs: [200, 400, 650],
    branch: 'gold',
    tier: 2,
    short: 'Magnet',
    wide: { x: 54, y: 54 },
    compact: { x: 50, y: 69 },
  },
  {
    id: 'unlock_beacon',
    parent: 'unlock_mint',
    name: 'Signal Fires',
    description: 'Unlock the Beacon — a pylon that amplifies nearby towers.',
    maxLevel: 1,
    costs: [130],
    branch: 'gold',
    tier: 2,
    short: 'Beacon',
    wide: { x: 64, y: 50 },
    compact: { x: 82, y: 69 },
  },
  {
    id: 'spark_gain',
    parent: 'gold_income',
    name: 'Ember Memory',
    description: '+10% Sparks earned per level.',
    maxLevel: 10,
    costs: [50, 80, 128, 205, 328, 524, 839, 1342, 2147, 3436],
    branch: 'gold',
    tier: 3,
    short: 'Memory',
    wide: { x: 54, y: 28 },
    compact: { x: 50, y: 78 },
  },

  // --- ASH: things you do with your hands ---------------------------------
  {
    id: 'unlock_gold_rush',
    name: 'Prospector’s Charm',
    description: 'Unlock the Gold Rush ability.',
    maxLevel: 1,
    costs: [100],
    branch: 'ash',
    tier: 1,
    short: 'Rush',
    wide: { x: 76, y: 72 },
    compact: { x: 18, y: 90 },
  },
  {
    id: 'quick_hands',
    name: 'Quick Hands',
    description: 'The execute blade recovers 20% faster per level.',
    maxLevel: 2,
    costs: [60, 120],
    branch: 'ash',
    tier: 1,
    short: 'Hands',
    wide: { x: 86, y: 76 },
    compact: { x: 50, y: 90 },
  },
  {
    id: 'steady_aim',
    name: 'Steady Aim',
    description: 'Overcharge recharges 15% faster per level.',
    maxLevel: 2,
    costs: [70, 140],
    branch: 'ash',
    tier: 1,
    short: 'Aim',
    wide: { x: 96, y: 72 },
    compact: { x: 82, y: 90 },
  },
  {
    id: 'unlock_bulwark',
    parent: 'quick_hands',
    name: 'Aegis Sigil',
    description: 'Unlock Bulwark — 5 seconds of Spire invulnerability.',
    maxLevel: 1,
    costs: [250],
    branch: 'ash',
    tier: 2,
    short: 'Aegis',
    wide: { x: 80, y: 50 },
    compact: { x: 32, y: 99 },
  },
  {
    id: 'wave_skip',
    parent: 'steady_aim',
    name: 'Ashen Road',
    description: 'Start 2 waves further in per level, with catch-up gold and the relic picks those waves owed you.',
    maxLevel: 5,
    costs: [200, 500, 1200, 2800, 6000],
    branch: 'ash',
    tier: 2,
    short: 'Road',
    wide: { x: 92, y: 50 },
    compact: { x: 68, y: 99 },
  },
  { id: 'ks_patron', name: 'Patron of Ruin', description: 'KEYSTONE — +25% gold income, but -10% tower damage. Buy tomorrow with today’s risk.', maxLevel: 1, costs: [1400], branch: 'gold', tier: 3, keystone: true, short: 'Patron', parent: 'gold_income', wide: { x: 44, y: 12 }, compact: { x: 25, y: 79 } },
  { id: 'ks_treasury', name: 'War Treasury', description: 'KEYSTONE — +150 starting gold, but -15% gold income. Front-load your defense.', maxLevel: 1, costs: [1400], branch: 'gold', tier: 3, keystone: true, short: 'War', parent: 'spire_magnet', wide: { x: 64, y: 12 }, compact: { x: 75, y: 79 } },
  { id: 'ks_executioner', name: 'Executioner', description: 'KEYSTONE — execute recovers 20% faster; command charges recover 15% slower.', maxLevel: 1, costs: [1400], branch: 'ash', tier: 3, keystone: true, short: 'Executioner', parent: 'quick_hands', wide: { x: 80, y: 25 }, compact: { x: 25, y: 110 } },
  { id: 'ks_conductor', name: 'Conductor', description: 'KEYSTONE — command charges recover 20% faster; execute recovers 15% slower.', maxLevel: 1, costs: [1400], branch: 'ash', tier: 3, keystone: true, short: 'Conductor', parent: 'steady_aim', wide: { x: 94, y: 25 }, compact: { x: 75, y: 110 } },
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
export const META_EXECUTE_CD_PCT_PER_LEVEL = 20
export const META_OVERCHARGE_CD_PCT_PER_LEVEL = 15

// Every node that grants tower damage. Kept derived rather than restated so
// splitting a vein again can never leave createRun reading a stale list.
export const DAMAGE_NODE_IDS = META_TREE.filter((n) => n.name.startsWith('Honed Edge')).map((n) => n.id)

// Keystone effects, kept as data so the UI, the engine and the no-trap test
// all read one source.
export const KEYSTONE_GLASSFORGE_DAMAGE_PCT = 35
export const KEYSTONE_GLASSFORGE_HP_LOSS_PCT = 40
export const KEYSTONE_BASTION_HP = 6
export const KEYSTONE_BASTION_DAMAGE_PCT = 10

export function metaNode(id: MetaUpgradeId): MetaNodeDef {
  const node = META_TREE.find((n) => n.id === id)
  if (!node) throw new Error(`unknown meta upgrade: ${id}`)
  return node
}

export function branchNodes(branch: MetaBranch): MetaNodeDef[] {
  return META_TREE.filter((n) => n.branch === branch)
}

// Keystones that taking `id` locks out: same branch, same tier, not itself.
export function keystoneRivals(id: MetaUpgradeId): MetaUpgradeId[] {
  const node = metaNode(id)
  if (node.keystone !== true) return []
  return META_TREE.filter(
    (n) => n.keystone === true && n.branch === node.branch && n.tier === node.tier && n.id !== id,
  ).map((n) => n.id)
}

// What a node's levels cost in total, up to `level`. The gate arithmetic and
// the migration both need this, and both must agree exactly.
export function sparksSpentOn(id: MetaUpgradeId, level: number): number {
  const node = metaNode(id)
  let total = 0
  for (let i = 0; i < Math.min(level, node.maxLevel); i++) total += node.costs[i]!
  return total
}

// The cumulative effect of a node AT a given level, for "now → after next
// level" displays. Returns null for binary unlocks and keystones, where a
// running total adds nothing over the description.
export function metaNodeEffect(id: MetaUpgradeId, level: number): string | null {
  switch (id) {
    case 'starting_gold':
      return `+${level * META_STARTING_GOLD_PER_LEVEL} starting gold`
    case 'spire_hp':
      return `+${level * META_SPIRE_HP_PER_LEVEL} max HP`
    case 'tower_damage':
    case 'tower_damage_2':
    case 'tower_damage_3':
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
    case 'quick_hands':
      return level === 0 ? null : `execute recovers ${level * META_EXECUTE_CD_PCT_PER_LEVEL}% faster`
    case 'steady_aim':
      return level === 0 ? null : `overcharge recharges ${level * META_OVERCHARGE_CD_PCT_PER_LEVEL}% faster`
    default:
      return null
  }
}
