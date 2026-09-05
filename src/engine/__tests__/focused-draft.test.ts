import { expect, it } from 'vitest'
import { createMeta, createRun } from '../meta'
import { step } from '../step'
import { BUILD_FAMILIES } from '../../data/buildFamilies'
import { RELICS, relicSkipGold } from '../../data/content'
import { parseRecording, RULES_VERSION } from '../../ui/validation'

it('a paid focused reroll guarantees a distinct unowned family relic and preserves the pity floor', () => {
 for(const doctrine of ['shatter','siege','storm','war_economy'] as const) for(let n=0;n<20;n++) {
  const initial=createRun(createMeta(),`focus-${n}`)
  Object.assign(initial,{wave:15,doctrine,gold:1000,relicOffer:['keen_sights','field_medicine','deep_pockets']})
  const a=step(initial,[{type:'reroll_relic',focus:doctrine}])
  const b=step(initial,[{type:'reroll_relic',focus:doctrine}])
  expect(a).toEqual(b)
  expect(a.state.relicOffer!.some(r=>BUILD_FAMILIES[doctrine].relics.includes(r))).toBe(true)
  expect(a.state.relicOffer!.some(r=>RELICS[r].rarity!=='common')).toBe(true)
  expect(new Set(a.state.relicOffer).size).toBe(a.state.relicOffer!.length)
  expect(a.state.gold).toBe(1000-Math.ceil(relicSkipGold(15)*3/2))
  expect(step(a.state,[{type:'reroll_relic'}]).events[0]?.type).toBe('command_rejected')
 }
})
it('rejects an unchosen focus without spending gold or advancing the relic stream', () => {
 const initial=createRun(createMeta(),'bad-focus');initial.wave=5;initial.relicOffer=['keen_sights'];initial.gold=1000
 const result=step(initial,[{type:'reroll_relic',focus:'storm'}])
 expect(result.state.gold).toBe(initial.gold);expect(result.state.rng.relics).toEqual(initial.rng.relics)
 expect(result.events[0]?.type).toBe('command_rejected')
})
it('keeps rules-3 replays compatible and rejects inherited content identifiers', () => {
 const initial=createRun(createMeta(),'rules3')
 const data={v:3,rules:3,initial,log:[],endTick:1}
 expect(parseRecording(JSON.stringify(data))?.rules).toBe(RULES_VERSION)
 expect(parseRecording(JSON.stringify({...data,log:[{tick:0,command:{type:'choose_doctrine',doctrine:'__proto__'}}]}))).toBeNull()
 expect(parseRecording(JSON.stringify({...data,initial:{...initial,availableTowers:['constructor']}}))).toBeNull()
})
