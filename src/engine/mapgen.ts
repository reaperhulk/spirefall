import { BIOMES, type BiomeId } from '../data/biomes'
import { MAP_HEIGHT, MAP_WIDTH, type MapDef } from '../data/maps'
import { blockedGrid, cellIndex, distanceField, getMap } from './grid'
import { nextInt, rngFromSeed, type Rng } from './rng'
import type { CellPos } from './types'

// Seeded battlefield generation: the biome owns the RULES (feature mix,
// density), the seed owns the STRUCTURE. Pure and deterministic — the
// generator draws from its own local stream derived from (seed, biome,
// attempt), so it can never disturb the run's wave/combat/relic streams.

// A generated layout must be playable: gate reaches Spire with no towers,
// and there's enough open ground to actually build a defense.
const MIN_BUILDABLE_CELLS = 160

interface Draw {
  rng: Rng
}

function draw(d: Draw, min: number, max: number): number {
  const r = nextInt(d.rng, min, max)
  d.rng = r.rng
  return r.value
}

// Drop a blob of `size` cells by seeded random walk from a center.
function blob(d: Draw, grid: boolean[], center: CellPos, size: number, forbidden: (c: CellPos) => boolean): void {
  let c = { ...center }
  for (let i = 0; i < size; i++) {
    if (c.cx >= 1 && c.cx < MAP_WIDTH - 1 && c.cy >= 0 && c.cy < MAP_HEIGHT && !forbidden(c)) {
      grid[c.cy * MAP_WIDTH + c.cx] = true
    }
    const dir = draw(d, 0, 3)
    c = {
      cx: c.cx + (dir === 0 ? 1 : dir === 1 ? -1 : 0),
      cy: c.cy + (dir === 2 ? 1 : dir === 3 ? -1 : 0),
    }
  }
}

function attempt(biome: BiomeId, mapSeed: string, salt: number): MapDef {
  const def = BIOMES[biome]
  const d: Draw = { rng: rngFromSeed(`${mapSeed} biome-${biome} ${salt}`) }

  // Gates stay in the CENTER band: a near-edge gate opens a wide flank
  // detour that a gate-anchored early defense cannot cover — fresh runs
  // collapsed at wave ~5 on edge rolls. Rock structure carries the variety.
  const spawn = { cx: 0, cy: draw(d, 5, MAP_HEIGHT - 6) }
  const spire = { cx: MAP_WIDTH - 1, cy: draw(d, 5, MAP_HEIGHT - 6) }
  const size = MAP_WIDTH * MAP_HEIGHT
  const rocks: boolean[] = new Array<boolean>(size).fill(false)
  const marsh: boolean[] = new Array<boolean>(size).fill(false)
  const mesa: boolean[] = new Array<boolean>(size).fill(false)
  const vents: number[] = []

  // Keep the gate mouths open: nothing lands within 2 cells of either.
  const nearGate = (c: CellPos): boolean =>
    (Math.abs(c.cx - spawn.cx) <= 2 && Math.abs(c.cy - spawn.cy) <= 2) ||
    (Math.abs(c.cx - spire.cx) <= 2 && Math.abs(c.cy - spire.cy) <= 2)

  const clusters = draw(d, def.rockClusters[0], def.rockClusters[1])
  for (let i = 0; i < clusters; i++) {
    const center = { cx: draw(d, 2, MAP_WIDTH - 3), cy: draw(d, 1, MAP_HEIGHT - 2) }
    blob(d, rocks, center, draw(d, def.rockClusterSize[0], def.rockClusterSize[1]), nearGate)
  }

  if (def.marshBlobs[1] > 0) {
    const blobs = draw(d, def.marshBlobs[0], def.marshBlobs[1])
    for (let i = 0; i < blobs; i++) {
      const center = { cx: draw(d, 2, MAP_WIDTH - 3), cy: draw(d, 1, MAP_HEIGHT - 2) }
      blob(d, marsh, center, draw(d, def.marshBlobSize[0], def.marshBlobSize[1]), (c) => nearGate(c) || rocks[c.cy * MAP_WIDTH + c.cx]!)
    }
  }

  if (def.mesaClusters[1] > 0) {
    const clusters2 = draw(d, def.mesaClusters[0], def.mesaClusters[1])
    for (let i = 0; i < clusters2; i++) {
      const center = { cx: draw(d, 3, MAP_WIDTH - 4), cy: draw(d, 1, MAP_HEIGHT - 2) }
      blob(d, mesa, center, draw(d, def.mesaClusterSize[0], def.mesaClusterSize[1]), (c) => nearGate(c) || rocks[c.cy * MAP_WIDTH + c.cx]!)
    }
  }

  const map: MapDef = {
    id: -1, // generated maps live outside the fixed registry
    name: BIOMES[biome].name,
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    rocks,
    spawn,
    spire,
    biome,
    marsh,
    mesa,
    vents,
  }

  if (def.vents[1] > 0) {
    const count = draw(d, def.vents[0], def.vents[1])
    for (let i = 0; i < count && vents.length < count; ) {
      const c = { cx: draw(d, 4, MAP_WIDTH - 5), cy: draw(d, 1, MAP_HEIGHT - 2) }
      const idx = cellIndex(map, c)
      i++
      if (!rocks[idx] && !mesa[idx] && !nearGate(c) && !vents.includes(idx)) vents.push(idx)
    }
  }

  return map
}

