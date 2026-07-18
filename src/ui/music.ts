import { BIOME_IDS, type BiomeId } from '../data/biomes'
import type { GameEvent, RunState } from '../engine/types'
import type { Sfx } from './audio'
import { settings } from './settings'
import type { Tonality } from './tonality'

// Generative score — zero assets, same philosophy as the SFX stack. The
// music is built on actual harmonic motion, not a drone: a per-biome chord
// PROGRESSION advances every bar, the pad voices glide between chords and
// breathe (swell on the downbeat, relax through the bar), a bass line walks
// the chord roots, and a melody plays seeded rhythm patterns whose notes
// land on chord tones on strong beats and walk the scale between them,
// echoed through a tempo-synced feedback delay. INTENSITY is derived from
// live game state (phase, horde size, boss presence, spire health) and
// eased, so the score thickens into a wave and exhales when it clears.
// Each biome owns a mode, register, and progression; the run seed
// transposes the key and salts the rhythm patterns, so no two runs sit on
// the same root but a given run is musically consistent.
//
// The battle also plays the score beat-by-beat (handleEvents): kill
// momentum thickens the melody line, a living boss doubles the harmonic
// rhythm (chords change every half bar — urgency without a tempo change),
// a cleared wave answers with a descending chord-tone cadence run, and an
// enemy reaching the Spire makes the pad flinch. Combat and score are one
// instrument played from both ends — and since tonal SFX quantize to the
// same live key (tonality.ts), the coupling runs in both directions.
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

