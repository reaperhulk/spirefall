import type { MapDef } from '../data/maps'
import {
  ABILITIES,
  ARROW_AIR_BONUS_PCT,
  CRIT_BASE_DAMAGE_PCT,
  CRIT_RELIC_CHANCE_PCT,
  CRIT_RELIC_DAMAGE_PCT,
  ENEMIES,
  ENHANCE_DAMAGE_PCT,
  FORTUNE_IDOL_CHANCE_PCT,
  GLASS_CANNON_PCT,
  PIERCING_ARROWS_PCT,
  SNIPER_ELITE_BONUS_PCT,
  TESLA_CHAIN_RANGE,
  TOWERS,
  towerTier,
} from '../data/content'
import { blockedGrid, cellCenter, cellIndex, cellOf, distSq, nextCell, sameCell } from './grid'
import { nextInt } from './rng'
import type { AbilityId, CellPos, Enemy, GameEvent, RunState, Tower } from './types'
import { scaledHp } from './waves'

// All functions in this file mutate a draft RunState that step() has already
// cloned — mutation never escapes the step boundary.

export function effectiveDamagePct(state: RunState, tower: Tower['type']): number {
  let pct = 100 + state.mods.damagePct
  if (tower === 'arrow' && state.relics.includes('piercing_arrows')) pct += PIERCING_ARROWS_PCT
  if (state.relics.includes('glass_cannon')) pct += GLASS_CANNON_PCT
  // Stacked Dampening cataclysms can drive mods negative; towers never go
  // below a tenth of their base output.
  return Math.max(10, pct)
}

export interface DamagePart {
  source: string
  pct: number
}

// Itemized version of the damage math the towers actually use, for UI
// display: base tier damage plus every multiplier and where it comes from.
// A test pins this to effectiveDamagePct so the two can never drift.
export function damageBreakdown(
  state: RunState,
  tower: Tower,
): { base: number; parts: DamagePart[]; totalPct: number; effective: number } {
  const base = towerTier(tower.type, tower.tier).damage
  const parts: DamagePart[] = []
  if (state.mods.damagePct > 0) parts.push({ source: 'Honed Arsenal (Spire Tree)', pct: state.mods.damagePct })
  else if (state.mods.damagePct < 0) parts.push({ source: 'Dampening Field (cataclysm)', pct: state.mods.damagePct })
  if (tower.type === 'arrow' && state.relics.includes('piercing_arrows'))
    parts.push({ source: 'Piercing Arrows (relic)', pct: PIERCING_ARROWS_PCT })
  if (state.relics.includes('glass_cannon')) parts.push({ source: 'Glass Cannon (relic)', pct: GLASS_CANNON_PCT })
  if (tower.enhance > 0) parts.push({ source: `Enhance +${tower.enhance}`, pct: ENHANCE_DAMAGE_PCT * tower.enhance })
  const totalPct = 100 + parts.reduce((sum, p) => sum + p.pct, 0)
  return { base, parts, totalPct, effective: Math.floor((base * totalPct) / 100) }
}

// The probability layer: crit chance comes from the meta tree and relics,
// crit damage starts at double and relics push it further. Rolls happen on
// the combat stream — and only when the chance is nonzero, so runs without
// any crit investment never touch the stream at all.
export function effectiveCritChancePct(state: RunState): number {
  let pct = state.mods.critChancePct
  if (state.relics.includes('keen_sights')) pct += CRIT_RELIC_CHANCE_PCT
  return Math.min(100, pct)
}

export function effectiveCritDamagePct(state: RunState): number {
  let pct = CRIT_BASE_DAMAGE_PCT
  if (state.relics.includes('executioners_seal')) pct += CRIT_RELIC_DAMAGE_PCT
  return pct
}

export function applyHit(enemy: Enemy, damage: number, pierceShield = false): number {
  if (!pierceShield && damage <= enemy.shield) return 0 // shieldbearers ignore weak hits entirely
  const dealt = Math.min(enemy.hp, damage)
  enemy.hp -= dealt
  return dealt
}

// Target-dependent damage bonus: the single-target towers' niche.
function bonusPctVs(tower: Tower['type'], enemy: Enemy): number {
  if (tower === 'arrow' && ENEMIES[enemy.type].flying) return ARROW_AIR_BONUS_PCT
  if (tower === 'sniper' && ENEMIES[enemy.type].elite) return SNIPER_ELITE_BONUS_PCT
  return 0
}