function playable(map: MapDef): boolean {
  const field = distanceField(map, blockedGrid(map, []))
  if (field[cellIndex(map, map.spawn)] === -1) return false
  let buildable = 0
  for (let i = 0; i < map.rocks.length; i++) {
    if (!map.rocks[i] && !map.marsh[i]) buildable += 1
  }
  return buildable >= MIN_BUILDABLE_CELLS
}

export function generateMap(biome: BiomeId, mapSeed: string): MapDef {
  for (let salt = 0; salt < 8; salt++) {
    const map = attempt(biome, mapSeed, salt)
    if (playable(map)) return map
  }
  // Statistically unreachable (8 independent rolls), but the engine never
  // throws mid-run: fall back to a bare, always-playable field.
  const fallback = attempt(biome, mapSeed, 0)
  fallback.rocks.fill(false)
  fallback.mesa.fill(false)
  fallback.marsh.fill(false)
  fallback.vents.length = 0
  return fallback
}

// Authored strategic structures over seeded biome detail. Broad openings
// retain build freedom; failed combinations fall back to the original roll.
export function authoredMap(biome: BiomeId, seed: string): MapDef {
  const map = generateMap(biome, seed)
  const original = map.rocks.slice()
  const pattern = nextInt(rngFromSeed(`${seed}:structure`), 0, 2).value
  for (let y = 1; y < map.height - 1; y++) {
    if (pattern === 0) {
      if (y < 8) map.rocks[y * map.width + 9] = true
      if (y > 5) map.rocks[y * map.width + 16] = true
    } else if (pattern === 1) {
      if (y < 5 || y > 9) map.rocks[y * map.width + 12] = true
    } else if (y > 4 && y < 10) {
      map.rocks[y * map.width + 12] = true
      map.mesa[y * map.width + 10] = !map.marsh[y * map.width + 10]
    }
  }
  if (!playable(map)) map.rocks = original
  return map
}

// Six recognizable tactical situations. Terrain is versioned independently
// of random streams, so imported runs never silently receive a new maze.
export function tacticalMap(biome: BiomeId, seed: string): MapDef {
  const pattern = nextInt(rngFromSeed(`${seed}:tactics`), 0, 5).value
  const map = pattern < 3 ? authoredMap(biome, seed) : generateMap(biome, seed)
  const original = { rocks: map.rocks.slice(), mesa: map.mesa.slice(), marsh: map.marsh.slice() }
  const situations = [
    ['Broken ramparts', 'Use the gaps as firing lanes; reserve a rear line for fliers.'],
    ['The watchroad', 'Choose which bend to fortify, then cover the exposed final approach.'],
    ['Old fort', 'Use the central fort as an anchor; leave room for splash coverage.'],
    ['Forked causeway', 'A central island creates two approaches. Your placements decide which remains open.'],
    ['Twin overlooks', 'Build on raised ground at both ends to cover the entrance and protect the Spire.'],
    ['The sluice', 'Staggered baffles create repeated firing windows; spread control between turns.'],
  ]
  const set = (x: number, y: number, raised = false) => {
    const n = y * map.width + x
    map.rocks[n] = !raised; map.mesa[n] = raised; map.marsh[n] = false
  }
  if (pattern === 3) {
    for (let x = 10; x <= 13; x++) for (let y = 5; y <= 8; y++) set(x, y)
    set(8, 4, true); set(15, 9, true)
  } else if (pattern === 4) {
    for (const x of [6, 17]) for (const y of [3, 4, 9, 10]) set(x, y, true)
  } else if (pattern === 5) {
    for (let y = 3; y <= 7; y++) set(8, y)
    for (let y = 7; y <= 11; y++) set(16, y)
  }
  if (!playable(map)) Object.assign(map, original)
  map.situation = situations[pattern]![0]!
  map.tactic = situations[pattern]![1]!
  return map
}

// The run's battlefield. Generated maps are pure functions of (biome, seed),
// memoized because callers ask every tick; legacy saves (mapSeed === '')
// still resolve through the fixed-map registry.
const genCache = new Map<string, MapDef>()

export function getRunMap(s: { mapId: number; biome: BiomeId; mapSeed: string; layoutVersion?: number }): MapDef {
  if (s.mapSeed === '') return getMap(s.mapId)
  const key = `${s.layoutVersion ?? 1}:${s.biome}:${s.mapSeed}`
  let map = genCache.get(key)
  if (!map) {
    map = s.layoutVersion === 3 ? tacticalMap(s.biome, s.mapSeed) : s.layoutVersion === 2 ? authoredMap(s.biome, s.mapSeed) : generateMap(s.biome, s.mapSeed)
    if (genCache.size > 64) genCache.clear() // long sessions: bots churn seeds
    genCache.set(key, map)
  }
  return map
}
