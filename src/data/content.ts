import type { AbilityId, EnemyType, RelicId, TowerType } from '../engine/types'

// All gameplay numbers live here as plain data. Distances are in millicells
// (1 cell = 1000), durations in ticks (30 ticks = 1 second).

// ---------------------------------------------------------------------------
// Enemies

export interface EnemyDef {
  name: string
  hp: number // base, scaled by state.hpScalePct
  speed: number // millicells per tick
  cost: number // wave-budget points per unit
  pack: number // units spawned per composition pick
  spacing: number // ticks between units within a pack/group
  bounty: number // base gold per kill
  damage: number // damage to the Spire on arrival
  shield: number // hits dealing <= this are fully blocked
  unlockWave: number
}

export const ENEMIES: Record<EnemyType, EnemyDef> = {
  runner: { name: 'Runner', hp: 26, speed: 100, cost: 10, pack: 2, spacing: 16, bounty: 3, damage: 3, shield: 0, unlockWave: 1 },
  swarmling: { name: 'Swarmling', hp: 9, speed: 130, cost: 4, pack: 5, spacing: 6, bounty: 1, damage: 1, shield: 0, unlockWave: 2 },
  brute: { name: 'Brute', hp: 130, speed: 48, cost: 26, pack: 1, spacing: 40, bounty: 8, damage: 8, shield: 0, unlockWave: 4 },
  shieldbearer: { name: 'Shieldbearer', hp: 95, speed: 60, cost: 30, pack: 1, spacing: 36, bounty: 9, damage: 6, shield: 7, unlockWave: 7 },
  boss: { name: 'Spirebreaker', hp: 550, speed: 38, cost: 0, pack: 1, spacing: 0, bounty: 60, damage: 30, shield: 0, unlockWave: 10 },
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
}

export interface TowerDef {
  name: string
  tiers: [TowerTierDef, TowerTierDef, TowerTierDef]
}

export const TOWERS: Record<TowerType, TowerDef> = {
  arrow: {
    name: 'Arrow',
    tiers: [
      { cost: 50, damage: 7, range: 2500, cooldown: 15 },
      { cost: 60, damage: 15, range: 2800, cooldown: 12 },
      { cost: 140, damage: 32, range: 3100, cooldown: 10 },
    ],
  },
  cannon: {
    name: 'Cannon',
    tiers: [
      { cost: 80, damage: 22, range: 2200, cooldown: 45, splashRadius: 900 },
      { cost: 100, damage: 48, range: 2400, cooldown: 40, splashRadius: 1050 },
      { cost: 220, damage: 95, range: 2700, cooldown: 36, splashRadius: 1200 },
    ],
  },
  frost: {
    name: 'Frost',
    tiers: [
      { cost: 60, damage: 3, range: 2200, cooldown: 30, slowFactor: 60, slowTicks: 45 },
      { cost: 70, damage: 6, range: 2400, cooldown: 28, slowFactor: 45, slowTicks: 60 },
      { cost: 150, damage: 12, range: 2600, cooldown: 26, slowFactor: 30, slowTicks: 75 },
    ],
  },
  tesla: {
    name: 'Tesla',
    tiers: [
      { cost: 90, damage: 11, range: 2400, cooldown: 24, chain: 3 },
      { cost: 110, damage: 20, range: 2500, cooldown: 22, chain: 4 },
      { cost: 240, damage: 34, range: 2600, cooldown: 20, chain: 6 },
    ],
  },
}

export const SELL_REFUND_PCT = 70
export const TESLA_CHAIN_RANGE = 1400 // millicells between chain hops

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
}

export const RELIC_IDS = Object.keys(RELICS) as RelicId[]
export const RELIC_WAVE_INTERVAL = 5
export const RELIC_OFFER_SIZE = 3

// ---------------------------------------------------------------------------
// Run pacing

export const BASE_WAVE_BUDGET = 35
export const WAVE_BUDGET_GROWTH_PCT = 118 // ×1.18 per wave
export const HP_SCALE_GROWTH_PCT = 111 // enemy hp ×1.11 per wave
export const MAX_UNITS_PER_WAVE = 150
export const BOSS_WAVE_INTERVAL = 10
export const VICTORY_WAVE = 44
export const WAVE_CLEAR_GOLD_BASE = 20
export const WAVE_CLEAR_GOLD_PER_WAVE = 6
export const STARTING_GOLD = 100
export const STARTING_SPIRE_HP = 100
