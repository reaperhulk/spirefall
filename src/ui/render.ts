import { ABILITIES, ENEMIES, towerTier } from '../data/content'
import { MAP_HEIGHT, MAP_WIDTH } from '../data/maps'
import { settings } from './settings'
import type { MapDef } from '../data/maps'
import { blockedGrid, canPlaceTower, cellCenter, distanceField, getMap, pathFrom } from '../engine/grid'
import type { AbilityId, CellPos, Enemy, RunState, TowerType, Vec } from '../engine/types'
import type { GameSession } from './session'

export const CELL_PX = 34

export interface RenderUiState {
  hoverCell: CellPos | null
  selectedTowerId: number | null
  shopSelection: TowerType | null
  abilitySelection: AbilityId | null
}

export const ENEMY_COLORS: Record<string, string> = {
  runner: '#f7768e',
  swarmling: '#ff9e64',
  brute: '#db4b4b',
  shieldbearer: '#c0caf5',
  flier: '#7aa2f7',
  healer: '#9ece6a',
  splitter: '#d19a66',
  splitling: '#f0a45d',
  wraith: '#9aa5ce',
  carrier: '#d16d9e',
  boss: '#ff007c',
  boss2: '#c53b53',
  boss3: '#ffc777',
}

// High-visibility alternates, derived from the Okabe–Ito colorblind-safe
// palette: hues separate under deuteranopia/protanopia and lightness steps
// disambiguate the rest. Body shapes already differ per type; color assist
// makes the palette pull in the same direction instead of against it.
export const ENEMY_COLORS_ASSIST: Record<string, string> = {
  runner: '#e69f00', // orange
  swarmling: '#f0e442', // yellow
  brute: '#d55e00', // vermillion
  shieldbearer: '#ffffff', // white
  flier: '#56b4e9', // sky blue
  healer: '#009e73', // bluish green
  splitter: '#cc79a7', // reddish purple
  splitling: '#e7b3d0', // lighter step of splitter
  wraith: '#999999', // grey
  carrier: '#aa4499', // deep purple
  boss: '#ee3377', // magenta
  boss2: '#0077bb', // strong blue
  boss3: '#eecc66', // pale gold
}

// Live palette lookup: reads the settings singleton each call, so toggling
// color assist recolors the very next frame.
export function enemyColor(type: string): string {
  const table = settings.colorAssist ? ENEMY_COLORS_ASSIST : ENEMY_COLORS
  return table[type] ?? ENEMY_COLORS[type] ?? '#ffd76e'
}

const COLORS = {
  bg: '#0b0e14',
  gridLine: '#151b28',
  rock: '#2c3448',
  rockEdge: '#3a445c',
  path: '#10151f',
  spawn: '#8856ff',
  spire: '#e5c07b',
  towers: {
    arrow: '#9ece6a',
    cannon: '#e0af68',
    frost: '#7dcfff',
    tesla: '#bb9af7',
    sniper: '#73daca',
    mint: '#e5c07b',
    beacon: '#ff9e64',
  } as Record<TowerType, string>,
  hpBack: '#30354a',
  hpFill: '#9ece6a',
  ghostOk: 'rgba(158, 206, 106, 0.35)',
  ghostBad: 'rgba(219, 75, 75, 0.35)',
  range: 'rgba(255, 255, 255, 0.08)',
  rangeEdge: 'rgba(255, 255, 255, 0.25)',
}

// Per-map terrain palettes: each battlefield reads distinct at a glance.
// Presentation only — the sim never sees color. Keyed by map name so map
// reordering can't silently swap themes.
type PropKind = 'tuft' | 'puddle' | 'crack' | 'pebbles' | 'bones' | 'ember'

interface MapTheme {
  bg: string
  checker: string
  path: string
  gridLine: string
  rock: string
  rockEdge: string
  mote: string // ambient drifting particles: fireflies, spray, dust, embers
  props: PropKind // scattered ground detail baked into the terrain layer
  propColor: string
}

const DEFAULT_THEME: MapTheme = {
  bg: COLORS.bg,
  checker: '#0d1119',
  path: COLORS.path,
  gridLine: COLORS.gridLine,
  rock: COLORS.rock,
  rockEdge: COLORS.rockEdge,
  mote: '#9aa5ce',
  props: 'pebbles',
  propColor: '#2a3248',
}

const MAP_THEMES: Record<string, MapTheme> = {
  // Verdant lowlands: mossy greens, drifting fireflies.
  Greenfield: { bg: '#0a1210', checker: '#0d1713', path: '#101c15', gridLine: '#14231c', rock: '#2b3d33', rockEdge: '#3c5245', mote: '#b8e08a', props: 'tuft', propColor: '#2e4a34' },
  // Flooded cuts: cold blue slate, hanging spray.
  'The Channels': { bg: '#091018', checker: '#0c141f', path: '#0f1a29', gridLine: '#132133', rock: '#28374d', rockEdge: '#365071', mote: '#8fd0ff', props: 'puddle', propColor: '#1a2c44' },
  // Fortress stone: neutral grey masonry, settling dust.
  'The Bulwark': { bg: '#0f0f12', checker: '#131318', path: '#17171e', gridLine: '#1d1d26', rock: '#34343f', rockEdge: '#4a4a59', mote: '#9a9aa8', props: 'crack', propColor: '#232329' },
  // Sun-scoured desert: warm sand on the wind.
  'The Serpent': { bg: '#14100a', checker: '#1a150d', path: '#211a11', gridLine: '#2a2115', rock: '#453824', rockEdge: '#5e4d31', mote: '#e0c080', props: 'pebbles', propColor: '#3a2e1c' },
  // Ashen wastes: scorched violet dusk, rising embers.
  Crossroads: { bg: '#100b14', checker: '#150e1b', path: '#1b1223', gridLine: '#23172e', rock: '#3a2c4a', rockEdge: '#503e66', mote: '#c586e0', props: 'bones', propColor: '#4a3c5c' },
  // Forge iron: rust and heat, sparks off the anvil.
  'The Gauntlet': { bg: '#140c08', checker: '#1a100b', path: '#22150e', gridLine: '#2b1a12', rock: '#4a2f22', rockEdge: '#6b4230', mote: '#ff9d5c', props: 'ember', propColor: '#5c2f16' },
}

function mapTheme(map: MapDef): MapTheme {
  return MAP_THEMES[map.name] ?? DEFAULT_THEME
}

// --- glow engine ------------------------------------------------------------
// One soft radial sprite per color, drawn with additive ('lighter')
// compositing: every luminous thing in the game — arcs, bolts, the portal,
// the spire, kills — becomes a light source instead of a flat shape. Sprites
// are cached per color; drawing one is a single drawImage.

const GLOW_SPRITES = new Map<string, HTMLCanvasElement>()
const GLOW_SIZE = 64

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function glowSprite(color: string): HTMLCanvasElement {
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

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, alpha = 1): void {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = alpha
  ctx.drawImage(glowSprite(color), x - radius, y - radius, radius * 2, radius * 2)
  ctx.restore()
}

// --- battle scars -----------------------------------------------------------
// A persistent decal canvas the same size as the field: every kill stamps a
// small scorch + color fleck, and the whole layer slowly fades, so heavy
// fighting visibly scars the ground where it happened. Keyed by map+seed —
// a new run starts on clean earth.

const DECALS = { key: '', canvas: null as HTMLCanvasElement | null, lastFade: 0 }