function applySlow(enemy: Enemy, slowFactor: number, slowTicks: number, state: RunState): void {
  let factor = slowFactor
  if (state.relics.includes('winters_grip')) factor = Math.max(20, factor - 15)
  const current = enemy.slowTicks > 0 ? enemy.slowFactor : 100
  enemy.slowFactor = Math.min(current, factor) // strongest slow wins
  enemy.slowTicks = Math.max(enemy.slowTicks, slowTicks) // longest duration wins
}

// ---------------------------------------------------------------------------
// Movement

// Enemies walk cell-center to cell-center along the flow field. Movement is
// axis-by-axis (x then y) so re-pathing mid-transit stays well-defined.
export function moveEnemies(state: RunState, map: MapDef, field: Int32Array, events: GameEvent[]): void {
  const blocked = blockedGrid(map, state.towers)
  const arrived: number[] = []

  for (const enemy of state.enemies) {
    let budget = enemy.slowTicks > 0 ? Math.max(1, Math.floor((enemy.speed * enemy.slowFactor) / 100)) : enemy.speed

    // Fliers ignore the maze entirely: straight for the spire, over
    // everything. Only air-capable towers can touch them.
    if (ENEMIES[enemy.type].flying) {
      const target = cellCenter(map.spire)
      const dx = target.x - enemy.pos.x
      const dy = target.y - enemy.pos.y
      const need = Math.abs(dx) + Math.abs(dy)
      if (need <= budget) {
        enemy.pos = target
        arrived.push(enemy.id)
      } else {
        const moveX = Math.min(Math.abs(dx), budget) * Math.sign(dx)
        enemy.pos.x += moveX
        const rest = budget - Math.abs(moveX)
        enemy.pos.y += Math.min(Math.abs(dy), rest) * Math.sign(dy)
      }
      continue
    }

    // Standing on the spire cell IS arrival — enemies hatched or split
    // right on top of it have no waypoint to walk toward and would
    // otherwise stand there forever, stalling the wave.
    if (sameCell(cellOf(enemy.pos), map.spire)) {
      arrived.push(enemy.id)
      continue
    }

    // Re-path if we have no waypoint or ours was built over.
    if (enemy.targetCell !== null && blocked[cellIndex(map, enemy.targetCell)] === 1) enemy.targetCell = null
    if (enemy.targetCell === null) enemy.targetCell = nextCell(map, field, cellOf(enemy.pos))
    if (enemy.targetCell === null) continue // momentarily walled in; stand fast

    while (budget > 0 && enemy.targetCell !== null) {
      const target = cellCenter(enemy.targetCell)
      const dx = target.x - enemy.pos.x
      const dy = target.y - enemy.pos.y
      const need = Math.abs(dx) + Math.abs(dy)
      if (need <= budget) {
        enemy.pos = target
        budget -= need
        if (sameCell(enemy.targetCell, map.spire)) {
          arrived.push(enemy.id)
          break
        }
        enemy.targetCell = nextCell(map, field, enemy.targetCell)
      } else {
        const moveX = Math.min(Math.abs(dx), budget) * Math.sign(dx)
        enemy.pos.x += moveX
        const rest = budget - Math.abs(moveX)
        enemy.pos.y += Math.min(Math.abs(dy), rest) * Math.sign(dy)
        budget = 0
      }
    }
  }

  if (arrived.length > 0) {
    const stoneskin = state.relics.includes('stoneskin')
    state.enemies = state.enemies.filter((e) => {
      if (!arrived.includes(e.id)) return true
      const damage = stoneskin ? Math.max(1, e.damage - 1) : e.damage
      state.spireHp = Math.max(0, state.spireHp - damage)
      events.push({ type: 'enemy_reached_spire', id: e.id, enemy: e.type, damage, spireHp: state.spireHp })
      return false
    })
  }
}

// ---------------------------------------------------------------------------
// Targeting

