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

  it('a competent fresh player clears the early game, walls in the teens, and cannot win run 1', () => {
    for (const seed of SEEDS) {
      const state = play(seed, 'balanced')
      expect(state.phase, seed).toBe('defeat')
      expect(state.wavesCleared, seed).toBeGreaterThanOrEqual(12)
      expect(state.wavesCleared, seed).toBeLessThanOrEqual(24) // most of the game is still ahead
      expect(state.wavesCleared, seed).toBeLessThan(VICTORY_WAVE)
      // A fresh run is a quick loop: under ~18 minutes of sim time at 1x.
      expect(state.tick, seed).toBeLessThan(18 * 60 * 30)
    }
  }, 240_000)

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

  it('meta power is monotonic: each spark tier reaches further', () => {
    const fresh = play('alpha', 'balanced')
    const mid = play('alpha', 'balanced', richMeta(3000))
    const deep = play('alpha', 'balanced', richMeta(20_000))
    expect(mid.wavesCleared).toBeGreaterThan(fresh.wavesCleared + 5)
    expect(deep.wavesCleared).toBeGreaterThanOrEqual(mid.wavesCleared)
  }, 240_000)

  it('the grind pays off: a deep Spire Tree can actually win', () => {
    const meta = richMeta(60_000)
    let victories = 0
    for (const seed of ['alpha', 'beta', 'gamma', 'delta']) {
      const state = play(seed, 'balanced', meta)
      if (state.phase === 'victory') victories += 1
    }
    expect(victories).toBeGreaterThanOrEqual(2)
  }, 240_000)

  it('a six-run career climbs steadily but has NOT won yet — the grind is real', () => {
    const { history, meta } = playProgression(6, 'career', BOTS.balanced, DEFAULT_BUY_PRIORITY)
    const first = history[0]!.wavesCleared
    const bestLate = Math.max(...history.slice(3).map((h) => h.wavesCleared))
    expect(bestLate).toBeGreaterThanOrEqual(first + 5) // visible progression...
    expect(history.every((h) => h.outcome === 'defeat')).toBe(true) // ...but no early victory
    expect(meta.totalSparks).toBeGreaterThan(2000)
    expect(meta.runs).toBe(6)
    // Every single run ended — the loop always closes.
    for (const h of history) expect(h.sparks).toBeGreaterThan(0)
  }, 300_000)

  it('a longer career eventually breaks the cycle', () => {
    const { history } = playProgression(12, 'career', BOTS.balanced, DEFAULT_BUY_PRIORITY)
    expect(history.some((h) => h.outcome === 'victory')).toBe(true)
    // The first win takes real investment: no earlier than run 5.
    const firstWin = history.findIndex((h) => h.outcome === 'victory') + 1
    expect(firstWin).toBeGreaterThanOrEqual(5)
  }, 600_000)
})
