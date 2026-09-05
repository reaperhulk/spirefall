# September improvement release

Implemented on `main` from [the review](september-review.md) at commit `561ba78`. The implementation checklist
is complete. The deterministic 30 Hz engine, immutable run snapshots, serialized
commands, and replay boundary remain intact. Human listening, first-time-player
comprehension, and physical-device comfort are not established by automated tests.

## Delivered against the review

| Area | Shipped behavior |
|---|---|
| Reliability | Correct map/theme/resolution terrain cache; per-session scars; original replay start/log retained across reloads; bounded imports; five-second/lifecycle saves and recovery backup; visible storage failures; one save per event batch. |
| Planning and progression | Blocking reference/settings screens suspend play and trap focus; build time freezes coin expiry; hints reserve space; readable full-screen tree, branch-spend prerequisites and free keystone respec; Gold/Ash rival commitments; ascension retains tower/ability unlocks. |
| Active play | Three shared overcharge charges, 250% next shots and six-second baseline recovery; merged coin piles; independent execution; target cycling; remappable combat keys; hold/toggle beam and blur release; direct target/execute/beam buttons beside the battlefield. Native Space activates focused buttons. |
| Build identity | Four early doctrines, specific opening/tactics/weakness guides, reward fit against owned towers, and a paid focused reroll guaranteeing one unowned family relic. Focus costs 150% of a normal reroll and shares its once-per-offer limit; other choices remain random. |
| Placement | Preview compares the resulting route, route length, new tower coverage, and existing coverage gained/lost. Shape-marked cells supplement color; enemy occupancy and affordability remain live while geometry is cached. |
| Run arc | Act guardians at 6/12/18; wave-24 Hollow Sovereign with armor telegraphs, escorts and an exposed core; authored procedural map structures; optional remote shrine defense; leak timeline and low-contribution defense feedback. |
| Art | Layered fortress masonry, pennant, damage and collapse states; clearer biome/path separation; shared tower portraits; twelve specialization silhouettes and impact engravings; engraved HUD icons; immediate cannon impacts; shield and urgent tells retained in reduced effects. |
| Music and sound | Authored preparation, pressure, boss, victory and ascension phrases; four biome instrument voices and spaces; adaptive accompaniment; bounded scheduling after mute/stalls; shared master mix, urgent voice reserves and ducking; readiness/core/heat cues; independent volume and calm mix. |
| Replay and Daily | Normalized Daily progression/arsenal/biome/Crucible/rules; versioned recordings, wave checkpoints, asynchronous forward/backward seeking, restored original command logs after reload, and actionable defeat reports. |
| Performance | Navigation/topology caches, reused interpolation maps, bounded effects, actual-display backing resolution with DPR capped at two, resize handling, explicit quality controls, paused-idle draw suppression, hidden-tab suspension and bounded catch-up. Diagnostics cover frames, simulation, draw, each input through draw, saves and audio voices. |
| Architecture and validation | Run checkpoint hook, keyboard hook, dedicated Settings/Relic screens and tactical controls. Held-out family policies and evolutionary doctrine/focused-draft genes; CI retains browser reports and measurement attachments on success as well as failure. |

Recordings now use rules version **4**. Rules-3 recordings remain compatible:
existing command semantics and RNG paths are unchanged, and the added focused
reroll is an explicit new command option. Older incompatible recordings fail
clearly; supported old saves migrate to resumable checkpoints. Golden fixtures
were regenerated for the earlier intentional combat/map changes. The focused
reroll extension verified that existing goldens remained unchanged.

## Verification

