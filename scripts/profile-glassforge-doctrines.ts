import {writeFileSync} from 'node:fs'
import findings from '../fixtures/finish-findings.json'
import { metaNode } from '../src/data/metaTree'
import { createMeta, createRun, glassforgeDamageBonus } from '../src/engine/meta'
import { autoplay, spendSparks } from '../src/harness/autoplay'
import { makePolicyBot, type PolicyGenome } from '../src/harness/policy'
import type { BiomeId } from '../src/data/biomes'
const builds=findings
const rows=[]
for(const [bonus,cost] of [[25,1200],[15,1200],[10,1200],[35,1800],[35,2400],[25,1800],[25,2400]]) {
  metaNode('ks_glassforge').costs[0]=cost!
  for(const [build,f] of builds.entries()) for(const doctrine of [null,'shatter','siege','storm','war_economy'] as const) {
    const g={...f.genome,doctrine} as PolicyGenome,meta=spendSparks({...createMeta(),sparks:5000},g.metaPriority),bot=makePolicyBot(g)
    const wins=[],waves=[]
    for(const seed of ['gamma',f.biome==='verdant'?'theta':'delta']) {
      const initial=createRun(meta,seed,f.biome as BiomeId)
      if(meta.upgrades.ks_glassforge) initial.mods.damagePct+=bonus!-glassforgeDamageBonus(meta)
      const {state}=autoplay(initial,s=>s.victoryClaimed?[{type:'abandon_run'}]:bot(s),150000)
      if(state.victoryClaimed) wins.push(seed)
      waves.push(state.wavesCleared)
    }
    const row={bonus,cost,build,biome:f.biome,doctrine,wins,waves}; rows.push(row);console.log(JSON.stringify(row))
  }
}
writeFileSync('docs/glassforge-doctrine-ablation.json',JSON.stringify(rows,null,2)+'\n')
