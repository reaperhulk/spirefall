import type { BiomeId } from '../data/biomes'

export type ScorePhase = 'preparation' | 'pressure' | 'boss' | 'victory' | 'ascension'
export const SCORE_BEAT = 60 / 88 / 2
// Scale degrees: the opening leap, falling answer and return to the Spire
// survive every variation. -1 is a deliberate rest, not a missing note.
export const PHRASES: Record<ScorePhase, readonly number[]> = {
  preparation: [
    0,-1,-1,-1,4,-1,2,-1,1,-1,-1,-1,0,-1,-1,-1,
    2,-1,-1,-1,5,-1,4,-1,2,-1,1,-1,0,-1,-1,-1,
    4,-1,-1,-1,7,-1,5,-1,4,-1,2,-1,1,-1,-1,-1,
    2,-1,4,-1,2,-1,1,-1,0,-1,-1,-1,-1,-1,-1,-1,
  ],
  pressure: [
    0,-1,4,-1,2,1,-1,0,0,-1,4,5,4,-1,2,-1,
    1,-1,2,-1,4,2,1,-1,0,-1,-1,-1,-1,-1,-1,-1,
    2,-1,5,-1,4,2,-1,1,2,-1,5,7,5,-1,4,-1,
    4,-1,2,-1,1,2,4,-1,2,-1,-1,-1,-1,-1,-1,-1,
    4,-1,7,-1,5,4,-1,2,4,-1,7,9,7,-1,5,-1,
    5,-1,4,2,4,-1,5,-1,7,-1,5,-1,4,-1,-1,-1,
    2,-1,4,-1,5,4,2,-1,1,-1,2,-1,4,2,1,-1,
    0,-1,-1,-1,4,-1,2,-1,0,-1,-1,-1,-1,-1,-1,-1,
  ],
  boss: [
    0,-1,4,1,0,-1,1,-1,0,-1,4,2,1,-1,-1,-1,
    1,-1,5,2,1,-1,2,-1,1,-1,5,4,2,-1,-1,-1,
    4,-1,7,5,4,-1,2,-1,4,-1,7,4,1,-1,2,-1,
    0,-1,4,1,2,-1,1,-1,0,-1,-1,-1,-1,-1,-1,-1,
  ],
  victory: [0,-1,4,-1,2,-1,4,-1,5,-1,4,2,1,-1,0,-1,4,-1,5,-1,7,-1,5,-1,4,-1,2,-1,0,-1,-1,-1],
  ascension: [0,-1,4,-1,2,-1,4,-1,5,-1,7,-1,9,-1,7,-1,5,-1,-1,-1,7,-1,9,-1,12,-1,9,-1,7,-1,-1,-1],
}

const VOICES: Record<BiomeId, {attack:number; cutoff:number; overtone:number; wet:number; partials:number[]}> = {
  verdant: {partials:[0,1,0.42,0.23,0.09,0.04], attack:0.008, cutoff:3200, overtone:2, wet:0.18}, // carved string
  frostfen: {partials:[0,1,0.04,0.16,0.02,0.08], attack:0.006, cutoff:6500, overtone:2.01, wet:0.48}, // ice bell
  emberwaste: {partials:[0,1,0.12,0.6,0.08,0.3,0.02,0.12], attack:0.055, cutoff:950, overtone:1, wet:0.12}, // low reed
  highlands: {partials:[0,1,0.5,0.32,0.16,0.08], attack:0.08, cutoff:1800, overtone:3, wet:0.32}, // distant horn
}
// One immutable harmonic palette per biome/context, reused by every note.
const waves = new WeakMap<BaseAudioContext, Partial<Record<BiomeId, PeriodicWave>>>()
function instrumentWave(ctx:BaseAudioContext, biome:BiomeId): PeriodicWave {
  let cache = waves.get(ctx)
  if (!cache) { cache = {}; waves.set(ctx, cache) }
  return cache[biome] ??= ctx.createPeriodicWave(new Float32Array(VOICES[biome].partials.length), new Float32Array(VOICES[biome].partials))
}
export function phraseFrequency(root:number, scale:readonly number[], degree:number): number {
  return 440 * 2 ** ((root + scale[degree % scale.length]! + 12 * (1 + Math.floor(degree / scale.length)) - 69) / 12)
}
// Two bounded oscillators per note. The same authored instrument graph is
// used by the live scheduler and OfflineAudioContext's mix checks.
export function scoreVoice(ctx:BaseAudioContext, destination:AudioNode, echo:AudioNode | null, biome:BiomeId, at:number, freq:number, duration:number, gain:number): void {
  const voice = VOICES[biome]
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(voice.cutoff, at)
  filter.frequency.exponentialRampToValueAtTime(voice.cutoff * 0.45, at + duration)
  filter.Q.value = 0.45
  const envelope = ctx.createGain()
  envelope.gain.setValueAtTime(0.0001, at)
  envelope.gain.linearRampToValueAtTime(gain, at + Math.min(duration * 0.3, voice.attack))
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration)
  filter.connect(envelope); envelope.connect(destination)
  const wet = ctx.createGain()
  wet.gain.value = voice.wet
  if (echo) { envelope.connect(wet); wet.connect(echo) }
  let remaining = 2
  for (let i = 0; i < 2; i++) {
    const osc = ctx.createOscillator(), partial = ctx.createGain()
    if (i === 0) osc.setPeriodicWave(instrumentWave(ctx, biome))
    else osc.type = 'sine'
    osc.frequency.value = freq * (i === 0 ? 1 : voice.overtone)
    partial.gain.value = i === 0 ? 0.8 : biome === 'frostfen' ? 0.3 : 0.12
    osc.connect(partial); partial.connect(filter)
    osc.onended = () => {
      osc.disconnect(); partial.disconnect()
      if (--remaining === 0) { filter.disconnect(); envelope.disconnect(); wet.disconnect() }
    }
    osc.start(at); osc.stop(at + duration + 0.03)
  }
}

export async function renderScorePreview(biome:BiomeId, phase:ScorePhase): Promise<{peak:number; rms:number; tailRms:number; seconds:number}> {
  const phrase = PHRASES[phase], seconds = phrase.length * SCORE_BEAT + 2
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * 22050), 22050)
  const master = ctx.createGain(); master.gain.value = 0.05; master.connect(ctx.destination)
  const scale = biome === 'verdant' ? [0,2,4,7,9] : biome === 'frostfen' ? [0,2,3,7,10] : biome === 'emberwaste' ? [0,1,5,7,10] : [0,2,4,5,7,9,10]
  phrase.forEach((degree,i) => {
    if (degree >= 0) scoreVoice(ctx,master,null,biome,0.05+i*SCORE_BEAT,phraseFrequency(48,scale,degree),SCORE_BEAT*1.8,0.35)
  })
  const data = (await ctx.startRendering()).getChannelData(0)
  let peak = 0, sum = 0, tail = 0
  for (let i = 0; i < data.length; i++) {
    const value = data[i]!
    if (!Number.isFinite(value)) throw new Error('Non-finite score output')
    peak = Math.max(peak, Math.abs(value)); sum += value * value
    if (i >= data.length - 22050) tail += value * value
  }
  return {peak, rms:Math.sqrt(sum / data.length), tailRms:Math.sqrt(tail / 22050), seconds}
}
