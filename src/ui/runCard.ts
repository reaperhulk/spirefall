import { BIOMES } from '../data/biomes'
import { RELICS, TOWERS } from '../data/content'
import type { RunSummary, TowerType } from '../engine/types'

// The shareable run card: a canvas-rendered summary of a finished run —
// biome, outcome, the numbers, the build's damage profile, and the seed as
// a challenge. Copy it as an image, or copy a ?seed= link that drops any
// player onto the exact same battlefield.

const W = 640
const H = 360

const TOWER_COLORS: Record<string, string> = {
  arrow: '#9ece6a',
  cannon: '#e0af68',
  frost: '#7dcfff',
  tesla: '#bb9af7',
  sniper: '#73daca',
  mint: '#e5c07b',
  beacon: '#ff9e64',
}

export function drawRunCard(summary: RunSummary): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  const dpr = 2 // crisp on every share target
  canvas.width = W * dpr
  canvas.height = H * dpr
  const g = canvas.getContext('2d')!
  g.scale(dpr, dpr)

  // Backdrop.
  g.fillStyle = '#0b0e14'
  g.fillRect(0, 0, W, H)
  const glow = g.createRadialGradient(W / 2, -60, 40, W / 2, -60, 420)
  glow.addColorStop(0, summary.outcome === 'victory' ? 'rgba(158, 206, 106, 0.22)' : 'rgba(247, 118, 142, 0.16)')
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)')
  g.fillStyle = glow
  g.fillRect(0, 0, W, H)
  g.strokeStyle = '#2c3448'
  g.lineWidth = 2
  g.strokeRect(1, 1, W - 2, H - 2)

  // Header.
  g.fillStyle = '#e5c07b'
  g.font = 'bold 26px ui-monospace, monospace'
  g.fillText('SPIREFALL', 28, 46)
  g.fillStyle = '#8a93ad'
  g.font = '14px ui-monospace, monospace'
  g.fillText(BIOMES[summary.biome].name, 28, 68)

  g.textAlign = 'right'
  g.fillStyle = summary.outcome === 'victory' ? '#9ece6a' : '#f7768e'
  g.font = 'bold 22px ui-monospace, monospace'
  g.fillText(summary.outcome === 'victory' ? 'THE SPIRE STANDS' : 'THE SPIRE FALLS', W - 28, 50)
  g.textAlign = 'left'

  // Headline numbers.
  const stats: [string, string][] = [
    ['WAVES', String(summary.wavesCleared)],
    ['KILLS', summary.kills.toLocaleString()],
    ['SPARKS', `✦ ${summary.sparks.toLocaleString()}`],
  ]
  if (summary.crucible > 0) stats.push(['CRUCIBLE', `🔥 ${summary.crucible}`])
  stats.forEach(([label, value], i) => {
    const x = 28 + i * 150
    g.fillStyle = '#565f89'
    g.font = 'bold 11px ui-monospace, monospace'
    g.fillText(label, x, 108)
    g.fillStyle = '#e8ecf5'
    g.font = 'bold 26px ui-monospace, monospace'
    g.fillText(value, x, 138)
  })

  // Damage profile: the build, told in four bars.
  const entries = (Object.entries(summary.damageByTower) as [TowerType, number][])
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4)
  const total = entries.reduce((sum, [, v]) => sum + v, 0)
  g.fillStyle = '#565f89'
  g.font = 'bold 11px ui-monospace, monospace'
  g.fillText('DAMAGE BY TOWER', 28, 182)
  entries.forEach(([type, value], i) => {
    const y = 196 + i * 30
    const frac = total > 0 ? value / total : 0
    g.fillStyle = '#c0caf5'
    g.font = '13px ui-monospace, monospace'
    g.fillText(TOWERS[type].name, 28, y + 13)
    g.fillStyle = '#1a2030'
    g.fillRect(110, y, 380, 18)
    g.fillStyle = TOWER_COLORS[type] ?? '#8a93ad'
    g.fillRect(110, y, Math.max(4, 380 * frac), 18)
    g.fillStyle = '#8a93ad'
    g.fillText(`${Math.round(frac * 100)}%`, 500, y + 13)
  })

  // Relic loadout: the build's other half, in the free right column.
  if (summary.relics.length > 0) {
    const rx = 520
    g.fillStyle = '#565f89'
    g.font = 'bold 11px ui-monospace, monospace'
    g.fillText(`RELICS (${summary.relics.length})`, rx, 182)
    const RARITY_COLORS = { common: '#8a93ad', rare: '#7dcfff', legendary: '#e5c07b' } as const
    summary.relics.slice(0, 8).forEach((r, i) => {
      g.fillStyle = RARITY_COLORS[RELICS[r].rarity]
      g.font = '11px ui-monospace, monospace'
      let name = RELICS[r].name
      while (name.length > 3 && g.measureText(name).width > W - rx - 24) name = `${name.slice(0, -2)}…`
      g.fillText(name, rx, 198 + i * 16)
    })
    if (summary.relics.length > 8) {
      g.fillStyle = '#565f89'
      g.fillText(`+${summary.relics.length - 8} more`, rx, 198 + 8 * 16)
    }
  }

  // Footer: the challenge.
  g.fillStyle = '#565f89'
  g.font = '12px ui-monospace, monospace'
  g.fillText('Same seed, same battlefield — think you can go deeper?', 28, H - 34)
  g.fillStyle = '#7aa2f7'
  g.font = 'bold 13px ui-monospace, monospace'
  g.fillText(`seed: ${summary.seed}`, 28, H - 14)
  return canvas
}

export function challengeLink(summary: RunSummary): string {
  const base = `${window.location.origin}${window.location.pathname}`
  return `Wave ${summary.wavesCleared} in ${BIOMES[summary.biome].name} — beat it: ${base}?seed=${encodeURIComponent(summary.seed)}`
}
