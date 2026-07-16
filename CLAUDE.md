# Spirefall — rogue-lite incremental tower defense

Read PLAN.md before making architectural changes — it is the design contract.

## Project structure

- `src/engine/` — Pure, deterministic simulation. **No DOM, no `Date`, no
  `Math.random`, no I/O, no scheduling.** ESLint enforces this.
- `src/engine/__tests__/` — Unit, determinism, property, and golden tests.
- `src/data/` — Content as plain data: maps (string art), towers, enemies,
  abilities, relics, the meta tree, pacing constants.
- `src/harness/` — Headless tooling: strategy bots, autoplay/careers, scenarios,
  state hashing. `src/harness/__tests__/` holds the balance envelope + perf budget.
- `src/ui/` — React shell + canvas renderer. `session.ts` bridges real time to
  fixed ticks; commands are the only write path into the engine.
- `e2e/` — Playwright suite driving the real UI (buttons, canvas clicks) plus the
  `window.__harness` hooks.
- `fixtures/goldens.json` — pinned outcomes of named bot playthroughs.

## Dev commands

- `npm run dev` — Vite dev server (http://localhost:5173)
- `npm test` — Vitest watch; `npm run test:unit` for one-shot
- `npm run test:e2e` — Playwright browser suite (builds + serves automatically)
- `npm run check` — full local gate: lint + typecheck + unit tests + build.
  **Run this before committing.**
- `npm run goldens:update` — regenerate golden fixtures after an intentional
  balance change; commit the diff and say so in the commit message.

## Architecture rules (non-negotiable)

1. The sim advances in **fixed ticks** (30/s, `src/engine/step.ts`). Real time
   never enters the engine; `step(state, commands)` advances exactly one tick.
2. All randomness flows from the seeded RNG streams stored **in** `RunState`
   (`src/engine/rng.ts`). Never `Math.random` in engine/data/harness (non-test).
3. Player actions are serializable `Command`s; observable effects are `GameEvent`s.
   The UI never mutates state directly — it queues commands into `GameSession`.
4. `RunState`/`MetaState` stay plain JSON data. Serialize/restore mid-run must be
   lossless (determinism.test.ts proves it).
5. Gameplay math is integer/fixed-point (positions in millicells, 1000/cell).
   No `Math.sin/cos/atan2/pow/exp/log` in the engine — not spec-pinned across
   platforms.
6. Entity iteration order is stable (arrays in ascending spawn-id order).
7. New engine behavior ships with tests. Balance-affecting changes must update
   `fixtures/goldens.json` (via the script) and keep the balance envelope
   (`src/harness/__tests__/balance.test.ts`) green — re-derive its numbers when
   the curve intentionally moves.

## Browser playtesting

`window.__harness` (installed by the UI): `getState()`, `snapshot()`,
`dispatch(cmd)`, `setSpeed(0–100)`, `fastForward(seconds)`, `newRun(seed)`,
`buyMeta(id)`, `getReplay()` (seed + full command log), `reset()`.
Deterministic repro: `newRun('some-seed')` then replay the logged commands.
