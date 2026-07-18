import type { MetaState } from '../engine/types'

// Biomes: the battlefield layer of run identity. A biome owns the RULES —
// terrain features, generation style, the strategic situation — while the
// run seed owns the STRUCTURE: every run generates a fresh layout inside the
// biome's constraints (src/engine/mapgen.ts). Progression unlocks biomes;
// randomness never repeats a battlefield.

export type BiomeId = 'verdant' | 'frostfen' | 'emberwaste' | 'highlands'

export interface BiomeDef {
  name: string
  description: string // shown in the picker and codex
  unlockHint: string // shown while locked
  // Structure generation knobs (consumed by generateMap).
  rockClusters: [min: number, max: number]
  rockClusterSize: [min: number, max: number]
  marshBlobs: [min: number, max: number] // frostfen: soft ground pools
  marshBlobSize: [min: number, max: number]
  mesaClusters: [min: number, max: number] // highlands: buildable high ground
  mesaClusterSize: [min: number, max: number]
  vents: [min: number, max: number] // emberwaste: eruption fissures
}

export const BIOMES: Record<BiomeId, BiomeDef> = {
  verdant: {
    name: 'Verdant Reach',
    description: 'Open grassland with scattered rock. The baseline battlefield — your maze is what you make.',
    unlockHint: '',
    rockClusters: [4, 8],
    rockClusterSize: [2, 6],
    marshBlobs: [0, 0],
    marshBlobSize: [0, 0],
    mesaClusters: [0, 0],
    mesaClusterSize: [0, 0],
    vents: [0, 0],
  },
  frostfen: {
    name: 'Frostfen',
    description:
      'Half-frozen marshland. Ground enemies wade through the pools at 80% speed — but nothing can be built on soft ground.',
    unlockHint: 'Reach wave 8 in any run',
    rockClusters: [2, 5],
    rockClusterSize: [2, 4],
    marshBlobs: [4, 7],
    marshBlobSize: [3, 8],
    mesaClusters: [0, 0],
    mesaClusterSize: [0, 0],
    vents: [0, 0],
  },
  emberwaste: {
    name: 'Ember Waste',
    description:
      'Scorched ground riven with fissures that erupt every few seconds, searing ground enemies near them. Slag heaps break the open ground — the land fights, and it will not be walled.',
    unlockHint: 'Win a run',
    rockClusters: [4, 7],
    rockClusterSize: [2, 5],
    marshBlobs: [0, 0],
    marshBlobSize: [0, 0],
    mesaClusters: [0, 0],
    mesaClusterSize: [0, 0],
    vents: [3, 5],
  },
  highlands: {
    name: 'The Highlands',
    description:
      'Mesa country. High ground is impassable to the horde but buildable — a tower on a mesa sees 20% further. The overlooks are the battlefield.',
    unlockHint: 'Ascend once',
    rockClusters: [2, 4],
    rockClusterSize: [2, 4],
    marshBlobs: [0, 0],
    marshBlobSize: [0, 0],
    mesaClusters: [3, 6],
    mesaClusterSize: [2, 5],
    vents: [0, 0],
  },
}

export const BIOME_IDS = Object.keys(BIOMES) as BiomeId[]

// Feature numbers (engine-consumed).
export const MARSH_SPEED_PCT = 80 // ground enemies in a pool move at this speed
export const MESA_RANGE_PCT = 120 // a tower on high ground sees this far
export const VENT_PERIOD_TICKS = 90 // eruption every 3s
export const VENT_RADIUS = 1200 // millicells seared around a fissure
export const VENT_DAMAGE_BASE = 2 // scaled by the wave HP curve — tracks ~14% of a runner

// Progression: biomes unlock across the meta ladder. The roll for a new run
// draws from UNLOCKED biomes only; an explicit biome choice (picker, tests)
// may name any biome, and daily runs share one roll across all players.
export function biomeUnlocked(meta: MetaState, id: BiomeId): boolean {
  switch (id) {
    case 'verdant':
      return true
    case 'frostfen':
      return meta.bestWave >= 8
    case 'emberwaste':
      return meta.victories >= 1
    case 'highlands':
      return meta.ascensions >= 1
  }
}

export function unlockedBiomes(meta: MetaState): BiomeId[] {
  return BIOME_IDS.filter((b) => biomeUnlocked(meta, b))
}
