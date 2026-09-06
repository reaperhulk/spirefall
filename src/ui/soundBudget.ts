// Separate slots keep tactical state changes audible during a barrage.
// Counts are per 250ms; per-sound cooldowns still apply in the audio engine.
const CRITICAL = new Set(['core_open', 'beam_warning', 'execute_ready'])
const URGENT = new Set(['beam_hot','spire_hit','boss','carapace','gale','victory','defeat','execute','meteor','frost_nova','cataclysm'])
export class SoundBudget {
  private from = -Infinity
  private counts = [0,0,0]
  private duckUntil = 0
  private criticalUntil = 0
  admit(kind:string, now:number, quiet:boolean): {urgent:boolean} | null {
    if (now - this.from >= 250) { this.from = now; this.counts.fill(0) }
    const lane = CRITICAL.has(kind) ? 0 : URGENT.has(kind) ? 1 : 2
    const limit = lane === 2 ? quiet ? 3 : 6 : 3
    if (this.counts[lane]! >= limit) return null
    this.counts[lane]!++
    if (lane === 0) this.criticalUntil = now + 800
    if (lane < 2) this.duckUntil = now + 500
    return {urgent:lane < 2}
  }
  duck(now:number): number { return now < this.criticalUntil ? 0.35 : now < this.duckUntil ? 0.55 : 1 }
}
