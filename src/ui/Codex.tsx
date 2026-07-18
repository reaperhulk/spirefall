import { useEffect, useRef, useState } from 'react'
import {
  ABILITIES,
  AFFIXES,
  ARROW_AIR_BONUS_PCT,
  BOSS_WAVE_INTERVAL,
  CATACLYSMS,
  CATACLYSM_WAVE_INTERVAL,
  CRIT_BASE_DAMAGE_PCT,
  CRUCIBLE_HP_PCT_PER_RANK,
  CRUCIBLE_SPARK_PCT_PER_RANK,
  CRUCIBLE_TIERS,
  ENEMIES,
  ENHANCE_COST_GROWTH_PCT,
  ENHANCE_DAMAGE_PCT,
  RELIC_OFFER_SIZE,
  RELIC_WAVE_INTERVAL,
  RELICS,
  REPAIR_CASTS_PER_WAVE,
  REPAIR_MAX_PER_CAST,
  SELL_REFUND_PCT,
  SNIPER_ELITE_BONUS_PCT,
  TOWER_SPECS,
  TOWERS,
  TRIAL_IDS,
  TRIALS,
  VICTORY_WAVE,
  LANCE_MAX_STACKS,
  LANCE_RAMP_PCT,
  WAVE_CLEAR_KNIT_HP,
  type EnemyDef,
} from '../data/content'
import { BIOMES, type BiomeId } from '../data/biomes'
import type { EnemyType, RelicId, RunState, TowerType } from '../engine/types'
import {
  effectiveAbilityCooldown,
  effectiveDamagePct,
  effectiveTowerCooldown,
  effectiveTowerRange,
} from '../engine/combat'
import { enemyColor } from './render'

// The Codex: an in-game reference for enemies, towers, and the rules that
// aren't obvious from playing (armor math, elite bonuses, repair caps…).
// Everything renders straight from the data files — the same objects the
// engine reads — so the reference can never drift from the sim.

type CodexTab = 'enemies' | 'towers' | 'relics' | 'mechanics'

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
  if (def.mech?.kind === 'carapace')
    traits.push(
      'Carapace — periodically raises a shell that caps every hit at 1 damage. A single heavy blow (40+) shatters it instantly: cannons and snipers answer, chip waits it out',
    )
  if (def.mech?.kind === 'gale')
    traits.push('Gale Surge — periodically hastens the whole horde. Slows override the haste: frost coverage cancels the storm')
  if (type === 'splitling') traits.push('Only appears when an Amalgam dies')
  if (type.startsWith('boss')) traits.push(`Boss — leads every ${BOSS_WAVE_INTERVAL}th wave (the roster rotates)`)
  return traits
}

// The per-tier specials, compressed to one tier-progression line under the
// table (T1 → T2 → T3). As a table column this was the widest cell by far —
// prose belongs under the numbers, not beside them.
function specialProgression(type: TowerType): string | null {
  const [a, b, c] = TOWERS[type].tiers
  if (a.splashRadius) return `Splash ${cells(a.splashRadius)} → ${cells(b.splashRadius!)} → ${cells(c.splashRadius!)} cells around the target`
  if (a.slowFactor)
    return `Slows to ${a.slowFactor}/${b.slowFactor}/${c.slowFactor}% speed for ${secs(a.slowTicks!)}/${secs(b.slowTicks!)}/${secs(c.slowTicks!)}`
  if (a.chain) return `Chains to ${a.chain} → ${b.chain} → ${c.chain} enemies per shot`
  if (a.mintYield) return `Pays ⛀ ${a.mintYield} → ${b.mintYield} → ${c.mintYield} every cleared wave`
  if (a.auraPct) return `Aura: +${a.auraPct}% → +${b.auraPct}% → +${c.auraPct}% damage to towers in range`
  if (type === 'lance')
    return `Ramp: +${LANCE_RAMP_PCT}% per consecutive hit on one target (cap ${LANCE_MAX_STACKS}); switching resets`
  return null
}

