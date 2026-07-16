import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { deriveStream, nextInt, nextU32, rngFromSeed, type Rng } from '../rng'

function draw(rng: Rng, count: number): number[] {
  const values: number[] = []
  let r = rng
  for (let i = 0; i < count; i++) {
    const n = nextU32(r)
    values.push(n.value)
    r = n.rng
  }
  return values
}

describe('rng', () => {
  it('is deterministic: same seed produces the same sequence', () => {
    expect(draw(rngFromSeed('spire'), 100)).toEqual(draw(rngFromSeed('spire'), 100))
  })

  it('different seeds produce different sequences', () => {
    expect(draw(rngFromSeed('spire'), 20)).not.toEqual(draw(rngFromSeed('fall'), 20))
  })

  it('derived streams are independent of each other', () => {
    const a = draw(deriveStream('run-1', 'waves'), 20)
    const b = draw(deriveStream('run-1', 'combat'), 20)
    expect(a).not.toEqual(b)
    expect(a).toEqual(draw(deriveStream('run-1', 'waves'), 20))
  })

  it('never mutates its input state', () => {
    const rng = rngFromSeed('frozen')
    const snapshot = { ...rng }
    nextU32(rng)
    nextInt(rng, 0, 10)
    expect(rng).toEqual(snapshot)
  })

  it('state survives JSON round-trips mid-sequence', () => {
    let r = rngFromSeed('serialize')
    for (let i = 0; i < 17; i++) r = nextU32(r).rng
    const revived = JSON.parse(JSON.stringify(r)) as Rng
    expect(draw(revived, 50)).toEqual(draw(r, 50))
  })

  it('property: nextU32 always yields a uint32', () => {
    fc.assert(
      fc.property(fc.string(), fc.nat(200), (seed, drawsBefore) => {
        let r = rngFromSeed(seed)
        for (let i = 0; i < drawsBefore; i++) r = nextU32(r).rng
        const { value } = nextU32(r)
        return Number.isInteger(value) && value >= 0 && value <= 0xffffffff
      }),
    )
  })

  it('property: nextInt stays within inclusive bounds', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.integer({ min: -1_000_000, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (seed, min, span) => {
          const { value } = nextInt(rngFromSeed(seed), min, min + span)
          return value >= min && value <= min + span
        },
      ),
    )
  })

  it('nextInt covers its full range', () => {
    let r = rngFromSeed('coverage')
    const seen = new Set<number>()
    for (let i = 0; i < 500; i++) {
      const n = nextInt(r, 0, 7)
      seen.add(n.value)
      r = n.rng
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })

  it('rejects invalid ranges', () => {
    expect(() => nextInt(rngFromSeed('x'), 5, 4)).toThrow()
  })
})
