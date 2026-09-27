import { describe, expect, it } from 'vitest'
import { VICTORY_WAVE } from '../../data/content'
import { playProgression } from '../autoplay'
import { BOTS } from '../bots'
import { DEFAULT_BUY_PRIORITY } from '../scenarios'
import { yieldBetweenTests } from './balanceShared'

// The 22-run reference career and the active pilot. See balanceShared.ts.
describe('balance envelope: reference career', () => {
  yieldBetweenTests()

  it('a longer reference career wins while active mastery can win much earlier', () => {
    // 22 runs, not 18: the transformative tier diluted the relic pool (30
    // relics, several comp-dependent), which stretched the reference bot's
    // first win from run ~15 to run ~20. Humans adapt comps around drawn
    // relics harder than the bot's lean does — this is the reference floor.
    const { history } = playProgression(22, 'career', BOTS.balanced, DEFAULT_BUY_PRIORITY)
    expect(history.some((h) => h.outcome === 'victory')).toBe(true)
    // The first win takes real investment: no earlier than run 8.
    const firstWin = history.findIndex((h) => h.outcome === 'victory') + 1
    expect(firstWin).toBeGreaterThanOrEqual(8)
    // Income grows with progress (rules 6 depth pay + frontier bonus):
    // measured runs 2-6 average 378 Sparks and runs 18-22 average 1546,
    // 4.1x. Under the flat 15/wave pay the same career managed 1.75x.
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    expect(mean(history.slice(17, 22).map((h) => h.sparks))).toBeGreaterThanOrEqual(3 * mean(history.slice(1, 6).map((h) => h.sparks)))
    // Winning never makes you lose: the Crucible is chosen, not forced, so
    // runs after the first win stay near the victory line (measured 24, 24,
    // 23 after a first win on run 19; under the forced Crucible the old
    // career slid 23, 21, 20, 18).
    for (const h of history.slice(firstWin)) expect(h.wavesCleared).toBeGreaterThanOrEqual(VICTORY_WAVE - 3)
    // Guardian milestones accelerate earned progress. The active reference
    // now wins on run 6; welcome this skill ceiling instead of nerfing it.
    const active = playProgression(8, 'career', BOTS.active, DEFAULT_BUY_PRIORITY)
    expect(active.history.some(h => h.outcome === 'victory')).toBe(true)
  }, 600_000)
})
