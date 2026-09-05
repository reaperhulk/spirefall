// The tower pass: every tower's sprite, its tier pips, veterancy stars and
// beacon coverage pips, the selection ring, and the placement ghost.


// Each tower type has its own silhouette; attacking turrets rotate to face
// their last target (session.aim, fed by tower_fired events).
import { MESA_RANGE_PCT } from '../../data/biomes'
import { ABILITIES, LANCE_MAX_STACKS, VETERANCY_TIERS, mintStars, towerTier, veterancyStars } from '../../data/content'
import type { Tower } from '../../engine/types'
import type { MapDef } from '../../data/maps'
import { effectiveTowerRange, towerRangeOnBoard } from '../../engine/combat'
import { blockedGrid, canPlaceTower, cellCenter, cellIndex, distSq, distanceField, pathFrom } from '../../engine/grid'
import { getRunMap } from '../../engine/mapgen'
import type { GameSession } from '../session'
import { settings } from '../settings'
import { animTime, circle, drawStar, ellipse, glow, polygon, px, roundRect } from './primitives'
import { CELL_PX, COLORS } from './theme'
import type { RenderUiState } from './types'
export function drawTowers(ctx: CanvasRenderingContext2D, session: GameSession, ui: RenderUiState): void {
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
    ctx.fillStyle = '#344453'
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

    // A committed tier-3 path wears a gold badge on the plate's crown — the
    // commitment reads on the field, not just in the panel.
    if (t.spec !== null) {
      glow(ctx, cx, gy + 4, 7, '#e0af68', 0.35)
      ctx.fillStyle = '#e0af68'
      ctx.beginPath()
      ctx.moveTo(cx, gy + 1)
      ctx.lineTo(cx + 3.5, gy + 4.5)
      ctx.lineTo(cx, gy + 8)
      ctx.lineTo(cx - 3.5, gy + 4.5)
      ctx.closePath()
      ctx.fill()
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
    drawTowerBody(ctx, t, aim, t0)
    ctx.restore()

    // The lance's ramp reads on the battlefield, not just in the panel: a
    // rose charge dial fills around the tower as stacks climb, and a tether
    // thickens toward the held mark. Both drop the instant the climb resets
    // — the same state the engine keeps, so the tell can't lie.
    if (t.type === 'lance' && (t.rampStacks ?? 0) > 0) {
      const stacks = t.rampStacks ?? 0
      const frac = Math.min(1, stacks / LANCE_MAX_STACKS)
      const mark = state.enemies.find((e) => e.id === t.rampTarget && e.hp > 0)
      if (mark && !mark.phased) {
        ctx.strokeStyle = color
        ctx.globalAlpha = 0.16 + 0.3 * frac
        ctx.lineWidth = 0.5 + 1.5 * frac
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.lineTo(px(mark.pos.x), px(mark.pos.y))
        ctx.stroke()
      }
      ctx.strokeStyle = color
      ctx.globalAlpha = 0.85
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(cx, cy, 13, -Math.PI / 2, -Math.PI / 2 + frac * 2 * Math.PI)
      ctx.stroke()
      ctx.globalAlpha = 1
      ctx.lineWidth = 1
      if (frac >= 1) glow(ctx, cx, cy, 16, color, 0.3) // full climb burns
    }

    // Overcharge: an armed tower burns white-hot until the shot spends it.
    if (t.overcharged) {
      glow(ctx, cx, cy, CELL_PX * 0.6, '#ffffff', 0.35 + 0.15 * Math.sin(t0 * 0.25))
    }

    // Tier pips + enhancement badge, on top of everything.
    ctx.fillStyle = color
    for (let i = 0; i < t.tier; i++) ctx.fillRect(gx + 7 + i * 5, gy + CELL_PX - 9, 3, 3)

    // Veterancy: kills earn stars (10/50/150) — a tower's career reads on
    // the field, and watching a favorite grow up is half the fun of 1x.
    // Mints earn theirs off gold minted — see MINT_VETERANCY_TIERS.
    const stars = t.type === 'mint' ? mintStars(t.earned ?? 0) : veterancyStars(t.kills)
    if (stars > 0) {
      ctx.fillStyle = '#e0af68'
      for (let i = 0; i < stars; i++) drawStar(ctx, gx + 7 + i * 7, gy + 8, 3)
      if (stars >= VETERANCY_TIERS.length) glow(ctx, cx, cy, CELL_PX * 0.5, '#e0af68', 0.12)
    }

    // A beacon's contribution is not a career, it's live COVERAGE — how many
    // towers are standing in the aura right now. Pips, not stars, because
    // the number is meant to move: sell a neighbour and one goes out, which
    // is exactly the feedback that makes placement legible. Same slot as the
    // stars so the glance is the same glance; different shape so it cannot
    // be misread as veterancy. Previously this was visible only while the
    // beacon was SELECTED, which is precisely when you no longer need it.
    if (t.type === 'beacon') {
      const reach = towerTier('beacon', t.tier).range
      const at = cellCenter(t.cell)
      let boosted = 0
      for (const other of state.towers) {
        if (other.id === t.id || other.type === 'beacon') continue
        if (distSq(cellCenter(other.cell), at) <= reach * reach) boosted++
      }
      ctx.fillStyle = boosted > 0 ? '#ff9e64' : '#5a4436'
      for (let i = 0; i < Math.max(1, Math.min(boosted, 6)); i++) {
        circle(ctx, gx + 8 + i * 6, gy + 8, 2)
        ctx.fill()
      }
    }
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
      // The ring is the engine's OWN radius — spec, Longsight, and mesa
      // included (beacons excepted: their aura reach is raw by design).
      const ringRange = t.type === 'beacon' ? def.range : towerRangeOnBoard(state, getRunMap(state), t)
      ctx.fillStyle = COLORS.range
      ctx.strokeStyle = COLORS.rangeEdge
      ctx.beginPath()
      ctx.arc(px(center.x), px(center.y), px(ringRange), 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()

      // A selected beacon shows its WORK, not just its reach: amber links
      // to every tower inside the aura, so repositioning decisions are
      // made by sight instead of radius guesswork.
      if (t.type === 'beacon') {
        const rangeSq = def.range * def.range
        ctx.strokeStyle = '#ff9e64'
        ctx.globalAlpha = 0.7
        ctx.setLineDash([4, 4])
        for (const other of state.towers) {
          if (other.id === t.id || other.type === 'beacon') continue
          const oc = cellCenter(other.cell)
          if (distSq(center, oc) > rangeSq) continue
          ctx.beginPath()
          ctx.moveTo(px(center.x), px(center.y))
          ctx.lineTo(px(oc.x), px(oc.y))
          ctx.stroke()
          circle(ctx, px(oc.x), px(oc.y), 6)
          ctx.stroke()
        }
        ctx.setLineDash([])
        ctx.globalAlpha = 1
      }
    }
    ctx.lineWidth = 1
  }
}


