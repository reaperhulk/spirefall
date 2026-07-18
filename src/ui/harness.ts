import { ENEMIES } from '../data/content'
import type { MetaUpgradeId } from '../data/metaTree'
import type { Command, Enemy, MetaState, RunState } from '../engine/types'
import { blockedGrid, cellCenter, distanceField, pathFrom } from '../engine/grid'
import { getRunMap } from '../engine/mapgen'
import type { GameSession, LoggedCommand } from './session'

// Dev/test harness exposed on window. Everything the Playwright suite and
// manual DevTools playtesting need: full state access, command dispatch,
// speed control, instant time skips, and replay capture.

export interface HarnessApi {
  getSession: () => GameSession
  getMeta: () => MetaState
  audioState: () => string
  audioLive: () => boolean
  newRun: (seed?: string) => void
  buyMeta: (id: MetaUpgradeId) => void
  reset: () => void
}

export interface GameHarness {
  getState: () => RunState
  getMeta: () => MetaState
  // The run's battlefield, summarized for tests: gate positions plus which
  // cells can hold a tower (rocks, mesas, and marsh accounted for).
  getMapInfo: () => {
    width: number
    height: number
    spawn: { cx: number; cy: number }
    spire: { cx: number; cy: number }
    buildable: boolean[]
    // The walk enemies take RIGHT NOW (current towers block) — lets test
    // pilots place towers that actually cover the route on generated maps.
    path: { cx: number; cy: number }[]
  }
  // AudioContext state ('none' before first gesture) — for on-device
  // debugging of autoplay-unlock issues and the e2e unlock assertion.
  audioState: () => string
  // PROBED liveness: true only after the audio clock was seen advancing.
  audioLive: () => boolean
  // DEBUG-ONLY: inject n live runners marching from the gate. Exists so
  // perf probes can stage a true horde scene — waves die too fast against
  // real defenses to measure render load through supported commands.
  spawnHorde: (n: number) => void
  dispatch: (command: Command) => void
  setSpeed: (n: number) => void
  getSpeed: () => number
  fastForward: (seconds: number) => void
  snapshot: () => {
    tick: number
    phase: string
    wave: number
    gold: number
    spireHp: number
    towers: number
    enemies: number
    kills: number
    relics: string[]
    metaSparks: number
    runs: number
  }
  getReplay: () => { seed: string; log: LoggedCommand[] }
  newRun: (seed?: string) => void
  buyMeta: (id: MetaUpgradeId) => void
  reset: () => void
}

declare global {
  interface Window {
    __game?: GameHarness
    __harness?: GameHarness
  }
}

export function installHarness(api: HarnessApi): void {
  const harness: GameHarness = {
    getState: () => api.getSession().state,
    getMeta: () => api.getMeta(),
    getMapInfo: () => {
      const state = api.getSession().state
      const map = getRunMap(state)
      const buildable = map.rocks.map(
        (rock, i) =>
          !rock &&
          !map.marsh[i] &&
          !(i === map.spawn.cy * map.width + map.spawn.cx) &&
          !(i === map.spire.cy * map.width + map.spire.cx),
      )
      const path = pathFrom(map, distanceField(map, blockedGrid(map, state.towers)), map.spawn).map((c) => ({ ...c }))
      return { width: map.width, height: map.height, spawn: { ...map.spawn }, spire: { ...map.spire }, buildable, path }
    },
    audioState: api.audioState,
    audioLive: api.audioLive,
    spawnHorde: (n) => {
      const s = api.getSession().state
      const map = getRunMap(s)
      const spawn = cellCenter(map.spawn)
      const def = ENEMIES.runner
      for (let i = 0; i < n; i++) {
        const enemy: Enemy = {
          id: s.nextEntityId++,
          type: 'runner',
          pos: { x: spawn.x + (i % 8) * 120, y: spawn.y + (Math.floor(i / 8) % 3 - 1) * 250 },
          hp: def.hp,
          maxHp: def.hp,
          speed: def.speed,
          slowFactor: 100,
          slowTicks: 0,
          bounty: 0,
          damage: 1,
          shield: 0,
          armor: 0,
          healCooldown: 0,
          broodCooldown: 0,
          phased: false,
          phaseCooldown: 0,
          burnTicks: 0,
          burnPerTick: 0,
          overcharge: 0,
          mechCooldown: 0,
          mechActiveTicks: 0,
          brittleTicks: 0,
          targetCell: null,
        }
        s.enemies.push(enemy)
      }
      if (s.phase === 'build') s.phase = 'wave'
    },
    dispatch: (command) => api.getSession().dispatch(command),
    setSpeed: (n) => {
      api.getSession().speed = Math.max(0, Math.min(100, n))
    },
    getSpeed: () => api.getSession().speed,
    fastForward: (seconds) => api.getSession().fastForward(seconds),
    snapshot: () => {
      const s = api.getSession().state
      const meta = api.getMeta()
      return {
        tick: s.tick,
        phase: s.phase,
        wave: s.wave,
        gold: s.gold,
        spireHp: s.spireHp,
        towers: s.towers.length,
        enemies: s.enemies.length,
        kills: s.kills,
        relics: [...s.relics],
        metaSparks: meta.sparks,
        runs: meta.runs,
      }
    },
    getReplay: () => ({ seed: api.getSession().state.seed, log: [...api.getSession().commandLog] }),
    newRun: api.newRun,
    buyMeta: api.buyMeta,
    reset: api.reset,
  }
  window.__game = harness
  window.__harness = harness
}
