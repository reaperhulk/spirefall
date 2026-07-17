import {
  ABILITIES,
  BASE_WAVE_BUDGET,
  BOSS_WAVE_INTERVAL,
  ENEMIES,
  enhanceCost,
  hpGrowthPct,
  RELIC_IDS,
  RELIC_OFFER_SIZE,
  RELIC_WAVE_INTERVAL,
  relicSkipGold,
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
  WAVE_CLEAR_KNIT_HP,
} from '../data/content'
import {
  carrierBroods,
  castAbility,
  collectDead,
  drawRelicOffer,
  enemyAuras,
  moveEnemies,
  tickStatuses,
  towersFire,
} from './combat'
import { cloneRun } from './clone'
import { blockedGrid, canPlaceTower, cellCenter, distanceField, getMap, inBounds } from './grid'
import type { AffixId, Command, EnemyType, GameEvent, RelicId, RunState, StepResult, Targeting } from './types'
import { affixHpPct, affixSpeedPct, generateWave, scaledHp } from './waves'

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
      endRun(s, events)
    } else {
      enemyAuras(s, events)
      carrierBroods(s, events)
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
      // Concede: the run ends now and pays sparks for progress so far. If
      // the victory wave was already cleared, the cycle still counts as won.
      s.spireHp = 0
      endRun(s, events)
      return
    }

    case 'start_wave': {
      if (s.phase !== 'build') return reject(command, `phase is ${s.phase}`, events)
      const { wave, waveBudget, fielded } = nextWaveBudget(s)
      s.wave = wave
      s.waveBudget = waveBudget
      s.hpScalePct = wave === 1 ? 100 : Math.floor((s.hpScalePct * hpGrowthPct(wave)) / 100)
      const generated = generateWave(s.rng.waves, wave, fielded)
      s.rng.waves = generated.rng
      s.activeAffix = generated.affix
      s.pendingSpawns = generated.spawns.map((p) => ({ type: p.type, tick: s.tick + p.tick }))
      s.phase = 'wave'
      events.push({ type: 'wave_started', wave, spawnCount: s.pendingSpawns.length, affix: generated.affix })
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
        shots: 0,
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
      // A tower that never acted (no shots; for mints, no payouts) sells for
      // its full price — misplacements are a free undo until it does something.
      const refundPct = tower.shots === 0 ? 100 : SELL_REFUND_PCT
      const refund = Math.floor((towerInvested(tower.type, tower.tier) * refundPct) / 100)
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
        // Passing on all three is a paid choice, not a dead end — some
        // relics carry downsides worth more than the gold.
        const goldAwarded = relicSkipGold(s.wave)
        s.gold += goldAwarded
        s.relicOffer = null
        events.push({ type: 'relic_chosen', relic: null, goldAwarded })
        return
      }
      if (!s.relicOffer.includes(command.relic)) return reject(command, 'relic not in the offer', events)
      s.relics.push(command.relic)
      s.relicOffer = null
      if (command.relic === 'golden_touch') reduceSpireMax(s, 90)
      if (command.relic === 'glass_cannon') reduceSpireMax(s, 80)
      events.push({ type: 'relic_chosen', relic: command.relic, goldAwarded: 0 })
      return
    }
  }
}

// The exact budget arithmetic start_wave will use for the NEXT wave — shared
// with previewNextWave so the scouting report can never drift from reality.
// The first waves field reduced strength: at 10 spire HP a fresh defense must
// not be forced to leak half its life to opening RNG.
function nextWaveBudget(s: RunState): { wave: number; waveBudget: number; fielded: number } {
  const wave = s.wave + 1
  const waveBudget = wave === 1 ? BASE_WAVE_BUDGET : Math.floor((s.waveBudget * WAVE_BUDGET_GROWTH_PCT) / 100)
  const budgetPct = wave === 1 ? 50 : wave === 2 ? 65 : wave === 3 ? 80 : wave === 4 ? 90 : 100
  return { wave, waveBudget, fielded: Math.floor((waveBudget * budgetPct) / 100) }
}

export interface WavePreview {
  wave: number
  affix: AffixId | null
  boss: boolean
  counts: Partial<Record<EnemyType, number>>
  total: number
}

// A pure scouting report of the next wave. It runs the real generator against
// the CURRENT waves stream without committing the advanced stream back, so
// previewing never changes anything and start_wave always fields exactly what
// was previewed.
export function previewNextWave(s: RunState): WavePreview | null {
  if (s.phase !== 'build') return null
  const { wave, fielded } = nextWaveBudget(s)
  const generated = generateWave(s.rng.waves, wave, fielded)
  const counts: Partial<Record<EnemyType, number>> = {}
  for (const spawn of generated.spawns) counts[spawn.type] = (counts[spawn.type] ?? 0) + 1
  return {
    wave,
    affix: generated.affix,
    boss: wave % BOSS_WAVE_INTERVAL === 0,
    counts,
    total: generated.spawns.length,
  }
}

