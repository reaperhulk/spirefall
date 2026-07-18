import { blockedGrid, canPlaceTower, distanceField, inBounds, pathFrom } from '../engine/grid'
import { getRunMap } from '../engine/mapgen'
import type { CellPos, RunState } from '../engine/types'

// Placement GEOMETRY as a searchable axis. The engine invites mazing —
// towers block movement and the horde re-paths around them ("you build
// mazes, not walls") — but until this module, every bot shared a single
// hardcoded placement policy and the entire spatial half of the game was
// outside the fuzzer's reach. Each strategy here is a deterministic pure
// function of state: no RNG, so a genome carrying one reproduces exactly.

export type PlacementStrategy = 'pathAdjacent' | 'mazeLengthen' | 'killboxCluster' | 'mesaFirst' | 'spireChoke'

export const PLACEMENT_STRATEGIES: readonly PlacementStrategy[] = [
  'pathAdjacent',
  'mazeLengthen',
  'killboxCluster',
  'mesaFirst',
  'spireChoke',
]

// Buildable cells adjacent to the enemies' natural path, in walk order.
export function buildCandidates(state: RunState): CellPos[] {
  const map = getRunMap(state)
  const field = distanceField(map, blockedGrid(map, state.towers))
  const path = [map.spawn, ...pathFrom(map, field, map.spawn)]
  const seen = new Set<string>()
  const candidates: CellPos[] = []
  for (const cell of path) {
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ] as const) {
      const c = { cx: cell.cx + dx, cy: cell.cy + dy }
      const key = `${c.cx},${c.cy}`
      if (seen.has(key) || !inBounds(map, c)) continue
      seen.add(key)
      if (canPlaceTower(state, map, c).ok) candidates.push(c)
    }
  }
  return candidates
}

// Choose where the next tower goes. All strategies pick from the same
// path-adjacent candidate set (a tower nowhere near the corridor is dead
// weight under every doctrine); they differ in WHICH corridor cell — and
// mazeLengthen actively reshapes the corridor itself. Ties break toward
// walk order from the spawn gate, matching the classic bot's behavior.
export function pickBuildCell(state: RunState, strategy: PlacementStrategy): CellPos | null {
  const candidates = buildCandidates(state)
  if (candidates.length === 0) return null
  const map = getRunMap(state)
  switch (strategy) {
    case 'pathAdjacent':
      return candidates[0]!
    case 'mazeLengthen': {
      // Greedy mazing: place the wall that lengthens the horde's walk the
      // most. distanceField measures from the Spire, so the spawn cell's
      // value IS the path length after the hypothetical placement.
      let best = candidates[0]!
      let bestLen = -1
      for (const c of candidates) {
        const field = distanceField(map, blockedGrid(map, state.towers, c))
        const len = field[map.spawn.cy * map.width + map.spawn.cx]!
        if (len > bestLen) {
          bestLen = len
          best = c
        }
      }
      return best
    }
    case 'killboxCluster': {
      // Pack fire onto the busiest stretch: maximize path cells within a
      // 2-cell Chebyshev box (a mid-tier tower's practical reach).
      const field = distanceField(map, blockedGrid(map, state.towers))
      const path = [map.spawn, ...pathFrom(map, field, map.spawn)]
      let best = candidates[0]!
      let bestCover = -1
      for (const c of candidates) {
        let cover = 0
        for (const p of path) {
          if (Math.abs(p.cx - c.cx) <= 2 && Math.abs(p.cy - c.cy) <= 2) cover++
        }
        if (cover > bestCover) {
          bestCover = cover
          best = c
        }
      }
      return best
    }
    case 'mesaFirst': {
      // High ground first: mesas grant bonus range and cost the horde a
      // detour. Off-mesa placements fall back to walk order.
      for (const c of candidates) {
        if (map.mesa[c.cy * map.width + c.cx]) return c
      }
      return candidates[0]!
    }
    case 'spireChoke': {
      // Stack the last line: everything lands as close to the Spire as the
      // corridor allows, so all towers overlap on the final stretch.
      let best = candidates[0]!
      let bestD = Infinity
      for (const c of candidates) {
        const d = Math.abs(c.cx - map.spire.cx) + Math.abs(c.cy - map.spire.cy)
        if (d < bestD) {
          bestD = d
          best = c
        }
      }
      return best
    }
  }
}
