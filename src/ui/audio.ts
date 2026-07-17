import type { GameEvent } from '../engine/types'

// Tiny synthesized SFX — WebAudio oscillators, no assets. The AudioContext is
// created lazily on the first user gesture (browser autoplay policy), sounds
// are globally throttled so 10× speed doesn't become a wall of noise, and the
// mute preference persists.

const MUTE_KEY = 'spirefall-muted'

type SoundKind = 'shot' | 'kill' | 'spire_hit' | 'wave_cleared' | 'victory' | 'defeat' | 'relic' | 'place'

interface Note {
  freq: number
  dur: number
  type: OscillatorType
  gain: number
  sweep?: number // multiply freq by this over the duration
}

const SOUNDS: Record<SoundKind, Note[]> = {
  shot: [{ freq: 520, dur: 0.05, type: 'square', gain: 0.025, sweep: 0.7 }],
  kill: [{ freq: 300, dur: 0.09, type: 'triangle', gain: 0.05, sweep: 1.6 }],
  spire_hit: [{ freq: 110, dur: 0.25, type: 'sawtooth', gain: 0.09, sweep: 0.5 }],
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
  place: [{ freq: 220, dur: 0.06, type: 'square', gain: 0.05, sweep: 1.3 }],
}

export class Sfx {
  private ctx: AudioContext | null = null
  private lastPlayed: Partial<Record<SoundKind, number>> = {}
  private recentCount = 0
  private recentWindow = 0
  muted: boolean

  constructor() {
    this.muted = localStorage.getItem(MUTE_KEY) === '1'
    // Browsers require a user gesture before audio can start — and can
    // suspend a running context at any time (tab switch, OS interruption).
    // The listeners stay attached for the whole session so every gesture is
    // a chance to create OR revive the context; a one-shot unlock would
    // leave a later-suspended context dead until reload.
    const revive = () => this.ensureRunning()
    window.addEventListener('pointerdown', revive)
    window.addEventListener('keydown', revive)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.ensureRunning()
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
        case 'tower_fired':
          this.play('shot')
          break
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
        default:
          break
      }
    }
  }

  private ensureRunning(): void {
    if (this.ctx && this.ctx.state === 'closed') this.ctx = null
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext()
      } catch {
        this.ctx = null
        return
      }
    }
    // 'suspended' (and Safari's 'interrupted') contexts revive on resume().
    if (this.ctx.state !== 'running') {
      void this.ctx.resume().catch(() => {})
    }
  }

  private play(kind: SoundKind): void {
    if (this.muted || !this.ctx) return
    if (this.ctx.state !== 'running') {
      // Kick off an async revival; this sound is lost but the next one plays.
      this.ensureRunning()
      return
    }
    const now = performance.now()

    // Per-kind cooldown plus a global cap keep fast-forward bearable.
    const minGap = kind === 'shot' ? 70 : 90
    if (now - (this.lastPlayed[kind] ?? 0) < minGap) return
    if (now - this.recentWindow > 250) {
      this.recentWindow = now
      this.recentCount = 0
    }
    if (this.recentCount >= 6) return
    this.recentCount += 1
    this.lastPlayed[kind] = now

    let at = this.ctx.currentTime
    for (const note of SOUNDS[kind]) {
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()
      osc.type = note.type
      osc.frequency.setValueAtTime(note.freq, at)
      if (note.sweep) osc.frequency.exponentialRampToValueAtTime(note.freq * note.sweep, at + note.dur)
      gain.gain.setValueAtTime(note.gain, at)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + note.dur)
      osc.connect(gain)
      gain.connect(this.ctx.destination)
      osc.start(at)
      osc.stop(at + note.dur + 0.02)
      at += note.dur * 0.9
    }
  }
}
