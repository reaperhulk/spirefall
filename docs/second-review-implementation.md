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
- [ ] Automatic normal bounty, optional small collection bonus, intentional economy tuning.
- [ ] Four mechanical doctrines and specialization in the opening act.
- [ ] Guardian milestones that unlock environments and persistent tactical choices.
- [ ] Authored tactical map situations and telegraphed act assault/reward decisions.
- [ ] Larger tower identity, readable specialties and threats, biome landmarks.
- [ ] Longer musical development, distinct instruments, space for critical cues.
- [ ] Sustained emulated device performance and touch response measurements.
- [ ] Re-derived balance envelopes and goldens, complete browser matrix, deployed review.

Physical thermal behavior and speaker/headphone listening require real devices;
emulation and offline audio checks will be labelled as such. They do not block
implementing and verifying everything this environment can exercise.
