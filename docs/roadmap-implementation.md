# September improvement release

Implemented directly on main from the review at `561ba78`. The deterministic
30 Hz engine and serialized command boundary are retained. No renderer or engine
migration was needed. Gameplay changes deliberately regenerated golden fixtures;
existing balance and anti-exploit assertions were kept.

## Delivered

- [x] Terrain caches identify the actual generated map/theme/DPR. Battle scars
  use a per-session identity and reset for rematches and replay seeks.
- [x] Original replay state and commands survive save/reload. Recordings carry
  rules version 3, accept explicitly bounded checkpoints, validate content and
  commands, and bound compressed imports. Old incompatible recordings report an
  error; old saves can still resume from a migrated checkpoint.
- [x] Five-second and lifecycle checkpoints, last-good backup recovery, visible
  storage failures, and one save per event batch. Reset/import cannot be undone
  by the outgoing page's checkpoint. Lifecycle handling is a separate hook.
- [x] Planning dialogs suspend gameplay and trap/restore focus. Build time freezes
  coin expiry. Hints reserve their space. The Spire Tree has a larger graph,
  readable locked labels, explicit branch-spend prerequisites, and free keystone
  respec. Hard reset lives in Settings.
- [x] Three shared tactical charges replace unlimited per-tower maintenance.
  Overcharge boosts the next shot to 250%; one shared charge recovers every six
  combat seconds before modifiers. Coin payouts merge into nearby piles.
- [x] Four early persistent doctrines: Shatter, Siege, Storm and War economy.
  Rewards identify affected tower families, owned towers and doctrine alignment.
  Gold and Ash gain rival keystones. Ascension retains tower and ability unlocks.
- [x] Act guardians at waves 6/12/18 and the wave-24 Hollow Sovereign, with
  telegraphed armor, an exposed core, escorts and a distinct broken-halo body.
  Versioned authored map patterns add divides, bends and bridge/island approaches.
  An optional shrine asks for remote coverage in exchange for gold.
- [x] Fortress masonry, battlements, pennant, damaged states and rubble surround
  the Spire core. Brighter biome/path separation, shared tower art in the shop
  and Codex, specialization silhouettes, and a consistent engraved HUD icon set.
  Shield rejection and urgent tells survive reduced-effects mode; cannon impacts
  now match the simulation's immediate hit.
- [x] A recurring authored Spire phrase supplements the adaptive biome score.
  Music scheduling rebases after mute/suspension instead of replaying a backlog.
  Priority SFX reserve urgent capacity, routine sounds and music duck briefly for
  major cues, and both use the master mix. Independent volume, calm audio and
  reduced combat effects are available.
- [x] Normalized Daily progression, arsenal, biome, Crucible and rules. Replays
  support wave checkpoints and asynchronous backward/forward seeking. Defeat
  reports identify the enemies causing leaks and towers with no recorded damage.
- [x] Arrow aiming/sweeping, enemy cycling, independent execute, remappable combat
  keys and optional hold-beam control. Reserved spell/menu keys cannot collide;
  losing focus releases a held beam.
- [x] Navigation caches survive ticks/upgrades until occupancy changes. Interpolation
  reuses lookup maps; effects cap at 256 with reserved urgent space; backing DPR
  caps at two; hidden tabs stop work and catch-up caps at 24 ticks per frame.
  Diagnostics expose frame, simulation, render, input-queue, save and voice data.

## Verification and measurements

`npm run check` passes lint, TypeScript, 294 tests across 33 files, and production
build. Tests cover deterministic equivalence, engine invariants, golden outcomes,
anti-exploit fuzzing, navigation/terrain identity, respec, Daily normalization,
map connectivity, save recovery and specialized imports, replay seeks, and muted
music recovery. The browser suite now contains 65 cases, including mobile layouts,
real touch input, audio unlock, a piloted victory, save/replay round trips,
planning/focus, respec/reload, remapping and dense profiles. CI is the browser gate:
local Chromium installation was unavailable in the development environment.

