import { BEAM_COOL_PER_TICK, BEAM_HEAT_MAX, ENEMIES, EXECUTE_THRESHOLD_PCT } from '../data/content'
import type { RunState } from '../engine/types'
import { Icon } from './Icon'
import { settings } from './settings'

export function TacticalControls({state, beamMode, getTargetId, onTarget, onExecute, onBeam}: {
  state:RunState; beamMode:boolean; getTargetId:()=>number | null
  onTarget:(id:number)=>void; onExecute:(id:number)=>void; onBeam:()=>void
}) {
  const targets = state.enemies.filter(e => e.hp > 0 && !e.phased)
  const target = targets.find(e => e.id === getTargetId())
  const wounded = targets.filter(e => e.hp * 100 <= e.maxHp * EXECUTE_THRESHOLD_PCT)
  const execute = wounded.find(e => e.id === target?.id) ?? wounded[0]
  const ventLeft = Math.ceil(state.beamHeat / BEAM_COOL_PER_TICK / 30)
  const label = state.beamOverheated ? `venting ${ventLeft}s` : state.beamTarget !== null && state.phase === 'wave' ? `${Math.ceil((BEAM_HEAT_MAX - state.beamHeat) / 30)}s left` : state.beamHeat > 0 ? `cooling ${ventLeft}s` : 'ready'
  return <div className="tactical-bar" aria-label="Combat controls">
    <span className="target-status" data-testid="target-status">{target ? `${ENEMIES[target.type].name} · ${target.hp}/${target.maxHp} HP` : 'Cycle a target · execute wounded foes at 15% HP'}</span>
    <div className="tactical-buttons">
      <button className="ability-btn" data-testid="cycle-target" disabled={targets.length === 0} onClick={() => {
        const index = targets.findIndex(e => e.id === target?.id)
        onTarget(targets[(index + 1) % targets.length]!.id)
      }}>Next target <kbd className="key-hint">]</kbd></button>
      <button className="ability-btn" data-testid="execute-target" disabled={!execute || state.phase !== 'wave' || state.executeCd > 0} title="Execute the selected wounded foe, or the first wounded foe if the selection is healthy." onClick={() => { if (execute) onExecute(execute.id) }}>
        Execute <kbd className="key-hint">{(settings.keyBindings.v ?? 'v').toUpperCase()}</kbd><span className="cooldown">{state.executeCd > 0 ? `${Math.ceil(state.executeCd / 30)}s` : `${wounded.length} ready`}</span>
      </button>
      <button className={`ability-btn beam-btn${beamMode ? ' selected' : ''}${state.beamOverheated ? ' overheated' : ''}`} data-testid="beam-toggle" aria-pressed={beamMode} title="Toggle the beam, then hover or drag to aim. It wounds foes down to 1 HP; towers and executions finish them. Release before the heat meter fills." onClick={onBeam}>
        <span className="beam-meter" data-testid="beam-heat" role="progressbar" aria-label="Beam heat" aria-valuenow={state.beamHeat} aria-valuemin={0} aria-valuemax={BEAM_HEAT_MAX}><span style={{width: `${state.beamHeat * 100 / BEAM_HEAT_MAX}%`}} /></span><Icon name="beam" /> Beam <kbd className="key-hint">{(settings.keyBindings.b ?? 'b').toUpperCase()}</kbd><span className="cooldown" data-testid="beam-state">{label}</span>
      </button>
    </div>
  </div>
}
