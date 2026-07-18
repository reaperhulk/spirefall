import type { MetaState, RunState } from '../engine/types'

// localStorage persistence with an explicit schema version so future format
// changes migrate instead of corrupting old saves.

export interface SaveData {
  version: 1
  meta: MetaState
  run: RunState | null
}

const KEY = 'spirefall-save'

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { version?: number }
    return migrate(parsed)
  } catch {
    return null
  }
}

export function persistSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    // Storage full or blocked — the game keeps playing, just unsaved.
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}

// --- transfer codes ---------------------------------------------------------
// v2 codes are gzip-compressed (prefix "SF2:") — roughly 4× shorter than the
// raw-base64 v1 codes, which import still accepts. Imports run through the
// same migrate() path as a normal load so codes of any age stay valid.

const CODE_PREFIX = 'SF2:'

async function throughStream(bytes: Uint8Array, stream: { writable: WritableStream; readable: ReadableStream }): Promise<Uint8Array> {
  const writer = stream.writable.getWriter()
  void writer.write(bytes)
  void writer.close()
  const out: number[] = []
  const reader = stream.readable.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    out.push(...(value as Uint8Array))
  }
  return new Uint8Array(out)
}

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
    localStorage.setItem(KEY, JSON.stringify(data))
    return true
  } catch {
    return false
  }
}

function migrate(parsed: { version?: number }): SaveData | null {
  switch (parsed.version) {
    case 1: {
      const data = parsed as SaveData
      if (!data.meta || typeof data.meta.sparks !== 'number') return null
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
      }
      return data
    }
    default:
      return null
  }
}
