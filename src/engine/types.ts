import type { BiomeId } from '../data/biomes'
import type { BoonId, TowerSpecId } from '../data/content'
import type { Rng } from './rng'

// RunState is the entire simulation. It must stay plain JSON data: no classes,
// Maps, functions, or undefined holes. JSON round-tripping mid-run is lossless
// (determinism.test.ts proves it).

export type Phase = 'build' | 'wave' | 'defeat' | 'victory'
export type TowerType = 'arrow' | 'cannon' | 'frost' | 'tesla' | 'sniper' | 'mint' | 'beacon' | 'lance'
export type Targeting = 'first' | 'last' | 'strongest' | 'weakest' | 'nearest' | 'elites'
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
  | 'boss2'
  | 'boss3'
  | 'boss4'
  | 'boss5'
  | 'boss6'
export type AbilityId = 'meteor' | 'frost_nova' | 'gold_rush' | 'bulwark'
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
  | 'last_stand'
  | 'shatter'
  | 'soul_harvest'
  | 'ricochet_strings'
  | 'cinder_shells'
  | 'shatterheart'
  | 'storm_coils'
  | 'deadeye_sigil'
  | 'golden_ledger'
  | 'prism_lens'
  | 'duelists_oath'

export type AffixId = 'frenzied' | 'armored' | 'horde' | 'vanguard' | 'shielded'

export type CataclysmId = 'surge' | 'juggernaut' | 'swarm' | 'dampening' | 'crumbling' | 'ironclad'

// Trials: opt-in run handicaps chosen at run start, paying bonus sparks.
export type TrialId = 'glass_spire' | 'swift_horde' | 'iron_horde' | 'famine' | 'no_mercy' | 'blackout'

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
  boons: Rng // wave-boon offers — own stream so boons never reshuffle relic draws
}

export interface Tower {
  id: number
  type: TowerType
  tier: 1 | 2 | 3
  spec: TowerSpecId | null // tier-3 path commitment; null until chosen
  enhance: number // post-tier-3 levels: +damage %, unbounded
  cell: CellPos
  cooldown: number // ticks until it can fire again
  targeting: Targeting
  kills: number // killing blows landed (lifetime)
  damageDealt: number // total damage dealt (lifetime)
  shots: number // shots fired (mints: payouts made); 0 = full sell refund
  earned?: number // mints only: lifetime gold paid out (optional — backfills lazily)
  overcharged?: boolean // armed: the next shot lands at OVERCHARGE_DAMAGE_PCT
  overchargeCd?: number // ticks until this tower can be overcharged again
  rampTarget?: number // lances only: enemy id the ramp is locked onto
  rampStacks?: number // lances only: consecutive hits on rampTarget (capped)
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
  armor: number // flat damage reduction per hit (min 1 always lands)
  healCooldown: number // healers: ticks until next healing pulse
  broodCooldown: number // carriers: ticks until the next brood hatches
  phased: boolean // wraiths: untargetable by towers while phased
  phaseCooldown: number // ticks until the wraith flips corporeal/phased
  burnTicks: number // Cinder Shells: ticks of burn remaining
  burnPerTick: number // Cinder Shells: hp lost per burning tick (ignores armor)
  overcharge: number // Storm Coils: stacked tesla hits on this enemy
  mechCooldown: number // bosses: ticks until the signature mechanic triggers
  mechActiveTicks: number // bosses: ticks the mechanic stays active (carapace)
  brittleTicks: number // Permafrost: +25% damage taken while > 0
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
  abilityCdPct: number // % shaved off ability cooldowns (ember: Swift Sigils)
  repairCasts: number // extra mid-wave repair casts (ember: Emberbound Crews)
}

