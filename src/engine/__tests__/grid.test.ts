import { describe, expect, it } from 'vitest'
import { MAPS } from '../../data/maps'
import { blockedGrid, canPlaceTower, cellIndex, cellOf, distanceField, nextCell, pathFrom } from '../grid'
import { createMeta, createRun } from '../meta'
import { step } from '../step'
import type { RunState } from '../types'

function freshRun(seed = 'grid-test'): RunState {
  return createRun(createMeta(), seed)
}

describe('maps', () => {
  it('every map keeps the Spire reachable from the spawn gate', () => {
    for (const map of MAPS) {
      const field = distanceField(map, blockedGrid(map, []))
      expect(field[cellIndex(map, map.spawn)], map.name).toBeGreaterThan(0)
    }
  })

  it('pathFrom walks spawn to spire without cycles', () => {
    for (const map of MAPS) {
      const field = distanceField(map, blockedGrid(map, []))
      const path = pathFrom(map, field, map.spawn)
      expect(path.length).toBeGreaterThan(0)
      const last = path[path.length - 1]!
      expect(last).toEqual(map.spire)
    }
  })
})

describe('flow field', () => {
  it('nextCell always decreases distance to the spire', () => {
    for (const map of MAPS) {
      const field = distanceField(map, blockedGrid(map, []))
      for (let cy = 0; cy < map.height; cy++) {
        for (let cx = 0; cx < map.width; cx++) {
          const d = field[cy * map.width + cx]!
          if (d <= 0) continue
          const next = nextCell(map, field, { cx, cy })
          expect(next).not.toBeNull()
          expect(field[cellIndex(map, next!)]!).toBe(d - 1)
        }
      }
    }
  })
})

describe('placement rules', () => {
  it('rejects placements that would fully wall off the spire', () => {
    const state = freshRun()
    let s = state
    const map = MAPS[s.mapId]!
    // Build a full vertical wall one column before the spire, except one gap;
    // closing the gap must be rejected.
    const wallX = map.spire.cx - 1
    for (let cy = 0; cy < map.height; cy++) {
      if (cy === 0) continue // the gap
      const cell = { cx: wallX, cy }
      if (map.rocks[cy * map.width + wallX]) continue
      s = { ...s, gold: 100_000 }
      const result = step(s, [{ type: 'place_tower', tower: 'arrow', cell }])
      s = result.state
    }
    const gap = { cx: wallX, cy: 0 }
    const verdict = canPlaceTower({ ...s, gold: 100_000 }, map, gap)
    expect(verdict.ok).toBe(false)
    expect(verdict.reason).toBe('would block the path')
  })

  it('rejects rocks, occupied cells, gates, and out-of-bounds', () => {
    const s = freshRun()
    const map = MAPS[s.mapId]!
    expect(canPlaceTower(s, map, { cx: -1, cy: 0 }).ok).toBe(false)
    expect(canPlaceTower(s, map, map.spawn).ok).toBe(false)
    expect(canPlaceTower(s, map, map.spire).ok).toBe(false)
    const rockIdx = map.rocks.findIndex((r) => r)
    if (rockIdx !== -1) {
      const rock = { cx: rockIdx % map.width, cy: Math.floor(rockIdx / map.width) }
      expect(canPlaceTower(s, map, rock).ok).toBe(false)
    }
  })
})

describe('fixed-point cells', () => {
  it('cellOf and centers round-trip', () => {
    expect(cellOf({ x: 500, y: 500 })).toEqual({ cx: 0, cy: 0 })
    expect(cellOf({ x: 999, y: 1000 })).toEqual({ cx: 0, cy: 1 })
    expect(cellOf({ x: 23_500, y: 6_500 })).toEqual({ cx: 23, cy: 6 })
  })
})
