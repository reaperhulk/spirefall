import { expect, it } from 'vitest'
import { checkGlassforgeFloor, FLOOR_BIOMES } from './glassforgeFloor'

it('the discovered verdant lineages satisfy both same-build and independent-build 5k boundaries', async () => {
  expect(FLOOR_BIOMES).toContain('verdant')
  await checkGlassforgeFloor('verdant')
}, 240000)
