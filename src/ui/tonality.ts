// Live musical tonality, shared between the score (music.ts, the producer)
// and the SFX synth (audio.ts, the consumer): the pitch classes of the
// active scale and of the chord sounding right now. Tonal sound effects
// snap to these so combat rings in the same key as the music — the
// Rez/Peggle trick. Noise percussion is exempt: it has no pitch to clash.

export interface Tonality {
  scalePCs: number[] // pitch classes (0–11) of the active scale
  chordPCs: number[] // pitch classes of the chord currently sounding
}

// Snap a frequency to the nearest pitch (any octave) whose pitch class is
// in `pcs`. Register is preserved — the result stays within a tritone of
// the input — so a designed sound keeps its character and just falls into
// key. UI-layer math; the engine never sees any of this.
export function snapToPitchClasses(hz: number, pcs: number[]): number {
  if (hz <= 0 || pcs.length === 0) return hz
  const midi = 69 + 12 * Math.log2(hz / 440)
  const base = Math.round(midi)
  let best = base
  let bestDist = Infinity
  for (let d = -6; d <= 6; d++) {
    const cand = base + d
    if (!pcs.includes(((cand % 12) + 12) % 12)) continue
    const dist = Math.abs(cand - midi)
    if (dist < bestDist) {
      bestDist = dist
      best = cand
    }
  }
  return 440 * Math.pow(2, (best - 69) / 12)
}
