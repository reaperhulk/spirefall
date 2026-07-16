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
      return data
    }
    default:
      return null
  }
}
