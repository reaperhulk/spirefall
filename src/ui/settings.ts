// Player-facing presentation settings. Persisted separately from the save so
// wiping progress never wipes accessibility choices. Consumers read the live
// singleton each frame — no React plumbing needed in the render loop.

export interface Settings {
  volume: number // 0–100, scales every SFX gain
  reducedMotion: boolean // no screen shake, no full-screen flashes
}

const KEY = 'spirefall-settings'

const DEFAULTS: Settings = { volume: 100, reducedMotion: false }

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<Settings>
    return {
      volume: typeof parsed.volume === 'number' ? Math.max(0, Math.min(100, parsed.volume)) : DEFAULTS.volume,
      reducedMotion: parsed.reducedMotion === true,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export const settings: Settings = load()

export function updateSettings(patch: Partial<Settings>): Settings {
  Object.assign(settings, patch)
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    // unsaved preference is fine
  }
  return settings
}
