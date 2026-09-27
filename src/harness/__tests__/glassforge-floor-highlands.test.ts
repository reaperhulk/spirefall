import { expect, it } from 'vitest'
import { checkGlassforgeFloor, FLOOR_BIOMES } from './glassforgeFloor'

it('the discovered highlands lineages satisfy both same-build and independent-build 5k boundaries', async () => {
  expect(FLOOR_BIOMES).toContain('highlands')
  await checkGlassforgeFloor('highlands')
}, 240000)
