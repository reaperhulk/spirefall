import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { simulate, type ScheduledCommand } from '../../harness/simulate'
import { createRun, TICKS_PER_SECOND } from '../step'
import type { RunState } from '../types'

// The keystone suite (PLAN.md §5.2): a run is a pure function of
// (seed, command log). If any of these fail, replays, saves, golden tests,
// and bot playtesting all silently rot.

const SAMPLE_LOG: ScheduledCommand[] = [0, 5, 11, 17, 24, 31].map((seconds) => ({
  tick: seconds * TICKS_PER_SECOND,
  command: { type: 'start_wave' as const },
}))

describe('determinism', () => {
  it('replay equivalence: same seed + same commands → identical states and events', () => {
    const a = simulate(createRun('replay-me'), SAMPLE_LOG, 60 * TICKS_PER_SECOND)
    const b = simulate(createRun('replay-me'), SAMPLE_LOG, 60 * TICKS_PER_SECOND)
    expect(a.state).toEqual(b.state)
    expect(a.events).toEqual(b.events)
  })

  it('different seeds diverge', () => {
    const a = simulate(createRun('seed-a'), SAMPLE_LOG, 60 * TICKS_PER_SECOND)
    const b = simulate(createRun('seed-b'), SAMPLE_LOG, 60 * TICKS_PER_SECOND)
    expect(a.state).not.toEqual(b.state)
  })

  it('serialization equivalence: JSON round-trip mid-run continues identically', () => {
    const midpoint = 15 * TICKS_PER_SECOND
    const horizon = 60 * TICKS_PER_SECOND
    const firstHalf = SAMPLE_LOG.filter((c) => c.tick < midpoint)
    const secondHalf = SAMPLE_LOG.filter((c) => c.tick >= midpoint)

    const mid = simulate(createRun('roundtrip'), firstHalf, midpoint).state
    const revived = JSON.parse(JSON.stringify(mid)) as RunState

    const original = simulate(mid, secondHalf, horizon)
    const restored = simulate(revived, secondHalf, horizon)
    expect(restored.state).toEqual(original.state)
    expect(restored.events).toEqual(original.events)
  })

  it('segmentation equivalence: pausing and resuming never changes the outcome', () => {
    const horizon = 60 * TICKS_PER_SECOND
    const whole = simulate(createRun('segments'), SAMPLE_LOG, horizon)

    let state = createRun('segments')
    for (const checkpoint of [7, 300, 301, 1234, horizon]) {
      const pending = SAMPLE_LOG.filter((c) => c.tick >= state.tick && c.tick < checkpoint)
      state = simulate(state, pending, checkpoint).state
    }
    expect(state).toEqual(whole.state)
  })

  it('property: invariants hold and nothing throws for arbitrary seeds and schedules', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.array(fc.integer({ min: 0, max: 40 * TICKS_PER_SECOND }), { maxLength: 25 }),
        (seed, ticks) => {
          const log: ScheduledCommand[] = [...ticks]
            .sort((a, b) => a - b)
            .map((tick) => ({ tick, command: { type: 'start_wave' as const } }))
          simulate(createRun(seed), log, 45 * TICKS_PER_SECOND, { checkInvariants: true })
        },
      ),
    )
  })

  it('property: replays are exact for arbitrary seeds and schedules', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.array(fc.integer({ min: 0, max: 20 * TICKS_PER_SECOND }), { maxLength: 12 }),
        (seed, ticks) => {
          const log: ScheduledCommand[] = [...ticks]
            .sort((a, b) => a - b)
            .map((tick) => ({ tick, command: { type: 'start_wave' as const } }))
          const a = simulate(createRun(seed), log, 25 * TICKS_PER_SECOND)
          const b = simulate(createRun(seed), log, 25 * TICKS_PER_SECOND)
          expect(a.state).toEqual(b.state)
        },
      ),
      { numRuns: 50 },
    )
  })
})
