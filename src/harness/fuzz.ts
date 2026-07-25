import type { BiomeId } from '../data/biomes'
import { createMeta, createRun } from '../engine/meta'
import { deriveStream } from '../engine/rng'
import type { MetaState, TowerType } from '../engine/types'
import { autoplay, spendSparks } from './autoplay'
import { BOTS } from './bots'
import { DEFAULT_BUY_PRIORITY } from './scenarios'
import { makePolicyBot, mutateGenome, type PolicyGenome, randomGenome, TOWER_TYPES } from './policy'

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
//
// Both thresholds below were re-derived from measurement in 2026-07 rather
// than argued from the design doc, and both came back where they already
// stood. Intended play (the balanced bot) reaches 18-20 waves at 14k and
// wins at 20k on 3 of 4 seeds. A 1600-run evolutionary hunt, after the beam
// soft-lock was closed, tops out at 20 waves at 5k, 23 at 8k, 20 at 10k —
// and wins at 14k. So the real shape is: nothing wins at or below 10k,
// optimized play wins from ~14k, intended play wins at ~20k.
//
// That gap is the SKILL CEILING, not curve drift: a 14k victory means an
// expert build is about 6k ahead of the reference, which is the game having
// build depth. Hence warning, not breaking — the log should mention it, and
// nobody should rebalance because of it.
export const BREAKING_VICTORY_BUDGET = 10_000 // any win at or below this budget is a broken build
export const WARNING_VICTORY_BUDGET = 14_000 // the measured expert ceiling — expected, worth watching
// Overperformance is measured against the balanced bot — the strongest bot
// that plays the INTENDED way (measured 2026-07: balanced reaches 9-11 waves
// at 0 sparks and wins at 20k on 3 of 4 seeds, while greedy plateaus at
// 11-13 everywhere, so balanced is the yardstick, not merely the default).
//
// The margin is proportional, not flat. A fixed "+7 waves" means wildly
// different things at each end of the curve: +7 over a 9-wave fresh-account
// reference is a build that DOUBLES intended play, while +7 over a 20-wave
// deep-tree reference is a third better. The old flat rule fired on every
// low-budget genome and stayed silent on high-budget ones, which is exactly
// backwards from where a curve break hides — and it trained readers to skim
// past warnings. A ratio asks the same question at every budget: did this
// build reach dramatically further than intended play at equal investment?
export const WARNING_OVERPERFORMANCE_NUM = 3 // 3/2 → 50% deeper than the reference
export const WARNING_OVERPERFORMANCE_DEN = 2
export const WARNING_OVERPERFORMANCE_FLOOR = 6 // absolute guard so shallow references cannot trip on noise

// Kept as integer math (house rule: no float thresholds in graded output).
export function overperformanceThreshold(referenceWaves: number): number {
  return Math.max(
    referenceWaves + WARNING_OVERPERFORMANCE_FLOOR,
    Math.ceil((referenceWaves * WARNING_OVERPERFORMANCE_NUM) / WARNING_OVERPERFORMANCE_DEN),
  )
}
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
  // Battlefield to hunt on. Default verdant — but feature biomes have their
  // own exploit surface (marsh choke points, mesa range, vent damage), so
  // deep hunts should sweep them too (FUZZ_BIOME env in the CI test).
  biome?: BiomeId | undefined
}

export interface FuzzResult {
  findings: FuzzFinding[]
  evaluated: number
  bestByBudget: Record<number, { wavesCleared: number; genome: PolicyGenome }>
  // Which strategy archetypes the search actually visited, per budget —
  // breadth is MEASURED, not assumed.
  nichesByBudget: Record<number, string[]>
}