export function stampDecal(mapId: number, seed: string, at: Vec, color: string): void {
  const map = getMap(mapId)
  const key = `${mapId}:${seed}`
  if (!DECALS.canvas || DECALS.key !== key) {
    DECALS.canvas = document.createElement('canvas')
    DECALS.canvas.width = map.width * CELL_PX
    DECALS.canvas.height = map.height * CELL_PX
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

function drawDecals(ctx: CanvasRenderingContext2D, map: MapDef, seed: string): void {
  if (!DECALS.canvas || DECALS.key !== `${map.id}:${seed}`) return
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

const TERRAIN_CACHE = { key: '', canvas: null as HTMLCanvasElement | null }

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

function terrainLayer(map: MapDef, theme: MapTheme): HTMLCanvasElement {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const key = `${map.id}:${dpr}`
  if (TERRAIN_CACHE.canvas && TERRAIN_CACHE.key === key) return TERRAIN_CACHE.canvas
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

  TERRAIN_CACHE.key = key
  TERRAIN_CACHE.canvas = canvas
  return canvas
}

const ENEMY_RADIUS: Record<string, number> = {
  runner: 8,
  swarmling: 5,
  brute: 12,
  shieldbearer: 10,
  flier: 7,
  healer: 10,
  splitter: 9,
  splitling: 5,
  wraith: 8,
  carrier: 13,
  boss: 16,
  boss2: 16,
  boss3: 15,
}

function px(v: number): number {
  return (v / 1000) * CELL_PX
}

// Last known facing per enemy id — enemies keep their heading while standing
// still (walled in, spawn tick). Render-only cache, cleared when it grows.
const headings = new Map<number, number>()

// First time the renderer saw each enemy id, for the spawn pop-in. Wall
// clock is fine: it's a one-shot 220ms flourish, not sim state.
const firstSeen = new Map<number, number>()

function easeOutBack(t: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

export function draw(ctx: CanvasRenderingContext2D, session: GameSession, ui: RenderUiState): void {
  const state = session.state
  const map = getMap(state.mapId)
  const w = map.width * CELL_PX
  const h = map.height * CELL_PX

  const theme = mapTheme(map)
  ctx.drawImage(terrainLayer(map, theme), 0, 0, w, h)
  drawPathHighlight(ctx, state, map, animTime(session), theme)
  drawDecals(ctx, map, state.seed)
  drawAmbient(ctx, map, animTime(session), theme)
  drawGates(ctx, map, state, animTime(session))
  drawTowers(ctx, session, ui)
  drawEnemies(ctx, session)
  drawEffects(ctx, session)
  drawAtmosphere(ctx, session, map, theme)
  drawPlacementGhost(ctx, session, ui, map)
  drawBossBar(ctx, state, map)
}

// The room's mood tracks the game's state: slow fog banks drift over the
// field, the world reddens at the edges as the Spire bleeds, and each
// endless Cataclysm era tints the light violet. All overlays are subtle and
// the drifting fog respects reduced motion.
function drawAtmosphere(ctx: CanvasRenderingContext2D, session: GameSession, map: MapDef, theme: MapTheme): void {
  const state = session.state
  const w = map.width * CELL_PX
  const h = map.height * CELL_PX
  const t = animTime(session)

  if (!settings.reducedMotion) {
    for (let i = 0; i < 4; i++) {
      const x = (((i * 251) % 97) / 97) * w + Math.sin(t * 0.004 + i * 1.9) * w * 0.18
      const y = (((i * 173) % 89) / 89) * h + Math.cos(t * 0.003 + i * 2.7) * h * 0.14
      glow(ctx, ((x % w) + w) % w, ((y % h) + h) % h, 130 + (i % 2) * 60, theme.mote, 0.05)
    }
  }

  const hpFrac = state.spireMaxHp > 0 ? state.spireHp / state.spireMaxHp : 0
  if (hpFrac < 0.4) {
    const urgency = 1 - hpFrac / 0.4
    const pulse = settings.reducedMotion ? 1 : 0.85 + 0.15 * Math.sin(t * 0.1)
    const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.6)
    grad.addColorStop(0, 'rgba(219, 75, 75, 0)')
    grad.addColorStop(1, `rgba(219, 75, 75, ${(0.16 * urgency * pulse).toFixed(3)})`)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)
  }

  if (state.cataclysms.length > 0) {
    ctx.fillStyle = `rgba(136, 86, 255, ${Math.min(0.09, state.cataclysms.length * 0.03)})`
    ctx.fillRect(0, 0, w, h)
  }
}

// While a boss walks, it owns a marquee health bar across the top of the
// field — its name, its remaining HP, no squinting at a 3px strip.
function drawBossBar(ctx: CanvasRenderingContext2D, state: RunState, map: MapDef): void {
  const boss = state.enemies.find((e) => e.type.startsWith('boss') && e.hp > 0)
  if (!boss) return
  const w = map.width * CELL_PX
  const barW = Math.min(360, w * 0.5)
  const x = (w - barW) / 2
  const y = 8
  ctx.fillStyle = 'rgba(10, 12, 18, 0.75)'
  ctx.fillRect(x - 8, y - 4, barW + 16, 26)
  ctx.strokeStyle = enemyColor(boss.type)
  ctx.lineWidth = 1
  ctx.strokeRect(x - 8.5, y - 4.5, barW + 17, 27)
  ctx.fillStyle = '#30354a'
  ctx.fillRect(x, y + 10, barW, 7)
  ctx.fillStyle = enemyColor(boss.type)
  ctx.fillRect(x, y + 10, Math.max(2, (barW * boss.hp) / boss.maxHp), 7)
  ctx.font = 'bold 10px ui-monospace, monospace'
  ctx.textAlign = 'center'
  ctx.fillStyle = '#e8ecf5'
  ctx.fillText(`${ENEMIES[boss.type].name.toUpperCase()} — ${boss.hp}/${boss.maxHp}`, w / 2, y + 7)
  ctx.textAlign = 'left'
}

// Animation clock: sim time (ticks) plus the interpolation fraction, so
// walk cycles speed up with fast-forward and freeze on pause.
function animTime(session: GameSession): number {
  return session.state.tick + session.alpha
}

function drawPathHighlight(ctx: CanvasRenderingContext2D, state: RunState, map: MapDef, t0: number, theme: MapTheme): void {
  const field = distanceField(map, blockedGrid(map, state.towers))
  const path = [map.spawn, ...pathFrom(map, field, map.spawn)]

  // A brushed road: two rounded strokes through the cell centers — a soft
  // dark trench with a worn core — instead of hard checkerboard rectangles.
  if (path.length > 1) {
    ctx.save()
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.beginPath()
    path.forEach((c, i) => {
      const p = cellCenter(c)
      if (i === 0) ctx.moveTo(px(p.x), px(p.y))
      else ctx.lineTo(px(p.x), px(p.y))
    })
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.38)'
    ctx.lineWidth = CELL_PX * 0.98
    ctx.stroke()
    ctx.strokeStyle = theme.path
    ctx.lineWidth = CELL_PX * 0.8
    ctx.stroke()
    ctx.restore()
  }

  // Drifting chevrons make the flow direction legible at a glance.
  ctx.strokeStyle = '#2a3248'
  ctx.lineWidth = 1.5
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i]!
    const b = path[i + 1]!
    const pulse = 0.35 + 0.3 * Math.sin(t0 * 0.12 - i * 0.9)
    if (pulse <= 0.12) continue
    const mx = ((a.cx + b.cx) / 2 + 0.5) * CELL_PX
    const my = ((a.cy + b.cy) / 2 + 0.5) * CELL_PX
    const ang = Math.atan2(b.cy - a.cy, b.cx - a.cx)
    ctx.save()
    ctx.translate(mx, my)
    ctx.rotate(ang)
    ctx.globalAlpha = pulse
    ctx.beginPath()
    ctx.moveTo(-3, -5)
    ctx.lineTo(3, 0)
    ctx.lineTo(-3, 5)
    ctx.stroke()
    ctx.restore()
  }
  ctx.globalAlpha = 1
  ctx.lineWidth = 1
}

