# Second review implementation — September 2026

This is the accepted follow-up plan. Changes ship incrementally on main. The
engine remains deterministic at 30 Hz; new rules preserve old saved runs and
replays. Completion means implemented behavior and documented validation,
not merely adding controls or passing a shallow screenshot check.

- [x] One CI chain gates Pages on lint, types, unit/balance tests and the full
  browser suite, deploying the same commit. Manual deployment runs this chain.
- [x] Play-first desktop layout and phone battlefield/action dock; secondary menu,
  contextual build/combat controls, accessible overlays and viewport tests.
- [x] Between-wave report with actionable highlights and useful placement advice.
- [x] Automatic normal bounty, optional small collection bonus, intentional economy tuning.
- [x] Four mechanical doctrines and specialization in the opening act.
- [x] Guardian milestones that unlock environments and persistent tactical choices.
- [x] Authored tactical map situations and telegraphed act assault/reward decisions.
- [x] Larger tower identity, readable specialties and threats, biome landmarks.
- [x] Longer musical development, distinct instruments, space for critical cues.
- [x] Sustained emulated device performance and touch response measurements.
- [x] Re-derived balance envelopes and goldens, complete browser matrix, deployed review.

Physical thermal behavior and speaker/headphone listening require real devices;
emulation and offline audio checks will be labelled as such. They do not block
implementing and verifying everything this environment can exercise.

## Gameplay checkpoint

Rules 5 banks 95% of adjusted kill bounty immediately and leaves 5% as an
optional pickup, with integer remainders carried across kills. Perfect collection
retains the prior income ceiling. Wave clears and Mints remain direct income.
Shatter stores three Frost crystals consumed by heavy hits; Siege rewards 1.5s
of held aim; connected Teslas share a six-shot discharge; Mint-backed War Economy
banks at most one supply crate per wave, with a three-crate cap.

Tier-2 towers can specialize. After wave 2, one specialization costs 20 gold;
selling cannot recover the commission. Guardian kills at 6/12/18 permanently
unlock biomes and award 100/200/300 first-kill Sparks at settlement. Optional
three-wave Iron Column and Swift Swarm assaults trade explicit danger for a
Stoneskin relic or supply gold. Six named map situations use layout version 3.

Validation: 316 tests pass, including new exact economy/mechanics tests and all
seven archived rules-4 playthroughs with unchanged complete state hashes. Current
goldens were deliberately regenerated. The 24-run deterministic career profile
records first wins on run 17 for the passive builder and run 6 for active play;
these are policy measurements, not human win rates. Early specialist wins remain
visible as warnings; four-seed dominance still triggers balance investigation.

## Play surface checkpoint

The header now contains run identity, health, gold and Menu. Daily, records,
Codex, progression, settings, audio and auto-advance live in the paused run menu.
The battlefield owns Send wave, Pause, speed and Plan; combat actions share one
dock. Phone Build/Inspect drawers open explicitly, with tower selection returning
to the full board. Landscape phones move scouting into the control column.

The reserved placement report space shows a between-wave debrief. Findings link
to the offending tower or uncovered final approach; new towers are not accused of
being idle in a wave they never participated in. Placement previews describe new
protection on the final approach, and doctrine resources appear in the inspector.
Browser coverage now checks vertical bounds and hit targets on phones as well as
desktops, with a full spell roster, drawers, dialogs, focus restoration and rotation.

## Art, score, and profiling checkpoint

Tower bodies are larger on higher-contrast plates. Frost crystals, held-aim
arcs, selected Tesla network links, supply crates, and named doctrine impacts
show the engine's real state. Heavy enemies have brackets and imminent leaks
have an arrow. Each biome has different landmark materials, baked only into
existing rock cells so the art never conceals a legal route.

Preparation has a 64-step theme, pressure a 128-step theme, and bosses a
64-step theme, with authored answers, bridge, resolution and rests. The live
scheduler plays the complete phrases, including their second halves. Four
cached harmonic palettes create distinct string, bell, reed and horn voices;
a 64-bar harmonic form includes low bridge passages and two-bar dropouts.
Three reserved critical sound slots protect execute readiness, beam warnings
and exposed cores; music ducks quickly and more deeply around those alerts.
The fifteen-minute scheduler test covers transitions, stalls and mute recovery.

The 192-run family survey is retained in `second-review-families.json`.
Every policy specialized: median first specialization ranged from 13.8 to
35.8 simulated seconds (planning included), down from the prior late-run
specialization behavior. At 20k reference progression, wins were Shatter 2/24,
Siege 12/24, Storm 16/24 and War Economy 13/24. Shatter's weaker policy result
is recorded rather than disguised as equal viability; stronger control-heavy
human play remains a playtest question. No numerical enemy or doctrine changes
were made in response to this survey.

The dense browser profile on commit 218d920 measured enemy drawing as its
largest render pass (p95 3.5–4ms; towers 0.7ms). The walker pass now shares its
rotation and gait calculation and reuses leg geometry. Diagnostics overwrite a
512-entry ring instead of shifting history on every sample. The allocation
microbenchmark records isolated medians: 512-entry immutable leak history copy
7.87 → 0.26 microseconds; diagnostic append 88.4 → 20.7 nanoseconds. These
are hot-operation measurements, not claims of equivalent frame-rate speedups.

New browser coverage includes four biome art captures and two sustained
emulated profiles of at least 60 seconds each with 40 towers, 300 durable enemies, all spells,
real pointer/touch input, audio, autosaves and forced-GC heap checkpoints.
The complete 97-test suite passed and deployed commit bd24aa8 in
[CI run 34016160441](https://github.com/reaperhulk/spirefall/actions/runs/34016160441).
All 319 unit tests pass. Four-biome Deep fuzz also passed on the same engine
rules in commit 218d920; all seven rules-4 golden replays remain exact.

The raw browser/audio results are in `second-review-browser-profile.json`.
Six measured windows took 76.9 seconds on desktop (1280×720, DPR 1, CPU 2×)
and 93.5 seconds on phone (390×844, DPR 3, CPU 4×). The worst window's p95
input-to-render latency was 37.2ms desktop and 41.3ms phone. Retained heap grew
less than 1 MiB after warmup in both. All 40 towers and 300 enemies remained,
more than 20 towers fired, audio stayed running, and controls fit throughout.
Under CPU throttling, frame-interval p95 was 33.4ms desktop and 50.1ms phone;
these stress profiles do not claim 60fps on physical hardware.

Unthrottled dense profiles recorded p95 frame intervals of 16.8ms at 1×/3×/10×.
Enemy-render p95 was 3.3/4.0/3.0ms; the previous comparable run was 4.0/3.6/3.5ms.
The mixed result is retained: the walker simplification reduces draw calls,
but runner variance prevents a blanket measured frame-rate speedup claim.
All 20 biome/phase offline renders were finite, unclipped and decayed to silence.

A live review at 1363×936 confirmed zero page overflow, then identified an old
816px cap inside the canvas wrapper. The closing pass removes it, requires the
canvas to fill its allocated board in every desktop viewport test, enlarges
shop portraits, prevents card wrapping, and places phone boards nearer the dock.
Physical heat, battery use, speaker quality and extended human listening remain
outside these automated and browser-based checks.
