import { graphicsState } from './graphics'
import { measure } from './performance'
import { settings } from './settings'
import { RULES_VERSION, type Recording } from './validation'
import { ENEMIES, type TowerSpecId } from '../data/content'
import { cellCenter } from '../engine/grid'
import { getRunMap } from '../engine/mapgen'
import { enemyColor, stampDecal } from './render'
import { step, TICKS_PER_SECOND } from '../engine/step'
import type { Command, GameEvent, RunState, Vec } from '../engine/types'

// GameSession is the bridge between browser time and simulation time. All it
// does is accumulate real milliseconds into fixed engine ticks — the engine
// cannot tell 1× from 100× speed, by construction. It also turns engine
// events into short-lived visual effects for the renderer and keeps a
// replayable log of every command it feeds to the sim.

export interface VisualEffect {
  kind:
    | 'special' // specialization impact engraving
    | 'beam'
    | 'splash'
    | 'meteor'
    | 'nova'
    | 'death'
    | 'spire_hit'
    | 'gold_rush'
    | 'heal'
    | 'float'
    | 'shell' // cannon: arcing projectile from→to
    | 'tracer' // sniper: bright line with a leading slug
    | 'bolt' // arrow: fast small projectile
    | 'arc' // tesla: jagged lightning
    | 'flash' // muzzle flash at the firing tower
    | 'burst' // death particles
    | 'coin' // gold: arcs from a mint payout / glints where an elite fell
  spec?: TowerSpecId
  from?: Vec
  to?: Vec
  at?: Vec
  color?: string
  text?: string
  crit?: boolean
  t0: number // performance.now() timestamp
  dur: number // ms
}

export interface LoggedCommand {
  tick: number
  command: Command
}

const TICK_MS = 1000 / TICKS_PER_SECOND
const MAX_STEPS_PER_FRAME = 24
const TOWER_BEAM_COLORS: Record<string, string> = {
  arrow: '#9ece6a',
  cannon: '#e0af68',
  frost: '#7dcfff',
  tesla: '#bb9af7',
  sniper: '#73daca',
  lance: '#f7768e',
}

let nextRenderId = 1

export class GameSession {
  renderId = nextRenderId++ // rematches and spectators own fresh visual caches
  state: RunState
  prev: RunState // one tick behind, for render interpolation
  // The run's tick-0 state, kept so the run can be REPLAYED: determinism
  // means initial state + command log reproduces every moment exactly.
  readonly initial: RunState
  // Non-null = this session is a spectator: commands come from the script,
  // player dispatches are ignored, and App suppresses meta/save effects.
  replayScript: LoggedCommand[] | null = null
  private scriptIndex = 0
  replayEndTick = Number.POSITIVE_INFINITY
  seeking = false
  private seekToken = 0
  checkpoints: { tick: number; wave: number; state: RunState }[] = []
  suspended = false
  speed = 1
  effects: VisualEffect[] = []
  commandLog: LoggedCommand[] = []
  version = 0
  // Render-only: last firing angle per tower id, so turrets visibly track
  // their targets. Never read by the sim.
  aim: Record<number, number> = {}
  // Render-only: enemy id → time it was last struck, for hit flashes.
  hits: Map<number, number> = new Map()
  // Render-only: tower id → time it last fired, for recoil animation.
  firedAt: Map<number, number> = new Map()

  private onEvents: ((events: GameEvent[], state: RunState) => void) | null = null
  // Events raised before a handler attaches (e.g. the harness drives a brand
  // new session before React's effect wires it up) are buffered and flushed
  // on attach — run_ended must never fall into that gap.
  private pendingEvents: Array<{ events: GameEvent[]; state: RunState }> = []
  private queue: Command[] = []
  private queuedAt: number[] = []
  private renderedInputs: number[] = []
  resetInputMeasurements(): void { this.queuedAt = []; this.renderedInputs = [] }
  markRendered(): void {
    for (const at of this.renderedInputs) measure('inputToRender', performance.now() - at)
    this.renderedInputs = []
  }
  private accumulator = 0
  private listeners = new Set<() => void>()
  private lastNotify = 0

  constructor(initial: RunState, recording?: Recording) {
    this.state = initial
    this.prev = initial
    // RunState is plain JSON by architectural contract — a cheap deep copy
    // pins tick 0 against later mutation-by-reference.
    this.initial = JSON.parse(JSON.stringify(recording?.initial ?? initial)) as RunState
    this.commandLog = recording?.log.slice() ?? []
    this.checkpoints = [{ tick: this.initial.tick, wave: this.initial.wave, state: this.initial }]
  }

  recording(): Recording {
    return { v: 3, seed: this.state.seed, rules: RULES_VERSION, initial: this.initial, log: this.commandLog, endTick: this.state.tick }
  }

