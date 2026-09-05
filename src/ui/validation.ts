import { ABILITIES, BOONS, CATACLYSMS, ENEMIES, RELICS, TOWERS, TOWER_SPECS } from '../data/content'
import { BIOME_IDS } from '../data/biomes'
import { assertInvariants } from '../engine/invariants'
import type { Command, RunState } from '../engine/types'
import type { LoggedCommand } from './session'
import { MAX_TRANSFER_BYTES } from './boundedStream'

// Gameplay rules are part of a recording, separate from the save schema.
export const RULES_VERSION = 1
export interface Recording { v: 3; rules: number; initial: RunState; log: LoggedCommand[]; endTick: number }
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const nat = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0
export function finiteTree(value: unknown, depth = 0): boolean {
  if (depth > 40) return false
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.length <= 120000 && value.every(v => finiteTree(v, depth + 1))
  if (object(value)) return Object.entries(value).every(([k, v]) => !['__proto__', 'constructor', 'prototype'].includes(k) && finiteTree(v, depth + 1))
  return value === null || typeof value === 'boolean' || typeof value === 'string'
}
export function validRun(value: unknown): value is RunState {
  try {
    if (!object(value) || !finiteTree(value)) return false
    const s = value as unknown as RunState
    if (s.schemaVersion !== 1 || typeof s.seed !== 'string' || s.seed.length > 512 || typeof s.mapSeed !== 'string') return false
    if (!BIOME_IDS.includes(s.biome) || !nat(s.mapId) || !nat(s.tick)) return false
    if (!s.availableTowers.every(t => t in TOWERS) || !s.relics.every(r => r in RELICS)) return false
    if (!s.towers.every(t => t.type in TOWERS && (t.spec === null || t.spec in TOWER_SPECS))) return false
    if (!s.enemies.every(e => e.type in ENEMIES) || !s.pendingSpawns.every(e => e.type in ENEMIES && nat(e.tick))) return false
    if (!Object.keys(s.abilities).every(a => a in ABILITIES)) return false
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
    case 'start_wave': case 'abandon_run': case 'repair_spire': case 'reroll_relic': return true
    case 'place_tower': return typeof c.tower === 'string' && c.tower in TOWERS && cell(c.cell)
    case 'upgrade_tower': case 'sell_tower': case 'overcharge_tower': case 'execute_enemy': return nat(c.id)
    case 'specialize_tower': return nat(c.id) && typeof c.spec === 'string' && c.spec in TOWER_SPECS
    case 'choose_boon': return typeof c.boon === 'string' && c.boon in BOONS
    case 'choose_relic': return c.relic === null || (typeof c.relic === 'string' && c.relic in RELICS)
    case 'choose_cataclysm': return typeof c.cataclysm === 'string' && c.cataclysm in CATACLYSMS
    case 'set_beam': return vec(c.target)
    case 'set_collect': return vec(c.at)
    case 'set_targeting': return nat(c.id) && ['first','last','strongest','weakest','nearest','elites'].includes(String(c.targeting))
    case 'cast_ability': return typeof c.ability === 'string' && c.ability in ABILITIES && cell(c.cell)
    default: return false
  }
}
export function parseRecording(text: string): Recording | null {
  if (text.length > MAX_TRANSFER_BYTES) return null
  try {
    const d = JSON.parse(text) as Recording
    // v2 has no rules marker; only accept it while these original rules run.
    const legacy = (d as {v: number}).v === 2 && RULES_VERSION === 1
    if ((!legacy && (d.v !== 3 || d.rules !== RULES_VERSION)) || !validRun(d.initial) || !Array.isArray(d.log) || d.log.length > 120000) return null
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
