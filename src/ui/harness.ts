import type { MetaUpgradeId } from '../data/metaTree'
import type { Command, MetaState, RunState } from '../engine/types'
import type { GameSession, LoggedCommand } from './session'

// Dev/test harness exposed on window. Everything the Playwright suite and
// manual DevTools playtesting need: full state access, command dispatch,
// speed control, instant time skips, and replay capture.

export interface HarnessApi {
  getSession: () => GameSession
  getMeta: () => MetaState
  newRun: (seed?: string) => void
  buyMeta: (id: MetaUpgradeId) => void
  reset: () => void
}

export interface GameHarness {
  getState: () => RunState
  getMeta: () => MetaState
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
