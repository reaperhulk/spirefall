import {
  AFFIX_CHANCE_PCT,
  AFFIX_FIRST_WAVE,
  AFFIX_IDS,
  BOSS_WAVE_INTERVAL,
  ENEMIES,
  MAX_UNITS_PER_WAVE,
} from '../data/content'
import { nextInt, type Rng } from './rng'
import type { AffixId, EnemyType, PendingSpawn } from './types'

const GROUP_GAP_TICKS = 12
const FIRST_SPAWN_DELAY = 15

const SPAWNABLE: EnemyType[] = ['runner', 'swarmling', 'brute', 'flier', 'shieldbearer', 'healer', 'splitter']

// Early waves are capped in unit count so seed variance can't triple the
// pressure on a fresh two-tower defense; the cap fades out by mid-game.
export function waveUnitCap(wave: number): number {
  return Math.min(MAX_UNITS_PER_WAVE, 6 + wave * 4)
}

export interface GeneratedWave {
  spawns: PendingSpawn[]
  affix: AffixId | null
  rng: Rng
}

// Spend the wave's budget on enemy groups, drawn from the waves RNG stream,
// possibly under a seeded affix that reshapes the wave. Spawn times are
// relative to wave start; the caller absolutizes them.
export function generateWave(rng: Rng, wave: number, budget: number): GeneratedWave {
  let r = rng

  // Affixes appear from AFFIX_FIRST_WAVE on (never on boss waves) and make
  // escalation legible: this wave is fast, or armored, or a horde.
  let affix: AffixId | null = null
  if (wave >= AFFIX_FIRST_WAVE && wave % BOSS_WAVE_INTERVAL !== 0) {
    const roll = nextInt(r, 1, 100)
    r = roll.rng
    if (roll.value <= AFFIX_CHANCE_PCT) {
      const pick = nextInt(r, 0, AFFIX_IDS.length - 1)
      r = pick.rng
      affix = AFFIX_IDS[pick.value]!
    }
  }

  let remaining = affix === 'horde' ? Math.floor((budget * 160) / 100) : budget
  let spawns: PendingSpawn[] = []
  let t = FIRST_SPAWN_DELAY
  let units = 0
  const unitCap = waveUnitCap(wave)

  if (wave % BOSS_WAVE_INTERVAL === 0) {
    spawns.push({ type: 'boss', tick: t })
    units += 1
    t += 40
    remaining = Math.floor(remaining / 2) // escort gets half the budget
  }

  for (;;) {
    const affordable = SPAWNABLE.filter((type) => {
      const def = ENEMIES[type]
      return def.unlockWave <= wave && def.cost * def.pack <= remaining
    })
    if (affordable.length === 0 || units >= unitCap) break

    const pick = nextInt(r, 0, affordable.length - 1)
    r = pick.rng
    const type = affordable[pick.value]!
    const def = ENEMIES[type]
    remaining -= def.cost * def.pack
    for (let i = 0; i < def.pack && units < unitCap; i++) {
      spawns.push({ type, tick: t })
      t += def.spacing
      units += 1
    }
    t += GROUP_GAP_TICKS
  }

  if (affix === 'vanguard') {
    spawns = spawns.map((s) => ({
      type: s.type,
      tick: FIRST_SPAWN_DELAY + Math.floor(((s.tick - FIRST_SPAWN_DELAY) * 60) / 100),
    }))
  }

  return { spawns, affix, rng: r }
}

export function scaledHp(type: EnemyType, hpScalePct: number): number {
  return Math.max(1, Math.floor((ENEMIES[type].hp * hpScalePct) / 100))
}

// Per-wave stat adjustments from the active affix.
export function affixHpPct(affix: AffixId | null): number {
  if (affix === 'armored') return 140
  if (affix === 'horde') return 70
  return 100
}

export function affixSpeedPct(affix: AffixId | null): number {
  return affix === 'frenzied' ? 130 : 100
}
