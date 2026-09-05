import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMeta, createRun } from '../../engine/meta'
import { loadSave, persistSave, clearSave, getSaveStatus } from '../save'
import { parseRecording, RULES_VERSION } from '../validation'
import { GameSession } from '../session'
import { gzipBase64Url, gunzipBase64Url } from '../codec'

const values = new Map<string, string>()
beforeEach(() => {
  values.clear()
  vi.stubGlobal('localStorage', { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) })
  clearSave()
})
afterEach(() => vi.unstubAllGlobals())

it('retains the full recording across a saved checkpoint', () => {
  const session = new GameSession(createRun(createMeta(), 'resume'))
  session.dispatch({ type: 'start_wave' })
  session.fastForward(0.1)
  const recording = session.recording()
  expect(persistSave({ version: 1, meta: createMeta(), run: session.state, recording })).toBe(true)
  const save = loadSave()!
  expect(save).not.toBeNull()
  const resumed = new GameSession(save.run!, save.recording)
  resumed.fastForward(0.1)
  const replay = resumed.replaySession()
  replay.fastForward(0.2)
  expect(replay.state).toEqual(resumed.state)
  expect(resumed.initial.tick).toBe(0)
})
it('accepts checkpoint replays and rejects malformed or incompatible scripts', () => {
  const session = new GameSession(createRun(createMeta(), 'checkpoint'))
  session.fastForward(1)
  const resumed = new GameSession(session.state)
  resumed.dispatch({ type: 'start_wave' })
  resumed.fastForward(0.1)
  expect(parseRecording(JSON.stringify(resumed.recording()))?.initial.tick).toBe(30)
  expect(parseRecording(JSON.stringify({ ...resumed.recording(), rules: RULES_VERSION + 1 }))).toBeNull()
  expect(parseRecording(JSON.stringify({ ...resumed.recording(), log: [{ tick: 0, command: { type: 'oops' } }] }))).toBeNull()
})
it('recovers the prior checkpoint when the primary is damaged', () => {
  persistSave({ version: 1, meta: createMeta(), run: null })
  persistSave({ version: 1, meta: { ...createMeta(), sparks: 12 }, run: null })
  values.set('spirefall-save', '{broken')
  expect(loadSave()?.meta.sparks).toBe(0)
  expect(getSaveStatus()).toContain('Recovered')
})
it('surfaces quota failures and rejects non-finite progression', () => {
  values.set('spirefall-save', '{"version":1,"meta":{"sparks":1e309,"upgrades":{}},"run":null}')
  expect(loadSave()).toBeNull()
  vi.stubGlobal('localStorage', { setItem: () => { throw new Error('quota') } })
  expect(persistSave({ version: 1, meta: createMeta(), run: null })).toBe(false)
  expect(getSaveStatus()).toContain('could not be saved')
})
it('round-trips large compressed payloads without spreading chunks onto the stack', async () => {
  const text = 'a'.repeat(300000)
  expect(await gunzipBase64Url((await gzipBase64Url(text))!)).toBe(text)
  expect(await gunzipBase64Url('invalid gzip')).toBeNull()
})
it('pauses the simulation while a planning dialog owns the session', () => {
  const session = new GameSession(createRun(createMeta(), 'planning'))
  session.suspended = true
  session.advance(1000)
  expect(session.state.tick).toBe(0)
  session.suspended = false
  session.advance(100)
  expect(session.state.tick).toBeGreaterThan(0)
})

it('seeks backward and forward through resumed recordings with identical states', async () => {
  const live = new GameSession(createRun(createMeta(), 'seek'))
  live.dispatch({ type: 'start_wave' })
  live.fastForward(1)
  const at30 = JSON.parse(JSON.stringify(live.state))
  live.fastForward(1)
  const resumed = new GameSession(live.state, live.recording())
  resumed.fastForward(1)
  const replay = resumed.replaySession()
  const visualId = replay.renderId
  await replay.seek(90)
  expect(replay.state).toEqual(resumed.state)
  await replay.seek(30)
  expect(replay.state).toEqual(at30)
  expect(replay.renderId).not.toBe(visualId)
  await Promise.all([replay.seek(90), replay.seek(30)])
  expect(replay.state).toEqual(at30)
  await replay.seek(999999)
  replay.fastForward(1)
  expect(replay.state).toEqual(resumed.state)
  expect(replay.seeking).toBe(false)
})

it('rejects broken modifiers, unknown progression and incompatible specializations', async () => {
  const { validRun } = await import('../validation')
  const { step } = await import('../../engine/step')
  const { buildCandidates } = await import('../../harness/placement')
  let state = createRun(createMeta(), 'specialized-save')
  state.gold = 10000
  state = step(state, [{type:'place_tower', tower:'cannon', cell:buildCandidates(state)[0]!}]).state
  const id = state.towers[0]!.id
  for (const command of [{type:'upgrade_tower', id}, {type:'upgrade_tower', id}, {type:'specialize_tower', id, spec:'mortar'}] as const) state = step(state, [command]).state
  expect(validRun(state)).toBe(true)
  const session = new GameSession(state)
  session.dispatch({ type:'specialize_tower', id, spec:'mortar' })
  session.fastForward(0.1)
  expect(parseRecording(JSON.stringify(session.recording()))).not.toBeNull()
  expect(validRun({ ...state, mods: { critChancePct: 0 } })).toBe(false)
  expect(validRun({ ...state, towers: state.towers.map(t => ({...t, spec:'capacitor'})) })).toBe(false)
  values.set('spirefall-save', JSON.stringify({version:1, meta:{...createMeta(), upgrades:{unknown:1}}, run:null}))
  expect(loadSave()).toBeNull()
})
