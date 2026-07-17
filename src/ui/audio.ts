import type { GameEvent, TowerType } from '../engine/types'
import { settings } from './settings'

// Synthesized SFX — WebAudio oscillators + filtered noise, no assets. Every
// tower has its own voice, abilities and cataclysms get stingers, and the
// whole mix runs through a compressor so layered combat stays punchy instead
// of clipping. The AudioContext is created lazily on the first user gesture
// (browser autoplay policy), sounds are throttled per kind and globally so
// 10× speed doesn't become a wall of noise, and the mute preference persists.

const MUTE_KEY = 'spirefall-muted'

type SoundKind =
  | 'shot_arrow'
  | 'shot_cannon'
  | 'shot_frost'
  | 'shot_tesla'
  | 'shot_sniper'
  | 'kill'
  | 'spire_hit'
  | 'wave_cleared'
  | 'victory'
  | 'defeat'
  | 'relic'
  | 'place'
  | 'boss'
  | 'cataclysm'
  | 'meteor'
  | 'frost_nova'
  | 'gold_rush'
  | 'bulwark'

interface Note {
  freq: number
  dur: number
  // 'noise' plays a looped white-noise buffer through a bandpass centred on
  // `freq` (with optional `q`); anything else is a plain oscillator.
  type: OscillatorType | 'noise'
  gain: number
  sweep?: number // multiply freq (or bandpass centre) by this over the duration
  q?: number // bandpass resonance for noise notes (default 1)
  at?: number // seconds offset from the sound's start; notes sharing at:0 layer
}

