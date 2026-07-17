import { describe, expect, it } from 'vitest'
import { createMeta, createRun } from '../../engine/meta'
import { deriveStream } from '../../engine/rng'
import { autoplay, spendSparks } from '../autoplay'
import { classify, fuzzBuilds } from '../fuzz'
import { makePolicyBot, mutateGenome, type PolicyGenome, randomGenome } from '../policy'

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

  // Pinned find from the 2026-07 deep hunt: an all-offense account (Honed
  // Arsenal first, zero spire HP) that tanked waves 20–24 on a 10-HP spire
  // by spamming mid-wave repairs — victory at 5k sparks against a ~20k
  // curve. The per-wave repair-cast cap is what kills it; this pin keeps it
  // dead. If this test goes red, the repair economy has reopened.
  const HONED_ALLIN: PolicyGenome = {
    ratio: { arrow: 4, cannon: 6, frost: 0, tesla: 2, sniper: 2, mint: 1, beacon: 1 },
    earlyType: 'arrow',
    upgradeAtTowers: 8,
    targetBase: 6,
    targetPerWave: 1,
    targetMax: 16,
    enhanceStrategy: 'tesla',
    repairDeficit: 2,
    repairMinGold: 180,
    waveRepairPct: 30,
    relicPriority: [
      'longsight', 'piercing_arrows', 'stoneskin', 'overclock', 'keen_sights', 'fortune_idol',
      'executioners_seal', 'glass_cannon', 'overcharge', 'colossus', 'quickdraw', 'deep_pockets',
      'mint_condition', 'heavy_powder', 'bounty_banner', 'field_medicine', 'winters_grip',
      'spark_siphon', 'echo_chamber', 'golden_touch',
    ],
    metaPriority: [
      'tower_damage', 'unlock_tesla', 'unlock_mint', 'unlock_bulwark', 'crit_chance', 'wave_skip',
      'unlock_beacon', 'gold_income', 'spire_hp', 'spark_gain', 'unlock_gold_rush', 'starting_gold',
    ],
  }

  it('pinned find: the Honed-Arsenal all-in cannot win cheap anymore', () => {
    const bot = makePolicyBot(HONED_ALLIN)
    for (const budget of [5000, 8000]) {
      for (const seed of ['alpha', 'gamma']) {
        const meta = spendSparks({ ...createMeta(), sparks: budget }, HONED_ALLIN.metaPriority)
        const { state } = autoplay(createRun(meta, seed), bot, 120_000)
        expect(state.phase, `${seed} @ ${budget} sparks`).toBe('defeat')
      }
    }
  }, 300_000)

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
