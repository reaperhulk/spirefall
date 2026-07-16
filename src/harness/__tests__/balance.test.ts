import { describe, expect, it } from 'vitest'
import { VICTORY_WAVE } from '../../data/content'
import { createMeta, createRun } from '../../engine/meta'
import { autoplay, playProgression } from '../autoplay'
import { BOTS } from '../bots'
import { DEFAULT_BUY_PRIORITY, richMeta } from '../scenarios'

// The balance envelope (PLAN.md §2.3, updated to measured reality): headless
// bots play whole runs and meta-progressions, and these assertions pin the
// difficulty curve. Everything here is deterministic — seeds are fixed, bots
// are pure functions of state — so a failure is a real balance change, never
// flake. If you change balance on purpose, re-derive the numbers and update
// both this file and the goldens in the same commit.

// Representative seeds across maps 0/1. The Bulwark map (e.g. seed 'gamma')
// punishes the naive bot's placement badly — humans adapt, the heuristic
// doesn't — so the fresh-competence floor is pinned on representative maps.
const SEEDS = ['alpha', 'beta', 'delta'] as const

function play(seed: string, bot: keyof typeof BOTS, meta = createMeta(), maxTicks = 800_000) {
  const { state } = autoplay(createRun(meta, seed), BOTS[bot], maxTicks)
  expect(state.phase, `${seed}/${bot} must reach a terminal phase`).toMatch(/defeat|victory/)
  return state
}

describe('balance envelope', () => {
  it('an afk player always dies fast — but every failure still pays sparks', () => {
    for (const seed of SEEDS) {
      const state = play(seed, 'afk')
      expect(state.phase).toBe('defeat')
      expect(state.wavesCleared, seed).toBeGreaterThanOrEqual(2)
      expect(state.wavesCleared, seed).toBeLessThanOrEqual(5)
      expect(state.sparksEarned, seed).toBeGreaterThan(0)
      // Dying while afk is quick in real time too: under 90 sim-seconds.
      expect(state.tick, seed).toBeLessThan(90 * 30)
    }
  }, 60_000)

  it('playing well beats not playing: greedy > afk on every seed', () => {
    for (const seed of SEEDS) {
      const afk = play(seed, 'afk')
      const greedy = play(seed, 'greedy')
      expect(greedy.wavesCleared, seed).toBeGreaterThan(afk.wavesCleared)
    }
  }, 120_000)

  it('a competent fresh player survives the early game but can never win run 1', () => {
    for (const seed of SEEDS) {
      const state = play(seed, 'balanced')
      expect(state.phase, seed).toBe('defeat')
      expect(state.wavesCleared, seed).toBeGreaterThanOrEqual(25)
      expect(state.wavesCleared, seed).toBeLessThan(VICTORY_WAVE)
    }
  }, 120_000)

  it('sparks buy real power: a banked-up account outlasts a fresh one', () => {
    let strictlyBetter = 0
    for (const seed of SEEDS) {
      const fresh = play(seed, 'balanced')
      const rich = play(seed, 'balanced', richMeta(5000))
      expect(rich.wavesCleared, seed).toBeGreaterThanOrEqual(fresh.wavesCleared)
      if (rich.wavesCleared > fresh.wavesCleared) strictlyBetter += 1
    }
    expect(strictlyBetter).toBeGreaterThanOrEqual(2)
  }, 240_000)

  it('the grind pays off: a maxed Spire Tree can actually win', () => {
    const meta = richMeta(15_000)
    let victories = 0
    for (const seed of ['alpha', 'beta', 'gamma', 'delta']) {
      const state = play(seed, 'balanced', meta)
      if (state.phase === 'victory') victories += 1
    }
    expect(victories).toBeGreaterThanOrEqual(2)
  }, 240_000)

  it('a six-run career climbs: later runs reach further and sparks accumulate', () => {
    const { history, meta } = playProgression(6, 'career', BOTS.balanced, DEFAULT_BUY_PRIORITY)
    const first = history[0]!.wavesCleared
    const bestLate = Math.max(...history.slice(3).map((h) => h.wavesCleared))
    expect(bestLate).toBeGreaterThanOrEqual(first + 2)
    expect(meta.totalSparks).toBeGreaterThan(3000)
    expect(meta.runs).toBe(6)
    // Every single run ended — the loop always closes.
    for (const h of history) expect(h.sparks).toBeGreaterThan(0)
  }, 240_000)
})
