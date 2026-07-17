import { ABILITIES, ENEMIES, towerTier } from '../data/content'
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
  } as Record<TowerType, string>,
  enemies: {
    runner: '#f7768e',
    swarmling: '#ff9e64',
    brute: '#db4b4b',
    shieldbearer: '#c0caf5',
    flier: '#7aa2f7',
    healer: '#9ece6a',
    splitter: '#d19a66',
    splitling: '#f0a45d',
    carrier: '#d16d9e',
    boss: '#ff007c',
  } as Record<string, string>,
  hpBack: '#30354a',
  hpFill: '#9ece6a',
  ghostOk: 'rgba(158, 206, 106, 0.35)',
  ghostBad: 'rgba(219, 75, 75, 0.35)',
  range: 'rgba(255, 255, 255, 0.08)',
  rangeEdge: 'rgba(255, 255, 255, 0.25)',
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
  carrier: 13,
  boss: 16,
}

function px(v: number): number {
  return (v / 1000) * CELL_PX
}

// Last known facing per enemy id — enemies keep their heading while standing
// still (walled in, spawn tick). Render-only cache, cleared when it grows.
const headings = new Map<number, number>()

export function draw(ctx: CanvasRenderingContext2D, session: GameSession, ui: RenderUiState): void {
  const state = session.state
  const map = getMap(state.mapId)
  const w = map.width * CELL_PX
  const h = map.height * CELL_PX

  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, w, h)

  drawPathHighlight(ctx, state, map)
  drawGrid(ctx, map)
  drawRocks(ctx, map)
  drawGates(ctx, map, state)
  drawTowers(ctx, session, ui)
  drawEnemies(ctx, session)
  drawEffects(ctx, session)
  drawPlacementGhost(ctx, session, ui, map)
}

// Animation clock: sim time (ticks) plus the interpolation fraction, so
// walk cycles speed up with fast-forward and freeze on pause.
function animTime(session: GameSession): number {
  return session.state.tick + session.alpha
}

function drawGrid(ctx: CanvasRenderingContext2D, map: MapDef): void {
  ctx.strokeStyle = COLORS.gridLine
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = 0; x <= map.width; x++) {
    ctx.moveTo(x * CELL_PX + 0.5, 0)
    ctx.lineTo(x * CELL_PX + 0.5, map.height * CELL_PX)
  }
  for (let y = 0; y <= map.height; y++) {
    ctx.moveTo(0, y * CELL_PX + 0.5)
    ctx.lineTo(map.width * CELL_PX, y * CELL_PX + 0.5)
  }
  ctx.stroke()
}

function drawPathHighlight(ctx: CanvasRenderingContext2D, state: RunState, map: MapDef): void {
  const field = distanceField(map, blockedGrid(map, state.towers))
  const path = [map.spawn, ...pathFrom(map, field, map.spawn)]
  ctx.fillStyle = COLORS.path
  for (const c of path) ctx.fillRect(c.cx * CELL_PX, c.cy * CELL_PX, CELL_PX, CELL_PX)
}

function drawRocks(ctx: CanvasRenderingContext2D, map: MapDef): void {
  for (let cy = 0; cy < map.height; cy++) {
    for (let cx = 0; cx < map.width; cx++) {
      if (!map.rocks[cy * map.width + cx]) continue
      ctx.fillStyle = COLORS.rock
      ctx.fillRect(cx * CELL_PX + 2, cy * CELL_PX + 2, CELL_PX - 4, CELL_PX - 4)
      ctx.strokeStyle = COLORS.rockEdge
      ctx.strokeRect(cx * CELL_PX + 2.5, cy * CELL_PX + 2.5, CELL_PX - 5, CELL_PX - 5)
    }
  }
}

