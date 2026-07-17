import { createMeta, createRun } from '../engine/meta'
import { deriveStream } from '../engine/rng'
import type { MetaState } from '../engine/types'
import { autoplay, spendSparks } from './autoplay'
import { BOTS } from './bots'
import { DEFAULT_BUY_PRIORITY } from './scenarios'
import { makePolicyBot, mutateGenome, type PolicyGenome, randomGenome } from './policy'

// The build fuzzer: an evolutionary search over PolicyGenome space that hunts
// for strategies which BREAK the intended difficulty curve — winning far
// cheaper than the design says a win should cost, or wildly outperforming
// the balanced reference at the same investment. A human found mono-arrow
// cheese by hand; this system exists to find the next one first.
//
// Everything is seeded: same fuzz seed → same genomes → same runs → same
// findings. A finding carries its full genome, budget, and map seed, so any
// break is a one-liner to reproduce and pin as a regression.

// The curve contract (PLAN §2.3): a mixed comp needs ~20k sparks to win.
export const BREAKING_VICTORY_BUDGET = 10_000 // any win at or below this budget is a broken build
export const WARNING_VICTORY_BUDGET = 14_000 // wins here are suspiciously cheap
export const WARNING_OVERPERFORMANCE = 7 // waves beyond the balanced reference at equal budget
export const WARNING_ENDLESS_WAVES = 34 // endless scaling should end everyone by here

const MAX_TICKS = 120_000 // ~67 sim-minutes; every real run ends far sooner

export interface FuzzFinding {
  severity: 'breaking' | 'warning'
  reason: string
  budget: number
  seed: string
  wavesCleared: number
  outcome: 'victory' | 'defeat'
  referenceWaves: number
  genome: PolicyGenome
}

export interface FuzzOptions {
  fuzzSeed: string
  budgets: number[]
  seeds: string[]
  population: number
  generations: number
}

export interface FuzzResult {
  findings: FuzzFinding[]
  evaluated: number
  bestByBudget: Record<number, { wavesCleared: number; genome: PolicyGenome }>
}

interface EvalOutcome {
  wavesCleared: number
  outcome: 'victory' | 'defeat'
  seed: string
}

function metaFor(budget: number, priority: PolicyGenome['metaPriority']): MetaState {
  if (budget <= 0) return createMeta()
  return spendSparks({ ...createMeta(), sparks: budget }, priority)
}

function evaluate(genome: PolicyGenome, budget: number, seeds: string[]): EvalOutcome[] {
  const bot = makePolicyBot(genome)
  return seeds.map((seed) => {
    const { state } = autoplay(createRun(metaFor(budget, genome.metaPriority), seed), bot, MAX_TICKS)
    return {
      wavesCleared: state.wavesCleared,
      outcome: state.phase === 'victory' ? ('victory' as const) : ('defeat' as const),
      seed,
    }
  })
}

// Pure classification of one run against the curve contract — unit-testable
// without running any simulation.
export function classify(
  run: EvalOutcome,
  budget: number,
  referenceWaves: number,
): { severity: FuzzFinding['severity']; reason: string } | null {
  if (run.outcome === 'victory' && budget <= BREAKING_VICTORY_BUDGET) {
    return {
      severity: 'breaking',
      reason: `victory at ${budget} sparks — the curve says a win costs ~20k`,
    }
  }
  if (run.outcome === 'victory' && budget <= WARNING_VICTORY_BUDGET) {
    return { severity: 'warning', reason: `suspiciously cheap victory at ${budget} sparks` }
  }
  if (run.wavesCleared >= WARNING_ENDLESS_WAVES) {
    return {
      severity: 'warning',
      reason: `reached wave ${run.wavesCleared} — endless scaling is too soft`,
    }
  }
  if (run.wavesCleared >= referenceWaves + WARNING_OVERPERFORMANCE) {
    return {
      severity: 'warning',
      reason: `${run.wavesCleared} waves vs balanced reference ${referenceWaves} at ${budget} sparks`,
    }
  }
  return null
}

export function fuzzBuilds(opts: FuzzOptions): FuzzResult {
  let rng = deriveStream(opts.fuzzSeed, 'build-fuzz')
  const findings: FuzzFinding[] = []
  const seenFindings = new Set<string>()
  let evaluated = 0

  // Balanced-bot reference per (budget, seed): "how good is the intended
  // strategy here" — overperformance is measured against this.
  const reference = new Map<string, number>()
  for (const budget of opts.budgets) {
    for (const seed of opts.seeds) {
      const meta = budget <= 0 ? createMeta() : spendSparks({ ...createMeta(), sparks: budget }, DEFAULT_BUY_PRIORITY)
      const { state } = autoplay(createRun(meta, seed), BOTS.balanced, MAX_TICKS)
      reference.set(`${budget}:${seed}`, state.wavesCleared)
    }
  }

  const record = (genome: PolicyGenome, budget: number, runs: EvalOutcome[]): number => {
    let best = 0
    for (const run of runs) {
      best = Math.max(best, run.wavesCleared)
      const referenceWaves = reference.get(`${budget}:${run.seed}`)!
      const hit = classify(run, budget, referenceWaves)
      if (hit) {
        const key = `${hit.severity}:${hit.reason}:${JSON.stringify(genome)}:${run.seed}`
        if (!seenFindings.has(key)) {
          seenFindings.add(key)
          findings.push({ ...hit, budget, seed: run.seed, wavesCleared: run.wavesCleared, outcome: run.outcome, referenceWaves, genome })
        }
      }
    }
    return best
  }

  const bestByBudget: FuzzResult['bestByBudget'] = {}
  for (const budget of opts.budgets) {
    // Seed the population with fresh random genomes.
    let population: { genome: PolicyGenome; score: number }[] = []
    for (let i = 0; i < opts.population; i++) {
      const g = randomGenome(rng)
      rng = g.rng
      population.push({ genome: g.genome, score: 0 })
    }

    for (let gen = 0; gen < opts.generations; gen++) {
      for (const member of population) {
        const runs = evaluate(member.genome, budget, opts.seeds)
        evaluated += runs.length
        member.score = record(member.genome, budget, runs)
      }
      population.sort((a, b) => b.score - a.score)
      const best = population[0]!
      if (!bestByBudget[budget] || best.score > bestByBudget[budget].wavesCleared) {
        bestByBudget[budget] = { wavesCleared: best.score, genome: best.genome }
      }
      if (gen === opts.generations - 1) break

      // Next generation: keep the top third, mutate them, top up with fresh
      // randoms so the search never collapses into one basin.
      const keep = Math.max(1, Math.floor(opts.population / 3))
      const next: typeof population = population.slice(0, keep).map((m) => ({ ...m, score: 0 }))
      while (next.length < opts.population - 2) {
        const parent = next[next.length % keep]!.genome
        const m = mutateGenome(rng, parent)
        rng = m.rng
        next.push({ genome: m.genome, score: 0 })
      }
      while (next.length < opts.population) {
        const g = randomGenome(rng)
        rng = g.rng
        next.push({ genome: g.genome, score: 0 })
      }
      population = next
    }
  }

  findings.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'breaking' ? -1 : 1))
  return { findings, evaluated, bestByBudget }
}
