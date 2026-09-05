// The ground: the cached terrain bake (rocks, marsh, mesas, vents, props) and
// the battle scars stamped on top of it. Both are canvas caches keyed by map,
// which is why they live together and away from the per-frame passes.


// --- battle scars -----------------------------------------------------------
// A persistent decal canvas the same size as the field: every kill stamps a
// small scorch + color fleck, and the whole layer slowly fades, so heavy
// fighting visibly scars the ground where it happened. Keyed by map+seed —
// a new run starts on clean earth.

import { MAP_HEIGHT, MAP_WIDTH } from '../../data/maps'
import type { MapDef } from '../../data/maps'
import type { Vec } from '../../engine/types'
import { circle, ellipse, px } from './primitives'
import { CELL_PX } from './theme'
import type { MapTheme, PropKind } from './theme'
const DECALS = { key: -1, canvas: null as HTMLCanvasElement | null, lastFade: 0 }


export function stampDecal(key: number, at: Vec, color: string): void {
  if (!DECALS.canvas || DECALS.key !== key) {
    DECALS.canvas = document.createElement('canvas')
    DECALS.canvas.width = MAP_WIDTH * CELL_PX
    DECALS.canvas.height = MAP_HEIGHT * CELL_PX
    DECALS.key = key
    DECALS.lastFade = performance.now()
  }
  const g = DECALS.canvas.getContext('2d')!
  const x = px(at.x)
  const y = px(at.y)
  const n = hash01(Math.round(at.x), Math.round(at.y), 3)
  g.save()
  g.translate(x, y)
  g.rotate(n * Math.PI * 2)
  g.globalAlpha = 0.16
  g.fillStyle = '#000000'
  ellipse(g, 0, 0, 5 + n * 4, 3.5 + n * 2)
  g.fill()
  g.globalAlpha = 0.1
  g.fillStyle = color
  for (let i = 0; i < 3; i++) {
    const a = n * 7 + i * 2.1
    circle(g, Math.cos(a) * (3 + i * 2), Math.sin(a) * (2 + i * 1.4), 1.3)
    g.fill()
  }
  g.restore()
}


export function drawDecals(ctx: CanvasRenderingContext2D, runId: number): void {
  if (!DECALS.canvas || DECALS.key !== runId) return
  // The battlefield forgets slowly: every ~1.5s the layer loses a little.
  const now = performance.now()
  if (now - DECALS.lastFade > 1500) {
    DECALS.lastFade = now
    const g = DECALS.canvas.getContext('2d')!
    g.save()
    g.globalCompositeOperation = 'destination-out'
    g.globalAlpha = 0.06
    g.fillRect(0, 0, DECALS.canvas.width, DECALS.canvas.height)
    g.restore()
  }
  ctx.drawImage(DECALS.canvas, 0, 0)
}


// --- terrain layer ----------------------------------------------------------
// The whole static battlefield — ground noise, checker, grid, props, rocks
// with shadows, vignette — is rendered ONCE per map to an offscreen canvas
// and blitted per frame. Richer than the old per-cell loop, and cheaper.
// Everything is seeded by integer hashes: same map, same ground, no RNG.

const TERRAIN_CACHE = { map: null as MapDef | null, theme: null as MapTheme | null, dpr: 0, canvas: null as HTMLCanvasElement | null }


function hash01(a: number, b: number, salt = 0): number {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(salt, 2246822519)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967295
}


function drawProp(g: CanvasRenderingContext2D, kind: PropKind, x: number, y: number, n: number, theme: MapTheme): void {
  g.strokeStyle = theme.propColor
  g.fillStyle = theme.propColor
  g.lineWidth = 1
  switch (kind) {
    case 'tuft': {
      g.beginPath()
      for (let i = -1; i <= 1; i++) {
        g.moveTo(x + i * 2, y + 3)
        g.quadraticCurveTo(x + i * 2 + i, y - 1, x + i * 3 + n * 2, y - 4 - n * 3)
      }
      g.stroke()
      break
    }
    case 'puddle': {
      g.globalAlpha = 0.55
      ellipse(g, x, y, 5 + n * 4, 2.5 + n * 2)
      g.fill()
      g.globalAlpha = 0.35
      g.strokeStyle = '#8fd0ff'
      g.beginPath()
      g.ellipse(x, y, 5 + n * 4, 2.5 + n * 2, 0, Math.PI * 1.1, Math.PI * 1.7)
      g.stroke()
      g.globalAlpha = 1
      break
    }
    case 'crack': {
      g.beginPath()
      g.moveTo(x - 5, y + 2 - n * 4)
      g.lineTo(x - 1, y + n * 3)
      g.lineTo(x + 2, y - 2 + n * 2)
      g.lineTo(x + 6, y + 1 + n * 3)
      g.stroke()
      break
    }
    case 'pebbles': {
      for (let i = 0; i < 3; i++) {
        const px2 = x + (hash01(i, Math.round(x), 7) - 0.5) * 10
        const py2 = y + (hash01(i, Math.round(y), 11) - 0.5) * 8
        circle(g, px2, py2, 1 + hash01(i, Math.round(x + y), 13) * 1.4)
        g.fill()
      }
      break
    }
    case 'bones': {
      g.save()
      g.translate(x, y)
      g.rotate(n * Math.PI)
      g.beginPath()
      g.moveTo(-4, 0)
      g.lineTo(4, 0)
      g.moveTo(-1.5, -2.5)
      g.lineTo(-1.5, 2.5)
      g.stroke()
      g.restore()
      break
    }
    case 'ember': {
      g.beginPath()
      g.moveTo(x - 4, y + 1)
      g.lineTo(x + 1, y - 1)
      g.lineTo(x + 4, y + 1 - n * 2)
      g.stroke()
      g.globalAlpha = 0.5 + n * 0.4
      g.fillStyle = '#ff9d5c'
      circle(g, x + 1, y - 1, 1)
      g.fill()
      g.globalAlpha = 1
      break
    }
  }
}