// Layered recipes. Notes with an explicit `at` are placed at that offset so a
// click transient can sit on top of a body tone; notes without `at` chain
// sequentially (each starting at 90% of the previous note's duration) for
// melodic figures like the victory arpeggio.
const SOUNDS: Record<SoundKind, Note[]> = {
  // Arrow: short bright pluck — a filtered tick with a fast square chirp.
  shot_arrow: [
    { freq: 2200, dur: 0.03, type: 'noise', gain: 0.03, q: 2, at: 0 },
    { freq: 660, dur: 0.05, type: 'square', gain: 0.02, sweep: 0.6, at: 0 },
  ],
  // Cannon: boom — low-passed thump (noise through a low bandpass) over a
  // sine drop, like a kick drum.
  shot_cannon: [
    { freq: 240, dur: 0.2, type: 'noise', gain: 0.065, q: 0.7, sweep: 0.5, at: 0 },
    { freq: 72, dur: 0.22, type: 'sine', gain: 0.055, sweep: 0.6, at: 0 },
  ],
  // Frost: airy crystalline shimmer — high sine with a breathy noise wash.
  shot_frost: [
    { freq: 1560, dur: 0.09, type: 'sine', gain: 0.028, sweep: 1.25, at: 0 },
    { freq: 4200, dur: 0.08, type: 'noise', gain: 0.018, q: 1.5, at: 0 },
  ],
  // Tesla: zap — narrow resonant noise crackle plus a detuned saw bite.
  shot_tesla: [
    { freq: 1800, dur: 0.06, type: 'noise', gain: 0.035, q: 8, sweep: 0.45, at: 0 },
    { freq: 520, dur: 0.05, type: 'sawtooth', gain: 0.022, sweep: 1.4, at: 0 },
  ],
  // Sniper: crack + whistle — sharp noise snap, then a thin descending tail.
  shot_sniper: [
    { freq: 3000, dur: 0.05, type: 'noise', gain: 0.05, q: 1.2, sweep: 0.4, at: 0 },
    { freq: 1150, dur: 0.16, type: 'triangle', gain: 0.02, sweep: 0.55, at: 0.02 },
  ],
  kill: [
    { freq: 300, dur: 0.09, type: 'triangle', gain: 0.05, sweep: 1.6, at: 0 },
    { freq: 1400, dur: 0.04, type: 'noise', gain: 0.02, q: 2, at: 0 },
  ],
  spire_hit: [
    { freq: 110, dur: 0.25, type: 'sawtooth', gain: 0.09, sweep: 0.5, at: 0 },
    { freq: 300, dur: 0.12, type: 'noise', gain: 0.04, q: 0.8, sweep: 0.5, at: 0 },
  ],
  wave_cleared: [
    { freq: 440, dur: 0.09, type: 'triangle', gain: 0.06 },
    { freq: 660, dur: 0.12, type: 'triangle', gain: 0.06 },
  ],
  victory: [
    { freq: 523, dur: 0.12, type: 'triangle', gain: 0.08 },
    { freq: 659, dur: 0.12, type: 'triangle', gain: 0.08 },
    { freq: 784, dur: 0.12, type: 'triangle', gain: 0.08 },
    { freq: 1046, dur: 0.25, type: 'triangle', gain: 0.08 },
  ],
  defeat: [
    { freq: 330, dur: 0.18, type: 'sawtooth', gain: 0.07 },
    { freq: 262, dur: 0.18, type: 'sawtooth', gain: 0.07 },
    { freq: 196, dur: 0.35, type: 'sawtooth', gain: 0.07 },
  ],
  relic: [
    { freq: 880, dur: 0.08, type: 'sine', gain: 0.06 },
    { freq: 1320, dur: 0.14, type: 'sine', gain: 0.06 },
  ],
  place: [
    { freq: 220, dur: 0.06, type: 'square', gain: 0.045, sweep: 1.3, at: 0 },
    { freq: 900, dur: 0.03, type: 'noise', gain: 0.02, q: 1.5, at: 0 },
  ],
  boss: [
    { freq: 98, dur: 0.3, type: 'sawtooth', gain: 0.09, sweep: 0.8 },
    { freq: 73, dur: 0.5, type: 'sawtooth', gain: 0.09, sweep: 0.9 },
  ],
  // Cataclysm: ominous rumble — sub drone with a slow dark noise swell.
  cataclysm: [
    { freq: 55, dur: 0.7, type: 'sawtooth', gain: 0.08, sweep: 0.7, at: 0 },
    { freq: 160, dur: 0.6, type: 'noise', gain: 0.045, q: 0.6, sweep: 0.4, at: 0.05 },
    { freq: 82, dur: 0.45, type: 'square', gain: 0.03, sweep: 0.8, at: 0.15 },
  ],
  // Meteor: whistle-down then impact thud.
  meteor: [
    { freq: 1800, dur: 0.28, type: 'noise', gain: 0.035, q: 3, sweep: 0.2, at: 0 },
    { freq: 90, dur: 0.3, type: 'sine', gain: 0.07, sweep: 0.45, at: 0.24 },
    { freq: 200, dur: 0.18, type: 'noise', gain: 0.05, q: 0.7, sweep: 0.4, at: 0.24 },
  ],
  // Frost nova: glassy bloom that sweeps upward.
  frost_nova: [
    { freq: 780, dur: 0.25, type: 'sine', gain: 0.05, sweep: 2.2, at: 0 },
    { freq: 3600, dur: 0.3, type: 'noise', gain: 0.025, q: 1.2, sweep: 1.6, at: 0.03 },
  ],
  // Gold rush: quick rising coin arpeggio.
  gold_rush: [
    { freq: 988, dur: 0.06, type: 'triangle', gain: 0.05 },
    { freq: 1319, dur: 0.06, type: 'triangle', gain: 0.05 },
    { freq: 1568, dur: 0.1, type: 'triangle', gain: 0.05 },
  ],
  // Bulwark: temple-gong — low fundamental with an octave partial and a tick.
  bulwark: [
    { freq: 196, dur: 0.8, type: 'sine', gain: 0.06, sweep: 0.96, at: 0 },
    { freq: 392, dur: 0.55, type: 'sine', gain: 0.03, sweep: 0.97, at: 0 },
    { freq: 1200, dur: 0.04, type: 'noise', gain: 0.025, q: 2, at: 0 },
  ],
}

