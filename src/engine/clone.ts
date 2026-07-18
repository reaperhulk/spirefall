import type { RunState } from './types'

// Cheap deep clone of RunState (much faster than structuredClone, which
// matters when bots simulate hundreds of thousands of ticks in CI).
export function cloneRun(s: RunState): RunState {
  return {
    ...s,
    rng: {
      waves: { ...s.rng.waves },
      combat: { ...s.rng.combat },
      relics: { ...s.rng.relics },
      boons: { ...s.rng.boons },
    },
    towers: s.towers.map((t) => ({ ...t, cell: { ...t.cell } })),
    enemies: s.enemies.map((e) => ({
      ...e,
      pos: { ...e.pos },
      targetCell: e.targetCell ? { ...e.targetCell } : null,
    })),
    pendingSpawns: s.pendingSpawns.map((p) => ({ ...p })),
    abilities: { ...s.abilities },
    relics: [...s.relics],
    cataclysms: [...s.cataclysms],
    trials: [...s.trials],
    damageByTower: { ...s.damageByTower },
    hpByWave: [...s.hpByWave],
    repairsThisWave: s.repairsThisWave,
    killsByEnemy: { ...s.killsByEnemy },
    relicOffer: s.relicOffer ? [...s.relicOffer] : null,
    cataclysmOffer: s.cataclysmOffer ? [...s.cataclysmOffer] : null,
    boonOffer: s.boonOffer ? [...s.boonOffer] : null,
    availableTowers: [...s.availableTowers],
    mods: { ...s.mods },
  }
}
