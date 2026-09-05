import { expect, it } from 'vitest'
import findings from '../../../fixtures/finish-findings.json'
import type { BiomeId } from '../../data/biomes'
import { createMeta, createRun } from '../../engine/meta'
import { autoplay, spendSparks } from '../autoplay'
import { makePolicyBot, type PolicyGenome } from '../policy'

it('the discovered Glassforge lineages stay below the existing robust 5k-win boundary', () => {
  for (const finding of findings) {
    const genome = finding.genome as PolicyGenome
    const meta = spendSparks({...createMeta(),sparks:5000},genome.metaPriority)
    expect(meta.upgrades.ks_glassforge).toBe(1)
    const bot = makePolicyBot(genome), wins:string[] = []
    for (const seed of ['alpha','beta','gamma','delta','epsilon','zeta','eta','theta']) {
      const {state} = autoplay(createRun(meta,seed,finding.biome as BiomeId), s => s.victoryClaimed ? [{type:'abandon_run'}] : bot(s),150000)
      if (state.victoryClaimed) wins.push(seed)
    }
    // The existing calibration allows one soft seed, never repeatable wins.
    // No exception is made for these newly discovered policies.
    expect(wins.length,`${finding.biome}: ${wins.join(', ')}`).toBeLessThanOrEqual(1)
  }
},120000)
