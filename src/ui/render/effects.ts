// The effects pass: projectiles, muzzle flashes, impacts, floating text and
// every other transient the session queues up for a frame.


import { ABILITIES } from '../../data/content'
import { getRunMap } from '../../engine/mapgen'
import type { GameSession } from '../session'
import { settings } from '../settings'
import { circle, ellipse, glow, px } from './primitives'
import { CELL_PX, COLORS } from './theme'
export function drawEffects(ctx: CanvasRenderingContext2D, session: GameSession): void {
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
      case 'coin': {
        // A gold coin on a lobbed arc (mint payout → treasury corner), or a
        // bounce-in-place glint where an elite fell. Spin via ellipse squash.
        if (!fx.from || !fx.to) break
        const x = px(fx.from.x + (fx.to.x - fx.from.x) * age)
        const y = px(fx.from.y + (fx.to.y - fx.from.y) * age) - Math.sin(age * Math.PI) * 16
        const squash = Math.abs(Math.sin(age * 9))
        ctx.globalAlpha = fade
        glow(ctx, x, y, 6, '#e0af68', 0.4 * fade)
        ctx.fillStyle = '#e5c07b'
        ellipse(ctx, x, y, 3, 1 + 2 * squash)
        ctx.fill()
        ctx.strokeStyle = '#8a6a2a'
        ellipse(ctx, x, y, 3, 1 + 2 * squash)
        ctx.stroke()
        ctx.globalAlpha = 1
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
        const map = getRunMap(session.state)
        ctx.fillRect(0, 0, map.width * CELL_PX, map.height * CELL_PX)
        break
      }
      case 'gold_rush': {
        if (settings.reducedMotion) break // no full-screen flashes
        ctx.fillStyle = '#ffd76e'
        ctx.globalAlpha = fade * 0.15
        const map = getRunMap(session.state)
        ctx.fillRect(0, 0, map.width * CELL_PX, map.height * CELL_PX)
        break
      }
    }
    ctx.globalAlpha = 1
  }
}
