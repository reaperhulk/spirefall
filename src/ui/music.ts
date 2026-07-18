import { BIOME_IDS, type BiomeId } from '../data/biomes'
import type { RunState } from '../engine/types'
import type { Sfx } from './audio'
import { settings } from './settings'

// Generative score — zero assets, same philosophy as the SFX stack. Three
// layers over a lookahead scheduler: a slow two-voice drone pad, a sparse
// pentatonic/modal arpeggio, and a bass-plus-hat pulse that only wakes when
// the fight heats up. INTENSITY is derived from live game state (phase,
// horde size, boss presence, spire health) and eased, so the score swells
// into a wave and exhales when it clears. Each biome owns a mode and
// register; the run seed transposes the key, so no two runs sit on the same
// root but a given run is musically consistent.
//
// UI-layer module: Math.random is fine here (humanization), and the sim
// never sees any of it. The score rides the Sfx's AudioContext so the
// autoplay-unlock and zombie-revival machinery stays in one place.

// Modal palettes per biome, as semitone offsets from the biome's root.
const BIOME_SCALE: Record<BiomeId, number[]> = {
  verdant: [0, 2, 4, 7, 9], // major pentatonic — open grassland
  frostfen: [0, 2, 3, 7, 10], // minor pentatonic, airy register — cold water
  emberwaste: [0, 1, 5, 7, 10], // phrygian-leaning — scorched and uneasy
  highlands: [0, 2, 4, 5, 7, 9, 10], // mixolydian — wind over stone
}

const BIOME_ROOT: Record<BiomeId, number> = {
  verdant: 48, // C3
  frostfen: 57, // A3 — chimes live higher
  emberwaste: 41, // F2 — low and hot
  highlands: 50, // D3
}

const midiHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12)

