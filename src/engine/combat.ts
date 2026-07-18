import type { MapDef } from '../data/maps'
import {
  ABILITIES,
  ARROW_AIR_BONUS_PCT,
  BLIZZARD_RADIUS,
  BLIZZARD_SPLASH_TICKS_PCT,
  BREAKER_DAMAGE_PCT,
  CAPACITOR_DAMAGE_PCT,
  LANCE_MAX_STACKS,
  LANCE_RAMP_PCT,
  MOMENTUM_RAMP_PCT,
  CAPACITOR_EVERY_SHOTS,
  EXECUTOR_THRESHOLD_PCT,
  LATTICE_EXTRA_CHAIN,
  LONGBOW_RANGE_PCT,
  MORTAR_COOLDOWN_PCT,
  MORTAR_DAMAGE_PCT,
  MORTAR_SPLASH_PCT,
  OVERPEN_RANGE,
  PERMAFROST_BONUS_PCT,
  VOLLEY_EXTRA_TARGETS,
  VOLLEY_PCT,
  CARAPACE_BREAK_DAMAGE,
  GALE_SPEED_PCT,
  CINDER_BURN_PCT,
  CINDER_BURN_TICKS,
  DEADEYE_EXECUTE_PCT,
  PRISM_LENS_CRIT_PCT,
  RICOCHET_PCT,
  RICOCHET_RANGE,
  SHATTERHEART_PCT,
  SHATTERHEART_RADIUS,
  STORM_COILS_MAX_STACKS,
  STORM_COILS_PCT_PER_STACK,
  CRIT_BASE_DAMAGE_PCT,
  CRIT_RELIC_CHANCE_PCT,
  CRIT_RELIC_DAMAGE_PCT,
  ENEMIES,
  ENHANCE_DAMAGE_PCT,
  COLOSSUS_DAMAGE_PCT,
  FORTUNE_IDOL_CHANCE_PCT,
  GLASS_CANNON_PCT,
  LAST_STAND_PCT,
  LONGSIGHT_RANGE_PCT,
  QUICKDRAW_COOLDOWN_PCT,
  SHATTER_BONUS_PCT,
  SOUL_HARVEST_EVERY_KILLS,
  RELIC_PITY_WAVE,
  RELIC_RARITY_WEIGHTS,
  RELICS,
  PIERCING_ARROWS_PCT,
  SNIPER_ELITE_BONUS_PCT,
  TESLA_CHAIN_RANGE,
  TOWERS,
  towerTier,
} from '../data/content'
import { MARSH_SPEED_PCT, MESA_RANGE_PCT } from '../data/biomes'
import { blockedGrid, cellCenter, cellIndex, cellOf, distSq, nextCell, sameCell } from './grid'
import { nextInt } from './rng'
import type { TowerSpecId } from '../data/content'
import type { AbilityId, CellPos, Enemy, GameEvent, RelicId, RunState, Tower, TowerType } from './types'
import { scaledHp } from './waves'

// All functions in this file mutate a draft RunState that step() has already
// cloned — mutation never escapes the step boundary.

