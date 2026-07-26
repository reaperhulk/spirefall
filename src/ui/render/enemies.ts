// The enemy pass: bodies, health, status tells, and the per-entity heading and
// spawn-pop caches that make them move like creatures instead of sprites.


import { ENEMIES, EXECUTE_THRESHOLD_PCT } from '../../data/content'
import type { Enemy, Vec } from '../../engine/types'
import type { GameSession } from '../session'
import { settings } from '../settings'
import { animTime, circle, easeOutBack, ellipse, glow, px, roundRect } from './primitives'
import { COLORS, enemyColor } from './theme'
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
  boss4: 17,
  boss5: 18,
  boss6: 18,
}


// Last known facing per enemy id — enemies keep their heading while standing
// still (walled in, spawn tick). Render-only cache, cleared when it grows.
const headings = new Map<number, number>()


// First time the renderer saw each enemy id, for the spawn pop-in. Wall
// clock is fine: it's a one-shot 220ms flourish, not sim state.
const firstSeen = new Map<number, number>()


// Enemies are little creatures now: bodies orient along their movement
// heading and animate with sim-time walk cycles (frozen on pause, faster on
// fast-forward), each offset by id so packs don't march in lockstep.
export function drawEnemies(ctx: CanvasRenderingContext2D, session: GameSession): void {
  const t0 = animTime(session)
  const state = session.state
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

    // Ground shadow anchors every walker to the field (airborne enemies —
    // fliers, Stormcaller, Zephyrhost — draw their own, smaller and offset;
    // phased enemies cast none — nothing there to cast it (that covers
    // Veilwarden too, not just wraiths).
    if (!ENEMIES[e.type].flying && !e.phased) {
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
      case 'boss3':
      case 'boss4':
      case 'boss5':
      case 'boss6': {
        // Every boss wears the regalia: rotating spike crown, breathing
        // core, aura — in its own roster color. (The endless tier used to
        // fall through to the generic walker body and read like a fat brute.)
        // A phased Veilwarden fades like a wraith: the untargetable window
        // must LOOK untargetable or players waste focus fire into nothing.
        // (Multiplied through every layer — plain sets would clobber it.)
        const bossAlpha = e.phased ? 0.3 : 1
        const breathe = 1 + 0.05 * Math.sin(phase * 0.5)
        if (ENEMIES[e.type].flying && !settings.reducedMotion) {
          // Airborne royalty: flapping wing ellipses behind the crown.
          const flap = Math.sin(phase * 1.6) * 0.5
          ctx.fillStyle = color
          ctx.globalAlpha = 0.4 * bossAlpha
          ellipse(ctx, -r * 0.9, -r * 0.2, r * 0.85, r * (0.35 + flap * 0.25))
          ctx.fill()
          ellipse(ctx, r * 0.9, -r * 0.2, r * 0.85, r * (0.35 + flap * 0.25))
          ctx.fill()
          ctx.globalAlpha = bossAlpha
        }
        ctx.strokeStyle = color
        ctx.globalAlpha = 0.35 * bossAlpha
        circle(ctx, 0, 0, r + 5 + Math.sin(t0 * 0.08) * 2)
        ctx.stroke()
        ctx.globalAlpha = bossAlpha
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

    // Status tells, in one visual language: slows ring blue, haste streaks
    // amber, burns flicker ember, brittleness crazes the body with pale ice.
    if (e.slowTicks > 0 && e.slowFactor <= 100) {
      ctx.strokeStyle = COLORS.towers.frost
      ctx.beginPath()
      ctx.arc(x, y, r + 3, 0, Math.PI * 2)
      ctx.stroke()
    }
    if (e.slowTicks > 0 && e.slowFactor > 100) {
      // Gale haste: motion streaks trailing the body.
      ctx.strokeStyle = 'rgba(255, 199, 119, 0.65)'
      ctx.lineWidth = 1.5
      for (const dy of [-r * 0.4, 0, r * 0.4]) {
        ctx.beginPath()
        ctx.moveTo(x - r - 8, y + dy)
        ctx.lineTo(x - r - 2, y + dy)
        ctx.stroke()
      }
    }
    if (e.burnTicks > 0) {
      const flick = 0.5 + 0.5 * Math.sin(t0 * 0.9 + e.id * 2.3)
      glow(ctx, x, y - r * 0.5, r * 1.6, '#ff7a3c', 0.25 + 0.2 * flick)
      ctx.fillStyle = '#ffb27a'
      ctx.globalAlpha = 0.7
      ellipse(ctx, x + r * 0.35, y - r - 2 - flick * 2, 1.8, 3.2 + flick * 1.5)
      ctx.fill()
      ctx.globalAlpha = 1
    }
    if (e.brittleTicks > 0) {
      ctx.strokeStyle = 'rgba(200, 235, 255, 0.85)'
      ctx.lineWidth = 1
      // Craze lines: three fixed-angle cracks across the body.
      for (const a of [0.6, 2.2, 4.1]) {
        const dx = Math.cos(a)
        const dy = Math.sin(a)
        ctx.beginPath()
        ctx.moveTo(x - dx * r * 0.8, y - dy * r * 0.8)
        ctx.lineTo(x + dx * r * 0.5, y + dy * r * 0.5)
        ctx.stroke()
      }
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
    drawBossMechRing(ctx, e, x, y, r)
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

    // Execute window: while the blade is ready, a wounded enemy wears a
    // pulsing gold ring — click it to finish it. Ring gone = blade cooling.
    if (
      state.executeCd === 0 &&
      !e.phased &&
      e.hp > 0 &&
      e.hp * 100 <= e.maxHp * EXECUTE_THRESHOLD_PCT
    ) {
      ctx.strokeStyle = '#e0af68'
      ctx.globalAlpha = 0.55 + 0.3 * Math.sin(t0 * 0.3)
      ctx.setLineDash([3, 3])
      circle(ctx, x, y, r + 4)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.globalAlpha = 1
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


// The carapace window on the boss body: a hard, bright shell ring. Reads at
// a glance as "hitting this is pointless right now" — and its disappearance
// as the shatter.
export function drawBossMechRing(ctx: CanvasRenderingContext2D, e: Enemy, x: number, y: number, r: number): void {
  if (e.mechActiveTicks <= 0 || ENEMIES[e.type].mech?.kind !== 'carapace') return
  glow(ctx, x, y, r * 2.2, '#ffd7f0', 0.5)
  ctx.strokeStyle = '#ffd7f0'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.arc(x, y, r + 4, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255, 0, 124, 0.7)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(x, y, r + 7, 0, Math.PI * 2)
  ctx.stroke()
}
