import { expect, it } from 'vitest'
import { createMeta, createRun } from '../meta'
import { getRunMap } from '../mapgen'
import { navigation } from '../navigation'
import { step } from '../step'
import { buildCandidates } from '../../harness/placement'

it('reuses navigation through ticks and upgrades, and invalidates changed occupancy', () => {
  let s = createRun(createMeta(), 'cache-occupancy')
  s.gold = 1000
  s = step(s, [{ type: 'place_tower', tower: 'arrow', cell: buildCandidates(s)[0]! }]).state
  const map = getRunMap(s)
  const first = navigation(map, s.towers)
  s = step(s, [{ type: 'upgrade_tower', id: s.towers[0]!.id }]).state
  expect(navigation(map, s.towers)).toBe(first)
  const moved = s.towers.map(t => ({ ...t, cell: buildCandidates(s)[0]! }))
  expect(navigation(map, moved)).not.toBe(first)
  expect(navigation({ ...map }, s.towers)).not.toBe(first)
})
