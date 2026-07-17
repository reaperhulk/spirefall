import { useEffect, useRef, useState } from 'react'
import {
  ABILITIES,
  AFFIXES,
  ARROW_AIR_BONUS_PCT,
  BOSS_WAVE_INTERVAL,
  CATACLYSMS,
  CATACLYSM_WAVE_INTERVAL,
  CRIT_BASE_DAMAGE_PCT,
  ENEMIES,
  ENHANCE_COST_GROWTH_PCT,
  ENHANCE_DAMAGE_PCT,
  RELIC_OFFER_SIZE,
  RELIC_WAVE_INTERVAL,
  REPAIR_CASTS_PER_WAVE,
  REPAIR_MAX_PER_CAST,
  SELL_REFUND_PCT,
  SNIPER_ELITE_BONUS_PCT,
  TOWERS,
  TRIALS,
  VICTORY_WAVE,
  WAVE_CLEAR_KNIT_HP,
  type EnemyDef,
} from '../data/content'
import type { EnemyType, TowerType } from '../engine/types'
import { enemyColor } from './render'

// The Codex: an in-game reference for enemies, towers, and the rules that
// aren't obvious from playing (armor math, elite bonuses, repair caps…).
// Everything renders straight from the data files — the same objects the
// engine reads — so the reference can never drift from the sim.

type CodexTab = 'enemies' | 'towers' | 'mechanics'

const secs = (ticks: number): string => {
  const s = ticks / 30
  return `${Number.isInteger(s) ? s : s.toFixed(1)}s`
}
const cells = (millicells: number): string => {
  const c = millicells / 1000
  return `${Number.isInteger(c) ? c : c.toFixed(1)}`
}
// cells per second, from millicells per tick
const speedCps = (mcPerTick: number): string => ((mcPerTick * 30) / 1000).toFixed(1)

function enemyTraits(type: EnemyType, def: EnemyDef): string[] {
  const traits: string[] = []
  if (def.flying) traits.push('Flying — walks over the maze; only Arrow, Tesla, and Sniper can target it')
  if (def.phasing)
    traits.push(
      `Phasing — untargetable for ${secs(def.phasing.hiddenTicks)} out of every ${secs(def.phasing.visibleTicks + def.phasing.hiddenTicks)}`,
    )
  if (def.heal)
    traits.push(
      `Heals nearby enemies for ${def.heal.amount} HP (scaling) every ${secs(def.heal.everyTicks)} within ${cells(def.heal.radius)} cells`,
    )
  if (def.brood)
    traits.push(
      `Hatches ${def.brood.count}× ${ENEMIES[def.brood.type].name} every ${secs(def.brood.everyTicks)} while alive — hatchlings pay no bounty`,
    )
  if (def.splitInto) traits.push(`Splits into ${def.splitInto.count}× ${ENEMIES[def.splitInto.type].name} on death`)
  if (def.elite) traits.push(`Elite — Snipers deal +${SNIPER_ELITE_BONUS_PCT}% damage to it`)
  if ((def.shield ?? 0) > 0) traits.push(`Shield ${def.shield} — hits dealing ${def.shield} or less bounce off entirely (scales with waves)`)
  if ((def.armor ?? 0) > 0) traits.push('Armored — every hit loses flat damage from the midgame on; rapid fire suffers most')
  if (type === 'splitling') traits.push('Only appears when an Amalgam dies')
  if (type.startsWith('boss')) traits.push(`Boss — leads every ${BOSS_WAVE_INTERVAL}th wave (the roster rotates)`)
  return traits
}

function tierSpecial(type: TowerType, tierIdx: number): string {
  const t = TOWERS[type].tiers[tierIdx]!
  if (t.splashRadius) return `splash ${cells(t.splashRadius)} cells`
  if (t.slowFactor) return `slows to ${t.slowFactor}% for ${secs(t.slowTicks ?? 0)}`
  if (t.chain) return `chains to ${t.chain}`
  if (t.mintYield) return `⛀ ${t.mintYield} per wave`
  if (t.auraPct) return `+${t.auraPct}% damage aura`
  return '—'
}

const TOWER_NOTES: Partial<Record<TowerType, string>> = {
  arrow: `Deals +${ARROW_AIR_BONUS_PCT}% damage to fliers — the sky is its job.`,
  cannon: 'Splash mows packed hordes; heavy shells barely notice armor. Cannot target fliers.',
  frost: 'Slows everything it touches. The slow is the payload — the damage is a courtesy.',
  tesla: 'Arcs between nearby enemies; great against tight columns.',
  sniper: `Executes elites (+${SNIPER_ELITE_BONUS_PCT}% to them) and its heavy single shots punch through shields and armor.`,
  mint: 'Never attacks — pays gold every cleared wave. An investment against future waves.',
  beacon: 'Never attacks — boosts towers in range. Auras do NOT stack: a tower takes only the strongest beacon.',
}