// Chord progressions as scale-degree roots, one chord per bar. Chords are
// stacked in SCALE space (every other degree), which yields proper triads
// on the 7-note mode and open quartal colors on the pentatonics. Each is
// two 4-bar phrases — an antecedent that wanders and a consequent that
// cadences home — so the harmony runs 8 bars (~22s) before repeating, and
// the alternating lift pass stretches the full form to 16 bars (~44s).
const BIOME_PROGRESSION: Record<BiomeId, number[]> = {
  verdant: [0, 3, 4, 1, 2, 4, 3, 0], // I–V–vi–ii, then out through iii to a V–I close
  frostfen: [0, 2, 4, 3, 1, 4, 2, 0], // minor drift, drifting further before it settles
  emberwaste: [0, 1, 0, 3, 4, 1, 3, 0], // phrygian b2 menace, an excursion, back to the dark
  highlands: [0, 5, 3, 4, 1, 5, 4, 0], // I–vi–IV–V answered by ii–vi–V–I
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
const STEPS_PER_BAR = 8

// One-bar rhythm masks for the melody. Which mask a bar uses rotates with
// the bar index salted by the run seed, so phrases repeat enough to feel
// composed but not enough to loop obviously.
const RHYTHMS: number[][] = [
  [1, 0, 0, 0, 1, 0, 1, 0],
  [1, 0, 1, 0, 0, 0, 1, 0],
  [0, 0, 1, 0, 1, 0, 0, 1],
  [1, 0, 0, 1, 0, 1, 0, 0],
  [1, 0, 1, 1, 0, 0, 1, 0],
  [0, 1, 0, 0, 1, 0, 1, 1],
]

export class Music {
  private sfx: Sfx
  private getState: (() => RunState) | null = null
  private boundCtx: AudioContext | null = null
  private bus: GainNode | null = null
  private echoSend: GainNode | null = null
  private padOsc: OscillatorNode[] = []
  private padGain: GainNode | null = null
  private padFilter: BiquadFilterNode | null = null
  private nextNoteAt = 0
  private totalStep = 0
  private melodyPos = 0 // scale-space index (degree + octave·scale-length)
  private intensity = 0.15
  private padLevel = 0
  private timer: ReturnType<typeof setInterval> | null = null
  private lastTonality: Tonality | null = null
  private killHeat = 0 // decaying recent-kill momentum (0..16)
  private flourishFrom = -1 // totalStep where a cadence run starts (wave clear, boss down)
  private announceFrom = -1 // totalStep where the wave-start call plays
  private forceChordStep = -1 // boss entrance: chord slams on THIS step, not the next bar
  private dropUntilStep = -1 // boss entrance dropout: groove silenced until this step

  constructor(sfx: Sfx) {
    this.sfx = sfx
    // Publish the live key so tonal sound effects ring in tune with the
    // score (see tonality.ts). Stays at the last chord while music is
    // muted — a fixed key still beats a clashing one.
    sfx.tonality = () => this.lastTonality
  }

  attach(getState: () => RunState): void {
    this.getState = getState
    if (this.timer === null) {
      // Lookahead scheduler: wake often, schedule a beat or two ahead.
      this.timer = setInterval(() => this.tick(), 200)
    }
  }

  // The battle plays the score too: fed the same GameEvents as the SFX.
  // Reactions fire on ARRIVAL and DEATH, not just sustained presence — an
  // enemy that only lives a few seconds still gets its musical moment.
  handleEvents(events: GameEvent[]): void {
    for (const e of events) {
      if (e.type === 'enemy_killed') {
        this.killHeat = Math.min(16, this.killHeat + 1)
        // A boss going down earns the triumphant cadence run immediately.
        if (e.enemy.startsWith('boss')) this.flourishFrom = this.totalStep
      } else if (e.type === 'enemy_spawned' && e.enemy.startsWith('boss')) {
        // Boss entrance: the chord slams on the very next step (~0.3s),
        // then a full BAR of dropout — melody, bass, and hats silenced,
        // heartbeat kick only. Silence-then-different reads as "the music
        // changed"; another layer on top of the same groove never did.
        this.forceChordStep = this.totalStep
        this.dropUntilStep = this.totalStep + STEPS_PER_BAR
      } else if (e.type === 'run_ended') {
        // Defeat: the score collapses NOW — the pad sinks an octave in a
        // slow power-down glide, the filter closes to a murmur, and the
        // scheduler (see scheduleStep) drops to a cold toll.
        const ctx = this.boundCtx
        if (e.outcome === 'defeat' && ctx && ctx.state === 'running') {
          for (const o of this.padOsc) {
            o.frequency.setTargetAtTime(o.frequency.value / 2, ctx.currentTime, 0.7)
          }
          this.padFilter?.frequency.setTargetAtTime(160, ctx.currentTime, 0.4)
          this.padGain?.gain.setTargetAtTime(0.06, ctx.currentTime, 0.8)
          this.killHeat = 0
        }
      } else if (e.type === 'wave_started') {
        this.announceFrom = this.totalStep // rising call as the horde arrives
      } else if (e.type === 'wave_cleared') {
        this.flourishFrom = this.totalStep // cadence run starts next step
      } else if (e.type === 'enemy_reached_spire') {
        // The pad flinches: an immediate dip, recovering over ~a second.
        // The next bar boundary re-owns the gain, so no scheduling fight.
        const ctx = this.boundCtx
        if (ctx && this.padGain && ctx.state === 'running') {
          this.padGain.gain.setTargetAtTime(this.padLevel * 0.25, ctx.currentTime, 0.04)
          this.padGain.gain.setTargetAtTime(this.padLevel, ctx.currentTime + 0.35, 0.5)
        }
      }
    }
  }

  // Rebind to the Sfx's (possibly recreated) context and rebuild the graph.
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
    // Tempo-synced feedback echo for the melody: dotted-eighth repeats,
    // low-passed so the tails sit behind the dry notes instead of on them.
    this.echoSend = ctx.createGain()
    this.echoSend.gain.value = 0.4
    const delay = ctx.createDelay(2)
    delay.delayTime.value = BEAT * 3
    const damp = ctx.createBiquadFilter()
    damp.type = 'lowpass'
    damp.frequency.value = 2400
    const feedback = ctx.createGain()
    feedback.gain.value = 0.35
    this.echoSend.connect(delay)
    delay.connect(damp)
    damp.connect(feedback)
    feedback.connect(delay)
    damp.connect(this.bus)
    this.nextNoteAt = ctx.currentTime + 0.1
    return ctx
  }

  private tick(): void {
    const ctx = this.ensureGraph()
    const state = this.getState?.()
    if (!ctx || !state || !this.bus) return

    // Master music level: player slider × mute, eased so changes glide.
    const muted = this.sfx.muted || settings.musicVolume <= 0
    const level = muted ? 0.0001 : 0.05 * (settings.musicVolume / 100)
    this.bus.gain.setTargetAtTime(level, ctx.currentTime, 0.4)
    if (muted) return

    // Intensity from the battlefield, eased toward its target.
    const over = state.phase === 'defeat' || state.phase === 'victory'
    const overMode = over ? (state.phase === 'defeat' ? ('defeat' as const) : ('victory' as const)) : null
    // A boss corpse on the defeat screen must not keep the vamp going.
    const bossAlive = !over && state.enemies.some((e) => e.type.startsWith('boss') && e.hp > 0)
    let target = 0.15
    if (state.phase === 'wave') {
      target = 0.4 + Math.min(0.25, state.enemies.length / 120)
      if (bossAlive) target += 0.25
      if (state.spireHp * 100 < state.spireMaxHp * 40) target += 0.1
    }
    if (over) target = 0.05
    this.intensity += (target - this.intensity) * 0.12
    this.killHeat *= 0.95 // momentum lingers a few seconds past the streak
    // The pad's resting level; the per-bar swell breathes around it.
    this.padLevel = 0.2 + this.intensity * 0.15

    // Key: biome mode + seed transpose; seed also salts the rhythm rotation.
    const biome: BiomeId = BIOME_IDS.includes(state.biome) ? state.biome : 'verdant'
    const seedHash = hashSeed(state.seed)
    const root = BIOME_ROOT[biome] + (seedHash % 12)
    const scale = BIOME_SCALE[biome]
    const prog = BIOME_PROGRESSION[biome]

    // Schedule the eighth-note grid up to 0.6s ahead.
    while (this.nextNoteAt < ctx.currentTime + 0.6) {
      this.scheduleStep(ctx, this.nextNoteAt, root, scale, prog, (seedHash >>> 4) % RHYTHMS.length, bossAlive, overMode)
      this.nextNoteAt += BEAT
      this.totalStep += 1
    }
  }

  private scheduleStep(
    ctx: AudioContext,
    at: number,
    root: number,
    scale: number[],
    prog: number[],
    rhythmSalt: number,
    bossAlive: boolean,
    overMode: 'defeat' | 'victory' | null,
  ): void {
    if (!this.bus || !this.padGain || !this.padFilter) return
    const len = scale.length
    const bar = Math.floor(this.totalStep / STEPS_PER_BAR)
    const step = this.totalStep % STEPS_PER_BAR
    // A chord tone, stacked in scale space: k=0 root, k=1 "third", k=2 "fifth".
    // (Defined before the defeat branch — the toll needs the root too.)
    const toneOf = (deg: number, k: number): number => {
      const off = deg + 2 * k
      return root + scale[off % len]! + 12 * Math.floor(off / len)
    }

    if (overMode === 'defeat') {
      // The Spire has fallen. No groove, no melody — the pad holds a cold
      // octave-down tonic at a whisper and a dry low bell tolls every
      // other bar. The silence between tolls IS the defeat.
      if (this.totalStep % STEPS_PER_BAR === 0) {
        this.tunePad(ctx, at, [toneOf(0, 0) - 12, toneOf(0, 1) - 12, toneOf(0, 2) - 12], 0.5)
        this.padGain.gain.setTargetAtTime(0.04, at, 0.6)
        this.padFilter.frequency.setTargetAtTime(160, at, 0.6)
      }
      if (this.totalStep % (STEPS_PER_BAR * 2) === 0) {
        this.blip(ctx, at, midiHz(toneOf(0, 0) - 12), 1.6, 'sine', 0.25)
      }
      return
    }

    // A living boss abandons the wandering progression for a two-chord dark
    // vamp — an ostinato oscillating every half bar, the whole pad an
    // octave down. Different harmonic MATERIAL, not just a faster cycle:
    // that's what makes the ear say "boss music".
    const harmonicSteps = bossAlive ? STEPS_PER_BAR / 2 : STEPS_PER_BAR
    const chordDegree = bossAlive
      ? Math.floor(this.totalStep / harmonicSteps) % 2 === 0
        ? 0
        : 1
      : prog[Math.floor(this.totalStep / harmonicSteps) % prog.length]!
    // Every other pass through the progression LIFTS: melody reaches higher
    // chord tones and thickens, the pad brightens, the bass answers more.
    // Doubles the form (~44s) so the loop stops announcing itself.
    const lift = Math.floor(bar / prog.length) % 2 === 1
    // The last bar of each pass earns a little cadence fill.
    const cadenceBar = bar % prog.length === prog.length - 1
    const tone = toneOf
    // Boss-entrance dropout: the groove (bass, hats, melody, calls) is
    // silenced for a bar — only the heartbeat kick under the ducked pad.
    const dropped = this.totalStep < this.dropUntilStep

    const bossEntrance = this.totalStep === this.forceChordStep
    if (this.totalStep % harmonicSteps === 0 || bossEntrance) {
      // Chord change: glide the pad voices to the new chord, swell the level
      // on the downbeat and relax through the bar (breathing, not droning),
      // and let the filter bloom open then settle. Boss vamps ride an
      // octave down — register is half of what makes them read as a shift.
      const drop = bossAlive ? 12 : 0
      this.tunePad(ctx, at, [tone(chordDegree, 0) - drop, tone(chordDegree, 1) - drop, tone(chordDegree, 2) - drop])
      this.lastTonality = {
        scalePCs: scale.map((s) => (root + s) % 12),
        chordPCs: [0, 1, 2].map((k) => tone(chordDegree, k) % 12),
      }
      const level = this.padLevel * (lift ? 1.12 : 1) * (dropped ? 0.4 : 1)
      const bright = lift ? 260 : 0
      this.padGain.gain.setTargetAtTime(level, at, 0.3)
      this.padGain.gain.setTargetAtTime(level * 0.65, at + BEAT * 4, 0.9)
      this.padFilter.frequency.setTargetAtTime(700 + this.intensity * 1600 + bright, at, 0.06)
      this.padFilter.frequency.setTargetAtTime(380 + this.intensity * 1100 + bright, at + 0.5, 0.9)
    }
    if (bossEntrance) {
      // The entrance hit itself: heartbeat kick, a long dark drone on the
      // chord root, and the filter slamming shut before creeping back open.
      this.kick(ctx, at)
      this.blip(ctx, at, midiHz(tone(chordDegree, 0) - 12), 1.4, 'triangle', 0.55)
      this.padFilter.frequency.setTargetAtTime(240, at, 0.03)
      this.padFilter.frequency.setTargetAtTime(380 + this.intensity * 1100, at + 1.2, 1.2)
    }

    // Bass: the chord root anchors every downbeat (triangle, not sine — the
    // upper harmonics keep it audible on phone speakers), the chord's fifth
    // answers mid-bar once the fight warms, and at full boil it pulses.
    if (dropped) {
      // Dropout bar: heartbeat only. The kick block below still runs.
    } else if (step === 0) {
      this.blip(ctx, at, midiHz(tone(chordDegree, 0)), 0.6, 'triangle', 0.35 + this.intensity * 0.3)
    } else if (step === 4 && (lift || this.intensity > 0.3)) {
      this.blip(ctx, at, midiHz(tone(chordDegree, 1)), 0.45, 'triangle', 0.4)
    } else if (step % 2 === 0 && (this.intensity > 0.65 || this.killHeat > 7)) {
      // A hot streak drives the bass into eighth-note pulses even before
      // raw intensity gets there — the groove audibly rides the kills.
      this.blip(ctx, at, midiHz(tone(chordDegree, 0)), 0.2, 'triangle', 0.3)
    }

    // Kick: boss heartbeat on the half-bar; desperate waves earn a downbeat.
    if ((bossAlive && step % 4 === 0) || (this.intensity > 0.7 && step === 0)) {
      this.kick(ctx, at)
    }
    // Hat: offbeat air at high intensity — or whenever kills are streaming.
    if (!dropped && (this.intensity > 0.55 || this.killHeat > 5) && step % 2 === 1 && Math.random() < 0.8) {
      this.hat(ctx, at)
    }
    if (dropped) return // the dropout bar: heartbeat and ducked pad, nothing else

    // Wave start: a two-note rising call as the horde arrives — the score
    // reacts to enemies APPEARING, not only to them dying.
    if (this.announceFrom >= 0 && this.totalStep >= this.announceFrom) {
      const off = this.totalStep - this.announceFrom
      if (off < 2) {
        this.blip(ctx, at, midiHz(tone(chordDegree, off) + 12), 0.3, 'triangle', 0.45, true)
      } else {
        this.announceFrom = -1
      }
    }

    // Wave cleared: the melody answers with a descending chord-tone run —
    // a real cadence figure, echoed, that resolves onto the chord root.
    if (this.flourishFrom >= 0 && this.totalStep >= this.flourishFrom) {
      const offset = this.totalStep - this.flourishFrom
      if (offset < 4) {
        const note = tone(chordDegree, 3 - offset) + 12
        this.blip(ctx, at, midiHz(note), 0.3, 'triangle', 0.5, true)
        return // the run owns the melody for these four steps
      }
      this.flourishFrom = -1
    }

    // Melody: a seeded rhythm pattern per bar. Strong beats pull toward
    // chord tones an octave above the pad; passing notes walk the scale.
    // Intensity thins or thickens the line by dropping pattern hits; kill
    // momentum thickens it further (the score audibly rides a hot streak);
    // the lift pass reaches into higher chord tones and drops fewer, and
    // the cadence bar's back half fills in to hand the phrase over.
    const mask = RHYTHMS[(bar + rhythmSalt) % RHYTHMS.length]!
    let gate = 0.35 + this.intensity * 0.55 + Math.min(0.35, this.killHeat * 0.03)
    if (lift) gate += 0.15
    if (cadenceBar && step >= 6) gate += 0.3
    if (mask[step] === 1 && Math.random() < gate) {
      if (step % 4 === 0 || Math.random() < 0.35) {
        // Hot streaks also push the line into higher chord tones.
        const stack = (lift ? 1 : 0) + (this.killHeat > 8 ? 1 : 0) + Math.floor(Math.random() * 3)
        const targetPos = chordDegree + 2 * stack + len
        const drift = Math.max(-2, Math.min(2, targetPos - this.melodyPos))
        this.melodyPos += drift
      } else {
        this.melodyPos += Math.random() < 0.5 ? -1 : 1
      }
      this.melodyPos = Math.max(len, Math.min(3 * len - 1, this.melodyPos))
      const note = root + scale[this.melodyPos % len]! + 12 * Math.floor(this.melodyPos / len)
      const humanize = (Math.random() - 0.5) * 0.01
      this.blip(ctx, at + humanize, midiHz(note), 0.3, 'triangle', 0.4 + Math.random() * 0.15, true)
    }
  }

  // Glide the sustained pad voices to a new chord; build them on first use
  // (or after a context rebuild). Slight per-voice detune keeps it wide.
  // `glide` is the retune time constant — slow for the defeat collapse.
  private tunePad(ctx: AudioContext, at: number, midis: number[], glide = 0.08): void {
    if (!this.padFilter) return
    if (this.padOsc.length !== midis.length) {
      this.padOsc.forEach((o) => {
        try {
          o.stop()
        } catch {
          // already stopped
        }
      })
      this.padOsc = []
      const detunes = [-4, 3, -2]
      midis.forEach((m, i) => {
        const osc = ctx.createOscillator()
        osc.type = 'sawtooth'
        osc.frequency.value = midiHz(m)
        osc.detune.value = detunes[i % detunes.length]!
        osc.connect(this.padFilter!)
        osc.start()
        this.padOsc.push(osc)
      })
      return
    }
    midis.forEach((m, i) => {
      this.padOsc[i]!.frequency.setTargetAtTime(midiHz(m), at, glide)
    })
  }

  private blip(
    ctx: AudioContext,
    at: number,
    freq: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    echo = false,
  ): void {
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
    if (echo && this.echoSend) g.connect(this.echoSend)
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