export function drawPlacementGhost(
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
    // The ghost ring is the radius the tower would ACTUALLY get here —
    // Longsight and this very cell's mesa bonus included.
    let ghostRange = effectiveTowerRange(session.state, ui.shopSelection, 1)
    if (ui.shopSelection !== 'beacon' && map.mesa.length > 0 && map.mesa[cellIndex(map, c)]) {
      ghostRange = Math.floor((ghostRange * MESA_RANGE_PCT) / 100)
    }
    if (ui.shopSelection === 'beacon') ghostRange = towerTier('beacon', 1).range
    const center = cellCenter(c)
    ctx.strokeStyle = COLORS.rangeEdge
    ctx.beginPath()
    ctx.arc(px(center.x), px(center.y), px(ghostRange), 0, Math.PI * 2)
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

export function drawTowerBody(ctx: CanvasRenderingContext2D, t: Pick<Tower, 'type' | 'tier' | 'id' | 'spec'>, aim: number, t0: number): void {
  const color = COLORS.towers[t.type]
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
      case 'lance': {
        // A long couched spear on a pivot ring — one line of intent.
        ctx.strokeStyle = '#5a2a34'
        ctx.lineWidth = 2
        circle(ctx, 0, 0, 5) // pivot ring
        ctx.stroke()
        ctx.rotate(aim)
        ctx.fillStyle = color
        ctx.fillRect(-5, -1, 20, 2) // shaft
        ctx.beginPath() // head
        ctx.moveTo(15, -3.5)
        ctx.lineTo(21, 0)
        ctx.lineTo(15, 3.5)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = '#5a2a34'
        ctx.fillRect(-6, -2.5, 3, 5) // counterweight
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
  // Specializations change the silhouette as well as the badge.
  if (t.spec) {
    ctx.strokeStyle = '#e6d5ac'; ctx.lineWidth = 2
    const paired = ['volley', 'mortar', 'blizzard', 'lattice', 'overpenetrator', 'momentum'].includes(t.spec)
    if (paired) {
      for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(-7, side * 10); ctx.lineTo(9, side * 10); ctx.stroke() }
    } else { ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(7, -6); ctx.lineTo(0, 0); ctx.lineTo(-7, -6); ctx.closePath(); ctx.stroke() }
  }
}