interface MechanicEntry {
  title: string
  body: string
}

const MECHANICS: MechanicEntry[] = [
  {
    title: 'Armor',
    body:
      'Armor subtracts a flat amount from every single hit (a minimum of 1 damage always lands). It starts at zero and grows as enemy scaling passes its early-game baseline, so armored types bend your build from the midgame on. Rapid chip fire loses a slice of every pellet; heavy shells barely notice.',
  },
  {
    title: 'Shields',
    body:
      'A shield is a threshold: any hit dealing shield-or-less damage bounces off entirely, and anything above it lands in full (shields judge the pre-crit damage). Shields scale with the wave curve, so weak chip that worked early can start bouncing late.',
  },
  {
    title: 'Elites & bosses',
    body: `Heavy units marked ⚔ are elites — Snipers deal +${SNIPER_ELITE_BONUS_PCT}% damage to them. Every ${BOSS_WAVE_INTERVAL}th wave is led by a boss, and the boss roster rotates as you go deeper.`,
  },
  {
    title: 'Flying',
    body: `Fliers (✈) ignore your maze and fly straight for the Spire. Only Arrow, Tesla, and Sniper towers can target them — and Arrows deal +${ARROW_AIR_BONUS_PCT}% to them.`,
  },
  {
    title: 'Crits',
    body: `Some meta upgrades and relics grant crit chance. A crit deals ${CRIT_BASE_DAMAGE_PCT}% damage — but shields judge the hit BEFORE the crit roll, so crits never punch through a shield the base hit couldn't.`,
  },
  {
    title: 'Repair',
    body: `Repair mends up to ${REPAIR_MAX_PER_CAST} HP per cast and the price per HP climbs each wave. While a wave is live, repair crews manage only ${REPAIR_CASTS_PER_WAVE} cast${REPAIR_CASTS_PER_WAVE > 1 ? 's' : ''}; they recover when it clears. The Spire also knits ${WAVE_CLEAR_KNIT_HP} HP on its own after every cleared wave.`,
  },
  {
    title: 'Selling & enhancing',
    body: `Selling a tower refunds ${SELL_REFUND_PCT}% of everything invested in it. Past tier 3, towers can be enhanced forever: +${ENHANCE_DAMAGE_PCT}% damage per level, each level costing ${ENHANCE_COST_GROWTH_PCT}% of the last — the unbounded late-game gold sink.`,
  },
  {
    title: 'Relics',
    body: `Every ${RELIC_WAVE_INTERVAL} waves the ruins offer ${RELIC_OFFER_SIZE} relics — take one, reroll once, or bank gold for skipping. Relics last for the run only.`,
  },
  {
    title: 'Abilities',
    body:
      'Ability cooldowns only recover while a wave is live — build-phase downtime is free planning time, not free cooldown time. Cooldown reduction (meta and relics) therefore shortens real combat time between casts.',
  },
  {
    title: 'Wave affixes',
    body: 'From wave 6 on, some waves roll a modifier — the scouting report shows it before you commit. Hover the badge for exact numbers.',
  },
  {
    title: 'Victory & Endless',
    body: `Clearing wave ${VICTORY_WAVE} wins the run — bank it, or push into Endless where clearing every ${CATACLYSM_WAVE_INTERVAL}th wave permanently stacks a Cataclysm onto the world.`,
  },
]

