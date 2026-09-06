import { ASSAULTS, type AssaultId } from '../engine/campaign'
import { getRunMap } from '../engine/mapgen'
import type { DoctrineId } from '../data/doctrines'
import type { RunState } from '../engine/types'
import { BuildDoctrine } from './BuildDoctrine'

export function RunPlanning({state, watching, onChoose, onShrine, onAssault, onClose}: {
  state: RunState
  watching: boolean
  onChoose: (doctrine: DoctrineId) => void
  onShrine: () => void
  onAssault: (id: AssaultId) => void
  onClose: () => void
}) {
  return <div className="modal-backdrop" onClick={onClose}>
    <div className="modal planning-modal" role="dialog" aria-modal="true" aria-label="Build and objectives" onClick={event => event.stopPropagation()}>
      <h2>Build & objectives</h2>
      <p><strong>{getRunMap(state).situation ?? 'Battlefield'}</strong> · {getRunMap(state).tactic}</p>
      {state.assaultOffer && !watching && <section className="doctrine-panel" aria-label="Choose the next assault">
        <h3>Choose the next assault</h3><p>Raise the stakes for three waves, or close this panel and send the standard waves.</p>
        <div className="doctrine-choices">{(Object.entries(ASSAULTS) as [AssaultId, typeof ASSAULTS[AssaultId]][]).map(([id, a]) =>
          <button key={id} className="ghost-btn" data-testid={`assault-${id}`} onClick={() => onAssault(id)}><b>{a.name}</b><span>{a.danger}</span><small>{a.reward}</small></button>)}</div>
      </section>}
      {state.assault && <p><strong>{ASSAULTS[state.assault.id].name}</strong> through wave {state.assault.untilWave}. {ASSAULTS[state.assault.id].danger} Reward: {ASSAULTS[state.assault.id].reward}</p>}
      {(state.rulesVersion ?? 4) >= 5 && state.wave >= 2 && !state.commissionUsed && <p className="doctrine-panel">Opening commission available: specialize one tier-2 combat tower for 20 gold. Select a tower to choose its path.</p>}
      {!watching && <BuildDoctrine state={state} choose={onChoose} />}
      {!state.doctrine && (state.wave < 2 || state.phase !== 'build') && <p>Choose a permanent doctrine between waves after clearing wave 2.</p>}
      {state.shrine && <section className="doctrine-panel" aria-label="Relic shrine">
        <strong>Shrine at column {state.shrine.cell.cx + 1}, row {state.shrine.cell.cy + 1}</strong>
        <p>Station two combat towers within three cells for at least three seconds, and keep enemies outside its ring for one wave to earn {100 + state.shrine.wave * 12} gold. Failure costs no Spire health.</p>
        {state.shrine.status === 'offered' && !watching ? <button className="primary-btn" data-testid="accept-shrine" onClick={onShrine}>Accept shrine defense</button> : <b>{state.shrine.status === 'offered' ? 'Shrine available' : state.shrine.status === 'active' ? 'Defending this wave' : state.shrine.status === 'won' ? 'Shrine secured' : 'Shrine lost'}</b>}
      </section>}
      <button className="ghost-btn" onClick={onClose}>Close</button>
    </div>
  </div>
}
