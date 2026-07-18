import { useEffect, useRef, useState } from 'react'
import { ACHIEVEMENTS } from '../data/achievements'
import { drawRunCard, challengeLink } from './runCard'
import { CRUCIBLE_HP_PCT_PER_RANK, CRUCIBLE_SPARK_PCT_PER_RANK, RELICS, TRIAL_IDS, TRIALS } from '../data/content'
import { BIOME_IDS, BIOMES, biomeUnlocked } from '../data/biomes'
import { EMBER_TREE, type EmberUpgradeId } from '../data/emberTree'
import { META_TREE, metaNodeEffect } from '../data/metaTree'
import { canAscend, emberGainOnAscend, emberLevel, emberUpgradeCost, metaLevel, metaUpgradeCost } from '../engine/meta'
import { computeSparks } from '../engine/step'
import type { MetaState, RelicId, RunState, RunSummary } from '../engine/types'
import type { MetaUpgradeId } from '../data/metaTree'
import { exportSave, importSave } from './save'

export function RelicModal({
  options,
  skipGold,
  canReroll,
  onChoose,
  onReroll,
}: {
  options: RelicId[]
  skipGold: number
  canReroll: boolean
  onChoose: (relic: RelicId | null) => void
  onReroll: () => void
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
            onClick={onReroll}
          >
            Reroll (−⛀ {skipGold})
          </button>
        </div>
      </div>
    </div>
  )
}

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
            ? 'Reset the Spire Tree and banked Sparks for Embers'
            : 'Win a run this cycle to unlock Ascension'
        }
        onClick={onAscend}
      >
        Ascend (+❖ {emberGainOnAscend(meta)}) — burns the Spire Tree
      </button>
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
  beacon: '#ff9e64',
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

// Live mid-run analytics: the run-over screen's numbers, available while the
// run still breathes. Read-only view over the live state — no dispatch.
export function RunStatsModal({ state, onClose }: { state: RunState; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Run stats" data-testid="run-stats">
        <h2>This run so far</h2>
        <p className="run-summary">
          {Math.max(0, state.wavesCleared - state.startWave)} waves cleared · {state.kills} kills ·{' '}
          <strong data-testid="stats-sparks">✦ {computeSparks(state)}</strong> sparks banked if it ended now
        </p>
        {state.trials.length > 0 && (
          <p className="run-summary">{state.trials.map((t) => `⚔ ${TRIALS[t].name} (+${TRIALS[t].sparkBonusPct}% ✦)`).join(' · ')}</p>
        )}
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
        <button className="ghost-btn" onClick={onClose} data-testid="close-stats">
          Close
        </button>
      </div>
    </div>
  )
}

export function RunOverOverlay({
  summary,
  meta,
  replay,
  mapPref,
  onMapPref,
  trialPref,
  onTrialPref,
  onBuy,
  onBuyEmber,
  onAscend,
  onNextRun,
}: {
  summary: RunSummary
  meta: MetaState
  replay: () => string
  mapPref: string
  onMapPref: (v: string) => void
  trialPref: string
  onTrialPref: (v: string) => void
  onBuy: (id: MetaUpgradeId) => void
  onBuyEmber: (id: EmberUpgradeId) => void
  onAscend: () => void
  onNextRun: () => void
}) {
  const victory = summary.outcome === 'victory'
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
      <div className="modal run-over" role="dialog" aria-modal="true" aria-label="Run over">
        <h2>{victory ? 'THE SPIRE STANDS' : 'THE SPIRE FALLS'}</h2>
        <p className="run-summary">
          {summary.wavesCleared} waves cleared · {summary.kills} kills ·{' '}
          <strong data-testid="sparks-earned">✦ {summary.sparks} sparks</strong> earned
          {summary.wavesCleared > 0 && summary.wavesCleared >= meta.bestWave && (
            <span className="new-record" data-testid="new-record">
              {' '}
              ★ personal best
            </span>
          )}
        </p>
        {summary.trials.length > 0 && (
          <p className="run-summary" data-testid="summary-trials">
            {summary.trials.map((t) => `⚔ ${TRIALS[t].name} (+${TRIALS[t].sparkBonusPct}% ✦)`).join(' · ')}
          </p>
        )}
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
        <div ref={cardHost} className="run-card-host" />
        <div className="replay-row">
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
          {replayText !== null && (
            <span className="replay-hint">Paste it into a bug report — same seed, same commands, same run.</span>
          )}
        </div>
        {replayText !== null && (
          <textarea className="transfer-code" data-testid="replay-json" readOnly value={replayText} />
        )}
        <h3>The Spire Tree — ✦ {meta.sparks} available</h3>
        <SpireTree meta={meta} onBuy={onBuy} />
        <AscensionPanel meta={meta} onBuyEmber={onBuyEmber} onAscend={onAscend} />
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
            Trial
            <select
              data-testid="trial-select"
              value={trialPref}
              onChange={(e) => onTrialPref(e.target.value)}
              title="Opt-in handicaps that pay bonus sparks. Daily runs ignore trials."
            >
              <option value="none">None</option>
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
            </span>
          )}
          <button className="primary-btn" onClick={onNextRun} data-testid="next-run">
            Begin next run
          </button>
        </div>
      </div>
    </div>
  )
}

