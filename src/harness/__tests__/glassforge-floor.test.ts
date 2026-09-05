import { expect, it } from 'vitest'
import findings from '../../../fixtures/finish-findings.json'
import type { BiomeId } from '../../data/biomes'
import { createMeta, createRun } from '../../engine/meta'
import { autoplay, spendSparks } from '../autoplay'
import { calibrateFindings, type FuzzFinding } from '../fuzz'
import { makePolicyBot, type PolicyGenome } from '../policy'

it('the discovered lineages satisfy both same-build and independent-build 5k boundaries', async () => {
  const winsByBiome = new Map<string, FuzzFinding[]>()
  for (const finding of findings) {
    const wins = winsByBiome.get(finding.biome) ?? []
    winsByBiome.set(finding.biome, wins)
    for (const doctrine of [null, 'shatter', 'siege', 'storm', 'war_economy'] as const) {
      const genome = {...finding.genome, doctrine} as PolicyGenome
      const meta = spendSparks({...createMeta(), sparks: 5000}, genome.metaPriority)
      expect(meta.upgrades.ks_glassforge ?? 0).toBe(finding.id === 'storm-reference' ? 0 : 1)
      const bot = makePolicyBot(genome)
      for (const seed of ['alpha','beta','gamma','delta','epsilon','zeta','eta','theta']) {
        const {state} = autoplay(createRun(meta, seed, finding.biome as BiomeId),
          s => s.victoryClaimed ? [{type:'abandon_run'}] : bot(s), 150000)
        if (state.victoryClaimed) wins.push({genome, seed, budget: 5000,
          outcome: 'victory', wavesCleared: state.wavesCleared, referenceWaves: 0,
          severity: 'breaking', reason: `${finding.id}/${doctrine}/${seed}`})
      }
      // Let the test worker service RPC messages between deterministic batches.
      await new Promise(resolve => setTimeout(resolve, 0))
    }
  }
  // Use the actual oracle across ALL known lineages in each biome. Checking
  // one lineage at a time misses independent single-seed wins at one budget.
  for (const [biome, wins] of winsByBiome) {
    calibrateFindings(wins)
    expect(wins.filter(w => w.severity === 'breaking'), biome).toEqual([])
  }
}, 240000)
