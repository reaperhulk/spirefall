import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMeta } from '../../engine/meta'
import { clearSave, getSaveStatus, loadSave, persistSave, resetSaveSession } from '../save'

const values = new Map<string, string>()
beforeEach(() => {
  values.clear()
  vi.stubGlobal('localStorage', { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) })
  clearSave()
  resetSaveSession()
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

it('drops only an unrestorable run and keeps the account', async () => {
  const { createRun } = await import('../../engine/meta')
  const run = createRun(createMeta(), 'broken-run')
  run.gold = -5 // violates an invariant
  values.set('spirefall-save', JSON.stringify({ version: 1, meta: { ...createMeta(), sparks: 4321 }, run }))
  const save = loadSave()!
  expect(save.meta.sparks).toBe(4321)
  expect(save.run).toBeNull()
  expect(getSaveStatus()).toContain('could not be restored')
  // A structurally malformed run is dropped the same way.
  clearSave()
  values.set('spirefall-save', JSON.stringify({ version: 1, meta: { ...createMeta(), sparks: 7 }, run: { towers: 3 } }))
  expect(loadSave()).toMatchObject({ meta: { sparks: 7 }, run: null })
})

it('copies an unreadable save aside before anything can overwrite it', () => {
  values.set('spirefall-save', '{broken')
  expect(loadSave()).toBeNull()
  expect(values.get('spirefall-save-corrupt')).toBe('{broken')
  values.set('spirefall-save', '{also broken')
  loadSave()
  expect(values.get('spirefall-save-corrupt')).toBe('{broken')
})

it('saves without the recording when the full payload does not fit', async () => {
  const { createRun } = await import('../../engine/meta')
  const { registerRecording } = await import('../save')
  const run = createRun(createMeta(), 'huge')
  const unregister = registerRecording(() => ({ v: 3, rules: 6, initial: run, endTick: run.tick, log: Array.from({ length: 200000 }, (_, tick) => ({ tick, command: { type: 'start_wave' as const } })) }))
  try {
    expect(persistSave({ version: 1, meta: createMeta(), run })).toBe(true)
    const saved = JSON.parse(values.get('spirefall-save')!) as { run: unknown; recording?: unknown }
    expect(saved.run).not.toBeNull()
    expect(saved.recording).toBeUndefined()
  } finally {
    unregister()
  }
})

it('exports the newest progress even when storage rejected it', async () => {
  const { exportSave } = await import('../save')
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw new Error('quota') }, removeItem: () => {} })
  expect(persistSave({ version: 1, meta: { ...createMeta(), sparks: 99 }, run: null })).toBe(false)
  const code = await exportSave()
  expect(code).not.toBeNull()
})

it('nothing saves between a wipe and the reload, so a trailing autosave cannot resurrect the run', () => {
  persistSave({ version: 1, meta: { ...createMeta(), sparks: 50 }, run: null })
  clearSave()
  expect(persistSave({ version: 1, meta: { ...createMeta(), sparks: 50 }, run: null })).toBe(false)
  expect(values.get('spirefall-save')).toBeUndefined()
})
