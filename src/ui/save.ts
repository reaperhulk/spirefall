import { META_TREE } from '../data/metaTree'
import { EMBER_TREE } from '../data/emberTree'
import { BIOME_IDS } from '../data/biomes'
import { measure } from './performance'
import { MAX_TRANSFER_BYTES, throughStream } from './boundedStream'
import { COLLECT_RADIUS_BASE, CRUCIBLE_MAX_RANK, RELIC_SEALS } from '../data/content'
import { finiteTree, parseRecording, validRun, type Recording } from './validation'
import { deriveStream } from '../engine/rng'
import type { MetaState, RunState } from '../engine/types'

// localStorage persistence with an explicit schema version so future format
// changes migrate instead of corrupting old saves.

export interface SaveData {
  version: 1
  meta: MetaState
  run: RunState | null
  recording?: Recording
}

const KEY = 'spirefall-save'
const BACKUP = `${KEY}-backup`
const CORRUPT = `${KEY}-corrupt`
// Set by migrate() when a save's run was unrestorable and dropped (the
// account survives). Read immediately after a migrate() call.
let runDropped = false
let reloadPending = false
export const saveReloadPending = () => reloadPending
let lastGoodRaw: string | null = null
let status = ''
const listeners = new Set<() => void>()
export const getSaveStatus = () => status
export const subscribeSaveStatus = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
function report(message: string) { if (status !== message) { status = message; for (const fn of listeners) fn() } }
let recordingProvider: (() => Recording | undefined) | undefined
export function registerRecording(provider: () => Recording | undefined): () => void {
  recordingProvider = provider
  return () => { if (recordingProvider === provider) recordingProvider = undefined }
}
export function loadSave(): SaveData | null {
  for (const key of [KEY, BACKUP]) {
    let raw: string | null = null
    try {
      raw = localStorage.getItem(key)
      if (!raw) continue
      const data = raw.length > MAX_TRANSFER_BYTES ? null : migrate(JSON.parse(raw) as {version?: number})
      if (!data) { quarantine(raw); continue }
      lastGoodRaw = raw
      if (runDropped) report('Your in-progress run could not be restored; your account progress is safe.')
      else if (key === BACKUP) report('Recovered your previous save checkpoint.')
      return data
    } catch {
      // Try the last good backup.
      if (raw) quarantine(raw)
    }
  }
  return null
}
// An unreadable save is copied aside before anything can overwrite it, so a
// future fix (or a person) can still recover the account. The first corrupt
// copy wins: a later, emptier failure never replaces it.
function quarantine(raw: string): void {
  try { if (localStorage.getItem(CORRUPT) === null) localStorage.setItem(CORRUPT, raw) } catch { /* blocked storage */ }
}
// The newest state the game asked to save, whether or not storage accepted
// it: Export reads this, so it hands out live progress exactly when saving
// is failing.
let latest: SaveData | null = null
export function persistSave(data: SaveData): boolean {
  const started = performance.now()
  latest = { version: data.version, meta: data.meta, run: data.run }
  const write = (raw: string) => {
    if (raw.length > MAX_TRANSFER_BYTES) throw new Error('Save too large')
    if (lastGoodRaw) localStorage.setItem(BACKUP, lastGoodRaw)
    localStorage.setItem(KEY, raw)
    lastGoodRaw = raw
  }
  try {
    const recording = data.run ? recordingProvider?.() : undefined
    const withRecording = recording?.endTick === data.run?.tick && recording?.initial.seed === data.run?.seed
    try {
      write(JSON.stringify(withRecording ? { ...data, recording } : data))
    } catch (error) {
      // The recording is the bulky, optional part: a run still resumes from
      // its checkpoint without it (only the full-run replay is lost).
      if (!withRecording) throw error
      write(JSON.stringify({ version: data.version, meta: data.meta, run: data.run }))
    }
    report('')
    measure('save', performance.now() - started)
    return true
  } catch {
    report('Progress could not be saved. Free browser storage or export your progress in Settings.')
    return false
  }
}
export function clearSave(): void {
  reloadPending = true
  latest = null
  try { localStorage.removeItem(KEY); localStorage.removeItem(BACKUP); lastGoodRaw = null } catch { /* blocked storage */ }
}

// --- transfer codes ---------------------------------------------------------
// v2 codes are gzip-compressed (prefix "SF2:") — roughly 4× shorter than the
// raw-base64 v1 codes, which import still accepts. Imports run through the
// same migrate() path as a normal load so codes of any age stay valid.

const CODE_PREFIX = 'SF2:'


