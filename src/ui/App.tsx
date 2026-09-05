import { useRunCheckpoint } from './useRunCheckpoint'
import { Icon } from './Icon'
import { TowerPortrait } from './TowerPortrait'
import { BuildDoctrine } from './BuildDoctrine'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { MAP_HEIGHT, MAP_WIDTH } from '../data/maps'
import {
  ABILITIES,
  AFFIXES,
  specForTower,
  TOWER_SPECS,
  CATACLYSMS,
  ENHANCE_DAMAGE_PCT,
  enhanceCost,
  relicSkipGold,
  BEAM_COOL_PER_TICK,
  BEAM_DAMAGE_PER_TICK,
  BEAM_HEAT_MAX,
  BOONS,
  COMBO_HASTE_THRESHOLD,
  EXECUTE_THRESHOLD_PCT,
  COMBO_WINDOW_TICKS,
  OVERCHARGE_DAMAGE_PCT,
  CRUCIBLE_HP_PCT_PER_RANK,
  CRUCIBLE_SPARK_PCT_PER_RANK,
  crucibleTiersAt,
  REPAIR_CASTS_PER_WAVE,
  REPAIR_MAX_PER_CAST,
  repairCostPerHp,
  SELL_REFUND_PCT,
  TOWERS,
  towerInvested,
  towerTier,
  TRIALS,
  VETERANCY_TIERS,
  veterancyStars,
  VICTORY_WAVE,
} from '../data/content'
import {
  damageBreakdown,
  effectiveAbilityCooldown,
  effectiveCritChancePct,
  effectiveCritDamagePct,
  effectiveTowerCooldown,
  towerRangeOnBoard,
} from '../engine/combat'
import { getRunMap } from '../engine/mapgen'
import { respecKeystone, ascend, buyEmberUpgrade, buyMetaUpgrade, canAscend, createMeta, createRun, emberGainOnAscend, settleRun } from '../engine/meta'
import type { EmberUpgradeId } from '../data/emberTree'
import { previewNextWave, wavesUntilCataclysm } from '../engine/step'
import { cellCenter, sameCell } from '../engine/grid'
import { BIOME_IDS, BIOMES, type BiomeId } from '../data/biomes'
import type { MetaUpgradeId } from '../data/metaTree'
import type { AbilityId, CataclysmId, CellPos, EnemyType, RunState, RunSummary, Targeting, TowerType, TrialId } from '../engine/types'
import { Sfx } from './audio'
import { Music } from './music'
import { CodexModal } from './Codex'
import { handleHaptics } from './haptics'
import { GameCanvas } from './GameCanvas'
import { WavePreview } from './WavePreview'
import { installHarness } from './harness'
import { CataclysmModal, ConfirmModal, RelicModal, RunOverOverlay, RunStatsModal, SettingsModal, SpireTreeModal } from './Overlays'
import { gunzipBase64Url, gzipBase64Url } from './codec'
import { settings, updateSettings } from './settings'
import type { RenderUiState } from './render'
import { clearSave, loadSave, persistSave, getSaveStatus, subscribeSaveStatus } from './save'
import { useDialogFocus } from './useDialogFocus'
import { RULES_VERSION, parseRecording } from './validation'
import { GameSession } from './session'
import { dailySeed, loadDailyBest, loadDailyRaw, loadMapPref, loadTrialPref, MAP_PREF_KEY, newSeed, TRIAL_PREF_KEY, type DailyBest } from './prefs'
import { ABILITY_KEYS, SPEEDS, TARGETING_OPTIONS, TOWER_KEYS, towerRole, upgradeDelta } from './towerCopy'

