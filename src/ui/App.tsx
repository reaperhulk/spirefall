import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  ABILITIES,
  AFFIXES,
  CATACLYSMS,
  ENEMIES,
  ENHANCE_DAMAGE_PCT,
  enhanceCost,
  relicSkipGold,
  REPAIR_MAX_PER_CAST,
  repairCostPerHp,
  SELL_REFUND_PCT,
  TOWERS,
  towerInvested,
  towerTier,
  VICTORY_WAVE,
} from '../data/content'
import { damageBreakdown, effectiveCritChancePct, effectiveCritDamagePct } from '../engine/combat'
import { ascend, buyEmberUpgrade, buyMetaUpgrade, canAscend, createMeta, createRun, emberGainOnAscend, settleRun } from '../engine/meta'
import type { EmberUpgradeId } from '../data/emberTree'
import { previewNextWave } from '../engine/step'
import { sameCell } from '../engine/grid'
import { MAPS } from '../data/maps'
import type { MetaUpgradeId } from '../data/metaTree'
import type { AbilityId, CataclysmId, CellPos, RunSummary, Targeting, TowerType } from '../engine/types'
import { Sfx } from './audio'
import { GameCanvas } from './GameCanvas'
import { installHarness } from './harness'
import { RelicModal, RunOverOverlay, SettingsModal, SpireTreeModal } from './Overlays'
import { settings, updateSettings } from './settings'
import type { RenderUiState } from './render'
import { clearSave, loadSave, persistSave } from './save'
import { GameSession } from './session'

function newSeed(runs: number): string {
  return `run-${runs + 1}-${Math.random().toString(36).slice(2, 8)}`
}

const TOWER_KEYS: TowerType[] = ['arrow', 'cannon', 'frost', 'tesla', 'sniper', 'mint']
const SPEEDS = [0, 1, 2, 3, 5, 10]

// One-line combat role, shown in tooltips and the tower panel.
function towerRole(type: TowerType): string {
  if (type === 'arrow') return 'hits ground & air ✈ · 2× vs fliers'
  if (type === 'sniper') return 'hits ground & air ✈ · 1.5× vs elites, pierces shields'
  if (type === 'tesla') return 'hits ground & air ✈'
  return 'ground only — cannot hit fliers'
}
const ABILITY_KEYS: AbilityId[] = ['meteor', 'frost_nova', 'gold_rush']
const TARGETING_OPTIONS: Targeting[] = ['first', 'last', 'strongest', 'nearest']

