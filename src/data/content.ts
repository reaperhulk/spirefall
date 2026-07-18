import type { AbilityId, AffixId, CataclysmId, EnemyType, RelicId, TowerType, TrialId } from '../engine/types'

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
  // Flat damage reduction per hit (min 1 always lands), scaled on the FULL
  // hp curve. Shields are a threshold check (weak hits bounce entirely,
  // binding late); armor is attrition — it taxes rapid-fire chip
  // proportionally far more than heavy shells, so armored enemies bend
  // compositions gradually from the midgame instead of at a wave-22 cliff.
  armor?: number
  unlockWave: number
  weight?: number // wave-composition pick weight (default 1) — keeps the
  // comp-check enemies frequent no matter how many types unlock
  elite?: boolean // heavy units: snipers deal bonus damage to these
  // Carriers hatch these while alive. Hatchlings pay NO bounty — a carrier
  // left alive must never become a gold farm.
  brood?: { type: EnemyType; count: number; everyTicks: number }
  flying?: boolean // ignores the maze; only air-capable towers can hit it
  phasing?: { visibleTicks: number; hiddenTicks: number } // wraiths flicker out of reach
  heal?: { everyTicks: number; amount: number; radius: number } // healer pulse (amount scales with hp curve)
  splitInto?: { type: EnemyType; count: number } // spawned at death position
  // Boss signature mechanics — the tension peak of every 10th wave is an
  // ENCOUNTER, not a stat check. Each has explicit counterplay:
  // - carapace: periodic damage-immunity window (hits cap at 1) that a
  //   single heavy hit (>= CARAPACE_BREAK_DAMAGE) shatters instantly.
  //   Cannons and snipers answer; chip waits it out.
  // - gale: periodically hastens every OTHER enemy — but slows override
  //   haste, so frost coverage cancels the storm.
  mech?: { kind: 'carapace' | 'gale'; everyTicks: number; durationTicks: number }
}

