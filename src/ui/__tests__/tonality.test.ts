import { describe, expect, it } from 'vitest'
import { snapToPitchClasses } from '../tonality'

const midiOf = (hz: number): number => 69 + 12 * Math.log2(hz / 440)

describe('snapToPitchClasses', () => {
  it('passes frequencies through when there is no key to snap to', () => {
    expect(snapToPitchClasses(480, [])).toBe(480)
    expect(snapToPitchClasses(0, [0, 4, 7])).toBe(0)
    expect(snapToPitchClasses(-5, [0, 4, 7])).toBe(-5)
  })

  it('leaves a frequency already in the key untouched (within float noise)', () => {
    // A4 = 440 Hz = pitch class 9.
    expect(snapToPitchClasses(440, [0, 9])).toBeCloseTo(440, 6)
    // A5 too — any octave of an allowed pitch class is a fixed point.
    expect(snapToPitchClasses(880, [9])).toBeCloseTo(880, 6)
  })

  it('snaps to the NEAREST allowed pitch, preserving register', () => {
    // C#4 (277.18 Hz) against C-major-triad pitch classes {0,4,7}: the
    // nearest allowed pitch is C4 (261.63) or... C#4 is midi 61; C4 (60)
    // is 1 semitone down, E4 (64) is 3 up — C4 wins.
    const snapped = snapToPitchClasses(277.18, [0, 4, 7])
    expect(midiOf(snapped)).toBeCloseTo(60, 5)
  })

  it('always lands on an allowed pitch class within a tritone, across registers', () => {
    const pcs = [0, 2, 4, 7, 9] // major pentatonic on C
    for (const hz of [55, 98, 180, 262, 480, 620, 820, 1900, 3200, 5000]) {
      const snapped = snapToPitchClasses(hz, pcs)
      const m = midiOf(snapped)
      expect(Math.abs(m - Math.round(m))).toBeLessThan(1e-6) // an exact pitch
      expect(pcs).toContain(((Math.round(m) % 12) + 12) % 12) // in the key
      expect(Math.abs(m - midiOf(hz))).toBeLessThanOrEqual(6) // same register
    }
  })

  it('handles a single-pitch-class chord anywhere on the wheel', () => {
    for (let pc = 0; pc < 12; pc++) {
      const snapped = snapToPitchClasses(700, [pc])
      const m = Math.round(midiOf(snapped))
      expect(((m % 12) + 12) % 12).toBe(pc)
    }
  })
})
