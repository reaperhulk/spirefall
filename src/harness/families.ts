import { BUILD_FAMILIES } from '../data/buildFamilies'
import { TOWERS, relicSkipGold, towerTier } from '../data/content'
import type { DoctrineId } from '../data/doctrines'
import type { TowerType } from '../engine/types'
import { pickBuildCell } from './placement'
import { activeBot, buildActions, DEFAULT_KNOBS, RELIC_PRIORITY, type Bot, type BuildKnobs } from './bots'

const ROSTERS: Record<DoctrineId,TowerType[]> = {
  shatter:['cannon','arrow','frost','sniper','cannon','frost','beacon','cannon'],
  siege:['cannon','arrow','frost','sniper','lance','cannon','beacon','sniper'],
  storm:['arrow','tesla','frost','cannon','tesla','sniper','beacon','tesla'],
  war_economy:['arrow','cannon','frost','sniper','mint','cannon','beacon','arrow'],
}
export function familyKnobs(id: DoctrineId): BuildKnobs {
  return {...DEFAULT_KNOBS,upgradeAtTowers:4,targetBase:6,targetPerWave:1,targetMax:24,
    specChoice:{arrow:1,cannon:id==='siege'?1:0,frost:1,tesla:id==='storm'?1:0,sniper:1,lance:0},
    targeting:{sniper:'elites',lance:'strongest'},
    relicPriority:[...BUILD_FAMILIES[id].relics,...RELIC_PRIORITY],
    enhanceStrategy:id==='shatter'?'cannon':id==='siege'?'sniper':id==='storm'?'tesla':'cheapest',
  }
}
// A documented, reproducible pilot for each family, not a balance oracle.
// The same reaction budget covers planning, collection, beam and abilities.
export function makeFamilyBot(id: DoctrineId, reactionTicks=12): Bot {
  const knobs=familyKnobs(id)
  return s => {
    if(s.victoryClaimed) return [{type:'abandon_run'}]
    if(s.tick % reactionTicks !== 0) return []
    if(s.phase==='build') {
      if(s.boonOffer) return [{type:'choose_boon',boon:s.boonOffer[0]!}]
      if(s.wave>=2 && !s.doctrine) return [{type:'choose_doctrine',doctrine:id}]
      if(s.relicOffer && s.doctrine===id && !s.relicRerolled && !s.relicOffer.some(r=>BUILD_FAMILIES[id].relics.includes(r)) && BUILD_FAMILIES[id].relics.some(r=>!s.relics.includes(r)) && s.gold>=Math.ceil(relicSkipGold(s.wave)*3/2)+150) return [{type:'reroll_relic',focus:id}]
      if (id==='war_economy' && s.wave>=4 && !s.towers.some(t=>t.type==='mint') && s.spireHp*100>=s.spireMaxHp*85 && s.towers.filter(t=>!TOWERS[t.type].support).length>=4 && s.gold>=towerTier('mint',1).cost+100) {
        const cell=pickBuildCell(s,knobs.placement)
        if(cell) return [{type:'place_tower',tower:'mint',cell}]
      }
      const roster=ROSTERS[id].filter(t=>s.availableTowers.includes(t))
      const pick=():TowerType=>{
        const wanted=roster[s.towers.length % roster.length]!
        // Investing through leaks is a policy error: buy a defense first.
        if(wanted==='mint' && (s.towers.some(t=>t.type==='mint') || s.wave<4 || s.spireHp*100<s.spireMaxHp*85 || s.towers.filter(t=>!TOWERS[t.type].support).length<4)) return 'cannon'
        return wanted
      }
      const choices=buildActions(s,pick,knobs)
      return choices.slice(0,1)
    }
    const choices=activeBot(s)
    return choices.length ? [choices[Math.floor(s.tick/reactionTicks)%choices.length]!] : []
  }
}