export interface RunState {
  schemaVersion: 1
  seed: string
  tick: number
  phase: Phase
  rng: RngStreams
  mapId: number // legacy fixed-map index (used only when mapSeed === '')
  biome: BiomeId // battlefield rules; structure generates from mapSeed
  mapSeed: string // '' = legacy fixed map, else seed for generateMap
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
  bulwarkTicks: number // spire invulnerability window (ability)
  relics: RelicId[]
  relicOffer: RelicId[] | null
  relicRerolled: boolean // one reroll per offer
  cataclysmOffer: CataclysmId[] | null // endless: two dooms offered, pick one (gates start_wave)
  boonOffer: BoonId[] | null // build phase: two single-wave perks; skipping is free
  activeBoon: BoonId | null // the perk blessing the current wave (cleared at wave end)
  availableTowers: TowerType[]
  mods: RunMods
  activeAffix: AffixId | null // wave modifier for the current/last wave
  cataclysms: CataclysmId[] // permanent endless modifiers, in strike order
  trials: TrialId[] // opt-in handicaps chosen at run start; pay bonus sparks
  // Victories won this cycle when the run began. Each one hardens the horde
  // (+HP) and sweetens the pot (+sparks): repeat wins are an escalating
  // ladder, not a replay of a solved puzzle. Resets with ascension.
  crucible: number
  damageByTower: Partial<Record<TowerType, number>> // run-lifetime, survives sales
  killsByEnemy: Partial<Record<EnemyType, number>> // run-lifetime tally
  maxRampStacks: number // deepest lance climb this run (achievement: Unwavering)
  combo: number // current unbroken-kill streak (pays a small capped bonus)
  comboTicks: number // window remaining; 0 with a live combo = streak broken
  bestCombo: number // longest streak this run (run-over stat)
  hpByWave: number[] // spire HP sampled at each wave clear, in clear order
  repairsThisWave: number // mid-wave repair casts used (capped; resets each wave)
  victoryClaimed: boolean // wave VICTORY_WAVE cleared; endless continues after
  sparksEarned: number // set once, at run end
}

export type Command =
  | { type: 'start_wave' }
  | { type: 'abandon_run' }
  | { type: 'repair_spire' }
  | { type: 'place_tower'; tower: TowerType; cell: CellPos }
  | { type: 'upgrade_tower'; id: number }
  | { type: 'specialize_tower'; id: number; spec: TowerSpecId }
  | { type: 'sell_tower'; id: number }
  | { type: 'overcharge_tower'; id: number }
  | { type: 'choose_boon'; boon: BoonId }
  | { type: 'set_targeting'; id: number; targeting: Targeting }
  | { type: 'cast_ability'; ability: AbilityId; cell: CellPos }
  | { type: 'choose_relic'; relic: RelicId | null }
  | { type: 'reroll_relic' }
  | { type: 'choose_cataclysm'; cataclysm: CataclysmId }

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
  | { type: 'cataclysm_offered'; options: CataclysmId[]; wave: number }
  | { type: 'tower_sold'; id: number; refund: number }
  | { type: 'tower_fired'; id: number; tower: TowerType; from: Vec; to: Vec; targets: number[]; crit: boolean }
  | { type: 'tower_specialized'; id: number; spec: TowerSpecId; cost: number }
  | { type: 'ability_cast'; ability: AbilityId; cell: CellPos }
  | { type: 'wave_cleared'; wave: number; goldAwarded: number }
  | { type: 'gold_interest'; amount: number; gold: number }
  | { type: 'vents_erupted'; cells: number[]; seared: number }
  | { type: 'boss_carapace'; id: number }
  | { type: 'boss_gale'; id: number; hastened: number }
  | { type: 'ramp_capped'; id: number; cell: CellPos } // a lance's climb hit LANCE_MAX_STACKS
  | { type: 'combo_milestone'; combo: number } // every COMBO_MILESTONE unbroken kills
  | { type: 'tower_overcharged'; id: number; cell: CellPos }
  | { type: 'boon_chosen'; boon: BoonId }
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
  seed: string // shareable challenge: ?seed=<seed> replays this battlefield
  biome: BiomeId
  crucible: number
  wavesCleared: number
  kills: number
  sparks: number
  damageByTower: Partial<Record<TowerType, number>>
  killsByEnemy: Partial<Record<EnemyType, number>>
  bestCombo: number // longest unbroken kill streak
  hpByWave: number[]
  trials: TrialId[]
  relics: RelicId[] // the build that carried (or didn't), in pick order
  cataclysms: CataclysmId[] // endless scars endured, in strike order
  unlocked: { id: string; name: string; sparks: number }[] // achievements earned by THIS run
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
  bestWave: number // furthest wave ever cleared
  bestWaveByMap: Record<string, number> // mapId (as string key) -> furthest wave cleared there
  lifetimeKills: number
  achievements: string[] // earned achievement ids, in earn order
  // Recent runs, newest first. biome/crucible are optional: entries from
  // before they were recorded simply don't have them (no save migration).
  history: {
    outcome: 'defeat' | 'victory'
    wavesCleared: number
    kills: number
    sparks: number
    biome?: BiomeId
    crucible?: number
  }[]
}
