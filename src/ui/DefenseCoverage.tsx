import { TOWERS } from '../data/content'
import type { Tower } from '../engine/types'
export function DefenseCoverage({ towers }: { towers: Tower[] }) {
  const idle = towers.filter(t => !TOWERS[t.type].support && t.damageDealt === 0)
  if (!idle.length) return null
  return <details className="defense-coverage"><summary>Check coverage · {idle.length} towers with no recorded damage</summary>
    <p>These may be recent purchases, out of range, or hitting shields. Use the replay to inspect their firing lanes before moving or replacing them.</p>
    <ul>{idle.map(t => <li key={t.id}>{TOWERS[t.type].name} at {t.cell.cx+1}, {t.cell.cy+1} · {t.shots} shots · {t.damageDealt} damage</li>)}</ul>
  </details>
}