// Ambient motes: a handful of drifting particles that give each battlefield
// air. Pure function of the animation clock and particle index — no state,
// no RNG, freezes on pause, and sits under towers so it never fights combat
// legibility. Skipped entirely under reduced motion.
function drawAmbient(ctx: CanvasRenderingContext2D, map: MapDef, t: number, theme: MapTheme): void {
  if (settings.reducedMotion) return
  const w = map.width * CELL_PX
  const h = map.height * CELL_PX
  for (let i = 0; i < 26; i++) {
    // Deterministic per-particle constants from cheap integer hashes.
    const ox = ((i * 73) % 97) / 97
    const oy = ((i * 53) % 89) / 89
    const drift = 0.12 + ((i * 37) % 13) / 60
    const x = (ox * w + t * drift + Math.sin(t * 0.015 + i * 1.7) * 8 + w) % w
    const y = (oy * h + Math.sin(t * 0.011 + i * 2.3) * 10 - t * 0.03 * (i % 3) + 4 * h) % h
    const a = 0.16 + 0.12 * Math.sin(t * 0.03 + i * 2.1)
    // Additive glow dots: fireflies and embers actually shine.
    glow(ctx, x, y, 3.5 + (i % 3) * 2, theme.mote, Math.max(0.05, a))
  }
}

function drawGates(ctx: CanvasRenderingContext2D, map: MapDef, state: RunState, t0: number): void {
  // The spawn gate: a swirling portal, arcs counter-rotating around a core.
  const spawn = cellCenter(map.spawn)
  const sx = px(spawn.x)
  const sy = px(spawn.y)
  // The portal casts violet light on the ground around it.
  glow(ctx, sx, sy, CELL_PX * (1.5 + 0.15 * Math.sin(t0 * 0.05)), COLORS.spawn, 0.5)
  ctx.fillStyle = COLORS.spawn
  circle(ctx, sx, sy, CELL_PX * 0.28)
  ctx.fill()
  glow(ctx, sx, sy, CELL_PX * 0.5, '#c0a0ff', 0.8)
  ctx.strokeStyle = COLORS.spawn
  ctx.lineWidth = 2
  for (const [dir, r, span] of [
    [1, 0.4, 1.8],
    [-1, 0.5, 1.2],
  ] as const) {
    const a = t0 * 0.04 * dir
    ctx.globalAlpha = 0.7
    ctx.beginPath()
    ctx.arc(sx, sy, CELL_PX * r, a, a + span)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  ctx.lineWidth = 1

  // The Spire: a crystal whose glow breathes and fades with its HP, with a
  // guardian mote orbiting while it still stands strong.
  const spire = cellCenter(map.spire)
  const cx = px(spire.x)
  const cy = px(spire.y)
  const r = CELL_PX * 0.46
  const hpFrac = state.spireMaxHp > 0 ? state.spireHp / state.spireMaxHp : 0
  const breathe = 1 + 0.05 * Math.sin(t0 * 0.07)
  // The Spire lights its surroundings; the pool of light shrinks as it dies.
  glow(ctx, cx, cy, CELL_PX * (1.1 + 1.5 * hpFrac) * breathe, COLORS.spire, 0.35 + 0.4 * hpFrac)
  ctx.fillStyle = COLORS.spire
  ctx.beginPath()
  ctx.moveTo(cx, cy - r * breathe)
  ctx.lineTo(cx + r * 0.7, cy)
  ctx.lineTo(cx, cy + r * breathe)
  ctx.lineTo(cx - r * 0.7, cy)
  ctx.closePath()
  ctx.fill()
  glow(ctx, cx, cy, r * breathe, '#fff2cc', 0.5 + 0.3 * hpFrac)
  // Inner facet.
  ctx.fillStyle = '#8a6a2a'
  ctx.beginPath()
  ctx.moveTo(cx, cy - r * 0.5)
  ctx.lineTo(cx + r * 0.32, cy)
  ctx.lineTo(cx, cy + r * 0.5)
  ctx.lineTo(cx - r * 0.32, cy)
  ctx.closePath()
  ctx.fill()
  // Bulwark: a hard golden shell while the sigil burns.
  if (state.bulwarkTicks > 0) {
    ctx.strokeStyle = '#e5c07b'
    ctx.lineWidth = 3
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t0 * 0.3)
    circle(ctx, cx, cy, r * 1.35)
    ctx.stroke()
    ctx.globalAlpha = 1
    ctx.lineWidth = 1
  }
  if (hpFrac > 0.3) {
    const a = t0 * 0.06
    ctx.fillStyle = '#7dcfff'
    circle(ctx, cx + Math.cos(a) * r * 1.1, cy + Math.sin(a) * r * 0.7, 2)
    ctx.fill()
  }
}

