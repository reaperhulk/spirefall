import { BOSS_WAVE_INTERVAL, ENEMIES, MAX_UNITS_PER_WAVE } from '../data/content'
import { nextInt, type Rng } from './rng'
import type { EnemyType, PendingSpawn } from './types'

const GROUP_GAP_TICKS = 25
const FIRST_SPAWN_DELAY = 30

const SPAWNABLE: EnemyType[] = ['runner', 'swarmling', 'brute', 'shieldbearer']

// Spend the wave's budget on enemy groups, drawn from the waves RNG stream.
// Returns spawn times relative to wave start; the caller absolutizes them.
export function generateWave(rng: Rng, wave: number, budget: number): { spawns: PendingSpawn[]; rng: Rng } {
  const spawns: PendingSpawn[] = []
  let r = rng
  let remaining = budget
  let t = FIRST_SPAWN_DELAY
  let units = 0

  if (wave % BOSS_WAVE_INTERVAL === 0) {
    spawns.push({ type: 'boss', tick: t })
    units += 1
    t += 60
    remaining = Math.floor(remaining / 2) // escort gets half the budget
  }

  for (;;) {
    const affordable = SPAWNABLE.filter((type) => {
      const def = ENEMIES[type]
      return def.unlockWave <= wave && def.cost * def.pack <= remaining
    })
    if (affordable.length === 0 || units >= MAX_UNITS_PER_WAVE) break

    const pick = nextInt(r, 0, affordable.length - 1)
    r = pick.rng
    const type = affordable[pick.value]!
    const def = ENEMIES[type]
    remaining -= def.cost * def.pack
    for (let i = 0; i < def.pack && units < MAX_UNITS_PER_WAVE; i++) {
      spawns.push({ type, tick: t })
      t += def.spacing
      units += 1
    }
    t += GROUP_GAP_TICKS
  }

  return { spawns, rng: r }
}

export function scaledHp(type: EnemyType, hpScalePct: number): number {
  return Math.max(1, Math.floor((ENEMIES[type].hp * hpScalePct) / 100))
}
