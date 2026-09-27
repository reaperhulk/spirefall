import { describe, expect, it } from 'vitest'
import { playProgression } from '../autoplay'
import { BOTS } from '../bots'
import { DEFAULT_ASCEND_WHEN, DEFAULT_BUY_PRIORITY, DEFAULT_EMBER_PRIORITY } from '../scenarios'
import { careerPacing } from '../pacing'
import { yieldBetweenTests } from './balanceShared'

// Ascension cycles across four career seeds. See balanceShared.ts.
describe('balance envelope: prestige', () => {
  yieldBetweenTests()

  // Prestige compounds: each cycle reaches its first win sooner. Re-derived
  // with relic seals (rules 6, 35% kept, rank-0 reference, active pilot):
  // cycles took 6/4/7/5 runs to a first win, then 3/6/4/5, then 2/3/2/6 —
  // pooled 22 → 18 → 13. Before the redesign an ascension burned the tree
  // for 2-3 Embers and later cycles were no faster (6 → 6, 6 → 10). One
  // test per seed keeps each worker call short; the pooled bounds are
  // asserted after all four.
  const prestige: { first: number; second: number; third: number }[] = []
  for (const seed of ['career', 'cb', 'cc', 'cd']) {
    it(`prestige pays (${seed}): the career keeps winning across ascensions`, () => {
      const career = playProgression(40, seed, BOTS.active, DEFAULT_BUY_PRIORITY, {
        ascendWhen: DEFAULT_ASCEND_WHEN,
        emberPriority: DEFAULT_EMBER_PRIORITY,
        stopWhen: (history, ascensions) =>
          ascensions.length > 1 && history.slice(ascensions[1]).some((h) => h.outcome === 'victory'),
      })
      const { cycles } = careerPacing(career)
      expect(cycles.length).toBe(3)
      for (const cycle of cycles) expect(cycle.firstVictory, 'a cycle never won').toBeGreaterThan(0)
      prestige.push({ first: cycles[0]!.firstVictory, second: cycles[1]!.firstVictory, third: cycles[2]!.firstVictory })
    }, 300_000)
  }
  it('prestige pays: pooled, later cycles win sooner — the third in at most 60% of the first\'s runs', () => {
    expect(prestige).toHaveLength(4)
    const pooled = (key: 'first' | 'second' | 'third') => prestige.reduce((sum, p) => sum + p[key], 0)
    expect(pooled('second')).toBeLessThanOrEqual(pooled('first'))
    expect(pooled('third')).toBeLessThanOrEqual(Math.floor((pooled('first') * 60) / 100))
  })
})