export default function App() {
  useDialogFocus()
  const [boot] = useState(() => {
    const save = loadSave()
    const meta = save?.meta ?? createMeta()
    // Deep links: ?seed=<x> starts a fresh run on that seed (shareable
    // challenges, bug repros); ?daily=1 jumps straight into today's shared
    // seed (PWA shortcut). Meta always carries over; the param is stripped
    // so a reload resumes normally.
    let linkSeed: string | null = null
    let linkReplay: string | null = null
    // Challenge links carry the full ruleset: without &biome= the seed roll
    // draws from the RECIPIENT'S unlocked pool (a different battlefield for
    // a different account), and without &trials= the hardship is dropped.
    let linkBiome: BiomeId | undefined
    let linkTrials: TrialId[] | undefined
    try {
      const params = new URLSearchParams(window.location.search)
      linkSeed = params.get('seed') ?? (params.get('daily') !== null ? dailySeed() : null)
      const biomeParam = params.get('biome')
      if (biomeParam !== null && (BIOME_IDS as string[]).includes(biomeParam)) linkBiome = biomeParam as BiomeId
      const trialsParam = params.get('trials')
      if (trialsParam !== null) {
        linkTrials = trialsParam.split(',').filter((t): t is TrialId => Object.prototype.hasOwnProperty.call(TRIALS, t))
      }
      // ?replay=<gzip blob>: spectate someone's exact run (decoded async
      // after mount — the boot run underneath stays the player's own).
      linkReplay = params.get('replay')
      if (linkSeed !== null || linkReplay !== null) window.history.replaceState(null, '', window.location.pathname)
    } catch {
      linkSeed = null
      linkReplay = null
    }
    const run =
      linkSeed !== null ? createRun(meta, linkSeed, linkBiome, linkTrials) : (save?.run ?? createRun(meta, newSeed(meta.runs)))
    return { meta, run, linkReplay, recording: linkSeed === null ? save?.recording : undefined }
  })
  const [meta, setMeta] = useState(boot.meta)
  const [session, setSession] = useState(() => new GameSession(boot.run, boot.recording))
  const [summary, setSummary] = useState<RunSummary | null>(null)
  const [victoryPrompt, setVictoryPrompt] = useState(false)
  const [showTree, setShowTree] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [showCodex, setShowCodex] = useState(false)
  const [codexFocus, setCodexFocus] = useState<EnemyType | null>(null)
  const [uiSettings, setUiSettings] = useState(() => ({ ...settings }))
  const [shopSelection, setShopSelection] = useState<TowerType | null>(null)
  const [abilitySelection, setAbilitySelection] = useState<AbilityId | null>(null)
  const [selectedTowerId, setSelectedTowerId] = useState<number | null>(null)
  const [hoveredTowerId, setHoveredTowerId] = useState<number | null>(null)
  const hoverRef = useRef<CellPos | null>(null)
  const keyboardEnemyRef = useRef<number | null>(null)
  // Beam mode is a LATCH (B key or the Beam button), not a held chord —
  // the same control works identically with a mouse or a thumb.
  const beamModeRef = useRef(false)
  const [beamMode, setBeamMode] = useState(false)
  // Screen-reader narration of major beats (aria-live, visually hidden).
  const [srMessage, setSrMessage] = useState('')
  // In-app confirmation (replaces window.confirm — see ConfirmModal).
  const [confirm, setConfirm] = useState<{ message: string; action: () => void } | null>(null)
  const askConfirm = (message: string, action: () => void) => setConfirm({ message, action })
  const [dailyBest, setDailyBest] = useState<DailyBest | null>(() => loadDailyBest())
  const [mapPref, setMapPref] = useState<string>(() => loadMapPref())
  const mapPrefRef = useRef(mapPref)
  useEffect(() => {
    mapPrefRef.current = mapPref
  }, [mapPref])
  const [trialPref, setTrialPref] = useState<string>(() => loadTrialPref())
  const trialPrefRef = useRef(trialPref)
  useEffect(() => {
    trialPrefRef.current = trialPref
  }, [trialPref])
  const [hintsDismissed, setHintsDismissed] = useState(() => {
    try {
      return localStorage.getItem('spirefall-hints-done') === '1'
    } catch {
      return true
    }
  })
  const [sfx] = useState(() => new Sfx())
  // Audio is never assumed working: browsers gate it behind a gesture (and
  // disagree on which), so the sound button renders from PROBED liveness.
  const audioLive = useSyncExternalStore(
    useCallback((cb: () => void) => sfx.onStatusChange(cb), [sfx]),
    () => sfx.live,
  )
  const [music] = useState(() => new Music(sfx))
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
  useEffect(() => {
    session.setSuspended(showTree || showSettings || showStats || showCodex || confirm !== null)
    return () => { session.setSuspended(false) }
  }, [session, showTree, showSettings, showStats, showCodex, confirm, victoryPrompt])
  const state = session.state
  const saveStatus = useSyncExternalStore(subscribeSaveStatus, getSaveStatus)

  // The score reads the LIVE session each scheduler tick — sessionRef stays
  // current across newRun(), so the music follows every run seamlessly.
  useEffect(() => {
    music.attach(() => sessionRef.current.state)
  }, [music])

  useRunCheckpoint(sessionRef, metaRef)

  // Engine events drive meta settlement and saves.
  useEffect(() => {
    session.setOnEvents((events, s) => {
      sfx.handleEvents(events)
      music.handleEvents(events)
      handleHaptics(events)
      // Screen-reader narration: major beats only, one polite message per
      // batch — a per-kill feed would drown the reader in a horde game.
      for (const e of events) {
        if (e.type === 'wave_started') {
          setSrMessage(`Wave ${e.wave} started — ${e.spawnCount} enemies${e.affix ? `, ${AFFIXES[e.affix].name} affix` : ''}.`)
        } else if (e.type === 'wave_cleared') {
          setSrMessage(`Wave cleared. Spire at ${s.spireHp} of ${s.spireMaxHp} HP, ${s.gold} gold.`)
        } else if (e.type === 'enemy_reached_spire') {
          setSrMessage(`The Spire takes ${e.damage} damage — ${e.spireHp} HP left.`)
        } else if (e.type === 'victory_achieved') {
          setSrMessage('Victory — the cycle breaks. The Spire stands.')
        } else if (e.type === 'cataclysm_offered') {
          setSrMessage(
            `A Cataclysm strikes — choose your doom: ${e.options.map((c) => CATACLYSMS[c].name).join(' or ')}.`,
          )
        } else if (e.type === 'cataclysm_struck') {
          setSrMessage(`The world hardens: ${CATACLYSMS[e.cataclysm].name}.`)
        } else if (e.type === 'run_ended') {
          setSrMessage(
            e.outcome === 'victory'
              ? `Run over: victory at wave ${e.wavesCleared}, ${e.sparks} sparks earned.`
              : `Run over: the Spire falls after wave ${e.wavesCleared}, ${e.sparks} sparks earned.`,
          )
        }
      }
      // A replay is a spectator: it must never settle meta again, prompt
      // for victory, or touch the save — the run already happened.
      if (session.replaying) return
      let saveNeeded = false
      for (const e of events) {
        if (e.type === 'run_ended') {
          if (s.seed === dailySeed()) {
            const today = new Date().toISOString().slice(0, 10)
            const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
            const raw = loadDailyRaw()
            // Streak: today extends yesterday's chain; a gap resets to 1.
            const streak =
              raw?.date === today ? (raw.streak ?? 1) : raw?.date === yesterday ? (raw.streak ?? 1) + 1 : 1
            const prior = loadDailyBest()
            if (!prior || s.wavesCleared > prior.waves) {
              const best = { date: today, waves: s.wavesCleared, streak }
              try {
                localStorage.setItem('spirefall-daily', JSON.stringify(best))
              } catch {
                // unsaved is fine
              }
              setDailyBest(best)
            }
          }
          const settled = settleRun(metaRef.current, s)
          metaRef.current = settled.meta
          setMeta(settled.meta)
          setSummary(settled.summary)
          saveNeeded = true
        } else if (e.type === 'victory_achieved') {
          setVictoryPrompt(true)
          saveNeeded = true
        } else if (
          e.type === 'wave_started' ||
          e.type === 'wave_cleared' ||
          e.type === 'relic_chosen' ||
          e.type === 'tower_placed' ||
          e.type === 'tower_sold' ||
          e.type === 'tower_upgraded'
        ) {
          saveNeeded = true
        }
      }
      if (saveNeeded) persistSave({ version: 1, meta: metaRef.current, run: session.terminal ? null : s })
    })
    return () => {
      session.setOnEvents(null)
    }
  }, [session, sfx, music])

  // Watch the last run: determinism makes the recorded command log a full
  // replay. The live (ended) session is parked and restored on exit.
  const liveSessionRef = useRef<GameSession | null>(null)
  const [watching, setWatching] = useState(false)
  const watchReplay = () => {
    const replay = sessionRef.current.replaySession()
    replay.setSpeed(2) // comfortable spectator pace; speed controls still work
    liveSessionRef.current = sessionRef.current
    sessionRef.current = replay
    setSession(replay)
    setWatching(true)
  }
  const exitReplay = () => {
    const live = liveSessionRef.current
    if (!live) return
    liveSessionRef.current = null
    sessionRef.current = live
    setSession(live)
    setWatching(false)
  }
  // A pasted v2 replay (from anyone) carries its own tick-0 state, so it
  // spectates without touching this account's meta or save.
  const watchImported = (text: string): boolean => {
    try {
      const data = parseRecording(text)
      if (!data) return false
      const replay = new GameSession(data.initial)
      replay.replayScript = data.log.map((c) => ({ tick: c.tick, command: c.command }))
      replay.replayEndTick = data.endTick
      replay.setSpeed(2)
      if (!sessionRef.current.replaying) liveSessionRef.current = sessionRef.current
      sessionRef.current = replay
      setSession(replay)
      setWatching(true)
      setShowSettings(false)
      return true
    } catch {
      return false
    }
  }

  // A ?replay= deep link spectates on arrival, once the app is mounted.
  const linkReplayDoneRef = useRef(false)
  useEffect(() => {
    if (linkReplayDoneRef.current || !boot.linkReplay) return
    linkReplayDoneRef.current = true
    void gunzipBase64Url(boot.linkReplay).then((text) => {
      if (text) watchImported(text)
    })
  })

  const launchRun = (run: RunState) => {
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
    beamModeRef.current = false
    setBeamMode(false)
    persistSave({ version: 1, meta: metaRef.current, run })
  }

  const beginNextRun = (seed?: string) => {
    // Daily runs always play the seed's rolled map — the whole point is that
    // everyone faces the same battlefield.
    const isDaily = seed === dailySeed()
    const pref = mapPrefRef.current
    const biomeOverride = !isDaily && pref !== 'random' ? (pref as BiomeId) : undefined
    const trials = !isDaily
      ? trialPrefRef.current.split(',').filter((t): t is TrialId => Object.prototype.hasOwnProperty.call(TRIALS, t))
      : []
    launchRun(createRun(metaRef.current, seed ?? newSeed(metaRef.current.runs), biomeOverride, trials))
  }

  // Rematch: the exact battlefield the ended run fought — same seed, same
  // biome, same trials — ignoring the Next Run pickers. Meta still applies,
  // so a rematch after spending sparks IS the rogue-lite promise: same
  // wall, stronger you.
  const beginRematch = (s: RunSummary) => {
    launchRun(createRun(metaRef.current, s.seed, s.biome, s.trials))
  }

  const buyMeta = (id: MetaUpgradeId) => {
    const result = buyMetaUpgrade(metaRef.current, id)
    if (!result.ok) return
    metaRef.current = result.meta
    setMeta(result.meta)
    persistSave({ version: 1, meta: result.meta, run: sessionRef.current.terminal ? null : sessionRef.current.state })
  }

  const respec = (id: MetaUpgradeId) => {
    const live = sessionRef.current
    if (live.replaying || (!live.terminal && (live.state.wave > 0 || live.state.towers.length > 0))) return
    const result = respecKeystone(metaRef.current, id)
    if (!result.ok) return
    metaRef.current = result.meta
    setMeta(result.meta)
    persistSave({ version: 1, meta: result.meta, run: live.terminal ? null : live.state })
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
    askConfirm(`Ascend for ❖ ${gain}? Spark stat upgrades and banked Sparks burn. Tower and ability unlocks remain. Ember upgrades are forever.`, () => {
      const next = ascend(metaRef.current)
      metaRef.current = next
      setMeta(next)
      music.ascendMotif() // the burning of the tree deserves its six notes
      persistSave({ version: 1, meta: next, run: sessionRef.current.terminal ? null : sessionRef.current.state })
    })
  }

  const beginNextRunRef = useRef(beginNextRun)
  useEffect(() => { beginNextRunRef.current = beginNextRun })

  // Dev/test harness on window.__game / window.__harness.
  useEffect(() => {
    installHarness({
      getSession: () => sessionRef.current,
      getMeta: () => metaRef.current,
      audioState: () => sfx.currentContext()?.state ?? 'none',
      audioLive: () => sfx.live,
      newRun: (seed) => beginNextRunRef.current(seed),
      buyMeta,
      reset: () => {
        clearSave()
        window.location.reload()
      },
    })

  }, [sfx])

  const toggleBeam = (on: boolean) => {
    beamModeRef.current = on
    setBeamMode(on)
    if (on) {
      const st = sessionRef.current.state
      const map = getRunMap(st)
      const at = hoverRef.current ? cellCenter(hoverRef.current) : { x: (map.width * 1000) / 2, y: (map.height * 1000) / 2 }
      sessionRef.current.dispatch({ type: 'set_beam', target: at })
    } else {
      sessionRef.current.dispatch({ type: 'set_beam', target: null })
    }
  }

  const handleCellClick = (cell: CellPos) => {
    // Touch taps arrive with a synthetic hover that no mouseleave ever
    // clears — reset it on every tap so tooltips can't stick on mobile.
    setHoveredTowerId(null)
    if (abilitySelection) {
      session.dispatch({ type: 'cast_ability', ability: abilitySelection, cell })
      setAbilitySelection(null)
      return
    }
    const live = sessionRef.current.state
    const tower = live.towers.find((t) => sameCell(t.cell, cell))
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
    // Beam mode: every tap/click on the field aims the ray. Predictable on
    // touch — nothing underneath can steal the tap while the beam is yours.
    if (beamModeRef.current) {
      session.dispatch({ type: 'set_beam', target: cellCenter(cell) })
      return
    }
    // Execute window: mid-wave, unarmed, clicking a cell holding a wounded
    // enemy finishes it (the render marks them with a gold ring while the
    // blade is ready). Towers still win the click if one shares the cell.
    if (!tower && live.phase === 'wave' && live.executeCd === 0) {
      const wounded = live.enemies
        .filter(
          (e) =>
            e.hp > 0 &&
            !e.phased &&
            e.hp * 100 <= e.maxHp * EXECUTE_THRESHOLD_PCT &&
            (e.pos.x - (cell.cx * 1000 + 500)) ** 2 + (e.pos.y - (cell.cy * 1000 + 500)) ** 2 <= 1200 ** 2,
        )
        .sort((a, b) => a.hp - b.hp)[0]
      if (wounded) {
        session.dispatch({ type: 'execute_enemy', id: wounded.id })
        return
      }
    }
    setSelectedTowerId(tower ? tower.id : null)
  }

  // Keyboard aiming reads live state through refs — the keydown listener's
  // closure would otherwise capture a stale first-render handler.
  const handleCellClickRef = useRef(handleCellClick)
  const toggleBeamRef = useRef(toggleBeam)
  useEffect(() => {
    handleCellClickRef.current = handleCellClick
    toggleBeamRef.current = toggleBeam
  })

  // Auto-advance: with the toggle on, the build phase sends the next wave
  // after a short beat — unless something needs the player (relic offer,
  // victory prompt, run over).
  const autoStart = uiSettings.autoStart
  useEffect(() => {
    if (!autoStart || summary || victoryPrompt || showTree || showSettings || showStats || showCodex || confirm) return
    // A pending relic or cataclysm choice pauses the conveyor — firing
    // start_wave into the gate would just spam rejections into the log.
    if (state.phase !== 'build' || state.relicOffer !== null || state.cataclysmOffer !== null) return
    const timer = setTimeout(() => {
      const s = sessionRef.current.state
      if (s.phase === 'build' && s.relicOffer === null && s.cataclysmOffer === null)
        sessionRef.current.dispatch({ type: 'start_wave' })
    }, 1200)
    return () => clearTimeout(timer)
  }, [autoStart, state.phase, state.relicOffer, state.cataclysmOffer, state.wave, summary, victoryPrompt, showTree, showSettings, showStats, showCodex, confirm])

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
        setShowStats(false)
        setShowCodex(false)
        setCodexFocus(null)
        setConfirm(null)
        return
      }
      // Never hijack typing/selects (e.g. the targeting dropdown).
      const t = e.target
      if (t instanceof HTMLSelectElement || t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const dialog = [...document.querySelectorAll<HTMLElement>('[aria-modal="true"]')].at(-1)
      if (dialog) {
        if (e.key === '?' && summary) setShowSettings(v => !v)
        else if (e.key.toLowerCase() === 'c' && dialog.getAttribute('aria-label') === 'Codex') setShowCodex(false)
        return
      }
      if (e.key === ' ') {
        e.preventDefault()
        const s = sessionRef.current.state
        if (summary) beginNextRunRef.current()
        else if (s.phase === 'build' && s.relicOffer === null && s.cataclysmOffer === null)
          // A pending choice modal owns the moment — Space shouldn't queue
          // rejected start_waves into the log behind it.
          sessionRef.current.dispatch({ type: 'start_wave' })
        return
      }
      if (e.key === '?') {
        setShowSettings((v) => !v)
        return
      }
      // Keyboard-only builds: with a tower or ability armed, arrows steer a
      // cursor on the grid (the same ghost the mouse drives) and Enter
      // confirms at the cursor.
      if (e.key === 'Enter') {
        // A focused button's native Enter-click must not double-fire a place.
        if (t instanceof HTMLButtonElement) return
        if (hoverRef.current) {
          e.preventDefault()
          handleCellClickRef.current(hoverRef.current)
        }
        return
      }
      if (e.key.startsWith('Arrow')) {
        e.preventDefault()
        const deltas: Record<string, [number, number]> = {
          ArrowUp: [0, -1],
          ArrowDown: [0, 1],
          ArrowLeft: [-1, 0],
          ArrowRight: [1, 0],
        }
        const [dx, dy] = deltas[e.key]!
        const cur = hoverRef.current ?? { cx: Math.floor(MAP_WIDTH / 2), cy: Math.floor(MAP_HEIGHT / 2) }
        keyboardEnemyRef.current = null
        hoverRef.current = {
          cx: Math.max(0, Math.min(MAP_WIDTH - 1, cur.cx + dx)),
          cy: Math.max(0, Math.min(MAP_HEIGHT - 1, cur.cy + dy)),
        }
        const aim = cellCenter(hoverRef.current)
        sessionRef.current.dispatch({ type: 'set_collect', at: aim })
        if (beamModeRef.current) sessionRef.current.dispatch({ type: 'set_beam', target: aim })
        return
      }
      const physical = e.key.toLowerCase()
      const key = Object.entries(settings.keyBindings).find(([,binding]) => binding === physical)?.[0] ?? (Object.keys(settings.keyBindings).includes(physical) ? '' : physical)
      const live = sessionRef.current
      if (key === '[' || key === ']') {
        e.preventDefault()
        const targets = live.state.enemies.filter(enemy => enemy.hp > 0 && !enemy.phased)
        const index = targets.findIndex(enemy => enemy.id === keyboardEnemyRef.current)
        const target = targets[index < 0 ? (key === ']' ? 0 : targets.length - 1) : (index + (key === ']' ? 1 : targets.length - 1)) % targets.length]
        if (target) {
          keyboardEnemyRef.current = target.id
          hoverRef.current = { cx: Math.floor(target.pos.x / 1000), cy: Math.floor(target.pos.y / 1000) }
          setSrMessage(`${target.type}, ${target.hp} health`)
        }
        return
      }
      if (key === 'g' && hoverRef.current) { live.dispatch({ type: 'set_collect', at: cellCenter(hoverRef.current) }); return }
      if (key === 'v' && hoverRef.current) {
        const at = cellCenter(hoverRef.current)
        const candidates = live.state.enemies.filter(en => en.hp > 0 && !en.phased && en.hp * 100 <= en.maxHp * EXECUTE_THRESHOLD_PCT).sort((a,b) => (a.pos.x-at.x)**2+(a.pos.y-at.y)**2 - (b.pos.x-at.x)**2-(b.pos.y-at.y)**2)
        const enemy = candidates.find(en => en.id === keyboardEnemyRef.current) ?? candidates[0]
        if (enemy) live.dispatch({ type: 'execute_enemy', id: enemy.id })
        return
      }
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
      if (key === 'o') {
        const id = selectedTowerIdRef.current
        if (id !== null) sessionRef.current.dispatch({ type: 'overcharge_tower', id })
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
      if (key === 's') {
        setShowStats((v) => !v)
        return
      }
      if (key === 'c') {
        setCodexFocus(null)
        setShowCodex((v) => !v)
        return
      }
      if (key === 'm') {
        setMuted(sfx.toggleMute())
        return
      }
      if (key === 'b' && !e.repeat) {
        if (settings.holdBeam) { toggleBeamRef.current(true); return }
        // B toggles the Spire beam; the cursor (or a tap) aims it.
        toggleBeamRef.current(!beamModeRef.current)
        return
      }
      if (e.key === '-' || e.key === '=' || e.key === '+') {
        const idx = Math.max(0, SPEEDS.indexOf(sessionRef.current.speed))
        const next = e.key === '-' ? Math.max(0, idx - 1) : Math.min(SPEEDS.length - 1, idx + 1)
        sessionRef.current.setSpeed(SPEEDS[next]!)
        return
      }
      const towerIdx = ['1', '2', '3', '4', '5', '6', '7', '8'].indexOf(e.key)
      if (towerIdx !== -1) {
        const type = TOWER_KEYS[towerIdx]!
        if (sessionRef.current.state.availableTowers.includes(type)) {
          setShopSelection((cur) => (cur === type ? null : type))
          setAbilitySelection(null)
        }
        return
      }
      const abilityIdx = ['q', 'w', 'e', 'f'].indexOf(e.key.toLowerCase())
      if (abilityIdx !== -1) {
        const ability = ABILITY_KEYS[abilityIdx]!
        const s = sessionRef.current.state
        if (ability in s.abilities && s.abilities[ability] === 0 && s.phase === 'wave') {
          if (ability === 'gold_rush' || ability === 'bulwark')
            sessionRef.current.dispatch({ type: 'cast_ability', ability, cell: { cx: 0, cy: 0 } })
          else {
            setAbilitySelection((cur) => (cur === ability ? null : ability))
            setShopSelection(null)
          }
        }
      }
    }
    const onKeyUp = (e: KeyboardEvent) => { if (settings.holdBeam && e.key.toLowerCase() === (settings.keyBindings.b ?? 'b')) toggleBeamRef.current(false) }
    const onBlur = () => { if (settings.holdBeam) toggleBeamRef.current(false) }
    window.addEventListener('blur', onBlur)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('blur', onBlur) }
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
  // Emberbound Crews raises the mid-wave cap — the button must count the
  // run's REAL budget, not the base constant.
  const repairCap = REPAIR_CASTS_PER_WAVE + state.mods.repairCasts
  const repairsExhausted = state.phase === 'wave' && state.repairsThisWave >= repairCap

  // Scouting report: deterministic preview of what start_wave will field.
  // Blackout trial: the report exists (the engine still computes it — bots
  // and replays are unaffected) but the UI refuses to show it.
  const blackout = state.trials.includes('blackout')
  const preview = state.phase === 'build' && !summary && !blackout ? previewNextWave(state) : null
  const cataclysmIn = summary ? null : wavesUntilCataclysm(state)

  // First-run onboarding: three contextual hints, gone forever once a run
  // ends (or the player dismisses them).
  let hint: string | null = null
  if (!hintsDismissed && meta.runs === 0 && !summary) {
    if (state.wave === 0 && state.towers.length < 2) {
      hint = 'Pick a tower below (or press 1) and click beside the glowing path to build. Two towers is a start.'
    } else if (state.wave === 0 && state.phase === 'build') {
      hint = 'Send the wave when ready (Space). Enemies march the lit path — leaks hit the Spire, and it only has 10 HP.'
    } else if (state.wave === 1 && state.phase === 'build') {
      hint = 'Kills pay gold; every wave is stronger than the last. The scouting report above shows exactly what is coming.'
    } else if (state.wave === 2 && state.phase === 'wave') {
      // Meteor and Frost Nova sit charged from run one — the footer buttons
      // players most often never discover on their own.
      hint = 'Your abilities are charged: Meteor (Q) and Frost Nova (W) are free every wave — aim them into the thick of the horde.'
    }
  }
  const dismissHints = () => {
    setHintsDismissed(true)
    try {
      localStorage.setItem('spirefall-hints-done', '1')
    } catch {
      // fine unsaved
    }
  }

  return (
    <div className="app">
      {watching && (
        <div className="replay-banner" data-testid="replay-banner">
          <span>
            ▶ REPLAY · wave {state.wave}
            {session.terminal ? ` · over — ${state.phase === 'victory' ? 'the Spire stood' : 'the Spire fell'}` : ''} —
            speed controls work; inputs don't.
          </span>
          <label>Replay position <input aria-label="Replay position" type="range" min={session.initial.tick} max={Math.max(session.initial.tick + 1, Number.isFinite(session.replayEndTick) ? session.replayEndTick : state.tick)} value={state.tick} onChange={e => { void session.seek(Number(e.target.value)) }} /></label>
          <span>{session.seeking ? 'Seeking…' : `${Math.floor(state.tick / 30)}s`} {session.initial.tick > 0 && '(checkpoint recording)'}</span>
          <div className="replay-checkpoints">{session.checkpoints.filter(c => c.wave > 0).map(c => <button key={c.tick} className="ghost-btn" onClick={() => { void session.seek(c.tick) }}>Wave {c.wave}</button>)}</div>
          <button className="ghost-btn" data-testid="exit-replay" onClick={exitReplay}>
            Exit replay
          </button>
        </div>
      )}
      <header className="hud">
        <div className="hud-title">
          SPIREFALL
          <span className="hud-wave" data-testid="wave-label">
            {state.victoryClaimed ? `Wave ${state.wave} · ENDLESS` : `Wave ${state.wave}/${VICTORY_WAVE}`}
            {' · '}
            {BIOMES[state.biome].name}
          </span>
        </div>
        {state.phase === 'wave' && state.activeAffix && (
          <span className="affix-badge" data-testid="affix" title={AFFIXES[state.activeAffix].description}>
            {AFFIXES[state.activeAffix].name}
          </span>
        )}
        {cataclysmIn !== null && (
          <span
            className={`cataclysm-countdown${cataclysmIn === 1 ? ' imminent' : ''}`}
            data-testid="cataclysm-countdown"
            title="Every 5th endless wave ends in a Cataclysm: a permanent, stacking modifier for the rest of the run."
          >
            {cataclysmIn === 1 ? '⚠ Cataclysm this wave' : `⚠ Cataclysm in ${cataclysmIn} waves`}
          </span>
        )}
        {state.mapSeed !== '' &&
          state.wavesCleared > 0 &&
          state.wavesCleared > (meta.bestWaveByMap[state.biome] ?? 0) && (
            <span
              className="trial-badge depth-badge"
              data-testid="new-depth"
              title={`Deeper than any prior run in ${BIOMES[state.biome].name} — the record updates when this run ends.`}
            >
              ★ new depth
            </span>
          )}
        {state.crucible > 0 && (
          <span
            className="trial-badge crucible-badge"
            data-testid="crucible"
            title={`The Crucible: ${state.crucible} ${state.crucible === 1 ? 'victory' : 'victories'} this cycle — enemies +${CRUCIBLE_HP_PCT_PER_RANK * state.crucible}% HP, Sparks +${CRUCIBLE_SPARK_PCT_PER_RANK * state.crucible}%${crucibleTiersAt(state.crucible)
              .map((t) => `; ${t.name}: ${t.description}`)
              .join('')}. Ascend to reset.`}
          >
            🔥 Crucible {'I'.repeat(Math.min(state.crucible, 3))}{state.crucible > 3 ? `×${state.crucible}` : ''}
            {crucibleTiersAt(state.crucible).length > 0 &&
              ` · ${crucibleTiersAt(state.crucible)[crucibleTiersAt(state.crucible).length - 1]!.name}`}
          </span>
        )}
        {state.trials.length > 0 && (
          <span className="cataclysm-badges" data-testid="trials">
            {state.trials.map((t) => (
              <span key={t} className="trial-badge" title={`${TRIALS[t].description} +${TRIALS[t].sparkBonusPct}% sparks.`}>
                ⚔ {TRIALS[t].name}
              </span>
            ))}
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
          <div
            className="hp-bar"
            role="progressbar"
            aria-label="Spire health"
            aria-valuenow={state.spireHp}
            aria-valuemin={0}
            aria-valuemax={state.spireMaxHp}
          >
            <div className="hp-fill" style={{ width: `${hpPct}%` }} />
          </div>
          <span data-testid="spire-hp">
            {state.spireHp}/{state.spireMaxHp}
          </span>
          {/* Always mounted: an appearing/vanishing button re-wraps the
              header and shoves the playfield (visible on tablet portrait). */}
          <button
            className="ghost-btn btn-repair"
            data-testid="repair-spire"
            disabled={repairHp <= 0 || repairsExhausted}
            title={
              state.spireHp >= state.spireMaxHp
                ? 'The Spire is at full health'
                : repairsExhausted
                  ? `Repair crews are spent — ${repairCap} cast${repairCap > 1 ? 's' : ''} per wave under fire. They recover when the wave clears.`
                  : `Mends up to ${REPAIR_MAX_PER_CAST} HP per cast at ⛀${repairPerHp} per HP — the price climbs each wave; max ${repairCap} cast${repairCap > 1 ? 's' : ''} while a wave is live${state.phase === 'wave' ? ` (${repairCap - state.repairsThisWave} left)` : ''} (R)`
            }
            onClick={() => session.dispatch({ type: 'repair_spire' })}
          >
            {state.spireHp >= state.spireMaxHp
              ? 'Repair'
              : repairsExhausted
                ? 'Repair crews spent'
                : repairHp > 0
                  ? `Repair +${repairHp} (⛀ ${repairHp * repairPerHp})`
                  : `Repair (⛀ ${repairPerHp}/HP)`}
          </button>
        </div>
        <div className="hud-right">
          {state.combo >= 5 && (
            <span
              className={`hud-combo${state.combo >= COMBO_HASTE_THRESHOLD ? ' hasted' : ''}`}
              data-testid="combo"
              title={`Unbroken kill streak — hold ${COMBO_HASTE_THRESHOLD}+ and ability cooldowns recover at double speed. A leak, or ${COMBO_WINDOW_TICKS / 30}s of silence mid-wave, breaks it.`}
            >
              ⚡{state.combo}
              {state.combo >= COMBO_HASTE_THRESHOLD && ' 2×'}
              <span
                className="combo-drain"
                style={{ width: `${Math.round((state.comboTicks / COMBO_WINDOW_TICKS) * 100)}%` }}
              />
            </span>
          )}
          {(state.beamHeat > 0 || state.beamTarget !== null) && (
            <span
              className={`hud-beam${state.beamOverheated ? ' overheated' : ''}`}
              data-testid="beam-heat"
              title={
                state.beamOverheated
                  ? 'Beam OVERHEATED — venting; it unlocks when fully cool'
                  : 'Spire beam heat — use the Beam control to fire at the cursor; overheat locks it until vented'
              }
            >
              <Icon name="beam" />
              <span
                className="beam-heat-bar"
                style={{ width: `${Math.round((state.beamHeat / BEAM_HEAT_MAX) * 100)}%` }}
              />
            </span>
          )}
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
            className={`ghost-btn${!muted && !audioLive ? ' sound-pending' : ''}`}
            data-testid="mute"
            aria-label={muted ? 'Unmute sound' : audioLive ? 'Mute sound' : 'Enable sound'}
            aria-pressed={muted}
            title={
              muted
                ? 'Unmute sound (M)'
                : audioLive
                  ? 'Mute sound (M)'
                  : 'Sound starts with your first tap or key press'
            }
            onClick={() => {
              // Pending + click = "I want sound": the click itself unlocks
              // the context (the probe flips the icon) — don't mute instead.
              if (!muted && !audioLive) return
              setMuted(sfx.toggleMute())
            }}
          >
            <Icon name={muted ? "muted" : "sound"} />
          </button>
          <div className="speed-controls" role="group" aria-label="Game speed" title="Keys − and = step speed down/up">
            {SPEEDS.map((n) => (
              <button
                key={n}
                className={session.speed === n ? 'active' : ''}
                aria-label={n === 0 ? 'Pause' : `Speed ${n}×`}
                aria-pressed={session.speed === n}
                onClick={() => {
                  session.setSpeed(n)
                }}
              >
                {n === 0 ? <Icon name="pause" /> : `${n}×`}
              </button>
            ))}
          </div>
          <button
            className="ghost-btn"
            data-testid="daily-run"
            aria-label="Play today's daily run"
            title={
              dailyBest
                ? `Today's shared seed — your best: wave ${dailyBest.waves}${(dailyBest.streak ?? 1) > 1 ? ` · ${dailyBest.streak}-day streak` : ''}`
                : "Play today's shared seed — same map and waves for everyone"
            }
            onClick={() =>
              askConfirm('Start the Daily run? Your current run will be abandoned (progress-only sparks apply).', () =>
                beginNextRun(dailySeed()),
              )
            }
          >
            <Icon name="calendar" />{dailyBest ? ` ${dailyBest.waves}` : ''}
            {(dailyBest?.streak ?? 1) > 1 && <span className="streak-mark">🔥{dailyBest!.streak}</span>}
          </button>
          <button
            className="ghost-btn"
            onClick={() => setShowStats(true)}
            data-testid="open-stats"
            aria-label="Run stats"
            title="This run's stats so far (S)"
          >
            <Icon name="stats" />
          </button>
          <button
            className="ghost-btn"
            onClick={() => {
              setCodexFocus(null)
              setShowCodex(true)
            }}
            data-testid="open-codex"
            aria-label="Codex — enemies, towers, and mechanics"
            title="Codex — enemies, towers & mechanics (C)"
          >
            <Icon name="book" />
          </button>
          <button
            className="ghost-btn"
            onClick={() => setShowTree(true)}
            data-testid="open-tree"
            title={canAscend(meta) ? 'Spire Tree (T) — Ascension is ready 🔥' : 'Spire Tree (T)'}
          >
            Spire Tree{canAscend(meta) ? ' 🔥' : ''}
          </button>
          <button
            className="ghost-btn"
            onClick={() => setShowSettings(true)}
            data-testid="open-settings"
            aria-label="Settings and shortcuts"
            title="Settings & shortcuts (?)"
          >
            <Icon name="settings" />
          </button>
          {!summary && (
            <button
              className="ghost-btn danger btn-abandon"
              data-testid="abandon-run"
              title="End this run now — you keep the Sparks earned so far"
              onClick={() =>
                askConfirm(
                  state.victoryClaimed ? 'End the run and bank your victory?' : 'Abandon this run? You keep the Sparks earned so far.',
                  () => session.dispatch({ type: 'abandon_run' }),
                )
              }
            >
              {state.victoryClaimed ? 'End run' : 'Give up'}
            </button>
          )}
          {/* Always mounted, disabled mid-wave: unmounting re-wraps the
              header row and the playfield jumps every single wave. */}
          <button
            className="primary-btn btn-wave"
            onClick={() => session.dispatch({ type: 'start_wave' })}
            data-testid="start-wave"
            disabled={state.phase !== 'build'}
            title={
              state.phase === 'build'
                ? 'Start the next wave (Space)'
                : 'The wave is live — the next one starts once it clears'
            }
          >
            Start wave {state.wave + 1}
          </button>
          <button
            className={`ghost-btn${autoStart ? ' auto-on' : ''}`}
            data-testid="auto-start"
            aria-label="Auto-advance waves"
            aria-pressed={autoStart}
            title={autoStart ? 'Auto-advance is ON — waves send themselves' : 'Auto-advance waves'}
            onClick={() => setUiSettings({ ...updateSettings({ autoStart: !autoStart }) })}
          >
            <Icon name="advance" />
          </button>
        </div>
      </header>

      {/* Invisible narrator: screen readers hear the run's major beats. */}
      <div className="sr-only" role="status" aria-live="polite" data-testid="sr-status">
        {srMessage}
      </div>
      {saveStatus && <p role="status" className="save-warning">{saveStatus}</p>}
      {!hintsDismissed && meta.runs === 0 && (
        <div className="hint-banner" data-testid="hint">
          <span>{hint ?? 'Sweep gold with your pointer. B toggles the beam; select a tower and press O to spend a command charge.'}</span>
          <button className="panel-close hint-close" aria-label="Dismiss hints" onClick={dismissHints}>
            ✕
          </button>
        </div>
      )}
      {/* The strip stays mounted through the wave (as a live status line) —
          unmounting it moves the playfield up and back every single wave. */}
      {!summary && (state.phase === 'build' || state.phase === 'wave') && (
        <WavePreview
          state={state}
          preview={preview}
          blackout={blackout}
          onFocusEnemy={(type) => {
            setCodexFocus(type)
            setShowCodex(true)
          }}
        />
      )}

      {/* Wave boons: a decision every thirty seconds, never a gate — and
          like the scouting strip above, this one STAYS MOUNTED through
          build and wave at a fixed height, because appearing/vanishing
          per phase would shift the playfield every single wave. */}
      {!summary && (state.phase === 'build' || state.phase === 'wave') && (
        <div className={`boon-strip${state.activeBoon !== null ? ' active' : ''}`}>
          {state.phase === 'build' && state.boonOffer !== null ? (
            <span className="boon-row" data-testid="boon-offer">
              <span className="boon-label">Next wave boon —</span>
              {state.boonOffer.map((b) => (
                <button
                  key={b}
                  className="ghost-btn boon-btn"
                  data-testid={`boon-${b}`}
                  title={BOONS[b].description}
                  onClick={() => session.dispatch({ type: 'choose_boon', boon: b })}
                >
                  {BOONS[b].name} <span className="boon-effect">{BOONS[b].effect}</span>
                </button>
              ))}
              <span className="boon-skip">or start the wave without one</span>
            </span>
          ) : state.activeBoon !== null ? (
            <span data-testid="boon-active" title={BOONS[state.activeBoon].description}>
              ✦ {BOONS[state.activeBoon].name} — {BOONS[state.activeBoon].description}
            </span>
          ) : (
            <span className="boon-skip">{state.phase === 'wave' ? 'no blessing this wave' : ' '}</span>
          )}
        </div>
      )}

      <main className="board">
        <GameCanvas
          session={session}
          ui={renderUi}
          armed={shopSelection !== null || abilitySelection !== null}
          beamAim={beamMode}
          dragCollect={state.phase === 'wave' || state.coins.length > 0}
          onCellClick={handleCellClick}
          onHover={(c) => {
            const prev = hoverRef.current
            keyboardEnemyRef.current = null
            hoverRef.current = c
            // In beam mode the ray follows the cursor (or a touch drag).
            if (beamModeRef.current && c) sessionRef.current.dispatch({ type: 'set_beam', target: cellCenter(c) })
            // The pointer IS the coin collector: entering a new cell moves
            // it, leaving the board parks it away (coins wait, then expire).
            if ((c === null) !== (prev === null) || (c && prev && !sameCell(c, prev))) {
              sessionRef.current.dispatch({ type: 'set_collect', at: c ? cellCenter(c) : null })
            }
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
            {TOWERS[hoveredTower.type].support ? (
              <span>
                {hoveredTower.type === 'beacon'
                  ? `+${towerTier('beacon', hoveredTower.tier).auraPct}% damage to towers in range`
                  : `${towerTier('mint', hoveredTower.tier).mintYield} gold / cleared wave · ⛀ ${hoveredTower.earned ?? 0} earned`}
              </span>
            ) : (
              (() => {
                const b = damageBreakdown(state, hoveredTower)
                // Spec rides along and range is the board's own radius
                // (Longsight, Longbow, mesa) — the tooltip must quote the
                // numbers the engine rolls, same contract as the panel.
                const rate = 30 / effectiveTowerCooldown(state, hoveredTower.type, hoveredTower.tier, hoveredTower.spec)
                const range = towerRangeOnBoard(state, getRunMap(state), hoveredTower)
                return (
                  <span>
                    {b.effective} dmg{b.parts.length > 0 && ` (${b.base} base +${b.totalPct - 100}%)`} ·{' '}
                    {rate.toFixed(1)}/s · ≈{Math.round(b.effective * rate)} DPS ·{' '}
                    {(range / 1000).toFixed(1)} range
                  </span>
                )
              })()
            )}
            {!TOWERS[hoveredTower.type].support && (
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
              {selectedTower.spec !== null && ` · ${specForTower(selectedTower.type, selectedTower.spec)?.name ?? ''}`}
              {selectedTower.enhance > 0 && ` +${selectedTower.enhance}`}
            </h3>
            {TOWERS[selectedTower.type].support ? (
              <p>
                {selectedTower.type === 'beacon'
                  ? `+${towerTier('beacon', selectedTower.tier).auraPct}% damage to towers in range`
                  : `${towerTier('mint', selectedTower.tier).mintYield} gold per cleared wave — ⛀ ${selectedTower.earned ?? 0} earned of ⛀ ${towerInvested('mint', selectedTower.tier)} invested${(selectedTower.earned ?? 0) >= towerInvested('mint', selectedTower.tier) ? ' ✓ paid off' : ''}`}
              </p>
            ) : (
              (() => {
                const b = damageBreakdown(state, selectedTower)
                const baseCd = towerTier(selectedTower.type, selectedTower.tier).cooldown
                const cd = effectiveTowerCooldown(state, selectedTower.type, selectedTower.tier, selectedTower.spec)
                const rate = 30 / cd
                const ratePct = cd < baseCd ? Math.round((baseCd / cd - 1) * 100) : 0
                // Capacitor: 3 normal + 1 triple per cycle = ×1.5 sustained.
                const dpsAvg = selectedTower.spec === 'capacitor' ? 1.5 : 1
                const specDef = selectedTower.spec !== null ? specForTower(selectedTower.type, selectedTower.spec) : null
                return (
                  <>
                    <p>
                      DMG {b.effective}
                      {(b.parts.length > 0 || b.specPct !== 100) && ` (base ${b.base})`} · {rate.toFixed(1)} shots/s · ≈
                      {Math.round(b.effective * rate * dpsAvg)} DPS
                    </p>
                    {(b.parts.length > 0 || ratePct > 0 || specDef !== null || selectedTower.overcharged) && (
                      <ul className="dmg-breakdown" data-testid="dmg-breakdown">
                        {b.parts.map((p) => (
                          <li key={p.source}>
                            +{p.pct}% {p.source}
                          </li>
                        ))}
                        {b.specPct !== 100 && <li>×{(b.specPct / 100).toFixed(2)} {specDef?.name} (T3 path)</li>}
                        {selectedTower.spec === 'capacitor' && <li>every 4th shot ×3 — Capacitor (T3 path)</li>}
                        {selectedTower.overcharged && <li>next shot ×{OVERCHARGE_DAMAGE_PCT / 100} — Overcharged</li>}
                        {ratePct > 0 && <li>+{ratePct}% fire rate Quickdraw (relic)</li>}
                      </ul>
                    )}
                  </>
                )
              })()
            )}
            <p data-testid="tower-stats">
              {veterancyStars(selectedTower.kills) > 0 && (
                <span className="vet-stars" title={`Veterancy — stars at ${VETERANCY_TIERS.join('/')} kills`}>
                  {'★'.repeat(veterancyStars(selectedTower.kills))}{' '}
                </span>
              )}
              {selectedTower.kills} kills · {selectedTower.damageDealt} dmg dealt
            </p>
            {!TOWERS[selectedTower.type].support && (
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
              <>
              <p className="upgrade-preview" data-testid="upgrade-preview">
                Next: {upgradeDelta(selectedTower.type, selectedTower.tier as 1 | 2)}
              </p>
              <button
                className="primary-btn"
                data-testid="upgrade-tower"
                disabled={state.gold < towerTier(selectedTower.type, (selectedTower.tier + 1) as 2 | 3).cost}
                onClick={() => session.dispatch({ type: 'upgrade_tower', id: selectedTower.id })}
              >
                Upgrade (⛀ {towerTier(selectedTower.type, (selectedTower.tier + 1) as 2 | 3).cost}){' '}
                <kbd className="key-hint">{(settings.keyBindings.u ?? 'u').toUpperCase()}</kbd>
              </button>
              </>
            ) : (
              <>
                {selectedTower.spec === null &&
                  (TOWER_SPECS[selectedTower.type] ?? []).map((sp) => (
                    <button
                      key={sp.id}
                      className="ghost-btn spec-btn"
                      data-testid={`spec-${sp.id}`}
                      title={sp.description}
                      disabled={state.gold < sp.cost}
                      onClick={() => session.dispatch({ type: 'specialize_tower', id: selectedTower.id, spec: sp.id })}
                    >
                      ★ {sp.name} (⛀ {sp.cost})
                    </button>
                  ))}
              <button
                className="primary-btn"
                data-testid="upgrade-tower"
                title={`+${ENHANCE_DAMAGE_PCT}% damage, repeatable`}
                disabled={state.gold < enhanceCost(selectedTower.type, selectedTower.enhance)}
                onClick={() => session.dispatch({ type: 'upgrade_tower', id: selectedTower.id })}
              >
                Enhance (⛀ {enhanceCost(selectedTower.type, selectedTower.enhance)}) <kbd className="key-hint">{(settings.keyBindings.u ?? 'u').toUpperCase()}</kbd>
              </button>
              </>
            )}
            {!TOWERS[selectedTower.type].support && (
              <button
                className={`ghost-btn overcharge-btn${selectedTower.overcharged ? ' armed' : ''}`}
                data-testid="overcharge-tower"
                title={`Spend one shared command charge for a ×${OVERCHARGE_DAMAGE_PCT / 100} shot. Save charges for priority targets.`}
                disabled={selectedTower.overcharged === true || (selectedTower.overchargeCd ?? 0) > 0 || (state.commandCharges ?? 3) === 0}
                onClick={() => session.dispatch({ type: 'overcharge_tower', id: selectedTower.id })}
              >
                ⚡{' '}
                {selectedTower.overcharged
                  ? `Overcharged — next shot ×${OVERCHARGE_DAMAGE_PCT / 100}`
                  : (selectedTower.overchargeCd ?? 0) > 0
                    ? `Recharging ${Math.ceil((selectedTower.overchargeCd ?? 0) / 30)}s`
                    : 'Overcharge'}{' '}
                <kbd className="key-hint">{(settings.keyBindings.o ?? 'o').toUpperCase()}</kbd>
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
              {selectedTower.shots === 0 && ' · full refund'}) <kbd className="key-hint">{(settings.keyBindings.x ?? 'x').toUpperCase()}</kbd>
            </button>
          </aside>
        )}
      </main>

      {!watching && <BuildDoctrine state={state} choose={doctrine => session.dispatch({ type: 'choose_doctrine', doctrine })} />}
      {state.seed.startsWith('daily-') && <p className="doctrine-summary">Daily challenge · fixed arsenal and progression · Crucible 0 · rules {RULES_VERSION}</p>}
      {state.shrine && <section className="doctrine-panel" aria-label="Relic shrine">
        <strong>Shrine at column {state.shrine.cell.cx + 1}, row {state.shrine.cell.cy + 1}</strong>
        <p>Station two combat towers within three cells for at least three seconds, and keep enemies outside its ring for one wave to earn {100 + state.shrine.wave * 12} gold. Failure costs no Spire health.</p>
        {state.shrine.status === 'offered' ? <button className="ghost-btn" onClick={() => session.dispatch({ type: 'defend_shrine' })}>Accept shrine defense</button> : <b>{state.shrine.status === 'active' ? 'Defending this wave' : state.shrine.status === 'won' ? 'Shrine secured' : 'Shrine lost'}</b>}
      </section>}
      <p className="command-pool" role="status">Command charges: <strong>{state.commandCharges ?? 3}/3</strong> · select a tower, then {(settings.keyBindings.o ?? 'o').toUpperCase()} · one charge recovers every {Math.max(1, 6 * (100 - state.mods.overchargeCdPct) / 100)}s of combat</p>
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
                data-tower={type}
                disabled={!unlocked}
                title={unlocked ? `Hotkey ${i + 1}` : 'Unlock in the Spire Tree'}
                onClick={() => {
                  setShopSelection((cur) => (cur === type ? null : type))
                  setAbilitySelection(null)
                }}
              >
                <span className="shop-card-top">
                  <span className={`tower-dot tower-${type}`} />
                  <TowerPortrait type={type} /><span className="shop-card-name">{TOWERS[type].name}</span>
                  {TOWERS[type].hitsAir && (
                    <span className="air-mark" title="Can hit fliers">
                      ✈
                    </span>
                  )}
                </span>
                <span className="shop-card-bottom">
                  {unlocked && <kbd className="key-hint">{i + 1}</kbd>}
                  <span className="cost">{unlocked ? `⛀ ${cost}` : '🔒'}</span>
                </span>
              </button>
            )
          })}
        </div>
        <div className="shop-abilities">
          {ABILITY_KEYS.filter((a) => a in state.abilities).map((ability, i) => {
            const cd = state.abilities[ability] ?? 0
            const ready = cd === 0 && state.phase === 'wave'
            const maxCd = effectiveAbilityCooldown(state, ability)
            const baseCd = ABILITIES[ability].cooldown
            const cdNote =
              (maxCd < baseCd
                ? `${Math.round(maxCd / 30)}s cooldown (base ${Math.round(baseCd / 30)}s — reduced by ${state.relics.includes('overclock') ? 'Overclock' : ''}${state.relics.includes('overclock') && state.mods.abilityCdPct > 0 ? ' + ' : ''}${state.mods.abilityCdPct > 0 ? 'Swift Sigils' : ''})`
                : `${Math.round(baseCd / 30)}s cooldown`) + ' · recovers during waves'
            return (
              <button
                key={ability}
                className={`ability-btn${abilitySelection === ability ? ' selected' : ''}`}
                data-testid={`ability-${ability}`}
                disabled={!ready}
                title={`${cdNote} · Hotkey ${['Q', 'W', 'E', 'F'][i]}`}
                onClick={() => {
                  if (ability === 'gold_rush' || ability === 'bulwark')
                    session.dispatch({ type: 'cast_ability', ability, cell: { cx: 0, cy: 0 } })
                  else {
                    setAbilitySelection((cur) => (cur === ability ? null : ability))
                    setShopSelection(null)
                  }
                }}
              >
                {ABILITIES[ability].name}
                <kbd className="key-hint">{['Q', 'W', 'E', 'F'][i]}</kbd>
                <span className="cooldown">
                  {cd > 0
                    ? `${Math.ceil(cd / 30)}/${Math.round(maxCd / 30)}s${state.phase !== 'wave' ? ' ⏸' : ''}`
                    : `${Math.round(maxCd / 30)}s`}
                </span>
              </button>
            )
          })}
          {(() => {
            const fireLeft = Math.ceil((BEAM_HEAT_MAX - state.beamHeat) / 30)
            const ventLeft = Math.ceil(state.beamHeat / BEAM_COOL_PER_TICK / 30)
            const label = state.beamOverheated
              ? `venting ${ventLeft}s`
              : state.beamTarget !== null && state.phase === 'wave'
                ? `${fireLeft}s left`
                : state.beamHeat > 0
                  ? `cooling ${ventLeft}s`
                  : 'ready'
            return (
              <button
                className={`ability-btn beam-btn${beamMode ? ' selected' : ''}${state.beamOverheated ? ' overheated' : ''}`}
                data-testid="beam-toggle"
                title={`The Spire beam — press B or this button to toggle it, then tap (or hover) the battlefield to aim. Burns EVERYTHING on the line for ${BEAM_DAMAGE_PER_TICK}/tick, wounding down to 1 HP — it never lands the killing blow, so let a tower or an execute finish what it softened. ${BEAM_HEAT_MAX / 30}s of fire overheats it and it stays locked until fully vented. It cools between waves too.`}
                onClick={() => toggleBeam(!beamModeRef.current)}
              >
                <Icon name="beam" /> Beam
                <kbd className="key-hint">{(settings.keyBindings.b ?? 'b').toUpperCase()}</kbd>
                <span className="cooldown" data-testid="beam-state">
                  {label}
                </span>
              </button>
            )
          })()}
        </div>
      </footer>

      {victoryPrompt && !summary && (
        <div className="modal-backdrop" data-testid="victory-prompt">
          <div className="modal" role="dialog" aria-modal="true" aria-label="Victory">
            <h2>THE CYCLE BREAKS</h2>
            <p className="run-summary">Wave {VICTORY_WAVE} cleared — the Spire stands where every cycle before it fell.</p>
            <p className="run-flavor">
              End the run now and bank the victory, or push into the endless dark. Sparks keep accruing either way;
              the victory bonus is yours whenever this run ends.
            </p>
            <div className="ascend-callout" data-testid="victory-ascend-callout">
              <p>
                🔥 <strong>Ascension will be ready</strong> — once this run ends you can burn the Spire Tree for{' '}
                <strong>{emberGainOnAscend(meta) + 1} Embers</strong> (permanent Ember Tree power).
              </p>
              <p>
                Or win again first: every victory this cycle pays <strong>+1 Ember</strong> — and the horde returns{' '}
                <strong>+{CRUCIBLE_HP_PCT_PER_RANK}% harder</strong>, worth{' '}
                <strong>+{CRUCIBLE_SPARK_PCT_PER_RANK}% Sparks</strong>. The Crucible deepens with each win.
              </p>
            </div>
            <button className="primary-btn" data-testid="claim-victory" onClick={() => { setVictoryPrompt(false); session.dispatch({ type: 'abandon_run' }) }}>
              Claim victory & end run
            </button>
            <button className="ghost-btn" data-testid="continue-endless" onClick={() => setVictoryPrompt(false)}>
              Continue — endless
            </button>
          </div>
        </div>
      )}
      {state.relicOffer && !watching && !summary && !victoryPrompt && (
        <RelicModal
          state={state}
          options={state.relicOffer}
          skipGold={relicSkipGold(state.wave)}
          canReroll={!state.relicRerolled && state.gold >= relicSkipGold(state.wave)}
          onChoose={(relic) => session.dispatch({ type: 'choose_relic', relic })}
          onReroll={focus => session.dispatch(focus ? {type:'reroll_relic',focus} : {type:'reroll_relic'})}
        />
      )}
      {state.cataclysmOffer && !watching && !summary && (
        <CataclysmModal
          options={state.cataclysmOffer}
          onChoose={(cataclysm) => session.dispatch({ type: 'choose_cataclysm', cataclysm })}
        />
      )}
      {summary && !watching && (
        <RunOverOverlay
          towers={state.towers}
          summary={summary}
          meta={meta}
          onWatchReplay={watchReplay}
          replay={() => JSON.stringify(session.recording())}
          replayLink={async () => {
            const blob = await gzipBase64Url(JSON.stringify(session.recording()))
            return blob ? `${window.location.origin}${window.location.pathname}?replay=${blob}` : null
          }}
          onBuy={buyMeta}
          onRespec={session.terminal || (state.wave === 0 && state.towers.length === 0) ? respec : undefined}
          onBuyEmber={buyEmber}
          onAscend={doAscend}
          onNextRun={() => beginNextRun()}
          onRematch={() => beginRematch(summary)}
          reducedMotion={uiSettings.reducedMotion}
          mapPref={mapPref}
          onMapPref={(v) => {
            setMapPref(v)
            mapPrefRef.current = v
            try {
              localStorage.setItem(MAP_PREF_KEY, v)
            } catch {
              // unsaved preference is fine
            }
          }}
          trialPref={trialPref}
          onTrialPref={(v) => {
            setTrialPref(v)
            trialPrefRef.current = v
            try {
              localStorage.setItem(TRIAL_PREF_KEY, v)
            } catch {
              // unsaved preference is fine
            }
          }}
        />
      )}
      {showSettings && (
        <SettingsModal
          quietEffects={uiSettings.quietEffects}
          quietAudio={uiSettings.quietAudio}
          onQuietEffects={value => setUiSettings({ ...updateSettings({ quietEffects: value }) })}
          onQuietAudio={value => setUiSettings({ ...updateSettings({ quietAudio: value }) })}
          onHardReset={() => { clearSave(); window.location.reload() }}
          meta={meta}
          volume={uiSettings.volume}
          musicVolume={uiSettings.musicVolume}
          reducedMotion={uiSettings.reducedMotion}
          haptics={uiSettings.haptics}
          colorAssist={uiSettings.colorAssist}
          onVolume={(v) => setUiSettings({ ...updateSettings({ volume: v }) })}
          onMusicVolume={(v) => setUiSettings({ ...updateSettings({ musicVolume: v }) })}
          onReducedMotion={(v) => setUiSettings({ ...updateSettings({ reducedMotion: v }) })}
          onHaptics={(v) => setUiSettings({ ...updateSettings({ haptics: v }) })}
          onColorAssist={(v) => setUiSettings({ ...updateSettings({ colorAssist: v }) })}
          onWatchReplay={watchImported}
          askConfirm={askConfirm}
          onClose={() => setShowSettings(false)}
        />
      )}
      {showStats && !summary && <RunStatsModal state={state} onClose={() => setShowStats(false)} />}
      {showCodex && !summary && (
        <CodexModal
          state={state}
          focusEnemy={codexFocus}
          onClose={() => {
            setShowCodex(false)
            setCodexFocus(null)
          }}
        />
      )}
      {showTree && !summary && (
        <SpireTreeModal
          meta={meta}
          onBuy={buyMeta}
          onRespec={session.terminal || (state.wave === 0 && state.towers.length === 0) ? respec : undefined}
          onBuyEmber={buyEmber}
          onAscend={doAscend}
          onClose={() => setShowTree(false)}
        />
      )}
      {/* Rendered last: the confirm dialog must stack over every other modal. */}
      {confirm && (
        <ConfirmModal
          message={confirm.message}
          onConfirm={() => {
            const act = confirm.action
            setConfirm(null)
            act()
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
