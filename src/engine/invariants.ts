import { getMap, cellIndex, inBounds, sameCell } from './grid'
import type { Rng } from './rng'
import type { RunState } from './types'

// Structural truths that must hold in every reachable state, no matter what
// commands or seeds produced it. The property suite hammers these with random
// inputs; the harness can also run them after every tick in dev builds.
export function assertInvariants(state: RunState): void {
  assertFiniteNumbers(state, 'state')
  const map = getMap(state.mapId)

  check(Number.isInteger(state.tick) && state.tick >= 0, `tick must be a non-negative integer, got ${state.tick}`)
  check(Number.isInteger(state.wave) && state.wave >= 0, `wave must be a non-negative integer, got ${state.wave}`)
  check(
    Number.isInteger(state.wavesCleared) && state.wavesCleared >= 0 && state.wavesCleared <= state.wave,
    `wavesCleared must be in [0, wave], got ${state.wavesCleared} (wave ${state.wave})`,
  )
  check(Number.isInteger(state.gold) && state.gold >= 0, `gold must be a non-negative integer, got ${state.gold}`)
  check(Number.isInteger(state.kills) && state.kills >= 0, `kills must be non-negative, got ${state.kills}`)
  check(
    Number.isInteger(state.spireHp) && state.spireHp >= 0 && state.spireHp <= state.spireMaxHp,
    `spireHp must be in [0, ${state.spireMaxHp}], got ${state.spireHp}`,
  )
  check(state.sparksEarned >= 0, `sparksEarned must be non-negative, got ${state.sparksEarned}`)
  check(
    ['build', 'wave', 'defeat', 'victory'].includes(state.phase),
    `unknown phase ${String(state.phase)}`,
  )
  check(state.phase !== 'defeat' || state.spireHp === 0, 'defeat requires a fallen spire')

  // Entities
  const ids = new Set<number>()
  for (const t of state.towers) {
    check(!ids.has(t.id), `duplicate entity id ${t.id}`)
    ids.add(t.id)
    check(t.id < state.nextEntityId, `tower id ${t.id} >= nextEntityId`)
    check(inBounds(map, t.cell), `tower ${t.id} out of bounds`)
    check(!map.rocks[cellIndex(map, t.cell)], `tower ${t.id} on a rock`)
    check(!sameCell(t.cell, map.spawn) && !sameCell(t.cell, map.spire), `tower ${t.id} on gate/spire`)
    check(t.cooldown >= 0 && Number.isInteger(t.cooldown), `tower ${t.id} negative cooldown`)
    check(t.tier >= 1 && t.tier <= 3, `tower ${t.id} bad tier ${t.tier}`)
    check(Number.isInteger(t.enhance) && t.enhance >= 0, `tower ${t.id} bad enhance ${t.enhance}`)
    check(t.enhance === 0 || t.tier === 3, `tower ${t.id} enhanced before tier 3`)
    check(Number.isInteger(t.kills) && t.kills >= 0, `tower ${t.id} bad kills ${t.kills}`)
    check(Number.isInteger(t.damageDealt) && t.damageDealt >= 0, `tower ${t.id} bad damageDealt`)
  }
  const towerCells = new Set(state.towers.map((t) => cellIndex(map, t.cell)))
  check(towerCells.size === state.towers.length, 'two towers share a cell')

  for (const e of state.enemies) {
    check(!ids.has(e.id), `duplicate entity id ${e.id}`)
    ids.add(e.id)
    check(e.id < state.nextEntityId, `enemy id ${e.id} >= nextEntityId`)
    check(e.hp > 0 && e.hp <= e.maxHp, `enemy ${e.id} hp ${e.hp} out of (0, ${e.maxHp}]`)
    check(
      e.pos.x >= 0 && e.pos.x <= map.width * 1000 && e.pos.y >= 0 && e.pos.y <= map.height * 1000,
      `enemy ${e.id} out of the world at ${e.pos.x},${e.pos.y}`,
    )
    check(e.slowFactor >= 1 && e.slowFactor <= 100, `enemy ${e.id} slowFactor ${e.slowFactor}`)
    check(e.slowTicks >= 0, `enemy ${e.id} negative slowTicks`)
  }

  // Enemy ids strictly increase with array position (stable iteration order).
  for (let i = 1; i < state.enemies.length; i++) {
    check(state.enemies[i]!.id > state.enemies[i - 1]!.id, 'enemy array not in spawn order')
  }

  for (const p of state.pendingSpawns) {
    check(Number.isInteger(p.tick), 'pendingSpawn tick must be an integer')
  }
  check(
    state.pendingSpawns.length === 0 || state.phase === 'wave',
    'pendingSpawns outside of a wave',
  )

  for (const [ability, cd] of Object.entries(state.abilities)) {
    check(Number.isInteger(cd) && cd >= 0, `ability ${ability} cooldown ${cd}`)
  }

  check(new Set(state.relics).size === state.relics.length, 'duplicate relics')
  if (state.relicOffer !== null) {
    check(state.relicOffer.length > 0, 'empty relic offer')
    check(state.phase === 'build', 'relic offer outside build phase')
    for (const r of state.relicOffer) check(!state.relics.includes(r), `offered relic ${r} already owned`)
  }

  const streams: [string, Rng][] = [
    ['waves', state.rng.waves],
    ['combat', state.rng.combat],
    ['relics', state.rng.relics],
  ]
  for (const [name, rng] of streams) {
    for (const word of ['a', 'b', 'c', 'd'] as const) {
      const value = rng[word]
      check(
        Number.isInteger(value) && value >= 0 && value <= 0xffffffff,
        `rng.${name}.${word} must be a uint32, got ${value}`,
      )
    }
  }
}

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(`invariant violated: ${message}`)
}

function assertFiniteNumbers(value: unknown, path: string): void {
  if (typeof value === 'number') {
    check(Number.isFinite(value), `${path} must be finite, got ${value}`)
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => assertFiniteNumbers(v, `${path}[${i}]`))
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) assertFiniteNumbers(v, `${path}.${k}`)
  }
}
