# Spirefall — rogue-lite incremental tower defense

Read PLAN.md before making architectural changes — it is the design contract.

## Project structure

- `src/engine/` — Pure, deterministic simulation. **No DOM, no `Date`, no
  `Math.random`, no I/O, no scheduling.** ESLint enforces this.
- `src/engine/__tests__/` — Unit, determinism, and fast-check property tests.
- `src/data/` — Static content definitions (towers, enemies, relics, meta tree).
- `src/harness/` — Headless tooling: bots, scenario runner, replay tools.
- `src/ui/` — Renderer + shell. Consumes state snapshots and events, emits commands.
- `fixtures/replays/` — Golden replay fixtures.

## Dev commands

- `npm run dev` — Vite dev server
- `npm test` — Vitest watch; `npm run test:unit` for one-shot
- `npm run check` — full local gate: lint + typecheck + unit tests + build.
  **Run this before committing.**

## Architecture rules (non-negotiable)

1. The sim advances in **fixed ticks** (`TICKS_PER_SECOND` in `src/engine/step.ts`).
   Real time never enters the engine; `step(state, commands)` advances exactly one tick.
2. All randomness flows from the seeded RNG streams stored **in** `RunState`
   (`src/engine/rng.ts`). Never `Math.random`.
3. Player actions are serializable `Command`s; observable effects are `GameEvent`s.
   The UI never mutates state directly.
4. `RunState` stays plain JSON data — no classes, Maps, functions, or `undefined`
   holes. Serialize/restore mid-run must be lossless (there's a test for it).
5. Gameplay math is integer/fixed-point. No `Math.sin/cos/atan2/pow/exp/log` in the
   engine — those aren't spec-pinned to exact results across platforms.
6. Entity iteration order must be stable (arrays ordered by monotonic spawn id).
7. New engine behavior ships with tests, and `assertInvariants` must keep passing
   under the property suite. If you intentionally change balance/outcomes, update
   goldens explicitly and say so in the commit message.