function hashSeed(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const BEAT = 60 / 88 / 2 // 88 BPM, eighth-note grid

export class Music {
  private sfx: Sfx
  private getState: (() => RunState) | null = null
  private boundCtx: AudioContext | null = null
  private bus: GainNode | null = null
  private padOsc: OscillatorNode[] = []
  private padGain: GainNode | null = null
  private padFilter: BiquadFilterNode | null = null
  private nextNoteAt = 0
  private stepIndex = 0
  private intensity = 0.15
  private timer: ReturnType<typeof setInterval> | null = null
  private lastKey = ''

  constructor(sfx: Sfx) {
    this.sfx = sfx
  }

  attach(getState: () => RunState): void {
    this.getState = getState
    if (this.timer === null) {
      // Lookahead scheduler: wake often, schedule a beat or two ahead.
      this.timer = setInterval(() => this.tick(), 200)
    }
  }

  // Rebind to the Sfx's (possibly recreated) context and rebuild the pad.
  private ensureGraph(): AudioContext | null {
    const ctx = this.sfx.currentContext()
    if (!ctx || ctx.state !== 'running') return null
    if (ctx === this.boundCtx && this.bus) return ctx
    this.boundCtx = ctx
    this.padOsc.forEach((o) => {
      try {
        o.stop()
      } catch {
        // already stopped
      }
    })
    this.padOsc = []
    this.bus = ctx.createGain()
    this.bus.gain.value = 0.001
    this.bus.connect(ctx.destination)
    this.padFilter = ctx.createBiquadFilter()
    this.padFilter.type = 'lowpass'
    this.padFilter.frequency.value = 600
    this.padFilter.Q.value = 0.4
    this.padGain = ctx.createGain()
    this.padGain.gain.value = 0
    this.padFilter.connect(this.padGain)
    this.padGain.connect(this.bus)
    this.nextNoteAt = ctx.currentTime + 0.1
    this.lastKey = '' // force pad retune
    return ctx
  }

  private tick(): void {
    const ctx = this.ensureGraph()
    const state = this.getState?.()
    if (!ctx || !state || !this.bus || !this.padGain || !this.padFilter) return

    // Master music level: player slider × mute, eased so changes glide.
    const muted = this.sfx.muted || settings.musicVolume <= 0
    const level = muted ? 0.0001 : 0.05 * (settings.musicVolume / 100)
    this.bus.gain.setTargetAtTime(level, ctx.currentTime, 0.4)
    if (muted) return

    // Intensity from the battlefield, eased toward its target.
    const over = state.phase === 'defeat' || state.phase === 'victory'
    const bossAlive = state.enemies.some((e) => e.type.startsWith('boss') && e.hp > 0)
    let target = 0.15
    if (state.phase === 'wave') {
      target = 0.4 + Math.min(0.25, state.enemies.length / 120)
      if (bossAlive) target += 0.25
      if (state.spireHp * 100 < state.spireMaxHp * 40) target += 0.1
    }
    if (over) target = 0.05
    this.intensity += (target - this.intensity) * 0.12

    // Key: biome mode + seed transpose. Retune the pad when it changes.
    const biome: BiomeId = BIOME_IDS.includes(state.biome) ? state.biome : 'verdant'
    const transpose = hashSeed(state.seed) % 12
    const root = BIOME_ROOT[biome] + transpose
    const scale = BIOME_SCALE[biome]
    const key = `${biome}:${transpose}`
    if (key !== this.lastKey) {
      this.lastKey = key
      this.retunePad(ctx, root)
    }
    this.padGain.gain.setTargetAtTime(0.5 + this.intensity * 0.3, ctx.currentTime, 1.2)
    this.padFilter.frequency.setTargetAtTime(400 + this.intensity * 1400, ctx.currentTime, 0.8)

    // Schedule the eighth-note grid up to 0.6s ahead.
    while (this.nextNoteAt < ctx.currentTime + 0.6) {
      this.scheduleStep(ctx, this.nextNoteAt, root, scale, bossAlive)
      this.nextNoteAt += BEAT
      this.stepIndex = (this.stepIndex + 1) % 16
    }
  }

  private retunePad(ctx: AudioContext, root: number): void {
    if (!this.padFilter) return
    this.padOsc.forEach((o) => {
      try {
        o.stop()
      } catch {
        // already stopped
      }
    })
    this.padOsc = []
    for (const [offset, detune] of [
      [0, -4],
      [7, 4],
    ] as const) {
      const osc = ctx.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.value = midiHz(root + offset)
      osc.detune.value = detune
      osc.connect(this.padFilter)
      osc.start()
      this.padOsc.push(osc)
    }
  }

  private scheduleStep(ctx: AudioContext, at: number, root: number, scale: number[], bossAlive: boolean): void {
    if (!this.bus) return
    const step = this.stepIndex

    // Bass: the root on each bar, once the fight is real.
    if (step % 8 === 0 && this.intensity > 0.3) {
      this.blip(ctx, at, midiHz(root - 12), 0.5, 'sine', 0.5)
    }
    // Kick: boss heartbeat on the half-bar.
    if (bossAlive && step % 4 === 0) {
      this.kick(ctx, at)
    }
    // Hat: offbeat air at high intensity.
    if (this.intensity > 0.55 && step % 2 === 1 && Math.random() < 0.8) {
      this.hat(ctx, at)
    }
    // Arp: sparse melodic sparks — denser as the horde thickens.
    const density = 0.12 + this.intensity * 0.45
    if (Math.random() < density) {
      const degree = scale[Math.floor(Math.random() * scale.length)]!
      const octave = 12 * (1 + Math.floor(Math.random() * 2))
      this.blip(ctx, at, midiHz(root + degree + octave), 0.28, 'triangle', 0.35)
    }
  }

  private blip(ctx: AudioContext, at: number, freq: number, dur: number, type: OscillatorType, vol: number): void {
    if (!this.bus) return
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.value = freq
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, at)
    g.gain.linearRampToValueAtTime(vol, at + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    osc.connect(g)
    g.connect(this.bus)
    osc.start(at)
    osc.stop(at + dur + 0.05)
  }

  private kick(ctx: AudioContext, at: number): void {
    if (!this.bus) return
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(110, at)
    osc.frequency.exponentialRampToValueAtTime(40, at + 0.12)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, at)
    g.gain.linearRampToValueAtTime(0.55, at + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.16)
    osc.connect(g)
    g.connect(this.bus)
    osc.start(at)
    osc.stop(at + 0.2)
  }

  private hat(ctx: AudioContext, at: number): void {
    const noise = this.sfx.currentNoiseBuffer()
    if (!this.bus || !noise) return
    const src = ctx.createBufferSource()
    src.buffer = noise
    src.loop = true
    const bp = ctx.createBiquadFilter()
    bp.type = 'highpass'
    bp.frequency.value = 7000
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, at)
    g.gain.linearRampToValueAtTime(0.12, at + 0.003)
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05)
    src.connect(bp)
    bp.connect(g)
    g.connect(this.bus)
    src.start(at)
    src.stop(at + 0.08)
  }
}
