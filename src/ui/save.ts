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

function migrate(parsed: { version?: number }): SaveData | null {
  switch (parsed.version) {
    case 1: {
      const data = parsed as SaveData
      if (!data.meta || typeof data.meta.sparks !== 'number') return null
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
        }
        data.run.activeAffix ??= null
        data.run.victoryClaimed ??= false
        data.run.startWave ??= 0
        data.run.mods.critChancePct ??= 0
      }
      return data
    }
    default:
      return null
  }
}
