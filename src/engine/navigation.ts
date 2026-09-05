import type { MapDef } from '../data/maps'
import type { Tower } from './types'
import { blockedGrid, cellIndex, distanceField, pathFrom } from './grid'
const cache = new WeakMap<MapDef, Map<string, { blocked: Uint8Array; field: Int32Array; path: { cx: number; cy: number }[] }>>()
export function navigation(map: MapDef, towers: Tower[]) {
  const key = towers.map(t => cellIndex(map, t.cell)).join(',')
  let entries = cache.get(map)
  if (!entries) { entries = new Map(); cache.set(map, entries) }
  let found = entries.get(key)
  if (!found) {
    const blocked = blockedGrid(map, towers)
    const field = distanceField(map, blocked)
    found = { blocked, field, path: [map.spawn, ...pathFrom(map, field, map.spawn)] }
    if (entries.size >= 32) entries.clear()
    entries.set(key, found)
  }
  return found
}
