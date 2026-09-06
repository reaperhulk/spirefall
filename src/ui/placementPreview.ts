import { TOWERS, towerTier } from '../data/content'
import { towerRangeOnBoard } from '../engine/combat'
import { blockedGrid, canPlaceTower, cellCenter, cellOf, sameCell, cellIndex, distanceField, distSq, pathFrom } from '../engine/grid'
import { getRunMap } from '../engine/mapgen'
import { navigation } from '../engine/navigation'
import type { CellPos, RunState, Tower, TowerType } from '../engine/types'

export interface PlacementPreview {
  ok: boolean; reason: string; affordable: boolean; range: number
  before: CellPos[]; after: CellPos[]; gained: CellPos[]; lost: CellPos[]
  coverageAdvice: string
  newCoverage: number; supportTargets: number; routeDelta: number
}
// Maps and tower layouts stay stable through ordinary ticks. Economy and
// enemy occupancy are checked fresh; the expensive geometry is reused.
let cachedKey = ''
let cachedMap: ReturnType<typeof getRunMap> | null = null
let cached: Omit<PlacementPreview,'ok'|'reason'|'affordable'> | null = null
let cachedValidity={ok:false,reason:''}
let cachedField: Int32Array = new Int32Array()
export function placementPreview(state: RunState, type: TowerType, cell: CellPos): PlacementPreview {
  const map = getRunMap(state)
  const ghost: Tower = {id:-1,type,tier:1,spec:null,enhance:0,cell,cooldown:0,targeting:'first',kills:0,damageDealt:0,shots:0}
  const range = type === 'beacon' ? towerTier(type,1).range : towerRangeOnBoard(state,map,ghost)
  const key = `${type}:${cell.cx},${cell.cy}|${state.relics.join(',')}|${state.towers.map(t => `${t.id}:${t.cell.cx},${t.cell.cy}:${t.type}:${t.tier}:${t.spec}`).join(';')}`
  if (!cached || map !== cachedMap || key !== cachedKey) {
    cachedValidity=canPlaceTower({...state,enemies:[]},map,cell)
    const before = navigation(map,state.towers).path
    const field = distanceField(map,blockedGrid(map,state.towers,cell))
    cachedField=field
    const after = field[cellIndex(map,map.spawn)]! < 0 ? [] : [map.spawn,...pathFrom(map,field,map.spawn)]
    const combat = state.towers.filter(t => !TOWERS[t.type].support).map(t => ({at:cellCenter(t.cell),range:towerRangeOnBoard(state,map,t)}))
    const covered = (path: CellPos[]) => path.filter(c => combat.some(t => distSq(cellCenter(c),t.at) <= t.range*t.range))
    const oldCovered = covered(before), newCovered = covered(after)
    const oldSet = new Set(oldCovered.map(c => cellIndex(map,c))), newSet = new Set(newCovered.map(c => cellIndex(map,c)))
    const at = cellCenter(cell)
    const unique = after.filter(c => !newSet.has(cellIndex(map, c)) && distSq(cellCenter(c), at) <= range * range)
    const final = new Set(after.slice(Math.floor(after.length * 0.7)).map(c => cellIndex(map, c)))
    const rearGain = unique.filter(c => final.has(cellIndex(map, c))).length
    const coverageAdvice = rearGain > 0 ? `Protects ${rearGain} exposed cells on the final approach.` : unique.length > 0 ? `Adds ${unique.length} previously uncovered route cells.` : 'Overlaps existing coverage; useful for concentrated damage.'
    cached = {coverageAdvice,range,before,after,gained:newCovered.filter(c => !oldSet.has(cellIndex(map,c))),lost:oldCovered.filter(c => !newSet.has(cellIndex(map,c))),newCoverage:TOWERS[type].support ? 0 : after.filter(c => distSq(cellCenter(c),at) <= range*range).length,supportTargets:type === 'beacon' ? state.towers.filter(t => !TOWERS[t.type].support && distSq(cellCenter(t.cell),at) <= range*range).length : 0,routeDelta:after.length-before.length}
    cachedKey=key; cachedMap=map
  }
  let validation=cachedValidity
  if(validation.ok && state.enemies.some(e=>sameCell(cellOf(e.pos),cell))) validation={ok:false,reason:'cell occupied by enemy'}
  else if(validation.ok && state.enemies.some(e=>cachedField[cellIndex(map,cellOf(e.pos))]===-1)) validation={ok:false,reason:'would trap an enemy'}
  return {...cached,...validation,affordable:state.gold>=towerTier(type,1).cost}
}
export function placementSummary(p: PlacementPreview, type: TowerType): string {
  if (!p.ok) return `Cannot build: ${p.reason}.`
  const budget = p.affordable ? '' : 'Not enough gold. '
  const role = type === 'mint' ? 'Mint produces income; no attack coverage.' : type === 'beacon' ? `Aura reaches ${p.supportTargets} combat towers.` : `New tower covers ${p.newCoverage} route cells.`
  return `${budget}${role} ${TOWERS[type].support ? '' : p.coverageAdvice} Route ${p.routeDelta >= 0 ? '+' : ''}${p.routeDelta} cells. Existing defense: ${p.gained.length} covered cells gained, ${p.lost.length} lost.`
}