// Horde profile: individually weak, numerous. Costs are ~half the old values
// (so the same wave budget fields ~2× the bodies), HP and bounty scale down to
// match — total wave threat and income stay on the pinned curve, but losing
// feels like being overrun and winning like mowing down a flood.
export const ENEMIES: Record<EnemyType, EnemyDef> = {
  runner: { name: 'Runner', hp: 14, speed: 120, cost: 5, pack: 5, spacing: 7, bounty: 1, damage: 1, shield: 0, unlockWave: 1 },
  swarmling: { name: 'Swarmling', hp: 5, speed: 155, cost: 2, pack: 10, spacing: 4, bounty: 1, damage: 1, shield: 0, unlockWave: 1 },
  brute: { name: 'Brute', hp: 70, speed: 58, cost: 13, pack: 2, spacing: 16, bounty: 3, damage: 3, shield: 0, armor: 1, unlockWave: 4, elite: true },
  flier: { name: 'Gale Imp', hp: 20, speed: 95, cost: 7, pack: 4, spacing: 10, bounty: 2, damage: 2, shield: 0, unlockWave: 6, flying: true },
  shieldbearer: { name: 'Shieldbearer', hp: 50, speed: 72, cost: 15, pack: 2, spacing: 14, bounty: 4, damage: 2, shield: 4, unlockWave: 8, elite: true },
  healer: { name: 'Mendwitch', hp: 60, speed: 66, cost: 17, pack: 1, spacing: 18, bounty: 4, damage: 1, shield: 0, armor: 1, unlockWave: 11, elite: true, heal: { everyTicks: 60, amount: 4, radius: 1800 } },
  splitter: { name: 'Amalgam', hp: 45, speed: 82, cost: 13, pack: 2, spacing: 14, bounty: 2, damage: 1, shield: 0, armor: 1, unlockWave: 13, elite: true, splitInto: { type: 'splitling', count: 2 } },
  splitling: { name: 'Shard', hp: 13, speed: 115, cost: 0, pack: 1, spacing: 0, bounty: 1, damage: 1, shield: 0, unlockWave: 99 },
  wraith: { name: 'Wraith', hp: 35, speed: 88, cost: 11, pack: 2, spacing: 12, bounty: 2, damage: 2, shield: 0, unlockWave: 12, phasing: { visibleTicks: 60, hiddenTicks: 45 } },
  carrier: { name: 'Broodmother', hp: 80, speed: 40, cost: 30, pack: 1, spacing: 26, bounty: 8, damage: 4, shield: 3, armor: 1, unlockWave: 18, elite: true, brood: { type: 'swarmling', count: 2, everyTicks: 140 } },
  boss: { name: 'Spirebreaker', hp: 500, speed: 46, cost: 0, pack: 1, spacing: 0, bounty: 40, damage: 8, shield: 0, armor: 1, unlockWave: 10, elite: true, mech: { kind: 'carapace', everyTicks: 240, durationTicks: 60 } },
  boss2: { name: 'Gravemind', hp: 420, speed: 42, cost: 0, pack: 1, spacing: 0, bounty: 45, damage: 8, shield: 0, armor: 1, unlockWave: 20, elite: true, splitInto: { type: 'splitter', count: 2 }, brood: { type: 'splitling', count: 2, everyTicks: 180 } },
  boss3: { name: 'Stormcaller', hp: 380, speed: 55, cost: 0, pack: 1, spacing: 0, bounty: 50, damage: 10, shield: 0, armor: 1, unlockWave: 30, elite: true, flying: true, mech: { kind: 'gale', everyTicks: 210, durationTicks: 45 } },
  // Endless-tier bosses (waves 40 and 50 in the cycle): pure data — they
  // ride the wraith-phasing and healer machinery the engine already has.
  boss4: { name: 'Veilwarden', hp: 560, speed: 44, cost: 0, pack: 1, spacing: 0, bounty: 55, damage: 10, shield: 0, armor: 2, unlockWave: 40, elite: true, phasing: { visibleTicks: 120, hiddenTicks: 50 } },
  boss5: { name: 'Blightmother', hp: 620, speed: 38, cost: 0, pack: 1, spacing: 0, bounty: 60, damage: 12, shield: 4, armor: 1, unlockWave: 50, elite: true, heal: { everyTicks: 80, amount: 10, radius: 2400 } },
  // Deep-endless (wave 60 in the cycle): an airborne carrier — it soars over
  // every maze and broods FLIERS, so wave 60 is an air armada that only
  // anti-air depth answers. Pure data on existing machinery (flying + brood).
  boss6: { name: 'Zephyrhost', hp: 680, speed: 47, cost: 0, pack: 1, spacing: 0, bounty: 65, damage: 12, shield: 5, armor: 1, unlockWave: 60, elite: true, flying: true, brood: { type: 'flier', count: 2, everyTicks: 200 } },
}

// Boss waves rotate through the roster: 10 → Spirebreaker (carapace tank),
// 20 → Gravemind (splits on death), 30 → Stormcaller (flying gale),
// 40 → Veilwarden (phasing), 50 → Blightmother (horde-mender),
// 60 → Zephyrhost (airborne carrier) — and around again.
export const BOSS_ROSTER: EnemyType[] = ['boss', 'boss2', 'boss3', 'boss4', 'boss5', 'boss6']

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
  auraPct?: number // beacon: damage bonus to towers within range (does not attack)
}

