import { DefenseCoverage } from './DefenseCoverage'
import { RunLessons } from './RunLessons'
import { useEffect, useRef, useState } from 'react'
import { drawRunCard, challengeLink } from './runCard'
import { CATACLYSMS, CRUCIBLE_HP_PCT_PER_RANK, CRUCIBLE_SPARK_PCT_PER_RANK, crucibleTiersAt, RELICS, TRIAL_IDS, TRIALS } from '../data/content'
import { BIOME_IDS, BIOMES, biomeUnlocked } from '../data/biomes'
import { EMBER_TREE, type EmberUpgradeId } from '../data/emberTree'
import {
  branchNodes,
  BRANCH_BLURBS,
  BRANCH_GATES,
  BRANCH_NAMES,
  META_BRANCHES,
  metaNode,
  metaNodeEffect,
} from '../data/metaTree'
import {
  branchSpend,
  canAscend,
  emberGainOnAscend,
  emberLevel,
  emberUpgradeCost,
  isNodeUnlocked,
  keystoneConflict,
  metaLevel,
  metaUpgradeCost,
} from '../engine/meta'
import { computeSparks } from '../engine/step'
import type { CataclysmId, MetaState, RelicId, RunState, RunSummary, Tower } from '../engine/types'
import type { MetaUpgradeId } from '../data/metaTree'
import { SpireTreeGraph } from './SpireTreeGraph'

export { RelicModal } from './RelicModal'

// The ascension panel: visible once the player has ever won (or already
// ascended). Ascending burns the Spire Tree for Embers; the Ember Tree
// persists forever.
function AscensionPanel({
  meta,
  onBuyEmber,
  onAscend,
}: {
  meta: MetaState
  onBuyEmber: (id: EmberUpgradeId) => void
  onAscend: () => void
}) {
  const visible = meta.victories > 0 || meta.ascensions > 0 || meta.embers > 0
  if (!visible) return null
  return (
    <div className="ascension" data-testid="ascension">
      <h3>
        Ascension — <span className="ember-count">❖ {meta.embers} embers</span>
        {meta.ascensions > 0 && <span className="ascension-count"> · cycle {meta.ascensions + 1}</span>}
      </h3>
      <div className="spire-tree">
        {EMBER_TREE.map((node) => {
          const level = emberLevel(meta, node.id)
          const cost = emberUpgradeCost(meta, node.id)
          const maxed = cost === null
          return (
            <div key={node.id} className={`tree-node ember-node${maxed ? ' maxed' : ''}`}>
              <div className="tree-node-info">
                <strong>{node.name}</strong>
                <span>{node.description}</span>
                <span className="tree-level">
                  Level {level}/{node.maxLevel}
                </span>
              </div>
              <button
                className="buy-btn ember-buy"
                disabled={maxed || meta.embers < (cost ?? 0)}
                onClick={() => onBuyEmber(node.id)}
                data-testid={`buy-ember-${node.id}`}
              >
                {maxed ? 'MAX' : `❖ ${cost}`}
              </button>
            </div>
          )
        })}
      </div>
      <button
        className="ghost-btn danger"
        data-testid="ascend"
        disabled={!canAscend(meta)}
        title={
          canAscend(meta)
            ? 'Reset stat upgrades and banked Sparks for Embers; keep tower and ability unlocks'
            : 'Win a run this cycle to unlock Ascension'
        }
        onClick={onAscend}
      >
        Ascend (+❖ {emberGainOnAscend(meta)}) — burns the Spire Tree
      </button>
    </div>
  )
}