// The niche a genome competes in: spatial doctrine × dominant tower ×
// enhancement concentration. The archive keeps the best genome of EVERY
// niche alive as breeding stock (MAP-elites-lite), so qualitatively
// different strategies — a mazing mono-arrow, a choke-stacked sniper
// focus build — keep evolving instead of being culled by this
// generation's single best basin.
export function archetype(genome: PolicyGenome): string {
  let dominant: TowerType = 'arrow'
  let bestW = -1
  for (const t of TOWER_TYPES) {
    const w = genome.ratio[t]
    if (w > bestW) {
      bestW = w
      dominant = t
    }
  }
  return `${genome.placement ?? 'pathAdjacent'}:${dominant}:${genome.enhanceFocus ?? 'spread'}`
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

function* evaluate(
  genome: PolicyGenome,
  budget: number,
  seeds: string[],
  evaluated: number,
  biome?: BiomeId,
): Generator<FuzzStep, EvalOutcome[], void> {
  const bot = makePolicyBot(genome)
  const runs: EvalOutcome[] = []
  for (const seed of seeds) {
    const { state } = autoplay(createRun(metaFor(budget, genome.metaPriority), seed, biome), bot, MAX_TICKS)
    runs.push({
      wavesCleared: state.wavesCleared,
      outcome: state.phase === 'victory' ? ('victory' as const) : ('defeat' as const),
      seed,
    })
    yield { phase: 'evaluate', budget, evaluated: evaluated + runs.length }
  }
  return runs
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
  if (run.wavesCleared >= overperformanceThreshold(referenceWaves)) {
    // Report the multiple so a human can RANK findings instead of drowning
    // in equally-worded ones: 2.0x intended play reads louder than 1.5x.
    const tenths = referenceWaves > 0 ? Math.round((run.wavesCleared * 10) / referenceWaves) : 0
    const multiple = `${Math.floor(tenths / 10)}.${tenths % 10}x`
    return {
      severity: 'warning',
      reason: `${run.wavesCleared} waves vs balanced reference ${referenceWaves} at ${budget} sparks (${multiple} intended play)`,
    }
  }
  return null
}

// A breathing point between two chunks of simulation. A deep sweep is
// minutes of straight-line work; a caller that must stay responsive (the CI
// test — its worker owes a reporter heartbeat) drives the generator and
// awaits a macrotask on every yield. Yields sit after each individual
// autoplay, so the longest uninterrupted block is ONE bot run, not the whole
// hunt. Breathing cannot change the search: the generator resumes exactly
// where it paused, on the same RNG thread, so the blocking `fuzzBuilds`
// below still returns identical findings (pinned by a test).
export interface FuzzStep {
  phase: 'reference' | 'evaluate'
  budget: number
  evaluated: number
}

export function* fuzzBuildsSteps(opts: FuzzOptions): Generator<FuzzStep, FuzzResult, void> {
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
      const { state } = autoplay(createRun(meta, seed, opts.biome), BOTS.balanced, MAX_TICKS)
      reference.set(`${budget}:${seed}`, state.wavesCleared)
      yield { phase: 'reference', budget, evaluated }
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
  const nichesByBudget: FuzzResult['nichesByBudget'] = {}
  for (const budget of opts.budgets) {
    // Seed the population with fresh random genomes.
    let population: { genome: PolicyGenome; score: number }[] = []
    for (let i = 0; i < opts.population; i++) {
      const g = randomGenome(rng)
      rng = g.rng
      population.push({ genome: g.genome, score: 0 })
    }

    // Niche archive: the best genome per archetype, persisted across
    // generations for this budget. Elites live HERE, not in the population
    // — re-evaluating a deterministic elite would only waste runs.
    const archive = new Map<string, { genome: PolicyGenome; score: number }>()

    for (let gen = 0; gen < opts.generations; gen++) {
      for (const member of population) {
        const runs = yield* evaluate(member.genome, budget, opts.seeds, evaluated, opts.biome)
        evaluated += runs.length
        member.score = record(member.genome, budget, runs)
        const key = archetype(member.genome)
        const held = archive.get(key)
        if (!held || member.score > held.score) archive.set(key, { genome: member.genome, score: member.score })
      }
      population.sort((a, b) => b.score - a.score)
      const best = population[0]!
      if (!bestByBudget[budget] || best.score > bestByBudget[budget].wavesCleared) {
        bestByBudget[budget] = { wavesCleared: best.score, genome: best.genome }
      }
      if (gen === opts.generations - 1) break

      // Next generation: mutants drawn round-robin from EVERY niche elite
      // (strongest niches first), topped up with fresh randoms. Breeding
      // from all niches is what carries the search across the
      // combinatorial space instead of collapsing into one basin.
      const parents = [...archive.values()].sort((a, b) => b.score - a.score)
      const next: typeof population = []
      while (next.length < opts.population - 2) {
        const parent = parents[next.length % parents.length]!.genome
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
    nichesByBudget[budget] = [...archive.keys()].sort()
  }

  calibrateFindings(findings)

  findings.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'breaking' ? -1 : 1))
  return { findings, evaluated, bestByBudget, nichesByBudget }
}

// Run the whole hunt in one blocking call. Fine for short sweeps; a caller
// that must not monopolise its thread for minutes should drive
// `fuzzBuildsSteps` directly instead.
export function fuzzBuilds(opts: FuzzOptions): FuzzResult {
  const steps = fuzzBuildsSteps(opts)
  for (;;) {
    const step = steps.next()
    if (step.done) return step.value
  }
}

// Seed-luck calibration: a cheap victory is only a ROBUST exploit if the
// same genome converts on 2+ seeds at that budget. The first scheduled CI
// hunt proved the need — its 5k-victory finds were one lucky seed each, and
// every HP wall steep enough to seal them also broke the intended deep-tree
// path. The curve is defended against strategies, not dice: single-seed
// cheap wins demote to warnings (still logged, with repro genomes).
export function calibrateFindings(findings: FuzzFinding[]): void {
  const cheapWins = findings.filter((f) => f.severity === 'breaking')
  const key = (f: FuzzFinding): string => `${f.budget}:${JSON.stringify(f.genome)}`

  const seedsOf = new Map<string, Set<string>>()
  for (const f of cheapWins) {
    if (!seedsOf.has(key(f))) seedsOf.set(key(f), new Set())
    seedsOf.get(key(f))!.add(f.seed)
  }
  const lucky = cheapWins.filter((f) => seedsOf.get(key(f))!.size < 2)

  // Seed softness is a claim about ONE genome drawing a friendly map. When
  // several INDEPENDENT genomes each convert a cheap win on DIFFERENT seeds,
  // that excuse stops working: the budget itself is winnable, and demoting
  // each of them in isolation lets a broken curve pass in silence. That is
  // exactly how the 2026-07 hunt read — two unrelated builds won at 5k, one
  // seed each, and both were waved through as dice.
  const softBudgets = new Set<number>()
  for (const budget of new Set(lucky.map((f) => f.budget))) {
    const atBudget = lucky.filter((f) => f.budget === budget)
    const genomes = new Set(atBudget.map((f) => JSON.stringify(f.genome)))
    const seeds = new Set(atBudget.map((f) => f.seed))
    if (genomes.size >= 2 && seeds.size >= 2) softBudgets.add(budget)
  }

  for (const f of lucky) {
    if (softBudgets.has(f.budget)) {
      f.reason += ' (single-seed, but independent builds also win here — the BUDGET is soft)'
      continue
    }
    f.severity = 'warning'
    f.reason += ' (single-seed — seed softness, not a robust exploit)'
  }
}
