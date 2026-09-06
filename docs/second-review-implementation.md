# Second review implementation — September 2026

This is the accepted follow-up plan. Changes ship incrementally on main. The
engine remains deterministic at 30 Hz; new rules preserve old saved runs and
replays. Completion means implemented behavior and documented validation,
not merely adding controls or passing a shallow screenshot check.

- [x] One CI chain gates Pages on lint, types, unit/balance tests and the full
  browser suite, deploying the same commit. Manual deployment runs this chain.
- [ ] Play-first desktop layout and phone battlefield/action dock; secondary menu,
  contextual build/combat controls, accessible overlays and viewport tests.
- [ ] Between-wave report with actionable highlights and useful placement advice.
- [x] Automatic normal bounty, optional small collection bonus, intentional economy tuning.
- [x] Four mechanical doctrines and specialization in the opening act.
- [x] Guardian milestones that unlock environments and persistent tactical choices.
- [x] Authored tactical map situations and telegraphed act assault/reward decisions.
- [ ] Larger tower identity, readable specialties and threats, biome landmarks.
- [ ] Longer musical development, distinct instruments, space for critical cues.
- [ ] Sustained emulated device performance and touch response measurements.
- [ ] Re-derived balance envelopes and goldens, complete browser matrix, deployed review.

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
