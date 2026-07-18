import { BIOME_IDS } from './biomes'
import type { MetaState, RunState } from '../engine/types'

// Achievements: one-shot goals checked when a run settles. Pure predicates
// over the finished run (and prior meta), each paying a spark bounty on the
// run that first earns it.

export interface AchievementDef {
  id: string
  name: string
  description: string
  sparks: number
  earned: (run: RunState, meta: MetaState) => boolean
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first_blood',
    name: 'First Blood',
    description: 'Finish a run with at least one kill.',
    sparks: 25,
    earned: (run) => run.kills > 0,
  },
  {
    id: 'wave_10',
    name: 'Holding the Line',
    description: 'Clear wave 10 in a single run.',
    sparks: 50,
    earned: (run) => run.wavesCleared >= 10,
  },
  {
    id: 'wave_15',
    name: 'Deep Defense',
    description: 'Clear wave 15 in a single run.',
    sparks: 100,
    earned: (run) => run.wavesCleared >= 15,
  },
  {
    id: 'wave_20',
    name: 'The Long Watch',
    description: 'Clear wave 20 in a single run.',
    sparks: 200,
    earned: (run) => run.wavesCleared >= 20,
  },
  {
    id: 'first_victory',
    name: 'The Cycle Breaks',
    description: 'Win a run.',
    sparks: 300,
    earned: (run) => run.victoryClaimed,
  },
  {
    id: 'horde_slayer',
    name: 'Horde Slayer',
    description: '500 kills in a single run.',
    sparks: 100,
    earned: (run) => run.kills >= 500,
  },
  {
    id: 'collector',
    name: 'Collector',
    description: 'Hold five relics at once.',
    sparks: 100,
    earned: (run) => run.relics.length >= 5,
  },
  {
    id: 'stormrider',
    name: 'Stormrider',
    description: 'Survive two Cataclysm strikes in one endless run.',
    sparks: 250,
    earned: (run) => run.cataclysms.length >= 2,
  },
  {
    id: 'tempered',
    name: 'Tempered',
    description: 'Win a run with a Trial active.',
    sparks: 300,
    earned: (run) => run.victoryClaimed && run.trials.length > 0,
  },
  {
    id: 'wave_30',
    name: 'Beyond the Break',
    description: 'Clear wave 30 in a single endless run.',
    sparks: 250,
    earned: (run) => run.wavesCleared >= 30,
  },
  {
    id: 'wave_40',
    name: 'Eye of the Storm',
    description: 'Clear wave 40 in a single endless run.',
    sparks: 400,
    earned: (run) => run.wavesCleared >= 40,
  },
  {
    id: 'cataclysm_1',
    name: 'Into the Dark',
    description: 'Survive your first Cataclysm in an endless run.',
    sparks: 150,
    earned: (run) => run.cataclysms.length >= 1,
  },
  {
    id: 'cataclysm_3',
    name: 'Storm-Sworn',
    description: 'Endure three stacked Cataclysms in one run.',
    sparks: 300,
    earned: (run) => run.cataclysms.length >= 3,
  },
  {
    id: 'cataclysm_6',
    name: 'World-Ender',
    description: 'Endure six stacked Cataclysms in one run.',
    sparks: 600,
    earned: (run) => run.cataclysms.length >= 6,
  },
  {
    id: 'worldwalker',
    name: 'Worldwalker',
    description: 'Win a run in every biome.',
    sparks: 500,
    earned: (run, meta) =>
      BIOME_IDS.every((b) => {
        const best = meta.bestWaveByMap[b] ?? 0
        const withThisRun = run.mapSeed !== '' && run.biome === b ? Math.max(best, run.wavesCleared) : best
        return withThisRun >= 24
      }),
  },
  {
    id: 'ascendant',
    name: 'Ascendant',
    description: 'Ascend for the first time.',
    sparks: 0, // the embers are the reward
    earned: (_run, meta) => meta.ascensions > 0,
  },
  {
    id: 'committed',
    name: 'Committed',
    description: 'Field three specialized (tier-3 path) towers in one run.',
    sparks: 150,
    earned: (run) => run.towers.filter((t) => t.spec !== null).length >= 3,
  },
  {
    id: 'unbroken',
    name: 'Unbroken',
    description: 'Win under the No Mercy trial — the Spire never repaired.',
    sparks: 400,
    earned: (run) => run.victoryClaimed && run.trials.includes('no_mercy'),
  },
  {
    id: 'crucible_3',
    name: 'Thrice-Forged',
    description: 'Win at Crucible rank 3 or higher.',
    sparks: 350,
    earned: (run) => run.victoryClaimed && run.crucible >= 3,
  },
  {
    id: 'perfect_cycle',
    name: 'Not One Stone',
    description: 'Win with the Spire at full health.',
    sparks: 300,
    earned: (run) => run.victoryClaimed && run.spireHp >= run.spireMaxHp,
  },
]
