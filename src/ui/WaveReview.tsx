import { ENEMIES, TOWERS } from '../data/content'
import { towerRangeOnBoard } from '../engine/combat'
import { cellCenter, distSq } from '../engine/grid'
import { getRunMap } from '../engine/mapgen'
import { navigation } from '../engine/navigation'
import type { CellPos, RunState } from '../engine/types'

export interface WaveFinding { title: string; detail: string; cell: CellPos; towerId?: number }
export function waveFindings(s: RunState): WaveFinding[] {
  const findings: WaveFinding[] = [], map = getRunMap(s)
  const leaks = (s.leaks ?? []).filter(l => l.wave === s.wave)
  if (leaks.length) {
    const worst = [...leaks].sort((a, b) => b.damage - a.damage)[0]!
    findings.push({ title: `${leaks.length} escaped · ${leaks.reduce((n, l) => n + l.damage, 0)} HP lost`,
      detail: ENEMIES[worst.enemy].flying ? 'Fliers bypass the maze. Cover the direct approach with Arrow, Tesla, Sniper or Lance.' : `${ENEMIES[worst.enemy].name} caused the heaviest leak. Add damage near the Spire and hold a spell for stragglers.`, cell: map.spire })
  }
  const blocked = s.towers.filter(t => (t.waveBlocked ?? 0) > 0).sort((a, b) => (b.waveBlocked ?? 0) - (a.waveBlocked ?? 0))[0]
  if (blocked) findings.push({ title: `${TOWERS[blocked.type].name}: ${blocked.waveBlocked} blocked hits`, detail: 'Shields rejected these attacks. Add a heavy Cannon or shield-piercing Sniper, or choose Longbow for an Arrow.', cell: blocked.cell, towerId: blocked.id })
  const idle = s.towers.find(t => !TOWERS[t.type].support && t.waveShots === 0)
  if (idle) findings.push({ title: `${TOWERS[idle.type].name} never fired`, detail: 'This tower was present at wave start and found no target. Check its range and air targeting before investing further.', cell: idle.cell, towerId: idle.id })
  const path = navigation(map, s.towers).path
  const combat = s.towers.filter(t => !TOWERS[t.type].support).map(t => ({ at: cellCenter(t.cell), range: towerRangeOnBoard(s, map, t) }))
  const gap = path.slice(Math.floor(path.length * 0.7)).find(c => !combat.some(t => distSq(t.at, cellCenter(c)) <= t.range * t.range))
  if (gap) findings.push({ title: 'Final approach has a coverage gap', detail: 'Enemies reaching this stretch leave every tower’s range. Place a rear guard here; its range preview shows the added protection.', cell: gap })
  const coins = s.coins.reduce((n, c) => n + c.gold, 0)
  if (coins && s.coins[0]) findings.push({ title: `${coins} optional gold still on the field`, detail: (s.rulesVersion ?? 4) >= 5 ? 'Normal bounty is already banked. Sweep these small bonuses during planning if useful; they will wait until combat resumes.' : 'Sweep these bounties before the next wave resumes their expiry clock.', cell: { cx: Math.floor(s.coins[0].pos.x / 1000), cy: Math.floor(s.coins[0].pos.y / 1000) } })
  return findings
}
export function WaveReview({ state, onFocus, onClose }: { state: RunState; onFocus: (finding: WaveFinding) => void; onClose: () => void }) {
  const findings = waveFindings(state), stats = state.waveStats
  return <div className="modal-backdrop" onClick={onClose}><section className="modal wave-review" role="dialog" aria-modal="true" aria-label="Wave debrief" onClick={e => e.stopPropagation()}>
    <h2>Wave {state.wave} · what to change</h2>
    {stats && <p>{stats.kills} kills · {stats.bankedGold} bounty banked · {stats.bonusCollected} bonus collected · {stats.bonusMissed} optional gold expired.</p>}
    <p>Select a finding to highlight its location on the battlefield.</p>
    {findings.length ? findings.map((f, i) => <button key={i} className="review-finding" data-testid={`wave-finding-${i}`} onClick={() => onFocus(f)}><strong>{f.title}</strong><span>{f.detail}</span></button>) : <p>No leaks, blocked attacks or obvious coverage gaps. Prepare for the next wave’s threats.</p>}
    <button className="primary-btn" onClick={onClose}>Back to the battlefield</button>
  </section></div>
}
