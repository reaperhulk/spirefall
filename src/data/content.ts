import type { AbilityId, AffixId, EnemyType, RelicId, TowerType } from '../engine/types'

// All gameplay numbers live here as plain data. Distances are in millicells
// (1 cell = 1000), durations in ticks (30 ticks = 1 second).

// ---------------------------------------------------------------------------
// Enemies

export interface EnemyDef {
  name: string
  hp: number // base, scaled by state.hpScalePct
  speed: number // millicells per tick
  cost: number // wave-budget points per unit (0 = never in wave composition)
  pack: number // units spawned per composition pick
  spacing: number // ticks between units within a pack/group
  bounty: number // base gold per kill
  damage: number // damage to the Spire on arrival
  shield: number // hits dealing <= this are fully blocked
  unlockWave: number
  flying?: boolean // ignores the maze; only air-capable towers can hit it
  heal?: { everyTicks: number; amount: number; radius: number } // healer pulse (amount scales with hp curve)
  splitInto?: { type: EnemyType; count: number } // spawned at death position
}

export const ENEMIES: Record<EnemyType, EnemyDef> = {
  runner: { name: 'Runner', hp: 26, speed: 100, cost: 10, pack: 3, spacing: 14, bounty: 2, damage: 3, shield: 0, unlockWave: 1 },
  swarmling: { name: 'Swarmling', hp: 9, speed: 130, cost: 4, pack: 6, spacing: 6, bounty: 1, damage: 1, shield: 0, unlockWave: 1 },
  brute: { name: 'Brute', hp: 130, speed: 48, cost: 26, pack: 1, spacing: 40, bounty: 6, damage: 8, shield: 0, unlockWave: 4 },
  flier: { name: 'Gale Imp', hp: 38, speed: 80, cost: 14, pack: 2, spacing: 20, bounty: 3, damage: 4, shield: 0, unlockWave: 6, flying: true },
  shieldbearer: { name: 'Shieldbearer', hp: 95, speed: 60, cost: 30, pack: 1, spacing: 36, bounty: 7, damage: 6, shield: 7, unlockWave: 8 },
  healer: { name: 'Mendwitch', hp: 110, speed: 55, cost: 34, pack: 1, spacing: 40, bounty: 8, damage: 2, shield: 0, unlockWave: 11, heal: { everyTicks: 60, amount: 6, radius: 1800 } },
  splitter: { name: 'Amalgam', hp: 80, speed: 68, cost: 26, pack: 1, spacing: 34, bounty: 4, damage: 3, shield: 0, unlockWave: 13, splitInto: { type: 'splitling', count: 2 } },
  splitling: { name: 'Shard', hp: 24, speed: 95, cost: 0, pack: 1, spacing: 0, bounty: 1, damage: 2, shield: 0, unlockWave: 99 },
  boss: { name: 'Spirebreaker', hp: 550, speed: 38, cost: 0, pack: 1, spacing: 0, bounty: 50, damage: 30, shield: 0, unlockWave: 10 },
}

// ---------------------------------------------------------------------------
// Towers

export interface TowerTierDef {
  cost: number // cost to buy (tier 1) or upgrade into this tier
  damage: number
  range: number // millicells
  cooldown: number // ticks between shots
  splashRadius?: number // cannon: full damage to all enemies within this of the target
  slowFactor?: number // frost: target moves at this % speed
  slowTicks?: number // frost: slow duration
  chain?: number // tesla: max enemies hit per shot
  mintYield?: number // mint: gold per wave cleared (does not attack)
}

export interface TowerDef {
  name: string
  hitsAir: boolean // can this tower target fliers?
  tiers: [TowerTierDef, TowerTierDef, TowerTierDef]
}

export const TOWERS: Record<TowerType, TowerDef> = {
  arrow: {
    name: 'Arrow',
    hitsAir: true,
    tiers: [
      { cost: 50, damage: 7, range: 2800, cooldown: 15 },
      { cost: 60, damage: 15, range: 3200, cooldown: 12 },
      { cost: 140, damage: 32, range: 3600, cooldown: 10 },
    ],
  },
  cannon: {
    name: 'Cannon',
    hitsAir: false,
    tiers: [
      { cost: 80, damage: 22, range: 2000, cooldown: 45, splashRadius: 900 },
      { cost: 100, damage: 48, range: 2200, cooldown: 40, splashRadius: 1050 },
      { cost: 220, damage: 95, range: 2400, cooldown: 36, splashRadius: 1200 },
    ],
  },
  frost: {
    name: 'Frost',
    hitsAir: false,
    tiers: [
      { cost: 60, damage: 3, range: 1600, cooldown: 30, slowFactor: 60, slowTicks: 45 },
      { cost: 70, damage: 6, range: 1800, cooldown: 28, slowFactor: 45, slowTicks: 60 },
      { cost: 150, damage: 12, range: 2000, cooldown: 26, slowFactor: 30, slowTicks: 75 },
    ],
  },
  tesla: {
    name: 'Tesla',
    hitsAir: true,
    tiers: [
      { cost: 90, damage: 11, range: 1900, cooldown: 24, chain: 3 },
      { cost: 110, damage: 20, range: 2000, cooldown: 22, chain: 4 },
      { cost: 240, damage: 34, range: 2100, cooldown: 20, chain: 6 },
    ],
  },
  sniper: {
    name: 'Sniper',
    hitsAir: true,
    tiers: [
      { cost: 120, damage: 60, range: 6000, cooldown: 80 },
      { cost: 140, damage: 130, range: 6500, cooldown: 75 },
      { cost: 300, damage: 260, range: 7000, cooldown: 70 },
    ],
  },
  mint: {
    name: 'Mint',
    hitsAir: false,
    tiers: [
      { cost: 100, damage: 0, range: 0, cooldown: 0, mintYield: 12 },
      { cost: 130, damage: 0, range: 0, cooldown: 0, mintYield: 28 },
      { cost: 280, damage: 0, range: 0, cooldown: 0, mintYield: 62 },
    ],
  },
}