export function effectiveDamagePct(state: RunState, tower: Tower['type']): number {
  let pct = 100 + state.mods.damagePct
  if (tower === 'arrow' && state.relics.includes('piercing_arrows')) pct += PIERCING_ARROWS_PCT
  if (state.relics.includes('glass_cannon')) pct += GLASS_CANNON_PCT
  if (state.relics.includes('colossus')) pct += COLOSSUS_DAMAGE_PCT
  if (state.relics.includes('last_stand') && state.spireHp * 2 <= state.spireMaxHp) pct += LAST_STAND_PCT
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
): { base: number; parts: DamagePart[]; totalPct: number; specPct: number; effective: number } {
  const base = towerTier(tower.type, tower.tier).damage
  const parts: DamagePart[] = []
  if (state.mods.damagePct > 0) parts.push({ source: 'Honed Arsenal (Spire Tree)', pct: state.mods.damagePct })
  else if (state.mods.damagePct < 0) parts.push({ source: 'Dampening Field (cataclysm)', pct: state.mods.damagePct })
  if (tower.type === 'arrow' && state.relics.includes('piercing_arrows'))
    parts.push({ source: 'Piercing Arrows (relic)', pct: PIERCING_ARROWS_PCT })
  if (state.relics.includes('glass_cannon')) parts.push({ source: 'Glass Cannon (relic)', pct: GLASS_CANNON_PCT })
  if (state.relics.includes('colossus')) parts.push({ source: 'Colossus (relic)', pct: COLOSSUS_DAMAGE_PCT })
  if (state.relics.includes('last_stand') && state.spireHp * 2 <= state.spireMaxHp)
    parts.push({ source: 'Last Stand (relic, active)', pct: LAST_STAND_PCT })
  if (tower.enhance > 0) parts.push({ source: `Enhance +${tower.enhance}`, pct: ENHANCE_DAMAGE_PCT * tower.enhance })
  const aura = beaconAuraPct(state, tower)
  if (aura > 0) parts.push({ source: 'Beacon aura', pct: aura })
  // Lance ramp: the LIVE stack count, so the panel reads what the next shot
  // will actually do — the whole tower is this number climbing.
  if (tower.type === 'lance' && (tower.rampStacks ?? 0) > 0) {
    const perStack = tower.spec === 'momentum' ? MOMENTUM_RAMP_PCT : LANCE_RAMP_PCT
    parts.push({ source: `Ramp ×${tower.rampStacks} (held target)`, pct: perStack * (tower.rampStacks ?? 0) })
  }
  const totalPct = 100 + parts.reduce((sum, p) => sum + p.pct, 0)
  // Tier-3 paths multiply AFTER the additive stack — the same order
  // towersFire applies them, so the panel's number is the shot's number.
  // (Capacitor's burst is periodic, not steady — reported separately.)
  const specPct = tower.spec === 'mortar' ? MORTAR_DAMAGE_PCT : tower.spec === 'breaker' ? BREAKER_DAMAGE_PCT : 100
  const effective = Math.floor((Math.floor((base * totalPct) / 100) * specPct) / 100)
  return { base, parts, totalPct, specPct, effective }
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

// Per-tower crit chance: the global pool (meta + Keen Sights) plus Prism
// Lens for towers standing in a beacon aura. towersFire rolls with THIS, so
// a lens build turns beacon placement into a crit decision.
export function towerCritChancePct(state: RunState, tower: Tower): number {
  let pct = effectiveCritChancePct(state)
  if (state.relics.includes('prism_lens') && beaconAuraPct(state, tower) > 0) pct += PRISM_LENS_CRIT_PCT
  return Math.min(100, pct)
}

export function effectiveCritDamagePct(state: RunState): number {
  let pct = CRIT_BASE_DAMAGE_PCT
  if (state.relics.includes('executioners_seal')) pct += CRIT_RELIC_DAMAGE_PCT
  return pct
}

export function applyHit(enemy: Enemy, damage: number, pierceShield = false): number {
  // Permafrost brittleness amplifies EVERYTHING — the hit is judged (and
  // dealt) at its amplified weight.
  if (enemy.brittleTicks > 0) damage = Math.floor((damage * (100 + PERMAFROST_BONUS_PCT)) / 100)
  if (!pierceShield && damage <= enemy.shield) return 0 // shieldbearers ignore weak hits entirely
  // Spirebreaker's carapace: while raised, everything lands for 1 — except
  // a single heavy blow (>= CARAPACE_BREAK_DAMAGE), which SHATTERS it and
  // lands in full. Heavy hitters answer the window; chip waits it out.
  if (enemy.mechActiveTicks > 0 && ENEMIES[enemy.type].mech?.kind === 'carapace') {
    if (damage >= CARAPACE_BREAK_DAMAGE) {
      enemy.mechActiveTicks = 0 // shattered
    } else {
      const chip = Math.min(enemy.hp, 1)
      enemy.hp -= chip
      return chip
    }
  }
  // Armor: flat reduction per hit, min 1 always lands. Chip damage bleeds a
  // large fraction to it; heavy shells barely notice — the midgame
  // composition pressure that shields (a late threshold) never provided.
  const dealt = Math.min(enemy.hp, Math.max(1, damage - enemy.armor))
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
    // Frostfen pools: soft ground drags at ground enemies (fliers skip it).
    if (map.marsh.length > 0 && !ENEMIES[enemy.type].flying && map.marsh[cellIndex(map, cellOf(enemy.pos))]) {
      budget = Math.max(1, Math.floor((budget * MARSH_SPEED_PCT) / 100))
    }

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
      // Bulwark: the spire absorbs arrivals entirely while the sigil burns.
      const damage = state.bulwarkTicks > 0 ? 0 : stoneskin ? Math.max(1, e.damage - 1) : e.damage
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
  rangeSq?: number, // when provided, out-of-range candidates are skipped inline
): Enemy | null {
  if (candidates.length === 0) return null
  const origin = cellCenter(tower.cell)
  let best: Enemy | null = null
  let bestKey = 0
  for (const e of candidates) {
    if (e.hp <= 0) continue // shared lists go stale mid-tick as towers kill
    if (rangeSq !== undefined && distSq(origin, e.pos) > rangeSq) continue
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
      case 'weakest':
        key = e.hp
        break
      case 'nearest':
        key = distSq(origin, e.pos)
        break
      case 'elites':
        // Elites first (by path progress); non-elites only as fallback.
        key = (ENEMIES[e.type].elite ? 0 : 1_000_000_000_000) + progressKey(map, field, e)
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

// The strongest beacon aura covering a tower's cell (non-stacking).
export function beaconAuraPct(state: RunState, tower: Tower): number {
  let best = 0
  const at = cellCenter(tower.cell)
  for (const b of state.towers) {
    if (b.type !== 'beacon' || b.id === tower.id) continue
    const def = towerTier('beacon', b.tier)
    const reach = def.range
    if (distSq(cellCenter(b.cell), at) <= reach * reach) best = Math.max(best, def.auraPct!)
  }
  return best
}

export function towersFire(state: RunState, map: MapDef, field: Int32Array, events: GameEvent[]): void {
  // Candidate lists are computed ONCE per tick and shared by every tower —
  // with a full board this kills ~2 array allocations per tower per tick.
  // Phased wraiths are untargetable by towers (abilities still hit them).
  const aliveAll: Enemy[] = [] // everyone — what an air-capable tower sees
  const aliveGrounded: Enemy[] = [] // fliers excluded — a ground-only tower's world
  for (const e of state.enemies) {
    if (e.hp <= 0 || e.phased) continue
    aliveAll.push(e)
    if (!ENEMIES[e.type].flying) aliveGrounded.push(e)
  }

  for (const tower of state.towers) {
    if (TOWERS[tower.type].support) continue // support towers don't fight
    if (tower.cooldown > 0) {
      tower.cooldown -= 1
      continue
    }
    const def = towerTier(tower.type, tower.tier)
    const hitsAir = TOWERS[tower.type].hitsAir
    const origin = cellCenter(tower.cell)
    const range = towerRangeOnBoard(state, map, tower)
    const rangeSq = range * range
    const alive = hitsAir ? aliveAll : aliveGrounded
    const target = selectTarget(tower, alive, map, field, rangeSq)
    if (target === null) continue

    const pct = effectiveDamagePct(state, tower.type) + ENHANCE_DAMAGE_PCT * tower.enhance + beaconAuraPct(state, tower)
    let baseDamage = Math.floor((def.damage * pct) / 100)
    if (tower.spec === 'mortar') baseDamage = Math.floor((baseDamage * MORTAR_DAMAGE_PCT) / 100)
    else if (tower.spec === 'breaker') baseDamage = Math.floor((baseDamage * BREAKER_DAMAGE_PCT) / 100)
    // Capacitor: a deterministic burst cycle — every 4th shot discharges.
    else if (tower.spec === 'capacitor' && (tower.shots + 1) % CAPACITOR_EVERY_SHOTS === 0) {
      baseDamage = Math.floor((baseDamage * CAPACITOR_DAMAGE_PCT) / 100)
    }
    // Lance ramp: consecutive hits on the SAME target each hit harder;
    // switching targets (or the target dying) resets the climb to zero.
    // Bookkeeping happens before the shot so this shot pays for the aim
    // already held, not for itself. The bonus joins the ADDITIVE damage
    // stack — the same math damageBreakdown reports, so the panel's number
    // is the shot's number.
    if (tower.type === 'lance') {
      if (tower.rampTarget === target.id) {
        const prevStacks = tower.rampStacks ?? 0
        tower.rampStacks = Math.min(LANCE_MAX_STACKS, prevStacks + 1)
        if (tower.rampStacks > state.maxRampStacks) state.maxRampStacks = tower.rampStacks
        // The moment the climb tops out is an event — once per climb, not
        // once per capped shot.
        if (tower.rampStacks === LANCE_MAX_STACKS && prevStacks < LANCE_MAX_STACKS) {
          events.push({ type: 'ramp_capped', id: tower.id, cell: tower.cell })
        }
      } else {
        tower.rampTarget = target.id
        // Duelist's Oath: the climb never starts from nothing.
        tower.rampStacks = state.relics.includes('duelists_oath') ? Math.floor((tower.rampStacks ?? 0) / 2) : 0
      }
      const perStack = tower.spec === 'momentum' ? MOMENTUM_RAMP_PCT : LANCE_RAMP_PCT
      const rampBonus = perStack * (tower.rampStacks ?? 0)
      if (rampBonus > 0) baseDamage = Math.floor((def.damage * (pct + rampBonus)) / 100)
    }

    // One crit roll per shot: a critical cannon shell crits its whole splash,
    // a critical tesla arc crits the whole chain.
    let crit = false
    const critChance = towerCritChancePct(state, tower)
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
    const pierceShield = tower.type === 'sniper' || tower.spec === 'longbow' || tower.spec === 'skewer'
    const shatter = state.relics.includes('shatter')
    const stormCoils = tower.type === 'tesla' && state.relics.includes('storm_coils')
    const cinder = tower.type === 'cannon' && state.relics.includes('cinder_shells')
    // scalePct: secondary hits (Ricochet Strings) land at a fraction of the
    // shot's weight — shields judge the SCALED pre-crit damage, so a weak
    // bounce can bounce off a shield the primary punched through.
    const hit = (enemy: Enemy, scalePct = 100): void => {
      let bonus = bonusPctVs(tower.type, enemy) + (shatter && enemy.slowTicks > 0 ? SHATTER_BONUS_PCT : 0)
      if (stormCoils) bonus += STORM_COILS_PCT_PER_STACK * enemy.overcharge
      let preCrit = bonus > 0 ? Math.floor((baseDamage * (100 + bonus)) / 100) : baseDamage
      if (scalePct !== 100) preCrit = Math.floor((preCrit * scalePct) / 100)
      if (stormCoils) enemy.overcharge = Math.min(STORM_COILS_MAX_STACKS, enemy.overcharge + 1)
      if (!pierceShield && preCrit <= enemy.shield) return // fully blocked
      const dmg = crit ? Math.floor((preCrit * critPct) / 100) : preCrit
      const dealt = applyHit(enemy, dmg, pierceShield)
      tower.damageDealt += dealt
      if (dealt > 0) state.damageByTower[tower.type] = (state.damageByTower[tower.type] ?? 0) + dealt
      if (dealt > 0 && enemy.hp === 0) tower.kills += 1
      // Cinder Shells: part of the blow keeps burning. Refresh keeps the
      // hotter of the two burns — stacking would trivialize bosses.
      if (cinder && dealt > 0 && enemy.hp > 0) {
        const perTick = Math.max(1, Math.floor((dealt * CINDER_BURN_PCT) / 100 / CINDER_BURN_TICKS))
        if (perTick >= enemy.burnPerTick) {
          enemy.burnPerTick = perTick
          enemy.burnTicks = CINDER_BURN_TICKS
        }
      }
    }

    switch (tower.type) {
      case 'arrow': {
        hit(target)
        // Volley: the shot strikes extra enemies near the target at reduced
        // weight (nearest-first, ties to the older spawn).
        if (tower.spec === 'volley') {
          const rangeSq2 = RICOCHET_RANGE * RICOCHET_RANGE
          for (let extra = 0; extra < VOLLEY_EXTRA_TARGETS; extra++) {
            let next: Enemy | null = null
            let nextDist = 0
            for (const e of alive) {
              if (e.hp <= 0 || e.id === target.id || hitIds.includes(e.id)) continue
              const d = distSq(target.pos, e.pos)
              if (d <= rangeSq2 && (next === null || d < nextDist || (d === nextDist && e.id < next.id))) {
                next = e
                nextDist = d
              }
            }
            if (next === null) break
            hit(next, VOLLEY_PCT)
            hitIds.push(next.id)
          }
        }
        // Ricochet Strings: the shot bounces to the nearest other enemy in
        // reach of the impact (nearest, ties to the older spawn — the same
        // deterministic rule tesla chains use).
        if (state.relics.includes('ricochet_strings')) {
          const rangeSq2 = RICOCHET_RANGE * RICOCHET_RANGE
          let next: Enemy | null = null
          let nextDist = 0
          for (const e of alive) {
            if (e.hp <= 0 || e.id === target.id) continue
            const d = distSq(target.pos, e.pos)
            if (d <= rangeSq2 && (next === null || d < nextDist || (d === nextDist && e.id < next.id))) {
              next = e
              nextDist = d
            }
          }
          if (next !== null) {
            hit(next, RICOCHET_PCT)
            hitIds.push(next.id)
          }
        }
        break
      }
      case 'sniper': {
        hit(target)
        // Overpenetration: the slug carries into one more enemy at full weight.
        if (tower.spec === 'overpen') {
          const rangeSq2 = OVERPEN_RANGE * OVERPEN_RANGE
          let next: Enemy | null = null
          let nextDist = 0
          for (const e of alive) {
            if (e.hp <= 0 || e.id === target.id) continue
            const d = distSq(target.pos, e.pos)
            if (d <= rangeSq2 && (next === null || d < nextDist || (d === nextDist && e.id < next.id))) {
              next = e
              nextDist = d
            }
          }
          if (next !== null) {
            hit(next)
            hitIds.push(next.id)
          }
        }
        // Executor: the spec's own execute — a lower bar than Deadeye's.
        const executeAt = Math.max(
          tower.spec === 'executor' ? EXECUTOR_THRESHOLD_PCT : 0,
          state.relics.includes('deadeye_sigil') ? DEADEYE_EXECUTE_PCT : 0,
        )
        if (
          executeAt > 0 &&
          target.hp > 0 &&
          !target.type.startsWith('boss') &&
          target.hp * 100 <= target.maxHp * executeAt
        ) {
          const executed = target.hp
          target.hp = 0
          tower.damageDealt += executed
          state.damageByTower[tower.type] = (state.damageByTower[tower.type] ?? 0) + executed
          tower.kills += 1
        }
        break
      }
      case 'cannon': {
        if (tower.spec === 'breaker') {
          hit(target) // the whole charge, one target
          break
        }
        let radius = def.splashRadius!
        if (tower.spec === 'mortar') radius = Math.floor((radius * MORTAR_SPLASH_PCT) / 100)
        if (state.relics.includes('heavy_powder')) radius = Math.floor((radius * 130) / 100)
        const radiusSq = radius * radius
        for (const e of alive) {
          if (e.hp <= 0) continue // killed earlier this tick
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
        if (tower.spec === 'permafrost') target.brittleTicks = Math.max(target.brittleTicks, def.slowTicks!)
        // Blizzard: the cold lands on everyone near the impact — at half
        // duration. A chill, not a lock: massed blizzards perma-freezing the
        // whole field carried a fuzzer win before this haircut.
        if (tower.spec === 'blizzard') {
          const radiusSq = BLIZZARD_RADIUS * BLIZZARD_RADIUS
          const splashTicks = Math.max(1, Math.floor((def.slowTicks! * BLIZZARD_SPLASH_TICKS_PCT) / 100))
          for (const e of alive) {
            if (e.hp <= 0 || e.id === target.id) continue
            if (distSq(target.pos, e.pos) <= radiusSq) applySlow(e, def.slowFactor!, splashTicks, state)
          }
        }
        break
      }
      case 'tesla': {
        let chain = def.chain!
        if (tower.spec === 'lattice') chain += LATTICE_EXTRA_CHAIN
        if (state.relics.includes('overcharge')) chain += 2
        if (state.relics.includes('echo_chamber')) chain += 1
        const chainRange = state.relics.includes('echo_chamber')
          ? Math.floor((TESLA_CHAIN_RANGE * 120) / 100)
          : TESLA_CHAIN_RANGE
        const chainRangeSq = chainRange * chainRange
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
      case 'lance': {
        // Single-target by design: the ramp (applied to baseDamage above) is
        // the whole identity — commitment to one mark, nothing else.
        hit(target)
        break
      }
    }

    tower.cooldown = effectiveTowerCooldown(state, tower.type, tower.tier, tower.spec)
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
    case 'bulwark': {
      state.bulwarkTicks = def.durationTicks!
      break
    }
  }
  state.abilities[ability] = effectiveAbilityCooldown(state, ability)
  events.push({ type: 'ability_cast', ability, cell })
}

// The ability cooldown a cast will actually incur — Overclock and Swift
// Sigils included, 1s floor. The UI shows this number; castAbility uses it,
// so the display can never drift from the engine.
export function effectiveAbilityCooldown(state: RunState, ability: AbilityId): number {
  let cooldown = ABILITIES[ability].cooldown
  if (state.relics.includes('overclock')) cooldown = Math.floor((cooldown * 75) / 100)
  if (state.mods.abilityCdPct > 0) cooldown = Math.max(30, Math.floor((cooldown * (100 - state.mods.abilityCdPct)) / 100))
  return cooldown
}

// Ticks between shots for a tower of this type/tier — Quickdraw included.
// Same single-source-of-truth deal: towersFire reloads with this, and the
// tower panel's fire rate is computed from it.
export function effectiveTowerCooldown(state: RunState, type: TowerType, tier: 1 | 2 | 3, spec: TowerSpecId | null = null): number {
  let base = towerTier(type, tier).cooldown
  if (spec === 'mortar') base = Math.floor((base * MORTAR_COOLDOWN_PCT) / 100)
  return state.relics.includes('quickdraw') ? Math.max(3, Math.floor((base * QUICKDRAW_COOLDOWN_PCT) / 100)) : base
}

// Targeting range for a tower of this type/tier — Longsight included. Used
// by towersFire and by every UI surface that quotes a range, so the numbers
// players read are the numbers the engine rolls.
export function effectiveTowerRange(state: RunState, type: TowerType, tier: 1 | 2 | 3, spec: TowerSpecId | null = null): number {
  let base = towerTier(type, tier).range
  if (spec === 'longbow') base = Math.floor((base * LONGBOW_RANGE_PCT) / 100)
  return state.relics.includes('longsight') ? Math.floor((base * LONGSIGHT_RANGE_PCT) / 100) : base
}

// The single source of a PLACED tower's true targeting radius on this board —
// spec, relics, and mesa terrain included. towersFire fires with this and
// the UI draws its range rings and tooltips from it, so the circle players
// see is exactly the circle the engine rolls. (Beacons are the exception
// everywhere: their aura reach is raw tier range by design — beaconAuraPct.)
export function towerRangeOnBoard(state: RunState, map: MapDef, tower: Tower): number {
  let range = effectiveTowerRange(state, tower.type, tower.tier, tower.spec)
  if (map.mesa.length > 0 && map.mesa[cellIndex(map, tower.cell)]) {
    range = Math.floor((range * MESA_RANGE_PCT) / 100)
  }
  return range
}

// ---------------------------------------------------------------------------
// Per-tick bookkeeping

export function tickStatuses(state: RunState): void {
  for (const e of state.enemies) {
    // Cinder Shells: the burn is elemental — armor and shields don't help.
    // Deaths are collected by the next collectDead pass.
    if (e.burnTicks > 0 && e.hp > 0) {
      e.burnTicks -= 1
      const dealt = Math.min(e.hp, e.burnPerTick)
      e.hp -= dealt
      if (dealt > 0) state.damageByTower.cannon = (state.damageByTower.cannon ?? 0) + dealt
      if (e.burnTicks === 0) e.burnPerTick = 0
    }
    if (e.brittleTicks > 0) e.brittleTicks -= 1
    if (e.slowTicks > 0) {
      e.slowTicks -= 1
      if (e.slowTicks === 0) e.slowFactor = 100
    }
    // Wraiths flicker: corporeal for visibleTicks, phased for hiddenTicks.
    const phasing = ENEMIES[e.type].phasing
    if (phasing) {
      e.phaseCooldown -= 1
      if (e.phaseCooldown <= 0) {
        e.phased = !e.phased
        e.phaseCooldown = e.phased ? phasing.hiddenTicks : phasing.visibleTicks
      }
    }
  }
  // Ability cooldowns recover ONLY while a wave is live. Abilities cannot be
  // cast in the build phase, so build-time recovery meant any unhurried
  // player had everything ready every wave — cooldown durations (and every
  // cooldown-reduction pickup) were dead stats. Combat-only recovery makes
  // cooldown time a real in-fight resource at every play speed.
  if (state.phase === 'wave') {
    for (const key of Object.keys(state.abilities)) {
      const cd = state.abilities[key]!
      if (cd > 0) state.abilities[key] = cd - 1
    }
  }
  if (state.goldRushTicks > 0) state.goldRushTicks -= 1
  if (state.bulwarkTicks > 0) state.bulwarkTicks -= 1
}

// Carriers hatch broods of lesser enemies at their own position while alive.
// Children get fresh (highest) ids, so appending preserves spawn order.
// Boss signature mechanics: tick the timers, trigger the windows. Carapace
// raises a break-or-wait immunity window; gale hastens every OTHER enemy —
// unless it is already slowed (applySlow keeps the strongest factor, so
// frost coverage cancels the storm outright).
export function bossMechanics(state: RunState, events: GameEvent[]): void {
  for (const boss of state.enemies) {
    const mech = ENEMIES[boss.type].mech
    if (!mech || boss.hp <= 0) continue
    if (boss.mechActiveTicks > 0) boss.mechActiveTicks -= 1
    if (boss.mechCooldown > 0) {
      boss.mechCooldown -= 1
      continue
    }
    boss.mechCooldown = mech.everyTicks
    if (mech.kind === 'carapace') {
      boss.mechActiveTicks = mech.durationTicks
      events.push({ type: 'boss_carapace', id: boss.id })
    } else {
      let hastened = 0
      for (const e of state.enemies) {
        if (e.id === boss.id || e.hp <= 0 || e.slowTicks > 0) continue
        e.slowFactor = GALE_SPEED_PCT
        e.slowTicks = mech.durationTicks
        hastened += 1
      }
      events.push({ type: 'boss_gale', id: boss.id, hastened })
    }
  }
}

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
        armor: 0, // hatchlings and shards are trash — no defense stats
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
    // Every second kill: the horde rebalance made flat per-kill gold scale
    // with body count — at +1 on EVERY kill this common relic out-earned
    // mints and carried a 5k-spark victory in the 2026-07 deep hunt.
    if (state.relics.includes('bounty_banner') && state.kills % 2 === 1) bounty += 1
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
    state.killsByEnemy[e.type] = (state.killsByEnemy[e.type] ?? 0) + 1
    events.push({ type: 'enemy_killed', id: e.id, enemy: e.type, at: { ...e.pos }, bounty, lucky })
    // Shatterheart: a slowed death detonates. Elemental — ignores shields
    // and armor. Enemies already emptied this pass don't re-die; victims
    // dropped to zero here are collected on the next pass (no cascades
    // within a single tick — bounded and deterministic).
    if (state.relics.includes('shatterheart') && e.slowTicks > 0) {
      const radiusSq = SHATTERHEART_RADIUS * SHATTERHEART_RADIUS
      const burst = Math.max(1, Math.floor((e.maxHp * SHATTERHEART_PCT) / 100))
      for (const other of state.enemies) {
        if (other.id === e.id || other.hp <= 0) continue
        if (distSq(e.pos, other.pos) <= radiusSq) {
          const dealt = Math.min(other.hp, burst)
          other.hp -= dealt
          state.damageByTower.frost = (state.damageByTower.frost ?? 0) + dealt
        }
      }
    }
    // Soul Harvest: the horde's own mass mends the walls, one drop at a time.
    if (
      state.relics.includes('soul_harvest') &&
      state.kills % SOUL_HARVEST_EVERY_KILLS === 0 &&
      state.spireHp < state.spireMaxHp
    ) {
      state.spireHp += 1
      events.push({ type: 'spire_repaired', amount: 1, cost: 0, spireHp: state.spireHp })
    }

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
          armor: 0, // shards carry no defense stats
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

// Draw distinct relics from the relic stream for an offer, weighted by
// rarity: roll a rarity bucket (among those still available), then uniform
// within it. Legendaries are events, not table stakes.
export function drawRelicOffer(state: RunState, pool: string[], size: number): string[] {
  const remaining = [...pool]
  const offer: string[] = []
  const rarities = ['common', 'rare', 'legendary'] as const
  while (offer.length < size && remaining.length > 0) {
    const present = rarities.filter((r) => remaining.some((id) => RELICS[id as RelicId].rarity === r))
    const total = present.reduce((sum, r) => sum + RELIC_RARITY_WEIGHTS[r], 0)
    const roll = nextInt(state.rng.relics, 1, total)
    state.rng.relics = roll.rng
    let v = roll.value
    let rarity = present[0]!
    for (const r of present) {
      v -= RELIC_RARITY_WEIGHTS[r]
      if (v <= 0) {
        rarity = r
        break
      }
    }
    const bucket = remaining.filter((id) => RELICS[id as RelicId].rarity === rarity)
    const pick = nextInt(state.rng.relics, 0, bucket.length - 1)
    state.rng.relics = pick.rng
    const chosen = bucket[pick.value]!
    remaining.splice(remaining.indexOf(chosen), 1)
    offer.push(chosen)
  }
  // Pity floor: past RELIC_PITY_WAVE an all-common offer upgrades its last
  // slot to a random rare-or-better still in the pool. Deep runs are decided
  // by relics; a blank offer at wave 20 is variance nobody enjoys.
  if (state.wave >= RELIC_PITY_WAVE && offer.length > 0) {
    const allCommon = offer.every((id) => RELICS[id as RelicId].rarity === 'common')
    const upgrades = remaining.filter((id) => RELICS[id as RelicId].rarity !== 'common')
    if (allCommon && upgrades.length > 0) {
      const pick = nextInt(state.rng.relics, 0, upgrades.length - 1)
      state.rng.relics = pick.rng
      offer[offer.length - 1] = upgrades[pick.value]!
    }
  }
  return offer
}
