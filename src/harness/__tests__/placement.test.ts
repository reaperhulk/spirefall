import { describe, expect, it } from 'vitest'
import { TOWER_SPECS } from '../../data/content'
import { blockedGrid, canPlaceTower, distanceField } from '../../engine/grid'
import { getRunMap } from '../../engine/mapgen'
import { createMeta, createRun } from '../../engine/meta'
import { step } from '../../engine/step'
import type { RunState } from '../../engine/types'
import { buildActions, DEFAULT_KNOBS } from '../bots'
import { PLACEMENT_STRATEGIES, pickBuildCell } from '../placement'

// The breadth axes added for the fuzzer (placement geometry, per-type
// specs, enhancement focus, targeting doctrine) are deterministic pure
// policies — testable without running full games.

function pathLength(state: RunState): number {
  const map = getRunMap(state)
  const field = distanceField(map, blockedGrid(map, state.towers))
  return field[map.spawn.cy * map.width + map.spawn.cx]!
}

function place(state: RunState, strategy: (typeof PLACEMENT_STRATEGIES)[number]): RunState {
  const cell = pickBuildCell(state, strategy)
  expect(cell, `${strategy} found no cell`).not.toBeNull()
  const next = step({ ...state, gold: 100000 }, [{ type: 'place_tower', tower: 'arrow', cell: cell! }])
  expect(next.state.towers.length, `${strategy} placement rejected at ${JSON.stringify(cell)}`).toBe(
    state.towers.length + 1,
  )
  return next.state
}

describe('placement strategies', () => {
  it('every strategy returns a legal, deterministic cell', () => {
    for (const strategy of PLACEMENT_STRATEGIES) {
      const state = createRun(createMeta(), 'placement-legal')
      const map = getRunMap(state)
      const a = pickBuildCell(state, strategy)
      const b = pickBuildCell(state, strategy)
      expect(a, strategy).not.toBeNull()
      expect(a).toEqual(b)
      expect(canPlaceTower(state, map, a!).ok, strategy).toBe(true)
    }
  })

  it('mazeLengthen actually lengthens the horde walk; pathAdjacent does not try to', () => {
    let maze = createRun(createMeta(), 'placement-maze')
    let adjacent = createRun(createMeta(), 'placement-maze')
    const initial = pathLength(maze)
    for (let i = 0; i < 8; i++) {
      maze = place(maze, 'mazeLengthen')
      adjacent = place(adjacent, 'pathAdjacent')
    }
    // The mazing doctrine must strictly stretch the corridor, and beat the
    // path-hugging doctrine at its own game.
    expect(pathLength(maze)).toBeGreaterThan(initial)
    expect(pathLength(maze)).toBeGreaterThanOrEqual(pathLength(adjacent))
  })

  it('mesaFirst takes high ground when the corridor offers it', () => {
    // Highlands generate mesas; scan a few seeds for one adjacent to the
    // path, then pin that the strategy claims it.
    let checked = false
    for (const seed of ['mesa-a', 'mesa-b', 'mesa-c', 'mesa-d', 'mesa-e']) {
      const state = createRun(createMeta(), seed, 'highlands')
      const map = getRunMap(state)
      const cell = pickBuildCell(state, 'mesaFirst')
      if (cell && map.mesa[cell.cy * map.width + cell.cx]) {
        checked = true
        break
      }
    }
    expect(checked, 'no highlands seed offered a path-adjacent mesa — widen the seed list').toBe(true)
  })

  it('spireChoke stacks the last line closer to the Spire than walk order does', () => {
    const state = createRun(createMeta(), 'placement-choke')
    const map = getRunMap(state)
    const choke = pickBuildCell(state, 'spireChoke')!
    const walk = pickBuildCell(state, 'pathAdjacent')!
    const dist = (c: { cx: number; cy: number }) => Math.abs(c.cx - map.spire.cx) + Math.abs(c.cy - map.spire.cy)
    expect(dist(choke)).toBeLessThanOrEqual(dist(walk))
  })
})

