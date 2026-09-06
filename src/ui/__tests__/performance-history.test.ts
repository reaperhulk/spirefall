import { expect, it } from 'vitest'
import { measure, performanceReport, resetPerformance } from '../performance'
it('reports only the latest 512 samples after repeated wraparound and clears every metric', () => {
  resetPerformance()
  for(let i=0;i<2048;i++) measure('frame',i)
  measure('input',7)
  expect(performanceReport().frame).toEqual({samples:512,p50:1792,p95:2022,p99:2042})
  expect(performanceReport().input).toEqual({samples:1,p50:7,p95:7,p99:7})
  resetPerformance();expect(performanceReport()).toEqual({})
})