const TOWER_NOTES: Partial<Record<TowerType, string>> = {
  arrow: `Deals +${ARROW_AIR_BONUS_PCT}% damage to fliers — the sky is its job.`,
  cannon: 'Splash mows packed hordes; heavy shells barely notice armor. Cannot target fliers.',
  frost: 'Slows everything it touches. The slow is the payload — the damage is a courtesy.',
  tesla: 'Arcs between nearby enemies; great against tight columns.',
  sniper: `Executes elites (+${SNIPER_ELITE_BONUS_PCT}% to them) and its heavy single shots punch through shields and armor.`,
  mint: 'Never attacks — pays gold every cleared wave. An investment against future waves.',
  beacon: 'Never attacks — boosts towers in range. Auras do NOT stack: a tower takes only the strongest beacon.',
  lance: 'Commits to one mark: every consecutive hit lands harder. Set it to Strongest targeting and let it duel the boss — against hordes it keeps starting over.',
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
    body: `Clearing wave ${VICTORY_WAVE} wins the run — bank it, or push into Endless where clearing every ${CATACLYSM_WAVE_INTERVAL}th wave strikes a Cataclysm: two dooms offered, you choose which becomes permanent. The next wave waits until you do.`,
  },
  {
    title: 'The Crucible',
    body: `Each victory in a cycle hardens the next run: +${CRUCIBLE_HP_PCT_PER_RANK}% enemy HP and +${CRUCIBLE_SPARK_PCT_PER_RANK}% Sparks per rank. Rank milestones add named tiers — ${CRUCIBLE_TIERS.map((t) => `${t.name} (rank ${t.rank}: ${t.description})`).join('; ')}. Ascending resets it.`,
  },
  {
    title: 'Trials',
    body: `Opt-in handicaps chosen before a run, each paying bonus Sparks: ${TRIAL_IDS.map((t) => `${TRIALS[t].name} (+${TRIALS[t].sparkBonusPct}%)`).join(', ')}. Stack hardship, stack payout.`,
  },
  {
    title: 'Replays',
    body: 'Every run records its commands. Watch your last run from the run-over screen, paste a copied replay in Settings, or open a shared replay link — determinism plays it back exactly.',
  },
]

