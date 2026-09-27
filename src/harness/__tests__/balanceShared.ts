import { beforeEach, expect } from 'vitest'
import { createMeta, createRun } from '../../engine/meta'
import { autoplay } from '../autoplay'
import { BOTS } from '../bots'

// The balance envelope (PLAN.md §2.3, updated to measured reality): headless
// bots play whole runs and meta-progressions, and these assertions pin the
// difficulty curve. Everything here is deterministic — seeds are fixed, bots
// are pure functions of state — so a failure is a real balance change, never
// flake. If you change balance on purpose, re-derive the numbers and update
// both this file and the goldens in the same commit.

// Representative seeds. With five maps in the pool the seed→map assignment
// shifts whenever the catalog changes — re-verify these pins (and re-derive
// numbers if needed) any time a map is added.
// The envelope is split across balance*.test.ts files so the worker pool
// runs them in parallel; this module holds what they share.

// Representative seeds. With five maps in the pool the seed→map assignment
// shifts whenever the catalog changes — re-verify these pins (and re-derive
// numbers if needed) any time a map is added.
export const SEEDS = ['alpha', 'beta', 'delta'] as const

export function play(seed: string, bot: keyof typeof BOTS, meta = createMeta(), maxTicks = 800_000) {
  const { state } = autoplay(createRun(meta, seed), BOTS[bot], maxTicks)
  expect(state.phase, `${seed}/${bot} must reach a terminal phase`).toMatch(/defeat|victory/)
  return state
}

// These tests are long and fully synchronous. Yield one macrotask between
// them so the worker can answer Vitest's RPC; back-to-back they starve it
// past its 60s timeout. Call inside each describe.
export function yieldBetweenTests(): void {
  beforeEach(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))
}
