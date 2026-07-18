import { describe, expect, it } from 'vitest'
import { BIOME_IDS, MARSH_SPEED_PCT, MESA_RANGE_PCT, VENT_DAMAGE_BASE, VENT_PERIOD_TICKS } from '../../data/biomes'
import { MAP_HEIGHT, MAP_WIDTH, type MapDef } from '../../data/maps'
import { moveEnemies, towersFire } from '../combat'
import { blockedGrid, canPlaceTower, cellCenter, cellIndex, distanceField } from '../grid'
import { generateMap, getRunMap } from '../mapgen'
import { createMeta, createRun } from '../meta'
import { step } from '../step'
import { assertInvariants } from '../invariants'
import type { Enemy, GameEvent, RunState, Tower } from '../types'

// Battlefield generation and the three biome terrain features. The generator
// is pure: every assertion here is exact.

function openMap(overrides: Partial<MapDef> = {}): MapDef {
  const size = MAP_WIDTH * MAP_HEIGHT
  return {
    id: -1,
    name: 'Test Field',
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    rocks: new Array<boolean>(size).fill(false),
    spawn: { cx: 0, cy: 6 },
    spire: { cx: 23, cy: 6 },
    biome: 'verdant',
    marsh: new Array<boolean>(size).fill(false),
    mesa: new Array<boolean>(size).fill(false),
    vents: [],
    ...overrides,
  }
}

function enemy(overrides: Partial<Enemy> & { id: number }): Enemy {
  return {
    type: 'runner',
    pos: cellCenter({ cx: 5, cy: 6 }),
    hp: 50,
    maxHp: 50,
    speed: 100,
    slowFactor: 100,
    slowTicks: 0,
    bounty: 3,
    damage: 2,
    shield: 0,
    armor: 0,
    healCooldown: 0,
    broodCooldown: 0,
    phased: false,
    phaseCooldown: 0,
    burnTicks: 0,
    burnPerTick: 0,
    overcharge: 0,
    mechCooldown: 0,
    mechActiveTicks: 0,
    brittleTicks: 0,
    targetCell: null,
    ...overrides,
  }
}

function tower(overrides: Partial<Tower> = {}): Tower {
  return {
    id: 100,
    type: 'arrow',
    tier: 1,
    spec: null,
    enhance: 0,
    cell: { cx: 5, cy: 5 },
    cooldown: 0,
    targeting: 'nearest',
    kills: 0,
    damageDealt: 0,
    shots: 0,
    ...overrides,
  }
}

function waveState(): RunState {
  const s = createRun(createMeta(), 'biome-lab')
  s.phase = 'wave'
  s.wave = 3
  return s
}

describe('battlefield generation', () => {
  it('is deterministic: same biome and seed, identical structure', () => {
    for (const biome of BIOME_IDS) {
      expect(generateMap(biome, 'twin')).toEqual(generateMap(biome, 'twin'))
    }
    // Different seeds diverge (staying identical would mean the seed is dead).
    expect(generateMap('verdant', 'a')).not.toEqual(generateMap('verdant', 'b'))
  })

  it('every generated battlefield is playable, across biomes and many seeds', () => {
    for (const biome of BIOME_IDS) {
      for (let i = 0; i < 40; i++) {
        const map = generateMap(biome, `sweep-${i}`)
        const field = distanceField(map, blockedGrid(map, []))
        expect(field[cellIndex(map, map.spawn)], `${biome} sweep-${i}: gate cut off`).not.toBe(-1)
        let buildable = 0
        for (let c = 0; c < map.rocks.length; c++) if (!map.rocks[c] && !map.marsh[c]) buildable += 1
        expect(buildable, `${biome} sweep-${i}: too little open ground`).toBeGreaterThanOrEqual(160)
      }
    }
  })

  it('biomes actually field their features', () => {
    let marsh = 0
    let mesa = 0
    let vents = 0
    for (let i = 0; i < 10; i++) {
      marsh += generateMap('frostfen', `f-${i}`).marsh.filter(Boolean).length
      mesa += generateMap('highlands', `h-${i}`).mesa.filter(Boolean).length
      vents += generateMap('emberwaste', `e-${i}`).vents.length
    }
    expect(marsh).toBeGreaterThan(0)
    expect(mesa).toBeGreaterThan(0)
    expect(vents).toBeGreaterThan(0)
    // And verdant fields none of them.
    const v = generateMap('verdant', 'plain')
    expect(v.marsh.filter(Boolean).length + v.mesa.filter(Boolean).length + v.vents.length).toBe(0)
  })

  it('a full biome run steps cleanly under invariants', () => {
    for (const biome of BIOME_IDS) {
      let s = createRun(createMeta(), `inv-${biome}`, biome)
      const r = step(s, [{ type: 'start_wave' }])
      s = r.state
      for (let i = 0; i < 200; i++) s = step(s, []).state
      assertInvariants(s)
    }
  })
})