export const SELL_REFUND_PCT = 70
export const TESLA_CHAIN_RANGE = 1400 // millicells between chain hops

// Past tier 3, towers can be enhanced indefinitely: +ENHANCE_DAMAGE_PCT damage
// per level, each level costing ENHANCE_COST_GROWTH_PCT of the last. This is
// the unbounded late-game gold sink.
export const ENHANCE_DAMAGE_PCT = 10
export const ENHANCE_COST_GROWTH_PCT = 145

export function enhanceCost(type: TowerType, currentEnhance: number): number {
  let cost = towerTier(type, 3).cost
  for (let i = 0; i <= currentEnhance; i++) cost = Math.floor((cost * ENHANCE_COST_GROWTH_PCT) / 100)
  return cost
}

export function towerTier(type: TowerType, tier: 1 | 2 | 3): TowerTierDef {
  return TOWERS[type].tiers[tier - 1]!
}

export function towerInvested(type: TowerType, tier: 1 | 2 | 3): number {
  let total = 0
  for (let t = 1; t <= tier; t++) total += towerTier(type, t as 1 | 2 | 3).cost
  return total
}

// ---------------------------------------------------------------------------
// Abilities

export interface AbilityDef {
  name: string
  cooldown: number // ticks
  radius: number // millicells around the target cell
  damage?: number
  slowFactor?: number
  slowTicks?: number
  durationTicks?: number // gold_rush
}

export const ABILITIES: Record<AbilityId, AbilityDef> = {
  meteor: { name: 'Meteor', cooldown: 600, radius: 1500, damage: 120 },
  frost_nova: { name: 'Frost Nova', cooldown: 450, radius: 2000, slowFactor: 55, slowTicks: 90 },
  gold_rush: { name: 'Gold Rush', cooldown: 900, radius: 0, durationTicks: 300 },
}

// ---------------------------------------------------------------------------
// Relics (run-scoped modifiers, offered every RELIC_WAVE_INTERVAL waves)

export interface RelicDef {
  name: string
  description: string
}

export const RELICS: Record<RelicId, RelicDef> = {
  piercing_arrows: { name: 'Piercing Arrows', description: 'Arrow towers deal +40% damage.' },
  heavy_powder: { name: 'Heavy Powder', description: 'Cannon splash radius +30%.' },
  winters_grip: { name: "Winter's Grip", description: 'Slows are 15 points stronger.' },
  golden_touch: { name: 'Golden Touch', description: '+2 gold per kill, but the Spire loses 10% max HP.' },
  overcharge: { name: 'Overcharge', description: 'Tesla chains hit 2 more enemies.' },
  spark_siphon: { name: 'Spark Siphon', description: '+25% Sparks from this run.' },
  glass_cannon: { name: 'Glass Cannon', description: 'All towers deal +30% damage, but the Spire loses 20% max HP.' },
  overclock: { name: 'Overclock', description: 'Ability cooldowns are 25% shorter.' },
  bounty_banner: { name: 'Bounty Banner', description: '+1 gold per kill.' },
  mint_condition: { name: 'Mint Condition', description: 'Mints yield +50% gold.' },
  stoneskin: { name: 'Stoneskin', description: 'Enemies reaching the Spire deal 2 less damage (min 1).' },
}

export const RELIC_IDS = Object.keys(RELICS) as RelicId[]
export const RELIC_WAVE_INTERVAL = 5
export const RELIC_OFFER_SIZE = 3

// ---------------------------------------------------------------------------
// Wave affixes: seeded modifiers that make waves feel distinct as they scale.

export interface AffixDef {
  name: string
  description: string
}

export const AFFIXES: Record<AffixId, AffixDef> = {
  frenzied: { name: 'Frenzied', description: '+30% enemy speed' },
  armored: { name: 'Armored', description: '+40% enemy HP' },
  horde: { name: 'Horde', description: 'Far more enemies at -30% HP' },
  vanguard: { name: 'Vanguard', description: 'Enemies arrive in a compressed rush' },
}

export const AFFIX_IDS = Object.keys(AFFIXES) as AffixId[]
export const AFFIX_FIRST_WAVE = 6
export const AFFIX_CHANCE_PCT = 35

// ---------------------------------------------------------------------------
// Run pacing

export const BASE_WAVE_BUDGET = 80
export const WAVE_BUDGET_GROWTH_PCT = 118 // ×1.18 per wave
export const HP_SCALE_GROWTH_PCT = 111 // enemy hp ×1.11 per wave
export const MAX_UNITS_PER_WAVE = 200
export const BOSS_WAVE_INTERVAL = 10
export const VICTORY_WAVE = 45
export const WAVE_CLEAR_GOLD_BASE = 20
export const WAVE_CLEAR_GOLD_PER_WAVE = 6
export const STARTING_GOLD = 100
export const STARTING_SPIRE_HP = 100
export const REPAIR_MAX_PER_CAST = 25

// Repair gets pricier as waves escalate — sustain is a tool, not an
// infinite-HP engine.
export function repairCostPerHp(wave: number): number {
  return 4 + Math.floor(wave / 3)
}