// Phase 1 of the skill-tree restructure keeps this list rendering (the graph
// view is phase 2) but it must not LIE: nodes are grouped by branch and tier,
// and a locked tier says what it wants instead of offering a button that
// silently refuses.
export function SpireTree({ meta, onBuy }: { meta: MetaState; onBuy: (id: MetaUpgradeId) => void }) {
  return (
    <div className="spire-tree" data-testid="spire-tree">
      {META_BRANCHES.map((branch) => (
        <div key={branch} className="tree-branch" data-testid={`branch-${branch}`}>
          <h4 className="tree-branch-head">
            {BRANCH_NAMES[branch]} <span className="tree-branch-blurb">{BRANCH_BLURBS[branch]}</span>
            <span className="tree-branch-spend">✦ {branchSpend(meta, branch)} spent</span>
          </h4>
          {branchNodes(branch).map((node) => {
        const level = metaLevel(meta, node.id)
        const cost = metaUpgradeCost(meta, node.id)
        const maxed = cost === null
        const unlocked = isNodeUnlocked(meta, node.id)
        const rival = keystoneConflict(meta, node.id)
        const affordable = cost !== null && meta.sparks >= cost && unlocked && rival === null
        const now = metaNodeEffect(node.id, level)
        const next = maxed ? null : metaNodeEffect(node.id, level + 1)
        return (
          <div
            key={node.id}
            className={`tree-node${maxed ? ' maxed' : ''}${unlocked ? '' : ' locked'}${node.keystone === true ? ' keystone' : ''}`}
            data-testid={`node-${node.id}`}
          >
            <div className="tree-node-info">
              <strong>{node.name}</strong>
              <span>{node.description}</span>
              {!unlocked && (
                <span className="tree-gate" data-testid={`gate-${node.id}`}>
                  Locked — spend ✦{BRANCH_GATES[node.tier] - branchSpend(meta, branch)} more in {BRANCH_NAMES[branch]}
                </span>
              )}
              {rival !== null && (
                <span className="tree-gate">{metaNode(rival).name} is taken — respec it to switch</span>
              )}
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
              {maxed ? 'MAX' : unlocked ? `✦ ${cost}` : '🔒'}
            </button>
          </div>
        )
          })}
        </div>
      ))}
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
  beacon: '#ff9e64',
  lance: '#f7768e',
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

// Endless agency: every 5th cleared wave past victory offers two dooms and
// the player picks the poison. The next wave is gated until they do.
export function CataclysmModal({
  options,
  onChoose,
}: {
  options: CataclysmId[]
  onChoose: (cataclysm: CataclysmId) => void
}) {
  return (
    <div className="modal-backdrop" data-testid="cataclysm-modal">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Cataclysm">
        <h2>✸ The world hardens</h2>
        <p className="run-flavor">A Cataclysm strikes — permanent, stacking. Choose which doom you take.</p>
        <div className="relic-cards">
          {options.map((id) => (
            <button key={id} className="relic-card cataclysm-card" onClick={() => onChoose(id)} data-testid={`cataclysm-${id}`}>
              <strong>✸ {CATACLYSMS[id].name}</strong>
              <span>{CATACLYSMS[id].description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// In-app confirmation — window.confirm freezes the tab, looks foreign in the
// PWA, and can't be styled or announced. One shared modal replaces it.
export function ConfirmModal({
  message,
  onConfirm,
  onCancel,
}: {
  message: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="modal-backdrop" onClick={onCancel} data-testid="confirm-modal">
      <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true" aria-label="Confirm">
        <p className="run-summary">{message}</p>
        <div className="confirm-row">
          {/* Focus lands on Confirm: Enter accepts, Escape cancels — the
              keyboard flow window.confirm used to give for free. */}
          <button className="primary-btn" data-testid="confirm-yes" autoFocus onClick={onConfirm}>
            Confirm
          </button>
          <button className="ghost-btn" data-testid="confirm-no" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// The run's loadout, shared by the mid-run stats modal and the run-over
// Result tab: relics in pick order, cataclysms aggregated (×n on repeats).
function LoadoutChips({ relics, cataclysms }: { relics: RelicId[]; cataclysms: RunState['cataclysms'] }) {
  return (
    <>
      {relics.length > 0 && (
        <div className="loadout-row" data-testid="summary-relics">
          {relics.map((r) => (
            <span key={r} className={`loadout-chip rarity-${RELICS[r].rarity}`} title={RELICS[r].description}>
              {RELICS[r].name}
            </span>
          ))}
        </div>
      )}
      {cataclysms.length > 0 && (
        <div className="loadout-row" data-testid="summary-cataclysms">
          {[...new Set(cataclysms)].map((c) => {
            const n = cataclysms.filter((x) => x === c).length
            return (
              <span key={c} className="loadout-chip cataclysm" title={CATACLYSMS[c].description}>
                ✸ {CATACLYSMS[c].name}
                {n > 1 ? ` ×${n}` : ''}
              </span>
            )
          })}
        </div>
      )}
    </>
  )
}

// Live mid-run analytics: the run-over screen's numbers, available while the
// run still breathes. Read-only view over the live state — no dispatch.
export function RunStatsModal({ state, onClose }: { state: RunState; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Run stats" data-testid="run-stats">
        <h2>This run so far</h2>
        <p className="run-summary">
          {Math.max(0, state.wavesCleared - state.startWave)} waves cleared · {state.kills} kills ·{' '}
          {state.bestCombo >= 10 && <span>⚡ {state.bestCombo} best streak · </span>}
          <strong data-testid="stats-sparks">✦ {computeSparks(state)}</strong> sparks banked if it ended now
        </p>
        {state.trials.length > 0 && (
          <p className="run-summary">{state.trials.map((t) => `⚔ ${TRIALS[t].name} (+${TRIALS[t].sparkBonusPct}% ✦)`).join(' · ')}</p>
        )}
        <LoadoutChips relics={state.relics} cataclysms={state.cataclysms} />
        {state.hpByWave.length >= 2 && <HpSparkline hp={state.hpByWave} />}
        <div className="run-analytics">
          <ShareBars
            title="Damage by tower"
            entries={Object.entries(state.damageByTower) as [string, number][]}
            color={(k) => TOWER_BAR_COLORS[k] ?? '#8a93ad'}
          />
          <ShareBars
            title="Kills by enemy"
            entries={Object.entries(state.killsByEnemy) as [string, number][]}
            color={() => '#f7768e'}
          />
        </div>
        <DefenseCoverage towers={state.towers} />
        <button className="ghost-btn" onClick={onClose} data-testid="close-stats">
          Close
        </button>
      </div>
    </div>
  )
}

export function RunOverOverlay({
  towers,
  summary,
  meta,
  replay,
  replayLink,
  onWatchReplay,
  mapPref,
  onMapPref,
  trialPref,
  onTrialPref,
  onBuy,
  onRespec,
  onBuyEmber,
  onAscend,
  onNextRun,
  onRematch,
  reducedMotion,
}: {
  towers: Tower[]
  summary: RunSummary
  meta: MetaState
  replay: () => string
  replayLink: () => Promise<string | null>
  onWatchReplay: () => void
  mapPref: string
  onMapPref: (v: string) => void
  trialPref: string
  onTrialPref: (v: string) => void
  onBuy: (id: MetaUpgradeId) => void
  onRespec?: ((id: MetaUpgradeId) => void) | undefined
  onBuyEmber: (id: EmberUpgradeId) => void
  onAscend: () => void
  onNextRun: () => void
  onRematch: () => void
  reducedMotion: boolean
}) {
  const victory = summary.outcome === 'victory'
  // The screen carries three jobs — reading the result, spending sparks,
  // configuring the next run — each gets a tab instead of one long scroll.
  const [tab, setTab] = useState<'result' | 'tree' | 'next'>('result')
  const [replayText, setReplayText] = useState<string | null>(null)
  const [shared, setShared] = useState<'' | 'card' | 'link'>('')
  const cardHost = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    // The run card doubles as the run-over hero visual.
    const canvas = drawRunCard(summary)
    canvas.style.width = '100%'
    canvas.style.height = 'auto'
    canvas.setAttribute('data-testid', 'run-card')
    cardHost.current?.replaceChildren(canvas)
  }, [summary])
  const copyCard = () => {
    setShared('card')
    try {
      drawRunCard(summary).toBlob((blob) => {
        if (blob && navigator.clipboard && typeof ClipboardItem !== 'undefined') {
          void navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).catch(() => {})
        }
      })
    } catch {
      // clipboard images are best-effort; the visible card can be screenshotted
    }
  }
  const copyLink = () => {
    setShared('link')
    void navigator.clipboard?.writeText(challengeLink(summary)).catch(() => {})
  }
  return (
    <div className="modal-backdrop" data-testid="run-over">
      {victory && !reducedMotion && (
        // Rising embers behind the modal — a win must LOOK different from a
        // loss, not just read different. Deterministic stagger (golden-ratio
        // spread), no randomness; suppressed by the reduced-motion setting
        // here and by prefers-reduced-motion in CSS.
        <div className="victory-embers" aria-hidden="true" data-testid="victory-embers">
          {Array.from({ length: 18 }, (_, i) => (
            <span
              key={i}
              className={`vember ${i % 3 === 0 ? 'big' : ''}`}
              style={{
                left: `${(i * 61.8) % 100}%`,
                animationDelay: `${((i * 53) % 400) / 100}s`,
                animationDuration: `${5 + (i % 5) * 0.9}s`,
              }}
            />
          ))}
        </div>
      )}
      <div className={`modal run-over${victory ? ' victory' : ''}`} role="dialog" aria-modal="true" aria-label="Run over">
        <h2>{victory ? 'THE SPIRE STANDS' : 'THE SPIRE FALLS'}</h2>
        {victory && meta.victories === 1 && (
          <p className="first-victory" data-testid="first-victory">
            🏆 First victory. Every collapse before this one was practice.
          </p>
        )}
        <p className="run-summary">
          {summary.wavesCleared} waves cleared · {summary.kills} kills ·{' '}
          {summary.bestCombo >= 10 && (
            <span data-testid="best-combo">⚡ {summary.bestCombo} best streak · </span>
          )}
          <strong data-testid="sparks-earned">✦ {summary.sparks} sparks</strong> earned
          {summary.wavesCleared > 0 && summary.wavesCleared >= meta.bestWave && (
            <span className="new-record" data-testid="new-record">
              {' '}
              ★ personal best
            </span>
          )}
        </p>
        <div className="tab-bar" role="tablist" aria-label="Run over sections">
          {(
            [
              ['result', 'Result'],
              ['tree', `Spire Tree · ✦${meta.sparks}`],
              ['next', 'Next Run'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              className={`tab${tab === id ? ' active' : ''}`}
              data-testid={`tab-${id}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === 'result' && (
          <>
        {summary.trials.length > 0 && (
          <p className="run-summary" data-testid="summary-trials">
            {summary.trials.map((t) => `⚔ ${TRIALS[t].name} (+${TRIALS[t].sparkBonusPct}% ✦)`).join(' · ')}
          </p>
        )}
        <LoadoutChips relics={summary.relics} cataclysms={summary.cataclysms} />
        {summary.unlocked.length > 0 && (
          <div className="unlocks" data-testid="unlocks">
            {summary.unlocked.map((a) => (
              <span key={a.id} className="unlock-chip">
                🏅 {a.name}
                {a.sparks > 0 && ` +✦${a.sparks}`}
              </span>
            ))}
          </div>
        )}
        {summary.hpByWave.length >= 2 && <HpSparkline hp={summary.hpByWave} />}
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
        <div ref={cardHost} className="run-card-host" />
        <RunLessons summary={summary} />
        <DefenseCoverage towers={towers} />
        <div className="replay-row">
          <button
            className="ghost-btn"
            data-testid="watch-replay"
            title="Re-watch this exact run — same seed, same commands, live."
            onClick={onWatchReplay}
          >
            ▶ Watch replay
          </button>
          <button className="ghost-btn" data-testid="copy-card" onClick={copyCard}>
            {shared === 'card' ? 'Card copied ✓' : '📸 Copy run card'}
          </button>
          <button
            className="ghost-btn"
            data-testid="copy-challenge"
            title="Copies a link that drops anyone onto this exact battlefield."
            onClick={copyLink}
          >
            {shared === 'link' ? 'Challenge copied ✓' : '⚔ Copy challenge link'}
          </button>
          <button
            className="ghost-btn"
            data-testid="copy-replay"
            title="Copies the run's seed and full command log — anyone can replay this exact run."
            onClick={() => {
              const text = replay()
              setReplayText(text)
              void navigator.clipboard?.writeText(text).catch(() => {})
            }}
          >
            {replayText === null ? '🐞 Copy replay' : 'Replay copied ✓'}
          </button>
          <button
            className="ghost-btn"
            data-testid="copy-replay-link"
            title="Copies a link — anyone who opens it watches this exact run live."
            onClick={() => {
              void replayLink().then((link) => {
                if (!link) return
                setReplayText(link)
                void navigator.clipboard?.writeText(link).catch(() => {})
              })
            }}
          >
            ⏯ Copy replay link
          </button>
          {replayText !== null && (
            <span className="replay-hint">Paste it into a bug report — same seed, same commands, same run.</span>
          )}
        </div>
        {replayText !== null && (
          <textarea className="transfer-code" data-testid="replay-json" readOnly value={replayText} />
        )}
          </>
        )}
        {tab === 'tree' && (
          <>
        {canAscend(meta) && (
          <div className="ascend-callout" data-testid="runover-ascend-callout">
            <p>
              🔥 <strong>Ascension is ready</strong> — burn the Spire Tree below for{' '}
              <strong>{emberGainOnAscend(meta)} Embers</strong>, or keep winning: each victory this cycle adds{' '}
              <strong>+1 Ember</strong> while the Crucible hardens the horde (+{CRUCIBLE_HP_PCT_PER_RANK}% HP) and
              raises the Spark payout (+{CRUCIBLE_SPARK_PCT_PER_RANK}%).
            </p>
          </div>
        )}
        <h3>The Spire Tree — ✦ {meta.sparks} available</h3>
        <SpireTreeGraph meta={meta} onBuy={onBuy} onRespec={onRespec} />
        <AscensionPanel meta={meta} onBuyEmber={onBuyEmber} onAscend={onAscend} />
          </>
        )}
        {tab === 'next' && (
        <div className="next-run-row">
          <label className="map-pick">
            Biome
            <select
              data-testid="map-select"
              value={mapPref}
              onChange={(e) => onMapPref(e.target.value)}
              title="The biome sets the battlefield's rules; every run generates a fresh layout inside them."
            >
              <option value="random">🎲 Random</option>
              {BIOME_IDS.map((b) => (
                <option key={b} value={b} disabled={!biomeUnlocked(meta, b)}>
                  {biomeUnlocked(meta, b)
                    ? `${BIOMES[b].name}${(meta.bestWaveByMap[b] ?? 0) > 0 ? ` — best ${meta.bestWaveByMap[b]}` : ''}`
                    : `🔒 ${BIOMES[b].name} — ${BIOMES[b].unlockHint}`}
                </option>
              ))}
            </select>
          </label>
          <label className="map-pick">
            Trials — stack any; hardship compounds, so does the payout
            <select
              data-testid="trial-select"
              multiple
              size={TRIAL_IDS.length}
              value={trialPref.split(',').filter(Boolean)}
              onChange={(e) => onTrialPref(Array.from(e.target.selectedOptions, (o) => o.value).join(','))}
              title="Opt-in handicaps that pay bonus sparks. Select several to stack. Daily runs ignore trials."
            >
              {TRIAL_IDS.map((t) => (
                <option key={t} value={t}>
                  {TRIALS[t].name} (+{TRIALS[t].sparkBonusPct}% ✦) — {TRIALS[t].description}
                </option>
              ))}
            </select>
          </label>
          {meta.cycleVictories > 0 && (
            <span
              className="trial-badge crucible-badge"
              data-testid="next-run-crucible"
              title="The horde remembers your victories this cycle. Ascend to reset the Crucible."
            >
              🔥 Next run: Crucible {meta.cycleVictories} — enemies +{CRUCIBLE_HP_PCT_PER_RANK * meta.cycleVictories}%
              HP, Sparks +{CRUCIBLE_SPARK_PCT_PER_RANK * meta.cycleVictories}%
              {crucibleTiersAt(meta.cycleVictories)
                .map((t) => ` · ${t.name} (${t.description})`)
                .join('')}
            </span>
          )}
          <button className="primary-btn" onClick={onNextRun} data-testid="next-run">
            Begin next run
          </button>
          <button
            className="ghost-btn"
            onClick={onRematch}
            data-testid="rematch"
            title={`Refight the exact battlefield that ${
              victory ? 'you just conquered' : 'just beat you'
            } — same layout, same waves${summary.trials.length > 0 ? ', same trials' : ''}. Spire Tree purchases still apply: same wall, stronger you.`}
          >
            ⚔ Rematch — same battlefield
          </button>
        </div>
        )}
      </div>
    </div>
  )
}

// Career at a glance: one bar per recent run (chronological, newest right),
// height = waves cleared, gold = victory. The climb IS the progression.
function HpSparkline({ hp }: { hp: number[] }) {
  const w = 240
  const h = 44
  const max = Math.max(...hp, 1)
  const x = (i: number) => (i / (hp.length - 1)) * (w - 4) + 2
  const y = (v: number) => h - 3 - (v / max) * (h - 8)
  const line = hp.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const last = hp[hp.length - 1]!
  return (
    <div className="hp-spark" data-testid="hp-sparkline" title="Spire HP after each cleared wave">
      <h4>Spire HP by wave</h4>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Spire HP over the run">
        <path d={`${line} L${x(hp.length - 1).toFixed(1)},${h} L${x(0).toFixed(1)},${h} Z`} fill="rgba(158, 206, 106, 0.14)" />
        <path d={line} fill="none" stroke={last <= max / 3 ? '#f7768e' : '#9ece6a'} strokeWidth="2" />
      </svg>
      <span className="hp-spark-ends">
        {hp[0]} → {last} HP
      </span>
    </div>
  )
}

export { SettingsModal } from './SettingsModal'

export function SpireTreeModal({
  meta,
  onBuy,
  onRespec,
  onBuyEmber,
  onAscend,
  onClose,
}: {
  meta: MetaState
  onBuy: (id: MetaUpgradeId) => void
  onRespec?: ((id: MetaUpgradeId) => void) | undefined
  onBuyEmber: (id: EmberUpgradeId) => void
  onAscend: () => void
  onClose: () => void
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal tree-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Spire Tree">
        <h2>The Spire Tree — ✦ {meta.sparks}</h2>
        <p className="run-flavor">New purchases take effect next run. Spend within a branch to open its next tier; connecting lines show related upgrades, not prerequisites.</p>
        <SpireTreeGraph meta={meta} onBuy={onBuy} onRespec={onRespec} />
        <AscensionPanel meta={meta} onBuyEmber={onBuyEmber} onAscend={onAscend} />
        <button className="ghost-btn" onClick={onClose}>
          Close
        </button>

      </div>
    </div>
  )
}
