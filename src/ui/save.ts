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
// Base64 of the exact save JSON: portable across devices, and imports run
// through the same migrate() path as a normal load so old codes stay valid.

export function exportSave(): string | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    // Unicode-safe btoa.
    return btoa(String.fromCharCode(...new TextEncoder().encode(raw)))
  } catch {
    return null
  }
}

export function importSave(code: string): boolean {
  try {
    const bytes = Uint8Array.from(atob(code.trim()), (c) => c.charCodeAt(0))
    const raw = new TextDecoder().decode(bytes)
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
        }
        for (const e of data.run.enemies) {
          e.healCooldown ??= 0
          e.broodCooldown ??= 0
          e.phased ??= false
          e.phaseCooldown ??= 0
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
        data.run.mods.critChancePct ??= 0
        data.run.mods.abilityCdPct ??= 0
      }
      return data
    }
    default:
      return null
  }
}