// Scale current HP proportionally with a max-HP reduction: losing max HP must
// never make the spire relatively healthier on the bar.
function reduceSpireMax(s: RunState, keepPct: number): void {
  const oldMax = s.spireMaxHp
  s.spireMaxHp = Math.max(1, Math.floor((oldMax * keepPct) / 100))
  s.spireHp = Math.max(1, Math.min(s.spireMaxHp, Math.floor((s.spireHp * s.spireMaxHp) / oldMax)))
}

function spawnDue(s: RunState, events: GameEvent[]): void {
  if (s.pendingSpawns.length === 0) return
  const due = s.pendingSpawns.filter((p) => p.tick <= s.tick)
  if (due.length === 0) return
  s.pendingSpawns = s.pendingSpawns.filter((p) => p.tick > s.tick)
  const map = getMap(s.mapId)
  for (const spawn of due) {
    const def = ENEMIES[spawn.type]
    const hp = Math.max(1, Math.floor((scaledHp(spawn.type, s.hpScalePct) * affixHpPct(s.activeAffix)) / 100))
    const speed = Math.floor((def.speed * affixSpeedPct(s.activeAffix)) / 100)
    // Shields grow at HALF the HP curve's rate. A static shield is trivia
    // once damage multipliers stack; full-rate scaling walls out even heavy
    // shells at a sharp cliff. Half-rate keeps the composition check honest:
    // permanently above rapid-fire chip damage, below cannon shells until
    // deep endless, and always pierced by snipers.
    const shieldScalePct = 100 + Math.floor((s.hpScalePct - 100) / 2)
    const shield = def.shield > 0 ? Math.max(def.shield, Math.floor((def.shield * shieldScalePct) / 100)) : 0
    const id = s.nextEntityId
    s.nextEntityId += 1
    s.enemies.push({
      id,
      type: spawn.type,
      pos: cellCenter(map.spawn),
      hp,
      maxHp: hp,
      speed,
      slowFactor: 100,
      slowTicks: 0,
      bounty: def.bounty,
      damage: def.damage,
      shield,
      healCooldown: def.heal ? def.heal.everyTicks : 0,
      broodCooldown: def.brood ? def.brood.everyTicks : 0,
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

  // The spire knits itself a little after every survived wave — early
  // scratches are forgivable; late-game floods far outpace it.
  if (s.spireHp < s.spireMaxHp) {
    s.spireHp = Math.min(s.spireMaxHp, s.spireHp + WAVE_CLEAR_KNIT_HP)
    events.push({ type: 'spire_repaired', amount: WAVE_CLEAR_KNIT_HP, cost: 0, spireHp: s.spireHp })
  }

  // Mints pay out on every cleared wave.
  const mintBonus = s.relics.includes('mint_condition') ? 50 : 0
  for (const t of s.towers) {
    if (t.type !== 'mint') continue
    const base = towerTier('mint', t.tier).mintYield!
    const amount = Math.floor((base * (100 + s.mods.goldPct + mintBonus + 10 * t.enhance)) / 100)
    s.gold += amount
    t.shots += 1 // a payout counts as "acting" — the mint no longer sells at 100%
    events.push({ type: 'mint_income', id: t.id, amount })
  }

  // Clearing the victory wave completes the cycle — but the run continues
  // into the endless if the player wants to push further. Sparks keep
  // accruing; the victory bonus is banked whenever the run finally ends.
  if (s.wave >= VICTORY_WAVE && !s.victoryClaimed) {
    s.victoryClaimed = true
    events.push({ type: 'victory_achieved', wave: s.wave })
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

export function computeSparks(s: RunState): number {
  // Sparks are earned by PROGRESS only: waves cleared this run (skipped
  // starting waves excluded) and kills. No flat participation payout — a
  // zero-progress run pays zero, so instantly abandoning runs farms nothing.
  // kills/12 (not /6): horde waves double the body count, so the per-kill
  // rate halves to keep spark income on the same curve.
  const cleared = Math.max(0, s.wavesCleared - s.startWave)
  const base = cleared * 15 + Math.floor(s.kills / 12) + (s.victoryClaimed ? 500 : 0)
  let pct = 100 + s.mods.sparkPct
  if (s.relics.includes('spark_siphon')) pct += 25
  return Math.floor((base * pct) / 100)
}

// A run ends when the spire falls or the player concedes. If the victory
// wave was cleared at any point, the cycle counts as won — endless waves
// past it only add to the spoils.
function endRun(s: RunState, events: GameEvent[]): void {
  const outcome = s.victoryClaimed ? 'victory' : 'defeat'
  const sparks = computeSparks(s)
  s.phase = outcome
  s.sparksEarned = sparks
  s.relicOffer = null
  s.pendingSpawns = []
  events.push({ type: 'run_ended', outcome, wavesCleared: s.wavesCleared, kills: s.kills, sparks })
}
