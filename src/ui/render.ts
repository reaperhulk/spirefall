import { ABILITIES, towerTier } from '../data/content'
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
  boss: 16,
}

function px(v: number): number {
  return (v / 1000) * CELL_PX
}

function interpolated(session: GameSession, enemy: Enemy): Vec {
  const prev = session.prev.enemies.find((e) => e.id === enemy.id)
  if (!prev) return enemy.pos
  const a = session.alpha
  return { x: prev.pos.x + (enemy.pos.x - prev.pos.x) * a, y: prev.pos.y + (enemy.pos.y - prev.pos.y) * a }
}

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
  drawTowers(ctx, state, ui)
  drawEnemies(ctx, session)
  drawEffects(ctx, session)
  drawPlacementGhost(ctx, session, ui, map)
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

function drawTowers(ctx: CanvasRenderingContext2D, state: RunState, ui: RenderUiState): void {
  for (const t of state.towers) {
    const x = t.cell.cx * CELL_PX
    const y = t.cell.cy * CELL_PX
    const color = COLORS.towers[t.type]
    ctx.fillStyle = color
    ctx.fillRect(x + 5, y + 5, CELL_PX - 10, CELL_PX - 10)
    ctx.fillStyle = COLORS.bg
    ctx.fillRect(x + 9, y + 9, CELL_PX - 18, CELL_PX - 18)
    ctx.fillStyle = color
    // Tier pips
    for (let i = 0; i < t.tier; i++) ctx.fillRect(x + 11 + i * 5, y + CELL_PX - 12, 3, 3)
    // Enhancement level badge
    if (t.enhance > 0) {
      ctx.font = 'bold 9px ui-monospace, monospace'
      ctx.textAlign = 'right'
      ctx.fillStyle = '#ffffff'
      ctx.fillText(`+${t.enhance}`, x + CELL_PX - 4, y + 12)
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
  }
}

function drawEnemies(ctx: CanvasRenderingContext2D, session: GameSession): void {
  for (const e of session.state.enemies) {
    const pos = interpolated(session, e)
    const x = px(pos.x)
    const y = px(pos.y)
    const r = ENEMY_RADIUS[e.type] ?? 8
    ctx.fillStyle = COLORS.enemies[e.type] ?? '#ffffff'
    if (e.type === 'flier') {
      // Fliers render as triangles — visually "above" the maze.
      ctx.beginPath()
      ctx.moveTo(x, y - r)
      ctx.lineTo(x + r, y + r)
      ctx.lineTo(x - r, y + r)
      ctx.closePath()
      ctx.fill()
    } else {
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
    if (e.type === 'healer') {
      ctx.fillStyle = '#0b0e14'
      ctx.fillRect(x - 1.5, y - 5, 3, 10)
      ctx.fillRect(x - 5, y - 1.5, 10, 3)
    }
    if (e.type === 'shieldbearer') {
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(x, y, r + 2, 0, Math.PI * 2)
      ctx.stroke()
      ctx.lineWidth = 1
    }
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
