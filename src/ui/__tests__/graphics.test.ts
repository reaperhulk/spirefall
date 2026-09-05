import { expect, it } from 'vitest'
import { AdaptiveResolution, backingScale } from '../graphics'
it('backs the actual displayed field and caps retina resolution consistently', () => {
  expect(backingScale(390,816,3,'high')).toBeCloseTo(780/816)
  expect(backingScale(390,816,3,'low')).toBeCloseTo(390/816)
  expect(backingScale(816,816,4,'auto',0.75)).toBe(1.5)
})
it('reduces resolution under sustained load and requires three healthy windows to recover', () => {
  const quality = new AdaptiveResolution()
  for (let i=0;i<120;i++) quality.sample(20)
  expect(quality.scale).toBe(0.75)
  for (let i=0;i<240;i++) quality.sample(3)
  expect(quality.scale).toBe(0.75)
  for (let i=0;i<120;i++) quality.sample(3)
  expect(quality.scale).toBe(1)
})
