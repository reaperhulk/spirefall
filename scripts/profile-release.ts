import { writeFileSync } from 'node:fs'
import { autoplay } from '../src/harness/autoplay'
import { activeBot, attentionBot, balancedBot, buildActions, type Bot } from '../src/harness/bots'
import { richMeta } from '../src/harness/scenarios'
import { createRun } from '../src/engine/meta'
import { getRunMap } from '../src/engine/mapgen'
import { navigation } from '../src/engine/navigation'
import { BIOME_IDS } from '../src/data/biomes'
import type { DoctrineId } from '../src/data/doctrines'
import type { TowerType } from '../src/engine/types'

// Fresh seeds excluded from goldens and tuning envelopes. Each family gets
// the same progression, choices, starting gold and reaction budget.
const seeds = ['release-cedar','release-moon','release-amber','release-river','release-owl','release-stone']
const meta = richMeta(10000)
Object.assign(meta.upgrades, {unlock_tesla:1,unlock_mint:1,unlock_beacon:1,unlock_lance:1})
const families: Record<DoctrineId, TowerType[]> = {
  shatter:['cannon','frost','arrow','cannon','sniper','beacon'],
  siege:['sniper','frost','lance','arrow','lance','beacon'],
  storm:['tesla','frost','tesla','sniper','beacon','cannon'],
  war_economy:['cannon','arrow','mint','frost','sniper','beacon'],
}
function familyBot(doctrine: DoctrineId): Bot {
  return s => {
    if (s.victoryClaimed) return [{type:'abandon_run'}]
    if (s.tick % 12 !== 0) return []
    if (s.phase === 'build') {
      if (s.wave >= 2 && !s.doctrine) return [{type:'choose_doctrine',doctrine}]
      const roster = families[doctrine].filter(t => s.availableTowers.includes(t))
      return buildActions(s, state => roster[state.towers.length % roster.length]!).slice(0,1)
    }
    return attentionBot(s)
  }
}
const pilots: Record<string,Bot> = {passive:balancedBot,attention:attentionBot,active:activeBot,...Object.fromEntries(Object.keys(families).map(d => [d,familyBot(d as DoctrineId)]))}
const runs = []
for (const [pilot,bot] of Object.entries(pilots)) for (const seed of seeds) {
  const milestones: Record<string,number> = {}
  const result = autoplay(createRun(meta,seed), s => s.victoryClaimed ? [{type:'abandon_run'}] : bot(s), 120000, {onEvents: (events,s) => {
    for (const e of events) {
      if (e.type === 'tower_upgraded') milestones.upgrade ??= s.tick/30
      if (e.type === 'tower_specialized') milestones.specialization ??= s.tick/30
      if (e.type === 'enemy_spawned' && e.enemy.startsWith('boss')) milestones.boss ??= s.tick/30
      if (e.type === 'victory_achieved') milestones.victory ??= s.tick/30
    }
  }})
  const s = result.state
  const row = {pilot,seed,biome:s.biome,waves:s.wavesCleared,victory:s.victoryClaimed,seconds:s.tick/30,commands:result.commandLog.length,milestones}
  runs.push(row)
  console.log(JSON.stringify(row))
}
const maps = []
for (const biome of BIOME_IDS) for (let i=0;i<40;i++) {
  const s = createRun(meta,`geography-heldout-${i}`,biome), map=getRunMap(s), path=navigation(map,[]).path
  let buildable=0, covered=0
  for(let y=0;y<map.height;y++) for(let x=0;x<map.width;x++) {
    const index=y*map.width+x
    if(map.rocks[index] || map.marsh[index]) continue
    buildable++
    if(path.some(c => (c.cx-x)**2+(c.cy-y)**2<=9)) covered++
  }
  maps.push({biome,seed:i,routeCells:path.length,buildable,nearRoute:covered})
}
writeFileSync('docs/release-profile.json', JSON.stringify({rules:3,progression:meta,notes:'Synthetic pilots at 10k reference progression plus all tower unlocks; six held-out seeds. Attention/families: one action every 400ms. Times are simulation seconds, not wall-clock playtime. No universal win-rate or human-usability claim.',runs,maps},null,2)+'\n')