describe('biome terrain features', () => {
  it('marsh drags ground enemies to 80% speed — fliers skim it', () => {
    const map = openMap()
    map.marsh[cellIndex(map, { cx: 5, cy: 6 })] = true
    const s = waveState()
    const wader = enemy({ id: 1 }) // standing in the pool at (5,6)
    const walker = enemy({ id: 2, pos: cellCenter({ cx: 5, cy: 2 }) }) // dry ground
    const flier = enemy({ id: 3, type: 'flier', speed: 100 }) // over the pool
    s.enemies = [wader, walker, flier]
    const before = s.enemies.map((e) => ({ x: e.pos.x, y: e.pos.y }))
    const field = distanceField(map, blockedGrid(map, []))
    moveEnemies(s, map, field, [])
    const moved = (i: number) => Math.abs(s.enemies[i]!.pos.x - before[i]!.x) + Math.abs(s.enemies[i]!.pos.y - before[i]!.y)
    expect(moved(1)).toBe(100) // dry: full budget
    expect(moved(0)).toBe(Math.floor((100 * MARSH_SPEED_PCT) / 100)) // wading: 80
    expect(moved(2)).toBe(100) // flying: untouched
  })

  it('mesas block the horde but hold towers, and grant them reach', () => {
    const map = openMap()
    const mesaCell = { cx: 8, cy: 6 }
    map.mesa[cellIndex(map, mesaCell)] = true
    // Impassable to enemies...
    expect(blockedGrid(map, [])[cellIndex(map, mesaCell)]).toBe(1)
    // ...but buildable.
    const s = waveState()
    expect(canPlaceTower(s, map, mesaCell).ok).toBe(true)
    // Range: arrow tier 1 reaches 2800; a target at 3.2 cells is out of reach
    // from the flats but INSIDE the 20% high-ground bonus (3360).
    const target = enemy({ id: 1, pos: { x: cellCenter(mesaCell).x + 3200, y: cellCenter(mesaCell).y } })
    s.enemies = [target]
    s.towers = [tower({ cell: mesaCell })]
    const events: GameEvent[] = []
    towersFire(s, map, distanceField(map, blockedGrid(map, s.towers)), events)
    expect(target.hp).toBe(50 - 7) // hit — the mesa saw further
    expect(Math.floor((2800 * MESA_RANGE_PCT) / 100)).toBe(3360)

    const flat = waveState()
    const target2 = enemy({ id: 1, pos: { x: cellCenter(mesaCell).x + 3200, y: cellCenter(mesaCell).y } })
    flat.enemies = [target2]
    flat.towers = [tower({ cell: mesaCell })]
    const noMesa = openMap()
    towersFire(flat, noMesa, distanceField(noMesa, blockedGrid(noMesa, flat.towers)), [])
    expect(target2.hp).toBe(50) // same shot from ground level: out of range
  })

  it('vents erupt on their period and sear ground enemies near the fissure', () => {
    // A real generated Ember Waste battlefield, driven through step().
    let s = createRun(createMeta(), 'vent-lab', 'emberwaste')
    const map = getRunMap(s)
    expect(map.vents.length).toBeGreaterThan(0)
    s = step(s, [{ type: 'start_wave' }]).state
    // Park an enemy exactly on the first vent (state surgery — the pending
    // wave is irrelevant; spawns land far away at the gate).
    const ventCell = { cx: map.vents[0]! % map.width, cy: Math.floor(map.vents[0]! / map.width) }
    s.enemies.push(enemy({ id: 9999, pos: cellCenter(ventCell), speed: 0, hp: 500, maxHp: 500 }))
    const damage = Math.max(1, Math.floor((VENT_DAMAGE_BASE * s.hpScalePct) / 100))
    let erupted = false
    for (let i = 0; i < VENT_PERIOD_TICKS + 1; i++) {
      const victim = s.enemies.find((e) => e.id === 9999)!
      const before = victim.hp
      const r = step(s, [])
      s = r.state
      if (r.events.some((e) => e.type === 'vents_erupted')) {
        erupted = true
        expect(before - s.enemies.find((e) => e.id === 9999)!.hp).toBe(damage)
        break
      }
    }
    expect(erupted).toBe(true)
  })
})