// Each tower type has its own silhouette; attacking turrets rotate to face
// their last target (session.aim, fed by tower_fired events).
function drawTowers(ctx: CanvasRenderingContext2D, session: GameSession, ui: RenderUiState): void {
  const state = session.state
  const t0 = animTime(session)
  const wallNowTowers = performance.now()
  for (const t of state.towers) {
    const gx = t.cell.cx * CELL_PX
    const gy = t.cell.cy * CELL_PX
    const cx = gx + CELL_PX / 2
    const cy = gy + CELL_PX / 2
    const color = COLORS.towers[t.type]
    const aim = session.aim[t.id] ?? -Math.PI / 2
    // Tiers read as size: the whole tower grows a little per tier.
    const s = 0.95 + t.tier * 0.1

    // Shared base plate, edged in the tower's color so types read at a
    // glance — tier 3 earns a bright edge, enhancements make it burn.
    ctx.fillStyle = '#141a28'
    roundRect(ctx, gx + 4.5, gy + 4.5, CELL_PX - 9, CELL_PX - 9, 5)
    ctx.fill()
    ctx.save()
    ctx.globalAlpha = t.tier >= 3 ? 0.95 : 0.55
    ctx.strokeStyle = color
    ctx.lineWidth = t.tier >= 3 ? 1.5 : 1
    ctx.stroke()
    ctx.restore()
    if (t.enhance > 0) {
      glow(ctx, cx, cy, CELL_PX * 0.55, color, Math.min(0.5, 0.12 + t.enhance * 0.07))
    }
    // Tier ≥ 2 wears corner studs on the plate.
    if (t.tier >= 2) {
      ctx.fillStyle = color
      for (const [ox, oy] of [
        [7, 7],
        [CELL_PX - 9, 7],
        [7, CELL_PX - 9],
        [CELL_PX - 9, CELL_PX - 9],
      ] as const) {
        ctx.fillRect(gx + ox, gy + oy, 2, 2)
      }
    }

    // Recoil: attackers kick back along their aim for a blink after firing.
    const firedAge = wallNowTowers - (session.firedAt.get(t.id) ?? -1e9)
    const recoil =
      !settings.reducedMotion && firedAge < 130 && (t.type === 'arrow' || t.type === 'cannon' || t.type === 'sniper')
        ? 3 * (1 - firedAge / 130)
        : 0

    ctx.save()
    ctx.translate(cx - Math.cos(aim) * recoil, cy - Math.sin(aim) * recoil)
    ctx.scale(s, s)
    switch (t.type) {
      case 'arrow': {
        // Round pedestal, rotating arrowhead + bowstring.
        ctx.fillStyle = '#1f2a1e'
        circle(ctx, 0, 0, 8)
        ctx.fill()
        ctx.rotate(aim)
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.beginPath() // bow
        ctx.arc(0, 0, 6.5, -Math.PI / 3, Math.PI / 3)
        ctx.stroke()
        ctx.fillStyle = color
        ctx.beginPath() // arrowhead
        ctx.moveTo(10, 0)
        ctx.lineTo(2, -4)
        ctx.lineTo(4, 0)
        ctx.lineTo(2, 4)
        ctx.closePath()
        ctx.fill()
        break
      }
      case 'cannon': {
        ctx.rotate(aim)
        ctx.fillStyle = '#33281a'
        circle(ctx, 0, 0, 8)
        ctx.fill()
        ctx.fillStyle = color
        ctx.fillRect(0, -3, 12, 6) // barrel
        ctx.fillStyle = '#7a5a2a'
        ctx.fillRect(10, -3.5, 3, 7) // muzzle band
        circle(ctx, 0, 0, 5.5)
        ctx.fillStyle = color
        ctx.fill()
        break
      }
      case 'frost': {
        // Crystal: a pulsing hexagon with an inner snowflake.
        const pulse = 0.75 + 0.25 * Math.sin(t0 * 0.12 + t.id)
        glow(ctx, 0, 0, 10, color, 0.35 * pulse)
        ctx.strokeStyle = color
        ctx.fillStyle = 'rgba(125, 207, 255, 0.18)'
        ctx.lineWidth = 1.5
        polygon(ctx, 0, 0, 9, 6, t0 * 0.01)
        ctx.fill()
        ctx.stroke()
        ctx.globalAlpha = pulse
        ctx.beginPath()
        for (let i = 0; i < 3; i++) {
          const a = (i * Math.PI) / 3
          ctx.moveTo(-Math.cos(a) * 6, -Math.sin(a) * 6)
          ctx.lineTo(Math.cos(a) * 6, Math.sin(a) * 6)
        }
        ctx.stroke()
        ctx.globalAlpha = 1
        break
      }
      case 'tesla': {
        // Coil rod with a crackling orb.
        ctx.fillStyle = '#241a33'
        circle(ctx, 0, 3, 7)
        ctx.fill()
        ctx.fillStyle = '#4a3a6a'
        ctx.fillRect(-2.5, -4, 5, 9) // rod
        ctx.strokeStyle = '#6a548c'
        ctx.beginPath() // windings
        ctx.moveTo(-3, -1)
        ctx.lineTo(3, -1)
        ctx.moveTo(-3, 2)
        ctx.lineTo(3, 2)
        ctx.stroke()
        ctx.fillStyle = color
        circle(ctx, 0, -7, 4)
        ctx.fill()
        glow(ctx, 0, -7, 8, color, 0.5 + 0.3 * Math.abs(Math.sin(t0 * 0.1 + t.id)))
        // Idle spark, flickering around the orb.
        const sparkA = t0 * 0.31 + t.id * 2.1
        ctx.strokeStyle = '#e0d0ff'
        ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t0 * 0.23 + t.id))
        ctx.beginPath()
        ctx.moveTo(Math.cos(sparkA) * 4, -7 + Math.sin(sparkA) * 4)
        ctx.lineTo(Math.cos(sparkA) * 7.5, -7 + Math.sin(sparkA) * 7.5)
        ctx.stroke()
        ctx.globalAlpha = 1
        break
      }
      case 'sniper': {
        // Long rifle on a tripod — unmistakable reach.
        ctx.strokeStyle = '#3a5a52'
        ctx.lineWidth = 2
        ctx.beginPath() // tripod
        for (let i = 0; i < 3; i++) {
          const a = aim + Math.PI / 2 + (i * 2 * Math.PI) / 3
          ctx.moveTo(0, 0)
          ctx.lineTo(Math.cos(a) * 7, Math.sin(a) * 7)
        }
        ctx.stroke()
        ctx.rotate(aim)
        ctx.fillStyle = color
        ctx.fillRect(-4, -1.5, 18, 3) // barrel
        ctx.fillRect(11, -2.5, 3, 5) // muzzle brake
        ctx.fillStyle = '#0b0e14'
        circle(ctx, 2, 0, 2) // scope
        ctx.fill()
        ctx.strokeStyle = color
        ctx.lineWidth = 1
        circle(ctx, 2, 0, 2.8)
        ctx.stroke()
        break
      }
      case 'beacon': {
        // A pylon with a rotating amplification halo.
        ctx.fillStyle = '#33251a'
        circle(ctx, 0, 2, 6)
        ctx.fill()
        ctx.fillStyle = color
        ctx.fillRect(-2, -8, 4, 11)
        circle(ctx, 0, -8, 3)
        ctx.fill()
        glow(ctx, 0, -8, 7, color, 0.55 + 0.25 * Math.sin(t0 * 0.08 + t.id))
        const halo = t0 * 0.05 + t.id
        ctx.strokeStyle = color
        ctx.globalAlpha = 0.55
        ctx.beginPath()
        ctx.arc(0, 0, 11, halo, halo + 2.1)
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(0, 0, 11, halo + Math.PI, halo + Math.PI + 2.1)
        ctx.stroke()
        ctx.globalAlpha = 1
        break
      }
      case 'mint': {
        // A stack of coins.
        ctx.fillStyle = '#8a6a2a'
        ellipse(ctx, 0, 3, 8, 4)
        ctx.fill()
        ctx.fillStyle = '#b08a3a'
        ellipse(ctx, 0, 0, 8, 4)
        ctx.fill()
        ctx.fillStyle = color
        ellipse(ctx, 0, -3, 8, 4)
        ctx.fill()
        ctx.strokeStyle = '#8a6a2a'
        ctx.lineWidth = 1
        ellipse(ctx, 0, -3, 8, 4)
        ctx.stroke()
        ctx.fillStyle = '#8a6a2a'
        ctx.font = 'bold 7px ui-monospace, monospace'
        ctx.textAlign = 'center'
        ctx.fillText('¤', 0, -1)
        ctx.textAlign = 'left'
        break
      }
    }
    ctx.restore()

    // Tier pips + enhancement badge, on top of everything.
    ctx.fillStyle = color
    for (let i = 0; i < t.tier; i++) ctx.fillRect(gx + 7 + i * 5, gy + CELL_PX - 9, 3, 3)
    if (t.enhance > 0) {
      ctx.font = 'bold 9px ui-monospace, monospace'
      ctx.textAlign = 'right'
      ctx.fillStyle = '#ffffff'
      ctx.fillText(`+${t.enhance}`, gx + CELL_PX - 4, gy + 12)
      ctx.textAlign = 'left'
    }

    if (ui.selectedTowerId === t.id) {
      const def = towerTier(t.type, t.tier)
      const center = cellCenter(t.cell)
      ctx.fillStyle = COLORS.range
      ctx.strokeStyle = COLORS.rangeEdge
      ctx.beginPath()
      ctx.arc(px(center.x), px(center.y), px(def.range), 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
    ctx.lineWidth = 1
  }
}

// --- small path helpers -----------------------------------------------------

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0): void {
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2)
}

function polygon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, sides: number, rot = 0): void {
  ctx.beginPath()
  for (let i = 0; i <= sides; i++) {
    const a = rot + (i * 2 * Math.PI) / sides
    if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
    else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
  }
  ctx.closePath()
}