export interface TowerDef {
  name: string
  hitsAir: boolean // can this tower target fliers?
  support?: boolean // never fires (mint, beacon) — combat skips it entirely
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
    support: true,
    tiers: [
      { cost: 100, damage: 0, range: 0, cooldown: 0, mintYield: 12 },
      { cost: 130, damage: 0, range: 0, cooldown: 0, mintYield: 28 },
      { cost: 280, damage: 0, range: 0, cooldown: 0, mintYield: 52 },
    ],
  },
  lance: {
    // The boss-killer: every consecutive hit on the SAME target ramps the
    // next one (+LANCE_RAMP_PCT per stack, capped); switching targets — or
    // the target dying — resets to zero. Monstrous against something that
    // survives ten hits, mediocre against a horde that doesn't.
    name: 'Lance',
    hitsAir: true,
    tiers: [
      { cost: 140, damage: 9, range: 3800, cooldown: 12 },
      { cost: 160, damage: 18, range: 4200, cooldown: 11 },
      { cost: 340, damage: 30, range: 4600, cooldown: 10 },
    ],
  },
  beacon: {
    name: 'Beacon',
    hitsAir: false,
    support: true,
    tiers: [
      { cost: 90, damage: 0, range: 1600, cooldown: 0, auraPct: 12 },
      { cost: 120, damage: 0, range: 1800, cooldown: 0, auraPct: 18 },
      { cost: 260, damage: 0, range: 2000, cooldown: 0, auraPct: 25 },
    ],
  },
}

// Beacon auras do NOT stack: a tower takes the strongest beacon in range.
// (Stacking turns beacon farms into the dominant strategy — by design, one
// good beacon placement is worth exactly one bonus.)

// ---------------------------------------------------------------------------
// Tier-3 specializations: at tier 3, each combat tower commits to one of two
// paths — a one-time purchase that changes HOW it fights, not just numbers.
// Composes multiplicatively with relics and biomes: build identity becomes
// something you steer. Mint and Beacon keep their economy/support identity.

export type TowerSpecId =
  | 'momentum'
  | 'skewer'
  | 'volley'
  | 'longbow'
  | 'mortar'
  | 'breaker'
  | 'blizzard'
  | 'permafrost'
  | 'lattice'
  | 'capacitor'
  | 'executor'
  | 'overpen'

export interface TowerSpecDef {
  id: TowerSpecId
  name: string
  description: string
  cost: number
}

export const TOWER_SPECS: Partial<Record<TowerType, [TowerSpecDef, TowerSpecDef]>> = {
  arrow: [
    { id: 'volley', name: 'Volley', description: 'Each shot strikes up to 2 extra enemies near the target for 60%.', cost: 120 },
    { id: 'longbow', name: 'Longbow', description: '+30% range, and shots pierce shields outright.', cost: 120 },
  ],
  cannon: [
    { id: 'mortar', name: 'Mortar', description: '+60% splash radius and +25% damage — but 60% slower.', cost: 180 },
    { id: 'breaker', name: 'Breaker', description: 'No splash: the whole charge hits one target for +80% damage.', cost: 180 },
  ],
  frost: [
    { id: 'blizzard', name: 'Blizzard', description: 'The slow lands on every enemy within 0.9 cells of the target.', cost: 130 },
    { id: 'permafrost', name: 'Permafrost', description: 'Its slow makes enemies BRITTLE: +25% damage taken from all sources.', cost: 130 },
  ],
  tesla: [
    { id: 'lattice', name: 'Arc Lattice', description: 'Chains reach 3 further enemies.', cost: 200 },
    { id: 'capacitor', name: 'Capacitor', description: 'Every 4th shot discharges for triple damage.', cost: 200 },
  ],
  sniper: [
    { id: 'executor', name: 'Executor', description: 'Hits execute non-boss enemies below 10% HP.', cost: 250 },
    { id: 'overpen', name: 'Overpenetration', description: 'The slug carries through: one more enemy near the target takes full damage.', cost: 250 },
  ],
  lance: [
    { id: 'momentum', name: 'Momentum', description: 'The ramp climbs faster: +22% per consecutive hit instead of +15%.', cost: 260 },
    { id: 'skewer', name: 'Skewer', description: 'Shots pierce shields outright — nothing blunts a committed lance.', cost: 260 },
  ],
}

