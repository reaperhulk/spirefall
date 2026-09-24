# The incremental loop: review and implementation — September 2026

A review of Spirefall as a rogue-lite incremental, and what shipped in
response. Changes landed on `main` one at a time. Each behind rules 6 where it
changes a run, so rules-4 and rules-5 replays keep their exact outcomes
(`fixtures/rules-4-goldens.json`, `fixtures/rules-5-goldens.json`).

## What the review found

Measured with a new career harness (`src/harness/pacing.ts`,
`scripts/profile-careers.ts`; baseline in
[incremental-careers-baseline.json](incremental-careers-baseline.json)):

- **Income barely grew with progress.** A cleared wave paid a flat 15 Sparks,
  so the balanced pilot earned 259–402 per run from run 2 to run 14 while its
  depth went from wave 12 to 19.
- **Prestige did not pay.** Ascending burned the whole stat tree for 1 Ember
  plus 1 per win (2–3 Embers). The active pilot's first cycle won on run 6;
  its next two cycles took 10 and 9 runs.
- **Winning made the next run harder, unasked.** Every win added a forced
  Crucible rank (+10% enemy HP) until ascension. After its first win the
  balanced career slid 23, 21, 20, 18.
- **The late tree was one knob.** Honed Edge III's nine levels cost 145k of the
  tree's ~207k Sparks for +72% damage.
- **Nothing new after the first few runs.** Every unlock costs 100–250 Sparks.

One claim in the original review did not survive measurement: the reference
bots buy something almost every run (cheap levels always remain), so "runs
between purchases" was not the problem. The pacing harness tracks it anyway.

## What shipped

| Change | Where |
|---|---|
| Depth-scaled Spark pay: 5 + 1.5 × wave per cleared wave, +15 per wave past your best (the frontier) | `computeSparks`, `depthSparks` (step.ts) |
| Ascension keeps 35% of burned Sparks (+10%/level of Ashen Legacy); Embers pay 1 + (1 + rank) per win + 1 per 5,000 Sparks the cycle earned | `ascend`, `emberGainOnAscend` (meta.ts) |
| The Crucible is chosen before a run, up to your best winning rank + 1 (max 10). The ladder is lifetime and survives ascension | `crucibleUnlocked`, `setCrucibleRank` (meta.ts); Next run tab |
| Honed Edge III cut to 4 levels (exact refund for existing saves). Three tier-3 nodes take its budget: Battle-Hardened (veterancy stars add damage), Relic Cartography (+1 relic per offer), Deep Reserves (+1 command charge per level) | metaTree.ts, combat.ts, save.ts |
| The eight transformative relics start sealed; guardian first kills, a first win and a Crucible-1 win break the seals | `RELIC_SEALS` (content.ts), `sealedRelics` (campaign.ts) |
| At Crucible rank 1+, a guardian slain on its wave offers spoils: exchange one carried relic for one of two, or walk away | step.ts wave clear, `SpoilsModal` |

## Measured results

Four career seeds × two pilots × 40 runs, rank-0 reference, ascending after two
wins in a cycle ([incremental-careers.json](incremental-careers.json)):

| | Before | After |
|---|---|---|
| Balanced, runs to first win per cycle (seed `career`) | 17, 14 | 19, 6, 7 |
| Active, runs to first win per cycle (seed `career`) | 6, 10, 9 | 6, 3, 2, 3, 1, 2, 4, 1 |
| Active, pooled first wins, cycles 1 → 2 → 3 (4 seeds) | — | 22 → 18 → 13 |
| Balanced, Sparks in 40 runs (seed `career`) | 21,236 | 35,173 |
| Active, Sparks in 40 runs (seed `career`) | 29,718 | 56,175 |
| Victories in 40 runs, balanced / active (seed `career`) | 3 / 6 | 6 / 16 |
| 22-run reference career, runs 18–22 vs runs 2–6 income | 1.75× | 4.1× |
| Waves on the runs after the first win (22-run career) | 23, 21, 20, 18 | 24, 24, 23 |

The balance envelope pins these: pooled prestige (cycle 2 no slower,
cycle 3 at most 60% of cycle 1), income at least 3× across the
reference career, and no post-win slide below wave 21. The fixed-budget curve
is unchanged. Budget references now start from `seasonedMeta`, with every
seal broken and the biome pool untouched, so every seasoned golden kept its
outcome. The fuzzer's pinned exploit genomes and the pooled 5k Glassforge floor
all pass.

A fresh account plays with a sealed pool, which moved the fresh-account
goldens: balanced-fresh went from 5 to 11 waves, active-fresh from 15 to 13,
greedy-fresh stayed at 8. These are single-seed movements from changed relic
draws. The fresh-account envelope still holds.

## What did not ship, and why

Guardian relic picks were meant to add build decisions to every run. Each
version was measured with the active pilot on 4 biomes × 4–5 seeds:

| Spoils variant, at rank 0 | Result |
|---|---|
| Add a relic, full table | 2/16 wins at 5k Sparks (the breaking boundary) |
| Add a relic, commons only | 0/16 at 5k (+1.5 mean waves), but three pinned exploit builds won below their floors |
| Exchange, full table | Calibrated 5k Glassforge build: 0/20 → 5/20 wins |
| Exchange, commons-only offers | 5/20 |
| Exchange, common for common | 3/20 |
| Draw spoils but never swap (RNG noise only) | 2/20 |

Relic agency is worth real power to relic-dependent builds, so spoils became
Crucible content. The heat pays for them, and every account that sees them
has already won. Making them safe at rank 0 would need a deliberate Glassforge
recalibration, which was out of scope here.

## Not yet measured by a person

The pacing numbers come from reference policies, not human play. Still worth a
human pass:

- whether a 35% head start *feels* like a reward rather than a loss;
- whether the Crucible rank picker is discoverable on the run-over screen;
- whether sealed relics read as goals rather than missing content;
- whether the phone layout of the grown Spire Tree stays comfortable.

## Reproduce

```sh
npm run check
CAREER_SEEDS=career,cb,cc,cd ./node_modules/.bin/vite-node scripts/profile-careers.ts 40 docs/incremental-careers.json
```
