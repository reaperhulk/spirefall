# Spirefall

A rogue-lite incremental tower defense game. Defend the Spire on a real playfield —
place towers to build mazes, cast abilities, choose relics — and lose. When the Spire
falls it sheds **Sparks**, permanent currency that makes the next run reach further.
Failure is the progression loop.

The whole game runs on a pure, deterministic, headless simulation core: a full run is
just `(meta, seed, commands)`, so replays, save games, bot playtesting, and golden
tests are all the same mechanism. Strategy bots play entire multi-run careers in CI
and assert the difficulty curve.

See [PLAN.md](PLAN.md) for the full design and engineering plan, and
[CLAUDE.md](CLAUDE.md) for dev workflow and architecture rules.

## Playing

```bash
npm install
npm run dev     # then open http://localhost:5173
```

- **Build**: pick a tower in the shop (hotkeys 1–4), click the field to place.
  Towers block the path — build mazes. Click a tower to upgrade, sell, or change
  its targeting.
- **Fight**: press *Start wave* (or Space). Cast Meteor / Frost Nova (Q/W, then
  click) and Gold Rush (E) during waves. Watch for wave affixes — Frenzied,
  Armored, Horde, Vanguard — and for Gale Imps that fly straight over your maze
  (only Arrows, Teslas, and Snipers can hit air).
- **Choose**: every 5 waves the ruins offer a relic — run-scoped power with
  trade-offs.
- **Fall**: the difficulty ramp turns brutal after wave 10; every run ends. Spend
  Sparks in the deep Spire Tree (damage, HP, income, wave-skipping) and reach
  further next run — expect the climb to wave 32 to take many runs. Break the
  cycle there, then keep pushing into the endless if you dare; the victory is
  banked either way.

Progress saves to localStorage automatically, mid-run included.

## Testing

```bash
npm test               # vitest watch mode
npm run test:unit      # engine + harness suites (determinism, balance, goldens)
npm run test:e2e       # Playwright browser suite against the real UI
npm run check          # full local gate: lint + typecheck + unit + build
npm run goldens:update # accept intentional balance changes
```

The dev harness is exposed at `window.__harness` in the browser console:
`setSpeed(10)`, `fastForward(300)`, `snapshot()`, `dispatch(command)`,
`newRun(seed)`, `getReplay()`, `reset()`.

## Deploying

CI runs lint/typecheck/tests/build plus the Playwright suite on every push and PR.
`deploy.yml` publishes to GitHub Pages on pushes to main once Pages is enabled for
the repository (Settings → Pages → Source: GitHub Actions).

## Status

**M4 — rogue-lite depth.** Playable game with 6 tower types (incl. the gold-earning
Mint and long-range Sniper), 9 enemy types (fliers, healers, splitters, bosses),
wave affixes, 11 relics, abilities, endless mode past the victory wave, the Spire
Tree meta progression, saves, and a full test harness (unit, determinism, property,
golden, balance-envelope, perf, and browser E2E suites). See PLAN.md §8.
