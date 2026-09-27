import { describe, expect, it } from 'vitest'
import { ENEMIES, GALE_SPEED_PCT, RELIC_SEALS, VICTORY_WAVE } from '../../data/content'
import { isSlowed } from '../campaign'
import { collectDead, isqrt } from '../combat'
import { cellCenter } from '../grid'
import { authoredPattern, getRunMap, tacticalMap } from '../mapgen'
import { createMeta, createRun, settleRun } from '../meta'
import { step, wavesUntilCataclysm } from '../step'
import type { Enemy, GameEvent, RelicId, RunState } from '../types'

// Rules 7 correctness fixes. Each case also pins the rules-6 behaviour so
// old replays keep their exact outcomes.

function enemy(overrides: Partial<Enemy> & { id: number }): Enemy {
  const def = ENEMIES.brute
  return {
    type: 'brute', pos: cellCenter({ cx: 10, cy: 6 }), hp: def.hp, maxHp: def.hp, speed: 100,
    slowFactor: 100, slowTicks: 0, bounty: def.bounty, damage: 3, shield: 0, armor: 0,
    healCooldown: 0, broodCooldown: 0, phased: false, phaseCooldown: 0, burnTicks: 0, burnPerTick: 0,
    overcharge: 0, mechCooldown: 0, mechActiveTicks: 0, brittleTicks: 0, targetCell: null,
    ...overrides,
  }
}

function waveState(rules: number, seed = 'rules7-lab'): RunState {
  const s = createRun(createMeta(), seed)
  s.rulesVersion = rules
  s.phase = 'wave'
  s.wave = 5
  s.pendingSpawns = [{ type: 'runner', tick: 1_000_000 }]
  return s
}

describe('rules 7', () => {
  it('an executed enemy at the Spire dies instead of walking in', () => {
    for (const [rules, reached] of [[6, true], [7, false]] as const) {
      const s = waveState(rules)
      const spire = cellCenter(getRunMap(s).spire)
      const max = ENEMIES.brute.hp
      s.enemies = [enemy({ id: s.nextEntityId, pos: spire, hp: Math.floor(max / 10), maxHp: max })]
      s.nextEntityId += 1
      const { state, events } = step(s, [{ type: 'execute_enemy', id: s.enemies[0]!.id }])
      expect(events.some((e) => e.type === 'enemy_reached_spire'), `rules ${rules}`).toBe(reached)
      expect(events.some((e) => e.type === 'enemy_killed'), `rules ${rules}`).toBe(!reached)
      if (!reached) expect(state.spireHp).toBe(s.spireHp)
    }
  })

  it('gale haste is not a slow', () => {
    const hastened = enemy({ id: 1, slowTicks: 30, slowFactor: GALE_SPEED_PCT })
    const chilled = enemy({ id: 2, slowTicks: 30, slowFactor: 60 })
    expect(isSlowed(waveState(6), hastened)).toBe(true) // legacy semantics
    expect(isSlowed(waveState(7), hastened)).toBe(false)
    expect(isSlowed(waveState(7), chilled)).toBe(true)
  })

  it('Shatterheart bursts land after the kill pass: no cascade within a tick', () => {
    for (const [rules, sameTick] of [[6, true], [7, false]] as const) {
      const s = waveState(rules)
      s.relics = ['shatterheart']
      const at = cellCenter({ cx: 10, cy: 6 })
      s.enemies = [
        enemy({ id: 1, pos: at, hp: 0, slowTicks: 10, slowFactor: 50 }),
        enemy({ id: 2, pos: at, hp: 1, slowTicks: 10, slowFactor: 50 }),
      ]
      s.nextEntityId = 3
      const events: GameEvent[] = []
      collectDead(s, events)
      const kills = events.filter((e) => e.type === 'enemy_killed').length
      expect(kills, `rules ${rules}`).toBe(sameTick ? 2 : 1)
      if (!sameTick) {
        expect(s.enemies.map((e) => e.hp)).toEqual([0])
        collectDead(s, events)
        expect(s.enemies).toEqual([])
      }
    }
  })

  it('an ignored guardian spoils offer never makes the next regular offer swap-only', () => {
    const meta = { ...createMeta(), victories: 1, crucibleUnlocked: 1, crucibleRank: 1, relicSeals: RELIC_SEALS.map((seal) => seal.id) }
    for (const [rules, carried] of [[6, true], [7, false]] as const) {
      const run = { ...createRun(meta, 'spoils-carry'), rulesVersion: rules }
      const clear = (from: RunState, wave: number, relics: RelicId[]) =>
        step({ ...from, wave, phase: 'wave', pendingSpawns: [], enemies: [], relics, killsByEnemy: { boss: 1, boss2: 1, boss3: 1 } }, []).state
      const spoils = clear(run, 6, ['keen_sights'])
      expect(spoils.relicSpoils).toBe(true)
      const regular = clear(spoils, 10, spoils.relics) // the offer was left pending
      expect(regular.relicOffer).not.toBeNull()
      expect(regular.relicSpoils ?? false, `rules ${rules}`).toBe(carried)
    }
  })
})

describe('outcome-neutral fixes', () => {
  it('isqrt is the exact integer floor', () => {
    for (let n = 0; n < 5000; n++) {
      const r = isqrt(n)
      expect(r * r <= n && (r + 1) * (r + 1) > n, `isqrt(${n})`).toBe(true)
    }
    expect(isqrt(24000 * 24000 + 14000 * 14000)).toBe(27784)
  })

  it('a battlefield is named after the structure it actually has', () => {
    const names = ['Broken ramparts', 'The watchroad', 'Old fort']
    let authored = 0
    for (let i = 0; i < 60; i++) {
      const seed = `name-${i}`
      const map = tacticalMap('verdant', seed)
      if (!names.includes(map.situation!)) continue
      authored += 1
      expect(map.situation).toBe(names[authoredPattern(seed)])
    }
    expect(authored).toBeGreaterThan(10)
  })

  it('the countdown shows the first Cataclysm when the victory wave is next', () => {
    const s = createRun(createMeta(), 'first-cataclysm')
    expect(wavesUntilCataclysm({ ...s, phase: 'build', wave: VICTORY_WAVE - 1 })).toBe(1)
    expect(wavesUntilCataclysm({ ...s, phase: 'wave', wave: VICTORY_WAVE })).toBe(1)
    expect(wavesUntilCataclysm({ ...s, phase: 'build', wave: VICTORY_WAVE - 2 })).toBeNull()
  })

  it('a daily win pays Sparks but never climbs the ladder or moves the frontier', () => {
    const meta = createMeta()
    const daily = { ...createRun(meta, 'daily-2026-09-27'), phase: 'victory' as const, victoryClaimed: true, wavesCleared: 24, sparksEarned: 300 }
    const settled = settleRun(meta, daily).meta
    expect(settled.sparks).toBeGreaterThanOrEqual(300) // plus any achievement bounty
    expect(settled.victories).toBe(0)
    expect(settled.cycleVictories).toBe(0)
    expect(settled.bestWave).toBe(0)
    expect(settled.relicSeals ?? []).not.toContain('victory')
    expect(settled.runs).toBe(1)
  })
})