export default function App() {
  const [boot] = useState(() => {
    const save = loadSave()
    const meta = save?.meta ?? createMeta()
    const run = save?.run ?? createRun(meta, newSeed(meta.runs))
    return { meta, run }
  })
  const [meta, setMeta] = useState(boot.meta)
  const [session, setSession] = useState(() => new GameSession(boot.run))
  const [summary, setSummary] = useState<RunSummary | null>(null)
  const [victoryPrompt, setVictoryPrompt] = useState(false)
  const [showTree, setShowTree] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [uiSettings, setUiSettings] = useState(() => ({ ...settings }))
  const [shopSelection, setShopSelection] = useState<TowerType | null>(null)
  const [abilitySelection, setAbilitySelection] = useState<AbilityId | null>(null)
  const [selectedTowerId, setSelectedTowerId] = useState<number | null>(null)
  const [hoveredTowerId, setHoveredTowerId] = useState<number | null>(null)
  const hoverRef = useRef<CellPos | null>(null)
  const [sfx] = useState(() => new Sfx())
  const [muted, setMuted] = useState(() => sfx.muted)

  const metaRef = useRef(meta)
  const sessionRef = useRef(session)
  const selectedTowerIdRef = useRef(selectedTowerId)
  useEffect(() => {
    metaRef.current = meta
  }, [meta])
  useEffect(() => {
    sessionRef.current = session
  }, [session])
  useEffect(() => {
    selectedTowerIdRef.current = selectedTowerId
  }, [selectedTowerId])

  useSyncExternalStore(session.subscribe, session.getVersion)
  const state = session.state

  // Engine events drive meta settlement and saves.
  useEffect(() => {
    session.setOnEvents((events, s) => {
      sfx.handleEvents(events)
      for (const e of events) {
        if (e.type === 'run_ended') {
          const settled = settleRun(metaRef.current, s)
          metaRef.current = settled.meta
          setMeta(settled.meta)
          setSummary(settled.summary)
          persistSave({ version: 1, meta: settled.meta, run: null })
        } else if (e.type === 'victory_achieved') {
          setVictoryPrompt(true)
          persistSave({ version: 1, meta: metaRef.current, run: s })
        } else if (
          e.type === 'wave_started' ||
          e.type === 'wave_cleared' ||
          e.type === 'relic_chosen' ||
          e.type === 'tower_placed' ||
          e.type === 'tower_sold' ||
          e.type === 'tower_upgraded'
        ) {
          persistSave({ version: 1, meta: metaRef.current, run: s })
        }
      }
    })
    return () => {
      session.setOnEvents(null)
    }
  }, [session, sfx])

  const beginNextRun = (seed?: string) => {
    const run = createRun(metaRef.current, seed ?? newSeed(metaRef.current.runs))
    const next = new GameSession(run)
    // Update the ref synchronously: the dev harness (window.__harness) reads
    // sessionRef and may be driven immediately after newRun() returns —
    // waiting for React's post-commit effect would race it onto the old session.
    sessionRef.current = next
    setSession(next)
    setSummary(null)
    setVictoryPrompt(false)
    setShopSelection(null)
    setAbilitySelection(null)
    setSelectedTowerId(null)
    setShowTree(false)
    persistSave({ version: 1, meta: metaRef.current, run })
  }

  const buyMeta = (id: MetaUpgradeId) => {
    const result = buyMetaUpgrade(metaRef.current, id)
    if (!result.ok) return
    metaRef.current = result.meta
    setMeta(result.meta)
    persistSave({ version: 1, meta: result.meta, run: sessionRef.current.terminal ? null : sessionRef.current.state })
  }

  const buyEmber = (id: EmberUpgradeId) => {
    const result = buyEmberUpgrade(metaRef.current, id)
    if (!result.ok) return
    metaRef.current = result.meta
    setMeta(result.meta)
    persistSave({ version: 1, meta: result.meta, run: sessionRef.current.terminal ? null : sessionRef.current.state })
  }

  const doAscend = () => {
    if (!canAscend(metaRef.current)) return
    const gain = emberGainOnAscend(metaRef.current)
    if (!window.confirm(`Ascend for ❖ ${gain}? The Spire Tree, unlocks, and banked Sparks burn. Ember upgrades are forever.`))
      return
    const next = ascend(metaRef.current)
    metaRef.current = next
    setMeta(next)
    persistSave({ version: 1, meta: next, run: sessionRef.current.terminal ? null : sessionRef.current.state })
  }

  // Dev/test harness on window.__game / window.__harness.
  useEffect(() => {
    installHarness({
      getSession: () => sessionRef.current,
      getMeta: () => metaRef.current,
      newRun: (seed) => beginNextRun(seed),
      buyMeta,
      reset: () => {
        clearSave()
        window.location.reload()
      },
    })
     
  }, [])

  const handleCellClick = (cell: CellPos) => {
    // Touch taps arrive with a synthetic hover that no mouseleave ever
    // clears — reset it on every tap so tooltips can't stick on mobile.
    setHoveredTowerId(null)
    if (abilitySelection) {
      session.dispatch({ type: 'cast_ability', ability: abilitySelection, cell })
      setAbilitySelection(null)
      return
    }
    const tower = state.towers.find((t) => sameCell(t.cell, cell))
    if (shopSelection) {
      // Clicking an existing tower while armed inspects it instead of
      // uselessly attempting a placement on an occupied cell.
      if (tower) {
        setShopSelection(null)
        setSelectedTowerId(tower.id)
        return
      }
      session.dispatch({ type: 'place_tower', tower: shopSelection, cell })
      return // stay armed for multi-placement
    }
    setSelectedTowerId(tower ? tower.id : null)
  }

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Escape always works, even from inside a form control.
      if (e.key === 'Escape') {
        setShopSelection(null)
        setAbilitySelection(null)
        setSelectedTowerId(null)
        setShowTree(false)
        setShowSettings(false)
        return
      }
      // Never hijack typing/selects (e.g. the targeting dropdown).
      const t = e.target
      if (t instanceof HTMLSelectElement || t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === ' ') {
        e.preventDefault()
        if (summary) beginNextRun()
        else if (sessionRef.current.state.phase === 'build') sessionRef.current.dispatch({ type: 'start_wave' })
        return
      }
      if (e.key === '?') {
        setShowSettings((v) => !v)
        return
      }
      const key = e.key.toLowerCase()
      if (key === 'u' || key === 'x') {
        // Upgrade / sell the selected tower.
        const id = selectedTowerIdRef.current
        if (id !== null) {
          if (key === 'u') sessionRef.current.dispatch({ type: 'upgrade_tower', id })
          else {
            sessionRef.current.dispatch({ type: 'sell_tower', id })
            setSelectedTowerId(null)
          }
        }
        return
      }
      if (key === 'r') {
        sessionRef.current.dispatch({ type: 'repair_spire' })
        return
      }
      if (key === 't') {
        setShowTree((v) => !v)
        return
      }
      if (key === 'm') {
        setMuted(sfx.toggleMute())
        return
      }
      if (e.key === '-' || e.key === '=' || e.key === '+') {
        const idx = Math.max(0, SPEEDS.indexOf(sessionRef.current.speed))
        const next = e.key === '-' ? Math.max(0, idx - 1) : Math.min(SPEEDS.length - 1, idx + 1)
        sessionRef.current.setSpeed(SPEEDS[next]!)
        return
      }
      const towerIdx = ['1', '2', '3', '4', '5', '6'].indexOf(e.key)
      if (towerIdx !== -1) {
        const type = TOWER_KEYS[towerIdx]!
        if (sessionRef.current.state.availableTowers.includes(type)) {
          setShopSelection((cur) => (cur === type ? null : type))
          setAbilitySelection(null)
        }
        return
      }
      const abilityIdx = ['q', 'w', 'e'].indexOf(e.key.toLowerCase())
      if (abilityIdx !== -1) {
        const ability = ABILITY_KEYS[abilityIdx]!
        const s = sessionRef.current.state
        if (ability in s.abilities && s.abilities[ability] === 0 && s.phase === 'wave') {
          if (ability === 'gold_rush') sessionRef.current.dispatch({ type: 'cast_ability', ability, cell: { cx: 0, cy: 0 } })
          else {
            setAbilitySelection((cur) => (cur === ability ? null : ability))
            setShopSelection(null)
          }
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)

  }, [summary, sfx])

  const renderUi: RenderUiState = {
    get hoverCell() {
      return hoverRef.current
    },
    selectedTowerId,
    shopSelection,
    abilitySelection,
  }

  const selectedTower = selectedTowerId !== null ? state.towers.find((t) => t.id === selectedTowerId) : undefined
  const hoveredTower = hoveredTowerId !== null ? state.towers.find((t) => t.id === hoveredTowerId) : undefined
  const hpPct = Math.round((state.spireHp / state.spireMaxHp) * 100)
  const critChance = effectiveCritChancePct(state)

  // Repair is a gold trade, not a freebie — surface exactly what a click buys.
  const repairPerHp = repairCostPerHp(state.wave)
  const repairHp = Math.min(REPAIR_MAX_PER_CAST, state.spireMaxHp - state.spireHp, Math.floor(state.gold / repairPerHp))

  // Scouting report: deterministic preview of what start_wave will field.
  const preview = state.phase === 'build' && !summary ? previewNextWave(state) : null

  return (
    <div className="app">
      <header className="hud">
        <div className="hud-title">
          SPIREFALL
          <span className="hud-wave" data-testid="wave-label">
            {state.victoryClaimed ? `Wave ${state.wave} · ENDLESS` : `Wave ${state.wave}/${VICTORY_WAVE}`}
            {' · '}
            {MAPS[state.mapId]!.name}
          </span>
        </div>
        {state.phase === 'wave' && state.activeAffix && (
          <span className="affix-badge" data-testid="affix" title={AFFIXES[state.activeAffix].description}>
            {AFFIXES[state.activeAffix].name}
          </span>
        )}
        {state.cataclysms.length > 0 && (
          <span className="cataclysm-badges" data-testid="cataclysms">
            {Object.entries(
              state.cataclysms.reduce<Record<string, number>>((acc, c) => {
                acc[c] = (acc[c] ?? 0) + 1
                return acc
              }, {}),
            ).map(([id, n]) => (
              <span key={id} className="cataclysm-badge" title={CATACLYSMS[id as CataclysmId].description}>
                {CATACLYSMS[id as CataclysmId].name}
                {n > 1 && ` ×${n}`}
              </span>
            ))}
          </span>
        )}
        <div className="hud-spire" title={`Spire ${state.spireHp}/${state.spireMaxHp}`}>
          <div className="hp-bar">
            <div className="hp-fill" style={{ width: `${hpPct}%` }} />
          </div>
          <span data-testid="spire-hp">
            {state.spireHp}/{state.spireMaxHp}
          </span>
          {state.spireHp < state.spireMaxHp && (
            <button
              className="ghost-btn"
              data-testid="repair-spire"
              disabled={repairHp <= 0}
              title={`Mends up to ${REPAIR_MAX_PER_CAST} HP per cast at ⛀${repairPerHp} per HP — the price climbs with each wave (R)`}
              onClick={() => session.dispatch({ type: 'repair_spire' })}
            >
              {repairHp > 0 ? `Repair +${repairHp} (⛀ ${repairHp * repairPerHp})` : `Repair (⛀ ${repairPerHp}/HP)`}
            </button>
          )}
        </div>
        <div className="hud-right">
          <span className="hud-gold" data-testid="gold">
            ⛀ {state.gold}
          </span>
          <span className="hud-sparks" data-testid="meta-sparks">
            ✦ {meta.sparks}
          </span>
          {(meta.embers > 0 || meta.ascensions > 0) && (
            <span className="hud-embers" data-testid="meta-embers" title={`Embers · ascension cycle ${meta.ascensions + 1}`}>
              ❖ {meta.embers}
            </span>
          )}
          <button
            className="ghost-btn"
            data-testid="mute"
            title={`${muted ? 'Unmute' : 'Mute'} sound (M)`}
            onClick={() => setMuted(sfx.toggleMute())}
          >
            {muted ? '🔇' : '🔊'}
          </button>
          <div className="speed-controls" title="Keys − and = step speed down/up">
            {SPEEDS.map((n) => (
              <button
                key={n}
                className={session.speed === n ? 'active' : ''}
                onClick={() => {
                  session.setSpeed(n)
                }}
              >
                {n === 0 ? '⏸' : `${n}×`}
              </button>
            ))}
          </div>
          <button className="ghost-btn" onClick={() => setShowTree(true)} data-testid="open-tree" title="Spire Tree (T)">
            Spire Tree
          </button>
          <button
            className="ghost-btn"
            onClick={() => setShowSettings(true)}
            data-testid="open-settings"
            title="Settings & shortcuts (?)"
          >
            ⚙
          </button>
          {!summary && (
            <button
              className="ghost-btn danger"
              data-testid="abandon-run"
              title="End this run now — you keep the Sparks earned so far"
              onClick={() => {
                if (window.confirm(state.victoryClaimed ? 'End the run and bank your victory?' : 'Abandon this run? You keep the Sparks earned so far.')) {
                  session.dispatch({ type: 'abandon_run' })
                }
              }}
            >
              {state.victoryClaimed ? 'End run' : 'Give up'}
            </button>
          )}
          {state.phase === 'build' && (
            <button
              className="primary-btn"
              onClick={() => session.dispatch({ type: 'start_wave' })}
              data-testid="start-wave"
              title="Start the next wave (Space)"
            >
              Start wave {state.wave + 1}
            </button>
          )}
        </div>
      </header>

      {preview && (
        <div className="wave-preview" data-testid="wave-preview">
          <span className="preview-label">Next wave:</span>
          {(Object.entries(preview.counts) as [keyof typeof ENEMIES, number][])
            .sort(([ta, a], [tb, b]) => (ta === 'boss' ? -1 : tb === 'boss' ? 1 : b - a || ta.localeCompare(tb)))
            .map(([type, n]) => (
              <span key={type} className={`preview-unit${type === 'boss' ? ' boss' : ''}`}>
                {n}× {ENEMIES[type].name}
                {ENEMIES[type].flying && <span className="air-mark" title="Flying — only Arrow, Tesla, and Sniper can hit it">✈</span>}
              </span>
            ))}
          {preview.affix && (
            <span className="affix-badge" title={AFFIXES[preview.affix].description}>
              {AFFIXES[preview.affix].name}
            </span>
          )}
        </div>
      )}

      <main className="board">
        <GameCanvas
          session={session}
          ui={renderUi}
          onCellClick={handleCellClick}
          onHover={(c) => {
            hoverRef.current = c
            const tower = c ? sessionRef.current.state.towers.find((t) => sameCell(t.cell, c)) : undefined
            setHoveredTowerId((cur) => (tower ? tower.id : null) === cur ? cur : (tower ? tower.id : null))
          }}
        />
        {hoveredTower && !shopSelection && hoveredTower.id !== selectedTowerId && (
          <div
            className="tower-tooltip"
            data-testid="tower-tooltip"
            style={{
              left: Math.min(hoveredTower.cell.cx * 34 + 42, 24 * 34 - 190),
              top: Math.max(4, hoveredTower.cell.cy * 34 - 10),
            }}
          >
            <strong>
              {TOWERS[hoveredTower.type].name} · T{hoveredTower.tier}
              {hoveredTower.enhance > 0 && ` +${hoveredTower.enhance}`}
            </strong>
            {hoveredTower.type === 'mint' ? (
              <span>{towerTier('mint', hoveredTower.tier).mintYield} gold / cleared wave</span>
            ) : (
              (() => {
                const b = damageBreakdown(state, hoveredTower)
                return (
                  <span>
                    {b.effective} dmg{b.parts.length > 0 && ` (${b.base} base +${b.totalPct - 100}%)`} ·{' '}
                    {(30 / towerTier(hoveredTower.type, hoveredTower.tier).cooldown).toFixed(1)}/s ·{' '}
                    {(towerTier(hoveredTower.type, hoveredTower.tier).range / 1000).toFixed(1)} range
                  </span>
                )
              })()
            )}
            {hoveredTower.type !== 'mint' && (
              <span>
                {towerRole(hoveredTower.type)}
                {critChance > 0 && ` · ${critChance}% crit ×${(effectiveCritDamagePct(state) / 100).toFixed(1)}`}
              </span>
            )}
            <span>
              {hoveredTower.type === 'mint'
                ? `earned via waves`
                : `${hoveredTower.kills} kills · ${hoveredTower.damageDealt} dmg dealt`}
            </span>
            <span>targets {hoveredTower.targeting} · click to manage</span>
          </div>
        )}
        {selectedTower && (
          <aside className="tower-panel" data-testid="tower-panel">
            <button
              className="panel-close"
              data-testid="close-tower-panel"
              aria-label="Close tower details"
              onClick={() => setSelectedTowerId(null)}
            >
              ✕
            </button>
            <h3>
              {TOWERS[selectedTower.type].name} · Tier {selectedTower.tier}
              {selectedTower.enhance > 0 && ` +${selectedTower.enhance}`}
            </h3>
            {selectedTower.type === 'mint' ? (
              <p>{towerTier('mint', selectedTower.tier).mintYield} gold per cleared wave</p>
            ) : (
              (() => {
                const b = damageBreakdown(state, selectedTower)
                return (
                  <>
                    <p>
                      DMG {b.effective}
                      {b.parts.length > 0 && ` (base ${b.base})`} ·{' '}
                      {(30 / towerTier(selectedTower.type, selectedTower.tier).cooldown).toFixed(1)} shots/s
                    </p>
                    {b.parts.length > 0 && (
                      <ul className="dmg-breakdown" data-testid="dmg-breakdown">
                        {b.parts.map((p) => (
                          <li key={p.source}>
                            +{p.pct}% {p.source}
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )
              })()
            )}
            <p data-testid="tower-stats">
              {selectedTower.kills} kills · {selectedTower.damageDealt} dmg dealt
            </p>
            {selectedTower.type !== 'mint' && (
              <p className="tower-air-note">
                {towerRole(selectedTower.type)}
                {critChance > 0 && ` · ${critChance}% crit`}
              </p>
            )}
            <label>
              Target:{' '}
              <select
                value={selectedTower.targeting}
                onChange={(e) =>
                  session.dispatch({
                    type: 'set_targeting',
                    id: selectedTower.id,
                    targeting: e.target.value as Targeting,
                  })
                }
              >
                {TARGETING_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            {selectedTower.tier < 3 ? (
              <button
                className="primary-btn"
                data-testid="upgrade-tower"
                disabled={state.gold < towerTier(selectedTower.type, (selectedTower.tier + 1) as 2 | 3).cost}
                onClick={() => session.dispatch({ type: 'upgrade_tower', id: selectedTower.id })}
              >
                Upgrade (⛀ {towerTier(selectedTower.type, (selectedTower.tier + 1) as 2 | 3).cost}){' '}
                <kbd className="key-hint">U</kbd>
              </button>
            ) : (
              <button
                className="primary-btn"
                data-testid="upgrade-tower"
                title={`+${ENHANCE_DAMAGE_PCT}% damage, repeatable`}
                disabled={state.gold < enhanceCost(selectedTower.type, selectedTower.enhance)}
                onClick={() => session.dispatch({ type: 'upgrade_tower', id: selectedTower.id })}
              >
                Enhance (⛀ {enhanceCost(selectedTower.type, selectedTower.enhance)}) <kbd className="key-hint">U</kbd>
              </button>
            )}
            <button
              className="ghost-btn"
              data-testid="sell-tower"
              title={
                selectedTower.shots === 0
                  ? 'Full refund — this tower has not acted yet'
                  : `Towers that have acted refund ${SELL_REFUND_PCT}% of gold invested`
              }
              onClick={() => {
                session.dispatch({ type: 'sell_tower', id: selectedTower.id })
                setSelectedTowerId(null)
              }}
            >
              Sell (⛀{' '}
              {Math.floor(
                (towerInvested(selectedTower.type, selectedTower.tier) * (selectedTower.shots === 0 ? 100 : SELL_REFUND_PCT)) /
                  100,
              )}
              {selectedTower.shots === 0 && ' · full refund'}) <kbd className="key-hint">X</kbd>
            </button>
          </aside>
        )}
      </main>

      <footer className="shop">
        <div className="shop-towers">
          {TOWER_KEYS.map((type, i) => {
            const unlocked = state.availableTowers.includes(type)
            const cost = towerTier(type, 1).cost
            const affordable = state.gold >= cost
            return (
              <button
                key={type}
                className={`shop-card${shopSelection === type ? ' selected' : ''}${unlocked && !affordable ? ' unaffordable' : ''}`}
                data-testid={`shop-${type}`}
                disabled={!unlocked}
                title={unlocked ? `Hotkey ${i + 1}` : 'Unlock in the Spire Tree'}
                onClick={() => {
                  setShopSelection((cur) => (cur === type ? null : type))
                  setAbilitySelection(null)
                }}
              >
                <span className={`tower-dot tower-${type}`} />
                {TOWERS[type].name}
                {TOWERS[type].hitsAir && (
                  <span className="air-mark" title="Can hit fliers">
                    ✈
                  </span>
                )}
                {unlocked && <kbd className="key-hint">{i + 1}</kbd>}
                <span className="cost">{unlocked ? `⛀ ${cost}` : '🔒'}</span>
              </button>
            )
          })}
        </div>
        <div className="shop-abilities">
          {ABILITY_KEYS.filter((a) => a in state.abilities).map((ability, i) => {
            const cd = state.abilities[ability] ?? 0
            const ready = cd === 0 && state.phase === 'wave'
            return (
              <button
                key={ability}
                className={`ability-btn${abilitySelection === ability ? ' selected' : ''}`}
                data-testid={`ability-${ability}`}
                disabled={!ready}
                title={`Hotkey ${['Q', 'W', 'E'][i]}`}
                onClick={() => {
                  if (ability === 'gold_rush') session.dispatch({ type: 'cast_ability', ability, cell: { cx: 0, cy: 0 } })
                  else {
                    setAbilitySelection((cur) => (cur === ability ? null : ability))
                    setShopSelection(null)
                  }
                }}
              >
                {ABILITIES[ability].name}
                <kbd className="key-hint">{['Q', 'W', 'E'][i]}</kbd>
                {cd > 0 && <span className="cooldown">{Math.ceil(cd / 30)}s</span>}
              </button>
            )
          })}
        </div>
      </footer>

      {victoryPrompt && !summary && (
        <div className="modal-backdrop" data-testid="victory-prompt">
          <div className="modal">
            <h2>THE CYCLE BREAKS</h2>
            <p className="run-summary">Wave {VICTORY_WAVE} cleared — the Spire stands where every cycle before it fell.</p>
            <p className="run-flavor">
              End the run now and bank the victory, or push into the endless dark. Sparks keep accruing either way;
              the victory bonus is yours whenever this run ends.
            </p>
            <button className="primary-btn" data-testid="claim-victory" onClick={() => session.dispatch({ type: 'abandon_run' })}>
              Claim victory & end run
            </button>
            <button className="ghost-btn" data-testid="continue-endless" onClick={() => setVictoryPrompt(false)}>
              Continue — endless
            </button>
          </div>
        </div>
      )}
      {state.relicOffer && !summary && !victoryPrompt && (
        <RelicModal
          options={state.relicOffer}
          skipGold={relicSkipGold(state.wave)}
          canReroll={!state.relicRerolled && state.gold >= relicSkipGold(state.wave)}
          onChoose={(relic) => session.dispatch({ type: 'choose_relic', relic })}
          onReroll={() => session.dispatch({ type: 'reroll_relic' })}
        />
      )}
      {summary && (
        <RunOverOverlay
          summary={summary}
          meta={meta}
          onBuy={buyMeta}
          onBuyEmber={buyEmber}
          onAscend={doAscend}
          onNextRun={() => beginNextRun()}
        />
      )}
      {showSettings && (
        <SettingsModal
          volume={uiSettings.volume}
          reducedMotion={uiSettings.reducedMotion}
          onVolume={(v) => setUiSettings({ ...updateSettings({ volume: v }) })}
          onReducedMotion={(v) => setUiSettings({ ...updateSettings({ reducedMotion: v }) })}
          onClose={() => setShowSettings(false)}
        />
      )}
      {showTree && !summary && (
        <SpireTreeModal
          meta={meta}
          onBuy={buyMeta}
          onBuyEmber={buyEmber}
          onAscend={doAscend}
          onClose={() => setShowTree(false)}
          onHardReset={() => {
            clearSave()
            window.location.reload()
          }}
        />
      )}
    </div>
  )
}
