import { ENEMIES } from '../data/content'
import type { RunSummary } from '../engine/types'
export function RunLessons({ summary }: { summary: RunSummary }) {
  const leaks = summary.leaks ?? []
  const totals = new Map<string, number>()
  for (const leak of leaks) totals.set(leak.enemy, (totals.get(leak.enemy) ?? 0) + leak.damage)
  const ordered = [...totals].sort((a,b) => b[1]-a[1])
  if (!ordered.length) return <p className="run-flavor">No recorded leaks. An abandoned run may end before the defense is tested.</p>
  const culprit = ordered[0]![0] as keyof typeof ENEMIES
  const advice = ENEMIES[culprit].flying ? 'Extend Arrow, Tesla or Sniper coverage along the direct air route.' : ENEMIES[culprit].shield > 0 ? 'Bring heavier hits or shield-piercing Snipers; rapid chip damage is blocked.' : culprit === 'healer' ? 'Target healers before they restore the front line.' : culprit === 'boss_final' ? 'Save command charges for the Sovereign’s exposed core; Frost and splash contain its escort.' : culprit.startsWith('boss') ? 'Hold the guardian in overlapping Frost and heavy-fire lanes; use its scouting report to prepare for the signature attack.' : 'Cover the late route and overlap Frost with damage towers; check the next-wave report before sending.'
  return <section className="run-lessons" aria-label="Defense review">
    <h3>What broke through</h3><p><strong>{ENEMIES[culprit].name}</strong> caused the most Spire damage. {advice}</p>
    <div className="records-row">{ordered.map(([type, damage]) => <span key={type}>{ENEMIES[type as keyof typeof ENEMIES].name}: <strong>{damage} HP</strong></span>)}</div>
    <details><summary>Leak timeline · {leaks.length} arrivals</summary><ol>{leaks.map((leak,i) => <li key={i}>Wave {leak.wave}, {Math.floor(leak.tick / 30)}s · {ENEMIES[leak.enemy].name} · −{leak.damage} HP</li>)}</ol></details>
  </section>
}
