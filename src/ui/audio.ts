import { MAP_WIDTH } from '../data/maps'
import type { GameEvent, TowerType } from '../engine/types'
import { settings } from './settings'
import { snapToPitchClasses, type Tonality } from './tonality'

// Synthesized SFX — WebAudio oscillators + filtered noise, no assets. Every
// tower has its own voice, abilities and cataclysms get stingers, and the
// whole mix runs through a compressor so layered combat stays punchy instead
// of clipping. Polish layer: every note gets a real attack ramp (no envelope
// clicks), tonal notes play as detuned pairs through a softening lowpass
// (synth-organ warmth instead of raw beeps), a procedurally generated
// convolution reverb adds room air, and combat sounds pan to where they
// happen on the battlefield. The AudioContext is created lazily on the first
// user gesture (browser autoplay policy), sounds are throttled per kind and
// globally so 10× speed doesn't become a wall of noise, and the mute
// preference persists.
//
// The note frequencies below are DESIGN pitches. At play time every tonal
// voice (pluck/fm/oscillator) snaps to the score's live key — melodic
// stingers to the chord sounding right now, combat ticks to the scale —
// so the battlefield rings in tune with the music (see tonality.ts; the
// Music instance publishes via Sfx.tonality). Noise voices keep their
// design center: percussion has no pitch to clash.

const MUTE_KEY = 'spirefall-muted'

type SoundKind =
  | 'shot_arrow'
  | 'shot_cannon'
  | 'shot_frost'
  | 'shot_tesla'
  | 'shot_sniper'
  | 'shot_lance'
  | 'ramp_capped'
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
  | 'carapace'
  | 'gale'

// Four synthesis voices, because plain oscillators sound like programmer
// art no matter how they're layered:
// - 'noise':  looped white noise through a bandpass at `freq` (q, sweep) —
//             cracks, booms, whooshes, air.
// - 'pluck':  Karplus-Strong — a noise burst ringing in a tuned feedback
//             delay. A physically-modelled string: real twang, not a beep.
// - 'fm':     two-operator FM — modulator depth `index` (in multiples of
//             the carrier) decaying to `indexEnd`. Bells, clinks, zaps,
//             gongs; the timbre evolves inside every single hit.
// - oscillator types: pads and drones, played as a detuned pair through a
//             softening lowpass unless `pure`.
interface Note {
  freq: number
  dur: number
  type: OscillatorType | 'noise' | 'pluck' | 'fm'
  gain: number
  sweep?: number // multiply freq (or bandpass centre) by this over the duration
  q?: number // bandpass resonance for noise notes (default 1)
  ratio?: number // fm: modulator/carrier frequency ratio (default 2)
  index?: number // fm: starting modulation depth (default 2)
  indexEnd?: number // fm: depth at the end of the note (default 5% of index)
  at?: number // seconds offset from the sound's start; notes sharing at:0 layer
  attack?: number // seconds to ramp in (default 4ms — kills envelope clicks)
  pure?: boolean // oscillators: skip the detune pair + lowpass softening
}