The first expanded browser run passed 63/65. It found a timeline overlapping Pause
(fixed by placing playback controls above the HUD) and an obsolete emoji assertion
(updated to check the accessible audio state). See the subsequent CI runs for the
fix verification; no assertions were relaxed to hide simulation failures.

### Browser baseline

Source: [browser-profile.json](browser-profile.json), commit `671f8ba`, headless
Chromium on a GitHub Actions Ubuntu runner. Each five-second synthetic scene starts
with 40 towers, 300 high-HP slow enemies, 100 coins, a beam and an active AudioContext.

| Speed | Frame p50 / p95 / p99 | Render p95 | Simulation per frame p95 | Save sample |
|---|---|---:|---:|---:|
| 1× | 16.7 / 16.8 / 33.4 ms | 5.8 ms | 0.8 ms | 0.9 ms |
| 3× | 16.7 / 16.8 / 16.8 ms | 5.1 ms | 0.9 ms | 1.1 ms |
| 10× | 16.7 / 16.8 / 33.2 ms | 5.4 ms | 2.4 ms | 0.9 ms |

Only two input-queue samples were collected per scene; these cannot establish
input-latency percentiles. Reported heap values were quantized, so no leak-rate
claim is made. The scenes exercise dense entities, but effects naturally remain
below the cap. These results do not establish phone performance, real GPU budgets,
long-session memory behavior or subjective audio quality.

### Held-out pilots and geography

Source: [release-profile.json](release-profile.json). Reproduce with
`./node_modules/.bin/vite-node scripts/profile-release.ts`. Six fresh seeds use the
same 10k reference progression plus all tower unlocks. Attention-limited pilots
issue at most one action every 400 ms; the unrestricted pilot is a ceiling.
Family pilots use fixed compositions, without optimized relic or specialization
selection. Their results measure those policies, not the maximum strength of a
family. “Passive” here still builds, casts spells and collects, but does not use
the beam, execution or charge layer.

| Pilot | Mean waves cleared | First-victory runs / 6 |
|---|---:|---:|
| Passive reference | 18.83 | 1 |
| Attention-limited reference | 21.33 | 1 |
| Unrestricted active reference | 22.00 | 2 |
| Shatter composition | 19.67 | 1 |
| Siege composition | 13.50 | 0 |
| Storm composition | 17.83 | 1 |
| War economy composition | 16.17 | 0 |

The active layer retains value under a limited action budget. Siege remains a
specialist requiring crowd-control/splash support; early economy investment is
risky. These experiments do **not** establish equivalent viability across all
four doctrines. Avoid tuning every family to win every matchup. Human pilots and
broader unseen seeds should decide whether the remaining gap is policy, balance,
or unclear counterplay. The profile records simulated time to upgrade,
specialization, first guardian and victory; those are not human onboarding times.

Across 160 additional maps (40 seeds × four biomes), natural paths span 24–37
cells. Mean lengths: Verdant 29.4, Frostfen 28.8, Ember Waste 29.1, Highlands 30.1.
The deterministic campaign tests separately validate connectivity and minimum
buildable space across 160 maps. No claim of equal seed difficulty is made.

## Remaining human and administrative gates

- Run a 15-minute listening session on headphones and phone speakers: motif
  recall, fatigue, cue recognition and mix balance. The delivered score is a
  synthesized authored-phrase prototype; recorded stems are not assumed better.
- Playtest first decisions, charge timing, the finale and all four doctrines.
  Verify real touch targeting and the timing/comfort of assistive workflows.
- Profile representative physical phones and desktop hardware at 1×/3×/10×,
  with longer input/heap samples. Tune quality defaults to those measurements.
- Change GitHub's default branch from the legacy Claude branch to `main` in
  repository settings. The connected GitHub app has no repository-administration
  capability; commits, CI and deployment already target `main`.

Additional entrances, guaranteed base coin income, earlier specializations,
recorded audio stems, workers and WebGL were optional experiments in the review.
They were not added without evidence that they improve this release. The concrete
prototypes above preserve the engine and leave those choices open.
