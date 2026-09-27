# docs/

Review reports and the measurements behind them. **Every JSON file here is
a historical snapshot**: it records what one commit measured under one rules
version, and nothing regenerates or tests it. The live numbers are the
assertions in `src/harness/__tests__/` (balance envelope, fuzz pins,
Glassforge floor) and `fixtures/goldens.json`.

Profile scripts (`npx tsx scripts/<name>.ts`) write to the gitignored
`profiles/` directory, or to `PROFILE_OUTPUT` if set. Copy a report into
`docs/` only on purpose, alongside the write-up that cites it, and record the
rules version and commit it measured.

## Reports

| Report | Covers |
|---|---|
| [project-review.md](project-review.md) | Correctness/tooling review and fixes, rules 7 (2026-09-27) |
| [incremental-review.md](incremental-review.md) | The incremental loop, rules 6 (2026-09-24) |
| [second-review-implementation.md](second-review-implementation.md) | Second review release (2026-09-05) |
| [september-review.md](september-review.md) | Design review of `561ba78` (2026-09-05) |
| [roadmap-implementation.md](roadmap-implementation.md) | September improvement release (2026-09-04) |
| [spire-tree-redesign.md](spire-tree-redesign.md) | Spire Tree restructure |
| [iterations.md](iterations.md) | Iteration log, oldest first |

## Snapshots

| File | Recorded | Rules | Cited by |
|---|---|---|---|
| incremental-careers.json | 2026-09-24 `8669213` | 6 | incremental-review.md |
| incremental-careers-baseline.json | 2026-09-24 `52b3c75` | 5 | incremental-review.md |
| second-review-careers.json | 2026-09-05 `9357754` | 5 | — |
| second-review-families.json | 2026-09-05 `bd24aa8` | 5 | second-review-implementation.md |
| second-review-allocations.json | 2026-09-05 `bd24aa8` | 5 | — |
| second-review-browser-profile.json | 2026-09-05 `e63cb5d` | 5 | second-review-implementation.md |
| browser-profile.json | 2026-09-04 `01fc4b5` | 3 | second-review-implementation.md |
| release-profile.json | 2026-09-04 `01fc4b5` | 3 | roadmap-implementation.md |
| family-profile.json | 2026-09-04 `fbbb7ba` | 4 | roadmap-implementation.md |
| finish-balance-profile.json | 2026-09-04 `6f9c244` | 4 | roadmap-implementation.md |
| glassforge-ablation.json | 2026-09-04 `16725c3` | 4 | roadmap-implementation.md |
| glassforge-doctrine-ablation.json | 2026-09-04 `9673243` | 4 | roadmap-implementation.md |
| fuzz-profile-completion.json | 2026-09-04 `30a20c8` | 4 | roadmap-implementation.md |
| browser-profile-completion.json | 2026-09-04 `30a20c8` | 4 | roadmap-implementation.md |
| audio-profile.json | 2026-09-04 `30a20c8` | 4 | roadmap-implementation.md |
| browser-profile-final.json | 2026-09-04 `9403762` | 3 | — |
