// Player-facing presentation settings. Persisted separately from the save so
// wiping progress never wipes accessibility choices. Consumers read the live
// singleton each frame — no React plumbing needed in the render loop.

export interface Settings {
  volume: number // 0–100, scales every SFX gain
  musicVolume: number // 0–100, scales the generative score (0 = silence)
  reducedMotion: boolean // no screen shake, no full-screen flashes
  autoStart: boolean // build phase auto-sends the next wave after a beat
  haptics: boolean // vibration feedback on devices that support it
  colorAssist: boolean // colorblind-safe enemy palette (Okabe–Ito derived)
}

const KEY = 'spirefall-settings'

const DEFAULTS: Settings = { volume: 100, musicVolume: 60, reducedMotion: false, autoStart: false, haptics: true, colorAssist: false }

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<Settings>
    return {
      volume: typeof parsed.volume === 'number' ? Math.max(0, Math.min(100, parsed.volume)) : DEFAULTS.volume,
      musicVolume:
        typeof parsed.musicVolume === 'number' ? Math.max(0, Math.min(100, parsed.musicVolume)) : DEFAULTS.musicVolume,
      reducedMotion: parsed.reducedMotion === true,
      autoStart: parsed.autoStart === true,
      haptics: parsed.haptics !== false, // default on — only an explicit off sticks
      colorAssist: parsed.colorAssist === true,
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
