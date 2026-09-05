import type { DoctrineId } from '../data/doctrines'
import type { RunState } from '../engine/types'
import { BuildDoctrine } from './BuildDoctrine'

export function RunPlanning({state, watching, onChoose, onShrine, onClose}: {
  state: RunState
  watching: boolean
  onChoose: (doctrine: DoctrineId) => void
  onShrine: () => void
  onClose: () => void
}) {
  return <div className="modal-backdrop" onClick={onClose}>
    <div className="modal planning-modal" role="dialog" aria-modal="true" aria-label="Build and objectives" onClick={event => event.stopPropagation()}>
      <h2>Build & objectives</h2>
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
