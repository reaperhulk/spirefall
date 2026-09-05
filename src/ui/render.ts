import { navigation } from '../engine/navigation'
import { BEAM_HEAT_MAX, COIN_FLASH_TICKS, COIN_LIFETIME_TICKS, ENEMIES } from '../data/content'
import { settings } from './settings'
import type { MapDef } from '../data/maps'
import { cellCenter } from '../engine/grid'
import { getRunMap } from '../engine/mapgen'
import type { RunState } from '../engine/types'
import type { GameSession } from './session'
import { drawEffects } from './render/effects'
import { drawEnemies } from './render/enemies'
import { animTime, circle, ellipse, glow, px } from './render/primitives'
import { drawDecals, terrainLayer } from './render/terrain'
import { CELL_PX, COLORS, enemyColor, mapTheme } from './render/theme'
import type { MapTheme } from './render/theme'
import { drawPlacementGhost, drawTowers } from './render/towers'
import type { RenderUiState } from './render/types'

// The frame: draw() runs the passes in order, and the scene layers that only
// it uses live here (coins, the beam, atmosphere, the boss bar, the path
// highlight, ambient motes, the gates).
//
// Everything else was split out at 2100 lines — theme, primitives, terrain,
// towers, enemies, effects, loupe — because every iteration for months had to
// scroll past four unrelated subsystems to reach the one it was changing.
// This file stays the module's front door: the UI imports `./render` exactly
// as it did before, and the re-exports below are that promise.
export type { RenderUiState } from './render/types'
export { CELL_PX, enemyColor } from './render/theme'
export { stampDecal } from './render/terrain'
export { drawBossMechRing } from './render/enemies'
export { LOUPE_D, LOUPE_GAP, renderLoupe, type TouchAim } from './render/loupe'



export function draw(ctx: CanvasRenderingContext2D, session: GameSession, ui: RenderUiState): void {
  const state = session.state
  const map = getRunMap(state)
  const w = map.width * CELL_PX
  const h = map.height * CELL_PX

  const theme = mapTheme(map)
  ctx.drawImage(terrainLayer(map, theme), 0, 0, w, h)
  drawPathHighlight(ctx, state, map, animTime(session), theme)
  drawDecals(ctx, session.renderId)
  drawAmbient(ctx, map, animTime(session), theme)
  drawGates(ctx, map, state, animTime(session))
  if (state.shrine) {
    const at = cellCenter(state.shrine.cell)
    ctx.strokeStyle = state.shrine.status === 'lost' ? '#a96868' : '#c3aceb'
    ctx.setLineDash([4, 4]); ctx.lineWidth = 2
    circle(ctx, px(at.x), px(at.y), px(1200)); ctx.stroke(); ctx.setLineDash([])
    ctx.font = '10px ui-monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#e0cef5'
    ctx.fillText('SHRINE', px(at.x), px(at.y) - 44); ctx.textAlign = 'left'
  }
  drawTowers(ctx, session, ui)
  drawCoins(ctx, session, map)
  drawEnemies(ctx, session)
  drawBeam(ctx, session, map)
  drawEffects(ctx, session)
  drawAtmosphere(ctx, session, map, theme)
  drawPlacementGhost(ctx, session, ui, map)
  drawBossBar(ctx, state, map)
}

// Dropped bounty on the field. Fresh coins gleam and slowly spin; coins in
// their last seconds FLASH — grab them or lose them. The collector's reach
// rings the cursor, and the Spire Magnet's reach rings the spire (dashed):
// both circles are the engine's own radii, never a guess.
function drawCoins(ctx: CanvasRenderingContext2D, session: GameSession, map: MapDef): void {
  const state = session.state
  const t = animTime(session)
  if (state.collectAt !== null && state.coins.length > 0) {
    ctx.strokeStyle = '#e5c07b'
    ctx.globalAlpha = 0.18
    circle(ctx, px(state.collectAt.x), px(state.collectAt.y), px(state.mods.collectRadius))
    ctx.stroke()
    ctx.globalAlpha = 1
  }
  if (state.mods.autoCollectRadius > 0 && state.coins.length > 0) {
    const spire = cellCenter(map.spire)
    ctx.strokeStyle = '#e5c07b'
    ctx.globalAlpha = 0.14
    ctx.setLineDash([5, 7])
    circle(ctx, px(spire.x), px(spire.y), px(state.mods.autoCollectRadius))
    ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1
  }
  for (const coin of state.coins) {
    const left = COIN_LIFETIME_TICKS - (state.tick - coin.bornTick)
    // The expiry flash: a hard blink through the final stretch.
    if (left <= COIN_FLASH_TICKS && !coin.pulling && Math.floor(t * 0.25) % 2 === 0) continue
    const x = px(coin.pos.x)
    const y = px(coin.pos.y)
    const squash = Math.abs(Math.sin(t * 0.12 + coin.id))
    const r = coin.gold >= 5 ? 4 : 3
    glow(ctx, x, y, r + 3, '#e0af68', coin.pulling ? 0.5 : 0.3)
    ctx.fillStyle = '#e5c07b'
    ellipse(ctx, x, y, r, 1 + (r - 1) * squash)
    ctx.fill()
    ctx.strokeStyle = '#8a6a2a'
    ellipse(ctx, x, y, r, 1 + (r - 1) * squash)
    ctx.stroke()
  }
}

