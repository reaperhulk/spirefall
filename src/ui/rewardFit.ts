import { RELIC_TOWERS } from '../data/buildFamilies'
import { DOCTRINES } from '../data/doctrines'
import { TOWERS } from '../data/content'
import type { RelicId, RunState } from '../engine/types'
export function rewardFit(id: RelicId, state: RunState): string {
  const types = RELIC_TOWERS[id]
  if (!types) return 'Run-wide benefit · see the effect and tradeoff above.'
  const count = state.towers.filter(t => types.includes(t.type)).length
  const family = state.doctrine && types.some(t => DOCTRINES[state.doctrine!].towers.includes(t)) ? ` · supports ${DOCTRINES[state.doctrine].name}` : ''
  return `${types.map(t => TOWERS[t].name).join(' + ')} · ${count} owned${family}`
}
