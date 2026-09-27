import { MAP_HEIGHT, MAP_WIDTH } from '../data/maps'
import { TOWERS, towerTier } from '../data/content'
import { effectiveCritChancePct, effectiveCritDamagePct } from '../engine/combat'
import type { RunState, Tower } from '../engine/types'
import { towerRole } from './towerCopy'
import { towerStats } from './towerStats'

// The hover card over a tower on the battlefield.
export function TowerTooltip({ state, tower }: { state: RunState; tower: Tower }) {
  const critChance = effectiveCritChancePct(state)
  return (
    <div
      className="tower-tooltip"
      data-testid="tower-tooltip"
      style={{
        left: `clamp(4px, ${(tower.cell.cx + 1) * 100 / MAP_WIDTH}%, calc(100% - 190px))`,
        top: `clamp(4px, ${tower.cell.cy * 100 / MAP_HEIGHT}%, calc(100% - 150px))`,
      }}
    >
      <strong>
        {TOWERS[tower.type].name} · T{tower.tier}
        {tower.enhance > 0 && ` +${tower.enhance}`}
      </strong>
      {TOWERS[tower.type].support ? (
        <span>
          {tower.type === 'beacon'
            ? `+${towerTier('beacon', tower.tier).auraPct}% damage to towers in range`
            : `${towerTier('mint', tower.tier).mintYield} gold / cleared wave · ⛀ ${tower.earned ?? 0} earned`}
        </span>
      ) : (
        (() => {
          // Spec rides along and range is the board's own radius
          // (Longsight, Longbow, mesa) — the tooltip quotes the numbers the
          // engine rolls, from the same helper as the tower panel.
          const { breakdown: b, rate, dps, range } = towerStats(state, tower)
          return (
            <span>
              {b.effective} dmg{b.parts.length > 0 && ` (${b.base} base +${b.totalPct - 100}%)`} ·{' '}
              {rate.toFixed(1)}/s · ≈{dps} DPS ·{' '}
              {(range / 1000).toFixed(1)} range
            </span>
          )
        })()
      )}
      {!TOWERS[tower.type].support && (
        <span>
          {towerRole(tower.type)}
          {critChance > 0 && ` · ${critChance}% crit ×${(effectiveCritDamagePct(state) / 100).toFixed(1)}`}
        </span>
      )}
      <span>
        {tower.type === 'mint'
          ? `earned via waves`
          : `${tower.kills} kills · ${tower.damageDealt} dmg dealt`}
      </span>
      <span>targets {tower.targeting} · click to manage</span>
    </div>
  )
}