// Layered recipes. Notes with an explicit `at` are placed at that offset so a
// click transient can sit on top of a body tone; notes without `at` chain
// sequentially (each starting at 90% of the previous note's duration) for
// melodic figures like the victory arpeggio.
const SOUNDS: Record<SoundKind, Note[]> = {
  // Arrow: an actual bowstring — Karplus pluck with a tiny release tick.
  shot_arrow: [
    { freq: 480, dur: 0.16, type: 'pluck', gain: 0.06, at: 0 },
    { freq: 1900, dur: 0.02, type: 'noise', gain: 0.015, q: 1.5, at: 0 },
  ],
  // Cannon: kick-drum physics — click transient, pitch-dropping sine body,
  // low noise boom.
  shot_cannon: [
    { freq: 2600, dur: 0.012, type: 'noise', gain: 0.04, q: 0.5, at: 0 },
    { freq: 120, dur: 0.2, type: 'sine', gain: 0.07, sweep: 0.35, at: 0, pure: true, attack: 0.002 },
    { freq: 200, dur: 0.22, type: 'noise', gain: 0.055, q: 0.6, sweep: 0.5, at: 0 },
  ],
  // Frost: icy FM chime with a breath of air — crystalline, not beepy.
  shot_frost: [
    { freq: 1900, dur: 0.12, type: 'fm', gain: 0.03, ratio: 3.02, index: 2, at: 0 },
    { freq: 5000, dur: 0.1, type: 'noise', gain: 0.012, q: 1, at: 0 },
  ],
  // Tesla: FM zap — high modulation depth collapsing fast reads as electric
  // discharge; resonant crackle on top.
  shot_tesla: [
    { freq: 620, dur: 0.09, type: 'fm', gain: 0.035, ratio: 1.417, index: 8, indexEnd: 0.5, at: 0 },
    { freq: 2200, dur: 0.05, type: 'noise', gain: 0.028, q: 6, sweep: 0.4, at: 0 },
  ],
  // Sniper: rifle crack + thin whistle tail.
  shot_sniper: [
    { freq: 3200, dur: 0.06, type: 'noise', gain: 0.055, q: 0.8, sweep: 0.35, at: 0 },
    { freq: 1900, dur: 0.22, type: 'sine', gain: 0.013, sweep: 0.18, at: 0.02, pure: true },
  ],
  // Lance: a taut string-snap with a rising ring — the thrust, and the
  // promise that the next one lands harder.
  shot_lance: [
    { freq: 900, dur: 0.09, type: 'pluck', gain: 0.045, at: 0 },
    { freq: 1400, dur: 0.1, type: 'sine', gain: 0.014, sweep: 1.35, at: 0.015, pure: true },
  ],
  // Ramp capped: the climb tops out — three quick plucks up the ladder,
  // the shot_lance voice arriving where it was always promising to go.
  ramp_capped: [
    { freq: 700, dur: 0.08, type: 'pluck', gain: 0.05 },
    { freq: 1050, dur: 0.08, type: 'pluck', gain: 0.05 },
    { freq: 1575, dur: 0.22, type: 'pluck', gain: 0.055 },
  ],
  // Kill: metallic clink over a body thud — a "chunk", not a chirp.
  kill: [
    { freq: 820, dur: 0.1, type: 'fm', gain: 0.045, ratio: 2.756, index: 3, at: 0 },
    { freq: 170, dur: 0.12, type: 'sine', gain: 0.04, sweep: 0.5, at: 0, pure: true },
  ],
  // Spire hit: deep impact + dissonant metal clang + debris.
  spire_hit: [
    { freq: 105, dur: 0.3, type: 'sine', gain: 0.09, sweep: 0.36, at: 0, pure: true, attack: 0.002 },
    { freq: 260, dur: 0.22, type: 'fm', gain: 0.045, ratio: 1.93, index: 5, at: 0.01 },
    { freq: 400, dur: 0.18, type: 'noise', gain: 0.03, q: 0.7, sweep: 0.4, at: 0 },
  ],
  // Wave cleared: two FM bells, rising.
  wave_cleared: [
    { freq: 660, dur: 0.35, type: 'fm', gain: 0.05, ratio: 3.51, index: 1.5 },
    { freq: 990, dur: 0.5, type: 'fm', gain: 0.05, ratio: 3.51, index: 1.5 },
  ],
  // Victory: a bell fanfare — same figure, real bells now.
  victory: [
    { freq: 523, dur: 0.3, type: 'fm', gain: 0.06, ratio: 3.01, index: 1.2 },
    { freq: 659, dur: 0.3, type: 'fm', gain: 0.06, ratio: 3.01, index: 1.2 },
    { freq: 784, dur: 0.3, type: 'fm', gain: 0.06, ratio: 3.01, index: 1.2 },
    { freq: 1046, dur: 0.7, type: 'fm', gain: 0.065, ratio: 3.01, index: 1.4 },
  ],
  defeat: [
    { freq: 330, dur: 0.18, type: 'sawtooth', gain: 0.06 },
    { freq: 262, dur: 0.18, type: 'sawtooth', gain: 0.06 },
    { freq: 196, dur: 0.4, type: 'sawtooth', gain: 0.06 },
  ],
  // Relic: glass bell with a shimmer partial — treasure, not a doorbell.
  relic: [
    { freq: 1320, dur: 0.6, type: 'fm', gain: 0.05, ratio: 3.53, index: 1.8, at: 0 },
    { freq: 1980, dur: 0.4, type: 'fm', gain: 0.028, ratio: 2.0, index: 0.8, at: 0.06 },
  ],
  // Place: planting a post — low pluck plus a soft ground thud.
  place: [
    { freq: 180, dur: 0.22, type: 'pluck', gain: 0.06, at: 0 },
    { freq: 90, dur: 0.08, type: 'sine', gain: 0.035, sweep: 0.7, at: 0, pure: true },
  ],
  // Boss: saw drone with an FM sub-growl underneath.
  boss: [
    { freq: 98, dur: 0.3, type: 'sawtooth', gain: 0.08, sweep: 0.8, at: 0 },
    { freq: 73, dur: 0.5, type: 'sawtooth', gain: 0.08, sweep: 0.9, at: 0.25 },
    { freq: 55, dur: 0.6, type: 'fm', gain: 0.05, ratio: 0.5, index: 6, indexEnd: 2, at: 0 },
  ],
  // Cataclysm: rumble + a dissonant iron toll.
  cataclysm: [
    { freq: 55, dur: 0.7, type: 'sawtooth', gain: 0.07, sweep: 0.7, at: 0 },
    { freq: 160, dur: 0.6, type: 'noise', gain: 0.04, q: 0.6, sweep: 0.4, at: 0.05 },
    { freq: 110, dur: 0.8, type: 'fm', gain: 0.05, ratio: 1.19, index: 7, indexEnd: 0.5, at: 0.1 },
  ],
  // Meteor: whistle-down, then a real impact — thud + debris.
  meteor: [
    { freq: 1800, dur: 0.28, type: 'noise', gain: 0.032, q: 3, sweep: 0.2, at: 0 },
    { freq: 85, dur: 0.3, type: 'sine', gain: 0.075, sweep: 0.45, at: 0.24, pure: true, attack: 0.002 },
    { freq: 180, dur: 0.2, type: 'noise', gain: 0.05, q: 0.6, sweep: 0.4, at: 0.24 },
  ],
  // Frost nova: glassy FM bloom sweeping upward with shimmer.
  frost_nova: [
    { freq: 900, dur: 0.3, type: 'fm', gain: 0.05, ratio: 3.02, index: 2, sweep: 1.8, at: 0 },
    { freq: 3600, dur: 0.3, type: 'noise', gain: 0.02, q: 1.2, sweep: 1.6, at: 0.04 },
  ],
  // Gold rush: coin tinks — tiny bright FM bells, rising.
  gold_rush: [
    { freq: 1567, dur: 0.07, type: 'fm', gain: 0.045, ratio: 3.0, index: 1 },
    { freq: 1975, dur: 0.07, type: 'fm', gain: 0.045, ratio: 3.0, index: 1 },
    { freq: 2349, dur: 0.13, type: 'fm', gain: 0.05, ratio: 3.0, index: 1 },
  ],
  // Carapace: iron shell slamming shut — dissonant FM clang.
  carapace: [
    { freq: 220, dur: 0.35, type: 'fm', gain: 0.055, ratio: 1.93, index: 6, indexEnd: 0.4, at: 0 },
    { freq: 2400, dur: 0.03, type: 'noise', gain: 0.03, q: 1.5, at: 0 },
  ],
  // Gale: a rising wind whoosh.
  gale: [
    { freq: 700, dur: 0.45, type: 'noise', gain: 0.04, q: 1.2, sweep: 2.4, at: 0, attack: 0.08 },
  ],
  // Bulwark: a real FM gong — inharmonic partials that bloom then settle.
  bulwark: [
    { freq: 98, dur: 1.0, type: 'fm', gain: 0.07, ratio: 1.4, index: 5, indexEnd: 0.3, at: 0 },
    { freq: 196, dur: 0.7, type: 'fm', gain: 0.03, ratio: 2.01, index: 2, at: 0.02 },
    { freq: 1200, dur: 0.04, type: 'noise', gain: 0.02, q: 2, at: 0 },
  ],
}