export const VOLLEY_EXTRA_TARGETS = 2
export const VOLLEY_PCT = 60
export const LONGBOW_RANGE_PCT = 130
export const MORTAR_SPLASH_PCT = 160
// 140 → 125 killed the original Mortar-Blizzard 8k win; the shielded-affix
// world reshuffle (2026-07) handed the same comp a gamma win at 125, so one
// more click: 120. The mortar stays the wave-clear king, just not a cheap one.
export const MORTAR_DAMAGE_PCT = 120
export const MORTAR_COOLDOWN_PCT = 160
export const BREAKER_DAMAGE_PCT = 180
export const BLIZZARD_RADIUS = 900
// Splash victims get HALF the slow duration: a chill, not a lock. Full-field
// permanent slows out of massed blizzard frosts carried a fuzzer win at 8k
// (mortar+blizzard, 2026-07) — the primary target still gets the full slow.
export const BLIZZARD_SPLASH_TICKS_PCT = 50
export const PERMAFROST_BONUS_PCT = 25
export const LATTICE_EXTRA_CHAIN = 3
export const CAPACITOR_EVERY_SHOTS = 4
export const CAPACITOR_DAMAGE_PCT = 300
export const EXECUTOR_THRESHOLD_PCT = 10
export const OVERPEN_RANGE = 1200
export const LANCE_RAMP_PCT = 15 // per consecutive hit on the same target
export const LANCE_MAX_STACKS = 10
export const MOMENTUM_RAMP_PCT = 22 // Momentum spec: steeper ramp

export function specForTower(type: TowerType, spec: TowerSpecId): TowerSpecDef | null {
  return TOWER_SPECS[type]?.find((sp) => sp.id === spec) ?? null
}

export const SELL_REFUND_PCT = 70
export const TESLA_CHAIN_RANGE = 1400 // millicells between chain hops

// Horde-era single-target niches: AoE towers mow the flood, so the
// single-target towers answer what AoE can't. Arrows shred the sky;
// snipers execute elites and punch straight through shields.
export const ARROW_AIR_BONUS_PCT = 100 // arrows deal +100% to fliers
// +50%, not +100%: elites dominate late-wave budgets, so a 2× elite bonus
// made sniper-stacking flatly dominant (the build fuzzer proved it — victory
// at 8k sparks). Half keeps the executioner niche without the cheese.
export const SNIPER_ELITE_BONUS_PCT = 50

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
  bulwark: { name: 'Bulwark', cooldown: 1200, radius: 0, durationTicks: 150 },
}

// ---------------------------------------------------------------------------
// Relics (run-scoped modifiers, offered every RELIC_WAVE_INTERVAL waves)

export type RelicRarity = 'common' | 'rare' | 'legendary'

export interface RelicDef {
  name: string
  description: string
  rarity: RelicRarity
}

