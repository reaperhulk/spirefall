import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { MAP_HEIGHT, MAP_WIDTH } from '../data/maps'
import { EXECUTE_THRESHOLD_PCT } from '../data/content'
import { cellCenter } from '../engine/grid'
import type { AbilityId, CellPos, EnemyType, RunSummary, TowerType } from '../engine/types'
import type { Sfx } from './audio'
import type { GameSession } from './session'
import { settings } from './settings'
import { ABILITY_KEYS, SPEEDS, TOWER_KEYS } from './towerCopy'

type Setter<T> = Dispatch<SetStateAction<T>>
interface KeyboardOptions {
  summary: RunSummary | null
  sfx: Sfx
  sessionRef: RefObject<GameSession>
  beginNextRunRef: RefObject<(seed?: string) => void>
  handleCellClickRef: RefObject<(cell: CellPos) => void>
  hoverRef: RefObject<CellPos | null>
  keyboardEnemyRef: RefObject<number | null>
  beamModeRef: RefObject<boolean>
  toggleBeamRef: RefObject<(on: boolean) => void>
  selectedTowerIdRef: RefObject<number | null>
  setShopSelection: Setter<TowerType | null>
  setAbilitySelection: Setter<AbilityId | null>
  setSelectedTowerId: Setter<number | null>
  setShowTree: Setter<boolean>
  setShowSettings: Setter<boolean>
  setShowStats: Setter<boolean>
  setShowCodex: Setter<boolean>
  setShowPlan: Setter<boolean>
  setShowMenu: Setter<boolean>
  setShowReview: Setter<boolean>
  setCodexFocus: Setter<EnemyType | null>
  setConfirm: Setter<{message:string;action:()=>void} | null>
  setSrMessage: Setter<string>
  setMuted: Setter<boolean>
}

export function useGameKeyboard(options: KeyboardOptions): void {
  const latest = useRef(options)
  useEffect(() => { latest.current = options })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const {summary, sfx, sessionRef, beginNextRunRef, handleCellClickRef, hoverRef, keyboardEnemyRef, beamModeRef, toggleBeamRef, selectedTowerIdRef, setShopSelection, setAbilitySelection, setSelectedTowerId, setShowTree, setShowSettings, setShowStats, setShowCodex, setShowPlan, setShowMenu, setShowReview, setCodexFocus, setConfirm, setSrMessage, setMuted} = latest.current
      // Escape always works, even from inside a form control.
      if (e.key === 'Escape') {
        setShopSelection(null)
        setAbilitySelection(null)
        setSelectedTowerId(null)
        setShowTree(false)
        setShowSettings(false)
        setShowStats(false)
        setShowCodex(false)
        setShowPlan(false)
        setShowMenu(false)
        setShowReview(false)
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
        if (t instanceof HTMLButtonElement) return
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
    const onKeyUp = (e:KeyboardEvent) => { if (settings.holdBeam && e.key.toLowerCase() === (settings.keyBindings.b ?? 'b')) latest.current.toggleBeamRef.current(false) }
    const onBlur = () => { if (settings.holdBeam) latest.current.toggleBeamRef.current(false) }
    window.addEventListener('blur',onBlur)
    window.addEventListener('keyup',onKeyUp)
    window.addEventListener('keydown',onKey)
    return () => { window.removeEventListener('blur',onBlur); window.removeEventListener('keyup',onKeyUp); window.removeEventListener('keydown',onKey) }
  }, [])
}
