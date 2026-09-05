import { writeFileSync } from 'node:fs'
import findings from '../fixtures/finish-findings.json'
import type { BiomeId } from '../src/data/biomes'
import { createMeta, createRun, glassforgeDamageBonus } from '../src/engine/meta'
import { autoplay, spendSparks } from '../src/harness/autoplay'
import { makePolicyBot, type PolicyGenome } from '../src/harness/policy'
const runs=[]
for (const finding of findings.slice(0, 2)) for (const seed of ['gamma',finding.biome === 'verdant' ? 'theta' : 'delta']) {
  for (const variant of ['bonus35','bonus30','bonus25','bonus20','bonus0','hp50','hp55','no_beam','no_execute','no_bounty']) {
    const g=structuredClone(finding.genome) as PolicyGenome
    if (variant==='no_beam') g.beamPolicy='never'
    if (variant==='no_execute') g.executeReady=false
    if (variant==='no_bounty') g.boonPriority=['sharpened','frosted','swift','bounty']
    const meta=spendSparks({...createMeta(),sparks:5000},g.metaPriority)
    const initial=createRun(meta,seed,finding.biome as BiomeId)
    const bonus=variant.startsWith('bonus') ? Number(variant.slice(5)) : 35
    initial.mods.damagePct+=bonus-glassforgeDamageBonus(meta)
    if (variant==='hp50' || variant==='hp55') {
      const plain=createRun({...meta,upgrades:{...meta.upgrades,ks_glassforge:0}},seed,finding.biome as BiomeId)
      initial.spireHp=initial.spireMaxHp=Math.floor(plain.spireMaxHp*(variant==='hp50'?50:45)/100)
    }
    const bot=makePolicyBot(g)
    const {state}=autoplay(initial,s=>s.victoryClaimed?[{type:'abandon_run'}]:bot(s),150000)
    runs.push({biome:finding.biome,seed,variant,bonus,startingHp:initial.spireMaxHp,win:state.victoryClaimed,waves:state.wavesCleared,leaks:state.leaks.length})
  }
}
writeFileSync('docs/glassforge-ablation.json',JSON.stringify({notes:'Controlled ablations at fixed 5k meta and fuzzer-discovered policies. bonus35 reconstructs the pre-fix bonus; HP-only variants keep it. Other variables and the existing robust-win oracle are unchanged. Commands stop after first victory.',runs},null,2)+'\n')