// The Spire beam: a steered ray from the spire to the aim point, its color
// riding the heat (cool cyan → angry orange). Purely a view of serialized
// state — beamTarget/beamHeat — so replays show the hand that steered it.
function drawBeam(ctx: CanvasRenderingContext2D, session: GameSession, map: MapDef): void {
  const state = session.state
  if (state.beamTarget === null || state.beamOverheated || state.phase !== 'wave') return
  const from = cellCenter(map.spire)
  const heat = state.beamHeat / BEAM_HEAT_MAX
  const color = heat < 0.5 ? '#7dcfff' : heat < 0.8 ? '#e0af68' : '#ff7a3c'
  const t = animTime(session)
  ctx.save()
  ctx.strokeStyle = color
  ctx.globalAlpha = 0.55 + 0.2 * Math.sin(t * 0.6)
  ctx.lineWidth = 2 + heat * 1.5
  ctx.beginPath()
  ctx.moveTo(px(from.x), px(from.y))
  ctx.lineTo(px(state.beamTarget.x), px(state.beamTarget.y))
  ctx.stroke()
  ctx.globalAlpha = 1
  ctx.lineWidth = 1
  ctx.restore()
  glow(ctx, px(state.beamTarget.x), px(state.beamTarget.y), 10 + heat * 6, color, 0.5)
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
  const label =
    boss.mechActiveTicks > 0 && ENEMIES[boss.type].mech?.kind === 'carapace'
      ? `${ENEMIES[boss.type].name.toUpperCase()} — CARAPACE UP — ${boss.hp}/${boss.maxHp}`
      : `${ENEMIES[boss.type].name.toUpperCase()} — ${boss.mechCooldown <= 30 ? 'BRACE IN ' + Math.ceil(boss.mechCooldown / 30) + 's — ' : boss.type === 'boss_final' && boss.mechCooldown > 90 ? 'CORE EXPOSED — ' : ''}${boss.hp}/${boss.maxHp}`
  ctx.fillText(label, w / 2, y + 7)
  ctx.textAlign = 'left'
}

function drawPathHighlight(ctx: CanvasRenderingContext2D, state: RunState, map: MapDef, t0: number, theme: MapTheme): void {
  const path = navigation(map, state.towers).path

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
  ctx.strokeStyle = '#9bada3'
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
  // Raised masonry, buttresses, battlements and damage cracks frame the core.
  ctx.fillStyle = '#0b1118'
  ellipse(ctx, cx - 5, cy + 23, 30, 13); ctx.fill()
  const courses = hpFrac > 0 ? 3 : 1
  for (let floor = 0; floor < courses; floor++) {
    const y = cy + 19 - floor * 16
    ctx.fillStyle = floor % 2 ? '#566978' : '#394b5b'
    ctx.fillRect(cx - 22, y - 12, 39, 16)
    ctx.strokeStyle = '#91a6ae'; ctx.lineWidth = 1
    ctx.strokeRect(cx - 22, y - 12, 39, 16)
    for (let brick = 0; brick < 3; brick++) {
      ctx.beginPath(); ctx.moveTo(cx - 18 + brick * 12 + (floor % 2) * 5, y - 12); ctx.lineTo(cx - 18 + brick * 12 + (floor % 2) * 5, y + 4); ctx.stroke()
    }
  }
  ctx.fillStyle = '#607886'
  for (const side of [-1, 1]) {
    const x = cx + side * 20 - 5
    ctx.fillRect(x, cy - 22, 8, 47)
    for (let tooth = 0; tooth < 2; tooth++) ctx.fillRect(x + tooth * 5 - 1, cy - 27, 4, 8)
  }
  if (hpFrac < 0.65) {
    ctx.strokeStyle = '#111820'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(cx - 17, cy - 21); ctx.lineTo(cx - 8, cy - 5); ctx.lineTo(cx - 14, cy + 3); ctx.lineTo(cx - 5, cy + 15); ctx.stroke()
  }
  if (hpFrac < 0.3) { ctx.fillStyle = '#181d25'; ctx.fillRect(cx + 11, cy - 22, 11, 18) }
  if (hpFrac <= 0) {
    ctx.fillStyle = '#657078'
    for (let stone = 0; stone < 7; stone++) ctx.fillRect(cx - 26 + stone * 7, cy + 14 + (stone % 3) * 4, 6, 5)
    return
  }
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