export function CodexModal({
  state,
  focusEnemy,
  onClose,
}: {
  state: RunState
  focusEnemy?: EnemyType | null
  onClose: () => void
}) {
  const [tab, setTab] = useState<CodexTab>('enemies')
  const bodyRef = useRef<HTMLDivElement | null>(null)

  // Effective vs base: when this run modifies a number (Spire Tree, relics,
  // cataclysms), show what YOUR towers actually do, with base alongside.
  const withBase = (effective: string | number, base: string | number) =>
    String(effective) === String(base) ? (
      <>{effective}</>
    ) : (
      <>
        {effective} <span className="codex-base">({base})</span>
      </>
    )
  const anyTowerModifiers =
    (Object.keys(TOWERS) as TowerType[]).some((t) => effectiveDamagePct(state, t) !== 100) ||
    state.relics.includes('quickdraw') ||
    state.relics.includes('longsight')

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
            {(['enemies', 'towers', 'relics', 'mechanics'] as CodexTab[]).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                className={`codex-tab${tab === t ? ' active' : ''}`}
                data-testid={`codex-tab-${t}`}
                onClick={() => setTab(t)}
              >
                {t === 'enemies' ? 'Enemies' : t === 'towers' ? 'Towers' : t === 'relics' ? 'Relics' : 'Mechanics'}
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

          {tab === 'towers' && (
            <>
              {anyTowerModifiers && (
                <p className="codex-note" data-testid="codex-modifier-note">
                  Numbers include this run's modifiers — Spire Tree, relics, cataclysms. Base values in parentheses.
                </p>
              )}
              <p className="codex-note codex-note-muted">
                DPS is per single target — splash and chain multiply it across every enemy hit; armor taxes fast
                firers hardest.
              </p>
              {(Object.keys(TOWERS) as TowerType[]).map((type) => {
                const def = TOWERS[type]
                const dmgPct = effectiveDamagePct(state, type)
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
                          <th>DPS</th>
                          <th>Range</th>
                        </tr>
                      </thead>
                      <tbody>
                        {def.tiers.map((t, i) => {
                          const tier = (i + 1) as 1 | 2 | 3
                          const dmg = Math.floor((t.damage * dmgPct) / 100)
                          const range = effectiveTowerRange(state, type, tier)
                          const cd = effectiveTowerCooldown(state, type, tier)
                          const fires = t.damage > 0 && t.cooldown > 0
                          return (
                            <tr key={i}>
                              <td>{tier}</td>
                              <td>⛀ {t.cost}</td>
                              <td>{t.damage ? withBase(dmg, t.damage) : '—'}</td>
                              <td>{fires ? withBase(Math.round((dmg * 30) / cd), Math.round((t.damage * 30) / t.cooldown)) : '—'}</td>
                              <td>{t.range ? withBase(cells(range), cells(t.range)) : '—'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    {specialProgression(type) && <p className="codex-trait">{specialProgression(type)}</p>}
                    {TOWER_SPECS[type]?.map((sp) => (
                      <p key={sp.id} className="codex-trait">
                        <strong>T3 · {sp.name}</strong> (⛀ {sp.cost}) — {sp.description}
                      </p>
                    ))}
                    {TOWER_NOTES[type] && <p className="codex-trait">{TOWER_NOTES[type]}</p>}
                  </div>
                )
              })}
            </>
          )}

          {tab === 'relics' && (
            <>
              <p className="codex-trait" data-testid="codex-relic-count">
                Every {RELIC_WAVE_INTERVAL} waves the Spire offers {RELIC_OFFER_SIZE} relics — pick one, or skip for
                gold. Relics you hold this run are marked ✦ ({state.relics.length} of{' '}
                {Object.keys(RELICS).length} held).
              </p>
              {(['legendary', 'rare', 'common'] as const).map((rarity) => (
                <div key={rarity}>
                  <h3 className={`codex-rarity ${rarity}`}>{rarity}</h3>
                  {(Object.entries(RELICS) as [RelicId, (typeof RELICS)[RelicId]][])
                    .filter(([, def]) => def.rarity === rarity)
                    .sort(([, a], [, b]) => a.name.localeCompare(b.name))
                    .map(([id, def]) => (
                      <div
                        key={id}
                        className={`codex-entry${state.relics.includes(id) ? ' owned' : ''}`}
                        data-testid={`codex-relic-${id}`}
                      >
                        <div className="codex-entry-head">
                          <strong>
                            {def.name}
                            {state.relics.includes(id) && <span className="codex-owned"> ✦ held</span>}
                          </strong>
                        </div>
                        <p className="codex-trait">{def.description}</p>
                      </div>
                    ))}
                </div>
              ))}
            </>
          )}

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
                {(Object.entries(ABILITIES) as [Parameters<typeof effectiveAbilityCooldown>[1], (typeof ABILITIES)[keyof typeof ABILITIES]][]).map(
                  ([id, a]) => (
                    <p key={a.name} className="codex-trait">
                      <strong>{a.name}</strong> — {withBase(secs(effectiveAbilityCooldown(state, id)), secs(a.cooldown))} cooldown
                      {a.damage ? `, ${a.damage} damage in ${cells(a.radius)} cells` : ''}
                      {a.slowFactor ? `, slows to ${a.slowFactor}% for ${secs(a.slowTicks ?? 0)} in ${cells(a.radius)} cells` : ''}
                      {a.durationTicks ? `, lasts ${secs(a.durationTicks)}` : ''}
                    </p>
                  ),
                )}
              </div>
              <div className="codex-entry">
                <div className="codex-entry-head">
                  <strong>Biomes</strong>
                </div>
                <p className="codex-trait">
                  Every battlefield is generated fresh from the run's seed inside its biome's rules — the biome decides
                  the strategic situation, the seed decides the terrain. Biomes unlock as you progress.
                </p>
                {(Object.keys(BIOMES) as BiomeId[]).map((b) => (
                  <p key={b} className="codex-trait">
                    <strong>{BIOMES[b].name}</strong> — {BIOMES[b].description}
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
