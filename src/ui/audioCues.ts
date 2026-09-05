import { BEAM_HEAT_MAX, EXECUTE_THRESHOLD_PCT } from '../data/content'
import type { RunState } from '../engine/types'
export type TacticalCue = 'execute_ready' | 'core_open' | 'beam_warning'
// State edges, not per-frame beeps. Reset on a new run or replay seek;
// hysteresis prevents tiny heat changes or target churn from chattering.
export class AudioCues {
  private identity = -1
  private tick = -1
  private ready = false
  private hot = false
  private exposed = new Set<number>()
  observe(state:RunState, identity:number): TacticalCue[] {
    if (identity !== this.identity || state.tick < this.tick) {
      this.identity = identity; this.ready = false; this.hot = false; this.exposed.clear()
    }
    this.tick = state.tick
    const cues:TacticalCue[] = []
    const combat = state.phase === 'wave'
    const ready = combat && state.executeCd === 0 && state.enemies.some(e => e.hp > 0 && !e.phased && e.hp * 100 <= e.maxHp * EXECUTE_THRESHOLD_PCT)
    if (ready && !this.ready) cues.push('execute_ready')
    this.ready = ready
    if (!combat || state.beamHeat < BEAM_HEAT_MAX * 0.45) this.hot = false
    if (combat && !this.hot && !state.beamOverheated && state.beamHeat >= BEAM_HEAT_MAX * 0.75) { this.hot = true; cues.push('beam_warning') }
    const exposed = new Set(state.enemies.filter(e => combat && e.type === 'boss_final' && e.hp > 0 && e.mechActiveTicks === 0 && e.mechCooldown > 90).map(e => e.id))
    if ([...exposed].some(id => !this.exposed.has(id))) cues.push('core_open')
    this.exposed = exposed
    return cues
  }
}
