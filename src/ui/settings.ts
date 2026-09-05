import type { GraphicsQuality } from './graphics'
// Player-facing presentation settings. Persisted separately from the save so
// wiping progress never wipes accessibility choices. Consumers read the live
// singleton each frame — no React plumbing needed in the render loop.

export interface Settings {
  graphicsQuality: GraphicsQuality
  keyBindings: Record<string, string>
  holdBeam: boolean
  quietEffects: boolean
  quietAudio: boolean
  volume: number // 0–100, scales every SFX gain
  musicVolume: number // 0–100, scales the generative score (0 = silence)
  reducedMotion: boolean // no screen shake, no full-screen flashes
  autoStart: boolean // build phase auto-sends the next wave after a beat
  haptics: boolean // vibration feedback on devices that support it
  colorAssist: boolean // colorblind-safe enemy palette (Okabe–Ito derived)
}

const KEY = 'spirefall-settings'

const DEFAULTS: Settings = { graphicsQuality: 'auto', keyBindings: {}, holdBeam: false, quietEffects: false, quietAudio: false, volume: 100, musicVolume: 60, reducedMotion: false, autoStart: false, haptics: true, colorAssist: false }

export const ACTION_KEYS = ['b','v','g','o','r','u','x'] as const
export const validBinding = (key: string): boolean => /^[a-z]$/.test(key) && !'qwefc tsm'.replaceAll(' ', '').includes(key)
export function normalizeBindings(value: unknown): Record<string,string> {
  const bindings: Record<string,string> = {}
  if (!value || typeof value !== 'object') return bindings
  // Reconstruct swaps in stable action order, keeping every action reachable.
  for (const action of ACTION_KEYS) {
    const key = (value as Record<string, unknown>)[action]
    if (typeof key !== 'string' || !validBinding(key)) continue
    const used = ACTION_KEYS.find(a => a !== action && (bindings[a] ?? a) === key)
    if (used) bindings[used] = bindings[action] ?? action
    bindings[action] = key
  }
  return bindings
}
function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<Settings>
    return {
      graphicsQuality: parsed.graphicsQuality === 'high' || parsed.graphicsQuality === 'low' ? parsed.graphicsQuality : 'auto',
      keyBindings: normalizeBindings(parsed.keyBindings),
      holdBeam: parsed.holdBeam === true,
      quietEffects: parsed.quietEffects === true,
      quietAudio: parsed.quietAudio === true,
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
