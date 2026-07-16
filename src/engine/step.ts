import {
  ABILITIES,
  BASE_WAVE_BUDGET,
  ENEMIES,
  enhanceCost,
  HP_SCALE_GROWTH_PCT,
  RELIC_IDS,
  RELIC_OFFER_SIZE,
  RELIC_WAVE_INTERVAL,
  REPAIR_MAX_PER_CAST,
  repairCostPerHp,
  SELL_REFUND_PCT,
  TOWERS,
  towerInvested,
  towerTier,
  VICTORY_WAVE,
  WAVE_BUDGET_GROWTH_PCT,
  WAVE_CLEAR_GOLD_BASE,
  WAVE_CLEAR_GOLD_PER_WAVE,
} from '../data/content'
import { castAbility, collectDead, drawRelicOffer, moveEnemies, tickStatuses, towersFire } from './combat'
import { cloneRun } from './clone'
import { blockedGrid, canPlaceTower, cellCenter, distanceField, getMap, inBounds } from './grid'
import type { Command, GameEvent, RelicId, RunState, StepResult, Targeting } from './types'
import { generateWave, scaledHp } from './waves'

export const TICKS_PER_SECOND = 30

const TARGETING_MODES: Targeting[] = ['first', 'last', 'strongest', 'nearest']

function isTerminal(state: RunState): boolean {
  return state.phase === 'defeat' || state.phase === 'victory'
}

// Advance the simulation exactly one tick. Pure at the boundary: the input
// state is never mutated (we clone, then mutate the draft), invalid commands
// emit command_rejected instead of throwing, and all randomness comes from
// the streams inside the state.
export function step(state: RunState, commands: Command[]): StepResult {
  const events: GameEvent[] = []
  const s = cloneRun(state)
  s.tick += 1
  const map = getMap(s.mapId)

  for (const command of commands) applyCommand(s, command, events)

  if (s.phase === 'wave') {
    const field = distanceField(map, blockedGrid(map, s.towers))
    spawnDue(s, events)
    moveEnemies(s, map, field, events)
    if (s.spireHp === 0) {
      endRun(s, 'defeat', events)
    } else {
      towersFire(s, map, field, events)
      collectDead(s, events)
      checkWaveEnd(s, events)
    }
  }

  tickStatuses(s)
  return { state: s, events }
}

function reject(command: Command, reason: string, events: GameEvent[]): void {
  events.push({ type: 'command_rejected', command, reason })
}