const SHOT_BY_TOWER: Partial<Record<TowerType, SoundKind>> = {
  arrow: 'shot_arrow',
  cannon: 'shot_cannon',
  frost: 'shot_frost',
  tesla: 'shot_tesla',
  sniper: 'shot_sniper',
  // mint/beacon never fire projectiles
}

// Per-kind minimum gap (ms). Heavy sounds repeat slower so they stay special.
const MIN_GAP: Partial<Record<SoundKind, number>> = {
  shot_arrow: 70,
  shot_frost: 90,
  shot_tesla: 90,
  shot_cannon: 120,
  shot_sniper: 120,
  kill: 90,
  boss: 800,
  cataclysm: 800,
  bulwark: 400,
}
const DEFAULT_MIN_GAP = 140

// Combat percussion gets a little random pitch drift so rapid fire doesn't
// sound like a machine stamping the same sample. UI layer — Math.random is
// fine here; the engine never sees it.
const JITTERED: ReadonlySet<SoundKind> = new Set([
  'shot_arrow',
  'shot_cannon',
  'shot_frost',
  'shot_tesla',
  'shot_sniper',
  'kill',
  'spire_hit',
])

export class Sfx {
  private ctx: AudioContext | null = null
  private master: DynamicsCompressorNode | null = null
  private noiseBuffer: AudioBuffer | null = null
  private lastPlayed: Partial<Record<SoundKind, number>> = {}
  private recentCount = 0
  private recentWindow = 0
  private reviveGeneration = 0
  muted: boolean