export const RELICS: Record<RelicId, RelicDef> = {
  piercing_arrows: { name: 'Piercing Arrows', description: 'Arrow towers deal +40% damage.', rarity: 'rare' },
  heavy_powder: { name: 'Heavy Powder', description: 'Cannon splash radius +30%.', rarity: 'rare' },
  winters_grip: { name: "Winter's Grip", description: 'Slows are 15 points stronger.', rarity: 'common' },
  golden_touch: { name: 'Golden Touch', description: '+2 gold per kill, but the Spire loses 10% max HP.', rarity: 'rare' },
  overcharge: { name: 'Overcharge', description: 'Tesla chains hit 2 more enemies.', rarity: 'rare' },
  spark_siphon: { name: 'Spark Siphon', description: '+25% Sparks from this run.', rarity: 'rare' },
  glass_cannon: { name: 'Glass Cannon', description: 'All towers deal +30% damage, but the Spire loses 40% max HP.', rarity: 'legendary' },
  overclock: { name: 'Overclock', description: 'Ability cooldowns are 25% shorter.', rarity: 'common' },
  bounty_banner: { name: 'Bounty Banner', description: 'Every second kill pays +1 gold.', rarity: 'common' },
  mint_condition: { name: 'Mint Condition', description: 'Mints yield +50% gold.', rarity: 'common' },
  stoneskin: { name: 'Stoneskin', description: 'Heavy hitters (Brutes, bosses) deal 1 less damage to the Spire (min 1).', rarity: 'rare' },
  keen_sights: { name: 'Keen Sights', description: '+10% critical hit chance.', rarity: 'common' },
  executioners_seal: { name: "Executioner's Seal", description: 'Critical hits deal +100% extra damage.', rarity: 'rare' },
  fortune_idol: { name: 'Fortune Idol', description: 'Kills have a 20% chance to drop double gold.', rarity: 'common' },
  quickdraw: { name: 'Quickdraw', description: 'All towers fire 10% faster.', rarity: 'common' },
  longsight: { name: 'Longsight', description: 'All towers gain +15% range.', rarity: 'rare' },
  field_medicine: { name: 'Field Medicine', description: 'The Spire knits +1 extra HP after every cleared wave.', rarity: 'common' },
  deep_pockets: { name: 'Deep Pockets', description: '+25% gold from wave clears.', rarity: 'common' },
  echo_chamber: { name: 'Echo Chamber', description: 'Tesla chains hop +1 target and 20% further.', rarity: 'rare' },
  colossus: { name: 'Colossus', description: 'All towers deal +25% damage. No catch.', rarity: 'legendary' },
  last_stand: { name: 'Last Stand', description: 'All towers deal +30% damage while the Spire is at half HP or less.', rarity: 'rare' },
  // ------ Transformative tier: these change HOW a tower plays, not just its
  // numbers. One per tower archetype; rare/legendary so a run sees one or
  // two and builds an identity around them.
  ricochet_strings: {
    name: 'Ricochet Strings',
    description: 'Arrow shots bounce to a second enemy within 1.4 cells for 50% damage.',
    rarity: 'rare',
  },
  cinder_shells: {
    name: 'Cinder Shells',
    description: 'Cannon hits ignite: 60% of the damage dealt burns over 2s, ignoring armor.',
    rarity: 'legendary',
  },
  shatterheart: {
    name: 'Shatterheart',
    description: 'Enemies that die while slowed detonate for 30% of their max HP within 1.2 cells.',
    rarity: 'legendary',
  },
  storm_coils: {
    name: 'Storm Coils',
    description: 'Tesla hits build Overcharge: +15% tesla damage per hit on that enemy, up to +75%.',
    rarity: 'rare',
  },
  deadeye_sigil: {
    name: 'Deadeye Sigil',
    description: 'Sniper hits execute non-boss enemies below 15% HP.',
    rarity: 'legendary',
  },
  golden_ledger: {
    name: 'Golden Ledger',
    description: 'Wave clear pays +10% of your banked gold as interest (max ⛀60).',
    rarity: 'rare',
  },
  prism_lens: {
    name: 'Prism Lens',
    description: 'Beacon auras also grant +10% crit chance to towers in range.',
    rarity: 'rare',
  },
  duelists_oath: {
    name: "Duelist's Oath",
    description: 'Lances keep half their ramp when switching targets — the climb never starts from nothing.',
    rarity: 'rare',
  },
  shatter: { name: 'Shatter', description: 'Slowed enemies take +20% damage.', rarity: 'rare' },
  soul_harvest: { name: 'Soul Harvest', description: 'Every 100th kill knits the Spire +1 HP.', rarity: 'legendary' },
}

export const RELIC_IDS = Object.keys(RELICS) as RelicId[]

