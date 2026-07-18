# Spirefall

A rogue-lite incremental horde tower defense. Defend the Spire on a real playfield —
place towers to build mazes, cast abilities, choose relics — and lose. When the Spire
falls it sheds **Sparks**, permanent currency that makes the next run reach further.
Failure is the progression loop.

The whole game runs on a pure, deterministic, headless simulation core: a full run is
just `(meta, seed, commands)`, so replays, save games, bot playtesting, golden tests,
and an evolutionary build fuzzer are all the same mechanism. Strategy bots play entire
multi-run careers in CI and assert the difficulty curve.

See [PLAN.md](PLAN.md) for the full design and engineering plan, and
[CLAUDE.md](CLAUDE.md) for dev workflow and architecture rules.

## Playing

```bash
npm install
npm run dev     # then open http://localhost:5173
```

- **Build**: pick a tower in the shop (hotkeys 1–7), click the field to place.
  Towers block the path — build mazes. Seven types: Arrow (2× vs fliers), Cannon
  (splash), Frost (slows), Tesla (chains), Sniper (pierces shields, 1.5× vs
  elites), Mint (earns gold each wave), Beacon (amplifies neighbors). Click a
  tower for its itemized damage breakdown, upgrades, and targeting (six modes,
  including Weakest and Elite Hunter).
- **Fight**: press *Start wave* (or Space; ▶▶ auto-advances). The scouting report
  shows exactly what's coming — counts, total HP, elites, affixes. Cast Meteor /
  Frost Nova (Q/W, then click), Gold Rush (E), and Bulwark (F) during waves.
  Watch for fliers that soar over mazes, phasing wraiths, carriers that birth
  swarmlings, shieldbearers that bounce weak hits, and a different boss every
  10th wave.
- **Choose**: every 5 waves the ruins offer a relic (30 in the pool, with
  rarities, one paid reroll, and a pity floor past wave 15). Skipping pays gold.
- **Fall**: the Spire has 10 HP and every enemy hits differently — first runs die
  in minutes. Sparks buy the Spire Tree (12 nodes); victories unlock Ascension,
  which burns the tree for Embers and permanent Ember Tree upgrades (7 nodes).
  Achievements (21 and counting) pay bounties along the way; mid-run stats live on S.
- **Push**: clear wave 24 to break the cycle, then dare the endless — every 5th
  wave past victory strikes a permanent, stacking Cataclysm. Win again and the
  **Crucible** hardens each subsequent run for bonus sparks and embers.
- **Vary it**: battlefields GENERATE per run across 4 biomes (marsh, lava vents,
  mesas — each biome fights differently and unlocks up the meta ladder), take an
  opt-in Trial for bonus sparks (Glass Spire, Swift Horde, Iron Horde, Famine,
  No Mercy, Blackout), race the shared **Daily** seed (📅, with day streaks),
  or share any run as a link with `?seed=<anything>`.

Progress saves to localStorage automatically, mid-run included; export/import
codes move it between devices. Installable as a PWA with offline support. Every
finished run can be **re-watched live** (determinism is a feature): watch it on
the run-over screen, copy it as JSON, or share a `?replay=` link that anyone can
spectate. Full keyboard play (arrows + Enter aim placements) and an aria-live
narrator for screen readers.

## Testing

```bash
npm test               # vitest watch mode
npm run test:unit      # engine + harness suites (determinism, balance, goldens)
npm run test:e2e       # Playwright browser suite against the real UI
npm run check          # full local gate: lint + typecheck + unit + build
npm run goldens:update # accept intentional balance changes
npm run fuzz:builds    # deep evolutionary hunt for curve-breaking builds
```

The build fuzzer searches strategy-genome space (tower ratios, relic and meta
priorities, repair habits) for builds that win far cheaper than the curve allows.
CI runs a smoke sweep, and past finds are pinned as regression tests — the
mid-wave repair cap exists because the fuzzer won at 5k sparks without it.

The dev harness is exposed at `window.__harness` in the browser console:
`setSpeed(10)`, `fastForward(300)`, `snapshot()`, `dispatch(command)`,
`newRun(seed)`, `getReplay()`, `reset()`.

## Deploying

CI runs lint/typecheck/tests/build plus the Playwright suite on every push and PR.
`deploy.yml` publishes to GitHub Pages on pushes to main once Pages is enabled for
the repository (Settings → Pages → Source: GitHub Actions).

## Status

**Post-M6, in continuous iteration.** Playable game with 7 tower types (each
with two tier-3 specializations), 16 enemy types across a 6-boss cycle, wave
affixes, 30 relics with rarity/reroll/pity, four abilities, six Trials, endless
Cataclysms, the Crucible, the Spire Tree → Ascension → Ember Tree meta stack, 21
achievements, daily runs with streaks, generated battlefields across 4 biomes, a
generative biome-keyed score with key-matched SFX, watchable/shareable replays,
saves with transfer codes, PWA install, deep links, and a full test harness
(unit, determinism, property, golden, balance-envelope, perf, fuzz, and browser
E2E suites — including an honest piloted victory). `docs/iterations.md` logs the
improvement marathon. See PLAN.md §8.