- `npm run check`: lint, type checking, **305 tests across 38 files**, and production build passed on `6f9c244`.
- Browser integration: **72 tests** passed on `6f9c244` in [CI run 33943758907](https://github.com/reaperhulk/spirefall/actions/runs/33943758907).
- Four-biome evolutionary search with doctrine/focused-draft genes: **all four biomes passed**, 9,304 evaluated runs, on `6f9c244` in [deep-fuzz run 33943758869](https://github.com/reaperhulk/spirefall/actions/runs/33943758869); [summary data](fuzz-profile-completion.json).
- Production JavaScript: **477.36 kB / 154.74 kB gzip**. This is larger than the reviewed build (419.69 / 133.79); the release adds content and controls, and is not a bundle-size reduction.
- Live production inspection: the deployed page loaded `index-DITtpsTb.js`, matching the local production build, with an 816 px desktop board and the 15% Glassforge description/current-bonus display.


A live inspection caught an intrinsic-size feedback bug in the first responsive
canvas revision: its unconstrained parent could shrink to the canvas default.
The board now has an explicit width and logical maximum; desktop and retina-phone
assertions pin the displayed size. Measurements from that undersized revision
(`c955b50`) are excluded from the final performance table.

### Browser measurements

[Raw browser profiles](browser-profile-completion.json), measured at `9673243` in [CI run 33943155587](https://github.com/reaperhulk/spirefall/actions/runs/33943155587). All 30 combat towers fired in each case; the other ten were support towers.

| Speed | Frame p50 / p95 / p99 (ms) | Simulation p95 (ms) | Draw p95 (ms) | Input to draw p95 / p99 (ms) | Save p95 (ms) |
|---|---:|---:|---:|---:|---:|
| 1× | 16.7 / 16.7 / 16.8 | 0.5 | 4.0 | 26.4 / 27.0 | 0.8 |
| 3× | 16.7 / 16.7 / 16.8 | 0.8 | 4.9 | 10.3 / 10.6 | 1.8 |
| 10× | 16.7 / 16.8 / 16.8 | 1.2 | 3.5 | 9.8 / 10.2 | 0.7 |

All three speeds met the provisional 60 fps target on this runner. The preceding comparable run (`16725c3`) measured 33.3 ms p95 at 10×, so the raw data retains both runs. This variability is not evidence of a speedup from the balance change, and one synthetic scenario does not establish a universal frame rate.

The scenario begins with 40 towers, 300 slow high-HP enemies, 100 coins, a beam and
an active AudioContext. Each speed includes 120 real keyboard events through the
UI and at least one periodic save. “Input to draw” starts at command dispatch and
ends after drawing the applied state; it excludes OS input queues and display
scan-out. All samples come from headless Chromium on a shared GitHub Actions
Ubuntu runner, not representative physical hardware. The diagnostics retain the
latest 512 samples per metric.

Auto quality starts at display size × capped DPR. Every 120 active frames,
more than 24 frames costing over 14 ms reduce resolution one rung (100%, 75%, 50%)
and cap ordinary effects at 48, with 64 urgent slots retained. Three healthy
windows (over 110 frames below 7 ms each) restore one rung. Low uses DPR 1 and the
reduced ordinary-effect budget; High uses capped DPR 2. Urgent tells remain.
A 60 fps target at 1× and a 50 ms input-to-draw p95 are provisional tuning goals;
the CI input ceiling is 150 ms. Physical devices still need measurement.

### Audio and memory

The browser restart soak ran ten dense sessions over **30 seconds**, with
explicit garbage collection and precise CDP heap sampling between sessions.
Retained growth was **388,364 bytes (0.37 MiB)**; collected heap samples ranged
from 4.51 to 5.16 MB, and every sample had 305 DOM nodes. Audio remained running.
This measures short repeated-session retention, not a multi-hour leak proof.
The rounded 10 MB `performance.memory` values in the speed profiles are not used
as heap evidence.

[Audio render data](audio-profile.json) covers twenty biome/phase combinations:
peak magnitude **0.01133–0.01779**, minimum RMS **0.001352**, and zero measured
tail RMS. The long scheduler test capped live sources at 36 and recovery work at
20 scheduling calls per wake. Dense browser SFX p99 was 16/14/19 voices at
1×/3×/10×; music p99 was 11 voices at every speed.

The 15-minute scheduler test varies biomes, game phases and mute intervals, then
adds a ten-minute stall. It checks finite scheduled values, bounded active
sources and bounded recovery work. Twenty real OfflineAudioContext renders cover
all five phrases in all four biomes, using the live instrument graph. These
checks verify signal/graph behavior, not musical enjoyment or speaker balance.

### Build families and pacing

[Family data](family-profile.json): 192 runs, four families × four biomes × six
fresh seeds × two progression budgets, plus all tower unlocks. Each pilot issues
at most one command every 400 ms, including building, targeting, collection and
abilities. Policies were frozen before the held-out sweep. They include sensible
crowd support for Siege, family relic priorities, specialization choices and a
health-gated single Mint investment. They are reproducible reference policies,
not optimal play or human win rates.

| Family | 10k: mean waves / wins out of 24 | 20k: mean waves / wins out of 24 |
|---|---:|---:|
| Shatter | 16.42 / 0 | 19.96 / 1 |
| Siege | 17.21 / 0 | 22.04 / 12 |
| Storm | 17.12 / 0 | 22.58 / 15 |
| War economy | 16.92 / 0 | 21.71 / 11 |

Several distinct families win across unseen seeds and biomes. Shatter is less
reliable under this policy; these results do not establish equal strength.
Its slow/splash interaction works, but greater specialization does not replace
adequate damage and air coverage. No flat buffs were added to equalize this table.

| Milestone | 10k median / runs reaching it | 20k median / runs reaching it |
|---|---:|---:|
| First upgrade | 17.0 s / 96 | 2.4 s / 96 |
| First specialization | 435.6 s / 15 | 438.4 s / 75 |
| First guardian | 62.1 s / 96 | 52.5 s / 96 |
| First victory | none / 0 | 840.8 s / 39 |

Times are simulated seconds including automated planning, not onboarding times.
The first pilot audit found an eight-tower policy ceiling that suppressed every
family; the final policies expand as waves progress. Earlier passive/attention/
unrestricted comparisons and 160 additional geography samples are retained in
[release-profile.json](release-profile.json). Generated-map tests separately
check connectivity and buildable space. No equal-seed-difficulty claim is made.

### Glassforge calibration

Expanded search found repeatable 5k-Spark wins from three related sniper policies.
A first flat adjustment from +35 to +25 damage points stopped two known cases,
but adding beam use or Shatter/Siege restored repeatable wins. Controlled price
and damage variants are retained in [the doctrine ablation](glassforge-doctrine-ablation.json)
and [the initial component ablation](glassforge-ablation.json); higher purchase
prices were not a reliable fix.

Glassforge now amplifies **damage earned from Honed Edge by 15%**, rounded down,
while keeping its 1200-Spark price and 40% max-HP cost. That adds 9 damage points
at eight Honed Edge levels, 19 at sixteen, and 30 at the full twenty-five. Its
current contribution is shown in the tree. It rewards deeper Iron investment
without multiplying base tower damage, relics, Ember bonuses or doctrine bonuses.

A 20% amplification passed the evolutionary sweep but failed a cross-check
against older discoveries: the tests examined each lineage in isolation and
missed the oracle's independent-lineage rule. The regression now pools all known
wins per biome and invokes the actual calibration. This caught the gap without
changing any threshold or independence rule.

[The final matrix](finish-balance-profile.json) covers **240 runs**: three frozen
Glassforge policies plus an independent no-keystone Storm policy, each crossed
with all four doctrines and no doctrine. At 5k, the Glassforge policies won
**0 of 120 runs**. The independent reference won 4 of 40, all on the same seed
(`theta`), which remains a permitted soft seed. At 20k, Glassforge won
**20 of 60 runs on four seeds outside the evolutionary search set**; the independent reference won 5 of 20.
These are constrained policies, not an estimate of optimal play. No-keystone
reference and family pilots are unaffected by the tuning.

The changed bonus is captured only when creating a new run. Existing replay
initial snapshots retain their recorded modifiers. Regenerating the goldens
changed only `glassforge-active` (5k: victory → wave-23 defeat); six existing
non-Glassforge scenarios stayed identical. Engine tests pin the scaling and HP
tradeoff, and a 160-run pooled regression covers all four discovered lineages and their doctrine
variants.

## Deliberate scope decisions

- Keep the shared-charge/beam prototype and physical merged coins. Guaranteed
  base income plus collection bonuses remains a separate economy experiment.
- Use the rival branch-ending keystones as the late commitment. Do not add the
  older tree draft's second-spec or infinite-beam capstones, which erase the
  tradeoffs the review asked to preserve.
- Keep tier-3 specialization while early doctrines supply a build choice by
  wave 2. Its measured late arrival is visible above, not hidden by the report.
- Use authored synthesized phrases and voices as the hybrid-score prototype;
  recorded stems were optional. A listening pass should guide any replacement.
- Keep one entrance with authored structures and a shrine. Additional scheduled
  entrances were an optional geography experiment, not required for this slice.
- Keep Canvas and the main-thread engine. The measurements do not justify a
  worker, WebGL migration, or new targeting index.
- All implementation commits, CI and deployment target `main`. GitHub also
  reports `main` as the repository default at completion; the earlier review
  observed the legacy branch as default.

## Human acceptance still unmeasured

A person should play the opening, charges, four doctrines and finale; assess
keyboard/touch comfort; listen for fifteen minutes on headphones and phone
speakers; and profile actual phones/desktops. Automated audio, input, layout,
replay, memory and balance checks are complete, but they cannot establish these
subjective or physical-device outcomes.

## Reproduce

```sh
npm ci
npm run check
npm run test:e2e
npm run fuzz:builds
./node_modules/.bin/vite-node scripts/profile-families.ts
./node_modules/.bin/vite-node scripts/profile-release.ts
./node_modules/.bin/vite-node scripts/verify-finish-builds.ts
./node_modules/.bin/vite-node scripts/profile-glassforge.ts
./node_modules/.bin/vite-node scripts/profile-glassforge-doctrines.ts
```

The browser suite requires Chromium; CI installs it and publishes its reports.
Local Chromium installation was unavailable in this work environment, so browser
acceptance used CI plus a live deployed-page inspection.
