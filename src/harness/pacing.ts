import type { ProgressionResult } from './autoplay'

// The incremental loop, measured the way a player feels it: how often a run
// buys something, whether income keeps climbing, whether a win costs you the
// next run, and whether a second cycle is faster than the first.
export interface CareerPacing {
  firstVictory: number // 1-based run number, 0 = never
  totalSparks: number
  longestDrySpell: number // most consecutive runs (after the first 3) that bought nothing
  meanRunsPerPurchase: number // runs after the first 3 divided by runs that bought something
  meanSparksEarly: number // runs 1-5
  meanSparksLate: number // the last 5 runs of the first cycle
  worstPostWinDrop: number // waves lost on the run right after a victory (max over victories)
  cycles: { runs: number; firstVictory: number; victories: number }[]
}

export function careerPacing(career: ProgressionResult): CareerPacing {
  const { history, purchases, ascensions } = career
  const firstVictory = history.findIndex((h) => h.outcome === 'victory') + 1
  let dry = 0
  let longestDrySpell = 0
  let buying = 0
  for (let i = 3; i < purchases.length; i++) {
    if (purchases[i]! > 0) {
      buying++
      dry = 0
    } else longestDrySpell = Math.max(longestDrySpell, ++dry)
  }
  const tail = Math.max(0, purchases.length - 3)
  const mean = (xs: number[]) => (xs.length === 0 ? 0 : Math.round(xs.reduce((a, b) => a + b, 0) / xs.length))
  const bounds = [0, ...ascensions, history.length]
  const cycles = []
  for (let c = 0; c + 1 < bounds.length; c++) {
    const slice = history.slice(bounds[c]!, bounds[c + 1]!)
    if (slice.length === 0) continue
    cycles.push({
      runs: slice.length,
      firstVictory: slice.findIndex((h) => h.outcome === 'victory') + 1,
      victories: slice.filter((h) => h.outcome === 'victory').length,
    })
  }
  const firstCycleEnd = ascensions[0] ?? history.length
  let worstPostWinDrop = 0
  for (let i = 0; i + 1 < history.length; i++) {
    if (history[i]!.outcome !== 'victory' || ascensions.includes(i + 1)) continue
    worstPostWinDrop = Math.max(worstPostWinDrop, history[i]!.wavesCleared - history[i + 1]!.wavesCleared)
  }
  return {
    firstVictory,
    totalSparks: history.reduce((sum, h) => sum + h.sparks, 0),
    longestDrySpell,
    meanRunsPerPurchase: buying === 0 ? tail : Math.round((tail / buying) * 100) / 100,
    meanSparksEarly: mean(history.slice(0, 5).map((h) => h.sparks)),
    meanSparksLate: mean(history.slice(Math.max(0, firstCycleEnd - 5), firstCycleEnd).map((h) => h.sparks)),
    worstPostWinDrop,
    cycles,
  }
}
