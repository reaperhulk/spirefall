import type { Rng } from './rng'
import type { RunState } from './types'

// Structural truths that must hold in every reachable state, no matter what
// commands or seeds produced it. The property suite hammers these with random
// inputs; the harness can also run them after every tick in dev builds.
export function assertInvariants(state: RunState): void {
  assertFiniteNumbers(state, 'state')

  check(Number.isInteger(state.tick) && state.tick >= 0, `tick must be a non-negative integer, got ${state.tick}`)
  check(Number.isInteger(state.wave) && state.wave >= 0, `wave must be a non-negative integer, got ${state.wave}`)
  check(Number.isInteger(state.gold) && state.gold >= 0, `gold must be a non-negative integer, got ${state.gold}`)
  check(
    Number.isInteger(state.spireHp) && state.spireHp >= 0 && state.spireHp <= state.spireMaxHp,
    `spireHp must be in [0, ${state.spireMaxHp}], got ${state.spireHp}`,
  )
  check(state.sparksEarned >= 0, `sparksEarned must be non-negative, got ${state.sparksEarned}`)

  check(
    (state.phase === 'wave') === (state.activeWave !== null),
    `activeWave must exist iff phase is 'wave' (phase=${state.phase})`,
  )
  if (state.activeWave !== null) {
    check(state.activeWave.remainingTicks > 0, 'activeWave.remainingTicks must be positive')
    check(state.activeWave.hitDamage > 0, 'activeWave.hitDamage must be positive')
  }

  const streams: [string, Rng][] = [
    ['waves', state.rng.waves],
    ['combat', state.rng.combat],
    ['relics', state.rng.relics],
  ]
  for (const [name, rng] of streams) {
    for (const word of ['a', 'b', 'c', 'd'] as const) {
      const value = rng[word]
      check(
        Number.isInteger(value) && value >= 0 && value <= 0xffffffff,
        `rng.${name}.${word} must be a uint32, got ${value}`,
      )
    }
  }
}

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(`invariant violated: ${message}`)
}

function assertFiniteNumbers(value: unknown, path: string): void {
  if (typeof value === 'number') {
    check(Number.isFinite(value), `${path} must be finite, got ${value}`)
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => assertFiniteNumbers(v, `${path}[${i}]`))
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) assertFiniteNumbers(v, `${path}.${k}`)
  }
}