export function terrainLayer(map: MapDef, theme: MapTheme): HTMLCanvasElement {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  // Maps are immutable, memoized engine values. Counts and display names
  // cannot identify their geometry: two different seeds can share both.
  if (TERRAIN_CACHE.canvas && TERRAIN_CACHE.map === map && TERRAIN_CACHE.theme === theme && TERRAIN_CACHE.dpr === dpr) return TERRAIN_CACHE.canvas
  const w = map.width * CELL_PX
  const h = map.height * CELL_PX
  const canvas = document.createElement('canvas')
  canvas.width = w * dpr
  canvas.height = h * dpr
  const g = canvas.getContext('2d')!
  g.scale(dpr, dpr)

  // Ground: base wash + soft checker.
  g.fillStyle = theme.bg
  g.fillRect(0, 0, w, h)
  g.fillStyle = theme.checker
  for (let cy = 0; cy < map.height; cy++) {
    for (let cx = 0; cx < map.width; cx++) {
      if ((cx + cy) % 2 === 0) g.fillRect(cx * CELL_PX, cy * CELL_PX, CELL_PX, CELL_PX)
    }
  }

  // Speckle noise: hashed light/dark grain breaks up the flat fills.
  for (let y = 0; y < h; y += 5) {
    for (let x = 0; x < w; x += 5) {
      const n = hash01(x, y, map.id + 1)
      if (n > 0.86) {
        g.globalAlpha = 0.028 + (n - 0.86) * 0.2
        g.fillStyle = '#ffffff'
        g.fillRect(x + n * 3, y + n * 2, 2.5, 2.5)
      } else if (n < 0.14) {
        g.globalAlpha = 0.05 + n * 0.2
        g.fillStyle = '#000000'
        g.fillRect(x + n * 4, y + n * 5, 3.5, 3.5)
      }
    }
  }
  g.globalAlpha = 1

  // Grid, baked faintly under everything dynamic.
  g.strokeStyle = theme.gridLine
  g.lineWidth = 1
  g.beginPath()
  for (let x = 0; x <= map.width; x++) {
    g.moveTo(x * CELL_PX + 0.5, 0)
    g.lineTo(x * CELL_PX + 0.5, h)
  }
  for (let y = 0; y <= map.height; y++) {
    g.moveTo(0, y * CELL_PX + 0.5)
    g.lineTo(w, y * CELL_PX + 0.5)
  }
  g.stroke()

  // Scattered props on open ground (never on rocks or the gates).
  for (let cy = 0; cy < map.height; cy++) {
    for (let cx = 0; cx < map.width; cx++) {
      if (map.rocks[cy * map.width + cx]) continue
      if ((cx === map.spawn.cx && cy === map.spawn.cy) || (cx === map.spire.cx && cy === map.spire.cy)) continue
      const n = hash01(cx, cy, map.id + 5)
      if (n > 0.16) continue
      const ox = cx * CELL_PX + 6 + hash01(cx, cy, 21) * (CELL_PX - 12)
      const oy = cy * CELL_PX + 6 + hash01(cx, cy, 22) * (CELL_PX - 12)
      g.globalAlpha = 0.8
      drawProp(g, theme.props, ox, oy, hash01(cx, cy, 23), theme)
      g.globalAlpha = 1
    }
  }

  // Marsh pools (Frostfen): soft dark water with a pale sheen — reads as
  // "wet, unbuildable" at a glance. Merged blobs get one continuous look
  // because adjacent cells share edge-free fills.
  for (let cy = 0; cy < map.height; cy++) {
    for (let cx = 0; cx < map.width; cx++) {
      if (!map.marsh[cy * map.width + cx]) continue
      const x = cx * CELL_PX
      const y = cy * CELL_PX
      g.fillStyle = 'rgba(16, 44, 62, 0.95)'
      g.fillRect(x, y, CELL_PX, CELL_PX)
      const n = hash01(cx, cy, 31)
      g.globalAlpha = 0.3
      g.fillStyle = '#8fd0ff'
      ellipse(g, x + CELL_PX * (0.3 + n * 0.4), y + CELL_PX * (0.35 + n * 0.3), CELL_PX * 0.28, CELL_PX * 0.1)
      g.fill()
      g.globalAlpha = 1
    }
  }

  // Mesas (Highlands): raised blocks — lit top face, dark cliff edge on the
  // south side, so "high ground" reads without true elevation.
  for (let cy = 0; cy < map.height; cy++) {
    for (let cx = 0; cx < map.width; cx++) {
      if (!map.mesa[cy * map.width + cx]) continue
      const x = cx * CELL_PX
      const y = cy * CELL_PX
      const below = cy + 1 < map.height && map.mesa[(cy + 1) * map.width + cx]
      g.fillStyle = 'rgba(0, 0, 0, 0.4)'
      g.fillRect(x + 2, y + 4, CELL_PX, CELL_PX) // drop shadow
      g.fillStyle = theme.rock
      g.fillRect(x, y, CELL_PX, CELL_PX)
      g.fillStyle = theme.rockEdge
      g.fillRect(x, y, CELL_PX, 3) // lit north rim
      if (!below) {
        g.fillStyle = 'rgba(0, 0, 0, 0.45)'
        g.fillRect(x, y + CELL_PX - 5, CELL_PX, 5) // cliff face
      }
      const n = hash01(cx, cy, 37)
      g.globalAlpha = 0.12
      g.fillStyle = '#ffffff'
      g.fillRect(x + 4 + n * 10, y + 6 + n * 8, 6, 2)
      g.globalAlpha = 1
    }
  }

  // Vents (Ember Waste): glowing fissures — a dark crack with molten veins.
  for (const idx of map.vents) {
    const cx = idx % map.width
    const cy = Math.floor(idx / map.width)
    const x = cx * CELL_PX + CELL_PX / 2
    const y = cy * CELL_PX + CELL_PX / 2
    g.strokeStyle = 'rgba(0, 0, 0, 0.6)'
    g.lineWidth = 5
    g.beginPath()
    g.moveTo(x - 10, y - 6)
    g.lineTo(x - 2, y + 2)
    g.lineTo(x + 4, y - 3)
    g.lineTo(x + 10, y + 6)
    g.stroke()
    g.strokeStyle = '#ff7a3c'
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(x - 10, y - 6)
    g.lineTo(x - 2, y + 2)
    g.lineTo(x + 4, y - 3)
    g.lineTo(x + 10, y + 6)
    g.stroke()
  }

  // Rocks: drop shadow, faceted body, lit face — baked, with per-cell jitter.
  for (let cy = 0; cy < map.height; cy++) {
    for (let cx = 0; cx < map.width; cx++) {
      if (!map.rocks[cy * map.width + cx]) continue
      const jitter = (cx * 7 + cy * 13) % 4
      const x = cx * CELL_PX + 2
      const y = cy * CELL_PX + 2
      const s = CELL_PX - 4
      g.fillStyle = 'rgba(0, 0, 0, 0.35)'
      ellipse(g, x + s / 2 + 2, y + s - 2, s * 0.55, s * 0.18)
      g.fill()
      g.fillStyle = theme.rock
      g.beginPath()
      g.moveTo(x + 4 + jitter, y)
      g.lineTo(x + s - 2, y + 2)
      g.lineTo(x + s, y + s - 4 + (jitter % 2))
      g.lineTo(x + s - 6, y + s)
      g.lineTo(x + 2, y + s - 2)
      g.lineTo(x, y + 6 - (jitter % 3))
      g.closePath()
      g.fill()
      g.fillStyle = theme.rockEdge
      g.beginPath()
      g.moveTo(x + 4 + jitter, y)
      g.lineTo(x + s - 2, y + 2)
      g.lineTo(x + s * 0.55, y + s * 0.45)
      g.lineTo(x + 3, y + 8)
      g.closePath()
      g.globalAlpha = 0.5
      g.fill()
      g.globalAlpha = 1
    }
  }

  // Vignette + a whisper of top-left light: the field reads lit, not flat.
  const light = g.createLinearGradient(0, 0, w, h)
  light.addColorStop(0, 'rgba(255, 255, 255, 0.045)')
  light.addColorStop(0.5, 'rgba(255, 255, 255, 0)')
  g.fillStyle = light
  g.fillRect(0, 0, w, h)
  const vig = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.62)
  vig.addColorStop(0, 'rgba(0, 0, 0, 0)')
  vig.addColorStop(1, 'rgba(0, 0, 0, 0.42)')
  g.fillStyle = vig
  g.fillRect(0, 0, w, h)

  TERRAIN_CACHE.map = map
  TERRAIN_CACHE.theme = theme
  TERRAIN_CACHE.dpr = dpr
  TERRAIN_CACHE.canvas = canvas
  return canvas
}