function toBase64(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

export async function exportSave(): Promise<string | null> {
  try {
    const raw = latest ? JSON.stringify(latest) : localStorage.getItem(KEY)
    if (!raw) return null
    const bytes = new TextEncoder().encode(raw)
    if (typeof CompressionStream !== 'undefined') {
      const packed = await throughStream(bytes, new CompressionStream('gzip'))
      return CODE_PREFIX + toBase64(packed)
    }
    return toBase64(bytes) // legacy path for browsers without CompressionStream
  } catch {
    return null
  }
}

export async function importSave(code: string): Promise<boolean> {
  try {
    if (code.length > MAX_TRANSFER_BYTES) return false
    const trimmed = code.trim()
    let raw: string
    if (trimmed.startsWith(CODE_PREFIX)) {
      const bytes = Uint8Array.from(atob(trimmed.slice(CODE_PREFIX.length)), (c) => c.charCodeAt(0))
      raw = new TextDecoder().decode(await throughStream(bytes, new DecompressionStream('gzip')))
    } else {
      raw = new TextDecoder().decode(Uint8Array.from(atob(trimmed), (c) => c.charCodeAt(0)))
    }
    const parsed = JSON.parse(raw) as { version?: number }
    const data = migrate(parsed)
    if (!data) return false
    const saved = persistSave(data)
    if (saved) reloadPending = true
    return saved
  } catch {
    return false
  }
}

// Clamp any node above its current max level and bank the Sparks those
// levels cost. Levels are refunded top-down from the ORIGINAL price list,
// which for a shrunk node is its old cost array; only Honed Edge III shrank.
const RETIRED_COSTS: Partial<Record<string, number[]>> = {
  tower_damage_3: [3664, 4946, 6677, 9014, 12169, 16428, 22178, 29940, 40419],
}
export function refundBeyondCap(meta: MetaState): void {
  for (const [id, costs] of Object.entries(RETIRED_COSTS)) {
    const level = meta.upgrades[id]
    const def = META_TREE.find(d => d.id === id)
    if (!def || !costs || typeof level !== 'number' || level <= def.maxLevel) continue
    let refund = 0
    for (let i = def.maxLevel; i < Math.min(level, costs.length); i++) refund += costs[i]!
    meta.upgrades[id] = def.maxLevel
    meta.sparks += refund
  }
}

function migrate(parsed: { version?: number }): SaveData | null {
  runDropped = false
  switch (parsed.version) {
    case 1: {
      const data = parsed as SaveData
      if (!data.meta || !finiteTree(data) || !Number.isSafeInteger(data.meta.sparks) || data.meta.sparks < 0 || !data.meta.upgrades) return null
      if (!['runs', 'totalSparks'].every(k => Number.isSafeInteger((data.meta as unknown as Record<string, number>)[k]))) return null
      if (!Object.values(data.meta.upgrades).every(n => Number.isSafeInteger(n) && n >= 0)) return null
      // Ascension-era meta fields — backfill pre-ascension saves.
      data.meta.victories ??= 0
      data.meta.cycleVictories ??= 0
      data.meta.embers ??= 0
      data.meta.ascensions ??= 0
      data.meta.emberUpgrades ??= {}
      data.meta.bestWave ??= 0
      data.meta.bestWaveByMap ??= {}
      data.meta.lifetimeKills ??= 0
      data.meta.history ??= []
      data.meta.achievements ??= []
      // Skill-tree restructure: Honed Edge was one 25-level node and is now
      // three veins of 8/8/9 carrying the SAME cost entries in the same
      // order. Spread an old level count across them and the account keeps
      // exactly the damage it paid for — lossless in value, not in shape.
      const honed = data.meta.upgrades?.['tower_damage']
      if (typeof honed === 'number' && honed > 8) {
        data.meta.upgrades['tower_damage'] = 8
        data.meta.upgrades['tower_damage_2'] = Math.min(honed - 8, 8)
        if (honed > 16) data.meta.upgrades['tower_damage_3'] = Math.min(honed - 16, 9)
      }
      // Honed Edge III shrank from nine levels to four. Levels beyond the new
      // cap are refunded at exactly what they cost, so no account loses value.
      refundBeyondCap(data.meta)
      const nat = (n: unknown) => Number.isSafeInteger(n) && (n as number) >= 0
      const counters = ['sparks','totalSparks','runs','victories','cycleVictories','embers','ascensions','bestWave','lifetimeKills']
      if (data.meta.schemaVersion !== 1 || !counters.every(k => nat((data.meta as unknown as Record<string,unknown>)[k]))) return null
      // Rules-6 incremental fields are optional; absent values derive from the old ones.
      const optional = ['cycleEmbers','cycleSparks','crucibleUnlocked','crucibleRank']
      if (!optional.every(k => { const v = (data.meta as unknown as Record<string,unknown>)[k]; return v === undefined || nat(v) })) return null
      if ((data.meta.crucibleUnlocked ?? 0) > CRUCIBLE_MAX_RANK) return null
      if (data.meta.relicSeals !== undefined && (!Array.isArray(data.meta.relicSeals) || !data.meta.relicSeals.every(id => RELIC_SEALS.some(seal => seal.id === id)))) return null
      if (!Object.entries(data.meta.upgrades).every(([id,n]) => { const def = META_TREE.find(d => d.id === id); return def && nat(n) && n <= def.maxLevel })) return null
      if (!Object.entries(data.meta.emberUpgrades).every(([id,n]) => { const def = EMBER_TREE.find(d => d.id === id); return def && nat(n) && n <= def.maxLevel })) return null
      if (data.meta.guardianMilestones !== undefined && (!Array.isArray(data.meta.guardianMilestones) || !data.meta.guardianMilestones.every(id => ['boss','boss2','boss3'].includes(id)))) return null
      if (!Object.values(data.meta.bestWaveByMap).every(nat) || !Array.isArray(data.meta.achievements) || !data.meta.achievements.every(a => typeof a === 'string')) return null
      if (!Array.isArray(data.meta.history) || !data.meta.history.every(h => ['defeat','victory'].includes(h.outcome) && [h.wavesCleared,h.kills,h.sparks].every(nat) && (h.biome === undefined || BIOME_IDS.includes(h.biome)) && (h.crucible === undefined || nat(h.crucible)))) return null
      // Discard finished runs; they only exist mid-play.
      if (data.run && (data.run.phase === 'defeat' || data.run.phase === 'victory')) {
        return { ...data, run: null }
      }
      // A run that cannot be restored costs only that run, never the account.
      if (data.run && !restoreRun(data)) {
        runDropped = true
        delete data.recording
        return { ...data, run: null }
      }
      return data
    }
    default:
      return null
  }
}

// Backfill a saved run's additive fields and validate it. False means the
// run is unrestorable (malformed, or an invariant the engine no longer
// accepts); the caller drops just the run.
function restoreRun(data: SaveData): boolean {
  const run = data.run
  if (!run) return true
  try {
    // Additive fields introduced after launch — backfill old saves.
    for (const t of run.towers) {
      t.enhance ??= 0
      t.kills ??= 0
      t.damageDealt ??= 0
      // Pre-`shots` saves: infer "has acted" so old towers don't all
      // become free full refunds.
      t.shots ??= t.damageDealt > 0 || t.kills > 0 ? 1 : 0
      t.spec ??= null
    }
    for (const e of run.enemies) {
      e.armor ??= 0
      e.healCooldown ??= 0
      e.broodCooldown ??= 0
      e.phased ??= false
      e.phaseCooldown ??= 0
      e.burnTicks ??= 0
      e.burnPerTick ??= 0
      e.overcharge ??= 0
      e.mechCooldown ??= 0
      e.mechActiveTicks ??= 0
      e.brittleTicks ??= 0
    }
    run.activeAffix ??= null
    run.victoryClaimed ??= false
    run.startWave ??= 0
    run.cataclysms ??= []
    run.relicRerolled ??= false
    run.bulwarkTicks ??= 0
    run.damageByTower ??= {}
    run.killsByEnemy ??= {}
    run.hpByWave ??= []
    run.repairsThisWave ??= 0
    run.trials ??= []
    run.crucible ??= 0
    // Biome-era fields: old saves keep playing their fixed map.
    run.biome ??= 'verdant'
    run.mapSeed ??= ''
    run.mods.critChancePct ??= 0
    run.mods.abilityCdPct ??= 0
    run.mods.repairCasts ??= 0
    run.cataclysmOffer ??= null
    run.maxRampStacks ??= 0
    run.combo ??= 0
    run.comboTicks ??= 0
    run.bestCombo ??= 0
    // Pre-boon saves: no offer mid-run (the next wave clear draws one),
    // and the stream derives fresh from the seed.
    run.boonOffer ??= null
    run.activeBoon ??= null
    run.rng.boons ??= deriveStream(run.seed, 'boons')
    run.doctrine ??= null
    run.commandCharges ??= 3
    run.commandRecharge ??= 0
    run.executeCd ??= 0
    run.beamTarget ??= null
    run.beamHeat ??= 0
    run.beamOverheated ??= false
    run.coins ??= []
    run.collectAt ??= null
    run.mods.collectRadius ??= COLLECT_RADIUS_BASE
    run.mods.autoCollectRadius ??= 0
    // Ash branch (skill-tree restructure): pre-tree runs have no
    // cooldown shaving, and an undefined here would poison the
    // arithmetic that reads it every execute and every overcharge.
    run.mods.executeCdPct ??= 0
    run.mods.overchargeCdPct ??= 0
    if (!validRun(run)) return false
    if (data.recording) {
      const recording = parseRecording(JSON.stringify(data.recording))
      if (recording && recording.endTick === run.tick && recording.initial.seed === run.seed) data.recording = recording
      else delete data.recording // old saves still resume from their checkpoint
    }
    return true
  } catch {
    return false
  }
}