describe('breadth knobs in buildActions', () => {
  // Drive a real run to a tier-3 tower so the knob paths execute against
  // engine-valid state, not hand-rolled fixtures.
  function withTierThree(seed: string, tower: 'frost' | 'cannon'): RunState {
    let s = createRun(createMeta(), seed)
    s = { ...s, gold: 100000, availableTowers: [...s.availableTowers, tower] }
    const cell = pickBuildCell(s, 'pathAdjacent')!
    s = step(s, [{ type: 'place_tower', tower, cell }]).state
    const id = s.towers[0]!.id
    s = step(s, [{ type: 'upgrade_tower', id }]).state
    s = step(s, [{ type: 'upgrade_tower', id }]).state
    expect(s.towers[0]!.tier).toBe(3)
    return { ...s, gold: 100000 }
  }

  it('per-type spec choice picks that type\'s path, not the global bit', () => {
    const s = withTierThree('knob-spec', 'frost')
    const cmds = buildActions(s, () => 'frost', {
      ...DEFAULT_KNOBS,
      targetBase: 0,
      targetPerWave: 0,
      specChoice: { frost: 1 },
    })
    expect(cmds).toEqual([{ type: 'specialize_tower', id: s.towers[0]!.id, spec: TOWER_SPECS.frost![1]!.id }])
  })

  it('enhanceFocus: focus feeds the most-enhanced tower; spread feeds the cheapest', () => {
    let s = withTierThree('knob-focus', 'cannon')
    // A second tier-3 cannon, then two enhancements into the first.
    const cell = pickBuildCell(s, 'pathAdjacent')!
    s = { ...s, gold: 100000 }
    s = step(s, [{ type: 'place_tower', tower: 'cannon', cell }]).state
    const second = s.towers[1]!.id
    s = step(s, [{ type: 'upgrade_tower', id: second }]).state
    s = { ...s, gold: 100000 }
    s = step(s, [{ type: 'upgrade_tower', id: second }]).state
    const first = s.towers[0]!.id
    // Commit both specs so buildActions reaches the enhancement block.
    const mortar = TOWER_SPECS.cannon![0]!.id
    s = { ...s, gold: 100000 }
    s = step(s, [{ type: 'specialize_tower', id: first, spec: mortar }]).state
    s = { ...s, gold: 100000 }
    s = step(s, [{ type: 'specialize_tower', id: second, spec: mortar }]).state
    s = { ...s, gold: 100000 }
    s = step(s, [{ type: 'upgrade_tower', id: first }]).state // enhance #1 on tower 1
    s = { ...s, gold: 100000 }
    s = step(s, [{ type: 'upgrade_tower', id: first }]).state // enhance #2 on tower 1
    s = { ...s, gold: 100000 }
    expect(s.towers[0]!.enhance).toBe(2)

    const knobs = { ...DEFAULT_KNOBS, targetBase: 0, targetPerWave: 0, specChoice: {} }
    const focus = buildActions(s, () => 'cannon', { ...knobs, enhanceFocus: 'focus' as const })
    expect(focus).toEqual([{ type: 'upgrade_tower', id: first }]) // keeps maxing the same tower
    const spread = buildActions(s, () => 'cannon', { ...knobs, enhanceFocus: 'spread' as const })
    expect(spread).toEqual([{ type: 'upgrade_tower', id: second }]) // cheapest next
  })

  it('targeting doctrine is applied once per tower, then goes quiet', () => {
    let s = withTierThree('knob-target', 'cannon')
    const knobs = {
      ...DEFAULT_KNOBS,
      targetBase: 0,
      targetPerWave: 0,
      specChoice: {},
      targeting: { cannon: 'strongest' as const },
    }
    const first = buildActions(s, () => 'cannon', knobs)
    expect(first).toEqual([{ type: 'set_targeting', id: s.towers[0]!.id, targeting: 'strongest' }])
    s = step(s, first).state
    const again = buildActions({ ...s, gold: 0 }, () => 'cannon', knobs)
    expect(again.some((c) => c.type === 'set_targeting')).toBe(false)
  })
})
