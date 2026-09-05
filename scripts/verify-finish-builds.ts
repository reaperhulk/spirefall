import { writeFileSync } from 'node:fs'
import findings from '../fixtures/finish-findings.json'
import { createMeta, createRun } from '../src/engine/meta'
import { autoplay, spendSparks } from '../src/harness/autoplay'
import { makePolicyBot, type PolicyGenome } from '../src/harness/policy'
import type { BiomeId } from '../src/data/biomes'
const runs=[]
for(const finding of findings) for(const budget of [5000,10000]) for(const seed of ['alpha','beta','gamma','delta','epsilon','zeta','eta','theta']) {
  const g=finding.genome as PolicyGenome,meta=spendSparks({...createMeta(),sparks:budget},g.metaPriority),bot=makePolicyBot(g)
  const s=createRun(meta,seed,finding.biome as BiomeId)
  const {state}=autoplay(s,live=>live.victoryClaimed?[{type:'abandon_run'}]:bot(live),150000)
  const row={biome:finding.biome,budget,seed,bonus:25,win:state.victoryClaimed,waves:state.wavesCleared}
  runs.push(row);console.log(JSON.stringify(row))
}
writeFileSync('docs/finish-balance-profile.json',JSON.stringify({notes:'Fixed fuzzer-discovered policies; Glassforge +25% damage at unchanged -40% HP, compared over all eight search seeds at 5k and 10k. Reference and family pilots choose no keystone.',runs},null,2)+'\n')
