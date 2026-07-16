import { describe, expect, it } from 'vitest'
import { applyHit, selectTarget } from '../combat'
import { blockedGrid, cellCenter, distanceField, getMap } from '../grid'
import { createMeta, createRun } from '../meta'
import type { Enemy, Tower } from '../types'

function enemy(overrides: Partial<Enemy> & { id: number }): Enemy {
  return {
    type: 'runner',
    pos: { x: 5500, y: 6500 },
    hp: 50,
    maxHp: 50,
    speed: 100,
    slowFactor: 100,
    slowTicks: 0,
    bounty: 3,
    damage: 2,
    shield: 0,
    targetCell: null,
    ...overrides,
  }
}

function tower(overrides: Partial<Tower> = {}): Tower {
  return { id: 100, type: 'arrow', tier: 1, cell: { cx: 5, cy: 5 }, cooldown: 0, targeting: 'first', ...overrides }
}

describe('applyHit', () => {
  it('deals damage, capped at remaining hp', () => {
    const e = enemy({ id: 1, hp: 10 })
    expect(applyHit(e, 7)).toBe(7)
    expect(e.hp).toBe(3)
    expect(applyHit(e, 100)).toBe(3)
    expect(e.hp).toBe(0)
  })

  it('shieldbearers fully block hits at or below their shield', () => {
    const e = enemy({ id: 2, shield: 9, hp: 50 })
    expect(applyHit(e, 9)).toBe(0)
    expect(e.hp).toBe(50)
    expect(applyHit(e, 10)).toBe(10)
    expect(e.hp).toBe(40)
  })
})

describe('targeting', () => {
  const state = createRun(createMeta(), 'targeting')
  const map = getMap(state.mapId)
  const field = distanceField(map, blockedGrid(map, []))

  // Two enemies: `ahead` sits closer to the Spire, `behind` closer to spawn.
  const ahead = enemy({ id: 1, pos: cellCenter({ cx: 18, cy: 6 }), hp: 30 })
  const behind = enemy({ id: 2, pos: cellCenter({ cx: 4, cy: 6 }), hp: 90 })

  it('first picks the enemy furthest along the path', () => {
    const t = tower({ targeting: 'first', cell: { cx: 11, cy: 5 } })
    expect(selectTarget(t, [behind, ahead], map, field)?.id).toBe(1)
  })

  it('last picks the enemy closest to spawn', () => {
    const t = tower({ targeting: 'last', cell: { cx: 11, cy: 5 } })
    expect(selectTarget(t, [behind, ahead], map, field)?.id).toBe(2)
  })

  it('strongest picks max hp', () => {
    const t = tower({ targeting: 'strongest', cell: { cx: 11, cy: 5 } })
    expect(selectTarget(t, [ahead, behind], map, field)?.id).toBe(2)
  })

  it('nearest picks minimum distance, ties to lower id', () => {
    const t = tower({ targeting: 'nearest', cell: { cx: 11, cy: 6 } })
    const left = enemy({ id: 3, pos: cellCenter({ cx: 9, cy: 6 }) })
    const right = enemy({ id: 4, pos: cellCenter({ cx: 13, cy: 6 }) })
    expect(selectTarget(t, [right, left], map, field)?.id).toBe(3)
  })

  it('returns null with no candidates', () => {
    expect(selectTarget(tower(), [], map, field)).toBeNull()
  })
})
