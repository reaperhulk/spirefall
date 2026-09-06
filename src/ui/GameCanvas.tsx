import { AdaptiveResolution, backingScale, graphicsState } from './graphics'
import { placementPreview, placementSummary } from './placementPreview'
import { measure } from './performance'
import { useEffect, useRef } from 'react'
import { MAP_HEIGHT, MAP_WIDTH } from '../data/maps'
import { sameCell } from '../engine/grid'
import type { CellPos, RunState } from '../engine/types'
import { CELL_PX, draw, LOUPE_D, LOUPE_GAP, renderLoupe, type RenderUiState, type TouchAim } from './render'
import { settings } from './settings'
import type { GameSession } from './session'

interface Props {
  onObserve?: (state:RunState, identity:number) => void
  session: GameSession
  ui: RenderUiState
  // Something is armed for placement/casting: touch input switches to
  // hold-to-aim (drag with a magnifier loupe, place on release).
  armed: boolean
  beamAim?: boolean // beam mode: touch drags steer the ray (no loupe)
  dragCollect?: boolean // live coins/wave: touch drags sweep the collector
  onCellClick: (cell: CellPos) => void
  onHover: (cell: CellPos | null) => void
}

// The playfield. One rAF loop drives both the simulation clock and the
// renderer; React never re-renders this component per frame.
export function GameCanvas({ session, ui, armed, beamAim, dragCollect, onCellClick, onHover, onObserve }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previewRef = useRef<HTMLParagraphElement>(null)
  const loupeRef = useRef<HTMLCanvasElement>(null)
  const uiRef = useRef(ui)
  const observeRef = useRef(onObserve)
  // Live touch aim (finger down with a tower/ability armed). A ref, not
  // state: it changes every pointermove and only the canvas cares.
  const aimRef = useRef<TouchAim | null>(null)
  const downCellRef = useRef<CellPos | null>(null)
  // A touch release places the tower — the click event the browser fires
  // right after must not place a second one (or disarm via tower-inspect).
  // Consume-one-within-deadline: the flag eats exactly the paired click, and
  // the deadline expires it after a long drag, where the browser fires no
  // click at all and a bare flag would swallow the NEXT genuine tap.
  const suppressClickRef = useRef({ armed: false, until: 0 })

  useEffect(() => {
    uiRef.current = ui
    observeRef.current = onObserve
  })

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const adaptive = new AdaptiveResolution()
    let dpr = 1, displayWidth = canvas.getBoundingClientRect().width
    let dirty = true, lastSignature = '', lastState = session.state
    let observedState: RunState | null = null
    const resized = new ResizeObserver(entries => {
      displayWidth = entries[0]?.contentRect.width ?? displayWidth
      dirty = true
    })
    resized.observe(canvas)

    let raf = 0
    let last = performance.now()
    const visibility = () => { last = performance.now() }
    document.addEventListener('visibilitychange', visibility)
    const frame = (now: number) => {
      if (document.hidden) { last = now; raf = requestAnimationFrame(frame); return }
      measure('frame', now - last)
      const simStart = performance.now()
      session.advance(now - last)
      measure('simulation', performance.now() - simStart)
      if (!session.suspended && session.speed > 0 && observedState !== session.state) {
        observeRef.current?.(session.state, session.renderId)
        observedState = session.state
      }
      const wantedScale = backingScale(displayWidth, MAP_WIDTH * CELL_PX, window.devicePixelRatio, settings.graphicsQuality, adaptive.scale)
      const width = Math.round(MAP_WIDTH * CELL_PX * wantedScale)
      if (width !== canvas.width) {
        canvas.width = width
        canvas.height = Math.round(MAP_HEIGHT * CELL_PX * wantedScale)
        dirty = true
      }
      dpr = canvas.width / (MAP_WIDTH * CELL_PX)
      graphicsState.reduced = settings.graphicsQuality === 'low' || (settings.graphicsQuality === 'auto' && adaptive.scale < 1)
      const liveUi = uiRef.current
      const signature = [liveUi.shopSelection,liveUi.abilitySelection,liveUi.selectedTowerId,liveUi.hoverCell?.cx,liveUi.hoverCell?.cy,liveUi.reviewCell?.cx,liveUi.reviewCell?.cy,settings.colorAssist,settings.reducedMotion,settings.quietEffects,settings.graphicsQuality].join(':')
      const frozen = session.suspended || session.speed <= 0 || session.terminal || session.seeking
      const animating = session.effects.some(fx => now < fx.t0 + fx.dur)
      last = now
      if (frozen && !animating && !dirty && signature === lastSignature && lastState === session.state) {
        measure('idleFrame', 1)
        raf = requestAnimationFrame(frame)
        return
      }
      lastSignature = signature; lastState = session.state; dirty = false
      const renderStart = performance.now()
      last = now
      ctx.save()
      ctx.scale(dpr, dpr)
      // Screen shake while a spire hit is fresh (rendering-only randomness).
      const hit =
        !settings.reducedMotion && session.effects.find((fx) => fx.kind === 'spire_hit' && now - fx.t0 < fx.dur)
      if (hit) {
        const strength = 3 * (1 - (now - hit.t0) / hit.dur)
        ctx.translate((Math.random() - 0.5) * 2 * strength, (Math.random() - 0.5) * 2 * strength)
      }
      draw(ctx, session, uiRef.current, dpr)
      const {shopSelection,hoverCell} = uiRef.current
      if (previewRef.current) {
        const text = shopSelection && hoverCell ? placementSummary(placementPreview(session.state,shopSelection,hoverCell),shopSelection) : shopSelection ? 'Aim to compare the new route and coverage. Green squares gain coverage; crossed cells lose it.' : ''
        if (previewRef.current.textContent !== text) previewRef.current.textContent = text
      }
      ctx.restore()
      session.markRendered()
      const renderMs = performance.now() - renderStart
      measure('render', renderMs)
      measure('backingScale', dpr)
      if (!frozen && settings.graphicsQuality === 'auto') adaptive.sample(renderMs + renderStart - simStart)
      measure('effects', session.effects.length)
      // The loupe copies from this frame's pixels, so it repaints after.
      if (aimRef.current && loupeRef.current) renderLoupe(loupeRef.current, canvas, aimRef.current, dpr)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => { resized.disconnect(); cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', visibility) }
  }, [session])

  const cellFromEvent = (e: { clientX: number; clientY: number }): CellPos => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * MAP_WIDTH
    const y = ((e.clientY - rect.top) / rect.height) * MAP_HEIGHT
    return { cx: Math.floor(x), cy: Math.floor(y) }
  }

  const aimFromEvent = (e: { clientX: number; clientY: number }): TouchAim => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const screenScale = rect.width / (MAP_WIDTH * CELL_PX)
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const x = sx / screenScale
    const y = sy / screenScale
    const cell = {
      cx: Math.max(0, Math.min(MAP_WIDTH - 1, Math.floor(x / CELL_PX))),
      cy: Math.max(0, Math.min(MAP_HEIGHT - 1, Math.floor(y / CELL_PX))),
    }
    const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom
    return { x, y, sx, sy, cell, screenScale, inside }
  }

  // Position the loupe overlay near the finger, in SCREEN space. It is not
  // confined to the playfield — on a phone the board is ~170 px tall, so a
  // board-bound loupe had nowhere to live except under the finger (the bug
  // this replaces). Preference: above the finger; if the viewport top cuts
  // that off, to the right; then to the left; below only as a last resort.
  const placeLoupe = (aim: TouchAim): void => {
    const loupe = loupeRef.current
    const canvas = canvasRef.current
    if (!loupe || !canvas) return
    const rect = canvas.getBoundingClientRect()
    const r = LOUPE_D / 2
    const fingerX = rect.left + aim.sx // viewport coords
    const fingerY = rect.top + aim.sy
    let cx = fingerX
    let cy = fingerY - LOUPE_GAP
    if (cy - r < 4) {
      cy = fingerY
      if (fingerX + LOUPE_GAP + r < window.innerWidth - 4) cx = fingerX + LOUPE_GAP
      else if (fingerX - LOUPE_GAP - r > 4) cx = fingerX - LOUPE_GAP
      else cy = fingerY + LOUPE_GAP // truly cornered — below beats invisible
    }
    // Clamp inside the viewport, then convert to canvas-relative offsets.
    cx = Math.max(r + 4, Math.min(window.innerWidth - r - 4, cx))
    loupe.style.left = `${cx - r - rect.left}px`
    loupe.style.top = `${cy - r - rect.top}px`
    loupe.style.display = 'block'
  }

  const endAim = (): void => {
    aimRef.current = null
    if (loupeRef.current) loupeRef.current.style.display = 'none'
    onHover(null)
  }

  return (
    <div className="playfield-wrap" style={{ maxWidth: MAP_WIDTH * CELL_PX }}>
      <canvas
        ref={canvasRef}
        className="playfield"
        data-testid="playfield"
        role="img"
        aria-label="Battlefield — pick a tower, then click a free cell beside the path to build"
        style={{
          width: '100%',
          aspectRatio: `${MAP_WIDTH} / ${MAP_HEIGHT}`,
          // While armed, steering the beam, or sweeping coins, a touch
          // drag belongs to the game — not to page scrolling.
          touchAction: armed || beamAim || dragCollect ? 'none' : 'auto',
        }}
        // Long-press on touch devices opens the context menu, which in turn
        // starts a text selection — fatal for hold-to-aim placement.
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          if (e.pointerType !== 'touch' || (!armed && !beamAim && !dragCollect)) return
          const aim = aimFromEvent(e)
          aimRef.current = aim
          downCellRef.current = aim.cell
          // Beam steering and coin sweeping want a bare finger, not the loupe.
          if (armed) placeLoupe(aim)
          onHover(aim.cell) // armed: the ghost; beam: the aim; else: the collector
        }}
        onPointerMove={(e) => {
          if (!aimRef.current || e.pointerType !== 'touch') return
          const aim = aimFromEvent(e)
          aimRef.current = aim
          if (aim.inside) {
            if (armed) placeLoupe(aim)
            onHover(aim.cell)
          } else {
            // Off the board: the loupe vanishes — the universal "let go here
            // to cancel" affordance.
            if (loupeRef.current) loupeRef.current.style.display = 'none'
            onHover(null)
          }
        }}
        onPointerUp={(e) => {
          if (!aimRef.current || e.pointerType !== 'touch') return
          const release = aimFromEvent(e)
          const downCell = downCellRef.current
          endAim()
          if (!armed && !beamAim) {
            // A coin sweep: lifting the finger ends it. A moved finger was a
            // sweep (swallow the click); an in-place tap stays a real tap.
            if (release.inside && downCell && !sameCell(release.cell, downCell)) {
              suppressClickRef.current = { armed: true, until: performance.now() + 400 }
            }
            return
          }
          // Released off the board: an aborted placement, not a tower.
          if (!release.inside) return
          suppressClickRef.current = { armed: true, until: performance.now() + 400 }
          onCellClick(release.cell)
        }}
        onPointerCancel={() => {
          // The browser took the pointer (e.g. a system gesture): abort the
          // placement rather than dropping a tower somewhere half-aimed.
          endAim()
        }}
        onClick={(e) => {
          const sup = suppressClickRef.current
          if (sup.armed) {
            sup.armed = false
            if (performance.now() < sup.until) return
          }
          onCellClick(cellFromEvent(e))
        }}
        onMouseMove={(e) => onHover(cellFromEvent(e))}
        onMouseLeave={() => onHover(null)}
      />
      <p ref={previewRef} className="placement-report" data-testid="placement-report" role="status" />
      <canvas
        ref={loupeRef}
        className="placement-loupe"
        data-testid="placement-loupe"
        aria-hidden="true"
        style={{ width: LOUPE_D, height: LOUPE_D, display: 'none' }}
      />
    </div>
  )
}
