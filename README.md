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
  On phones, open Build; picking a tower returns to the full battlefield.
  The preview shows route changes and coverage gained/lost before committing.
  Towers block the path — build mazes. Eight types: Arrow (2× vs fliers), Cannon
  (splash), Frost (slows), Tesla (chains), Sniper (pierces shields, 1.5× vs
  elites), Mint (earns gold each wave), Beacon (amplifies neighbors), Lance
  (ramps +15%/hit on a held target — the boss-killer). Click a
  tower for its itemized damage breakdown, upgrades, and targeting (six modes,
  including Weakest and Elite Hunter).
- **Fight**: press *Send wave* (or Space; auto-advance lives in Menu). The scouting report
  shows exactly what's coming — counts, total HP, elites, affixes. Cast Meteor /
  Frost Nova (Q/W, then click), Gold Rush (E), and Bulwark (F) during waves.
  Watch for fliers that soar over mazes, phasing wraiths, carriers that birth
  swarmlings and shieldbearers that bounce weak hits. Act guardians arrive at
  waves 6/12/18; the Hollow Sovereign closes wave 24 with an exposed-core
  window, armor and escorts. Further guardians return every ten endless waves.
  Three shared command charges power 250% overcharged shots; one charge
  recovers every six combat seconds before upgrades. B toggles the beam;
  V executes a wounded target, G collects, and O charges a selected tower.
- **Collect**: 95% of adjusted kill bounty banks immediately; the remaining 5%
  is an optional pickup. Between waves, the report points to escaped threats,
  blocked shots, idle towers and gaps on the final approach.
- **Choose**: pick a persistent Shatter, Siege, Storm or War economy doctrine
  from wave 2, with opening and counterplay guides. Shatter stores Frost stacks
  for heavy hits; Siege rewards held aim; Storm connects Tesla discharges;
  War Economy supplies Mint-backed requisitions. Tier-2 towers can specialize,
  with a once-per-run 20-gold commission after wave 2. Relic offers identify matching
  towers and owned synergies. A focused reroll costs extra and guarantees one
  unowned family relic, sharing the normal once-per-offer limit. Every 5 waves the ruins offer a relic (31 in the pool, with
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
  mesas — each biome fights differently), with six named tactical situations.
  Guardian kills at waves 6/12/18 permanently unlock the next biomes and award
  first-kill Sparks at settlement. Accept three-wave Iron Column or Swift Swarm
  assaults for explicit rewards, or skip the extra danger. Take an
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
reduced motion, color assistance, reduced combat effects, a calm audio mix, and
Auto/High/Low graphics quality. Direct target, execute and beam buttons sit beside
the battlefield. Music carries authored themes through preparation, pressure,
bosses, victory and ascension, voiced differently in each biome.

See [the second-review implementation report](docs/second-review-implementation.md)
for the current checklist, measurements, build-family results and validation limits.
New runs use rules 5; existing saved runs and replays retain their original rules.

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

`npx playwright test e2e/viewport-fit.spec.ts` checks desktop sizes from
1024×600 through 1920×1080, plus touch phones and tablets from 320×568 through
1024×768 in both orientations. Desktop checks require zero document scrolling
and unobscured battlefield, HUD, construction, upgrade and spell controls,
with first-run hints visible and with late-run content. Touch checks exercise
placement, upgrades, doctrines, shrine dialogs and rotation; the entire board
and combat dock must fit without document scrolling. Build and Inspect open as
explicit drawers; dialogs scroll internally when needed.
Screenshots are attached to the Playwright report in CI. Sustained desktop and
phone CPU emulation in `e2e/sustained-performance.spec.ts` records six 10-second
windows of dense combat, real input, audio, saves and retained heap.

## Deploying

CI runs lint/typecheck/tests/build plus the Playwright suite on every push and PR.
The same `ci.yml` workflow deploys that exact commit to Pages only after both
check and browser jobs pass. Manual CI runs use the same gates; pull requests
never deploy. Pages must use GitHub Actions as its source in repository settings.

## Status

**September second-review release.** Eight tower types, six pairs of combat
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
