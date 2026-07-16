# Spirefall

A rogue-lite incremental tower defense game. Defend the Spire on a real playfield —
place towers, cast abilities, choose relics — and lose. When the Spire falls it sheds
**Sparks**, permanent currency that makes the next run reach further. Failure is the
progression loop.

The whole game runs on a pure, deterministic, headless simulation core: a full run is
just `(meta, seed, commands)`, so replays, save games, bot playtesting, and golden
tests are all the same mechanism.

See [PLAN.md](PLAN.md) for the full design and engineering plan, and
[CLAUDE.md](CLAUDE.md) for dev workflow and architecture rules.

## Running locally

```bash
npm install
npm run dev     # vite dev server
npm test        # vitest watch mode
npm run check   # full local gate: lint + typecheck + tests + build
```

## Status

**M0 — Skeleton.** Deterministic engine core (seeded RNG, fixed-tick step,
command/event plumbing) with determinism and property tests, CI, and a placeholder
page. See PLAN.md §8 for the milestone roadmap.