function drawGates(ctx: CanvasRenderingContext2D, map: MapDef, state: RunState): void {
  const spawn = cellCenter(map.spawn)
  ctx.fillStyle = COLORS.spawn
  ctx.beginPath()
  ctx.arc(px(spawn.x), px(spawn.y), CELL_PX * 0.36, 0, Math.PI * 2)
  ctx.fill()

  // The Spire: a diamond whose glow fades with its HP.
  const spire = cellCenter(map.spire)
  const cx = px(spire.x)
  const cy = px(spire.y)
  const r = CELL_PX * 0.46
  const hpFrac = state.spireMaxHp > 0 ? state.spireHp / state.spireMaxHp : 0
  ctx.save()
  ctx.shadowColor = COLORS.spire
  ctx.shadowBlur = 6 + 14 * hpFrac
  ctx.fillStyle = COLORS.spire
  ctx.beginPath()
  ctx.moveTo(cx, cy - r)
  ctx.lineTo(cx + r * 0.7, cy)
  ctx.lineTo(cx, cy + r)
  ctx.lineTo(cx - r * 0.7, cy)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

// Each tower type has its own silhouette; attacking turrets rotate to face
// their last target (session.aim, fed by tower_fired events).
function drawTowers(ctx: CanvasRenderingContext2D, session: GameSession, ui: RenderUiState): void {
  const state = session.state
  const t0 = animTime(session)
  for (const t of state.towers) {
    const gx = t.cell.cx * CELL_PX
    const gy = t.cell.cy * CELL_PX
    const cx = gx + CELL_PX / 2
    const cy = gy + CELL_PX / 2
    const color = COLORS.towers[t.type]
    const aim = session.aim[t.id] ?? -Math.PI / 2
    // Tiers read as size: the whole tower grows a little per tier.
    const s = 0.95 + t.tier * 0.1

    // Shared base plate, edged in the tower's color so types read at a glance.
    ctx.fillStyle = '#141a28'
    roundRect(ctx, gx + 4.5, gy + 4.5, CELL_PX - 9, CELL_PX - 9, 5)
    ctx.fill()
    ctx.save()
    ctx.globalAlpha = 0.55
    ctx.strokeStyle = color
    ctx.stroke()
    ctx.restore()

    ctx.save()
    ctx.translate(cx, cy)
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
    const color = COLORS.enemies[e.type] ?? '#ffffff'
    // Walk phase scales with the creature's own speed so slows visibly
    // drag the gait too.
    const gait = e.slowTicks > 0 ? e.slowFactor / 100 : 1
    const phase = t0 * 0.22 * gait * (e.speed / 100) + e.id * 1.7

    ctx.save()
    ctx.translate(x, y)
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
        ctx.fillStyle = COLORS.enemies['splitling']!
        circle(ctx, -r * 0.35, jiggle, r * 0.32)
        ctx.fill()
        circle(ctx, r * 0.35, -jiggle, r * 0.32)
        ctx.fill()
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
        ctx.fillStyle = COLORS.enemies['swarmling']!
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
      case 'boss': {
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
    // HP bar
    if (e.hp < e.maxHp) {
      const bw = r * 2
      ctx.fillStyle = COLORS.hpBack
      ctx.fillRect(x - r, y - r - 6, bw, 3)
      ctx.fillStyle = COLORS.hpFill
      ctx.fillRect(x - r, y - r - 6, (bw * e.hp) / e.maxHp, 3)
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
    if (age > 1) continue
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
        ctx.fillStyle = '#ff5f3c'
        ctx.globalAlpha = fade * 0.6
        ctx.beginPath()
        ctx.arc(px(fx.at.x), px(fx.at.y), px(ABILITIES.meteor.radius) * Math.min(1, age * 2), 0, Math.PI * 2)
        ctx.fill()
        break
      }
      case 'nova': {
        if (!fx.at) break
        ctx.strokeStyle = COLORS.towers.frost
        ctx.globalAlpha = fade
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(px(fx.at.x), px(fx.at.y), px(ABILITIES.frost_nova.radius) * age, 0, Math.PI * 2)
        ctx.stroke()
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
      case 'spire_hit': {
        ctx.fillStyle = '#db4b4b'
        ctx.globalAlpha = fade * 0.25
        const map = getMap(session.state.mapId)
        ctx.fillRect(0, 0, map.width * CELL_PX, map.height * CELL_PX)
        break
      }
      case 'gold_rush': {
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
