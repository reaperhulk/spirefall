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

// Representative seeds. With five maps in the pool the seed→map assignment
// shifts whenever the catalog changes — re-verify these pins (and re-derive
// numbers if needed) any time a map is added.
const SEEDS = ['alpha', 'beta', 'delta'] as const

function play(seed: string, bot: keyof typeof BOTS, meta = createMeta(), maxTicks = 800_000) {
  const { state } = autoplay(createRun(meta, seed), BOTS[bot], maxTicks)
  expect(state.phase, `${seed}/${bot} must reach a terminal phase`).toMatch(/defeat|victory/)
  return state
}

describe('balance envelope', () => {
  it('an afk player is overrun almost immediately — and zero effort pays zero sparks', () => {
    for (const seed of SEEDS) {
      const state = play(seed, 'afk')
      expect(state.phase).toBe('defeat')
      expect(state.wavesCleared, seed).toBeLessThanOrEqual(1) // the horde forgives nothing
      // Sparks pay for progress only; doing literally nothing earns nothing.
      expect(state.sparksEarned, seed).toBe(0)
      // Dying while afk is near-instant in real time: under 45 sim-seconds.
      expect(state.tick, seed).toBeLessThan(45 * 30)
    }
  }, 60_000)

  it('playing well beats not playing: greedy > afk on every seed', () => {
    for (const seed of SEEDS) {
      const afk = play(seed, 'afk')
      const greedy = play(seed, 'greedy')
      expect(greedy.wavesCleared, seed).toBeGreaterThan(afk.wavesCleared)
    }
  }, 120_000)

  it('a fresh run dies fast to heavy leaks — the spire is paper until you invest', () => {
    for (const seed of SEEDS) {
      const state = play(seed, 'balanced')
      expect(state.phase, seed).toBe('defeat')
      expect(state.wavesCleared, seed).toBeGreaterThanOrEqual(2)
      expect(state.wavesCleared, seed).toBeLessThanOrEqual(12) // nearly all the game still ahead
      expect(state.wavesCleared, seed).toBeLessThan(VICTORY_WAVE)
      // The first-run loop is very tight: under 4 minutes of sim time at 1x.
      expect(state.tick, seed).toBeLessThan(4 * 60 * 30)
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
    // Margins re-derived for the transformative relic tier: the new relics
    // are strongest at ZERO meta (fresh alpha 9 → 12 — a comp-matched
    // Cinder/Deadeye draw is a bigger lever than early spark upgrades), so
    // the fresh→mid gap compressed to strict monotonicity while the
    // end-to-end ladder stays wide (12 → 13 → 24 at re-derivation).
    expect(mid.wavesCleared).toBeGreaterThan(fresh.wavesCleared)
    expect(deep.wavesCleared).toBeGreaterThanOrEqual(mid.wavesCleared)
    expect(deep.wavesCleared).toBeGreaterThan(fresh.wavesCleared + 8)
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

  it('mono-tower cheese loses: arrow spam with a deep tree cannot win', () => {
    // A playtester once won with nothing but arrows plus Honed Arsenal.
    // Scaling shieldbearer shields exist to kill that: late shields shrug
    // off rapid-fire chip damage, so a composition without piercing or
    // heavy hits stalls out short of the victory wave.
    const meta = richMeta(20_000)
    for (const seed of ['alpha', 'beta', 'gamma', 'delta']) {
      const arrows = play(seed, 'arrowOnly', meta)
      expect(arrows.phase, seed).toBe('defeat')
      expect(arrows.wavesCleared, seed).toBeLessThan(VICTORY_WAVE)
      // And a mixed composition is at least as good at identical investment.
      const mixed = play(seed, 'balanced', meta)
      expect(mixed.wavesCleared, seed).toBeGreaterThanOrEqual(arrows.wavesCleared)
    }
  }, 300_000)

  it('a six-run career climbs steadily but has NOT won yet — the grind is real', () => {
    const { history, meta } = playProgression(6, 'career', BOTS.balanced, DEFAULT_BUY_PRIORITY)
    const first = history[0]!.wavesCleared
    const bestLate = Math.max(...history.slice(3).map((h) => h.wavesCleared))
    expect(bestLate).toBeGreaterThanOrEqual(first + 5) // visible progression...
    expect(history.every((h) => h.outcome === 'defeat')).toBe(true) // ...but no early victory
    expect(meta.totalSparks).toBeGreaterThan(800)
    expect(meta.runs).toBe(6)
    // Every single run ended — the loop always closes.
    for (const h of history) expect(h.sparks).toBeGreaterThan(0)
  }, 300_000)

  it('biome envelope: every biome plays inside the verdant band', () => {
    // Measured at introduction (mid meta 3000: all biomes 11–14 waves;
    // deep meta 20k: verdant/frostfen 3-of-4 wins, emberwaste/highlands
    // 2-of-4 — late biomes correctly a touch harder). This pins the SHAPE:
    // no biome drifts far from the verdant reference at mid meta, and the
    // deep tree still wins on every biome somewhere.
    const meta = richMeta(3000)
    const verdant = ['alpha', 'beta'].map((seed) => autoplay(createRun(meta, seed, 'verdant'), BOTS.balanced, 800_000).state.wavesCleared)
    for (const biome of ['frostfen', 'emberwaste', 'highlands'] as const) {
      ;['alpha', 'beta'].forEach((seed, i) => {
        const waves = autoplay(createRun(meta, seed, biome), BOTS.balanced, 800_000).state.wavesCleared
        expect(Math.abs(waves - verdant[i]!), `${biome}/${seed} drifted from verdant`).toBeLessThanOrEqual(4)
      })
    }
    const deep = richMeta(20_000)
    for (const biome of ['frostfen', 'emberwaste', 'highlands'] as const) {
      const won = ['alpha', 'beta'].some(
        (seed) => autoplay(createRun(deep, seed, biome), BOTS.balanced, 800_000).state.phase === 'victory',
      )
      expect(won, `a deep tree must still win on ${biome}`).toBe(true)
    }
  }, 600_000)

  it('a longer career eventually breaks the cycle — after a real grind', () => {
    // 22 runs, not 18: the transformative tier diluted the relic pool (30
    // relics, several comp-dependent), which stretched the reference bot's
    // first win from run ~15 to run ~20. Humans adapt comps around drawn
    // relics harder than the bot's lean does — this is the reference floor.
    const { history } = playProgression(22, 'career', BOTS.balanced, DEFAULT_BUY_PRIORITY)
    expect(history.some((h) => h.outcome === 'victory')).toBe(true)
    // The first win takes real investment: no earlier than run 8.
    const firstWin = history.findIndex((h) => h.outcome === 'victory') + 1
    expect(firstWin).toBeGreaterThanOrEqual(8)
  }, 600_000)
})
