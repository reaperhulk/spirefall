import { useState } from 'react'
import { ACHIEVEMENTS } from '../data/achievements'
import { BIOME_IDS, BIOMES } from '../data/biomes'
import type { MetaState } from '../engine/types'
import { ControlsSettings } from './ControlsSettings'
import { settings, updateSettings } from './settings'
import { exportSave, importSave } from './save'

function RunHistorySpark({ history }: { history: MetaState['history'] }) {
  const runs = history.slice(0, 20).reverse() // stored newest-first
  const w = 240
  const h = 44
  const max = Math.max(...runs.map((r) => r.wavesCleared), 1)
  const bw = Math.max(3, Math.floor(w / runs.length) - 2)
  return (
    <div className="hp-spark" data-testid="history-spark" title="Waves cleared per run, oldest to newest — gold bars are victories">
      <h4>Last {runs.length} runs</h4>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        {runs.map((r, i) => {
          const bh = Math.max(2, (r.wavesCleared / max) * (h - 6))
          return (
            <rect
              key={i}
              x={i * (bw + 2) + 1}
              y={h - 2 - bh}
              width={bw}
              height={bh}
              rx={1}
              fill={r.outcome === 'victory' ? '#e5c07b' : '#3d59a1'}
            >
              {/* Native SVG tooltip: hover a bar for that run's story. */}
              <title>
                {`${r.outcome === 'victory' ? '🏆' : '💀'} wave ${r.wavesCleared}${r.biome ? ` · ${BIOMES[r.biome].name}` : ''}${(r.crucible ?? 0) > 0 ? ` · Crucible ${r.crucible}` : ''} · ✦${r.sparks}`}
              </title>
            </rect>
          )
        })}
      </svg>
    </div>
  )
}

// The run's health timeline: one sample per cleared wave. Dips show exactly
// which waves drew blood; the knit heal shows as slow recovery.
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
  onWatchReplay,
  onClose,
  quietEffects,
  quietAudio,
  onQuietEffects,
  onQuietAudio,
  onHardReset,
  askConfirm,
}: {
  quietEffects: boolean
  quietAudio: boolean
  onQuietEffects: (value: boolean) => void
  onQuietAudio: (value: boolean) => void
  onHardReset: () => void
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
  onWatchReplay: (text: string) => boolean
  onClose: () => void
  askConfirm: (message: string, action: () => void) => void
}) {
  const [transferCode, setTransferCode] = useState('')
  const [importFailed, setImportFailed] = useState(false)
  const [replayCode, setReplayCode] = useState('')
  const [replayFailed, setReplayFailed] = useState(false)
  const [, refreshControls] = useState(0)
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
        <label className="settings-row">Reduced combat effects<input type="checkbox" checked={quietEffects} onChange={e => onQuietEffects(e.target.checked)} /><span className="settings-note">Keep danger and ability cues</span></label>
        <label className="settings-row">Calm audio mix<input type="checkbox" checked={quietAudio} onChange={e => onQuietAudio(e.target.checked)} /><span className="settings-note">Fewer, softer routine effects</span></label>
        <label className="settings-row">
          Graphics quality
          <select aria-label="Graphics quality" value={settings.graphicsQuality} onChange={e => {
            const quality = e.target.value
            if (quality === 'auto' || quality === 'high' || quality === 'low') updateSettings({graphicsQuality:quality})
            refreshControls(v => v + 1)
          }}>
            <option value="auto">Auto</option><option value="high">High</option><option value="low">Low</option>
          </select>
          <span className="settings-note">Low reduces resolution and routine effects. Danger cues remain visible.</span>
        </label>
        <ControlsSettings onChange={() => refreshControls(value => value + 1)} />
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
        {meta.history.length > 1 && <RunHistorySpark history={meta.history} />}
        {meta.history.length > 0 && (
          <table className="history-table">
            <tbody>
              {meta.history.slice(0, 8).map((h, i) => (
                <tr key={i} className={h.outcome === 'victory' ? 'won' : ''}>
                  <td>{h.outcome === 'victory' ? '🏆' : '💀'}</td>
                  <td>wave {h.wavesCleared}</td>
                  <td className="history-where">
                    {h.biome ? BIOMES[h.biome].name : ''}
                    {(h.crucible ?? 0) > 0 ? ` 🔥${h.crucible}` : ''}
                  </td>
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
              void exportSave().then((code) => {
                if (!code) return
                setTransferCode(code)
                void navigator.clipboard?.writeText(code).catch(() => {})
              })
            }}
          >
            Export code
          </button>
          <button
            className="ghost-btn"
            data-testid="import-save"
            onClick={() => {
              if (!transferCode.trim()) return
              askConfirm('Import this code? Your current progress will be replaced.', () => {
                void importSave(transferCode).then((ok) => {
                  if (ok) window.location.reload()
                  else setImportFailed(true)
                })
              })
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
        <details><summary>Reset progress</summary><p>This removes Sparks and upgrades. Accessibility settings remain.</p><button className="ghost-btn danger" data-testid="hard-reset" onClick={() => askConfirm('Wipe all saved progress and start over?', onHardReset)}>Wipe all progress</button></details>
        <h3>Shared replay</h3>
        <p className="replay-hint">
          Paste a copied replay (run-over → Copy replay) — anyone's — and watch that exact run live.
        </p>
        <textarea
          className="transfer-code"
          data-testid="replay-import"
          placeholder="Paste a replay JSON here."
          value={replayCode}
          onChange={(e) => {
            setReplayCode(e.target.value)
            setReplayFailed(false)
          }}
        />
        <div className="transfer-row">
          <button
            className="ghost-btn"
            data-testid="watch-imported"
            onClick={() => {
              if (!replayCode.trim()) return
              if (!onWatchReplay(replayCode)) setReplayFailed(true)
            }}
          >
            ▶ Watch replay
          </button>
          {replayFailed && (
            <span className="transfer-error" data-testid="replay-import-failed">
              This replay is invalid, too large, or uses a different gameplay rules version.
            </span>
          )}
        </div>
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


const SHORTCUTS: [string, string][] = [
  ['1–8', 'Arm a tower for placement'],
  ['Q / W / E / F', 'Cast Meteor / Frost Nova / Gold Rush / Bulwark'],
  ['↑ ↓ ← →', 'Steer the placement cursor while armed'],
  ['Enter', 'Place / cast at the cursor'],
  ['Space', 'Start the next wave (or begin the next run)'],
  ['U', 'Upgrade / enhance the selected tower'],
  ['O', 'Overcharge the selected tower (next shot ×2.5; spends one shared charge)'],
  ['B', 'Toggle the Spire beam — tap or hover the field to aim it'],
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