// Progress toward the Spire: field distance dominates, distance to the next
// waypoint breaks ties within a cell. Lower = closer to the Spire.
function progressKey(map: MapDef, field: Int32Array, enemy: Enemy): number {
  if (ENEMIES[enemy.type].flying) {
    const spire = cellCenter(map.spire)
    return (Math.abs(spire.x - enemy.pos.x) + Math.abs(spire.y - enemy.pos.y)) * 10
  }
  const d = field[cellIndex(map, cellOf(enemy.pos))] ?? -1
  if (d === -1) return 1_000_000_000
  const target = enemy.targetCell ? cellCenter(enemy.targetCell) : cellCenter(cellOf(enemy.pos))
  const frac = Math.abs(target.x - enemy.pos.x) + Math.abs(target.y - enemy.pos.y)
  return d * 10_000 + frac
}

export function selectTarget(
  tower: Tower,
  candidates: Enemy[],
  map: MapDef,
  field: Int32Array,
): Enemy | null {
  if (candidates.length === 0) return null
  const origin = cellCenter(tower.cell)
  let best: Enemy | null = null
  let bestKey = 0
  for (const e of candidates) {
    let key: number
    switch (tower.targeting) {
      case 'first':
        key = progressKey(map, field, e)
        break
      case 'last':
        key = -progressKey(map, field, e)
        break
      case 'strongest':
        key = -e.hp
        break
      case 'nearest':
        key = distSq(origin, e.pos)
        break
    }
    if (best === null || key < bestKey || (key === bestKey && e.id < best.id)) {
      best = e
      bestKey = key
    }
  }
  return best
}

// ---------------------------------------------------------------------------
// Firing

export function towersFire(state: RunState, map: MapDef, field: Int32Array, events: GameEvent[]): void {
  for (const tower of state.towers) {
    if (tower.type === 'mint') continue // mints earn, they don't fight
    if (tower.cooldown > 0) {
      tower.cooldown -= 1
      continue
    }
    const def = towerTier(tower.type, tower.tier)
    const hitsAir = TOWERS[tower.type].hitsAir
    const origin = cellCenter(tower.cell)
    const rangeSq = def.range * def.range
    const alive = state.enemies.filter((e) => e.hp > 0 && (hitsAir || !ENEMIES[e.type].flying))
    const inRange = alive.filter((e) => distSq(origin, e.pos) <= rangeSq)
    const target = selectTarget(tower, inRange, map, field)
    if (target === null) continue

    const pct = effectiveDamagePct(state, tower.type) + ENHANCE_DAMAGE_PCT * tower.enhance
    const baseDamage = Math.floor((def.damage * pct) / 100)

    // One crit roll per shot: a critical cannon shell crits its whole splash,
    // a critical tesla arc crits the whole chain.
    let crit = false
    const critChance = effectiveCritChancePct(state)
    if (critChance > 0) {
      const roll = nextInt(state.rng.combat, 1, 100)
      state.rng.combat = roll.rng
      crit = roll.value <= critChance
    }
    const critPct = crit ? effectiveCritDamagePct(state) : 100
    const hitIds: number[] = [target.id]

    // Every hit is attributed to the tower: damage always, kill on the blow
    // that empties the enemy's hp — so per-tower stats answer "what is this
    // tower actually doing?" Snipers pierce shields outright; per-target
    // bonuses (arrow vs air, sniper vs elites) apply on top of crits.
    // Shields judge a shot by its HONEST (pre-crit) weight: a lucky crit
    // never slips a light shot through — piercing or heavy hits only.
    const pierceShield = tower.type === 'sniper'
    const hit = (enemy: Enemy): void => {
      const bonus = bonusPctVs(tower.type, enemy)
      const preCrit = bonus > 0 ? Math.floor((baseDamage * (100 + bonus)) / 100) : baseDamage
      if (!pierceShield && preCrit <= enemy.shield) return // fully blocked
      const dmg = crit ? Math.floor((preCrit * critPct) / 100) : preCrit
      const dealt = applyHit(enemy, dmg, pierceShield)
      tower.damageDealt += dealt
      if (dealt > 0 && enemy.hp === 0) tower.kills += 1
    }

    switch (tower.type) {
      case 'arrow':
      case 'sniper': {
        hit(target)
        break
      }
      case 'cannon': {
        let radius = def.splashRadius!
        if (state.relics.includes('heavy_powder')) radius = Math.floor((radius * 130) / 100)
        const radiusSq = radius * radius
        for (const e of alive) {
          if (e.id === target.id || distSq(target.pos, e.pos) <= radiusSq) {
            hit(e)
            if (e.id !== target.id) hitIds.push(e.id)
          }
        }
        break
      }
      case 'frost': {
        hit(target)
        applySlow(target, def.slowFactor!, def.slowTicks!, state)
        break
      }
      case 'tesla': {
        let chain = def.chain!
        if (state.relics.includes('overcharge')) chain += 2
        const chainRangeSq = TESLA_CHAIN_RANGE * TESLA_CHAIN_RANGE
        let current = target
        hit(current)
        while (hitIds.length < chain) {
          let next: Enemy | null = null
          let nextDist = 0
          for (const e of alive) {
            if (e.hp <= 0 || hitIds.includes(e.id)) continue
            const d = distSq(current.pos, e.pos)
            if (d <= chainRangeSq && (next === null || d < nextDist || (d === nextDist && e.id < next.id))) {
              next = e
              nextDist = d
            }
          }
          if (next === null) break
          hit(next)
          hitIds.push(next.id)
          current = next
        }
        break
      }
    }

    tower.cooldown = def.cooldown
    tower.shots += 1
    events.push({
      type: 'tower_fired',
      id: tower.id,
      tower: tower.type,
      from: origin,
      to: { ...target.pos },
      targets: hitIds,
      crit,
    })
  }
}

