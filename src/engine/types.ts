import type { Rng } from './rng'

// RunState is the entire simulation. It must stay plain JSON data: no classes,
// Maps, functions, or undefined holes. JSON round-tripping mid-run is lossless
// (determinism.test.ts proves it).

export type Phase = 'build' | 'wave' | 'defeat' | 'victory'
export type TowerType = 'arrow' | 'cannon' | 'frost' | 'tesla' | 'sniper' | 'mint'
export type Targeting = 'first' | 'last' | 'strongest' | 'nearest'
export type EnemyType =
  | 'runner'
  | 'swarmling'
  | 'brute'
  | 'shieldbearer'
  | 'flier'
  | 'healer'
  | 'splitter'
  | 'splitling'
  | 'boss'
export type AbilityId = 'meteor' | 'frost_nova' | 'gold_rush'
export type RelicId =
  | 'piercing_arrows'
  | 'heavy_powder'
  | 'winters_grip'
  | 'golden_touch'
  | 'overcharge'
  | 'spark_siphon'
  | 'glass_cannon'
  | 'overclock'
  | 'bounty_banner'
  | 'mint_condition'
  | 'stoneskin'

export type AffixId = 'frenzied' | 'armored' | 'horde' | 'vanguard'

export interface CellPos {
  cx: number
  cy: number
}

// Positions are fixed-point integers in millicells: 1 grid cell = 1000.
export interface Vec {
  x: number
  y: number
}

export interface RngStreams {
  waves: Rng
  combat: Rng
  relics: Rng
}

export interface Tower {
  id: number
  type: TowerType
  tier: 1 | 2 | 3
  enhance: number // post-tier-3 levels: +damage %, unbounded
  cell: CellPos
  cooldown: number // ticks until it can fire again
  targeting: Targeting
  kills: number // killing blows landed (lifetime)
  damageDealt: number // total damage dealt (lifetime)
}

export interface Enemy {
  id: number
  type: EnemyType
  pos: Vec
  hp: number
  maxHp: number
  speed: number // millicells per tick (before slows)
  slowFactor: number // % of speed while slowTicks > 0 (100 = no slow)
  slowTicks: number
  bounty: number
  damage: number // dealt to the Spire on arrival
  shield: number // hits dealing <= this are fully blocked
  healCooldown: number // healers: ticks until next healing pulse
  targetCell: CellPos | null // next waypoint; null = needs (re)pathing (unused by fliers)
}

export interface PendingSpawn {
  type: EnemyType
  tick: number // absolute tick to spawn at
}

// Additive % modifiers snapshotted from meta at run creation, so a run never
// reads the meta object during play.
export interface RunMods {
  damagePct: number
  goldPct: number
  sparkPct: number
}

export interface RunState {
  schemaVersion: 1
  seed: string
  tick: number
  phase: Phase
  rng: RngStreams
  mapId: number
  wave: number // wave currently active or last started (0 before first)
  wavesCleared: number
  kills: number
  gold: number
  spireHp: number
  spireMaxHp: number
  waveBudget: number // budget of the current/last wave
  hpScalePct: number // enemy hp multiplier, grows per wave
  nextEntityId: number
  towers: Tower[]
  enemies: Enemy[]
  pendingSpawns: PendingSpawn[]
  abilities: Record<string, number> // AbilityId -> cooldown remaining; keys = equipped
  goldRushTicks: number
  relics: RelicId[]
  relicOffer: RelicId[] | null
  availableTowers: TowerType[]
  mods: RunMods
  activeAffix: AffixId | null // wave modifier for the current/last wave
  victoryClaimed: boolean // wave VICTORY_WAVE cleared; endless continues after
  sparksEarned: number // set once, at run end
}

export type Command =
  | { type: 'start_wave' }
  | { type: 'abandon_run' }
  | { type: 'repair_spire' }
  | { type: 'place_tower'; tower: TowerType; cell: CellPos }
  | { type: 'upgrade_tower'; id: number }
  | { type: 'sell_tower'; id: number }
  | { type: 'set_targeting'; id: number; targeting: Targeting }
  | { type: 'cast_ability'; ability: AbilityId; cell: CellPos }
  | { type: 'choose_relic'; relic: RelicId | null }

export type GameEvent =
  | { type: 'wave_started'; wave: number; spawnCount: number; affix: AffixId | null }
  | { type: 'enemy_spawned'; id: number; enemy: EnemyType }
  | { type: 'enemy_killed'; id: number; enemy: EnemyType; at: Vec; bounty: number }
  | { type: 'enemy_reached_spire'; id: number; enemy: EnemyType; damage: number; spireHp: number }
  | { type: 'tower_placed'; id: number; tower: TowerType; cell: CellPos }
  | { type: 'tower_upgraded'; id: number; tier: number }
  | { type: 'tower_enhanced'; id: number; level: number; cost: number }
  | { type: 'spire_repaired'; amount: number; cost: number; spireHp: number }
  | { type: 'enemy_healed'; healer: number; targets: number[]; amount: number }
  | { type: 'mint_income'; id: number; amount: number }
  | { type: 'victory_achieved'; wave: number }
  | { type: 'tower_sold'; id: number; refund: number }
  | { type: 'tower_fired'; id: number; tower: TowerType; from: Vec; to: Vec; targets: number[] }
  | { type: 'ability_cast'; ability: AbilityId; cell: CellPos }
  | { type: 'wave_cleared'; wave: number; goldAwarded: number }
  | { type: 'relic_offered'; options: RelicId[] }
  | { type: 'relic_chosen'; relic: RelicId | null }
  | { type: 'run_ended'; outcome: 'defeat' | 'victory'; wavesCleared: number; kills: number; sparks: number }
  | { type: 'command_rejected'; command: Command; reason: string }

export interface StepResult {
  state: RunState
  events: GameEvent[]
}

export interface RunSummary {
  outcome: 'defeat' | 'victory'
  wavesCleared: number
  kills: number
  sparks: number
}

// Permanent progression. Lives outside runs; same purity rules.
export interface MetaState {
  schemaVersion: 1
  sparks: number
  totalSparks: number
  runs: number
  upgrades: Record<string, number> // MetaUpgradeId -> level
}
