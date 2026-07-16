import { describe, expect, it } from 'vitest'
import { simulate, type ScheduledCommand } from '../../harness/simulate'
import { assertInvariants } from '../invariants'
import { createRun, step, TICKS_PER_SECOND } from '../step'
import type { GameEvent, RunState } from '../types'

describe('createRun', () => {
  it('produces a valid initial state', () => {
    const state = createRun('fresh')
    expect(state.phase).toBe('build')
    expect(state.tick).toBe(0)
    expect(state.wave).toBe(0)
    expect(() => assertInvariants(state)).not.toThrow()
  })
})

describe('step', () => {
  it('never mutates the input state', () => {
    const state = createRun('immutable')
    const snapshot = structuredClone(state)
    step(state, [{ type: 'start_wave' }])
    expect(state).toEqual(snapshot)
  })

  it('start_wave transitions build → wave and emits wave_started', () => {
    const { state, events } = step(createRun('run'), [{ type: 'start_wave' }])
    expect(state.phase).toBe('wave')
    expect(state.wave).toBe(1)
    expect(events).toContainEqual({ type: 'wave_started', wave: 1 })
  })

  it('rejects start_wave while a wave is active, without throwing', () => {
    const first = step(createRun('run'), [{ type: 'start_wave' }])
    const second = step(first.state, [{ type: 'start_wave' }])
    expect(second.state.wave).toBe(1)
    expect(second.events.some((e) => e.type === 'command_rejected')).toBe(true)
  })

  it('a survived wave pays gold and returns to build phase', () => {
    const start = createRun('payout')
    // A tough spire so wave 1 cannot kill it (max hit is wave*3*2 = 6 per second).
    const state: RunState = { ...start, spireHp: 10_000, spireMaxHp: 10_000 }
    const result = simulate(
      state,
      [{ tick: 0, command: { type: 'start_wave' } }],
      10 * TICKS_PER_SECOND,
      { checkInvariants: true },
    )
    const cleared = result.events.find((e) => e.type === 'wave_cleared')
    expect(cleared).toBeDefined()
    expect(result.state.phase).toBe('build')
    expect(result.state.gold).toBe(state.gold + 10 + 5)
    expect(result.state.spireHp).toBeLessThan(state.spireHp)
  })

  it('every run ends: escalating waves always fell the spire (rogue-lite guarantee)', () => {
    // Restart a wave every 4 seconds; geometric-ish wave damage vs a fixed HP
    // pool means defeat is inevitable. This is the core loop contract.
    const log: ScheduledCommand[] = []
    for (let wave = 0; wave < 200; wave++) {
      log.push({ tick: wave * 4 * TICKS_PER_SECOND, command: { type: 'start_wave' } })
    }
    const { state, events } = simulate(createRun('doomed'), log, 800 * TICKS_PER_SECOND, {
      checkInvariants: true,
    })

    expect(state.phase).toBe('defeat')
    expect(state.spireHp).toBe(0)

    const ended = events.filter((e): e is GameEvent & { type: 'run_ended' } => e.type === 'run_ended')
    expect(ended).toHaveLength(1)
    expect(ended[0]!.sparks).toBeGreaterThan(0)
    expect(state.sparksEarned).toBe(ended[0]!.sparks)
    expect(ended[0]!.wavesCleared).toBe(state.wave - 1)
  })

  it('commands after defeat are rejected, and time still advances safely', () => {
    const log: ScheduledCommand[] = []
    for (let wave = 0; wave < 200; wave++) {
      log.push({ tick: wave * 4 * TICKS_PER_SECOND, command: { type: 'start_wave' } })
    }
    const { state } = simulate(createRun('doomed'), log, 800 * TICKS_PER_SECOND)
    const after = step(state, [{ type: 'start_wave' }])
    expect(after.state.phase).toBe('defeat')
    expect(after.events.some((e) => e.type === 'command_rejected')).toBe(true)
  })
})
