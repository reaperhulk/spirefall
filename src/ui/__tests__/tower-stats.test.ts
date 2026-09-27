import { expect, it } from 'vitest'
import { createMeta, createRun } from '../../engine/meta'
import { buildCandidates } from '../../harness/placement'
import { step } from '../../engine/step'
import { towerStats } from '../towerStats'

it('quotes Capacitor DPS at its sustained ×1.5, in the tooltip and the panel alike', () => {
  let s = createRun({ ...createMeta(), upgrades: { unlock_tesla: 1 } }, 'capacitor-stats')
  s.gold = 10_000
  s = step(s, [{ type: 'place_tower', tower: 'tesla', cell: buildCandidates(s)[0]! }]).state
  const id = s.towers[0]!.id
  for (const command of [{ type: 'upgrade_tower', id }, { type: 'upgrade_tower', id }] as const) s = step(s, [command]).state
  const plain = towerStats(s, s.towers[0]!)
  s = step(s, [{ type: 'specialize_tower', id, spec: 'capacitor' }]).state
  expect(s.towers[0]!.spec).toBe('capacitor')
  const cap = towerStats(s, s.towers[0]!)
  expect(cap.dps).toBe(Math.round(cap.breakdown.effective * cap.rate * 1.5))
  expect(plain.dps).toBe(Math.round(plain.breakdown.effective * plain.rate))
})
