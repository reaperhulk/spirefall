import { DOCTRINES, type DoctrineId } from '../data/doctrines'
import type { RunState } from '../engine/types'
export function BuildDoctrine({ state, choose }: { state: RunState; choose: (id: DoctrineId) => void }) {
  if (state.doctrine) return <p className="doctrine-summary"><strong>{DOCTRINES[state.doctrine].name}</strong> · {DOCTRINES[state.doctrine].description}</p>
  if (state.phase !== 'build' || state.wave < 2) return null
  return <section className="doctrine-panel" aria-label="Choose a build doctrine">
    <strong>Shape this run · choose one permanent doctrine</strong>
    <div className="doctrine-choices">{(Object.entries(DOCTRINES) as [DoctrineId, typeof DOCTRINES[DoctrineId]][]).map(([id, d]) =>
      <button key={id} className="ghost-btn" data-testid={`doctrine-${id}`} onClick={() => choose(id)}><b>{d.name}</b><span>{d.description}</span><small>{d.towers.filter(t => state.towers.some(owned => owned.type === t)).length} matching tower types built</small></button>)}</div>
  </section>
}
