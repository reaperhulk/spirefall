import { assertInvariants } from '../engine/invariants'
import { step } from '../engine/step'
import type { Command, GameEvent, RunState } from '../engine/types'

// A run is fully described by (seed, command log). Bots, replays, save games,
// and golden tests all reduce to this one structure.
export interface ScheduledCommand {
  tick: number
  command: Command
}

export interface SimulateOptions {
  checkInvariants?: boolean
}

// Advance `state` until its tick reaches `untilTick`, delivering each scheduled
// command to the step that begins on its tick. Commands scheduled in the past
// are an error in the caller — replays must be exact, never silently reordered.
export function simulate(
  state: RunState,
  log: ScheduledCommand[],
  untilTick: number,
  options: SimulateOptions = {},
): { state: RunState; events: GameEvent[] } {
  const byTick = new Map<number, Command[]>()
  for (const entry of log) {
    if (entry.tick < state.tick) {
      throw new Error(`command scheduled at tick ${entry.tick}, but state is at tick ${state.tick}`)
    }
    const bucket = byTick.get(entry.tick)
    if (bucket) bucket.push(entry.command)
    else byTick.set(entry.tick, [entry.command])
  }

  let s = state
  const events: GameEvent[] = []
  while (s.tick < untilTick) {
    const result = step(s, byTick.get(s.tick) ?? [])
    s = result.state
    events.push(...result.events)
    if (options.checkInvariants === true) assertInvariants(s)
  }
  return { state: s, events }
}
