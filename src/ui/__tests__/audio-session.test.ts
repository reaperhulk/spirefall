import { afterEach, expect, it, vi } from 'vitest'
import { createMeta, createRun } from '../../engine/meta'
import type { Enemy } from '../../engine/types'
import { AudioCues } from '../audioCues'
import type { Sfx } from '../audio'
import { Music } from '../music'
import { settings } from '../settings'

afterEach(() => vi.restoreAllMocks())
it('fifteen minutes of biome, phase, mute and stall transitions keep scheduled work bounded', () => {
  const state = createRun(createMeta(), 'long-audio')
  let clock = 0, starts = 0, maxActive = 0
  const sources: {end:number}[] = []
  const param = () => ({value:0, setValueAtTime:check, linearRampToValueAtTime:check, exponentialRampToValueAtTime:check, setTargetAtTime:check})
  function check(...args:number[]) { for (const n of args) expect(Number.isFinite(n)).toBe(true) }
  const node = () => ({gain:param(),frequency:param(),detune:param(),Q:param(),delayTime:param(),connect:() => {},disconnect:() => {}})
  const ctx = {
    get currentTime() { return clock }, state:'running', destination:node(),
    createGain:node, createBiquadFilter:node, createDelay:node, createPeriodicWave:() => ({}),
    createOscillator:() => {
      const source = {end:Infinity}; sources.push(source)
      return {...node(), setPeriodicWave:() => {}, start:(at=clock) => { expect(at).toBeGreaterThanOrEqual(clock - 0.35); starts++ }, stop:(at=clock) => { expect(Number.isFinite(at)).toBe(true); source.end=at }}
    },
  }
  const sfx = {muted:false, musicDuck:1, currentContext:() => ctx, musicDestination:() => ctx.destination, currentNoiseBuffer:() => null} as unknown as Sfx
  const music = new Music(sfx)
  const authored = vi.spyOn(music as unknown as {authoredNote:(ctx:unknown,at:number,root:number,scale:number[],phase:string,offset:number)=>void}, 'authoredNote')
  const probe = music as unknown as {getState:() => typeof state; tick:() => void}
  probe.getState = () => state
  const originalVolume = settings.musicVolume; settings.musicVolume = 60
  try {
    for (let i=0; i<4500; i++) {
      clock = i / 5
      state.biome = (['verdant','frostfen','emberwaste','highlands'] as const)[Math.floor(i/300)%4]!
      state.phase = i%300 < 80 ? 'build' : i%300 > 270 ? 'victory' : 'wave'
      state.enemies = i%300 > 180 ? [{type:'boss_final',hp:10} as Enemy] : []
      sfx.muted = i%600 >= 500
      const before = starts
      probe.tick()
      expect(starts - before).toBeLessThanOrEqual(20)
      const active = sources.filter(s => s.end > clock).length
      maxActive = Math.max(maxActive, active)
      expect(active).toBeLessThanOrEqual(36)
      for (let j=sources.length-1; j>=0; j--) if (sources[j]!.end <= clock) sources.splice(j,1)
    }
    clock += 600; sfx.muted = false
    const before = starts; probe.tick()
    expect(starts - before).toBeLessThanOrEqual(20)
    expect(maxActive).toBeGreaterThan(3)
    expect(starts).toBeGreaterThan(500)
    // The old 64-step modulo silently discarded the second half of longer
    // themes. Exercise one uninterrupted pressure passage through its ending.
    state.phase = 'wave'; state.enemies = []
    for (let i=0;i<300;i++) { clock += 0.2; probe.tick() }
    expect(authored.mock.calls.some(call => call[4] === 'pressure' && call[5] > 110)).toBe(true)
  } finally { settings.musicVolume = originalVolume }
})

it('tactical cues announce state edges and heat hysteresis, without repeating every frame', () => {
  const cues = new AudioCues(), state = createRun(createMeta(),'cues')
  state.phase = 'wave'
  state.enemies = [{id:1,type:'boss_final',hp:10,maxHp:100,phased:false,mechActiveTicks:0,mechCooldown:100} as Enemy]
  expect(cues.observe(state,1)).toEqual(['execute_ready','core_open'])
  expect(cues.observe(state,1)).toEqual([])
  state.beamHeat = 95
  expect(cues.observe(state,1)).toEqual(['beam_warning'])
  state.beamHeat = 90
  expect(cues.observe(state,1)).toEqual([])
  state.executeCd = 1; cues.observe(state,1)
  state.executeCd = 0
  expect(cues.observe(state,1)).toEqual(['execute_ready'])
  state.phase = 'build'; cues.observe(state,1)
  expect(cues.observe(state,1)).toEqual([])
})