// ---------------------------------------------------------------------------
// Abilities

export function castAbility(
  state: RunState,
  ability: AbilityId,
  cell: CellPos,
  events: GameEvent[],
): void {
  const def = ABILITIES[ability]
  const at = cellCenter(cell)
  const radiusSq = def.radius * def.radius
  switch (ability) {
    case 'meteor': {
      const damage = Math.floor((def.damage! * (100 + state.mods.damagePct)) / 100)
      for (const e of state.enemies) {
        if (e.hp > 0 && distSq(at, e.pos) <= radiusSq) applyHit(e, damage)
      }
      break
    }
    case 'frost_nova': {
      for (const e of state.enemies) {
        if (e.hp > 0 && distSq(at, e.pos) <= radiusSq) applySlow(e, def.slowFactor!, def.slowTicks!, state)
      }
      break
    }
    case 'gold_rush': {
      state.goldRushTicks = def.durationTicks!
      break
    }
  }
  let cooldown = def.cooldown
  if (state.relics.includes('overclock')) cooldown = Math.floor((cooldown * 75) / 100)
  state.abilities[ability] = cooldown
  events.push({ type: 'ability_cast', ability, cell })
}

// ---------------------------------------------------------------------------
// Per-tick bookkeeping

export function tickStatuses(state: RunState): void {
  for (const e of state.enemies) {
    if (e.slowTicks > 0) {
      e.slowTicks -= 1
      if (e.slowTicks === 0) e.slowFactor = 100
    }
  }
  for (const key of Object.keys(state.abilities)) {
    const cd = state.abilities[key]!
    if (cd > 0) state.abilities[key] = cd - 1
  }
  if (state.goldRushTicks > 0) state.goldRushTicks -= 1
}

// Carriers hatch broods of lesser enemies at their own position while alive.
// Children get fresh (highest) ids, so appending preserves spawn order.
export function carrierBroods(state: RunState, events: GameEvent[]): void {
  const children: Enemy[] = []
  for (const carrier of state.enemies) {
    const brood = ENEMIES[carrier.type].brood
    if (!brood || carrier.hp <= 0) continue
    if (carrier.broodCooldown > 0) {
      carrier.broodCooldown -= 1
      continue
    }
    carrier.broodCooldown = brood.everyTicks
    const def = ENEMIES[brood.type]
    for (let i = 0; i < brood.count; i++) {
      const hp = scaledHp(brood.type, state.hpScalePct)
      const id = state.nextEntityId
      state.nextEntityId += 1
      children.push({
        id,
        type: brood.type,
        pos: { ...carrier.pos },
        hp,
        maxHp: hp,
        speed: def.speed,
        slowFactor: 100,
        slowTicks: 0,
        bounty: 0, // hatchlings pay nothing — stalling a carrier is never profit
        damage: def.damage,
        shield: def.shield,
        healCooldown: 0,
        broodCooldown: 0,
        targetCell: null,
      })
      events.push({ type: 'enemy_spawned', id, enemy: brood.type })
    }
  }
  if (children.length > 0) state.enemies = state.enemies.concat(children)
}

