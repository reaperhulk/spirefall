import { expect, it } from 'vitest'
import { createMeta, createRun } from '../meta'
import { authoredMap, getRunMap } from '../mapgen'
import { blockedGrid, cellIndex, distanceField } from '../grid'
import { bossForWave, generateWave } from '../waves'
import { deriveStream } from '../rng'
import { step } from '../step'
import { BIOME_IDS } from '../../data/biomes'

it('Daily mode snapshots identical rules regardless of account or custom trial arguments', () => {
  const fresh = createMeta()
  const veteran = { ...fresh, upgrades: { tower_damage: 8, spire_hp: 10 }, cycleVictories: 12, ascensions: 4, emberUpgrades: { eternal_core: 3 } }
  expect(createRun(veteran, 'daily-2026-09-05', 'frostfen', ['famine'])).toEqual(createRun(fresh, 'daily-2026-09-05'))
  expect(veteran.cycleVictories).toBe(12)
})
it('four act guardians culminate in the Sovereign and preserve the endless roster', () => {
  expect([6,12,18,24].map(bossForWave)).toEqual(['boss','boss2','boss3','boss_final'])
  expect(bossForWave(10)).toBeNull()
  expect(bossForWave(60)).toBe('boss6')
  expect(generateWave(deriveStream('finale','waves'),24,3000).spawns[0]!.type).toBe('boss_final')
})
it('authored map structures remain connected across held-out seeds and biomes', () => {
  for (const biome of BIOME_IDS) for (let n = 0; n < 40; n++) {
    const map = authoredMap(biome, `structure-holdout-${n}`)
    const field = distanceField(map, blockedGrid(map, []))
    expect(field[cellIndex(map, map.spawn)]).toBeGreaterThan(0)
    expect(map.rocks.filter(Boolean).length).toBeLessThan(100)
  }
})
it('legacy map snapshots keep their original geography', () => {
  const run = createRun(createMeta(), 'legacy-map')
  const legacy = { ...run, layoutVersion: 1 }
  expect(getRunMap(legacy)).not.toBe(getRunMap(run))
  expect(getRunMap(JSON.parse(JSON.stringify(legacy)))).toBe(getRunMap(legacy))
})
it('shrines are opt-in and require remote defense to pay', () => {
  let s = createRun(createMeta(), 'shrine')
  s.wave = 4; s.phase = 'wave'
  s = step(s, []).state
  expect(s.shrine?.status).toBe('offered')
  s = step(s, [{ type: 'defend_shrine' }]).state
  expect(s.shrine?.status).toBe('active')
  s.phase = 'wave'; s.wave = 5
  s = step(s, []).state
  expect(s.shrine?.status).toBe('lost') // cannot farm the reward with an empty backfield
})
it('new keystones carry their stated tradeoffs into the run', () => {
  const meta = createMeta()
  const patron = createRun({ ...meta, upgrades: { ks_patron: 1 } }, 'patron')
  expect(patron.mods.goldPct).toBe(25)
  expect(patron.mods.damagePct).toBe(-10)
  const conductor = createRun({ ...meta, upgrades: { ks_conductor: 1 } }, 'conductor')
  expect(conductor.mods.overchargeCdPct).toBe(20)
  expect(conductor.mods.executeCdPct).toBe(-15)
})
