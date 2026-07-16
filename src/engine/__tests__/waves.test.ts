import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { BOSS_WAVE_INTERVAL, ENEMIES, MAX_UNITS_PER_WAVE } from '../../data/content'
import { deriveStream } from '../rng'
import { generateWave, scaledHp } from '../waves'

describe('wave generation', () => {
  it('is deterministic for the same rng state', () => {
    const rng = deriveStream('waves-test', 'waves')
    const a = generateWave(rng, 5, 200)
    const b = generateWave(rng, 5, 200)
    expect(a.spawns).toEqual(b.spawns)
    expect(a.rng).toEqual(b.rng)
  })

  it('respects unlock waves', () => {
    fc.assert(
      fc.property(fc.string(), fc.integer({ min: 1, max: 30 }), (seed, wave) => {
        const { spawns } = generateWave(deriveStream(seed, 'waves'), wave, 500)
        for (const s of spawns) {
          if (s.type === 'boss') continue
          expect(ENEMIES[s.type].unlockWave).toBeLessThanOrEqual(wave)
        }
      }),
    )
  })

  it('spawn ticks are non-decreasing and unit count is capped', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.integer({ min: 1, max: 60 }),
        fc.integer({ min: 10, max: 100_000 }),
        (seed, wave, budget) => {
          const { spawns } = generateWave(deriveStream(seed, 'waves'), wave, budget)
          expect(spawns.length).toBeLessThanOrEqual(MAX_UNITS_PER_WAVE)
          for (let i = 1; i < spawns.length; i++) {
            expect(spawns[i]!.tick).toBeGreaterThanOrEqual(spawns[i - 1]!.tick)
          }
        },
      ),
    )
  })

  it('boss waves lead with a boss', () => {
    const { spawns } = generateWave(deriveStream('boss', 'waves'), BOSS_WAVE_INTERVAL, 400)
    expect(spawns[0]!.type).toBe('boss')
    expect(spawns.filter((s) => s.type === 'boss')).toHaveLength(1)
  })

  it('non-boss waves never contain a boss', () => {
    for (let wave = 1; wave < BOSS_WAVE_INTERVAL; wave++) {
      const { spawns } = generateWave(deriveStream('noboss', 'waves'), wave, 1000)
      expect(spawns.every((s) => s.type !== 'boss')).toBe(true)
    }
  })

  it('spends the budget down to less than one group cost (unless unit-capped)', () => {
    fc.assert(
      fc.property(fc.string(), fc.integer({ min: 1, max: 40 }), fc.integer({ min: 30, max: 20_000 }), (seed, wave, budget) => {
        const { spawns } = generateWave(deriveStream(seed, 'waves'), wave, budget)
        if (spawns.length >= MAX_UNITS_PER_WAVE) return
        const effective = wave % BOSS_WAVE_INTERVAL === 0 ? Math.floor(budget / 2) : budget
        const spent = spawns.filter((s) => s.type !== 'boss').reduce((sum, s) => sum + ENEMIES[s.type].cost, 0)
        const maxGroupCost = 30 // shieldbearer, the priciest single group
        expect(effective - spent).toBeLessThan(maxGroupCost)
      }),
    )
  })

  it('scaledHp scales with hpScalePct and never hits zero', () => {
    expect(scaledHp('runner', 100)).toBe(ENEMIES.runner.hp)
    expect(scaledHp('runner', 200)).toBe(ENEMIES.runner.hp * 2)
    expect(scaledHp('swarmling', 1)).toBeGreaterThanOrEqual(1)
  })
})
