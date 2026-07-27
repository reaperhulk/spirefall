import { describe, expect, it } from 'vitest'
import { RELIC_WAVE_INTERVAL } from '../../data/content'
import { buyMetaUpgrade, createMeta, createRun } from '../meta'
import { step } from '../step'
import type { RunState } from '../types'

// Ashen Road's relic debt. The node used to swallow the relic offers its
// skipped waves would have made — measured as a 90% cut in win rate for
// 10,700 sparks of permanent purchase — so it now owes them back, one per
// build phase. That mechanic shipped without a unit test; this is it.

function skipRun(levels: number): RunState {
  let meta = { ...createMeta(), sparks: 1_000_000 }
  // Ashen Road sits in Ash tier 2 since the tree restructure, so the branch
  // gate has to be paid before the node will sell anything.
  for (const id of ['unlock_gold_rush', 'quick_hands', 'quick_hands', 'steady_aim', 'steady_aim'] as const) {
    meta = buyMetaUpgrade(meta, id).meta
  }
  for (let i = 0; i < levels; i++) meta = buyMetaUpgrade(meta, 'wave_skip').meta
  return createRun(meta, 'debt-lab')
}

// End the current wave with nothing left alive, which is what triggers the
// build-phase payout, and armor the spire so the wave cannot end in defeat.
function clearWave(state: RunState): RunState {
  const s = state
  s.phase = 'wave'
  s.spireHp = 1000
  s.spireMaxHp = 1000
  s.enemies = []
  s.pendingSpawns = []
  s.relicOffer = null
  return step(s, []).state
}

describe('Ashen Road relic debt', () => {
  it('a fresh account owes nothing; skipping deep owes one pick per swallowed offer', () => {
    expect(createRun(createMeta(), 'debt-lab').relicDebt).toBe(0)
    // Level 3 starts at wave 6, which swallowed the wave-5 offer.
    expect(skipRun(3).relicDebt).toBe(1)
    // Level 5 starts at wave 10: the wave-5 AND wave-10 offers.
    expect(skipRun(5).relicDebt).toBe(2)
  })

  it('pays one offer per build phase until the debt is settled, then stops', () => {
    let s = skipRun(5)
    expect(s.relicDebt).toBe(2)
    // Off-cadence wave ends → one owed pick arrives, debt drops by one.
    s.wave = 11
    s = clearWave(s)
    expect(s.phase).toBe('build')
    expect(s.relicOffer).not.toBeNull()
    expect(s.relicDebt).toBe(1)
    // Take it, clear another off-cadence wave: the last owed pick arrives.
    s.relicOffer = null
    s.wave = 12
    s = clearWave(s)
    expect(s.relicOffer).not.toBeNull()
    expect(s.relicDebt).toBe(0)
    // Settled: an off-cadence wave now ends with no offer at all.
    s.relicOffer = null
    s.wave = 13
    s = clearWave(s)
    expect(s.relicOffer).toBeNull()
    expect(s.relicDebt).toBe(0)
  })

  it('never doubles up on a cadence wave — the regular offer is not a repayment', () => {
    let s = skipRun(5)
    s.wave = RELIC_WAVE_INTERVAL * 3 // a wave that pays an offer anyway
    s = clearWave(s)
    expect(s.relicOffer).not.toBeNull() // the regular cadence offer
    expect(s.relicDebt).toBe(2) // ...and the debt is untouched
  })

  it('a pre-210 save with no debt field restores inert, never crashing the payout', () => {
    let s = createRun(createMeta(), 'debt-lab')
    delete (s as { relicDebt?: number }).relicDebt
    s.wave = 11
    s = clearWave(s)
    expect(s.relicOffer).toBeNull()
    expect(s.relicDebt ?? 0).toBe(0)
  })
})
