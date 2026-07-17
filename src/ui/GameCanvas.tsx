import { useEffect, useRef } from 'react'
import { MAP_HEIGHT, MAP_WIDTH } from '../data/maps'
import type { CellPos } from '../engine/types'
import { CELL_PX, draw, LOUPE_D, LOUPE_GAP, renderLoupe, type RenderUiState, type TouchAim } from './render'
import { settings } from './settings'
import type { GameSession } from './session'

interface Props {
  session: GameSession
  ui: RenderUiState
  // Something is armed for placement/casting: touch input switches to
  // hold-to-aim (drag with a magnifier loupe, place on release).
  armed: boolean
  onCellClick: (cell: CellPos) => void
  onHover: (cell: CellPos | null) => void
}

// The playfield. One rAF loop drives both the simulation clock and the
// renderer; React never re-renders this component per frame.
export function GameCanvas({ session, ui, armed, onCellClick, onHover }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const loupeRef = useRef<HTMLCanvasElement>(null)
  const uiRef = useRef(ui)
  // Live touch aim (finger down with a tower/ability armed). A ref, not
  // state: it changes every pointermove and only the canvas cares.
  const aimRef = useRef<TouchAim | null>(null)
  // A touch release places the tower — the click event the browser fires
  // right after must not place a second one (or disarm via tower-inspect).
  // Consume-one-within-deadline: the flag eats exactly the paired click, and
  // the deadline expires it after a long drag, where the browser fires no
  // click at all and a bare flag would swallow the NEXT genuine tap.
  const suppressClickRef = useRef({ armed: false, until: 0 })

  useEffect(() => {
    uiRef.current = ui
  })

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const dpr = window.devicePixelRatio || 1
    canvas.width = MAP_WIDTH * CELL_PX * dpr
    canvas.height = MAP_HEIGHT * CELL_PX * dpr

    let raf = 0
    let last = performance.now()
    const frame = (now: number) => {
      session.advance(now - last)
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
      draw(ctx, session, uiRef.current)
      ctx.restore()
      // The loupe copies from this frame's pixels, so it repaints after.
      if (aimRef.current && loupeRef.current) renderLoupe(loupeRef.current, canvas, aimRef.current, dpr)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
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
          // While armed, a touch drag is aiming — not scrolling the page.
          touchAction: armed ? 'none' : 'auto',
        }}
        onPointerDown={(e) => {
          if (e.pointerType !== 'touch' || !armed) return
          const aim = aimFromEvent(e)
          aimRef.current = aim
          placeLoupe(aim)
          onHover(aim.cell) // the placement ghost is the loupe's payload
        }}
        onPointerMove={(e) => {
          if (!aimRef.current || e.pointerType !== 'touch') return
          const aim = aimFromEvent(e)
          aimRef.current = aim
          if (aim.inside) {
            placeLoupe(aim)
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
          endAim()
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