  constructor() {
    this.muted = localStorage.getItem(MUTE_KEY) === '1'
    // Browsers require a user gesture before audio can start — and can
    // suspend a running context at any time (tab switch, OS interruption).
    // The listeners stay attached for the whole session so every gesture is
    // a chance to create OR revive the context; a one-shot unlock would
    // leave a later-suspended context dead until reload.
    const revive = () => this.ensureRunning(true)
    window.addEventListener('pointerdown', revive)
    window.addEventListener('keydown', revive)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.ensureRunning(false)
    })
  }

  toggleMute(): boolean {
    this.muted = !this.muted
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0')
    } catch {
      // unsaved preference is fine
    }
    return this.muted
  }

  handleEvents(events: GameEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'tower_fired': {
          const kind = SHOT_BY_TOWER[e.tower]
          if (kind) this.play(kind)
          break
        }
        case 'enemy_killed':
          this.play('kill')
          break
        case 'enemy_reached_spire':
          this.play('spire_hit')
          break
        case 'wave_cleared':
          this.play('wave_cleared')
          break
        case 'victory_achieved':
          this.play('victory')
          break
        case 'run_ended':
          this.play(e.outcome === 'victory' ? 'victory' : 'defeat')
          break
        case 'relic_chosen':
          if (e.relic !== null) this.play('relic')
          break
        case 'tower_placed':
          this.play('place')
          break
        case 'enemy_spawned':
          if (e.enemy.startsWith('boss')) this.play('boss')
          break
        case 'ability_cast':
          this.play(e.ability)
          break
        case 'cataclysm_struck':
          this.play('cataclysm')
          break
        default:
          break
      }
    }
  }

  private ensureRunning(fromGesture: boolean): void {
    if (this.ctx && this.ctx.state === 'closed') this.ctx = null
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext()
        this.buildChain(this.ctx)
        this.prime(this.ctx)
      } catch {
        this.ctx = null
        return
      }
    }
    const ctx = this.ctx
    if (ctx.state === 'running') return
    // 'suspended' (and Safari's 'interrupted') contexts usually revive on
    // resume() — but after app switches, mobile browsers sometimes leave a
    // zombie that never resumes (or resumes mute). A resume issued from a
    // REAL user gesture must take; if it hasn't shortly after, scrap the
    // context and build a fresh one, which the same gesture authorizes.
    void ctx
      .resume()
      .then(() => this.prime(ctx))
      .catch(() => {})
    if (fromGesture) {
      const gen = ++this.reviveGeneration
      setTimeout(() => {
        if (gen !== this.reviveGeneration) return // a newer attempt owns recovery
        if (this.ctx !== ctx || ctx.state === 'running') return
        void ctx.close().catch(() => {})
        try {
          this.ctx = new AudioContext()
          this.buildChain(this.ctx)
          this.prime(this.ctx)
        } catch {
          this.ctx = null
        }
      }, 250)
    }
  }

  // Master bus: everything routes through a gentle compressor so dozens of
  // overlapping shots duck each other instead of clipping the output. Also
  // pre-renders the shared white-noise buffer the percussion voices loop.
  private buildChain(ctx: AudioContext): void {
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -18
    comp.knee.value = 24
    comp.ratio.value = 6
    comp.attack.value = 0.003
    comp.release.value = 0.2
    comp.connect(ctx.destination)
    this.master = comp

    const len = Math.floor(ctx.sampleRate * 0.5)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    this.noiseBuffer = buf
  }

  // Play a silent one-sample buffer: re-primes the output path. Without
  // this, iOS can report a 'running' context that stays mute after an
  // interruption (phone call, app switch, route change).
  private prime(ctx: AudioContext): void {
    try {
      const src = ctx.createBufferSource()
      src.buffer = ctx.createBuffer(1, 1, 22050)
      src.connect(ctx.destination)
      src.start(0)
    } catch {
      // priming is best-effort
    }
  }

  private play(kind: SoundKind): void {
    if (this.muted || !this.ctx || !this.master || !this.noiseBuffer) return
    if (this.ctx.state !== 'running') {
      // Kick off an async revival; this sound is lost but the next one plays.
      this.ensureRunning(false)
      return
    }
    const now = performance.now()

    // Per-kind cooldown plus a global cap keep fast-forward bearable.
    const minGap = MIN_GAP[kind] ?? DEFAULT_MIN_GAP
    if (now - (this.lastPlayed[kind] ?? 0) < minGap) return
    if (now - this.recentWindow > 250) {
      this.recentWindow = now
      this.recentCount = 0
    }
    if (this.recentCount >= 8) return
    this.recentCount += 1
    this.lastPlayed[kind] = now

    const ctx = this.ctx
    const base = ctx.currentTime
    const pitch = JITTERED.has(kind) ? 1 + (Math.random() * 2 - 1) * 0.04 : 1
    let chained = 0 // running offset for notes without an explicit `at`
    for (const note of SOUNDS[kind]) {
      const at = base + (note.at ?? chained)
      if (note.at === undefined) chained += note.dur * 0.9
      const scaled = (note.gain * Math.max(0, Math.min(100, settings.volume))) / 100
      if (scaled <= 0) continue
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(scaled, at)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + note.dur)
      gain.connect(this.master)
      const freq = note.freq * pitch
      if (note.type === 'noise') {
        const src = ctx.createBufferSource()
        src.buffer = this.noiseBuffer
        src.loop = true
        const bp = ctx.createBiquadFilter()
        bp.type = 'bandpass'
        bp.frequency.setValueAtTime(freq, at)
        bp.Q.value = note.q ?? 1
        if (note.sweep) bp.frequency.exponentialRampToValueAtTime(freq * note.sweep, at + note.dur)
        src.connect(bp)
        bp.connect(gain)
        src.start(at)
        src.stop(at + note.dur + 0.02)
      } else {
        const osc = ctx.createOscillator()
        osc.type = note.type
        osc.frequency.setValueAtTime(freq, at)
        if (note.sweep) osc.frequency.exponentialRampToValueAtTime(freq * note.sweep, at + note.dur)
        osc.connect(gain)
        osc.start(at)
        osc.stop(at + note.dur + 0.02)
      }
    }
  }
}