function applyCommand(s: RunState, command: Command, events: GameEvent[]): void {
  if (isTerminal(s)) {
    reject(command, 'run is over', events)
    return
  }
  const map = getMap(s.mapId)

  switch (command.type) {
    case 'abandon_run': {
      // Concede: the run ends as a defeat and pays sparks for progress so
      // far, exactly as if the Spire had fallen.
      s.spireHp = 0
      endRun(s, 'defeat', events)
      return
    }

    case 'start_wave': {
      if (s.phase !== 'build') return reject(command, `phase is ${s.phase}`, events)
      const wave = s.wave + 1
      s.wave = wave
      s.waveBudget = wave === 1 ? BASE_WAVE_BUDGET : Math.floor((s.waveBudget * WAVE_BUDGET_GROWTH_PCT) / 100)
      s.hpScalePct = wave === 1 ? 100 : Math.floor((s.hpScalePct * HP_SCALE_GROWTH_PCT) / 100)
      const generated = generateWave(s.rng.waves, wave, s.waveBudget)
      s.rng.waves = generated.rng
      s.pendingSpawns = generated.spawns.map((p) => ({ type: p.type, tick: s.tick + p.tick }))
      s.phase = 'wave'
      events.push({ type: 'wave_started', wave, spawnCount: s.pendingSpawns.length })
      return
    }

    case 'place_tower': {
      const def = Object.prototype.hasOwnProperty.call(TOWERS, command.tower) ? TOWERS[command.tower] : null
      if (!def) return reject(command, 'unknown tower type', events)
      if (!s.availableTowers.includes(command.tower)) return reject(command, 'tower not unlocked', events)
      const cost = def.tiers[0].cost
      if (s.gold < cost) return reject(command, 'not enough gold', events)
      const placement = canPlaceTower(s, map, command.cell)
      if (!placement.ok) return reject(command, placement.reason, events)
      const id = s.nextEntityId
      s.nextEntityId += 1
      s.gold -= cost
      s.towers.push({
        id,
        type: command.tower,
        tier: 1,
        enhance: 0,
        cell: { ...command.cell },
        cooldown: 0,
        targeting: 'first',
        kills: 0,
        damageDealt: 0,
      })
      // Placement changed the maze: force enemies to re-path from their cells.
      for (const e of s.enemies) e.targetCell = null
      events.push({ type: 'tower_placed', id, tower: command.tower, cell: { ...command.cell } })
      return
    }

    case 'upgrade_tower': {
      const tower = s.towers.find((t) => t.id === command.id)
      if (!tower) return reject(command, 'no such tower', events)
      if (tower.tier >= 3) {
        // Tier 3 towers enhance indefinitely — the unbounded gold sink.
        const cost = enhanceCost(tower.type, tower.enhance)
        if (s.gold < cost) return reject(command, 'not enough gold', events)
        s.gold -= cost
        tower.enhance += 1
        events.push({ type: 'tower_enhanced', id: tower.id, level: tower.enhance, cost })
        return
      }
      const nextTier = (tower.tier + 1) as 2 | 3
      const cost = towerTier(tower.type, nextTier).cost
      if (s.gold < cost) return reject(command, 'not enough gold', events)
      s.gold -= cost
      tower.tier = nextTier
      events.push({ type: 'tower_upgraded', id: tower.id, tier: nextTier })
      return
    }

    case 'sell_tower': {
      const index = s.towers.findIndex((t) => t.id === command.id)
      if (index === -1) return reject(command, 'no such tower', events)
      const tower = s.towers[index]!
      const refund = Math.floor((towerInvested(tower.type, tower.tier) * SELL_REFUND_PCT) / 100)
      s.towers.splice(index, 1)
      s.gold += refund
      for (const e of s.enemies) e.targetCell = null // maze opened up; re-path
      events.push({ type: 'tower_sold', id: tower.id, refund })
      return
    }

    case 'repair_spire': {
      const missing = s.spireMaxHp - s.spireHp
      const perHp = repairCostPerHp(s.wave)
      const affordable = Math.floor(s.gold / perHp)
      const amount = Math.min(REPAIR_MAX_PER_CAST, missing, affordable)
      if (amount <= 0) {
        return reject(command, missing === 0 ? 'spire is at full health' : 'not enough gold', events)
      }
      const cost = amount * perHp
      s.gold -= cost
      s.spireHp += amount
      events.push({ type: 'spire_repaired', amount, cost, spireHp: s.spireHp })
      return
    }

    case 'set_targeting': {
      const tower = s.towers.find((t) => t.id === command.id)
      if (!tower) return reject(command, 'no such tower', events)
      if (!TARGETING_MODES.includes(command.targeting)) return reject(command, 'unknown targeting mode', events)
      tower.targeting = command.targeting
      return
    }

    case 'cast_ability': {
      if (s.phase !== 'wave') return reject(command, 'can only cast during a wave', events)
      if (!Object.prototype.hasOwnProperty.call(ABILITIES, command.ability))
        return reject(command, 'unknown ability', events)
      if (!Object.prototype.hasOwnProperty.call(s.abilities, command.ability))
        return reject(command, 'ability not equipped', events)
      if (s.abilities[command.ability]! > 0) return reject(command, 'ability on cooldown', events)
      if (!inBounds(map, command.cell)) return reject(command, 'out of bounds', events)
      castAbility(s, command.ability, command.cell, events)
      return
    }

    case 'choose_relic': {
      if (s.relicOffer === null) return reject(command, 'no relic offer pending', events)
      if (command.relic === null) {
        s.relicOffer = null
        events.push({ type: 'relic_chosen', relic: null })
        return
      }
      if (!s.relicOffer.includes(command.relic)) return reject(command, 'relic not in the offer', events)
      s.relics.push(command.relic)
      s.relicOffer = null
      if (command.relic === 'golden_touch') {
        // Scale current HP proportionally: losing max HP must never make the
        // spire relatively healthier (a damaged spire used to "heal" on the
        // bar because only max dropped).
        const oldMax = s.spireMaxHp
        s.spireMaxHp = Math.max(1, Math.floor((oldMax * 90) / 100))
        s.spireHp = Math.max(1, Math.min(s.spireMaxHp, Math.floor((s.spireHp * s.spireMaxHp) / oldMax)))
      }
      events.push({ type: 'relic_chosen', relic: command.relic })
      return
    }
  }
}

