import { useEffect, useRef } from 'react'
import { MAP_HEIGHT, MAP_WIDTH } from '../data/maps'
import type { CellPos } from '../engine/types'
import { CELL_PX, draw, drawTouchReticle, type RenderUiState, type TouchAim } from './render'
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
      // The loupe reads back this frame's pixels, so it must be drawn last.
      if (aimRef.current) drawTouchReticle(ctx, canvas, aimRef.current, dpr)
      ctx.restore()
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [session])

  const cellFromEvent = (e: { clientX: number; clientY: number; currentTarget: HTMLCanvasElement }): CellPos => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * MAP_WIDTH
    const y = ((e.clientY - rect.top) / rect.height) * MAP_HEIGHT
    return { cx: Math.floor(x), cy: Math.floor(y) }
  }

  const aimFromEvent = (e: { clientX: number; clientY: number; currentTarget: HTMLCanvasElement }): TouchAim => {
    const rect = e.currentTarget.getBoundingClientRect()
    const screenScale = rect.width / (MAP_WIDTH * CELL_PX)
    const x = (e.clientX - rect.left) / screenScale
    const y = (e.clientY - rect.top) / screenScale
    const cell = {
      cx: Math.max(0, Math.min(MAP_WIDTH - 1, Math.floor(x / CELL_PX))),
      cy: Math.max(0, Math.min(MAP_HEIGHT - 1, Math.floor(y / CELL_PX))),
    }
    return { x, y, cell, screenScale }
  }

  return (
    <canvas
      ref={canvasRef}
      className="playfield"
      data-testid="playfield"
      role="img"
      aria-label="Battlefield — pick a tower, then click a free cell beside the path to build"
      style={{
        width: '100%',
        maxWidth: MAP_WIDTH * CELL_PX,
        aspectRatio: `${MAP_WIDTH} / ${MAP_HEIGHT}`,
        // While armed, a touch drag is aiming — not scrolling the page.
        touchAction: armed ? 'none' : 'auto',
      }}
      onPointerDown={(e) => {
        if (e.pointerType !== 'touch' || !armed) return
        const aim = aimFromEvent(e)
        aimRef.current = aim
        onHover(aim.cell) // the placement ghost is the loupe's payload
      }}
      onPointerMove={(e) => {
        if (!aimRef.current || e.pointerType !== 'touch') return
        const aim = aimFromEvent(e)
        aimRef.current = aim
        onHover(aim.cell)
      }}
      onPointerUp={(e) => {
        if (!aimRef.current || e.pointerType !== 'touch') return
        const cell = aimRef.current.cell
        aimRef.current = null
        onHover(null)
        suppressClickRef.current = { armed: true, until: performance.now() + 400 }
        onCellClick(cell)
      }}
      onPointerCancel={() => {
        // The browser took the pointer (e.g. a system gesture): abort the
        // placement rather than dropping a tower somewhere half-aimed.
        aimRef.current = null
        onHover(null)
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
  )
}