// The anti-air roster, DERIVED — every UI string naming who can hit fliers
// reads this, so a new tower can never silently rot the docs again.
export const AA_TOWER_NAMES = Object.values(TOWERS)
  .filter((d) => d.hitsAir && !d.support)
  .map((d) => d.name)
export const AA_TOWER_LIST = `${AA_TOWER_NAMES.slice(0, -1).join(', ')}, and ${AA_TOWER_NAMES[AA_TOWER_NAMES.length - 1]}`
// Veterancy: kill counts at which a tower earns its stars. Render-only
// recognition (no stat change) — but the thresholds are data so the codex
// and the canvas can never disagree.
export const VETERANCY_TIERS = [10, 50, 150] as const

export function veterancyStars(kills: number): number {
  let stars = 0
  for (const need of VETERANCY_TIERS) if (kills >= need) stars++
  return stars
}

export const RELIC_WAVE_INTERVAL = 5
export const RELIC_OFFER_SIZE = 3

// Rarity weights for offer draws. Legendaries are events, not table stakes.
export const RELIC_RARITY_WEIGHTS: Record<RelicRarity, number> = { common: 60, rare: 32, legendary: 8 }

// Pity floor: from this wave on, an offer never rolls all commons while the
// pool still holds something better. Deep runs are decided by relics — an
// all-common wave-20 offer is a feels-bad blank, not variance worth keeping.
export const RELIC_PITY_WAVE = 15

// New relic mechanics.
export const QUICKDRAW_COOLDOWN_PCT = 90 // quickdraw: cooldowns ×0.9
export const LONGSIGHT_RANGE_PCT = 115 // longsight: range ×1.15
export const FIELD_MEDICINE_KNIT_HP = 1
export const DEEP_POCKETS_GOLD_PCT = 25
export const COLOSSUS_DAMAGE_PCT = 25

// Declining a relic offer is a real choice, not a trap: some relics carry
// downsides, and passing pays wave-scaled gold instead. Rerolling the offer
// once costs the same gold the skip would have paid.
export function relicSkipGold(wave: number): number {
  return 40 + wave * 8
}

// ---------------------------------------------------------------------------
// Probability layer: seeded chances that scale damage and income. All rolls
// come from the run's combat RNG stream — deterministic per seed, never
// Math.random.

export const PIERCING_ARROWS_PCT = 40 // relic: arrow damage bonus
export const GLASS_CANNON_PCT = 30 // relic: all-tower damage bonus

export const LAST_STAND_PCT = 30 // relic: damage while the spire is at half HP or less
export const SHATTER_BONUS_PCT = 20 // relic: bonus vs slowed enemies
export const SOUL_HARVEST_EVERY_KILLS = 100 // relic: kills per +1 HP knit

// Transformative relic numbers.
export const RICOCHET_PCT = 50 // second arrow hit deals this % of the shot
export const RICOCHET_RANGE = 1400 // millicells from the primary target
export const CINDER_BURN_PCT = 60 // % of dealt cannon damage burned over the DoT
export const CINDER_BURN_TICKS = 60 // 2s burn duration
export const SHATTERHEART_PCT = 30 // % of the dead enemy's max HP dealt
export const SHATTERHEART_RADIUS = 1200 // millicells around the corpse
export const STORM_COILS_PCT_PER_STACK = 15
export const STORM_COILS_MAX_STACKS = 5
export const DEADEYE_EXECUTE_PCT = 15 // execute threshold, % of max HP
export const GOLDEN_LEDGER_PCT = 10 // % of banked gold paid on wave clear
export const GOLDEN_LEDGER_CAP = 60 // interest ceiling per wave
export const PRISM_LENS_CRIT_PCT = 10 // crit chance inside a beacon aura

// Boss mechanics.
export const CARAPACE_BREAK_DAMAGE = 40 // a single hit this heavy shatters the carapace
export const GALE_SPEED_PCT = 140 // gale-hastened enemies move at this % (slows override)
export const GALE_HASTE_TICKS = 45

