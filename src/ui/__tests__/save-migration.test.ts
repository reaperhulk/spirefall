import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMeta } from '../../engine/meta'
import { clearSave, loadSave } from '../save'

const values = new Map<string, string>()
beforeEach(() => {
  values.clear()
  vi.stubGlobal('localStorage', { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) })
  clearSave()
})
afterEach(() => vi.unstubAllGlobals())

const store = (meta: object) => values.set('spirefall-save', JSON.stringify({ version: 1, meta, run: null }))

it('refunds Honed Edge III levels beyond its new four-level cap at their original price', () => {
  store({ ...createMeta(), sparks: 100, upgrades: { tower_damage: 8, tower_damage_2: 8, tower_damage_3: 7 } })
  const meta = loadSave()!.meta
  expect(meta.upgrades['tower_damage_3']).toBe(4)
  expect(meta.sparks).toBe(100 + 12169 + 16428 + 22178)
})

it('converts a pre-split 25-level Honed Edge into the capped veins with a full refund of the excess', () => {
  store({ ...createMeta(), upgrades: { tower_damage: 25 } })
  const meta = loadSave()!.meta
  expect(meta.upgrades).toMatchObject({ tower_damage: 8, tower_damage_2: 8, tower_damage_3: 4 })
  expect(meta.sparks).toBe(12169 + 16428 + 22178 + 29940 + 40419)
})

it('accepts the rules-6 ladder fields and rejects a Crucible above the cap', () => {
  store({ ...createMeta(), victories: 3, crucibleUnlocked: 4, crucibleRank: 2, cycleEmbers: 5, cycleSparks: 9000 })
  expect(loadSave()!.meta.crucibleUnlocked).toBe(4)
  clearSave()
  store({ ...createMeta(), crucibleUnlocked: 99 })
  expect(loadSave()).toBeNull()
})
