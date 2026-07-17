import { useEffect, useRef } from 'react'
import { MAP_HEIGHT, MAP_WIDTH } from '../data/maps'
import type { CellPos } from '../engine/types'
import { CELL_PX, draw, type RenderUiState } from './render'
import { settings } from './settings'
import type { GameSession } from './session'

interface Props {
  session: GameSession
  ui: RenderUiState
  onCellClick: (cell: CellPos) => void
  onHover: (cell: CellPos | null) => void
}

// The playfield. One rAF loop drives both the simulation clock and the
// renderer; React never re-renders this component per frame.
export function GameCanvas({ session, ui, onCellClick, onHover }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const uiRef = useRef(ui)
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
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [session])

  const cellFromEvent = (e: React.MouseEvent<HTMLCanvasElement>): CellPos => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * MAP_WIDTH
    const y = ((e.clientY - rect.top) / rect.height) * MAP_HEIGHT
    return { cx: Math.floor(x), cy: Math.floor(y) }
  }

  return (
    <canvas
      ref={canvasRef}
      className="playfield"
      data-testid="playfield"
      role="img"
      aria-label="Battlefield — pick a tower, then click a free cell beside the path to build"
      style={{ width: '100%', maxWidth: MAP_WIDTH * CELL_PX, aspectRatio: `${MAP_WIDTH} / ${MAP_HEIGHT}` }}
      onClick={(e) => onCellClick(cellFromEvent(e))}
      onMouseMove={(e) => onHover(cellFromEvent(e))}
      onMouseLeave={() => onHover(null)}
    />
  )
}