function roundRect(
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

// Enemies are little creatures now: bodies orient along their movement
// heading and animate with sim-time walk cycles (frozen on pause, faster on
// fast-forward), each offset by id so packs don't march in lockstep.
function drawEnemies(ctx: CanvasRenderingContext2D, session: GameSession): void {
  const t0 = animTime(session)
  const alpha = session.alpha
  const prevById = new Map<number, Enemy>()
  for (const p of session.prev.enemies) prevById.set(p.id, p)
  if (headings.size > 600) headings.clear()
  if (firstSeen.size > 600) firstSeen.clear()
  const wallNow = performance.now()

  for (const e of session.state.enemies) {
    const prev = prevById.get(e.id)
    const pos: Vec = prev
      ? { x: prev.pos.x + (e.pos.x - prev.pos.x) * alpha, y: prev.pos.y + (e.pos.y - prev.pos.y) * alpha }
      : e.pos
    if (prev) {
      const dx = e.pos.x - prev.pos.x
      const dy = e.pos.y - prev.pos.y
      if (dx !== 0 || dy !== 0) headings.set(e.id, Math.atan2(dy, dx))
    }
    const heading = headings.get(e.id) ?? 0
    const x = px(pos.x)
    const y = px(pos.y)
    const r = ENEMY_RADIUS[e.type] ?? 8
    const color = enemyColor(e.type)
    // Walk phase scales with the creature's own speed so slows visibly
    // drag the gait too.
    const gait = e.slowTicks > 0 ? e.slowFactor / 100 : 1
    const phase = t0 * 0.22 * gait * (e.speed / 100) + e.id * 1.7

    // Spawn pop-in: new arrivals scale up with a little overshoot.
    if (!firstSeen.has(e.id)) firstSeen.set(e.id, wallNow)
    const popAge = (wallNow - firstSeen.get(e.id)!) / 220
    const pop = popAge < 1 && !settings.reducedMotion ? 0.4 + 0.6 * easeOutBack(popAge) : 1

    // Ground shadow anchors every walker to the field (fliers draw their own,
    // smaller and offset; phased wraiths cast none — nothing there to cast it).
    if (e.type !== 'flier' && !(e.type === 'wraith' && e.phased)) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.32)'
      ellipse(ctx, x, y + r * 0.55, r * 0.95 * pop, r * 0.32 * pop)
      ctx.fill()
    }

    ctx.save()
    ctx.translate(x, y)
    ctx.scale(pop, pop)
    switch (e.type) {
      case 'runner':
        drawLegs(ctx, heading, r, phase, color)
        drawCritter(ctx, heading, r, phase, color)
        break
      case 'swarmling':
      case 'splitling': {
        // Small skitterers: quick lateral wiggle + antennae.
        const wiggle = Math.sin(phase * 2.3) * 1.5
        ctx.rotate(heading)
        ctx.translate(0, wiggle)
        ctx.fillStyle = color
        ellipse(ctx, 0, 0, r * 1.15, r * 0.85)
        ctx.fill()
        ctx.strokeStyle = color
        ctx.beginPath()
        ctx.moveTo(r * 0.8, -1)
        ctx.lineTo(r * 1.7, -3 + Math.sin(phase * 2.3) * 1)
        ctx.moveTo(r * 0.8, 1)
        ctx.lineTo(r * 1.7, 3 + Math.cos(phase * 2.3) * 1)
        ctx.stroke()
        break
      }
      case 'brute': {
        // Heavy stomper: squash-and-stretch on a slow cycle, shoulder plates.
        const stomp = 1 + 0.07 * Math.sin(phase * 0.7)
        ctx.rotate(heading)
        ctx.scale(stomp, 2 - stomp)
        ctx.fillStyle = color
        roundRect(ctx, -r, -r * 0.85, r * 2, r * 1.7, 4)
        ctx.fill()
        ctx.fillStyle = '#7a2a2a'
        ctx.fillRect(-r * 0.7, -r * 0.85, r * 0.5, r * 1.7) // back plate
        ctx.fillStyle = '#0b0e14'
        ctx.fillRect(r * 0.35, -r * 0.4, r * 0.35, r * 0.8) // visor
        break
      }
      case 'shieldbearer': {
        ctx.rotate(heading)
        const sway = Math.sin(phase) * 0.08
        ctx.rotate(sway)
        ctx.fillStyle = color
        circle(ctx, 0, 0, r * 0.85)
        ctx.fill()
        // The shield itself: a thick arc held toward the direction of travel.
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(0, 0, r + 1.5, -Math.PI / 2.6, Math.PI / 2.6)
        ctx.stroke()
        ctx.lineWidth = 1
        break
      }
      case 'flier': {
        // Airborne: bobbing body, flapping wings, shadow on the ground below.
        const flap = Math.sin(phase * 3.1)
        const hover = Math.sin(phase * 0.9) * 1.5
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'
        ellipse(ctx, 2, 6, r * 0.9, r * 0.35) // ground shadow
        ctx.fill()
        ctx.translate(0, hover - 2)
        ctx.rotate(heading)
        ctx.fillStyle = color
        for (const side of [-1, 1]) {
          ctx.beginPath() // wings
          ctx.moveTo(-r * 0.2, 0)
          ctx.lineTo(-r * 0.9, side * r * (0.9 + 0.55 * flap))
          ctx.lineTo(r * 0.25, side * r * 0.3)
          ctx.closePath()
          ctx.fill()
        }
        ellipse(ctx, 0, 0, r * 1.05, r * 0.5)
        ctx.fill()
        ctx.fillStyle = '#0b0e14'
        circle(ctx, r * 0.55, 0, 1.4) // eye
        ctx.fill()
        break
      }
      case 'healer': {
        // Robed mender: slow glide, pulsing halo.
        const pulse = (t0 * 0.05 + e.id) % 1
        ctx.strokeStyle = color
        ctx.globalAlpha = 0.5 * (1 - pulse)
        circle(ctx, 0, 0, r + 2 + pulse * 6)
        ctx.stroke()
        ctx.globalAlpha = 1
        ctx.rotate(heading)
        ctx.fillStyle = color
        ellipse(ctx, 0, 0, r * 1.05, r * 0.9)
        ctx.fill()
        ctx.rotate(-heading)
        ctx.fillStyle = '#0b0e14'
        ctx.fillRect(-1.5, -5, 3, 10)
        ctx.fillRect(-5, -1.5, 10, 3)
        break
      }
      case 'splitter': {
        // A blob barely holding together: two cores jiggling inside.
        const jiggle = Math.sin(phase * 1.6) * r * 0.22
        ctx.rotate(heading)
        ctx.fillStyle = color
        ellipse(ctx, 0, 0, r * (1.05 + 0.06 * Math.sin(phase)), r * (0.95 - 0.06 * Math.sin(phase)))
        ctx.fill()
        ctx.fillStyle = enemyColor('splitling')
        circle(ctx, -r * 0.35, jiggle, r * 0.32)
        ctx.fill()
        circle(ctx, r * 0.35, -jiggle, r * 0.32)
        ctx.fill()
        break
      }
      case 'wraith': {
        // A ghost: wispy body with a trailing tail, translucent while phased.
        const wisp = Math.sin(phase * 1.4)
        ctx.globalAlpha = e.phased ? 0.3 : 0.9
        ctx.rotate(heading)
        ctx.fillStyle = color
        ellipse(ctx, 0, 0, r * 1.1, r * 0.7)
        ctx.fill()
        ctx.beginPath() // tail
        ctx.moveTo(-r * 0.6, 0)
        ctx.quadraticCurveTo(-r * 1.6, wisp * r * 0.6, -r * 2.1, wisp * r * 0.2)
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.lineWidth = 1
        ctx.fillStyle = '#0b0e14'
        circle(ctx, r * 0.5, 0, 1.5)
        ctx.fill()
        ctx.globalAlpha = 1
        break
      }
      case 'carrier': {
        // Broodmother: a swollen sac-laden body; the sacs swell as the next
        // brood nears hatching.
        const hatch = 1 - e.broodCooldown / (ENEMIES[e.type].brood?.everyTicks ?? 90)
        ctx.rotate(heading)
        ctx.fillStyle = color
        ellipse(ctx, 0, 0, r * 1.15, r * 0.9)
        ctx.fill()
        ctx.fillStyle = enemyColor('swarmling')
        for (const [ox, oy] of [
          [-r * 0.45, -r * 0.3],
          [-r * 0.1, r * 0.35],
          [r * 0.4, -r * 0.15],
        ] as const) {
          circle(ctx, ox, oy, r * (0.18 + 0.14 * Math.max(0, Math.min(1, hatch))))
          ctx.fill()
        }
        ctx.fillStyle = '#0b0e14'
        circle(ctx, r * 0.8, 0, 1.8)
        ctx.fill()
        break
      }
      case 'boss':
      case 'boss2':
      case 'boss3': {
        // The Spirebreaker: rotating spike crown, breathing core, aura.
        const breathe = 1 + 0.05 * Math.sin(phase * 0.5)
        ctx.strokeStyle = color
        ctx.globalAlpha = 0.35
        circle(ctx, 0, 0, r + 5 + Math.sin(t0 * 0.08) * 2)
        ctx.stroke()
        ctx.globalAlpha = 1
        ctx.fillStyle = color
        const spin = t0 * 0.02
        for (let i = 0; i < 6; i++) {
          const a = spin + (i * Math.PI) / 3
          ctx.beginPath()
          ctx.moveTo(Math.cos(a - 0.22) * r * 0.8, Math.sin(a - 0.22) * r * 0.8)
          ctx.lineTo(Math.cos(a) * (r + 5), Math.sin(a) * (r + 5))
          ctx.lineTo(Math.cos(a + 0.22) * r * 0.8, Math.sin(a + 0.22) * r * 0.8)
          ctx.closePath()
          ctx.fill()
        }
        circle(ctx, 0, 0, r * 0.85 * breathe)
        ctx.fill()
        ctx.fillStyle = '#4a0024'
        circle(ctx, 0, 0, r * 0.45 * breathe)
        ctx.fill()
        break
      }
      default:
        drawLegs(ctx, heading, r, phase, color)
        drawCritter(ctx, heading, r, phase, color)
        break
    }
    ctx.restore()

    if (e.slowTicks > 0) {
      ctx.strokeStyle = COLORS.towers.frost
      ctx.beginPath()
      ctx.arc(x, y, r + 3, 0, Math.PI * 2)
      ctx.stroke()
    }
    // Fresh hits flash the body white for a blink.
    const hitAt = session.hits.get(e.id)
    if (hitAt !== undefined) {
      const hitAge = (performance.now() - hitAt) / 110
      if (hitAge < 1) {
        ctx.fillStyle = '#ffffff'
        ctx.globalAlpha = 0.55 * (1 - hitAge)
        circle(ctx, x, y, r)
        ctx.fill()
        ctx.globalAlpha = 1
      }
    }
    // Defense stats are worn openly: ⛨N = shield (hits ≤ N bounce),
    // ▣N = armor (every hit loses N, min 1 lands).
    if (e.shield > 0 || e.armor > 0) {
      ctx.font = 'bold 8px ui-monospace, monospace'
      ctx.textAlign = 'center'
      const parts: string[] = []
      if (e.shield > 0) parts.push(`⛨${e.shield}`)
      if (e.armor > 0) parts.push(`▣${e.armor}`)
      ctx.fillStyle = e.shield > 0 ? '#c0caf5' : '#a8b0c8'
      ctx.fillText(parts.join(' '), x, y + r + 9)
      ctx.textAlign = 'left'
    }
    // HP bar: color tells the story at a glance — green, amber, then red.
    if (e.hp < e.maxHp) {
      const bw = r * 2
      const frac = e.hp / e.maxHp
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
      ctx.fillRect(x - r - 0.5, y - r - 6.5, bw + 1, 4)
      ctx.fillStyle = COLORS.hpBack
      ctx.fillRect(x - r, y - r - 6, bw, 3)
      ctx.fillStyle = frac > 0.5 ? COLORS.hpFill : frac > 0.25 ? '#e0af68' : '#db4b4b'
      ctx.fillRect(x - r, y - r - 6, bw * frac, 3)
    }
  }
}

