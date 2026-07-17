import { describe, expect, it } from 'vitest'
import { createMeta, createRun } from '../../engine/meta'
import { autoplay } from '../autoplay'
import { balancedBot } from '../bots'

// Performance budget (PLAN.md §5.8): the sim must stay cheap enough that CI
// can afford thousands of headless runs. The budget includes bot overhead —
// that's the realistic cost of a harness tick — and is generous enough to
// avoid CI-hardware flake while still catching order-of-magnitude regressions.
describe('performance budget', () => {
  it('a full bot run averages under 0.5ms per tick', () => {
    const t0 = performance.now()
    const { state } = autoplay(createRun(createMeta(), 'perf'), balancedBot, 400_000)
    const elapsed = performance.now() - t0
    expect(state.phase).toBe('defeat') // sanity: a real, full run was measured
    expect(state.tick).toBeGreaterThan(2_000) // fresh runs are deliberately short now
    expect(elapsed / state.tick).toBeLessThan(0.5)
  }, 120_000)
})
