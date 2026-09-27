# Project review — September 27, 2026

A correctness and engineering review of Spirefall at `8669213`, and what
shipped in response. Earlier reviews ([september-review.md](september-review.md),
[incremental-review.md](incremental-review.md)) covered design and pacing;
this one covered the engine, the UI shell and persistence, and the tooling.
Everything below landed on `main`, one commit per theme, each through
`npm run check` and the functional Playwright suite.

## Saves: an account could be wiped by ordinary play

Loading a save validates its run against the engine invariants. Four
invariants rejected states the engine really reaches: gale-hastened enemies
(`slowFactor` 140), repairs granted by Emberbound Crews, a relic offer left
pending into a wave, and an enemy burned to 0 hp at the end of a tick. A
failed run check rejected the **whole** save, the game booted a fresh
account, and within seconds autosave overwrote the real save and then its
backup.

Fixed in `1060b0f`: the invariants match the engine; an unrestorable run is
dropped on its own (the account survives, and the player is told); an
unreadable save is copied to `spirefall-save-corrupt` before anything can
overwrite it; a save too large with its recording retries without it.

## UI shell (`e51f545`)

| Problem | Fix |
|---|---|
| `set_beam` sent on every mouse move; every command is logged and saved | One command per cell entered |
| Space from a replay started a run stuck in replay mode (dialogs hidden) | `launchRun` leaves the replay; e2e test |
| Export read the last stored save, stale exactly when saving failed | Export reads the running game |
| Every build click serialised the whole run and recording | Build-phase saves coalesce into one trailing save |
| A daily crossing UTC midnight was never recorded | The daily's own date is used |
| Multi-MB replay links; "copied ✓" shown even on failure | Links capped at 32k chars with a fallback; ✓ only on success |
| Harness `spawnHorde` edited state behind the recording | The recording restarts at the edited state |
| Audio listeners and the music interval were never torn down | Effect-owned, with cleanup |
| OS reduced-motion ignored on canvas; tabs without keyboard support; live region chatter; raw enemy ids read out; colour assist skipped shot beams | Each fixed |

## Engine: rules 7 (`713b676`)

Gated behind rules 7; `fixtures/rules-6-goldens.json` proves rules-6 runs and
replays keep their exact outcomes.

- An enemy at 0 hp (executed, or burned last tick) can no longer reach the
  Spire. Collecting the dead before movement was tried first and rejected:
  it moves coin drop positions, which tipped the cannon-wall fuzz pin
  (verdant/gamma at 8k: 23 → 24 waves, a win) and the career income pins.
- Gale haste no longer counts as "slowed" for frost bonuses.
- A regular relic offer clears a pending guardian-spoils flag instead of
  inheriting it; the three offer paths share one `offerRelics`.
- Shatterheart bursts apply after the kill pass: no same-tick cascades.

Outcome-neutral (rules-4/5/6 goldens unchanged): integer `isqrt` and `r * r`
instead of `Math.sqrt` / `**`, integer shrine placement, floored aim
coordinates, battlefield names that match their structure (107 of 153 seeds
mismatched), the first Cataclysm on the countdown, daily wins no longer
climbing the ladder or breaking seals, and dead code removed.

Goldens: `active-rich` clears 15 waves (was 14); everything else moved only
its hash. The balance envelope and fuzz pins pass unchanged.

## Tooling

- `e2e/`, `scripts/` and the Playwright config are typechecked
  (`tsconfig.node.json`); the e2e suite uses the real harness type instead
  of a drifted copy (`0a0f65f`).
- Engine lint bans every inexact `Math` function, `**`, `globalThis`,
  `process`, `crypto`, `Intl`, `node:*` and UI imports; e2e and UI code get
  type-aware promise rules.
- Vitest runs as `fast` and `slow` projects: watch mode takes ~10 s, and the
  balance envelope and Glassforge floor are split into files the worker pool
  runs in parallel (full suite 92 s → 66 s on 4 cores).
- Vitest 5 (0 audit findings), `tsx` for scripts, `@types/node` matching
  Node 22, `.nvmrc` and `engines`, Dependabot, a non-blocking audit step.
- React ships as its own chunk (the single 510 kB chunk warned); a 185 kB
  gzip bundle budget runs in `npm run check`.
- Playwright: `forbidOnly` on CI, traces on failure, and the wall-clock
  performance specs in their own project and non-blocking CI job. Browsers
  are cached in CI; the deep fuzz workflow has a concurrency group, a
  timeout, a PR path filter, and runs only the sweep.
- Profile scripts write to the gitignored `profiles/`;
  [docs/README.md](README.md) records what each committed snapshot measured.

## Structure (`b2ca5f1`)

- `e2e/game.spec.ts` (2,000 lines) is six feature specs over shared helpers.
- `checkWaveEnd` reads as its sequence of steps (`payWaveClear`,
  `offerCataclysm`, `settleShrine`, `offerWaveRelics`); goldens unchanged.
- `App.tsx`: one `commitMeta` for all meta purchases; `TowerTooltip` is its
  own component, and it and the panel share `towerStats` — which fixed the
  tooltip quoting Capacitor DPS without its ×1.5 sustained burst.
- The coalesced autosave briefly reopened a wipe race (a trailing save could
  land between "wipe" and the reload); `persistSave` now refuses to write
  once a reload is pending.

## Left as is, deliberately

- `applyCommand` stays one switch: about 20 cases, most under 30 lines,
  each self-contained. A handler table would add boilerplate, not clarity.
- `towersFire` stays one loop: its `hit` closure captures a dozen per-shot
  values; splitting it means threading a context object through every
  branch for no behavioural gain.
- `App.tsx` is still ~1,400 lines. Further extraction (HUD, shop bar,
  combat dock, run menu, a replay controller) is worthwhile but should go
  with a UI change that needs it, with the e2e suite as the net.
- CI still builds three times (check, e2e web server, Pages). Passing
  `dist` between jobs would save seconds, not minutes.

## Measured but not changed

- The career income pin (late runs ≥ 3× early runs) holds on the `career`
  seed but not in general: under rules 6, four career seeds measured
  4.09×, 2.61×, 3.62× and 1.49×. It is a single-seed pin, not a curve
  property; consider pooling it across seeds.
- `authoredMap`'s fallback restores rocks but not the mesa it placed. It only
  triggers on unplayable rolls and changing it needs a new layout version,
  so it is left as is.