export function CodexModal({ focusEnemy, onClose }: { focusEnemy?: EnemyType | null; onClose: () => void }) {
  const [tab, setTab] = useState<CodexTab>('enemies')
  const bodyRef = useRef<HTMLDivElement | null>(null)

  // Opened from a wave-preview chip: land on that enemy's entry.
  useEffect(() => {
    if (!focusEnemy || !bodyRef.current) return
    const el = bodyRef.current.querySelector(`[data-codex-enemy="${focusEnemy}"]`)
    if (el) el.scrollIntoView({ block: 'center' })
  }, [focusEnemy])

  const enemies = (Object.entries(ENEMIES) as [EnemyType, EnemyDef][]).sort(
    ([, a], [, b]) => a.unlockWave - b.unlockWave || a.cost - b.cost,
  )

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal codex"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Codex"
        data-testid="codex-modal"
      >
        <div className="codex-head">
          <h2>Codex</h2>
          <div className="codex-tabs" role="tablist">
            {(['enemies', 'towers', 'mechanics'] as CodexTab[]).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                className={`codex-tab${tab === t ? ' active' : ''}`}
                data-testid={`codex-tab-${t}`}
                onClick={() => setTab(t)}
              >
                {t === 'enemies' ? 'Enemies' : t === 'towers' ? 'Towers' : 'Mechanics'}
              </button>
            ))}
          </div>
          <button className="panel-close" aria-label="Close the codex" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="codex-body" ref={bodyRef}>
          {tab === 'enemies' &&
            enemies.map(([type, def]) => (
              <div
                key={type}
                className={`codex-entry${focusEnemy === type ? ' focused' : ''}`}
                data-codex-enemy={type}
                data-testid={`codex-enemy-${type}`}
                data-focused={focusEnemy === type || undefined}
              >
                <div className="codex-entry-head">
                  <span className="codex-swatch" style={{ background: enemyColor(type) }} />
                  <strong>{def.name}</strong>
                  {def.flying && <span className="air-mark">✈</span>}
                  {(def.armor ?? 0) > 0 && <span className="armor-mark">▣</span>}
                  {def.elite && <span className="codex-elite">⚔ elite</span>}
                  <span className="codex-unlock">
                    {type === 'splitling' ? 'from Amalgams' : type.startsWith('boss') ? 'boss' : `wave ${def.unlockWave}+`}
                  </span>
                </div>
                <div className="codex-stats">
                  <span title="Base HP — scales up every wave">♥ {def.hp}</span>
                  <span title="Speed in cells per second">→ {speedCps(def.speed)} c/s</span>
                  <span title="Damage to the Spire if it arrives">🏰 −{def.damage}</span>
                  <span title="Gold per kill">⛀ {def.bounty}</span>
                  {def.pack > 1 && <span title="Spawns in groups of this many">×{def.pack} pack</span>}
                </div>
                {enemyTraits(type, def).map((t) => (
                  <p key={t} className="codex-trait">
                    {t}
                  </p>
                ))}
              </div>
            ))}

          {tab === 'towers' &&
            (Object.keys(TOWERS) as TowerType[]).map((type) => {
              const def = TOWERS[type]
              return (
                <div key={type} className="codex-entry" data-testid={`codex-tower-${type}`}>
                  <div className="codex-entry-head">
                    <span className={`tower-dot tower-${type}`} />
                    <strong>{def.name}</strong>
                    {def.hitsAir ? <span className="air-mark" title="Can target fliers">✈</span> : <span className="codex-noair">ground only</span>}
                  </div>
                  <table className="codex-tiers">
                    <thead>
                      <tr>
                        <th>Tier</th>
                        <th>Cost</th>
                        <th>Dmg</th>
                        <th>Range</th>
                        <th>Rate</th>
                        <th>Special</th>
                      </tr>
                    </thead>
                    <tbody>
                      {def.tiers.map((t, i) => (
                        <tr key={i}>
                          <td>{i + 1}</td>
                          <td>⛀ {t.cost}</td>
                          <td>{t.damage || '—'}</td>
                          <td>{t.range ? cells(t.range) : '—'}</td>
                          <td>{t.cooldown ? `${(30 / t.cooldown).toFixed(1)}/s` : '—'}</td>
                          <td>{tierSpecial(type, i)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {TOWER_NOTES[type] && <p className="codex-trait">{TOWER_NOTES[type]}</p>}
                </div>
              )
            })}

          {tab === 'mechanics' && (
            <>
              {MECHANICS.map((m) => (
                <div key={m.title} className="codex-entry" data-testid={`codex-mechanic-${m.title.toLowerCase().replace(/[^a-z]+/g, '-')}`}>
                  <div className="codex-entry-head">
                    <strong>{m.title}</strong>
                  </div>
                  <p className="codex-trait">{m.body}</p>
                </div>
              ))}
              <div className="codex-entry">
                <div className="codex-entry-head">
                  <strong>Ability reference</strong>
                </div>
                {Object.values(ABILITIES).map((a) => (
                  <p key={a.name} className="codex-trait">
                    <strong>{a.name}</strong> — {secs(a.cooldown)} cooldown
                    {a.damage ? `, ${a.damage} damage in ${cells(a.radius)} cells` : ''}
                    {a.slowFactor ? `, slows to ${a.slowFactor}% for ${secs(a.slowTicks ?? 0)} in ${cells(a.radius)} cells` : ''}
                    {a.durationTicks ? `, lasts ${secs(a.durationTicks)}` : ''}
                  </p>
                ))}
              </div>
              <div className="codex-entry">
                <div className="codex-entry-head">
                  <strong>Trials</strong>
                </div>
                {Object.values(TRIALS).map((t) => (
                  <p key={t.name} className="codex-trait">
                    <strong>{t.name}</strong> — {t.description} (+{t.sparkBonusPct}% ✦)
                  </p>
                ))}
              </div>
              <div className="codex-entry">
                <div className="codex-entry-head">
                  <strong>Wave affixes</strong>
                </div>
                {Object.values(AFFIXES).map((a) => (
                  <p key={a.name} className="codex-trait">
                    <strong>{a.name}</strong> — {a.description}
                  </p>
                ))}
              </div>
              <div className="codex-entry">
                <div className="codex-entry-head">
                  <strong>Cataclysms (Endless)</strong>
                </div>
                {Object.values(CATACLYSMS).map((c) => (
                  <p key={c.name} className="codex-trait">
                    <strong>{c.name}</strong> — {c.description}
                  </p>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
