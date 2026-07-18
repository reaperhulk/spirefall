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

  it('mutation actually reaches every breadth axis', () => {
    // Chain mutations and require each new gene axis to move at least once
    // — a slot that can never fire silently narrows the search space.
    let { genome, rng } = randomGenome(deriveStream('fuzz-axes', 'build-fuzz'))
    const seen = { placement: false, spec: false, targeting: false, focus: false }
    for (let i = 0; i < 300; i++) {
      const m = mutateGenome(rng, genome)
      if (m.genome.placement !== genome.placement) seen.placement = true
      if (JSON.stringify(m.genome.specByType) !== JSON.stringify(genome.specByType)) seen.spec = true
      if (JSON.stringify(m.genome.targetingByType) !== JSON.stringify(genome.targetingByType)) seen.targeting = true
      if (m.genome.enhanceFocus !== genome.enhanceFocus) seen.focus = true
      genome = m.genome
      rng = m.rng
    }
    expect(seen).toEqual({ placement: true, spec: true, targeting: true, focus: true })
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
    specChoice: 0,
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

  // Second pinned find (2026-07, iteration-50 deep hunt): a mint-heavy
  // economy comp riding Bounty Banner (+1 gold per kill — linear in the
  // horde's body count) plus Glass Cannon into 5k/8k victories on beta and
  // gamma. Bounty Banner now pays on every SECOND kill and Glass Cannon
  // costs 40% max HP; those kill every 5k win. One razor-thin 8k win on
  // beta survives all reasonable relic tuning — it is build-order
  // optimality, not a relic exploit — so this pin holds the line exactly
  // there: any 5k win, or any 8k win beyond beta, is a regression.
  const BOUNTY_ECONOMY: PolicyGenome = {
    ratio: { arrow: 7, cannon: 6, frost: 5, tesla: 1, sniper: 7, mint: 8, beacon: 0 },
    earlyType: 'arrow',
    upgradeAtTowers: 6,
    targetBase: 2,
    targetPerWave: 1,
    targetMax: 21,
    enhanceStrategy: 'frost',
    repairDeficit: 2,
    repairMinGold: 170,
    waveRepairPct: 70,
    specChoice: 1,
    relicPriority: [
      'bounty_banner', 'glass_cannon', 'echo_chamber', 'last_stand', 'deep_pockets', 'stoneskin',
      'spark_siphon', 'soul_harvest', 'colossus', 'fortune_idol', 'shatter', 'keen_sights',
      'mint_condition', 'piercing_arrows', 'executioners_seal', 'quickdraw', 'overclock', 'longsight',
      'field_medicine', 'winters_grip', 'overcharge', 'golden_touch', 'heavy_powder',
    ],
    metaPriority: [
      'tower_damage', 'unlock_tesla', 'unlock_bulwark', 'gold_income', 'spire_hp', 'wave_skip',
      'unlock_gold_rush', 'unlock_beacon', 'unlock_mint', 'spark_gain', 'starting_gold', 'crit_chance',
    ],
  }

  it('pinned find: the Bounty-Banner economy comp stays contained', () => {
    const bot = makePolicyBot(BOUNTY_ECONOMY)
    const play = (budget: number, seed: string) => {
      const meta = spendSparks({ ...createMeta(), sparks: budget }, BOUNTY_ECONOMY.metaPriority)
      return autoplay(createRun(meta, seed), bot, 120_000).state
    }
    for (const seed of ['alpha', 'beta', 'gamma', 'delta']) {
      expect(play(5000, seed).phase, `${seed} @ 5000`).toBe('defeat')
    }
    for (const seed of ['alpha', 'gamma', 'delta']) {
      expect(play(8000, seed).phase, `${seed} @ 8000`).toBe('defeat')
    }
  }, 600_000)

  // Third pinned find (2026-07, the specialization hunt): a cannon-8/frost-7
  // comp riding Mortar + Blizzard — massed blizzard frosts perma-slowed the
  // whole field while widened mortar shells cleared it, winning at 8k on
  // gamma. Killed by the blizzard splash-duration haircut (50%) and the
  // mortar damage trim (140 -> 125). This pin holds that line.
  const MORTAR_BLIZZARD: PolicyGenome = {
    ratio: { arrow: 1, cannon: 8, frost: 7, tesla: 3, sniper: 4, mint: 3, beacon: 1 },
    earlyType: 'arrow',
    upgradeAtTowers: 7,
    targetBase: 7,
    targetPerWave: 2,
    targetMax: 12,
    enhanceStrategy: 'tesla',
    repairDeficit: 4,
    repairMinGold: 360,
    waveRepairPct: 40,
    specChoice: 0,
    relicPriority: [
      'glass_cannon', 'prism_lens', 'echo_chamber', 'quickdraw', 'shatter', 'heavy_powder',
      'soul_harvest', 'ricochet_strings', 'deadeye_sigil', 'deep_pockets', 'keen_sights', 'colossus',
      'fortune_idol', 'golden_ledger', 'last_stand', 'cinder_shells', 'bounty_banner', 'storm_coils',
      'winters_grip', 'mint_condition', 'overcharge', 'shatterheart', 'overclock', 'spark_siphon',
      'executioners_seal', 'golden_touch', 'field_medicine', 'longsight', 'piercing_arrows', 'stoneskin',
    ],
    metaPriority: [
      'tower_damage', 'unlock_gold_rush', 'gold_income', 'crit_chance', 'unlock_tesla', 'spire_hp',
      'starting_gold', 'wave_skip', 'unlock_mint', 'unlock_beacon', 'spark_gain', 'unlock_bulwark',
    ],
  }

  it('pinned find: the Mortar-Blizzard lockdown comp stays contained', () => {
    const bot = makePolicyBot(MORTAR_BLIZZARD)
    for (const seed of ['alpha', 'gamma']) {
      const meta = spendSparks({ ...createMeta(), sparks: 8000 }, MORTAR_BLIZZARD.metaPriority)
      const { state } = autoplay(createRun(meta, seed), bot, 120_000)
      expect(state.phase, `${seed} @ 8000 sparks`).toBe('defeat')
    }
  }, 300_000)

  // Fourth pinned find (2026-07, the first BIOME hunt): a mazeLengthen
  // sniper/arrow comp on Ember Waste. The old "sparse cover" emberwaste was
  // an open field — exactly what an unconstrained serpentine loves — and 21
  // towers stretched the natural 26-cell walk to 54, winning at 8k on
  // alpha. Killed by slag-heap geometry (rockClusters [1,3] → [4,7] breaks
  // long serpentines; the same build now caps near path 34) with the
  // maze→flier bias standing guard against low-anti-air maze comps
  // everywhere. This pin holds both.
  const EMBER_MAZE: PolicyGenome = {
    ratio: { arrow: 7, cannon: 3, frost: 3, tesla: 0, sniper: 8, mint: 5, beacon: 6 },
    earlyType: 'arrow',
    upgradeAtTowers: 9,
    targetBase: 2,
    targetPerWave: 2,
    targetMax: 21,
    enhanceStrategy: 'cheapest',
    repairDeficit: 1,
    repairMinGold: 210,
    waveRepairPct: 30,
    specChoice: 1,
    relicPriority: [
      'last_stand', 'overcharge', 'deep_pockets', 'cinder_shells', 'prism_lens', 'echo_chamber',
      'ricochet_strings', 'overclock', 'shatter', 'stoneskin', 'quickdraw', 'golden_touch',
      'executioners_seal', 'keen_sights', 'deadeye_sigil', 'soul_harvest', 'piercing_arrows',
      'shatterheart', 'storm_coils', 'colossus', 'field_medicine', 'winters_grip', 'glass_cannon',
      'bounty_banner', 'golden_ledger', 'mint_condition', 'spark_siphon', 'longsight',
      'fortune_idol', 'heavy_powder',
    ],
    metaPriority: [
      'gold_income', 'tower_damage', 'spark_gain', 'crit_chance', 'unlock_tesla', 'wave_skip',
      'spire_hp', 'starting_gold', 'unlock_mint', 'unlock_bulwark', 'unlock_beacon', 'unlock_gold_rush',
    ],
    placement: 'mazeLengthen',
    specByType: { arrow: 0, cannon: 1, frost: 0, tesla: 0, sniper: 0, mint: 0, beacon: 0 },
    enhanceFocus: 'focus',
    targetingByType: { arrow: 'weakest', cannon: 'strongest', frost: 'first', sniper: 'elites', mint: 'first', beacon: 'nearest' },
  }

  it('pinned find: the Ember Waste maze comp stays contained', () => {
    const bot = makePolicyBot(EMBER_MAZE)
    for (const seed of ['alpha', 'gamma']) {
      const meta = spendSparks({ ...createMeta(), sparks: 8000 }, EMBER_MAZE.metaPriority)
      const { state } = autoplay(createRun(meta, seed, 'emberwaste'), bot, 120_000)
      expect(state.phase, `emberwaste ${seed} @ 8000 sparks`).toBe('defeat')
    }
  }, 300_000)

  it('pinned genomes stay contained on the feature biomes', () => {
    // The biome features are all player-favorable in isolation (free slow,
    // free damage, +range high ground). This pins that neither known
    // near-exploit comp converts any of them into a cheap win.
    for (const genome of [HONED_ALLIN, BOUNTY_ECONOMY]) {
      const bot = makePolicyBot(genome)
      for (const biome of ['frostfen', 'emberwaste', 'highlands'] as const) {
        const meta = spendSparks({ ...createMeta(), sparks: 8000 }, genome.metaPriority)
        const { state } = autoplay(createRun(meta, 'alpha', biome), bot, 120_000)
        expect(state.phase, `${biome} @ 8000`).toBe('defeat')
      }
    }
  }, 600_000)

  it('sweep finds no curve-breaking build (deep mode: npm run fuzz:builds)', () => {
    const biome = process.env['FUZZ_BIOME'] as import('../../data/biomes').BiomeId | undefined
    if (biome) console.log(`fuzz sweep biome: ${biome}`)
    const result = fuzzBuilds({
      fuzzSeed: process.env['FUZZ_SEED'] ?? 'ci-sweep',
      budgets: (process.env['FUZZ_BUDGETS'] ?? '8000').split(',').map(Number),
      seeds: (process.env['FUZZ_SEEDS'] ?? 'alpha,gamma').split(','),
      population: Number(process.env['FUZZ_POP'] ?? 6),
      generations: Number(process.env['FUZZ_GENS'] ?? 2),
      biome,
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
    for (const [budget, niches] of Object.entries(result.nichesByBudget)) {
      console.log(`  niches visited @ ${budget}: ${niches.length} (${niches.join(', ')})`)
    }
    const breaking = result.findings.filter((f) => f.severity === 'breaking')
    expect(breaking, breaking.map((f) => f.reason).join('; ')).toEqual([])
  }, 600_000)
})
