// Canvas primitives: shapes, the cached glow sprite engine, unit conversion,
// and the animation clock. Everything here is pure drawing plumbing with no
// knowledge of the game.


// --- glow engine ------------------------------------------------------------
// One soft radial sprite per color, drawn with additive ('lighter')
// compositing: every luminous thing in the game — arcs, bolts, the portal,
// the spire, kills — becomes a light source instead of a flat shape. Sprites
// are cached per color; drawing one is a single drawImage.

import type { GameSession } from '../session'
import { CELL_PX } from './theme'
const GLOW_SPRITES = new Map<string, HTMLCanvasElement>()

const GLOW_SIZE = 64


export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}


export function glowSprite(color: string): HTMLCanvasElement {
  let sprite = GLOW_SPRITES.get(color)
  if (sprite) return sprite
  sprite = document.createElement('canvas')
  sprite.width = GLOW_SIZE
  sprite.height = GLOW_SIZE
  const g = sprite.getContext('2d')!
  const half = GLOW_SIZE / 2
  const grad = g.createRadialGradient(half, half, 0, half, half, half)
  grad.addColorStop(0, hexToRgba(color, 0.85))
  grad.addColorStop(0.35, hexToRgba(color, 0.32))
  grad.addColorStop(1, hexToRgba(color, 0))
  g.fillStyle = grad
  g.fillRect(0, 0, GLOW_SIZE, GLOW_SIZE)
  GLOW_SPRITES.set(color, sprite)
  return sprite
}


// A tiny five-point star, drawn point-up around (x, y).
export function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const rad = i % 2 === 0 ? r : r * 0.45
    const px2 = x + Math.cos(a) * rad
    const py2 = y + Math.sin(a) * rad
    if (i === 0) ctx.moveTo(px2, py2)
    else ctx.lineTo(px2, py2)
  }
  ctx.closePath()
  ctx.fill()
}


export function glow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, alpha = 1): void {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = alpha
  ctx.drawImage(glowSprite(color), x - radius, y - radius, radius * 2, radius * 2)
  ctx.restore()
}


export function px(v: number): number {
  return (v / 1000) * CELL_PX
}


export function easeOutBack(t: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}


// Animation clock: sim time (ticks) plus the interpolation fraction, so
// walk cycles speed up with fast-forward and freeze on pause.
export function animTime(session: GameSession): number {
  return session.state.tick + session.alpha
}


// --- small path helpers -----------------------------------------------------

export function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
}


export function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0): void {
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2)
}


export function polygon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, sides: number, rot = 0): void {
  ctx.beginPath()
  for (let i = 0; i <= sides; i++) {
    const a = rot + (i * 2 * Math.PI) / sides
    if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
    else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
  }
  ctx.closePath()
}


export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
