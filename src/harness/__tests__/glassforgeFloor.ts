import { expect } from 'vitest'
import findings from '../../../fixtures/finish-findings.json'
import type { BiomeId } from '../../data/biomes'
import { createRun } from '../../engine/meta'
import { seasonedMeta } from '../scenarios'
import { autoplay, spendSparks } from '../autoplay'
import { calibrateFindings, type FuzzFinding } from '../fuzz'
import { makePolicyBot, type PolicyGenome } from '../policy'

// The discovered Glassforge lineages must stay below the 5k boundary, both
// as the same build and as independent builds. The oracle judges ALL known
// lineages of a biome together (one lineage at a time misses independent
// single-seed wins at one budget), so the check splits by biome — one test
// file each, which the worker pool runs in parallel.
export const FLOOR_BIOMES = [...new Set(findings.map((f) => f.biome))] as BiomeId[]

export async function checkGlassforgeFloor(biome: BiomeId): Promise<void> {
  const wins: FuzzFinding[] = []
  for (const finding of findings.filter((f) => f.biome === biome)) {
    for (const doctrine of [null, 'shatter', 'siege', 'storm', 'war_economy'] as const) {
      const genome = {...finding.genome, doctrine} as PolicyGenome
      const meta = spendSparks(seasonedMeta(5000), genome.metaPriority)
      expect(meta.upgrades.ks_glassforge ?? 0).toBe(finding.id === 'storm-reference' ? 0 : 1)
      const bot = makePolicyBot(genome)
      for (const seed of ['alpha','beta','gamma','delta','epsilon','zeta','eta','theta']) {
        const {state} = autoplay(createRun(meta, seed, biome),
          s => s.victoryClaimed ? [{type:'abandon_run'}] : bot(s), 150000)
        if (state.victoryClaimed) wins.push({genome, seed, budget: 5000,
          outcome: 'victory', wavesCleared: state.wavesCleared, referenceWaves: 0,
          severity: 'breaking', reason: `${finding.id}/${doctrine}/${seed}`})
      }
      // Let the test worker service RPC messages between deterministic batches.
      await new Promise(resolve => setTimeout(resolve, 0))
    }
  }
  calibrateFindings(wins)
  expect(wins.filter(w => w.severity === 'breaking'), biome).toEqual([])
}