export const CRIT_BASE_DAMAGE_PCT = 200 // a crit deals this % of normal damage
export const CRIT_RELIC_CHANCE_PCT = 10 // keen_sights
export const CRIT_RELIC_DAMAGE_PCT = 100 // executioners_seal: added to the multiplier
export const FORTUNE_IDOL_CHANCE_PCT = 20 // chance a kill drops double gold

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
  shielded: { name: 'Shielded', description: 'Every enemy raises a small shield — pierce it or punch through it' },
}

// Flat shield every enemy gains under the Shielded affix (sniper-pierceable,
// single-blockable — the composition check, spread across a whole wave).
// Tuned at 4: at 2 the affix was so much softer than the rolls it displaced
// (a fifth of 'armored' draws became 'shielded') that the pinned
// Mortar-Blizzard genome won at 8k on gamma again. 4 keeps the wave-threat
// pool honest and the pin dead.
export const AFFIX_SHIELD_BONUS = 4

export const AFFIX_IDS = Object.keys(AFFIXES) as AffixId[]
export const AFFIX_FIRST_WAVE = 6
// 44 with a 5-affix pool keeps each affix's per-wave rate where the 4-pool
// had it (35/4 = 8.75% ≈ 44/5 = 8.8%): a new affix must ADD threat, not
// dilute armored/frenzied draws — dilution at 35% resurrected the pinned
// Mortar-Blizzard 8k win.
export const AFFIX_CHANCE_PCT = 44

// ---------------------------------------------------------------------------
// Trials: opt-in handicaps chosen at run start. Harder runs pay more sparks —
// a strong account's reason to turn the difficulty up instead of coasting.

export interface TrialDef {
  name: string
  description: string
  sparkBonusPct: number
}

export const TRIALS: Record<TrialId, TrialDef> = {
  glass_spire: { name: 'Glass Spire', description: 'Spire max HP is halved.', sparkBonusPct: 40 },
  swift_horde: { name: 'Swift Horde', description: 'Enemies move 15% faster.', sparkBonusPct: 25 },
  iron_horde: { name: 'Iron Horde', description: 'Enemies field 25% more HP.', sparkBonusPct: 35 },
  famine: { name: 'Famine', description: 'All gold income is cut by 25%.', sparkBonusPct: 30 },
  no_mercy: { name: 'No Mercy', description: 'The Spire cannot be repaired. What breaks stays broken.', sparkBonusPct: 45 },
  // An information handicap, not a stat one: the engine is untouched, the
  // scouting report goes dark in the UI. (Bots never read the report, so the
  // balance envelope can't price this — the bonus is set by feel.)
  blackout: { name: 'Blackout', description: 'The scouting report is dark — every wave arrives unseen.', sparkBonusPct: 25 },
}

export const TRIAL_IDS = Object.keys(TRIALS) as TrialId[]
export const TRIAL_IRON_HP_PCT = 125

// The Crucible: after each victory in a cycle, the next run's horde returns
// harder and richer. Applied per victory-this-cycle, snapshotted at run
// creation (RunState.crucible).
export const CRUCIBLE_HP_PCT_PER_RANK = 10
export const CRUCIBLE_SPARK_PCT_PER_RANK = 15

// Named Crucible tiers: rank milestones change the horde's TEXTURE, not
// just its HP number. Cumulative — a rank-4 run carries Seething AND
// Ironbound. Applied in the spawn pipeline; the HUD badge and next-run
// summary name the highest tier reached.
export interface CrucibleTier {
  rank: number
  name: string
  description: string
  speedPct: number // multiplies enemy speed
  armorBonus: number // flat armor on every enemy
}

export const CRUCIBLE_TIERS: CrucibleTier[] = [
  { rank: 2, name: 'Seething', description: 'the horde moves 5% faster', speedPct: 105, armorBonus: 0 },
  { rank: 4, name: 'Ironbound', description: 'every enemy gains +1 armor', speedPct: 100, armorBonus: 1 },
  { rank: 6, name: 'Unrelenting', description: 'the horde moves 5% faster still', speedPct: 105, armorBonus: 0 },
]

