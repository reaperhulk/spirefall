import { RELICS } from '../data/content'
import { META_TREE } from '../data/metaTree'
import { metaLevel, metaUpgradeCost } from '../engine/meta'
import type { MetaState, RelicId, RunSummary } from '../engine/types'
import type { MetaUpgradeId } from '../data/metaTree'

export function RelicModal({ options, onChoose }: { options: RelicId[]; onChoose: (relic: RelicId | null) => void }) {
  return (
    <div className="modal-backdrop" data-testid="relic-modal">
      <div className="modal">
        <h2>The ruins offer a relic</h2>
        <div className="relic-cards">
          {options.map((id) => (
            <button key={id} className="relic-card" onClick={() => onChoose(id)} data-testid={`relic-${id}`}>
              <strong>{RELICS[id].name}</strong>
              <span>{RELICS[id].description}</span>
            </button>
          ))}
        </div>
        <button className="ghost-btn" onClick={() => onChoose(null)}>
          Take nothing
        </button>
      </div>
    </div>
  )
}

export function SpireTree({ meta, onBuy }: { meta: MetaState; onBuy: (id: MetaUpgradeId) => void }) {
  return (
    <div className="spire-tree" data-testid="spire-tree">
      {META_TREE.map((node) => {
        const level = metaLevel(meta, node.id)
        const cost = metaUpgradeCost(meta, node.id)
        const maxed = cost === null
        const affordable = cost !== null && meta.sparks >= cost
        return (
          <div key={node.id} className={`tree-node${maxed ? ' maxed' : ''}`}>
            <div className="tree-node-info">
              <strong>{node.name}</strong>
              <span>{node.description}</span>
              <span className="tree-level">
                Level {level}/{node.maxLevel}
              </span>
            </div>
            <button
              className="buy-btn"
              disabled={!affordable}
              onClick={() => onBuy(node.id)}
              data-testid={`buy-${node.id}`}
            >
              {maxed ? 'MAX' : `✦ ${cost}`}
            </button>
          </div>
        )
      })}
    </div>
  )
}

export function RunOverOverlay({
  summary,
  meta,
  onBuy,
  onNextRun,
}: {
  summary: RunSummary
  meta: MetaState
  onBuy: (id: MetaUpgradeId) => void
  onNextRun: () => void
}) {
  const victory = summary.outcome === 'victory'
  return (
    <div className="modal-backdrop" data-testid="run-over">
      <div className="modal run-over">
        <h2>{victory ? 'THE SPIRE STANDS' : 'THE SPIRE FALLS'}</h2>
        <p className="run-summary">
          {summary.wavesCleared} waves cleared · {summary.kills} kills ·{' '}
          <strong data-testid="sparks-earned">✦ {summary.sparks} sparks</strong> earned
        </p>
        <p className="run-flavor">
          {victory
            ? 'Against every prior collapse, this cycle holds.'
            : 'Its embers remember. Spend them, and reach further next time.'}
        </p>
        <h3>The Spire Tree — ✦ {meta.sparks} available</h3>
        <SpireTree meta={meta} onBuy={onBuy} />
        <button className="primary-btn" onClick={onNextRun} data-testid="next-run">
          Begin next run
        </button>
      </div>
    </div>
  )
}

export function SpireTreeModal({
  meta,
  onBuy,
  onClose,
}: {
  meta: MetaState
  onBuy: (id: MetaUpgradeId) => void
  onClose: () => void
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>The Spire Tree — ✦ {meta.sparks}</h2>
        <p className="run-flavor">Permanent upgrades. New purchases take effect on your next run.</p>
        <SpireTree meta={meta} onBuy={onBuy} />
        <button className="ghost-btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
