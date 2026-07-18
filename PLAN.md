# Spirefall — Design & Engineering Plan

A rogue-lite incremental tower defense game. You defend the Spire on a real playfield —
placing towers, casting abilities, making build choices under pressure — and you will
lose. When the Spire falls, it sheds **Sparks**, the meta-currency that buys permanent
power. Each run reaches further than the last. Failure *is* the progression loop.

This document is the blueprint: game design, engine architecture, the deterministic
test harness that everything hangs off of, the UI layer, tooling/CI, and milestones.

> **Shipped-systems index (kept current).** The contract below described the v1
> plan; everything in it shipped, and these systems shipped on top of it, each
> honoring the same determinism rules:
> - **Biomes + generated battlefields** (`src/engine/mapgen.ts`, `src/data/biomes.ts`):
>   the biome owns the rules (marsh, vents, mesas), the run seed owns the structure.
>   Biomes unlock across the meta ladder; dailies share one roll for all players.
> - **Tier-3 specializations** (`TOWER_SPECS` in content.ts): each combat tower
>   commits to one of two paths at tier 3 (Volley/Longbow, Mortar/Breaker,
>   Blizzard/Permafrost, Arc Lattice/Capacitor, Executor/Overpenetration,
>   Momentum/Skewer).
> - **The Lance** (8th tower, `unlock_lance`): consecutive hits on a held
>   target join the additive damage stack (+15%/stack, cap 10; the panel's
>   number is the shot's number); switching resets. Launch-pinned: a
>   lance-rush loses at every budget — it's a specialist, not a core.
> - **Transformative relics**: a rare/legendary tier that changes how a tower
>   plays (ricochet, burn, detonate-on-slowed-death, ramping tesla, executes,
>   interest, crit auras).
> - **Boss encounters**: carapace break-windows, mid-life broods, gale surges,
>   endless-tier phasing (Veilwarden) and horde-mending (Blightmother) — each
>   with explicit counterplay; every 10th wave, 6-boss cycle (Zephyrhost's air armada at 60).
> - **The Crucible**: post-victory escalation — each cycle victory hardens the
>   next run (+10% HP) and sweetens it (+15% sparks, +1 ember at ascension);
>   rank milestones add NAMED tiers (Seething/Ironbound/Unrelenting texture).
> - **Replays** (`session.replaySession()`): determinism as a feature — watch
>   your last run, paste anyone's v2 replay JSON, or open a ?replay= link;
>   spectator sessions never touch meta or saves.
> - **The Codex** (`src/ui/Codex.tsx`): in-game reference rendered from the same
>   data objects the engine reads; quotes EFFECTIVE numbers via engine helpers.
> - **Generative score** (`src/ui/music.ts`): biome-keyed two-progression
>   32-bar form, intensity- and event-driven (boss vamps, defeat collapse,
>   victory bloom), zero assets, UI-layer only; tonal SFX quantize to the
>   score's live key (`src/ui/tonality.ts`).
> - **Run cards + endless milestones**: shareable canvas cards (damage profile
>   + relic loadout) with ?seed= challenge links (biome + trials ride along);
>   cataclysm-depth and biome-mastery achievements. Run summaries carry the
>   full loadout (relics, cataclysms) and history remembers where each run
>   happened.
> - **Cataclysm choice** (`choose_cataclysm`): endless strikes OFFER two
>   distinct dooms and gate start_wave until one is chosen — endless is a
>   gauntlet you steer. Bots rank dooms least-bad-first; the 20k fuzz sweep
>   confirms choice is agency, not a discount.
> - **Victory identity**: the win is scored (bloom + crucible motif), dressed
>   (gold modal, rising embers, first-win callout), and proven — the e2e suite
>   pilots a real maxed account through all 24 waves with real commands.
> Balance discipline throughout: the envelope re-derives when the curve moves
> intentionally, and every fuzzer-found exploit is tuned away then pinned as a
> permanent regression genome (four to date: Honed-Arsenal, Bounty-Banner,
> Mortar-Blizzard, Ember-Maze).

---

## 1. Design pillars

1. **Interactive, not idle-first.** There is a real playfield. Placement, targeting
   priorities, ability timing, and mid-run choices matter. An AFK player should lose
   noticeably earlier than an engaged one (and we assert this with bots — see §5.6).
2. **Failure is currency.** Wave difficulty grows geometrically; per-run power is
   capped. Every run ends, and progress made before the end — waves cleared, kills —
   pays Sparks (a zero-progress abandon pays nothing, so conceding can't be farmed).
   Meta upgrades raise the cap so
   the next run goes further. The incremental fantasy comes from the compounding
   meta-layer, not from idle accumulation.
3. **Runs are different.** Seeded map layouts, wave compositions, and relic offers
   make each run a fresh puzzle rather than a replay of the last one.
4. **The sim is sacred.** All game logic is a pure, deterministic, serializable
   function of `(state, commands)`. The UI is a disposable skin. If a behavior can't
   be asserted in a headless test, it doesn't go in the engine.

## 2. Game design

### 2.1 The run loop

```
choose loadout → BUILD phase (place towers, no timer)
      ↓
  start wave → WAVE phase (enemies stream in; towers fire; player casts abilities)
      ↓
 wave cleared → income + relic choice every N waves → BUILD phase, next wave
      ↓
 Spire HP hits 0 (or final boss dies) → RUN OVER → Sparks awarded → meta screen
```

- **Playfield:** a grid (v1: 24×14 cells). Each map has a spawn gate, a path to the
  Spire, and buildable ground. Maps are generated from the run seed (v1 ships a few
  hand-authored layouts behind the same interface; procedural generation follows).
- **Towers:** bought with **Gold** (run-scoped). v1 roster: Arrow (single-target DPS),
  Cannon (AoE, slow rate), Frost (slows), Tesla (chain lightning). Each has 3 upgrade
  tiers and a selectable targeting priority (first / last / strongest / nearest).
- **Enemies:** Runner (fast/fragile), Brute (slow/tanky), Swarmling (dies fast, comes
  in packs), Shieldbearer (damage gate: ignores hits below a threshold), and a boss
  every 10 waves. Later: fliers, healers, splitters.
- **Waves:** generated by a *budget system* — wave N gets `B(N) = B₀ · gᴺ` points
  (g ≈ 1.18) spent on enemy types drawn from the seeded RNG under composition rules
  (e.g. no Shieldbearers before wave 6). This one function is the difficulty knob and
  is trivially unit-testable.
- **Abilities:** 2 equipped active spells with cooldowns (Meteor: burst AoE; Frost
  Nova: freeze; Gold Rush: bounty multiplier window). This is the moment-to-moment
  interactive layer beyond placement.
- **Relics:** every 5 waves, pick 1 of 3 seeded relic offers (e.g. "Arrow towers
  pierce", "+2 gold per kill, −10% Spire HP"). Run-scoped, gone on death. This is the
  rogue-lite "build variety" axis. Declining the offer pays wave-scaled gold, so
  "take nothing" is a real economic choice rather than a dodge for downside relics.
- **Probability layer:** crit chance (meta tree + relics, crits deal double damage,
  relics push the multiplier and chance further) and lucky gold drops. Every roll
  comes from the run's seeded combat RNG stream — never `Math.random` — so runs
  stay perfectly replayable.

### 2.2 The meta loop

- **Sparks** are awarded at run end: `sparks = f(furthest wave, kills, first-time
  bonuses) × meta multipliers`. Defeat pays; victory pays more.
- **The Spire Tree** (permanent upgrades, bought with Sparks): starting gold, Spire
  max HP, unlock tower types / ability slots / relic rarities, gold income %, tower
  damage %, crit chance %, Spark gain % (the compounding incremental node),
  starting-wave skip.
- **Ascension (shipped):** after any victory, the Spire Tree (and banked Sparks,
  and unlocks) can be burned for **Embers** — 1 + 1 per victory that cycle. The
  Ember Tree (damage, Spire HP, Spark gain, a banked-Spark head start, gold,
  ability cooldowns) survives every ascension and compounds with the rebuilt
  Spire Tree.
- **Trials (shipped):** opt-in run handicaps chosen at run start — Glass Spire
  (half HP, +40% sparks), Swift Horde (+15% speed, +25%), Iron Horde (+25% HP,
  +35%), Famine (−25% gold, +30%). Hardship is a strong account's spark
  accelerator; daily runs ignore trials so the shared seed stays a shared
  ruleset.
- **Achievements (shipped):** a dozen one-shot goals paying spark bounties at
  settle, including deep-endless and trial-victory targets.

### 2.3 The difficulty curve (the contract we test)

Measured envelope, enforced by bot playtests in CI rather than by hope
(`src/harness/__tests__/balance.test.ts`; numbers re-derived when the curve
intentionally moves):

| Player | Measured outcome |
|---|---|
| Fresh account, does nothing during waves | overrun mid-wave-1 in ~8 sim-seconds, 0 sparks (no progress = no pay) |
| Fresh account, greedy arrow spam | dies waves 4–5 |
| Fresh account, competent bot | dies waves 3–9 in **under 2.5 minutes** — the spire is paper until you invest |
| +3000–5000 sparks | reaches ~12–14 — Reinforced Core turns leaks survivable |
| +20k sparks | reaches ~23–25, wins on a good map |
| +60k sparks (deep tree) | wins (wave 24) while mowing down hundreds per wave |
| Arrow-only spam, +20k sparks | dies at the shield wall (~wave 22) on every map — composition is mandatory |
| Career (bot) | first victory around run ~13, repeating wins after, then endless |

Two defense stats keep composition honest, binding at different times:

- **Shields** (shieldbearers, carriers) are a threshold: hits at or below the
  shield bounce entirely. They scale at half the HP curve's rate and wall out
  rapid fire in the late game — piercing snipers or heavy shells required.
- **Armor** (brutes, healers, splitters, carriers, bosses) is attrition: flat
  damage reduction on every hit (min 1 lands), growing out of the HP curve's
  excess over baseline. Zero in the opening, ~1 point by wave 8, and by the
  late teens it eats a third of every arrow while cannon shells and sniper
  rounds barely notice. Armor is why chip-heavy comps bend from the MIDGAME
  on instead of cruising to a wave-22 cliff.

Together they are the anti-mono-tower check, pinned by the `arrowOnly` bot in
the envelope: arrows track the reference until the midgame, then fall behind
and never win, while the (phase-aware, cannon-leaning) mixed comp still takes
the ~20k victory.

The Spire has **10 HP** and enemies keep their damage identity: swarmlings chip
for 1, runners 2, fliers 3, shieldbearers 4, brutes 5, bosses 8 — a boss leak
nearly one-shots an unupgraded spire. Early on *everything* kills you easily;
Reinforced Core (+2 HP × 12 levels) is what turns leak-triage into a skill:
an invested spire can afford to ignore chip damage and focus heavies. The spire
knits +1 HP per cleared wave (chip is forgivable, floods are not) and paid
repairs cost 40+3×wave gold per point, 3 max per cast — and at most **one cast
while a wave is live**: the build fuzzer proved unlimited mid-wave repairs let
an all-offense account tank the endgame on a 10-HP spire and win at 5k sparks.
The ramp is two-phase:
enemy HP ×1.12/wave through wave 8, ×1.20/wave after, with waves 1–4 fielding
reduced budgets so opening RNG can't end you pre-build. The deep Spire Tree is
the only way through, priced to span 10+ runs.

Wave budget grows ~1.18ᴺ throughout; a defense's DPS is roughly linear in gold,
so past the wave-8 break every run *stalls hard* — the geometric/linear gap is
what guarantees failure and sets the loop cadence.

## 3. Engine architecture — a pure, deterministic core

### 3.1 The shape of the engine

```
src/engine/    Pure simulation. Zero dependencies, no DOM, no Date, no Math.random.
src/data/      Content as plain data: towers, enemies, waves, relics, meta tree.
src/harness/   Headless tooling: scenario runner, bots, replay recorder/checker.
src/ui/        Canvas renderer + React shell. Consumes snapshots, emits commands.
```

The one function that matters:

```ts
step(state: RunState, commands: Command[]): { state: RunState; events: GameEvent[] }
```

- **Fixed timestep.** The sim advances in discrete ticks (30 ticks/sec of game time).
  There is no `dt` inside the engine — real time is the UI's problem. This kills the
  entire class of frame-rate-dependent bugs and makes replays exact.
- **Commands in.** Every player action is a serializable command:
  `{ tick, type: 'PLACE_TOWER', at: {x, y}, tower: 'arrow' }`. A full run is exactly
  `(metaSnapshot, seed, Command[])` — which makes save games, replays, golden tests,
  and bot players all the *same mechanism*.
- **Events out.** `step` returns events (`enemy_killed`, `tower_fired`,
  `spire_damaged`, `wave_cleared`, `run_ended`) for the UI, audio, and tests to
  consume. Tests assert on the event stream instead of groping through internals;
  the renderer uses events for effects (muzzle flashes, floaters) without the engine
  knowing renderers exist.
- **Plain data state.** `RunState` is JSON-serializable — no classes, closures, Maps,
  or functions. Snapshot/restore is `structuredClone`; save format is the state
  itself (plus a schema version).

Meta progression sits *outside* the run, same purity rules:

```ts
createRun(meta: MetaState, seed: string): RunState
settleRun(meta: MetaState, summary: RunSummary): MetaState   // award sparks
buyMetaUpgrade(meta: MetaState, id: UpgradeId): MetaState
```

### 3.2 Determinism rules (enforced, not aspirational)

1. **One seeded RNG, owned by the state.** A PCG32-style generator implemented with
   32-bit integer ops (`Math.imul`, `>>>`) — bit-identical on every platform. Its
   state lives *in* `RunState`, so serialize/restore can't fork history.
2. **Named substreams.** Wave generation, relic offers, and combat rolls draw from
   independent streams derived from the run seed (`deriveStream(seed, 'waves')`), so
   adding a crit roll doesn't reshuffle next week's wave composition and invalidate
   every golden replay.
3. **Integer-ish math only.** Positions are fixed-point integers (cell × 1000); HP,
   damage, gold are integers. `+ - * /` on JS doubles is IEEE-deterministic, but we
   still avoid fractional accumulation drift, and we **never** use `Math.sin/cos/
   atan2/pow` in the sim (unlike sqrt, they're not spec-pinned to exact results).
   Distance checks compare squared distances; anything angular uses lookup tables.
4. **Stable iteration order.** Entities live in arrays ordered by monotonic spawn ID.
   No object-key iteration in sim-affecting code.
5. **No ambient anything.** `Date.now`, `Math.random`, `performance`, timers, and I/O
   are banned from `src/engine/` — enforced by an ESLint rule scoped to that
   directory, not by code review vigilance.

### 3.3 Sim subsystems (per tick, in fixed order)

1. Apply this tick's commands (validate → mutate copy → emit events; invalid
   commands emit `command_rejected`, never throw).
2. Spawner: release scheduled enemies for the active wave.
3. Movement: advance enemies along their paths (precomputed on placement changes —
   BFS on the grid; a placement that would fully block the path is a rejected
   command).
4. Targeting & firing: towers acquire per their priority, spawn projectiles or apply
   instant hits; cooldowns tick down.
5. Projectiles: advance, collide, apply damage/effects.
6. Status effects: slows/burns tick and expire.
7. Deaths & bounties: remove dead enemies, award gold, emit events.
8. Wave/phase bookkeeping: wave cleared? Spire dead? Emit transitions.

Each subsystem is its own pure function `(state, ctx) → state`, individually
unit-testable; `step` is their composition.

## 4. Why this architecture serves the tests

Every hard-to-test property of a typical game is deliberately absent:

| Typical game | Spirefall engine |
|---|---|
| Logic tangled with rendering | Engine has no DOM; runs in Node as-is |
| `Math.random()` sprinkled everywhere | One seeded RNG in state, named substreams |
| Variable `dt` per frame | Fixed tick; time is a loop counter |
| Player input handled ad hoc | Serializable commands — a recorded run is a test fixture |
| State in class instances | Plain JSON data — snapshot, diff, hash, restore |

Consequence: a full 50-wave run simulates headlessly in well under a second, so CI
can afford *thousands* of runs per push.

## 5. The test harness

### 5.1 Unit tests (Vitest)

Per-subsystem pure-function tests: wave budget math, targeting priority selection,
pathfinding (including "placement would block path" rejection), damage/armor/shield
resolution, economy, Spark payout, meta-tree purchase validation. Colocated as
`src/engine/__tests__/*.test.ts`.

### 5.2 Determinism tests (the keystone)

- **Replay equivalence:** run `(seed, commands)` twice → final states are
  `deepEqual`, and a canonical hash of every Nth intermediate state matches.
- **Serialization equivalence:** run to tick T, `JSON.stringify` → parse, continue
  both copies to tick 2T → identical.
- **Chunking equivalence:** stepping 1000 ticks one-at-a-time equals stepping in
  arbitrary batches (guards against hidden per-call state).

### 5.3 Golden replay tests

Recorded command logs checked into `fixtures/replays/` with expected end-state
hashes and event digests (kills, gold earned, final wave). Any engine change that
alters outcomes trips them. Intentional balance changes regenerate goldens via
`npm run goldens:update` — making balance changes *visible in diffs* instead of
silent.

### 5.4 Property-based tests (fast-check)

Random seeds × generated command sequences (valid and garbage), thousands of ticks,
asserting invariants that must hold in *any* reachable state:

- no `NaN`/`Infinity`/negative gold/HP > maxHP anywhere in state,
- enemies only ever occupy path-connected cells,
- entity IDs unique and monotonic,
- `step` never throws, even on hostile command input,
- sparks awarded is monotonic in waves survived.

These invariants live in `assertInvariants(state)`, which the harness also runs
after every tick in dev/test builds (compiled out of production).

### 5.5 Fuzzing

Two layers:

- **Property fuzzing** — the fast-check suite, with failing seeds shrunk and
  printed as ready-to-paste reproduction cases.
- **The build fuzzer** (`src/harness/policy.ts` + `fuzz.ts`) — a seeded
  evolutionary search over whole strategies as data (`PolicyGenome`: tower
  ratios, upgrade thresholds, relic and meta spending priorities, repair
  habits). The oracle flags any victory at ≤10k sparks as *breaking* (the
  curve says ~20k) and cheap wins / overperformance / soft endless as
  warnings. CI runs a smoke sweep; `npm run fuzz:builds` runs the deep hunt.
  Every find is a JSON genome — trivially reproducible, and confirmed exploits
  get pinned as named regression tests (see the mid-wave repair cap).

### 5.6 Bot playtests / balance regression (the rogue-lite guarantee)

Headless strategy bots play *entire meta-progressions*, not just runs:

- `afk` — starts waves, does nothing else,
- `greedy-dps` — max damage per gold, no economy,
- `economist` — income first, defense late,
- `balanced` — a decent heuristic player,
- `random` — chaos monkey for robustness.

`npm run test:balance` simulates e.g. 20 consecutive runs per bot per seed set and
asserts the §2.3 envelope: *afk dies by wave 4; balanced fresh dies 8–12; balanced
with full tree wins; each of the first 5 runs reaches strictly further than the
last (given spending)*. Results also emit JSON so CI can diff balance drift between
main and a PR, like the reference repo's `--compare` mode — but gating PRs, not
just observed manually.

**The build fuzzer** (`src/harness/policy.ts` + `fuzz.ts`) goes further: whole
strategies are plain-data `PolicyGenome`s (tower ratios, upgrade/repair/enhance
thresholds, relic and meta spending priorities), and a seeded evolutionary
search evaluates populations of them against the curve contract. The oracle
flags *breaking* builds (any victory at ≤10k sparks — the curve says ~20k) and
*warnings* (cheap wins, +7 waves over the balanced reference, endless running
past wave 34). Every finding carries its genome JSON + map seed, so a break is
a one-liner to reproduce and pin as a named bot (that is exactly how mono-arrow
cheese became `arrowOnlyBot`). A small deterministic sweep gates CI; deep
hunts run via `npm run fuzz:builds` (knobs: FUZZ_POP/GENS/BUDGETS/SEEDS/SEED).

### 5.7 UI smoke tests (Playwright)

The UI layer gets a thin E2E: boot the game, drive a scripted 3-wave run through
the real input path via `window.__harness`, assert no console errors, no layout
overflow, and that the run reaches the expected engine state. Screenshots on
failure. This is deliberately shallow — behavior lives in the headless suites.

### 5.8 Performance budget

A benchmark test steps a synthetic late-game state (200 enemies, 60 towers, 300
projectiles) for 1000 ticks and fails if the per-tick budget (2 ms) is exceeded —
catching perf regressions before players do.

## 6. UI layer

- **Canvas 2D playfield + React shell** (HUD, tower shop, relic picker, Spire Tree,
  run-over screen). Canvas 2D comfortably handles v1 entity counts; the renderer
  only consumes `RunState` snapshots + events, so a WebGL/PixiJS swap at M7 is a
  renderer change, not an engine change.
- **Game loop:** `requestAnimationFrame` accumulates real time → runs N fixed sim
  ticks → renders. The renderer interpolates entity positions between the previous
  and current tick for smooth 60 fps visuals over a 30 Hz sim. A speed multiplier
  (×1/×2/×3, and up to ×100 in the dev harness) just runs more ticks per frame —
  the sim cannot tell the difference, by construction.
- **Input → commands:** clicks/keys produce `Command`s stamped with the next tick;
  nothing in the UI mutates state directly.
- **Dev harness in the browser** (`window.__game` / `window.__harness`, as in the
  reference repo): `setSpeed`, `fastForward`, `snapshot`, `dispatch(command)`,
  `startRecording()/stopRecording()` → downloads a replay fixture. Recording a bug
  in the browser produces a failing golden test verbatim — that's the payoff of the
  command architecture.
- **Saves:** run state + meta state + schema version in `localStorage`, with
  versioned migration functions (tested).

## 7. Tooling, repo layout, CI

### 7.1 Improvements over the reference skeleton

`theruinsremember` validates the broad shape (Vite + Vitest + pure engine + React +
Pages deploy). Deliberate upgrades:

1. **TypeScript, strict.** The engine/UI purity boundary and the command/event
   protocol become compiler-enforced contracts instead of conventions.
2. **CI that tests.** The reference's only workflow builds and deploys; nothing runs
   its excellent test suite automatically. Spirefall's `ci.yml` runs lint +
   typecheck + unit + determinism + balance + build on every PR and push to main,
   and the Pages deploy job runs only after CI passes.
3. **fast-check** for property testing — the reference has none, and it's the
   highest-leverage tool for a deterministic sim.
4. **Lint-enforced purity:** `no-restricted-globals`/`no-restricted-properties`
   ESLint rules scoped to `src/engine/**` ban `Math.random`, `Date`, `setTimeout`,
   `performance`, and DOM globals.
5. **Playwright over Puppeteer** for the browser smoke test (first-class runner,
   auto-waiting, preinstalled in more CI images).

### 7.2 Repo layout

```
src/engine/           pure sim (rng, step, subsystems, mapgen, invariants)
src/engine/__tests__/ unit + determinism + property + mechanic tests
src/data/             content as data (towers+specs, enemies, relics, biomes,
                      achievements, meta/ember trees, pacing)
src/harness/          bots, autoplay careers, policy fuzzer (Node, no DOM)
src/ui/               React + canvas renderer, codex, music, run cards
fixtures/             golden playthrough fixtures
scripts/              golden regeneration, deep fuzz entry
.github/workflows/    ci.yml
```

### 7.3 Scripts

```
npm run dev            vite dev server
npm test               vitest watch
npm run test:unit      vitest --run
npm run test:balance   headless bot playtests with balance assertions
npm run lint           eslint (includes engine purity rules)
npm run typecheck      tsc --noEmit
npm run check          lint + typecheck + unit + balance + build (the local gate)
npm run goldens:update regenerate golden replay hashes (balance changes)
```

## 8. Milestones

- ✅ **M0 — Skeleton:** repo scaffold, strict TS, Vitest + fast-check, ESLint with
  engine-purity rules, CI workflow, seeded RNG + fixed-tick `step` skeleton with
  command/event plumbing, determinism + property tests green.
- ✅ **M1 — Headless game** (shipped bigger than planned): grid maps + BFS
  flow-field mazing, full 4-tower/5-enemy roster, budget waves + bosses,
  abilities, relics, meta layer, victory/defeat. Unit + determinism + golden
  coverage; bots play whole careers. *The game was playable by bots before it
  had pixels.*
- ✅ **M2 — Pixels & input:** canvas renderer with interpolation, React shell,
  fixed-timestep loop, placement/upgrade/targeting UI, browser dev harness with
  replay capture.
- ✅ **M3 — The loop closes:** Sparks, 7-node Spire Tree, run-over → meta →
  next-run flow, localStorage saves (schema-versioned), balance envelope in CI,
  Playwright E2E suite, Pages deploy workflow.
- ✅ **M4 — Rogue-lite depth:** 9 enemy types (fliers that ignore the maze,
  healers, splitters), 6 towers (long-range sniper; gold-earning mint), air/
  ground targeting, seeded wave affixes (Frenzied/Armored/Horde/Vanguard),
  11 relics, endless mode (the victory wave is a milestone; runs continue),
  early-wave unit caps to bound seed variance. Procedural maps deferred.
- ✅ **M5 — Balance & feel:** curve re-tuned against bot envelopes each change,
  floating bounty/repair text, screen shake, synthesized WebAudio SFX with a
  persisted mute, responsive canvas for small screens.
- ✅ **M6 — Incremental depth:** Ascension + Ember Tree, achievements, endless
  Cataclysms (permanent stacking modifiers every 5th post-victory wave),
  Trials, daily seeds, deep links (`?seed=`), map select with a picker-only
  sixth map, per-map records — free content via determinism.
- ✅ **M6.5 — The overnight marathon** (`docs/iterations.md`): ~50 logged
  plan→implement→verify→ship cycles covering the build fuzzer (and the balance
  holes it found: sniper/mint trims, the mid-wave repair cap), relic
  rarity/reroll/pity + 23-relic pool, boss roster + boss bar, map themes +
  ambient motes, PWA + haptics + safe areas, accessibility (aria, color
  assist), live run stats, HP timeline, shareable replays.
- **M7 — Optional WebGL renderer** if entity counts demand it.

## 9. Risks & mitigations

- **Float drift breaks determinism** → fixed-point positions, integer combat math,
  no transcendental stdlib calls; determinism tests run on every push and would
  catch a violation the day it lands.
- **Golden tests become a balance-change tax** → substreamed RNG limits blast
  radius; `goldens:update` makes regeneration one command and the diff reviewable.
- **Balance envelopes flake** → bots are deterministic per seed; envelopes assert
  over a fixed seed set, not statistics of random ones.
- **UI drifts into owning logic** → commands are the only write path; the lint
  fence plus "renderer takes snapshots" keeps the skin disposable.
