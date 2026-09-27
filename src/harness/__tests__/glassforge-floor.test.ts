import { expect, it } from 'vitest'
import { FLOOR_BIOMES } from './glassforgeFloor'

// Each biome's floor runs in its own glassforge-floor-<biome>.test.ts file.
// A lineage found on a new biome must get a file too.
it('every biome with a discovered lineage has a floor test', () => {
  expect([...FLOOR_BIOMES].sort()).toEqual(['highlands', 'verdant'])
})
