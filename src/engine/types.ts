import type { Rng } from './rng'

// RunState is the entire simulation. It must stay plain JSON data: no classes,
// Maps, functions, or undefined holes. JSON round-tripping mid-run is lossless
// (determinism.test.ts proves it).

export type Phase = 'build' | 'wave' | 'defeat'

export interface RngStreams {
  waves: Rng
  combat: Rng
  relics: Rng
}

// M0 placeholder: a wave is an abstract assault that periodically damages the
// Spire. Replaced at M1 by real enemies moving on the grid — the phase flow,
// command/event protocol, and RNG plumbing here are the durable parts.
export interface ActiveWave {
  remainingTicks: number
  hitEveryTicks: number
  hitDamage: number
}

export interface RunState {
  schemaVersion: 1
  seed: string
  tick: number
  phase: Phase
  rng: RngStreams
  wave: number
  gold: number
  spireHp: number
  spireMaxHp: number
  activeWave: ActiveWave | null
  sparksEarned: number
}

export type Command = { type: 'start_wave' }

export type GameEvent =
  | { type: 'wave_started'; wave: number }
  | { type: 'spire_damaged'; amount: number; spireHp: number }
  | { type: 'wave_cleared'; wave: number; goldAwarded: number }
  | { type: 'run_ended'; outcome: 'defeat'; wavesCleared: number; sparks: number }
  | { type: 'command_rejected'; command: Command; reason: string }

export interface StepResult {
  state: RunState
  events: GameEvent[]
}