// Four scissoring legs, drawn under the body. Assumes ctx is at the enemy
// center, unrotated.
function drawLegs(ctx: CanvasRenderingContext2D, heading: number, r: number, phase: number, color: string): void {
  ctx.save()
  ctx.rotate(heading)
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.beginPath()
  const swing = Math.sin(phase * 2)
  for (const [ox, side, dir] of [
    [r * 0.45, 1, 1],
    [r * 0.45, -1, -1],
    [-r * 0.45, 1, -1],
    [-r * 0.45, -1, 1],
  ] as const) {
    ctx.moveTo(ox, side * r * 0.4)
    ctx.lineTo(ox + dir * swing * r * 0.5, side * (r * 0.4 + r * 0.55))
  }
  ctx.stroke()
  ctx.lineWidth = 1
  ctx.restore()
}

// The default body: an ellipse along the heading with a bobbing gait and a
// forward eye. Assumes ctx is at the enemy center, unrotated.
function drawCritter(ctx: CanvasRenderingContext2D, heading: number, r: number, phase: number, color: string): void {
  ctx.save()
  ctx.rotate(heading)
  const bob = 1 + 0.08 * Math.sin(phase * 2)
  ctx.fillStyle = color
  ellipse(ctx, 0, 0, r * 1.2, r * 0.75 * bob)
  ctx.fill()
  ctx.fillStyle = '#0b0e14'
  circle(ctx, r * 0.65, 0, 1.6)
  ctx.fill()
  ctx.restore()
}

