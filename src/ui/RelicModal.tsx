import { useState } from 'react'
import { DOCTRINES, type DoctrineId } from '../data/doctrines'
import { RELICS } from '../data/content'
import type { RelicId, RunState } from '../engine/types'
import { familyRelicsAvailable, swappableRelics } from '../engine/campaign'
import { rewardFit } from './rewardFit'

export function RelicModal({
  state,
  options,
  skipGold,
  canReroll,
  onChoose,
  onReroll,
}: {
  state: RunState
  options: RelicId[]
  skipGold: number
  canReroll: boolean
  onChoose: (relic: RelicId | null, replace?: RelicId) => void
  onReroll: (focus?: DoctrineId) => void
}) {
  if (state.relicSpoils) return <SpoilsModal state={state} options={options} onChoose={onChoose} />
  return (
    <div className="modal-backdrop" data-testid="relic-modal">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Relic offer">
        <h2>The ruins offer a relic</h2>
        <div className="relic-cards">
          {options.map((id) => (
            <button
              key={id}
              className={`relic-card rarity-${RELICS[id].rarity}`}
              onClick={() => onChoose(id)}
              data-testid={`relic-${id}`}
            >
              <strong>{RELICS[id].name}</strong>
              <em className="relic-rarity">{RELICS[id].rarity}</em>
              <span>{RELICS[id].description}</span>
              <span className="reward-fit">{rewardFit(id, state)}</span>
            </button>
          ))}
        </div>
        <div className="relic-actions">
          <button className="ghost-btn" data-testid="relic-skip" onClick={() => onChoose(null)}>
            Take nothing (+⛀ {skipGold})
          </button>
          <button
            className="ghost-btn"
            data-testid="relic-reroll"
            disabled={!canReroll}
            title={canReroll ? 'Redraw all three offers — once per offer' : 'Already rerolled, or not enough gold'}
            onClick={() => onReroll()}
          >
            Reroll (−⛀ {skipGold})
          </button>
          {state.doctrine && <button className="ghost-btn" data-testid="relic-focus" disabled={state.relicRerolled || state.gold < Math.ceil(skipGold * 3 / 2) || familyRelicsAvailable(state, state.doctrine).length === 0} title="Uses this offer’s one reroll. Guarantees one unowned relic from your doctrine’s family; the other choices stay random." onClick={() => onReroll(state.doctrine!)}>Focus {DOCTRINES[state.doctrine].name} (−⛀ {Math.ceil(skipGold * 3 / 2)})</button>}

        </div>
      </div>
    </div>
  )
}


// Guardian spoils: an exchange, never an addition. Pick the carried relic to
// give up, then the relic to take in its place — or walk away.
function SpoilsModal({
  state,
  options,
  onChoose,
}: {
  state: RunState
  options: RelicId[]
  onChoose: (relic: RelicId | null, replace?: RelicId) => void
}) {
  const carried = swappableRelics(state)
  const [giveUp, setGiveUp] = useState<RelicId>(carried[0]!)
  return (
    <div className="modal-backdrop" data-testid="relic-modal">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Guardian's spoils">
        <h2>Guardian’s spoils — exchange a relic</h2>
        <p className="run-flavor">
          The fallen guardian carried relics. Trade one you hold for one of these, or leave them. Spoils never add a
          relic: they let you steer the build you have.
        </p>
        <label className="map-pick">
          Give up
          <select data-testid="spoils-give-up" value={giveUp} onChange={(e) => setGiveUp(e.target.value as RelicId)}>
            {carried.map((id) => (
              <option key={id} value={id}>
                {RELICS[id].name} — {RELICS[id].description}
              </option>
            ))}
          </select>
        </label>
        <div className="relic-cards">
          {options.map((id) => (
            <button
              key={id}
              className={`relic-card rarity-${RELICS[id].rarity}`}
              onClick={() => onChoose(id, giveUp)}
              data-testid={`relic-${id}`}
            >
              <strong>{RELICS[id].name}</strong>
              <em className="relic-rarity">{RELICS[id].rarity}</em>
              <span>{RELICS[id].description}</span>
              <span className="reward-fit">{rewardFit(id, state)}</span>
              <span className="reward-fit">Replaces {RELICS[giveUp].name}</span>
            </button>
          ))}
        </div>
        <div className="relic-actions">
          <button className="ghost-btn" data-testid="relic-skip" onClick={() => onChoose(null)}>
            Leave the spoils
          </button>
        </div>
      </div>
    </div>
  )
}
