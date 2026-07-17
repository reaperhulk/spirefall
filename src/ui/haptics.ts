import type { GameEvent } from '../engine/types'
import { settings } from './settings'

// Vibration feedback for touch devices. Only the moments that matter buzz —
// spire damage, run endings, cataclysms — never routine combat, and a global
// throttle keeps fast-forward from turning the phone into a joy buzzer.
// navigator.vibrate is absent on iOS Safari and desktop; every call is
// feature-checked so this is a silent no-op there.

let lastBuzz = 0

function buzz(pattern: number | number[]): void {
  if (!settings.haptics) return
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  const now = Date.now()
  if (now - lastBuzz < 150) return
  lastBuzz = now
  try {
    navigator.vibrate(pattern)
  } catch {
    // best-effort
  }
}

export function handleHaptics(events: GameEvent[]): void {
  for (const e of events) {
    switch (e.type) {
      case 'enemy_reached_spire':
        buzz(30)
        break
      case 'cataclysm_struck':
        buzz([40, 60, 40])
        break
      case 'victory_achieved':
        buzz([30, 40, 30, 40, 80])
        break
      case 'run_ended':
        buzz(e.outcome === 'victory' ? [30, 40, 30, 40, 80] : [80, 60, 120])
        break
      default:
        break
    }
  }
}