const SHOT_BY_TOWER: Partial<Record<TowerType, SoundKind>> = {
  arrow: 'shot_arrow',
  cannon: 'shot_cannon',
  frost: 'shot_frost',
  tesla: 'shot_tesla',
  sniper: 'shot_sniper',
  lance: 'shot_lance',
  // mint/beacon never fire projectiles
}

// Per-kind minimum gap (ms). Heavy sounds repeat slower so they stay special.
const MIN_GAP: Partial<Record<SoundKind, number>> = {
  shot_arrow: 70,
  shot_frost: 90,
  shot_tesla: 90,
  shot_lance: 80,
  shot_cannon: 120,
  shot_sniper: 120,
  kill: 90,
  boss: 800,
  carapace: 400,
  gale: 400,
  cataclysm: 800,
  bulwark: 400,
  ramp_capped: 600,
}
const DEFAULT_MIN_GAP = 140

// Reverb send per kind: stingers get room air, rapid combat stays dry-ish so
// 10x speed doesn't smear into wash. Values are the wet-path gain share.
const REVERB_SEND: Partial<Record<SoundKind, number>> = {
  shot_arrow: 0.05,
  shot_cannon: 0.1,
  shot_frost: 0.09,
  shot_tesla: 0.05,
  shot_sniper: 0.12,
  kill: 0.06,
  spire_hit: 0.12,
  wave_cleared: 0.22,
  victory: 0.25,
  defeat: 0.2,
  relic: 0.22,
  place: 0.06,
  boss: 0.18,
  cataclysm: 0.28,
  carapace: 0.16,
  gale: 0.2,
  meteor: 0.2,
  frost_nova: 0.22,
  gold_rush: 0.16,
  bulwark: 0.3,
  ramp_capped: 0.18,
}

