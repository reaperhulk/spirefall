// The touch loupe: a magnified inset that follows a finger so a fingertip
// never hides the cell it is aiming at.


// ---------------------------------------------------------------------------
// Touch placement loupe: on phones the board is CSS-downscaled far below its
// logical size (a cell can be ~16 screen px), so the finger hides the exact
// cell it's aiming at. While a touch drag is aiming a placement, a magnified
// loupe floats near the finger showing the ghost and a crosshair on the
// target cell. The loupe is a separate screen-space canvas overlay, NOT
// drawn into the playfield: the board is only ~170 screen px tall on a
// phone, so a loupe confined to it has nowhere to go except under the
// finger. As an overlay it can float over the header instead.

import { MAP_HEIGHT, MAP_WIDTH } from '../../data/maps'
import type { CellPos } from '../../engine/types'
import { CELL_PX } from './theme'
export interface TouchAim {
  x: number // logical canvas px
  y: number
  sx: number // screen px, relative to the canvas box (drives loupe placement)
  sy: number
  cell: CellPos
  screenScale: number // on-screen px per logical px (CSS downscale factor)
  inside: boolean // finger still over the board? released outside = cancel
}


export const LOUPE_D = 120 // loupe diameter, screen px

export const LOUPE_GAP = 96 // finger to loupe centre, screen px


// Paint the loupe's content: a zoomed copy of the freshly drawn frame,
// centred on the target cell, with a crosshair and ring. Positioning is the
// caller's job — this only fills the loupe canvas.
export function renderLoupe(
  loupe: HTMLCanvasElement,
  source: HTMLCanvasElement,
  aim: TouchAim,
  sourceDpr: number,
): void {
  const dpr = window.devicePixelRatio || 1
  const px = Math.round(LOUPE_D * dpr)
  if (loupe.width !== px) {
    loupe.width = px
    loupe.height = px
  }
  const ctx = loupe.getContext('2d')!
  ctx.save()
  ctx.clearRect(0, 0, loupe.width, loupe.height)
  ctx.scale(dpr, dpr)

  // Fixed magnification in SCREEN terms: the target cell always appears
  // ~30 px in the loupe, however far CSS shrank the board — roughly four
  // cells of context. (46 px per cell was too zoomed to follow.)
  const zoom = 30 / (CELL_PX * Math.max(0.05, aim.screenScale)) // loupe px per screen px
  const srcSize = LOUPE_D / (zoom * Math.max(0.05, aim.screenScale)) // logical px covered
  const mapW = MAP_WIDTH * CELL_PX
  const mapH = MAP_HEIGHT * CELL_PX
  const cellCx = (aim.cell.cx + 0.5) * CELL_PX
  const cellCy = (aim.cell.cy + 0.5) * CELL_PX
  const srcX = Math.min(Math.max(0, mapW - srcSize), Math.max(0, cellCx - srcSize / 2))
  const srcY = Math.min(Math.max(0, mapH - srcSize), Math.max(0, cellCy - srcSize / 2))

  const r = LOUPE_D / 2
  ctx.beginPath()
  ctx.arc(r, r, r - 1.5, 0, Math.PI * 2)
  ctx.clip()
  ctx.fillStyle = '#0b0e14'
  ctx.fillRect(0, 0, LOUPE_D, LOUPE_D)
  ctx.drawImage(
    source,
    srcX * sourceDpr,
    srcY * sourceDpr,
    srcSize * sourceDpr,
    srcSize * sourceDpr,
    0,
    0,
    LOUPE_D,
    LOUPE_D,
  )

  // Crosshair: outline the target cell inside the magnified view.
  const cellLoupePx = (CELL_PX / srcSize) * LOUPE_D
  const cx = r + ((cellCx - (srcX + srcSize / 2)) / srcSize) * LOUPE_D
  const cy = r + ((cellCy - (srcY + srcSize / 2)) / srcSize) * LOUPE_D
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)'
  ctx.lineWidth = 2
  ctx.strokeRect(cx - cellLoupePx / 2, cy - cellLoupePx / 2, cellLoupePx, cellLoupePx)
  ctx.restore()

  // Ring on top of the clipped content. Drawn in its own dpr-scaled frame:
  // drawing after restore() in raw device px put a quarter-scale phantom
  // ring in the top-left corner on every dpr>1 phone.
  ctx.save()
  ctx.scale(dpr, dpr)
  ctx.strokeStyle = 'rgba(122, 162, 247, 0.95)'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.arc(r, r, r - 1.5, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}