function drawEffects(ctx: CanvasRenderingContext2D, session: GameSession): void {
  const now = performance.now()
  for (const fx of session.effects) {
    const age = (now - fx.t0) / fx.dur
    if (age > 1 || age < 0) continue // future-scheduled effects wait their turn
    const fade = 1 - age
    switch (fx.kind) {
      case 'beam': {
        if (!fx.from || !fx.to) break
        ctx.strokeStyle = fx.color ?? '#ffffff'
        ctx.globalAlpha = fade
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(px(fx.from.x), px(fx.from.y))
        ctx.lineTo(px(fx.to.x), px(fx.to.y))
        ctx.stroke()
        break
      }
      case 'shell': {
        // A cannonball lobbed along a shallow arc, trailing smoke.
        if (!fx.from || !fx.to) break
        const x = px(fx.from.x + (fx.to.x - fx.from.x) * age)
        const y = px(fx.from.y + (fx.to.y - fx.from.y) * age) - Math.sin(age * Math.PI) * 10
        for (let i = 1; i <= 3; i++) {
          const ta = age - i * 0.09
          if (ta <= 0) continue
          const sx2 = px(fx.from.x + (fx.to.x - fx.from.x) * ta)
          const sy2 = px(fx.from.y + (fx.to.y - fx.from.y) * ta) - Math.sin(ta * Math.PI) * 10
          ctx.fillStyle = '#9a938a'
          ctx.globalAlpha = 0.22 * (1 - i / 3.5) * fade
          circle(ctx, sx2, sy2, 2.5 + i * 1.1)
          ctx.fill()
        }
        ctx.globalAlpha = 1
        glow(ctx, x, y, fx.crit ? 12 : 8, COLORS.towers.cannon, 0.55)
        ctx.fillStyle = fx.crit ? '#ffffff' : '#2c2418'
        circle(ctx, x, y, fx.crit ? 4.5 : 3.5)
        ctx.fill()
        ctx.strokeStyle = COLORS.towers.cannon
        ctx.lineWidth = 1.5
        circle(ctx, x, y, fx.crit ? 4.5 : 3.5)
        ctx.stroke()
        ctx.lineWidth = 1
        break
      }
      case 'tracer': {
        // Sniper round: hot line that collapses toward the target, slug at the tip.
        if (!fx.from || !fx.to) break
        const tipX = px(fx.from.x + (fx.to.x - fx.from.x) * Math.min(1, age * 2))
        const tipY = px(fx.from.y + (fx.to.y - fx.from.y) * Math.min(1, age * 2))
        ctx.strokeStyle = fx.color ?? '#73daca'
        ctx.globalAlpha = fade
        ctx.lineWidth = fx.crit ? 2.5 : 1.5
        ctx.beginPath()
        ctx.moveTo(px(fx.from.x), px(fx.from.y))
        ctx.lineTo(tipX, tipY)
        ctx.stroke()
        ctx.globalAlpha = 1
        glow(ctx, tipX, tipY, fx.crit ? 10 : 7, fx.color ?? '#73daca', fade)
        ctx.fillStyle = '#ffffff'
        ctx.globalAlpha = fade
        circle(ctx, tipX, tipY, fx.crit ? 3 : 2)
        ctx.fill()
        ctx.lineWidth = 1
        break
      }
      case 'bolt': {
        // Arrow bolt: a short dart racing the whole distance in one blink.
        if (!fx.from || !fx.to) break
        const bx = fx.from.x + (fx.to.x - fx.from.x) * age
        const by = fx.from.y + (fx.to.y - fx.from.y) * age
        const angle = Math.atan2(fx.to.y - fx.from.y, fx.to.x - fx.from.x)
        ctx.save()
        ctx.translate(px(bx), px(by))
        ctx.rotate(angle)
        ctx.strokeStyle = fx.color ?? COLORS.towers.arrow
        ctx.lineWidth = fx.crit ? 2.5 : 1.5
        ctx.beginPath()
        ctx.moveTo(-5, 0)
        ctx.lineTo(3, 0)
        ctx.stroke()
        ctx.fillStyle = fx.color ?? COLORS.towers.arrow
        ctx.beginPath()
        ctx.moveTo(5, 0)
        ctx.lineTo(1, -2)
        ctx.lineTo(1, 2)
        ctx.closePath()
        ctx.fill()
        glow(ctx, 3, 0, 6, fx.color ?? COLORS.towers.arrow, 0.5)
        ctx.restore()
        ctx.lineWidth = 1
        break
      }
      case 'arc': {
        // Tesla lightning: a jagged 3-segment arc that flickers as it fades.
        if (!fx.from || !fx.to) break
        const fxp = { x: px(fx.from.x), y: px(fx.from.y) }
        const txp = { x: px(fx.to.x), y: px(fx.to.y) }
        const dx = txp.x - fxp.x
        const dy = txp.y - fxp.y
        const len = Math.max(1, Math.hypot(dx, dy))
        const nx = -dy / len
        const ny = dx / len
        // Two-pass additive lightning: a wide soft haze under a hot core.
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        for (const [width, color, a] of [
          [fx.crit ? 7 : 5, fx.color ?? COLORS.towers.tesla, fade * 0.35],
          [fx.crit ? 3 : 2, '#e8ddff', fade],
        ] as const) {
          ctx.strokeStyle = color
          ctx.globalAlpha = a
          ctx.lineWidth = width
          ctx.beginPath()
          ctx.moveTo(fxp.x, fxp.y)
          for (const [t, wobble] of [
            [0.3, 7],
            [0.55, -6],
            [0.8, 5],
          ] as const) {
            const jitter = Math.sin(fx.t0 * 13 + t * 40) * 2
            ctx.lineTo(fxp.x + dx * t + nx * (wobble + jitter), fxp.y + dy * t + ny * (wobble + jitter))
          }
          ctx.lineTo(txp.x, txp.y)
          ctx.stroke()
        }
        ctx.restore()
        glow(ctx, txp.x, txp.y, 9, fx.color ?? COLORS.towers.tesla, fade * 0.8)
        ctx.lineWidth = 1
        break
      }
      case 'flash': {
        // Muzzle flash: a hot additive pop at the firing tower.
        if (!fx.at) break
        glow(ctx, px(fx.at.x), px(fx.at.y), 6 + (1 - fade) * 9, fx.color ?? '#ffffff', fade * 0.9)
        break
      }
      case 'splash': {
        if (!fx.at) break
        ctx.strokeStyle = COLORS.towers.cannon
        ctx.globalAlpha = fade
        ctx.beginPath()
        ctx.arc(px(fx.at.x), px(fx.at.y), px(900) * age + 4, 0, Math.PI * 2)
        ctx.stroke()
        break
      }
      case 'meteor': {
        if (!fx.at) break
        const mx = px(fx.at.x)
        const my = px(fx.at.y)
        ctx.fillStyle = '#ff5f3c'
        ctx.globalAlpha = fade * 0.5
        ctx.beginPath()
        ctx.arc(mx, my, px(ABILITIES.meteor.radius) * Math.min(1, age * 2), 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
        glow(ctx, mx, my, px(ABILITIES.meteor.radius) * 0.9, '#ff7a3c', fade * 0.9)
        glow(ctx, mx, my, px(ABILITIES.meteor.radius) * 0.4, '#ffd9a0', fade)
        break
      }
      case 'nova': {
        if (!fx.at) break
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        ctx.strokeStyle = COLORS.towers.frost
        ctx.globalAlpha = fade
        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.arc(px(fx.at.x), px(fx.at.y), px(ABILITIES.frost_nova.radius) * age, 0, Math.PI * 2)
        ctx.stroke()
        ctx.strokeStyle = '#eaf7ff'
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.restore()
        ctx.lineWidth = 1
        break
      }
      case 'float': {
        if (!fx.at || !fx.text) break
        ctx.font = 'bold 12px ui-monospace, monospace'
        ctx.textAlign = 'center'
        ctx.fillStyle = fx.color ?? '#ffffff'
        ctx.globalAlpha = fade
        ctx.fillText(fx.text, px(fx.at.x), px(fx.at.y) - 14 - age * 16)
        ctx.textAlign = 'left'
        break
      }
      case 'heal': {
        if (!fx.at) break
        ctx.strokeStyle = '#9ece6a'
        ctx.globalAlpha = fade * 0.7
        ctx.beginPath()
        ctx.arc(px(fx.at.x), px(fx.at.y), px(1800) * age, 0, Math.PI * 2)
        ctx.stroke()
        break
      }
      case 'death': {
        if (!fx.at) break
        ctx.strokeStyle = '#ffd76e'
        ctx.globalAlpha = fade
        ctx.beginPath()
        ctx.arc(px(fx.at.x), px(fx.at.y), 4 + age * 10, 0, Math.PI * 2)
        ctx.stroke()
        break
      }
      case 'burst': {
        // Shards flying outward from a kill, colored like the fallen, over a
        // brief additive pop of light.
        if (!fx.at) break
        glow(ctx, px(fx.at.x), px(fx.at.y), 5 + age * 10, fx.color ?? '#ffd76e', fade * 0.7)
        ctx.fillStyle = fx.color ?? '#ffd76e'
        ctx.globalAlpha = fade
        const spin = fx.t0 % (Math.PI * 2)
        for (let i = 0; i < 5; i++) {
          const a = spin + (i * Math.PI * 2) / 5
          const d = 3 + age * 14
          circle(ctx, px(fx.at.x) + Math.cos(a) * d, px(fx.at.y) + Math.sin(a) * d, Math.max(0.5, 2.4 * fade))
          ctx.fill()
        }
        break
      }
      case 'spire_hit': {
        if (settings.reducedMotion) break // no full-screen flashes
        ctx.fillStyle = '#db4b4b'
        ctx.globalAlpha = fade * 0.25
        const map = getMap(session.state.mapId)
        ctx.fillRect(0, 0, map.width * CELL_PX, map.height * CELL_PX)
        break
      }
      case 'gold_rush': {
        if (settings.reducedMotion) break // no full-screen flashes
        ctx.fillStyle = '#ffd76e'
        ctx.globalAlpha = fade * 0.15
        const map = getMap(session.state.mapId)
        ctx.fillRect(0, 0, map.width * CELL_PX, map.height * CELL_PX)
        break
      }
    }
    ctx.globalAlpha = 1
  }
}

function drawPlacementGhost(
  ctx: CanvasRenderingContext2D,
  session: GameSession,
  ui: RenderUiState,
  map: MapDef,
): void {
  if (!ui.hoverCell) return
  const c = ui.hoverCell

  if (ui.shopSelection) {
    // Full engine-side validation, including "would this wall off the spire".
    const ok = canPlaceTower(session.state, map, c).ok
    ctx.fillStyle = ok ? COLORS.ghostOk : COLORS.ghostBad
    ctx.fillRect(c.cx * CELL_PX, c.cy * CELL_PX, CELL_PX, CELL_PX)
    const def = towerTier(ui.shopSelection, 1)
    const center = cellCenter(c)
    ctx.strokeStyle = COLORS.rangeEdge
    ctx.beginPath()
    ctx.arc(px(center.x), px(center.y), px(def.range), 0, Math.PI * 2)
    ctx.stroke()

    // Preview how enemies would re-route around the new tower BEFORE buying:
    // amber dots trace the would-be path.
    if (ok) {
      const field = distanceField(map, blockedGrid(map, session.state.towers, c))
      const preview = [map.spawn, ...pathFrom(map, field, map.spawn)]
      ctx.fillStyle = 'rgba(229, 192, 123, 0.8)'
      for (const cell of preview) {
        const p = cellCenter(cell)
        ctx.beginPath()
        ctx.arc(px(p.x), px(p.y), 2.5, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  if (ui.abilitySelection && ui.abilitySelection !== 'gold_rush') {
    const def = ABILITIES[ui.abilitySelection]
    const center = cellCenter(c)
    ctx.fillStyle = 'rgba(255, 95, 60, 0.15)'
    ctx.strokeStyle = 'rgba(255, 95, 60, 0.5)'
    ctx.beginPath()
    ctx.arc(px(center.x), px(center.y), px(def.radius), 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
}

// ---------------------------------------------------------------------------
// Touch placement reticle: on phones the board is CSS-downscaled far below
// its logical size (a cell can be ~16 screen px), so the finger hides the
// exact cell it's aiming at. While a touch drag is aiming a placement, a
// magnified loupe of the area around the target cell floats above the
// finger — see exactly where the ghost sits BEFORE letting go.

export interface TouchAim {
  x: number // logical canvas px
  y: number
  cell: CellPos
  screenScale: number // on-screen px per logical px (CSS downscale factor)
}

let loupeCanvas: HTMLCanvasElement | null = null

export function drawTouchReticle(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  aim: TouchAim,
  dpr: number,
): void {
  const scale = Math.max(0.05, aim.screenScale)
  const mapW = MAP_WIDTH * CELL_PX
  const mapH = MAP_HEIGHT * CELL_PX
  // All sizes are chosen in SCREEN px, then converted to logical px so the
  // loupe is finger-sized regardless of how far CSS shrank the canvas.
  const r = 64 / scale // loupe radius
  const zoom = Math.max(1.4, 46 / (CELL_PX * scale)) // target cell ≈ 46 screen px
  const lift = 104 / scale // how far above the finger the loupe floats

  // Loupe centre: above the finger, flipped below when clipped by the top.
  let ly = aim.y - lift
  if (ly - r < 2) ly = aim.y + lift
  const lx = Math.min(mapW - r - 2, Math.max(r + 2, aim.x))
  ly = Math.min(mapH - r - 2, Math.max(r + 2, ly))

  // Copy the source region around the TARGET CELL centre (not the finger) —
  // that is the thing being aimed. Clamped to the canvas so edge cells work.
  const cellCx = (aim.cell.cx + 0.5) * CELL_PX
  const cellCy = (aim.cell.cy + 0.5) * CELL_PX
  const srcSize = (2 * r) / zoom
  const srcX = Math.min(mapW - srcSize, Math.max(0, cellCx - srcSize / 2))
  const srcY = Math.min(mapH - srcSize, Math.max(0, cellCy - srcSize / 2))

  if (!loupeCanvas) loupeCanvas = document.createElement('canvas')
  const off = loupeCanvas
  const offPx = Math.max(1, Math.round(srcSize * dpr))
  if (off.width !== offPx) {
    off.width = offPx
    off.height = offPx
  }
  const offCtx = off.getContext('2d')!
  offCtx.clearRect(0, 0, off.width, off.height)
  offCtx.drawImage(source, srcX * dpr, srcY * dpr, srcSize * dpr, srcSize * dpr, 0, 0, off.width, off.height)

  ctx.save()
  // Backplate shadow so the loupe reads as floating above the board.
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)'
  ctx.shadowBlur = 18 / scale
  ctx.fillStyle = '#10151f'
  ctx.beginPath()
  ctx.arc(lx, ly, r + 3 / scale, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 0

  ctx.beginPath()
  ctx.arc(lx, ly, r, 0, Math.PI * 2)
  ctx.clip()
  ctx.drawImage(off, lx - r, ly - r, 2 * r, 2 * r)

  // Crosshair: outline the target cell inside the magnified view.
  const cellPx = CELL_PX * zoom
  const cx = lx + (cellCx - (srcX + srcSize / 2)) * zoom
  const cy = ly + (cellCy - (srcY + srcSize / 2)) * zoom
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)'
  ctx.lineWidth = 2 / scale
  ctx.strokeRect(cx - cellPx / 2, cy - cellPx / 2, cellPx, cellPx)
  ctx.restore()

  // Ring + stem back to the finger so the offset reads as intentional.
  ctx.strokeStyle = 'rgba(122, 162, 247, 0.95)'
  ctx.lineWidth = 2.5 / scale
  ctx.beginPath()
  ctx.arc(lx, ly, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.globalAlpha = 0.5
  ctx.beginPath()
  ctx.moveTo(lx, ly + (ly < aim.y ? r : -r))
  ctx.lineTo(aim.x, aim.y)
  ctx.stroke()
  ctx.globalAlpha = 1
}
