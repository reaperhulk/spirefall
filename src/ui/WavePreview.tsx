import { AFFIXES, CARAPACE_BREAK_DAMAGE, ENEMIES, TRIALS } from '../data/content'
import type { previewNextWave } from '../engine/step'
import type { EnemyType, RunState } from '../engine/types'

// The scouting report strip. Extracted from App.tsx once the mechanic-mark
// sweep (air/armor/phase/heal/split/brood/mech) grew it into a subsystem.
// Every enemy mechanic MUST have a visible tell here — that's the contract
// the marks e2e enforces.
export function WavePreview({
  state,
  preview,
  blackout,
  onFocusEnemy,
}: {
  state: RunState
  preview: ReturnType<typeof previewNextWave>
  blackout: boolean
  onFocusEnemy: (type: EnemyType) => void
}) {
  return (
    <div className="wave-preview" data-testid="wave-preview">
      {preview ? (
        <>
          <span className="preview-label">Next wave:</span>
          <span className="preview-threat" title="Total effective enemy HP this wave will field">
            ≈{preview.totalHp.toLocaleString()} HP
          </span>
          {preview.elites > 0 && (
            <span className="preview-elites" title="Elite units — snipers deal bonus damage to these">
              ⚔ {preview.elites} elite{preview.elites > 1 ? 's' : ''}
            </span>
          )}
          {(Object.entries(preview.counts) as [keyof typeof ENEMIES, number][])
            .sort(([ta, a], [tb, b]) =>
              ta.startsWith('boss') ? -1 : tb.startsWith('boss') ? 1 : b - a || ta.localeCompare(tb),
            )
            .map(([type, n]) => (
              <button
                key={type}
                className={`preview-unit${type.startsWith('boss') ? ' boss' : ''}`}
                data-testid={`preview-unit-${type}`}
                title={`${ENEMIES[type].name} — tap for the Codex entry`}
                onClick={() => onFocusEnemy(type as EnemyType)}
              >
                {n}× {ENEMIES[type].name}
                {ENEMIES[type].flying && (
                  <span className="air-mark" title="Flying — only Arrow, Tesla, Sniper, and Lance can hit it">
                    ✈
                  </span>
                )}
                {(ENEMIES[type].armor ?? 0) > 0 && (
                  <span
                    className="armor-mark"
                    title="Armored — every hit loses flat damage. Rapid fire suffers; heavy shells barely notice."
                  >
                    ▣
                  </span>
                )}
                {ENEMIES[type].phasing && (
                  <span
                    className="phase-mark"
                    data-testid={`phase-mark-${type}`}
                    title={`Phasing — flickers untargetable for ${Math.round(ENEMIES[type].phasing.hiddenTicks / 30)}s stretches. Sustained fire beats burst; nothing hits what isn't there.`}
                  >
                    ◌
                  </span>
                )}
                {ENEMIES[type].heal && (
                  <span
                    className="brood-mark"
                    data-testid={`heal-mark-${type}`}
                    title={`Healer — mends nearby wounded allies every ${Math.round(ENEMIES[type].heal.everyTicks / 30)}s. Focus it down or your damage leaks away.`}
                  >
                    ✚
                  </span>
                )}
                {ENEMIES[type].splitInto && (
                  <span
                    className="brood-mark"
                    data-testid={`split-mark-${type}`}
                    title={`Splits on death into ${ENEMIES[type].splitInto.count} ${ENEMIES[ENEMIES[type].splitInto.type].name}s — the kill is not the end of it.`}
                  >
                    ✂
                  </span>
                )}
                {ENEMIES[type].brood && (
                  <span
                    className="brood-mark"
                    data-testid={`brood-mark-${type}`}
                    title={`Spawner — births ${ENEMIES[type].brood.count} ${ENEMIES[ENEMIES[type].brood.type].name}s every ${Math.round(ENEMIES[type].brood.everyTicks / 30)}s while alive. Kill it first or drown in its children.`}
                  >
                    🐣
                  </span>
                )}
                {ENEMIES[type].mech && (
                  <span
                    className="mech-mark"
                    data-testid={`mech-mark-${type}`}
                    title={
                      ENEMIES[type].mech.kind === 'carapace'
                        ? `Carapace — periodically shells up: every hit is capped at 1 damage unless a single hit deals ${CARAPACE_BREAK_DAMAGE}+, which shatters the shell. Bring heavy shots.`
                        : 'Gale — periodically hastens the whole horde. Any slow cancels the haste; bring frost.'
                    }
                  >
                    {ENEMIES[type].mech.kind === 'carapace' ? '🛡' : '🌀'}
                  </span>
                )}
              </button>
            ))}
          {preview.affix && (
            <span className="affix-badge" title={AFFIXES[preview.affix].description}>
              {AFFIXES[preview.affix].name}
            </span>
          )}
        </>
      ) : blackout && state.phase === 'build' ? (
        <span className="preview-label" data-testid="blackout-report" title={TRIALS.blackout.description}>
          🕶 Blackout — the scouting report is dark
        </span>
      ) : (
        <>
          <span className="preview-label">Wave {state.wave}:</span>
          <span className="preview-threat">{state.enemies.length + state.pendingSpawns.length} remaining</span>
        </>
      )}
    </div>
  )
}