  get terminal(): boolean {
    return this.state.phase === 'defeat' || this.state.phase === 'victory'
  }

  get replaying(): boolean {
    return this.replayScript !== null
  }

  // A spectator session that replays this run from tick 0: same initial
  // state, same commands at the same ticks — the deterministic engine does
  // the rest. The caller drives it like any session (speed, fastForward).
  replaySession(): GameSession {
    const replay = new GameSession(JSON.parse(JSON.stringify(this.initial)) as RunState)
    replay.replayScript = this.commandLog.map((c) => ({ tick: c.tick, command: c.command }))
    replay.replayEndTick = this.state.tick
    replay.checkpoints = this.checkpoints.slice()
    return replay
  }

  async seek(tick: number): Promise<void> {
    if (!this.replaying || !Number.isFinite(tick)) return
    const token = ++this.seekToken
    const target = Math.max(this.initial.tick, Math.min(this.replayEndTick, Math.floor(tick)))
    const checkpoint = this.checkpoints.filter(c => c.tick <= target).at(-1)!
    this.state = JSON.parse(JSON.stringify(checkpoint.state)) as RunState
    this.prev = this.state
    this.scriptIndex = this.replayScript!.findIndex(c => c.tick >= this.state.tick)
    if (this.scriptIndex < 0) this.scriptIndex = this.replayScript!.length
    this.accumulator = 0
    this.seeking = true
    this.effects = []
    this.renderId = nextRenderId++
    this.aim = {}; this.hits.clear(); this.firedAt.clear()
    try {
      while (this.state.tick < target && !this.terminal && token === this.seekToken) {
        const until = Math.min(target, this.state.tick + 300)
        while (this.state.tick < until && !this.terminal) this.stepOnce()
        this.notify()
        await new Promise<void>(resolve => setTimeout(resolve, 0))
      }
    } finally { if (token === this.seekToken) { this.seeking = false; this.effects = []; this.notify() } }
  }