// Healers pulse healing to nearby wounded allies. Runs after movement so the
// pulse lands where enemies actually are this tick.
export function enemyAuras(state: RunState, events: GameEvent[]): void {
  for (const healer of state.enemies) {
    const heal = ENEMIES[healer.type].heal
    if (!heal || healer.hp <= 0) continue
    if (healer.healCooldown > 0) {
      healer.healCooldown -= 1
      continue
    }
    const amount = Math.max(1, Math.floor((heal.amount * state.hpScalePct) / 100))
    const radiusSq = heal.radius * heal.radius
    const healed: number[] = []
    for (const e of state.enemies) {
      if (e.id === healer.id || e.hp <= 0 || e.hp >= e.maxHp) continue
      if (distSq(healer.pos, e.pos) > radiusSq) continue
      e.hp = Math.min(e.maxHp, e.hp + amount)
      healed.push(e.id)
    }
    healer.healCooldown = heal.everyTicks
    if (healed.length > 0) events.push({ type: 'enemy_healed', healer: healer.id, targets: healed, amount })
  }
}

export function collectDead(state: RunState, events: GameEvent[]): void {
  const survivors: Enemy[] = []
  const children: Enemy[] = []
  for (const e of state.enemies) {
    if (e.hp > 0) {
      survivors.push(e)
      continue
    }
    let bounty = e.bounty
    if (state.relics.includes('golden_touch')) bounty += 2
    if (state.relics.includes('bounty_banner')) bounty += 1
    bounty = Math.floor((bounty * (100 + state.mods.goldPct)) / 100)
    if (state.goldRushTicks > 0) bounty *= 2
    // Fortune Idol: a seeded chance for any kill to pay out double.
    let lucky = false
    if (state.relics.includes('fortune_idol')) {
      const roll = nextInt(state.rng.combat, 1, 100)
      state.rng.combat = roll.rng
      if (roll.value <= FORTUNE_IDOL_CHANCE_PCT) {
        lucky = true
        bounty *= 2
      }
    }
    state.gold += bounty
    state.kills += 1
    events.push({ type: 'enemy_killed', id: e.id, enemy: e.type, at: { ...e.pos }, bounty, lucky })

    // Splitters burst into shards where they fell.
    const split = ENEMIES[e.type].splitInto
    if (split) {
      const def = ENEMIES[split.type]
      for (let i = 0; i < split.count; i++) {
        const hp = scaledHp(split.type, state.hpScalePct)
        const id = state.nextEntityId
        state.nextEntityId += 1
        children.push({
          id,
          type: split.type,
          pos: { ...e.pos },
          hp,
          maxHp: hp,
          speed: def.speed,
          slowFactor: 100,
          slowTicks: 0,
          bounty: def.bounty,
          damage: def.damage,
          shield: def.shield,
          healCooldown: 0,
          broodCooldown: 0,
          targetCell: null,
        })
        events.push({ type: 'enemy_spawned', id, enemy: split.type })
      }
    }
  }
  // Children have the highest ids, so appending keeps spawn order stable.
  state.enemies = survivors.concat(children)
}

// Deterministic "densest cluster" helper used by bots and available to UI:
// the position of the enemy with the most living enemies within `radius`.
export function densestEnemyCell(state: RunState, radius: number): CellPos | null {
  let best: Enemy | null = null
  let bestCount = 0
  const radiusSq = radius * radius
  for (const e of state.enemies) {
    if (e.hp <= 0) continue
    let count = 0
    for (const other of state.enemies) {
      if (other.hp > 0 && distSq(e.pos, other.pos) <= radiusSq) count += 1
    }
    // Enemies iterate in ascending id order, so ties keep the earliest spawn.
    if (count > bestCount) {
      best = e
      bestCount = count
    }
  }
  return best ? cellOf(best.pos) : null
}

// Draw distinct relics from the relic stream for an offer.
export function drawRelicOffer(state: RunState, pool: string[], size: number): string[] {
  const remaining = [...pool]
  const offer: string[] = []
  while (offer.length < size && remaining.length > 0) {
    const pick = nextInt(state.rng.relics, 0, remaining.length - 1)
    state.rng.relics = pick.rng
    offer.push(remaining.splice(pick.value, 1)[0]!)
  }
  return offer
}