export function crucibleTiersAt(rank: number): CrucibleTier[] {
  return CRUCIBLE_TIERS.filter((t) => rank >= t.rank)
}
export const TRIAL_SWIFT_SPEED_PCT = 115
export const TRIAL_FAMINE_GOLD_PCT = -25

// ---------------------------------------------------------------------------
// Cataclysms: permanent, stacking run modifiers struck every 5th cleared wave
// past the victory wave. Endless is an escalating gauntlet, not a flat grind.

export interface CataclysmDef {
  name: string
  description: string
}

export const CATACLYSMS: Record<CataclysmId, CataclysmDef> = {
  surge: { name: 'Surge', description: 'Enemies move 20% faster — permanently.' },
  juggernaut: { name: 'Juggernaut', description: 'Enemies gain 30% HP — permanently.' },
  swarm: { name: 'Endless Swarm', description: 'Wave budgets grow 25% — permanently.' },
  dampening: { name: 'Dampening Field', description: 'All towers lose 10% damage — permanently.' },
  crumbling: { name: 'Crumbling', description: 'The Spire loses 2 max HP.' },
  ironclad: { name: 'Ironclad', description: 'Enemy shields are 50% stronger — permanently.' },
}

export const CATACLYSM_IDS = Object.keys(CATACLYSMS) as CataclysmId[]
export const CATACLYSM_WAVE_INTERVAL = 5 // struck on clearing waves 24, 29, 34, …

// ---------------------------------------------------------------------------
// Run pacing

export const BASE_WAVE_BUDGET = 95
export const WAVE_BUDGET_GROWTH_PCT = 118 // ×1.18 per wave
// Two-phase HP ramp: gentle early so fresh skill can express itself, steep
// after the break so the wall is real and meta progression is the only way
// through it. (A third, steeper endgame phase was tried when the first
// scheduled CI deep hunt found a cannon/sniper comp winning at 5k sparks on
// lucky seeds: every wall steep enough to kill those wins also broke the
// INTENDED path — the deep-tree reference could no longer win frostfen at
// 20k. The gap is play quality plus seed luck, not a curve hole, so the
// curve stays and the fuzz oracle demotes single-seed cheap wins instead.)
export const HP_GROWTH_EARLY_PCT = 115
export const HP_GROWTH_LATE_PCT = 122
export const HP_GROWTH_BREAK_WAVE = 8

export function hpGrowthPct(wave: number): number {
  return wave <= HP_GROWTH_BREAK_WAVE ? HP_GROWTH_EARLY_PCT : HP_GROWTH_LATE_PCT
}
export const MAX_UNITS_PER_WAVE = 320
export const BOSS_WAVE_INTERVAL = 10
export const VICTORY_WAVE = 24
export const WAVE_CLEAR_GOLD_BASE = 20
export const WAVE_CLEAR_GOLD_PER_WAVE = 6
export const STARTING_GOLD = 200
export const STARTING_SPIRE_HP = 10
export const REPAIR_MAX_PER_CAST = 3
// Mid-wave repairs are an emergency patch, not an HP engine: the build fuzzer
// found an all-offense account that tanked waves 20–24 on a 10-HP spire by
// converting kill gold straight into repairs under fire. Between waves the
// crews work freely; during a wave they manage this many casts.
export const REPAIR_CASTS_PER_WAVE = 1
export const WAVE_CLEAR_KNIT_HP = 1 // the spire knits itself after every cleared wave

// Repair gets pricier as waves escalate — sustain is a tool, not an
// infinite-HP engine. Each point is a tenth of the base spire.
export function repairCostPerHp(wave: number): number {
  return 40 + wave * 3
}