function spawnDue(s: RunState, events: GameEvent[]): void {
  if (s.pendingSpawns.length === 0) return
  const due = s.pendingSpawns.filter((p) => p.tick <= s.tick)
  if (due.length === 0) return
  s.pendingSpawns = s.pendingSpawns.filter((p) => p.tick > s.tick)
  const map = getMap(s.mapId)
  for (const spawn of due) {
    const def = ENEMIES[spawn.type]
    const hp = scaledHp(spawn.type, s.hpScalePct)
    const id = s.nextEntityId
    s.nextEntityId += 1
    s.enemies.push({
      id,
      type: spawn.type,
      pos: cellCenter(map.spawn),
      hp,
      maxHp: hp,
      speed: def.speed,
      slowFactor: 100,
      slowTicks: 0,
      bounty: def.bounty,
      damage: def.damage,
      shield: def.shield,
      targetCell: null,
    })
    events.push({ type: 'enemy_spawned', id, enemy: spawn.type })
  }
}

function checkWaveEnd(s: RunState, events: GameEvent[]): void {
  if (s.pendingSpawns.length > 0 || s.enemies.length > 0) return
  s.wavesCleared = s.wave
  const goldAwarded = Math.floor(
    ((WAVE_CLEAR_GOLD_BASE + s.wave * WAVE_CLEAR_GOLD_PER_WAVE) * (100 + s.mods.goldPct)) / 100,
  )
  s.gold += goldAwarded
  events.push({ type: 'wave_cleared', wave: s.wave, goldAwarded })

  if (s.wave >= VICTORY_WAVE) {
    endRun(s, 'victory', events)
    return
  }

  s.phase = 'build'
  if (s.wave % RELIC_WAVE_INTERVAL === 0) {
    const pool = RELIC_IDS.filter((r) => !s.relics.includes(r))
    if (pool.length > 0) {
      const offer = drawRelicOffer(s, pool, Math.min(RELIC_OFFER_SIZE, pool.length)) as RelicId[]
      s.relicOffer = offer
      events.push({ type: 'relic_offered', options: [...offer] })
    }
  }
}

export function computeSparks(s: RunState, outcome: 'defeat' | 'victory'): number {
  const base = s.wavesCleared * 10 + Math.floor(s.kills / 6) + 5 + (outcome === 'victory' ? 500 : 0)
  let pct = 100 + s.mods.sparkPct
  if (s.relics.includes('spark_siphon')) pct += 25
  return Math.floor((base * pct) / 100)
}

function endRun(s: RunState, outcome: 'defeat' | 'victory', events: GameEvent[]): void {
  const sparks = computeSparks(s, outcome)
  s.phase = outcome
  s.sparksEarned = sparks
  s.relicOffer = null
  s.pendingSpawns = []
  events.push({ type: 'run_ended', outcome, wavesCleared: s.wavesCleared, kills: s.kills, sparks })
}
