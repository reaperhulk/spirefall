import { writeFileSync } from 'node:fs'
import findings from '../fixtures/finish-findings.json'
import { createMeta, createRun, glassforgeDamageBonus } from '../src/engine/meta'
import { autoplay, spendSparks } from '../src/harness/autoplay'
import { makePolicyBot, type PolicyGenome } from '../src/harness/policy'
import type { BiomeId } from '../src/data/biomes'
const runs = []
for (const finding of findings) {
  for (const budget of [5000, 20000]) {
    // Known failing seeds constrain the fix; fresh seeds check that a stronger
    // budget can still support these exact policies without retuning them.
    const seeds = budget === 5000
      ? ['alpha','beta','gamma','delta','epsilon','zeta','eta','theta']
      : ['glass-heldout-1','glass-heldout-2','glass-heldout-3','glass-heldout-4']
    for (const doctrine of [null, 'shatter', 'siege', 'storm', 'war_economy'] as const) {
      const genome = {...finding.genome, doctrine} as PolicyGenome
      const meta = spendSparks({...createMeta(), sparks: budget}, genome.metaPriority)
      const bot = makePolicyBot(genome)
      for (const seed of seeds) {
        const initial = createRun(meta, seed, finding.biome as BiomeId)
        const {state} = autoplay(initial, live => live.victoryClaimed ? [{type:'abandon_run'}] : bot(live), 150000)
        const row = {build: finding.id, biome: finding.biome, doctrine, budget, seed,
          bonus: meta.upgrades.ks_glassforge ? glassforgeDamageBonus(meta) : 0, win: state.victoryClaimed, waves: state.wavesCleared}
        runs.push(row)
        console.log(JSON.stringify(row))
      }
    }
  }
}
writeFileSync('docs/finish-balance-profile.json', JSON.stringify({
  notes: 'Four frozen fuzzer-discovered policies, including the independent no-keystone Storm reference crossed with all doctrines and none. Glassforge amplifies Honed Edge by 15%, at unchanged 1200 Sparks and -40% HP. Eight search seeds at 5k constrain repeatable early wins; four unseen seeds at 20k check retained viability. No-keystone reference/family pilots and existing win thresholds are unchanged.',
  runs,
}, null, 2) + '\n')
