import { RELICS } from '../data/content'
import { META_TREE, metaNodeEffect } from '../data/metaTree'
import { metaLevel, metaUpgradeCost } from '../engine/meta'
import type { MetaState, RelicId, RunSummary } from '../engine/types'
import type { MetaUpgradeId } from '../data/metaTree'

export function RelicModal({
  options,
  skipGold,
  onChoose,
}: {
  options: RelicId[]
  skipGold: number
  onChoose: (relic: RelicId | null) => void
}) {
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
        <button className="ghost-btn" data-testid="relic-skip" onClick={() => onChoose(null)}>
          Take nothing (+⛀ {skipGold})
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
        const now = metaNodeEffect(node.id, level)
        const next = maxed ? null : metaNodeEffect(node.id, level + 1)
        return (
          <div key={node.id} className={`tree-node${maxed ? ' maxed' : ''}`}>
            <div className="tree-node-info">
              <strong>{node.name}</strong>
              <span>{node.description}</span>
              {now && (
                <span className="tree-effect" data-testid={`effect-${node.id}`}>
                  Now: {now}
                  {next && (
                    <>
                      {' '}
                      → <em>next: {next}</em>
                    </>
                  )}
                </span>
              )}
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

const TOWER_BAR_COLORS: Record<string, string> = {
  arrow: '#9ece6a',
  cannon: '#e0af68',
  frost: '#7dcfff',
  tesla: '#bb9af7',
  sniper: '#73daca',
  mint: '#e5c07b',
}

// Compact share bars: who did the work this run, and what died.
function ShareBars({ title, entries, color }: { title: string; entries: [string, number][]; color: (key: string) => string }) {
  const total = entries.reduce((sum, [, v]) => sum + v, 0)
  if (total <= 0) return null
  const sorted = [...entries].sort((a, b) => b[1] - a[1]).slice(0, 6)
  return (
    <div className="share-bars">
      <h4>{title}</h4>
      {sorted.map(([key, value]) => (
        <div key={key} className="share-row">
          <span className="share-label">{key}</span>
          <div className="share-track">
            <div className="share-fill" style={{ width: `${Math.max(2, Math.round((value / total) * 100))}%`, background: color(key) }} />
          </div>
          <span className="share-value">{value.toLocaleString()}</span>
        </div>
      ))}
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
        <div className="run-analytics" data-testid="run-analytics">
          <ShareBars
            title="Damage by tower"
            entries={Object.entries(summary.damageByTower) as [string, number][]}
            color={(k) => TOWER_BAR_COLORS[k] ?? '#8a93ad'}
          />
          <ShareBars
            title="Kills by enemy"
            entries={Object.entries(summary.killsByEnemy) as [string, number][]}
            color={() => '#f7768e'}
          />
        </div>
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
  onHardReset,
}: {
  meta: MetaState
  onBuy: (id: MetaUpgradeId) => void
  onClose: () => void
  onHardReset: () => void
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
        <button
          className="ghost-btn danger"
          data-testid="hard-reset"
          onClick={() => {
            if (window.confirm('Wipe ALL progress — every Spark and upgrade — and start over?')) onHardReset()
          }}
        >
          Hard reset (wipe all progress)
        </button>
      </div>
    </div>
  )
}
