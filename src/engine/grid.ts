import { MAPS, type MapDef } from '../data/maps'
import type { CellPos, RunState, Tower, Vec } from './types'

export const CELL = 1000 // millicells per grid cell

export function getMap(id: number): MapDef {
  const map = MAPS[id]
  if (!map) throw new Error(`unknown map id ${id}`)
  return map
}

export function inBounds(map: MapDef, c: CellPos): boolean {
  return c.cx >= 0 && c.cx < map.width && c.cy >= 0 && c.cy < map.height
}

export function cellIndex(map: MapDef, c: CellPos): number {
  return c.cy * map.width + c.cx
}

export function cellOf(pos: Vec): CellPos {
  return { cx: Math.floor(pos.x / CELL), cy: Math.floor(pos.y / CELL) }
}

export function cellCenter(c: CellPos): Vec {
  return { x: c.cx * CELL + CELL / 2, y: c.cy * CELL + CELL / 2 }
}

export function sameCell(a: CellPos, b: CellPos): boolean {
  return a.cx === b.cx && a.cy === b.cy
}

export function distSq(a: Vec, b: Vec): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}

// Cells enemies cannot enter: rocks and towers (the Spire and spawn stay open).
export function blockedGrid(map: MapDef, towers: Tower[], extraBlocked?: CellPos): Uint8Array {
  const blocked = new Uint8Array(map.width * map.height)
  for (let i = 0; i < map.rocks.length; i++) if (map.rocks[i]) blocked[i] = 1
  // Mesas: high ground the horde cannot climb (but towers can build on).
  for (let i = 0; i < map.mesa.length; i++) if (map.mesa[i]) blocked[i] = 1
  for (const t of towers) blocked[cellIndex(map, t.cell)] = 1
  if (extraBlocked) blocked[cellIndex(map, extraBlocked)] = 1
  return blocked
}

// Deterministic neighbor order; also the flow-field tie-break order.
const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [0, -1],
  [-1, 0],
]

// BFS distance (in cells) from every open cell to the Spire. -1 = unreachable.
export function distanceField(map: MapDef, blocked: Uint8Array): Int32Array {
  const size = map.width * map.height
  const dist = new Int32Array(size).fill(-1)
  const queue = new Int32Array(size)
  let head = 0
  let tail = 0
  const spireIdx = cellIndex(map, map.spire)
  dist[spireIdx] = 0
  queue[tail++] = spireIdx
  while (head < tail) {
    const idx = queue[head++]!
    const cx = idx % map.width
    const cy = Math.floor(idx / map.width)
    const d = dist[idx]!
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx
      const ny = cy + dy
      if (nx < 0 || nx >= map.width || ny < 0 || ny >= map.height) continue
      const nIdx = ny * map.width + nx
      if (blocked[nIdx] === 1 || dist[nIdx] !== -1) continue
      dist[nIdx] = d + 1
      queue[tail++] = nIdx
    }
  }
  return dist
}

// Next cell along the flow field: the first neighbor (in DIRS order) with a
// strictly smaller distance. Null if the cell is unreachable or is the Spire.
export function nextCell(map: MapDef, field: Int32Array, c: CellPos): CellPos | null {
  const here = field[cellIndex(map, c)]
  if (here === undefined || here <= 0) return null
  let best: CellPos | null = null
  let bestDist = here
  for (const [dx, dy] of DIRS) {
    const n = { cx: c.cx + dx, cy: c.cy + dy }
    if (!inBounds(map, n)) continue
    const d = field[cellIndex(map, n)]!
    if (d !== -1 && d < bestDist) {
      best = n
      bestDist = d
    }
  }
  return best
}

// The natural path spawn → Spire under the current field (for bots and UI).
export function pathFrom(map: MapDef, field: Int32Array, start: CellPos): CellPos[] {
  const path: CellPos[] = []
  let cur: CellPos | null = start
  while (cur !== null && !sameCell(cur, map.spire)) {
    cur = nextCell(map, field, cur)
    if (cur) path.push(cur)
    if (path.length > map.width * map.height) throw new Error('pathFrom: cycle detected')
  }
  return path
}

export function canPlaceTower(state: RunState, map: MapDef, cell: CellPos): { ok: boolean; reason: string } {
  if (!inBounds(map, cell)) return { ok: false, reason: 'out of bounds' }
  if (map.rocks[cellIndex(map, cell)]) return { ok: false, reason: 'blocked by rock' }
  if (map.marsh[cellIndex(map, cell)]) return { ok: false, reason: 'too soft to build on' }
  if (sameCell(cell, map.spawn) || sameCell(cell, map.spire)) return { ok: false, reason: 'cannot build on gate or Spire' }
  if (state.towers.some((t) => sameCell(t.cell, cell))) return { ok: false, reason: 'cell occupied by tower' }
  if (state.enemies.some((e) => sameCell(cellOf(e.pos), cell))) return { ok: false, reason: 'cell occupied by enemy' }

  // The placement must keep the Spire reachable from the spawn gate and from
  // every living enemy — you build mazes, not walls.
  const field = distanceField(map, blockedGrid(map, state.towers, cell))
  if (field[cellIndex(map, map.spawn)] === -1) return { ok: false, reason: 'would block the path' }
  for (const e of state.enemies) {
    if (field[cellIndex(map, cellOf(e.pos))] === -1) return { ok: false, reason: 'would trap an enemy' }
  }
  return { ok: true, reason: '' }
}
