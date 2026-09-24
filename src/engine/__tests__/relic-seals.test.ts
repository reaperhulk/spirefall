import { describe, expect, it } from 'vitest'
import { RELIC_SEALS } from '../../data/content'
import { sealedRelics, swappableRelics } from '../campaign'
import { createMeta, createRun, settleRun } from '../meta'
import { step } from '../step'
import type { MetaState, RelicId, RunState } from '../types'

const allSeals = RELIC_SEALS.flatMap((seal) => seal.relics)

// Clear a guardian's wave with the guardian dead: the tick that ends the
// wave runs the wave-clear bookkeeping, spoils included.
function clearWave(run: RunState, wave: number, relics: RelicId[], guardianKilled = true): RunState {
  return step(
    { ...run, wave, phase: 'wave', pendingSpawns: [], enemies: [], relics, killsByEnemy: guardianKilled ? { boss: 1, boss2: 1, boss3: 1 } : {} },
    [],
  ).state
}

describe('relic seals', () => {
  it('a fresh account starts with the transformative relics sealed, and never sees them offered', () => {
    const run = createRun(createMeta(), 'sealed')
    expect([...(run.sealedRelics ?? [])].sort()).toEqual([...allSeals].sort())
    let offered = new Set<RelicId>()
    for (const wave of [5, 10, 15, 20]) {
      const cleared = clearWave(run, wave, [], false)
      offered = new Set([...offered, ...(cleared.relicOffer ?? [])])
    }
    for (const relic of allSeals) expect(offered.has(relic), relic).toBe(false)
  })

  it('seals break on the record a run writes, and stay broken', () => {
    let meta: MetaState = createMeta()
    const run = createRun(meta, 'seal-break')
    const beatGatebreaker = { ...run, phase: 'defeat' as const, wavesCleared: 7, killsByEnemy: { boss: 1 } }
    meta = settleRun(meta, beatGatebreaker).meta
    expect(meta.relicSeals).toEqual(['boss'])
    expect(sealedRelics(meta)).not.toContain('storm_coils')
    expect(sealedRelics(meta)).toContain('shatterheart')
    const won = { ...createRun(meta, 'seal-win'), phase: 'victory' as const, victoryClaimed: true, wavesCleared: 24 }
    meta = settleRun(meta, won).meta
    expect(meta.relicSeals).toContain('victory')
    expect(sealedRelics(meta)).not.toContain('shatterheart')
    // A win at Crucible 1 breaks the last seal.
    const ranked = { ...createRun({ ...meta, crucibleRank: 1 }, 'seal-rank'), phase: 'victory' as const, victoryClaimed: true, wavesCleared: 24 }
    expect(ranked.crucible).toBe(1)
    meta = settleRun(meta, ranked).meta
    expect(sealedRelics(meta)).toEqual(['cinder_shells', 'golden_ledger', 'prism_lens', 'duelists_oath'])
  })

  it('saves from before seals derive them from their record; dailies play the whole table', () => {
    const veteran = { ...createMeta(), victories: 3, cycleVictories: 2, guardianMilestones: ['boss', 'boss2', 'boss3'] }
    expect(sealedRelics(veteran)).toEqual([])
    expect(createRun(createMeta(), 'daily-2026-09-24').sealedRelics).toEqual([])
  })
})

describe('guardian spoils', () => {
  // Spoils are Crucible content: this account plays at rank 1.
  const run = createRun({ ...createMeta(), victories: 1, crucibleUnlocked: 1, crucibleRank: 1, relicSeals: RELIC_SEALS.map((seal) => seal.id) }, 'spoils')

  it('a slain guardian offers an exchange, never an extra relic', () => {
    const s = clearWave(run, 6, ['keen_sights', 'glass_cannon'])
    expect(s.relicSpoils).toBe(true)
    expect(s.relicOffer).toHaveLength(2)
    const pick = s.relicOffer![0]!
    // Adding without giving something up is refused.
    expect(step(s, [{ type: 'choose_relic', relic: pick }]).events.some((e) => e.type === 'command_rejected')).toBe(true)
    // Glass Cannon's price was paid at pick time: it can never be traded away.
    expect(swappableRelics(s)).toEqual(['keen_sights'])
    expect(step(s, [{ type: 'choose_relic', relic: pick, replace: 'glass_cannon' }]).events.some((e) => e.type === 'command_rejected')).toBe(true)
    const swapped = step(s, [{ type: 'choose_relic', relic: pick, replace: 'keen_sights' }]).state
    expect([...swapped.relics].sort()).toEqual(['glass_cannon', pick].sort())
    expect(swapped.relicOffer).toBeNull()
    expect(swapped.relicSpoils).toBe(false)
  })

  it('walking away is free and pays nothing; spoils cannot be rerolled', () => {
    const s = clearWave(run, 12, ['keen_sights'])
    expect(s.relicSpoils).toBe(true)
    expect(step(s, [{ type: 'reroll_relic' }]).events.some((e) => e.type === 'command_rejected')).toBe(true)
    const left = step(s, [{ type: 'choose_relic', relic: null }]).state
    expect(left.gold).toBe(s.gold)
    expect(left.relics).toEqual(['keen_sights'])
    expect(left.relicOffer).toBeNull()
  })

  it('no spoils at Crucible rank 0, without a slain guardian or a relic to trade, or before rules 6', () => {
    expect(run.crucible).toBe(1)
    expect(clearWave({ ...run, crucible: 0 }, 6, ['keen_sights']).relicOffer).toBeNull()
    expect(clearWave(run, 6, ['keen_sights'], false).relicOffer).toBeNull()
    expect(clearWave(run, 6, []).relicOffer).toBeNull()
    expect(clearWave(run, 6, ['glass_cannon']).relicOffer).toBeNull() // nothing tradeable
    expect(clearWave({ ...run, rulesVersion: 5 }, 6, ['keen_sights']).relicOffer).toBeNull()
    // Ordinary offers are untouched by the exchange rule.
    const regular = clearWave(run, 5, ['keen_sights'])
    expect(regular.relicSpoils).toBeFalsy()
    expect(step(regular, [{ type: 'choose_relic', relic: regular.relicOffer![0]!, replace: 'keen_sights' }]).events.some((e) => e.type === 'command_rejected')).toBe(true)
  })
})