  dispatch(command: Command): void {
    if (this.replayScript) return // spectators don't get to change history
    if (this.queuedAt.length < 256) this.queuedAt.push(performance.now())
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

  setSuspended(suspended: boolean): void { this.suspended = suspended }

  setSpeed(n: number): void {
    this.speed = Math.max(0, Math.min(100, n))
    this.notify()
  }

  // Called once per animation frame with real elapsed milliseconds.
  advance(dtMs: number): void {
    if (this.seeking || this.suspended || this.speed <= 0 || this.terminal) {
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
    if (this.seeking || this.suspended || this.speed <= 0 || this.terminal) return 1
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
    if (this.replaying && this.state.tick >= this.replayEndTick) return
    let commands: Command[]
    if (this.replayScript) {
      // Replay: feed the recorded commands at exactly the ticks they were
      // logged (the log stamps the pre-step tick, matched here the same way).
      commands = []
      while (this.scriptIndex < this.replayScript.length && this.replayScript[this.scriptIndex]!.tick === this.state.tick) {
        commands.push(this.replayScript[this.scriptIndex]!.command)
        this.scriptIndex += 1
      }
    } else {
      for (const at of this.queuedAt) measure('input', performance.now() - at)
      this.renderedInputs.push(...this.queuedAt)
      if (this.renderedInputs.length > 256) this.renderedInputs.splice(0,this.renderedInputs.length-256)
      this.queuedAt = []
      commands = this.queue.splice(0)
      for (const command of commands) this.commandLog.push({ tick: this.state.tick, command })
    }
    const result = step(this.state, commands)
    this.prev = this.state
    this.state = result.state
    if (result.events.some(e => e.type === 'wave_started') && !this.checkpoints.some(c => c.tick === this.state.tick)) {
      this.checkpoints.push({ tick: this.state.tick, wave: this.state.wave, state: this.state })
      this.checkpoints.sort((a,b) => a.tick-b.tick)
      if (this.checkpoints.length > 64) this.checkpoints.splice(1,1)
    }
    if (result.events.length > 0 && !this.seeking) {
      this.collectEffects(result.events)
      if (this.onEvents) this.onEvents(result.events, this.state)
      else this.pendingEvents.push({ events: result.events, state: this.state })
    }
  }

  private collectEffects(events: GameEvent[]): void {
    const now = performance.now()
    for (const e of events) {
      switch (e.type) {
        case 'doctrine_trigger': {
          const color = e.doctrine === 'shatter' ? '#b5f0ff' : e.doctrine === 'storm' ? '#d6b5ff' : '#ffe1a1'
          if (this.speed <= 3) {
            this.effects.push({kind:'burst',at:e.at,color,t0:now,dur:260})
            this.effects.push({kind:'float',at:e.at,color,text:e.doctrine === 'shatter' ? 'SHATTER' : e.doctrine === 'storm' ? 'DISCHARGE' : e.doctrine === 'siege' ? 'AIMED' : 'SUPPLIED',t0:now,dur:500})
          }
          break
        }
        case 'tower_fired': {
          if (e.blocked && this.speed <= 3) this.effects.push({ kind: 'float', at: e.to, text: 'BLOCK', color: '#c8d8f0', t0: now, dur: 400 })
          this.aim[e.id] = Math.atan2(e.to.y - e.from.y, e.to.x - e.from.x)
          this.firedAt.set(e.id, now)
          if (this.firedAt.size > 400) this.firedAt.clear()
          for (const id of e.targets) this.hits.set(id, now)
          if (this.hits.size > 600) this.hits.clear()
          const spec = this.state.towers.find(t => t.id === e.id)?.spec
          if (spec && !e.blocked) this.effects.push({kind:'special',spec,from:e.from,to:e.to,t0:now,dur:220})
          const color = e.crit ? '#ffffff' : (TOWER_BEAM_COLORS[e.tower] ?? '#ffffff')
          this.effects.push({ kind: 'flash', at: e.from, color, t0: now, dur: 90 })
          switch (e.tower) {
            case 'cannon': {
              // Damage resolves on this tick: the trail ends at the impact.
              const flight = 80
              this.effects.push({ kind: 'shell', from: e.from, to: e.to, crit: e.crit, t0: now - flight * 0.85, dur: flight })
              this.effects.push({ kind: 'splash', at: e.to, t0: now, dur: 250 })
              break
            }
            case 'sniper':
              this.effects.push({ kind: 'tracer', from: e.from, to: e.to, color, crit: e.crit, t0: now, dur: 160 })
              break
            case 'lance':
              // A thrust reads as a fast tracer in the lance's rose.
              this.effects.push({ kind: 'tracer', from: e.from, to: e.to, color, crit: e.crit, t0: now, dur: 110 })
              break
            case 'tesla':
              this.effects.push({ kind: 'arc', from: e.from, to: e.to, color, crit: e.crit, t0: now, dur: 140 })
              break
            case 'arrow':
              this.effects.push({ kind: 'bolt', from: e.from, to: e.to, color, crit: e.crit, t0: now, dur: 110 })
              break
            default:
              this.effects.push({ kind: 'beam', from: e.from, to: e.to, color, t0: now, dur: e.crit ? 180 : 120 })
              break
          }
          if (e.crit && e.tower !== 'cannon') this.effects.push({ kind: 'splash', at: e.to, t0: now, dur: 250 })
          break
        }
        case 'enemy_killed':
          this.effects.push({ kind: 'death', at: e.at, t0: now, dur: 300 })
          stampDecal(this.renderId, e.at, enemyColor(e.enemy))
          if (this.speed <= 3) {
            this.effects.push({ kind: 'burst', at: e.at, color: enemyColor(e.enemy), t0: now, dur: 380 })
            // The bounty itself lands as a REAL coin entity (engine state)
            // — drawn by drawCoins until collected or expired.
            // The bounty DROPS as a coin now — the +N float moved to the
            // moment of collection. Lucky rolls still announce themselves.
            if (e.lucky) {
              this.effects.push({ kind: 'float', at: e.at, text: 'LUCKY!', color: '#ffd700', t0: now, dur: 1000 })
            }
          }
          break
        case 'spire_repaired':
          this.effects.push({
            kind: 'float',
            at: cellCenter(getRunMap(this.state).spire),
            text: `+${e.amount}`,
            color: '#9ece6a',
            t0: now,
            dur: 800,
          })
          break
        case 'enemy_spawned':
          if (e.enemy.startsWith('boss')) {
            const spawn = cellCenter(getRunMap(this.state).spawn)
            this.effects.push({ kind: 'nova', at: spawn, t0: now, dur: 700 })
            this.effects.push({
              kind: 'float',
              at: { x: 12_000, y: 4_000 },
              text: `${ENEMIES[e.enemy].name.toUpperCase()} RISES`,
              color: enemyColor(e.enemy),
              t0: now,
              dur: 1500,
            })
          }
          break
        case 'wave_started':
          if (this.speed <= 3) {
            this.effects.push({
              kind: 'float',
              at: { x: 12_000, y: 2_000 },
              text: `WAVE ${e.wave}`,
              color: '#565f89',
              t0: now,
              dur: 900,
            })
          }
          break
        case 'tower_specialized': {
          const tower = this.state.towers.find((t) => t.id === e.id)
          if (tower) {
            this.effects.push({
              kind: 'float',
              at: cellCenter(tower.cell),
              text: `★ ${e.spec.toUpperCase()}`,
              color: '#e0af68',
              t0: now,
              dur: 1100,
            })
          }
          break
        }
        case 'coin_collected':
          // The magnet suck: the coin streaks into the hand (or the Spire).
          this.effects.push({ kind: 'coin', from: { ...e.from }, to: { ...e.to }, t0: now, dur: e.auto ? 260 : 180 })
          if (this.speed <= 3) {
            this.effects.push({ kind: 'float', at: { ...e.to }, text: `+${e.gold}`, color: '#e5c07b', t0: now, dur: 600 })
          }
          break
        case 'coin_expired':
          if (this.speed <= 3) {
            this.effects.push({ kind: 'float', at: { ...e.at }, text: `-${e.gold}`, color: '#5c6370', t0: now, dur: 800 })
          }
          break
        case 'enemy_executed':
          this.effects.push({
            kind: 'float',
            at: { ...e.at },
            text: `EXECUTED +${e.bonus}`,
            color: '#e0af68',
            t0: now,
            dur: 900,
          })
          this.effects.push({ kind: 'burst', at: { ...e.at }, color: '#e0af68', t0: now, dur: 420 })
          break
        case 'combo_milestone':
          this.effects.push({
            kind: 'float',
            at: { x: 12_000, y: 2_200 },
            text: `⚡ ${e.combo} STREAK`,
            color: '#e0af68',
            t0: now,
            dur: 1100,
          })
          break
        case 'ramp_capped':
          this.effects.push({
            kind: 'float',
            at: cellCenter(e.cell),
            text: '×10 HELD',
            color: '#f7768e',
            t0: now,
            dur: 1000,
          })
          break
        case 'boss_carapace': {
          const boss = this.state.enemies.find((en) => en.id === e.id)
          if (boss) {
            this.effects.push({ kind: 'float', at: { ...boss.pos }, text: 'CARAPACE', color: '#ffd7f0', t0: now, dur: 900 })
          }
          break
        }
        case 'boss_gale': {
          const caster = this.state.enemies.find((en) => en.id === e.id)
          if (caster) {
            this.effects.push({ kind: 'float', at: { ...caster.pos }, text: 'GALE SURGE', color: '#ffc777', t0: now, dur: 900 })
          }
          break
        }
        case 'vents_erupted': {
          // Orange bursts at every fissure — the eruption is readable even
          // at speed. Suppressed above 3x like other per-hit effects.
          if (this.speed <= 3) {
            const map = getRunMap(this.state)
            for (const idx of e.cells) {
              this.effects.push({
                kind: 'burst',
                at: cellCenter({ cx: idx % map.width, cy: Math.floor(idx / map.width) }),
                color: '#ff7a3c',
                t0: now,
                dur: 420,
              })
            }
          }
          break
        }
        case 'cataclysm_struck':
          this.effects.push({
            kind: 'float',
            at: { x: 12_000, y: 6_000 },
            text: `CATACLYSM: ${e.cataclysm.toUpperCase()}`,
            color: '#f7768e',
            t0: now,
            dur: 1600,
          })
          this.effects.push({ kind: 'spire_hit', t0: now, dur: 500 })
          break
        case 'relic_chosen':
          if (e.relic === null && e.goldAwarded > 0) {
            this.effects.push({
              kind: 'float',
              at: cellCenter(getRunMap(this.state).spire),
              text: `+${e.goldAwarded}`,
              color: '#e5c07b',
              t0: now,
              dur: 900,
            })
          }
          break
        case 'mint_income': {
          this.effects.push({ kind: 'float', at: { x: 12_000, y: 1_000 }, text: `Mint +${e.amount}`, color: '#e5c07b', t0: now, dur: 900 })
          // The payout is PHYSICAL: coins arc from the mint toward the
          // treasury corner. Money you can watch accumulate is half of what
          // makes 1x worth sitting at.
          const mint = this.state.towers.find((t) => t.id === e.id)
          if (mint && this.speed <= 3) {
            const coins = Math.min(6, 2 + Math.floor(e.amount / 25))
            for (let i = 0; i < coins; i++) {
              this.effects.push({ kind: 'coin', from: cellCenter(mint.cell), to: { x: 900, y: 600 }, t0: now + i * 80, dur: 700 })
            }
          }
          break
        }
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
    const alive = this.effects.filter(fx => now - fx.t0 < fx.dur + 100)
    const important = (fx: VisualEffect) => ['spire_hit', 'meteor', 'nova', 'gold_rush', 'heal'].includes(fx.kind) || (fx.kind === 'float' && !/^[+-]?[0-9]/.test(fx.text ?? ''))
    this.effects = [...(settings.quietEffects ? [] : alive.filter(fx => !important(fx)).slice(graphicsState.reduced ? -48 : -192)), ...alive.filter(important).slice(-64)]
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
