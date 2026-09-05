import { MAX_TRANSFER_BYTES, throughStream } from './boundedStream'
import { COLLECT_RADIUS_BASE } from '../data/content'
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
    try {
      const raw = localStorage.getItem(key)
      if (!raw || raw.length > MAX_TRANSFER_BYTES) continue
      const data = migrate(JSON.parse(raw) as {version?: number})
      if (!data) continue
      lastGoodRaw = raw
      if (key === BACKUP) report('Recovered your previous save checkpoint.')
      if (data.run && !validRun(data.run)) return null
      if (data.recording) {
        const recording = parseRecording(JSON.stringify(data.recording))
        if (recording && data.run && recording.endTick === data.run.tick && recording.initial.seed === data.run.seed) data.recording = recording
        else delete data.recording // old saves still resume from their checkpoint
      }
      return data
    } catch { /* Try the last good backup. */ }
  }
  return null
}
export function persistSave(data: SaveData): boolean {
  try {
    const recording = data.run ? recordingProvider?.() : undefined
    const payload = recording?.endTick === data.run?.tick && recording?.initial.seed === data.run?.seed ? { ...data, recording } : data
    const raw = JSON.stringify(payload)
    if (raw.length > MAX_TRANSFER_BYTES) throw new Error('Save too large')
    if (lastGoodRaw) localStorage.setItem(BACKUP, lastGoodRaw)
    localStorage.setItem(KEY, raw)
    lastGoodRaw = raw
    report('')
    return true
  } catch {
    report('Progress could not be saved. Free browser storage or export your progress in Settings.')
    return false
  }
}
export function clearSave(): void {
  reloadPending = true
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
    const raw = localStorage.getItem(KEY)
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

function migrate(parsed: { version?: number }): SaveData | null {
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
      // Discard finished runs; they only exist mid-play.
      if (data.run && (data.run.phase === 'defeat' || data.run.phase === 'victory')) {
        return { ...data, run: null }
      }
      // Additive fields introduced after launch — backfill old saves.
      if (data.run) {
        for (const t of data.run.towers) {
          t.enhance ??= 0
          t.kills ??= 0
          t.damageDealt ??= 0
          // Pre-`shots` saves: infer "has acted" so old towers don't all
          // become free full refunds.
          t.shots ??= t.damageDealt > 0 || t.kills > 0 ? 1 : 0
          t.spec ??= null
        }
        for (const e of data.run.enemies) {
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
        data.run.activeAffix ??= null
        data.run.victoryClaimed ??= false
        data.run.startWave ??= 0
        data.run.cataclysms ??= []
        data.run.relicRerolled ??= false
        data.run.bulwarkTicks ??= 0
        data.run.damageByTower ??= {}
        data.run.killsByEnemy ??= {}
        data.run.hpByWave ??= []
        data.run.repairsThisWave ??= 0
        data.run.trials ??= []
        data.run.crucible ??= 0
        // Biome-era fields: old saves keep playing their fixed map.
        data.run.biome ??= 'verdant'
        data.run.mapSeed ??= ''
        data.run.mods.critChancePct ??= 0
        data.run.mods.abilityCdPct ??= 0
        data.run.mods.repairCasts ??= 0
        data.run.cataclysmOffer ??= null
        data.run.maxRampStacks ??= 0
        data.run.combo ??= 0
        data.run.comboTicks ??= 0
        data.run.bestCombo ??= 0
        // Pre-boon saves: no offer mid-run (the next wave clear draws one),
        // and the stream derives fresh from the seed.
        data.run.boonOffer ??= null
        data.run.activeBoon ??= null
        data.run.rng.boons ??= deriveStream(data.run.seed, 'boons')
        data.run.doctrine ??= null
        data.run.commandCharges ??= 3
        data.run.commandRecharge ??= 0
        data.run.executeCd ??= 0
        data.run.beamTarget ??= null
        data.run.beamHeat ??= 0
        data.run.beamOverheated ??= false
        data.run.coins ??= []
        data.run.collectAt ??= null
        data.run.mods.collectRadius ??= COLLECT_RADIUS_BASE
        data.run.mods.autoCollectRadius ??= 0
        // Ash branch (skill-tree restructure): pre-tree runs have no
        // cooldown shaving, and an undefined here would poison the
        // arithmetic that reads it every execute and every overcharge.
        data.run.mods.executeCdPct ??= 0
        data.run.mods.overchargeCdPct ??= 0
      }
      if (data.run && !validRun(data.run)) return null
      if (data.recording) {
        const recording = parseRecording(JSON.stringify(data.recording))
        if (recording && data.run && recording.endTick === data.run.tick && recording.initial.seed === data.run.seed) data.recording = recording
        else delete data.recording // old saves still resume from their checkpoint
      }
      return data
    }
    default:
      return null
  }
}
