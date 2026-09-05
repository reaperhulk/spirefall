import { DOCTRINES } from '../data/doctrines'
import { ABILITIES, BOONS, CATACLYSMS, ENEMIES, RELICS, TOWERS, TOWER_SPECS } from '../data/content'
import { MAPS } from '../data/maps'
import { BIOME_IDS } from '../data/biomes'
import { assertInvariants } from '../engine/invariants'
import type { Command, RunState } from '../engine/types'
import type { LoggedCommand } from './session'
import { MAX_TRANSFER_BYTES } from './boundedStream'

// Gameplay rules are part of a recording, separate from the save schema.
export const RULES_VERSION: number = 4
export interface Recording { seed?: string; v: 3; rules: number; initial: RunState; log: LoggedCommand[]; endTick: number }
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const nat = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0
export function finiteTree(value: unknown, depth = 0): boolean {
  if (depth > 40) return false
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.length <= 120000 && value.every(v => finiteTree(v, depth + 1))
  if (object(value)) return Object.entries(value).every(([k, v]) => !['__proto__', 'constructor', 'prototype'].includes(k) && finiteTree(v, depth + 1))
  return value === null || typeof value === 'boolean' || typeof value === 'string'
}
const known = (table: object, value: unknown): boolean => typeof value === 'string' && Object.hasOwn(table,value)
const specIds = new Set(Object.values(TOWER_SPECS).flat().map(s => s.id))
const targeting = ['first','last','strongest','weakest','nearest','elites']
const cell = (v: unknown) => object(v) && nat(v.cx) && nat(v.cy) && v.cx < 24 && v.cy < 14
export function validRun(value: unknown): value is RunState {
  try {
    if (!object(value) || !finiteTree(value)) return false
    const s = value as unknown as RunState
    if (s.schemaVersion !== 1 || typeof s.seed !== 'string' || s.seed.length > 512 || typeof s.mapSeed !== 'string') return false
    if (!BIOME_IDS.includes(s.biome) || !nat(s.mapId) || !nat(s.tick) || s.mapSeed.length > 512 || (s.mapSeed === '' && s.mapId >= MAPS.length)) return false
    if (s.layoutVersion !== undefined && ![1,2].includes(s.layoutVersion)) return false
    const counters = ['wave','startWave','wavesCleared','kills','gold','spireHp','spireMaxHp','waveBudget','hpScalePct','nextEntityId','goldRushTicks','bulwarkTicks','executeCd','beamHeat','crucible','maxRampStacks','combo','comboTicks','bestCombo','repairsThisWave','sparksEarned']
    if (!counters.every(k => nat(value[k]))) return false
    if (!['victoryClaimed','relicRerolled','beamOverheated'].every(k => typeof value[k] === 'boolean')) return false
    if (!object(s.mods) || !(['damagePct','goldPct','sparkPct','critChancePct','abilityCdPct','repairCasts','collectRadius','autoCollectRadius','executeCdPct','overchargeCdPct'] as const).every(k => Number.isSafeInteger(s.mods[k]))) return false
    if (s.doctrine != null && !(known(DOCTRINES, s.doctrine))) return false
    if (s.commandCharges !== undefined && (!nat(s.commandCharges) || s.commandCharges > 3)) return false
    if (s.commandRecharge !== undefined && !nat(s.commandRecharge)) return false
    for (const v of [s.beamTarget, s.collectAt]) if (v !== null && (!object(v) || !nat(v.x) || !nat(v.y) || v.x > 24000 || v.y > 14000)) return false
    if (!s.coins.every(c => nat(c.id) && nat(c.gold) && nat(c.bornTick) && object(c.pos) && nat(c.pos.x) && nat(c.pos.y))) return false
    if (s.shrine && (!cell(s.shrine.cell) || !['offered','active','won','lost'].includes(s.shrine.status) || !nat(s.shrine.wave) || (s.shrine.guardTicks !== undefined && !nat(s.shrine.guardTicks)))) return false
    if (s.leaks && (!Array.isArray(s.leaks) || s.leaks.length > 512 || !s.leaks.every(l => known(ENEMIES, l.enemy) && nat(l.tick) && l.tick <= s.tick && nat(l.wave) && nat(l.damage)))) return false
    if (s.relicOffer !== null && !s.relicOffer.every(r => known(RELICS, r))) return false
    if (s.boonOffer !== null && (!Array.isArray(s.boonOffer) || !s.boonOffer.every(b => known(BOONS, b)))) return false
    if (s.activeBoon !== null && !(known(BOONS, s.activeBoon))) return false
    if (!object(s.rng.boons) || !(['a','b','c','d'] as const).every(k => nat(s.rng.boons[k]) && s.rng.boons[k] <= 0xffffffff)) return false
    if (!Object.keys(s.damageByTower).every(t => known(TOWERS, t)) || !Object.keys(s.killsByEnemy).every(e => known(ENEMIES, e))) return false
    if (!s.availableTowers.every(t => known(TOWERS, t)) || !s.relics.every(r => known(RELICS, r))) return false
    if (!s.towers.every(t => known(TOWERS, t.type) && nat(t.id) && cell(t.cell) && targeting.includes(t.targeting) && (t.spec === null || (t.tier === 3 && TOWER_SPECS[t.type]?.some(sp => sp.id === t.spec))))) return false
    if (!s.enemies.every(e => known(ENEMIES, e.type) && nat(e.id) && typeof e.phased === 'boolean' && ['hp','maxHp','speed','bounty','damage','shield','burnTicks','burnPerTick','overcharge','mechCooldown','mechActiveTicks','brittleTicks'].every(k => nat((e as unknown as Record<string,unknown>)[k])) && (e.targetCell === null || cell(e.targetCell))) || !s.pendingSpawns.every(e => known(ENEMIES, e.type) && nat(e.tick))) return false
    if (!Object.keys(s.abilities).every(a => known(ABILITIES, a))) return false
    assertInvariants(s)
    return true
  } catch { return false }
}
function validCommand(value: unknown): value is Command {
  if (!object(value)) return false
  const c = value
  const cell = (v: unknown) => object(v) && nat(v.cx) && nat(v.cy) && v.cx < 24 && v.cy < 14
  const vec = (v: unknown) => v === null || (object(v) && nat(v.x) && nat(v.y) && v.x <= 24000 && v.y <= 14000)
  switch (c.type) {
    case 'choose_doctrine': return typeof c.doctrine === 'string' && known(DOCTRINES, c.doctrine)
    case 'defend_shrine': case 'start_wave': case 'abandon_run': case 'repair_spire': return true
    case 'reroll_relic': return c.focus === undefined || (typeof c.focus === 'string' && known(DOCTRINES, c.focus))
    case 'place_tower': return typeof c.tower === 'string' && known(TOWERS, c.tower) && cell(c.cell)
    case 'upgrade_tower': case 'sell_tower': case 'overcharge_tower': case 'execute_enemy': return nat(c.id)
    case 'specialize_tower': return nat(c.id) && typeof c.spec === 'string' && specIds.has(c.spec as never)
    case 'choose_boon': return typeof c.boon === 'string' && known(BOONS, c.boon)
    case 'choose_relic': return c.relic === null || (typeof c.relic === 'string' && known(RELICS, c.relic))
    case 'choose_cataclysm': return typeof c.cataclysm === 'string' && known(CATACLYSMS, c.cataclysm)
    case 'set_beam': return vec(c.target)
    case 'set_collect': return vec(c.at)
    case 'set_targeting': return nat(c.id) && ['first','last','strongest','weakest','nearest','elites'].includes(String(c.targeting))
    case 'cast_ability': return typeof c.ability === 'string' && known(ABILITIES, c.ability) && cell(c.cell)
    default: return false
  }
}
export function parseRecording(text: string): Recording | null {
  if (text.length > MAX_TRANSFER_BYTES) return null
  try {
    const d = JSON.parse(text) as Recording
    // v2 has no rules marker; only accept it while these original rules run.
    const legacy = (d as {v: number}).v === 2 && RULES_VERSION === 1
    // Rules 4 adds an opt-in focused reroll; rules-3 commands retain exactly
    // their prior semantics and RNG consumption. Explicit compatibility.
    if ((!legacy && (d.v !== 3 || ![3, RULES_VERSION].includes(d.rules))) || !validRun(d.initial) || !Array.isArray(d.log) || d.log.length > 120000) return null
    let previous = d.initial.tick
    for (const c of d.log) {
      if (!object(c) || !nat(c.tick) || c.tick < previous || !validCommand(c.command)) return null
      previous = c.tick
    }
    const endTick = d.endTick ?? previous + 1
    if (!nat(endTick) || endTick < previous || endTick - d.initial.tick > 1080000) return null
    return { v: 3, rules: RULES_VERSION, initial: d.initial, log: d.log, endTick }
  } catch { return null }
}
