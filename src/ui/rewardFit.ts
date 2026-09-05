import { DOCTRINES } from '../data/doctrines'
import { TOWERS } from '../data/content'
import type { RelicId, RunState, TowerType } from '../engine/types'
// Explicit content tags: descriptions and owned coverage remain visible.
const TAGS: Partial<Record<RelicId, TowerType[]>> = {
  piercing_arrows: ['arrow'], ricochet_strings: ['arrow'], heavy_powder: ['cannon'], cinder_shells: ['cannon'],
  winters_grip: ['frost'], shatter: ['frost'], shatterheart: ['frost','cannon'], overcharge: ['tesla'],
  echo_chamber: ['tesla'], storm_coils: ['tesla'], deadeye_sigil: ['sniper'], mint_condition: ['mint'],
  golden_ledger: ['mint'], prism_lens: ['beacon'], duelists_oath: ['lance'],
}
export function rewardFit(id: RelicId, state: RunState): string {
  const types = TAGS[id]
  if (!types) return 'Run-wide benefit · see the effect and tradeoff above.'
  const count = state.towers.filter(t => types.includes(t.type)).length
  const family = state.doctrine && types.some(t => DOCTRINES[state.doctrine!].towers.includes(t)) ? ` · supports ${DOCTRINES[state.doctrine].name}` : ''
  return `${types.map(t => TOWERS[t].name).join(' + ')} · ${count} owned${family}`
}
