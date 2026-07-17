import { cellCenter, getMap } from '../engine/grid'
import { step, TICKS_PER_SECOND } from '../engine/step'
import type { Command, GameEvent, RunState, Vec } from '../engine/types'

// GameSession is the bridge between browser time and simulation time. All it
// does is accumulate real milliseconds into fixed engine ticks — the engine
// cannot tell 1× from 100× speed, by construction. It also turns engine
// events into short-lived visual effects for the renderer and keeps a
// replayable log of every command it feeds to the sim.

export interface VisualEffect {
  kind: 'beam' | 'splash' | 'meteor' | 'nova' | 'death' | 'spire_hit' | 'gold_rush' | 'heal' | 'float'
  from?: Vec
  to?: Vec
  at?: Vec
  color?: string
  text?: string
  t0: number // performance.now() timestamp
  dur: number // ms
}

export interface LoggedCommand {
  tick: number
  command: Command
}

const TICK_MS = 1000 / TICKS_PER_SECOND
const MAX_STEPS_PER_FRAME = 300
const TOWER_BEAM_COLORS: Record<string, string> = {
  arrow: '#9ece6a',
  cannon: '#e0af68',
  frost: '#7dcfff',
  tesla: '#bb9af7',
}

export class GameSession {
  state: RunState
  prev: RunState // one tick behind, for render interpolation
  speed = 1
  effects: VisualEffect[] = []
  commandLog: LoggedCommand[] = []
  version = 0
  // Render-only: last firing angle per tower id, so turrets visibly track
  // their targets. Never read by the sim.
  aim: Record<number, number> = {}

  private onEvents: ((events: GameEvent[], state: RunState) => void) | null = null
  // Events raised before a handler attaches (e.g. the harness drives a brand
  // new session before React's effect wires it up) are buffered and flushed
  // on attach — run_ended must never fall into that gap.
  private pendingEvents: Array<{ events: GameEvent[]; state: RunState }> = []
  private queue: Command[] = []
  private accumulator = 0
  private listeners = new Set<() => void>()
  private lastNotify = 0

  constructor(initial: RunState) {
    this.state = initial
    this.prev = initial
  }

  get terminal(): boolean {
    return this.state.phase === 'defeat' || this.state.phase === 'victory'
  }

  dispatch(command: Command): void {
    this.queue.push(command)
  }

  setOnEvents(handler: ((events: GameEvent[], state: RunState) => void) | null): void {
    this.onEvents = handler
    if (handler && this.pendingEvents.length > 0) {
      const pending = this.pendingEvents
      this.pendingEvents = []
      for (const p of pending) handler(p.events, p.state)
    }
  }

  setSpeed(n: number): void {
    this.speed = Math.max(0, Math.min(100, n))
  }

  // Called once per animation frame with real elapsed milliseconds.
  advance(dtMs: number): void {
    if (this.speed <= 0 || this.terminal) {
      this.maybeNotify(true)
      return
    }
    this.accumulator += Math.min(dtMs, 1000) * this.speed
    let steps = 0
    while (this.accumulator >= TICK_MS && steps < MAX_STEPS_PER_FRAME) {
      this.stepOnce()
      this.accumulator -= TICK_MS
      steps += 1
    }
    if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0 // shed backlog, no spiral
    this.maybeNotify(steps > 0)
  }

  // Interpolation factor between prev and state for smooth 60fps rendering.
  get alpha(): number {
    if (this.speed <= 0 || this.terminal) return 1
    return Math.max(0, Math.min(1, this.accumulator / TICK_MS))
  }

  // Advance simulation time instantly (dev harness / automated tests).
  fastForward(seconds: number): void {
    const ticks = Math.min(Math.floor(seconds * TICKS_PER_SECOND), 3600 * TICKS_PER_SECOND)
    for (let i = 0; i < ticks && !this.terminal; i++) this.stepOnce()
    this.effects = []
    this.notify()
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getVersion = (): number => this.version

  private stepOnce(): void {
    const commands = this.queue.splice(0)
    for (const command of commands) this.commandLog.push({ tick: this.state.tick, command })
    const result = step(this.state, commands)
    this.prev = this.state
    this.state = result.state
    if (result.events.length > 0) {
      this.collectEffects(result.events)
      if (this.onEvents) this.onEvents(result.events, this.state)
      else this.pendingEvents.push({ events: result.events, state: this.state })
    }
  }

  private collectEffects(events: GameEvent[]): void {
    const now = performance.now()
    for (const e of events) {
      switch (e.type) {
        case 'tower_fired':
          this.aim[e.id] = Math.atan2(e.to.y - e.from.y, e.to.x - e.from.x)
          // Crits flash white and pop at the impact point.
          this.effects.push({
            kind: 'beam',
            from: e.from,
            to: e.to,
            color: e.crit ? '#ffffff' : (TOWER_BEAM_COLORS[e.tower] ?? '#ffffff'),
            t0: now,
            dur: e.crit ? 180 : 120,
          })
          if (e.tower === 'cannon' || e.crit) this.effects.push({ kind: 'splash', at: e.to, t0: now, dur: 250 })
          break
        case 'enemy_killed':
          this.effects.push({ kind: 'death', at: e.at, t0: now, dur: 300 })
          if (this.speed <= 3) {
            this.effects.push({
              kind: 'float',
              at: e.at,
              text: e.lucky ? `+${e.bounty} LUCKY!` : `+${e.bounty}`,
              color: e.lucky ? '#ffd700' : '#e5c07b',
              t0: now,
              dur: e.lucky ? 1000 : 700,
            })
          }
          break
        case 'spire_repaired':
          this.effects.push({
            kind: 'float',
            at: cellCenter(getMap(this.state.mapId).spire),
            text: `+${e.amount}`,
            color: '#9ece6a',
            t0: now,
            dur: 800,
          })
          break
        case 'relic_chosen':
          if (e.relic === null && e.goldAwarded > 0) {
            this.effects.push({
              kind: 'float',
              at: cellCenter(getMap(this.state.mapId).spire),
              text: `+${e.goldAwarded}`,
              color: '#e5c07b',
              t0: now,
              dur: 900,
            })
          }
          break
        case 'mint_income':
          this.effects.push({ kind: 'float', at: { x: 12_000, y: 1_000 }, text: `Mint +${e.amount}`, color: '#e5c07b', t0: now, dur: 900 })
          break
        case 'enemy_reached_spire':
          this.effects.push({ kind: 'spire_hit', t0: now, dur: 350 })
          break
        case 'enemy_healed': {
          const healer = this.state.enemies.find((en) => en.id === e.healer)
          if (healer) this.effects.push({ kind: 'heal', at: { ...healer.pos }, t0: now, dur: 400 })
          break
        }
        case 'ability_cast': {
          const at = { x: e.cell.cx * 1000 + 500, y: e.cell.cy * 1000 + 500 }
          if (e.ability === 'meteor') this.effects.push({ kind: 'meteor', at, t0: now, dur: 500 })
          else if (e.ability === 'frost_nova') this.effects.push({ kind: 'nova', at, t0: now, dur: 500 })
          else this.effects.push({ kind: 'gold_rush', t0: now, dur: 500 })
          break
        }
        default:
          break
      }
    }
    // Drop expired effects so the array never grows without bound.
    this.effects = this.effects.filter((fx) => now - fx.t0 < fx.dur + 100)
  }

  private maybeNotify(changed: boolean): void {
    const now = performance.now()
    if (changed && now - this.lastNotify > 100) this.notify()
  }

  private notify(): void {
    this.version += 1
    this.lastNotify = performance.now()
    for (const l of this.listeners) l()
  }
}
