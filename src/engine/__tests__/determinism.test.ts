import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { autoplay } from '../../harness/autoplay'
import { balancedBot, greedyBot } from '../../harness/bots'
import { simulate, type ScheduledCommand } from '../../harness/simulate'
import { createMeta, createRun } from '../meta'
import { TICKS_PER_SECOND } from '../step'
import type { Command, RunState } from '../types'

// The keystone suite (PLAN.md §5.2): a run is a pure function of
// (seed, command log). If any of these fail, replays, saves, golden tests,
// and bot playtesting all silently rot.

function freshRun(seed: string): RunState {
  return createRun(createMeta(), seed)
}

// A realistic command log: whatever the balanced bot actually did on this seed.
function recordedLog(seed: string, maxTicks: number): ScheduledCommand[] {
  return autoplay(freshRun(seed), balancedBot, maxTicks).commandLog
}

describe('determinism', () => {
  it('replay equivalence: a recorded bot game replays to the identical state', () => {
    const horizon = 90 * TICKS_PER_SECOND
    const log = recordedLog('replay-me', horizon)
    const a = simulate(freshRun('replay-me'), log, horizon)
    const b = simulate(freshRun('replay-me'), log, horizon)
    expect(a.state).toEqual(b.state)
    expect(a.events).toEqual(b.events)
  })

  it('different seeds diverge', () => {
    const horizon = 60 * TICKS_PER_SECOND
    const a = autoplay(freshRun('seed-a'), greedyBot, horizon).state
    const b = autoplay(freshRun('seed-b'), greedyBot, horizon).state
    expect(a).not.toEqual(b)
  })

  it('serialization equivalence: JSON round-trip mid-run continues identically', () => {
    const midpoint = 45 * TICKS_PER_SECOND
    const horizon = 90 * TICKS_PER_SECOND
    const log = recordedLog('roundtrip', horizon)
    const firstHalf = log.filter((c) => c.tick < midpoint)
    const secondHalf = log.filter((c) => c.tick >= midpoint)

    const mid = simulate(freshRun('roundtrip'), firstHalf, midpoint).state
    const revived = JSON.parse(JSON.stringify(mid)) as RunState

    const original = simulate(mid, secondHalf, horizon)
    const restored = simulate(revived, secondHalf, horizon)
    expect(restored.state).toEqual(original.state)
    expect(restored.events).toEqual(original.events)
  })

  it('segmentation equivalence: pausing and resuming never changes the outcome', () => {
    const horizon = 90 * TICKS_PER_SECOND
    const log = recordedLog('segments', horizon)
    const whole = simulate(freshRun('segments'), log, horizon)

    let state = freshRun('segments')
    for (const checkpoint of [7, 450, 451, 1930, horizon]) {
      const pending = log.filter((c) => c.tick >= state.tick && c.tick < checkpoint)
      state = simulate(state, pending, checkpoint).state
    }
    expect(state).toEqual(whole.state)
  })

  it('property: invariants hold and nothing throws under random hostile command schedules', () => {
    const cellArb = fc.record({ cx: fc.integer({ min: -2, max: 26 }), cy: fc.integer({ min: -2, max: 16 }) })
    const commandArb: fc.Arbitrary<Command> = fc.oneof(
      fc.constant<Command>({ type: 'start_wave' }),
      fc.record({
        type: fc.constant('place_tower' as const),
        tower: fc.constantFrom('arrow', 'cannon', 'frost', 'tesla') as fc.Arbitrary<'arrow'>,
        cell: cellArb,
      }),
      fc.record({ type: fc.constant('upgrade_tower' as const), id: fc.integer({ min: 0, max: 50 }) }),
      fc.record({ type: fc.constant('sell_tower' as const), id: fc.integer({ min: 0, max: 50 }) }),
      fc.record({
        type: fc.constant('set_targeting' as const),
        id: fc.integer({ min: 0, max: 50 }),
        targeting: fc.constantFrom('first', 'last', 'strongest', 'nearest') as fc.Arbitrary<'first'>,
      }),
      fc.record({
        type: fc.constant('cast_ability' as const),
        ability: fc.constantFrom('meteor', 'frost_nova', 'gold_rush') as fc.Arbitrary<'meteor'>,
        cell: cellArb,
      }),
      fc.record({
        type: fc.constant('choose_relic' as const),
        relic: fc.constantFrom(
          'piercing_arrows',
          'spark_siphon',
          null,
        ) as fc.Arbitrary<'piercing_arrows' | null>,
      }),
    )

    fc.assert(
      fc.property(
        fc.string(),
        fc.array(
          fc.record({ tick: fc.integer({ min: 0, max: 60 * TICKS_PER_SECOND }), command: commandArb }),
          { maxLength: 40 },
        ),
        (seed, entries) => {
          const log = [...entries].sort((a, b) => a.tick - b.tick)
          simulate(freshRun(seed), log, 70 * TICKS_PER_SECOND, { checkInvariants: true })
        },
      ),
      { numRuns: 30 },
    )
  })

  it('property: bot replays are exact for arbitrary seeds', () => {
    fc.assert(
      fc.property(fc.string(), (seed) => {
        const horizon = 40 * TICKS_PER_SECOND
        const log = autoplay(freshRun(seed), greedyBot, horizon).commandLog
        const a = simulate(freshRun(seed), log, horizon)
        const b = simulate(freshRun(seed), log, horizon)
        expect(a.state).toEqual(b.state)
      }),
      { numRuns: 15 },
    )
  })
})
