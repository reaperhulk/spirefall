import { describe, expect, it } from 'vitest'
import { createMeta, createRun } from '../../engine/meta'
import { deriveStream } from '../../engine/rng'
import { classify, fuzzBuilds } from '../fuzz'
import { makePolicyBot, mutateGenome, randomGenome } from '../policy'

// The build fuzzer hunts for strategies that break the difficulty curve.
// The CI sweep here is deliberately small (deterministic, ~30 runs); crank
// it with `npm run fuzz:builds` for a deep search. A red sweep means a
// genome printed above it wins far cheaper than the curve allows — fix the
// balance, then consider pinning that genome as a named bot.

describe('build fuzzer', () => {
  it('genome generation and mutation are deterministic from the seed', () => {
    const a = randomGenome(deriveStream('fuzz-det', 'build-fuzz'))
    const b = randomGenome(deriveStream('fuzz-det', 'build-fuzz'))
    expect(a.genome).toEqual(b.genome)
    const ma = mutateGenome(a.rng, a.genome)
    const mb = mutateGenome(b.rng, b.genome)
    expect(ma.genome).toEqual(mb.genome)
  })

  it('policy bots are pure functions of state', () => {
    const { genome } = randomGenome(deriveStream('fuzz-pure', 'build-fuzz'))
    const bot = makePolicyBot(genome)
    const run = createRun(createMeta(), 'policy-pure')
    expect(bot(run)).toEqual(bot(run))
  })

  it('the oracle classifies runs against the curve contract', () => {
    const win = { wavesCleared: 24, outcome: 'victory' as const, seed: 'x' }
    expect(classify(win, 8_000, 20)?.severity).toBe('breaking') // cheap win = broken build
    expect(classify(win, 14_000, 20)?.severity).toBe('warning') // suspiciously cheap
    expect(classify(win, 20_000, 20)).toBeNull() // a 20k win is the intended curve
    expect(classify({ wavesCleared: 36, outcome: 'defeat', seed: 'x' }, 20_000, 27)?.reason).toMatch(/endless/)
    expect(classify({ wavesCleared: 26, outcome: 'defeat', seed: 'x' }, 5_000, 17)?.reason).toMatch(/reference/)
    expect(classify({ wavesCleared: 18, outcome: 'defeat', seed: 'x' }, 5_000, 17)).toBeNull() // near the reference is fine
  })

  it('sweep finds no curve-breaking build (deep mode: npm run fuzz:builds)', () => {
    const result = fuzzBuilds({
      fuzzSeed: process.env['FUZZ_SEED'] ?? 'ci-sweep',
      budgets: (process.env['FUZZ_BUDGETS'] ?? '8000').split(',').map(Number),
      seeds: (process.env['FUZZ_SEEDS'] ?? 'alpha,gamma').split(','),
      population: Number(process.env['FUZZ_POP'] ?? 6),
      generations: Number(process.env['FUZZ_GENS'] ?? 2),
    })
    for (const f of result.findings) {
      console.log(
        `[${f.severity}] ${f.reason} — seed ${f.seed}, ${f.wavesCleared} waves (ref ${f.referenceWaves})\n` +
          `  repro genome: ${JSON.stringify(f.genome)}`,
      )
    }
    console.log(`fuzz sweep: ${result.evaluated} runs evaluated`)
    for (const [budget, best] of Object.entries(result.bestByBudget)) {
      console.log(`  best @ ${budget} sparks: ${best.wavesCleared} waves`)
    }
    const breaking = result.findings.filter((f) => f.severity === 'breaking')
    expect(breaking, breaking.map((f) => f.reason).join('; ')).toEqual([])
  }, 600_000)
})
