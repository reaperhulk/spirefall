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

- **Build**: pick a tower in the shop (hotkeys 1–8), click the field to place.
  Towers block the path — build mazes. Eight types: Arrow (2× vs fliers), Cannon
  (splash), Frost (slows), Tesla (chains), Sniper (pierces shields, 1.5× vs
  elites), Mint (earns gold each wave), Beacon (amplifies neighbors), Lance
  (ramps +15%/hit on a held target — the boss-killer). Click a
  tower for its itemized damage breakdown, upgrades, and targeting (six modes,
  including Weakest and Elite Hunter).
- **Fight**: press *Start wave* (or Space; ▶▶ auto-advances). The scouting report
  shows exactly what's coming — counts, total HP, elites, affixes. Cast Meteor /
  Frost Nova (Q/W, then click), Gold Rush (E), and Bulwark (F) during waves.
  Watch for fliers that soar over mazes, phasing wraiths, carriers that birth
  swarmlings and shieldbearers that bounce weak hits. Act guardians arrive at
  waves 6/12/18; the Hollow Sovereign closes wave 24 with an exposed-core
  window, armor and escorts. Further guardians return every ten endless waves.
  Three shared command charges power 250% overcharged shots; one charge
  recovers every six combat seconds before upgrades. B toggles the beam;
  V executes a wounded target, G collects, and O charges a selected tower.
- **Choose**: pick a persistent Shatter, Siege, Storm or War economy doctrine
  from wave 2. Relic offers identify matching towers and owned synergies. Every 5 waves the ruins offer a relic (31 in the pool, with
  rarities, one paid reroll, and a pity floor past wave 15). Skipping pays gold.
- **Fall**: the Spire has 10 HP and every enemy hits differently — first runs die
  in minutes. Sparks buy the Iron, Gold and Ash branches, each with rival
  keystones and free between-run respec. Ascension burns stat upgrades for
  Embers while retaining tower and ability unlocks. Achievements pay bounties
  along the way; mid-run stats live on S.
- **Push**: clear wave 24 to break the cycle, then dare the endless — every 5th
  wave past victory strikes a permanent, stacking Cataclysm. Win again and the
  **Crucible** hardens each subsequent run for bonus sparks and embers.
- **Vary it**: battlefields GENERATE per run across 4 biomes (marsh, lava vents,
  mesas — each biome fights differently and unlocks up the meta ladder), take an
  optional shrine defense for extra gold, take an opt-in Trial for bonus sparks (Glass Spire, Swift Horde, Iron Horde, Famine,
  No Mercy, Blackout), race the normalized **Daily** (fixed progression, arsenal and rules, with day streaks),
  or share any run as a link with `?seed=<anything>`.

Progress checkpoints every five seconds and on page exit, with a recovery backup
and visible storage errors; export/import
codes move it between devices. Installable as a PWA with offline support. Every
finished run can be **re-watched live** (determinism is a feature): watch it on
the run-over screen, copy it as JSON, or share a `?replay=` link that anyone can
spectate. Recordings retain the original start across reloads, carry a rules
version, and support seeking and wave checkpoints. Defeat reports show leaks
and towers worth checking for coverage. Keyboard play includes target cycling
([ / ]), remappable combat keys, and toggle/hold beam options. Settings include
reduced motion, color assistance, reduced combat effects and a calm audio mix.

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
`newRun(seed)`, `getReplay()`, `getPerformance()`, `resetPerformance()`, `reset()`.
`e2e/performance.spec.ts` records dense 1×/3×/10× browser profiles. Run
`./node_modules/.bin/vite-node scripts/profile-release.ts` to reproduce the
held-out pilot and geography report in `docs/release-profile.json`.

## Deploying

CI runs lint/typecheck/tests/build plus the Playwright suite on every push and PR.
`deploy.yml` publishes to GitHub Pages on pushes to main once Pages is enabled for
the repository (Settings → Pages → Source: GitHub Actions).

## Status

**September improvement release.** Eight tower types, six pairs of combat
specializations, four build doctrines, four biomes with authored structural
patterns, act guardians and a dedicated finale, relic and progression tradeoffs,
normalized Daily challenges, and seekable replays. Canvas fortress and tower art
share a visual vocabulary with the shop and Codex. The responsive synthesized
score carries a recurring Spire theme, with priority sound cues and a shared mix.

See [release notes and verification](docs/roadmap-implementation.md),
[held-out measurements](docs/release-profile.json), and the historical
[iteration log](docs/iterations.md). Automated checks cover deterministic play,
recovery/imports, music scheduling, balance, fuzzing and real browser flows.
Human playtesting, long-session listening and physical-device profiling remain
separate release-quality checks; automated results do not replace them.