// Millicell x-position -> stereo pan. The battlefield runs left (portal) to
// right (spire); sounds happen where you look for them.
function panFromX(xMillicells: number): number {
  const frac = xMillicells / (MAP_WIDTH * 1000)
  return Math.max(-0.8, Math.min(0.8, (frac - 0.5) * 1.3))
}

// Musical stingers land on CHORD tones — they're the sounds that read as
// phrases of the score. Everything else tonal snaps to the wider scale so
// rapid fire gets melodic variety without leaving the key.
const CHORD_SNAPPED: ReadonlySet<SoundKind> = new Set([
  'kill',
  'ramp_capped',
  'wave_cleared',
  'victory',
  'relic',
  'place',
  'gold_rush',
  'bulwark',
])

// Combat percussion gets a little random pitch drift so rapid fire doesn't
// sound like a machine stamping the same sample. UI layer — Math.random is
// fine here; the engine never sees it. (Tonal voices skip the jitter when
// a live key is published — detuning a quantized note defeats the point.)
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
  private reverb: ConvolverNode | null = null
  private noiseBuffer: AudioBuffer | null = null
  private lastPlayed: Partial<Record<SoundKind, number>> = {}
  private recentCount = 0
  private recentWindow = 0
  private reviveGeneration = 0
  private probeGeneration = 0
  private liveFlag = false
  private statusListeners = new Set<() => void>()
  muted: boolean
  // The score (music.ts) publishes its live key here; null = no music yet,
  // sounds play at their design pitch.
  tonality: (() => Tonality | null) | null = null

  constructor() {
    this.muted = localStorage.getItem(MUTE_KEY) === '1'
    // Browsers require a user gesture before audio can start — and can
    // suspend a running context at any time (tab switch, OS interruption).
    // The listeners stay attached for the whole session so every gesture is
    // a chance to create OR revive the context; a one-shot unlock would
    // leave a later-suspended context dead until reload.
    //
    // Which events actually grant activation differs by input: a MOUSE
    // pointerdown counts, but a TOUCH pointerdown does not — touch grants
    // on pointerup/touchend/click. pointerdown alone left phones silent.
    const revive = () => this.ensureRunning(true)
    window.addEventListener('pointerdown', revive)
    window.addEventListener('pointerup', revive)
    window.addEventListener('touchend', revive, { passive: true })
    window.addEventListener('click', revive)
    window.addEventListener('keydown', revive)
    // iOS mutes Web Audio while the ringer switch is on silent unless the
    // page declares itself a playback app (Safari 16.4+). A game's audio
    // should behave like game audio; the in-app mute button still rules.
    try {
      const nav = navigator as Navigator & { audioSession?: { type: string } }
      if (nav.audioSession) nav.audioSession.type = 'playback'
    } catch {
      // best-effort — older Safari simply keeps the OS default
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.ensureRunning(false)
    })
  }

  // The generative score (music.ts) rides this context so autoplay-unlock
  // and zombie-revival live in exactly one place.
  currentContext(): AudioContext | null {
    return this.ctx
  }

  currentNoiseBuffer(): AudioBuffer | null {
    return this.noiseBuffer
  }

  // Has audio been OBSERVED working? Browsers gate audio behind a user
  // gesture — and disagree about which events count, whether resume()'s
  // promise ever settles, and whether a 'running' context is actually
  // progressing. So this is never assumed: it flips true only after a
  // probe sees the clock advance, and drops if the context dies later.
  // The UI renders sound state from this, not from hope.
  get live(): boolean {
    return this.liveFlag
  }

  // Subscribe to liveness changes; returns the unsubscribe.
  onStatusChange(cb: () => void): () => void {
    this.statusListeners.add(cb)
    return () => this.statusListeners.delete(cb)
  }

  private setLive(v: boolean): void {
    if (this.liveFlag === v) return
    this.liveFlag = v
    for (const cb of this.statusListeners) cb()
  }

  // Ground truth, browser-agnostic: a context that is 'running' AND whose
  // currentTime advances is rendering audio. (resume() resolving is not
  // proof — Safari can leave a 'running' zombie; some browsers never
  // settle the promise at all.) One probe per attempt; a later attempt
  // supersedes an in-flight one.
  private probe(ctx: AudioContext): void {
    const gen = ++this.probeGeneration
    const t0 = ctx.currentTime
    setTimeout(() => {
      if (gen !== this.probeGeneration || this.ctx !== ctx) return
      this.setLive(ctx.state === 'running' && ctx.currentTime > t0)
    }, 200)
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
          if (kind) this.play(kind, panFromX(e.from.x))
          break
        }
        case 'enemy_killed':
          this.play('kill', panFromX(e.at.x))
          break
        case 'enemy_reached_spire':
          // The Spire sits on the right edge of every battlefield.
          this.play('spire_hit', 0.5)
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
        case 'tower_specialized':
          this.play('relic') // a commitment chime — same glass bell as a relic
          break
        case 'tower_placed':
          this.play('place', panFromX((e.cell.cx + 0.5) * 1000))
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
        case 'boss_carapace':
          this.play('carapace')
          break
        case 'boss_gale':
          this.play('gale')
          break
        case 'ramp_capped':
          this.play('ramp_capped', panFromX((e.cell.cx + 0.5) * 1000))
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
    if (ctx.state === 'running') {
      if (!this.liveFlag) this.probe(ctx)
      return
    }
    // 'suspended' (and Safari's 'interrupted') contexts usually revive on
    // resume() — but after app switches, mobile browsers sometimes leave a
    // zombie that never resumes (or resumes mute). A resume issued from a
    // REAL user gesture must take; if it hasn't shortly after, scrap the
    // context and build a fresh one, which the same gesture authorizes.
    // The probe (not the promise) decides whether audio is actually live.
    void ctx
      .resume()
      .then(() => this.prime(ctx))
      .catch(() => {})
    this.probe(ctx)
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
    // Track this context's fate: probe when it (re)starts running, demote
    // liveness the moment it stops — the sound button must never claim
    // audio that isn't rendering.
    ctx.onstatechange = () => {
      if (this.ctx !== ctx) return
      if (ctx.state === 'running') this.probe(ctx)
      else this.setLive(false)
    }
    this.probe(ctx)
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -18
    comp.knee.value = 24
    comp.ratio.value = 6
    comp.attack.value = 0.003
    comp.release.value = 0.2
    comp.connect(ctx.destination)
    this.master = comp

    // Procedural room reverb: a short stereo noise burst with an exponential
    // decay as the impulse response — no assets, ~40KB, built once.
    try {
      const irLen = Math.floor(ctx.sampleRate * 0.9)
      const ir = ctx.createBuffer(2, irLen, ctx.sampleRate)
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch)
        for (let i = 0; i < irLen; i++) {
          d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 2.8)
        }
      }
      const rev = ctx.createConvolver()
      rev.buffer = ir
      rev.connect(comp)
      this.reverb = rev
    } catch {
      this.reverb = null // dry-only is fine
    }

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

  private play(kind: SoundKind, pan = 0): void {
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
    // Per-sound bus: notes -> (panner) -> master, with a parallel send into
    // the shared convolution reverb. Panning places combat on the
    // battlefield; the send amount decides how much room a sound gets.
    let bus: AudioNode = this.master
    if (pan !== 0 && typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner()
      panner.pan.value = pan
      panner.connect(this.master)
      bus = panner
    }
    let wet: GainNode | null = null
    if (this.reverb) {
      wet = ctx.createGain()
      wet.gain.value = REVERB_SEND[kind] ?? 0.08
      wet.connect(this.reverb)
    }
    const connect = (node: AudioNode) => {
      node.connect(bus)
      if (wet) node.connect(wet)
    }

    const base = ctx.currentTime
    const tonal = this.tonality?.() ?? null
    const pitch = JITTERED.has(kind) ? 1 + (Math.random() * 2 - 1) * 0.04 : 1
    let chained = 0 // running offset for notes without an explicit `at`
    for (const note of SOUNDS[kind]) {
      const at = base + (note.at ?? chained)
      if (note.at === undefined) chained += note.dur * 0.9
      const scaled = (note.gain * Math.max(0, Math.min(100, settings.volume))) / 100
      if (scaled <= 0) continue
      const gain = ctx.createGain()
      // Real attack ramp: starting a gain at full value clicks. A few ms of
      // linear rise reads as the same transient without the pop.
      const attack = Math.min(note.attack ?? 0.004, note.dur * 0.4)
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.linearRampToValueAtTime(scaled, at + attack)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + note.dur)
      connect(gain)
      // Noise keeps its (jittered) design center — a bandpass sweep isn't a
      // pitch. Tonal voices fall into the live key when the score has one.
      let freq = note.freq
      if (note.type === 'noise' || tonal === null) {
        freq *= pitch
      } else {
        freq = snapToPitchClasses(freq, CHORD_SNAPPED.has(kind) ? tonal.chordPCs : tonal.scalePCs)
      }
      if (note.type === 'pluck') {
        // Karplus-Strong: a 2-period noise burst excites a tuned feedback
        // delay; a lowpass in the loop damps it like a real string. The
        // feedback gain is derived so the string rings for exactly `dur`.
        const period = 1 / freq
        const src = ctx.createBufferSource()
        src.buffer = this.noiseBuffer
        src.loop = true
        const burst = ctx.createGain()
        burst.gain.setValueAtTime(1, at)
        burst.gain.exponentialRampToValueAtTime(0.001, at + period * 2)
        const fc = Math.min(12000, freq * 6)
        const delay = ctx.createDelay(0.05)
        // The in-loop damping filter adds ~1/(2π·fc) of group delay, which
        // rings the string ~45 cents FLAT of the commanded pitch. Arbitrary
        // design pitches hid that; key-quantized ones can't — shorten the
        // line by the filter delay so the pluck sounds at pitch.
        delay.delayTime.value = Math.max(period / 2, period - 1 / (2 * Math.PI * fc))
        const damp = ctx.createBiquadFilter()
        damp.type = 'lowpass'
        damp.frequency.value = fc
        damp.Q.value = 1 // pinned: the tuning compensation above assumes it
        const fb = ctx.createGain()
        fb.gain.setValueAtTime(Math.pow(0.001, period / note.dur), at)
        src.connect(burst)
        burst.connect(delay)
        delay.connect(damp)
        damp.connect(fb)
        fb.connect(delay) // the string loop
        damp.connect(gain)
        src.start(at)
        src.stop(at + period * 2 + 0.01)
        // Cut the loop once the note ends so the feedback graph dies.
        fb.gain.setValueAtTime(fb.gain.value, at + note.dur)
        fb.gain.linearRampToValueAtTime(0, at + note.dur + 0.05)
      } else if (note.type === 'fm') {
        // Two-operator FM: modulator depth starts at `index` carriers and
        // collapses toward `indexEnd`, so the timbre evolves inside the hit
        // (bright metallic attack -> clean ring) like a struck object.
        const carrier = ctx.createOscillator()
        carrier.type = 'sine'
        carrier.frequency.setValueAtTime(freq, at)
        if (note.sweep) carrier.frequency.exponentialRampToValueAtTime(freq * note.sweep, at + note.dur)
        const mod = ctx.createOscillator()
        mod.type = 'sine'
        mod.frequency.setValueAtTime(freq * (note.ratio ?? 2), at)
        const depth = ctx.createGain()
        const index = note.index ?? 2
        depth.gain.setValueAtTime(freq * index, at)
        depth.gain.exponentialRampToValueAtTime(Math.max(0.01, freq * (note.indexEnd ?? index * 0.05)), at + note.dur)
        mod.connect(depth)
        depth.connect(carrier.frequency)
        carrier.connect(gain)
        mod.start(at)
        carrier.start(at)
        mod.stop(at + note.dur + 0.02)
        carrier.stop(at + note.dur + 0.02)
      } else if (note.type === 'noise') {
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
        // Tonal notes play as a detuned pair through a softening lowpass:
        // the chorus thickens thin oscillators and the filter shaves the
        // raw-synth harshness off saws and squares.
        const startOsc = (detuneCents: number, g: number) => {
          const osc = ctx.createOscillator()
          osc.type = note.type as OscillatorType
          osc.frequency.setValueAtTime(freq, at)
          osc.detune.value = detuneCents
          if (note.sweep) osc.frequency.exponentialRampToValueAtTime(freq * note.sweep, at + note.dur)
          const into = ctx.createGain()
          into.gain.value = g
          osc.connect(into)
          osc.start(at)
          osc.stop(at + note.dur + 0.02)
          return into
        }
        if (note.pure) {
          startOsc(0, 1).connect(gain)
        } else {
          const lp = ctx.createBiquadFilter()
          lp.type = 'lowpass'
          lp.frequency.value = Math.min(12000, Math.max(1400, freq * 3.2))
          lp.Q.value = 0.5
          startOsc(-6, 0.55).connect(lp)
          startOsc(6, 0.55).connect(lp)
          lp.connect(gain)
        }
      }
    }
  }
}
