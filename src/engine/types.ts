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
  | 'wraith'
  | 'carrier'
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
  | 'keen_sights'
  | 'executioners_seal'
  | 'fortune_idol'
  | 'quickdraw'
  | 'longsight'
  | 'field_medicine'
  | 'deep_pockets'
  | 'echo_chamber'
  | 'colossus'

export type AffixId = 'frenzied' | 'armored' | 'horde' | 'vanguard'

export type CataclysmId = 'surge' | 'juggernaut' | 'swarm' | 'dampening' | 'crumbling' | 'ironclad'

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
  shots: number // shots fired (mints: payouts made); 0 = full sell refund
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
  broodCooldown: number // carriers: ticks until the next brood hatches
  phased: boolean // wraiths: untargetable by towers while phased
  phaseCooldown: number // ticks until the wraith flips corporeal/phased
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
  critChancePct: number // % chance a tower shot crits (rolled on the combat stream)
}

export interface RunState {
  schemaVersion: 1
  seed: string
  tick: number
  phase: Phase
  rng: RngStreams
  mapId: number
  wave: number // wave currently active or last started
  startWave: number // waves skipped via meta (sparks only pay past this)
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
  relicRerolled: boolean // one reroll per offer
  availableTowers: TowerType[]
  mods: RunMods
  activeAffix: AffixId | null // wave modifier for the current/last wave
  cataclysms: CataclysmId[] // permanent endless modifiers, in strike order
  damageByTower: Partial<Record<TowerType, number>> // run-lifetime, survives sales
  killsByEnemy: Partial<Record<EnemyType, number>> // run-lifetime tally
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
  | { type: 'reroll_relic' }

export type GameEvent =
  | { type: 'wave_started'; wave: number; spawnCount: number; affix: AffixId | null }
  | { type: 'enemy_spawned'; id: number; enemy: EnemyType }
  | { type: 'enemy_killed'; id: number; enemy: EnemyType; at: Vec; bounty: number; lucky: boolean }
  | { type: 'enemy_reached_spire'; id: number; enemy: EnemyType; damage: number; spireHp: number }
  | { type: 'tower_placed'; id: number; tower: TowerType; cell: CellPos }
  | { type: 'tower_upgraded'; id: number; tier: number }
  | { type: 'tower_enhanced'; id: number; level: number; cost: number }
  | { type: 'spire_repaired'; amount: number; cost: number; spireHp: number }
  | { type: 'enemy_healed'; healer: number; targets: number[]; amount: number }
  | { type: 'mint_income'; id: number; amount: number }
  | { type: 'victory_achieved'; wave: number }
  | { type: 'cataclysm_struck'; cataclysm: CataclysmId; wave: number }
  | { type: 'tower_sold'; id: number; refund: number }
  | { type: 'tower_fired'; id: number; tower: TowerType; from: Vec; to: Vec; targets: number[]; crit: boolean }
  | { type: 'ability_cast'; ability: AbilityId; cell: CellPos }
  | { type: 'wave_cleared'; wave: number; goldAwarded: number }
  | { type: 'relic_offered'; options: RelicId[] }
  | { type: 'relic_chosen'; relic: RelicId | null; goldAwarded: number }
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
  damageByTower: Partial<Record<TowerType, number>>
  killsByEnemy: Partial<Record<EnemyType, number>>
}

// Permanent progression. Lives outside runs; same purity rules.
export interface MetaState {
  schemaVersion: 1
  sparks: number
  totalSparks: number
  runs: number
  victories: number // lifetime victories
  cycleVictories: number // victories since the last ascension — fuels ember gain
  embers: number // ascension currency
  ascensions: number
  upgrades: Record<string, number> // MetaUpgradeId -> level (wiped on ascension)
  emberUpgrades: Record<string, number> // EmberUpgradeId -> level (permanent)
}