// The run's health timeline: one sample per cleared wave. Dips show exactly
// which waves drew blood; the knit heal shows as slow recovery.
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

const SHORTCUTS: [string, string][] = [
  ['1–6', 'Arm a tower for placement'],
  ['Q / W / E', 'Cast Meteor / Frost Nova / Gold Rush'],
  ['Space', 'Start the next wave (or begin the next run)'],
  ['U', 'Upgrade / enhance the selected tower'],
  ['X', 'Sell the selected tower'],
  ['R', 'Repair the Spire'],
  ['T', 'Toggle the Spire Tree'],
  ['S', 'This run’s stats so far'],
  ['C', 'Codex — enemies, towers & mechanics'],
  ['M', 'Mute / unmute'],
  ['− / =', 'Slower / faster game speed'],
  ['?', 'Settings & shortcuts'],
  ['Esc', 'Deselect / close panels'],
]

export function SettingsModal({
  meta,
  volume,
  musicVolume,
  reducedMotion,
  haptics,
  colorAssist,
  onVolume,
  onMusicVolume,
  onReducedMotion,
  onHaptics,
  onColorAssist,
  onClose,
}: {
  meta: MetaState
  volume: number
  musicVolume: number
  reducedMotion: boolean
  haptics: boolean
  colorAssist: boolean
  onVolume: (v: number) => void
  onMusicVolume: (v: number) => void
  onReducedMotion: (v: boolean) => void
  onHaptics: (v: boolean) => void
  onColorAssist: (v: boolean) => void
  onClose: () => void
}) {
  const [transferCode, setTransferCode] = useState('')
  const [importFailed, setImportFailed] = useState(false)
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        data-testid="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
      >
        <h2>Settings</h2>
        <label className="settings-row">
          Sound volume
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            data-testid="volume-slider"
            onChange={(e) => onVolume(Number(e.target.value))}
          />
          <span className="settings-value">{volume}%</span>
        </label>
        <label className="settings-row">
          Music volume
          <input
            type="range"
            min={0}
            max={100}
            value={musicVolume}
            data-testid="music-slider"
            onChange={(e) => onMusicVolume(Number(e.target.value))}
          />
          <span className="settings-value">{musicVolume}%</span>
        </label>
        <label className="settings-row">
          Reduced motion
          <input
            type="checkbox"
            checked={reducedMotion}
            data-testid="reduced-motion"
            onChange={(e) => onReducedMotion(e.target.checked)}
          />
          <span className="settings-note">no screen shake or full-screen flashes</span>
        </label>
        <label className="settings-row">
          Vibration
          <input type="checkbox" checked={haptics} data-testid="haptics" onChange={(e) => onHaptics(e.target.checked)} />
          <span className="settings-note">buzz on spire hits & run endings (touch devices)</span>
        </label>
        <label className="settings-row">
          High-visibility colors
          <input
            type="checkbox"
            checked={colorAssist}
            data-testid="color-assist"
            onChange={(e) => onColorAssist(e.target.checked)}
          />
          <span className="settings-note">colorblind-safe enemy palette</span>
        </label>
        <h3>Records</h3>
        <div className="records-row" data-testid="records">
          <span>Best wave <strong>{meta.bestWave}</strong></span>
          <span>Runs <strong>{meta.runs}</strong></span>
          <span>Victories <strong>{meta.victories}</strong></span>
          <span>Kills <strong>{meta.lifetimeKills.toLocaleString()}</strong></span>
          <span>Ascensions <strong>{meta.ascensions}</strong></span>
          <span>
            Achievements <strong>{meta.achievements.length}/{ACHIEVEMENTS.length}</strong>
          </span>
        </div>
        {Object.keys(meta.bestWaveByMap).length > 0 && (
          <div className="records-row" data-testid="map-records">
            {BIOME_IDS.map((b) =>
              (meta.bestWaveByMap[b] ?? 0) > 0 ? (
                <span key={b}>
                  {BIOMES[b].name} <strong>{meta.bestWaveByMap[b]}</strong>
                </span>
              ) : null,
            )}
          </div>
        )}
        <div className="achievement-grid">
          {ACHIEVEMENTS.map((a) => (
            <span
              key={a.id}
              className={`unlock-chip${meta.achievements.includes(a.id) ? '' : ' locked'}`}
              title={`${a.description}${a.sparks > 0 ? ` (+✦${a.sparks})` : ''}`}
            >
              {meta.achievements.includes(a.id) ? '🏅' : '🔒'} {a.name}
            </span>
          ))}
        </div>
        {meta.history.length > 0 && (
          <table className="history-table">
            <tbody>
              {meta.history.slice(0, 8).map((h, i) => (
                <tr key={i} className={h.outcome === 'victory' ? 'won' : ''}>
                  <td>{h.outcome === 'victory' ? '🏆' : '💀'}</td>
                  <td>wave {h.wavesCleared}</td>
                  <td>{h.kills} kills</td>
                  <td>✦ {h.sparks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <h3>Save transfer</h3>
        <div className="transfer-row">
          <button
            className="ghost-btn"
            data-testid="export-save"
            onClick={() => {
              const code = exportSave()
              if (!code) return
              setTransferCode(code)
              void navigator.clipboard?.writeText(code).catch(() => {})
            }}
          >
            Export code
          </button>
          <button
            className="ghost-btn"
            data-testid="import-save"
            onClick={() => {
              if (!transferCode.trim()) return
              if (!window.confirm('Import this code? Your current progress will be replaced.')) return
              if (importSave(transferCode)) window.location.reload()
              else setImportFailed(true)
            }}
          >
            Import code
          </button>
        </div>
        <textarea
          className="transfer-code"
          data-testid="transfer-code"
          placeholder="Export fills this with a copyable code; paste a code here to import."
          value={transferCode}
          onChange={(e) => {
            setTransferCode(e.target.value)
            setImportFailed(false)
          }}
        />
        {importFailed && (
          <p className="transfer-error" data-testid="import-failed">
            That code didn't parse as a Spirefall save.
          </p>
        )}
        <h3>Keyboard shortcuts</h3>
        <div className="shortcuts-grid">
          {SHORTCUTS.map(([keys, what]) => (
            <div key={keys} className="shortcut-row">
              <kbd className="key-hint">{keys}</kbd>
              <span>{what}</span>
            </div>
          ))}
        </div>
        <button className="ghost-btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}

export function SpireTreeModal({
  meta,
  onBuy,
  onBuyEmber,
  onAscend,
  onClose,
  onHardReset,
}: {
  meta: MetaState
  onBuy: (id: MetaUpgradeId) => void
  onBuyEmber: (id: EmberUpgradeId) => void
  onAscend: () => void
  onClose: () => void
  onHardReset: () => void
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Spire Tree">
        <h2>The Spire Tree — ✦ {meta.sparks}</h2>
        <p className="run-flavor">Permanent upgrades. New purchases take effect on your next run.</p>
        <SpireTree meta={meta} onBuy={onBuy} />
        <AscensionPanel meta={meta} onBuyEmber={onBuyEmber} onAscend={onAscend} />
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
