import { deriveStream, nextInt } from './rng'
import type { ActiveWave, Command, GameEvent, RunState, StepResult } from './types'

export const TICKS_PER_SECOND = 30
const WAVE_DURATION_TICKS = 3 * TICKS_PER_SECOND
const HIT_EVERY_TICKS = TICKS_PER_SECOND

export function createRun(seed: string): RunState {
  return {
    schemaVersion: 1,
    seed,
    tick: 0,
    phase: 'build',
    rng: {
      waves: deriveStream(seed, 'waves'),
      combat: deriveStream(seed, 'combat'),
      relics: deriveStream(seed, 'relics'),
    },
    wave: 0,
    gold: 100,
    spireHp: 100,
    spireMaxHp: 100,
    activeWave: null,
    sparksEarned: 0,
  }
}

// Advance the simulation exactly one tick. Pure: never mutates its input, never
// throws on player input (invalid commands emit command_rejected), and consumes
// randomness only from the streams in `state.rng`.
export function step(state: RunState, commands: Command[]): StepResult {
  const events: GameEvent[] = []
  let s: RunState = { ...state, tick: state.tick + 1 }

  for (const command of commands) {
    s = applyCommand(s, command, events)
  }

  if (s.phase === 'wave' && s.activeWave !== null) {
    s = advanceWave(s, events)
  }

  return { state: s, events }
}

function applyCommand(s: RunState, command: Command, events: GameEvent[]): RunState {
  switch (command.type) {
    case 'start_wave': {
      if (s.phase !== 'build') {
        events.push({ type: 'command_rejected', command, reason: `phase is ${s.phase}` })
        return s
      }
      const wave = s.wave + 1
      const roll = nextInt(s.rng.waves, wave, wave * 3)
      const activeWave: ActiveWave = {
        remainingTicks: WAVE_DURATION_TICKS,
        hitEveryTicks: HIT_EVERY_TICKS,
        hitDamage: roll.value,
      }
      events.push({ type: 'wave_started', wave })
      return {
        ...s,
        phase: 'wave',
        wave,
        activeWave,
        rng: { ...s.rng, waves: roll.rng },
      }
    }
  }
}

function advanceWave(s: RunState, events: GameEvent[]): RunState {
  const wave = s.activeWave!
  const remainingTicks = wave.remainingTicks - 1
  let next: RunState = { ...s, activeWave: { ...wave, remainingTicks } }

  if (remainingTicks % wave.hitEveryTicks === 0) {
    const roll = nextInt(next.rng.combat, wave.hitDamage, wave.hitDamage * 2)
    const spireHp = Math.max(0, next.spireHp - roll.value)
    events.push({ type: 'spire_damaged', amount: roll.value, spireHp })
    next = { ...next, spireHp, rng: { ...next.rng, combat: roll.rng } }

    if (spireHp === 0) {
      const wavesCleared = next.wave - 1
      const sparks = wavesCleared * 10 + 5
      events.push({ type: 'run_ended', outcome: 'defeat', wavesCleared, sparks })
      return {
        ...next,
        phase: 'defeat',
        activeWave: null,
        sparksEarned: next.sparksEarned + sparks,
      }
    }
  }

  if (remainingTicks === 0) {
    const goldAwarded = 10 + next.wave * 5
    events.push({ type: 'wave_cleared', wave: next.wave, goldAwarded })
    return {
      ...next,
      phase: 'build',
      activeWave: null,
      gold: next.gold + goldAwarded,
    }
  }

  return next
}
