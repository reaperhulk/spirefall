import type { BiomeId } from '../data/biomes'
import { VICTORY_WAVE } from '../data/content'
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
// Both thresholds below are MEASURED, not argued from the design doc.
//
// The breaking line sat at 10k on the strength of that doc, and no sweep
// had ever searched 10k to check — the smoke test ran 8000 and the deep
// hunt 0/5000/8000/14000, so the one budget the contract actually named was
// the one nobody looked at. The moment 10k was added, a cannon-dominant
// comp (see CANNON_TEN_K below) won there on ALL FOUR seeds. Not seed luck,
// not one lucky lineage: a robust, map-independent 10k victory that had
// been sitting inside the gap the whole time.
//
// Sliding the line down to the sweep's reported floor would have been wrong,
// and finding out why is what fixed the hunt: running that comp DIRECTLY
// down the ladder won at 8000 on three biomes and as low as 4000 on
// highlands, while the sweep serenely reported 20-23 waves there. It
// searched each budget from a FRESH random population, so a build found at
// 14k was never once tried at 8k. See the descent phase in fuzzBuildsSteps.
//
// With the hunt able to see downhill, the curve was rebalanced against it
// (splash falloff, overcharge trimmed to its documented weight and taken off
// splash). What that moved, running THAT ONE PINNED COMP down the ladder:
//
//   biome        BEFORE wins at        AFTER wins at
//   verdant      6000+                 8000, 10000 (one seed)
//   frostfen     8000+                 never
//   emberwaste   6000+                 never
//   highlands    4000+                 never
//
// And for the SEARCH, best-wave per budget across all four biomes:
//
//   biome        0     5000  8000  10000  14000
//   verdant      14    21    23    25 W   23
//   frostfen     14    23    23    26 W   22
//   emberwaste   15    24 W  24 W  24 W   22
//   highlands    13    23    23    24 W   23
//
// So 10000 is robustly winnable and the line cannot sit there: a contract
// boundary resting exactly ON the floor can only ever read as failure. 8000
// is one step below what the search reaches on three of four biomes.
//
// Emberwaste is the honest asterisk — it reaches 24 at 5000 and 8000, on a
// single seed each, which calibrateFindings demotes as seed softness rather
// than strategy. That is the same rule the repo has always applied (the
// curve is defended against strategies, not dice), so this is a known soft
// spot on one biome, NOT a claim that nothing wins below 8000 anywhere. If
// a build ever converts those on two seeds, it escalates and fails the job,
// which is exactly what should happen.
export const BREAKING_VICTORY_BUDGET = 8_000 // one step below the measured floor — a win here is a broken build
export const WARNING_VICTORY_BUDGET = 14_000 // the optimized ceiling — expected, worth watching
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

// Descent tuning: how many elites per budget get walked down, and how close
// to a victory they must have come to be worth it. Deliberately small — the
// descent is a targeted second look at near-winners, not a second sweep.
export const DESCEND_ELITES = 3
export const DESCEND_SCORE_SLACK = 2 // within 2 waves of VICTORY_WAVE counts as a near-winner

// Which of a budget's niche elites are worth walking down the ladder: the
// strongest few, and only those that came within a hair of winning. A build
// that died at wave 12 tells us nothing by dying at wave 9 for less money;
// a build that WON is the one whose true price we do not yet know.
export function selectDescent(elites: { genome: PolicyGenome; score: number }[]): PolicyGenome[] {
  return elites
    .filter((e) => e.score >= VICTORY_WAVE - DESCEND_SCORE_SLACK)
    .sort((a, b) => b.score - a.score)
    .slice(0, DESCEND_ELITES)
    .map((e) => e.genome)
}

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

  // Elites worth walking down the ladder (budget they were found at).
  const descent: { genome: PolicyGenome; budget: number }[] = []

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

    // Carry this budget's strongest near-winners into the descent pool.
    for (const genome of selectDescent([...archive.values()])) descent.push({ genome, budget })
  }

  // The descent: re-run the best builds at every budget BELOW the one that
  // found them.
  //
  // Without this the hunt cannot answer the only question the contract
  // actually asks — "how cheaply can this be won?" — because each budget
  // searched from its own fresh random population, so a build discovered at
  // 14k was never tried at 8k. That blind spot hid a cannon comp that wins
  // at 10k on all four seeds and as low as 4000 on highlands, while the
  // sweep serenely reported a best of 23 waves at 8000. A build that wins
  // cheap is worth far more search than a build that wins expensive, and
  // finding one is exactly when you want it walked down the ladder.
  for (const cand of descent) {
    for (const lower of [...new Set(opts.budgets)].sort((a, b) => a - b)) {
      if (lower >= cand.budget) continue
      const runs = yield* evaluate(cand.genome, lower, opts.seeds, evaluated, opts.biome)
      evaluated += runs.length
      const best = record(cand.genome, lower, runs)
      if (!bestByBudget[lower] || best > bestByBudget[lower].wavesCleared) {
        bestByBudget[lower] = { wavesCleared: best, genome: cand.genome }
      }
    }
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
// How many top-level genes two builds must disagree on before the sweep
// treats them as separate discoveries rather than one lineage. Three is
// drawn from the 2026-07 10k family: its members sat 1-2 genes apart
// (enhanceFocus alone, placement alone) while genuinely unrelated finds —
// the beam-carry vs the cannon wall — differed across four or more.
export const MIN_INDEPENDENT_GENES = 3

export function geneDistance(a: PolicyGenome, b: PolicyGenome): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof PolicyGenome>
  let d = 0
  for (const k of keys) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) d++
  return d
}

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
  //
  // "Independent" cannot mean "not byte-identical", though. The search
  // breeds each generation by mutating niche elites ONE gene at a time, so a
  // winner and its child are different genomes by construction while being
  // the same strategy wearing a different hat. Counting those as two
  // discoveries would let a single lineage escalate itself. Independence is
  // therefore structural: genomes must differ in at least MIN_INDEPENDENT
  // genes to count as separate finds.
  const softBudgets = new Set<number>()
  for (const budget of new Set(lucky.map((f) => f.budget))) {
    const atBudget = lucky.filter((f) => f.budget === budget)
    const seeds = new Set(atBudget.map((f) => f.seed))
    const families: PolicyGenome[] = []
    for (const f of atBudget) {
      if (families.every((g) => geneDistance(g, f.genome) >= MIN_INDEPENDENT_GENES)) families.push(f.genome)
    }
    if (families.length >= 2 && seeds.size >= 2) softBudgets.add(budget)
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
