import { DOCTRINES, type DoctrineId } from '../data/doctrines'
import { BUILD_FAMILIES } from '../data/buildFamilies'
import { RELICS } from '../data/content'
import type { RelicId, RunState } from '../engine/types'
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
  onChoose: (relic: RelicId | null) => void
  onReroll: (focus?: DoctrineId) => void
}) {
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
          {state.doctrine && <button className="ghost-btn" data-testid="relic-focus" disabled={state.relicRerolled || state.gold < Math.ceil(skipGold * 3 / 2) || BUILD_FAMILIES[state.doctrine].relics.every(r => state.relics.includes(r))} title="Uses this offer’s one reroll. Guarantees one unowned relic from your doctrine’s family; the other choices stay random." onClick={() => onReroll(state.doctrine!)}>Focus {DOCTRINES[state.doctrine].name} (−⛀ {Math.ceil(skipGold * 3 / 2)})</button>}

        </div>
      </div>
    </div>
  )
}

