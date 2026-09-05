# Spirefall review and improvement plan

Historical review of `561ba78`. For the delivered changes, measured results and
remaining human acceptance limits, see [the implementation report](roadmap-implementation.md).

Reviewed 2026-09-05 at commit `561ba788323d72d39a2c2f0893ae451e8e817669`.

**Recommendation: concentrate the next release on a coherent, readable, satisfying run.** Spirefall already has ample systems. The largest opportunity is to make its maze building, combat decisions, audiovisual identity, and progression reinforce one another. Preserve the deterministic engine and invest in the experience around it.

## Review basis

I inspected the engine, content, renderer, React UI, audio implementation, persistence/replays, harness, CI, original plan, and iteration history. I played the opening wave and inspected the progression screen on [the deployed game](https://langui.sh/spirefall/). Its JavaScript asset filename matched the local production build, `index-BjVpetDy.js`.

Local `npm run check` passed: lint, type checking, **270 tests across 26 files**, and production build. The loaded simulation benchmark averaged **0.634 ms/tick**, ending with **39 towers and 276 enemies** from a 300-enemy start. This includes neither rendering nor audio and is one environment, not a device performance guarantee. Production JavaScript was **419.69 kB / 133.79 kB gzip**. GitHub reported successful CI, deployment, and deep-fuzz runs for this commit. I did not run the complete local browser suite or an extended human campaign. Audio conclusions below come from source inspection and a scheduler probe, not a listening evaluation.

The repository was left unchanged. Suggested balance values and schedules below are prototypes to test, not measured improvements.

## 1. What to preserve

The pure 30 Hz simulation, seeded independent RNG streams, serializable commands, replayability, balance bots, evolutionary build search, and golden tests are valuable foundations. The existing content also has real interactions: Frost/Shatterheart, Beacon/Prism Lens, Lance ramping, tower specializations, terrain effects, and changing endless modifiers. Music already has biome modes, harmonic progressions, boss transitions, and event reactions; SFX already have differentiated synthesis, spatial panning, reverb, and throttling.

Consequently, “add tower upgrades,” “add bosses,” “add music,” “add particles,” and “use object pooling everywhere” are insufficient recommendations. Most already exist, and performance changes need end-to-end evidence. The next release should improve their meaning, visibility, and integration. [Engine](https://github.com/reaperhulk/spirefall/blob/561ba788323d72d39a2c2f0893ae451e8e817669/src/engine/step.ts), [content](https://github.com/reaperhulk/spirefall/blob/561ba788323d72d39a2c2f0893ae451e8e817669/src/data/content.ts), [score](https://github.com/reaperhulk/spirefall/blob/561ba788323d72d39a2c2f0893ae451e8e817669/src/ui/music.ts).

## 2. Fix these concrete problems first

| Priority | Finding and evidence | Change and acceptance criterion |
|---|---|---|
| P0 | Terrain cache identity is incomplete. It uses map ID, name, spawn row, rock count, and DPR; generated maps all use ID −1. A probe found `review-0` and `review-4` in Verdant have the same key despite **48 different rock cells**. Switching directly between such maps can show old terrain over new collision rules. | Key by immutable map identity or a complete generation identity plus generation version and DPR. Test different maps with equal rock counts and spawn rows; the displayed terrain must match the live map. |
| P0 | Resuming a run breaks shared replay import. Boot constructs a new `GameSession` from the current saved tick, while import requires `initial.tick === 0`. The save has neither the original initial state nor command log. A one-tick resumed-state probe already fails the importer’s tick guard. | Persist original state and log, or formally support versioned checkpoint replays and label the available segment. Verify play → reload → finish → export → import → identical outcome. Add a rules/content version; JSON schema version alone does not preserve old game rules. |
| P0 | Keystone respec exists in the engine but has no UI caller. Both tree UIs tell players to respec, while the graph detail only offers Buy/MAX. | Wire free between-run respec into the tree, persist it, and show the refund/effect. Test taking Glassforge, refunding it, and taking Bastion without wiping progress. |
| P1 | The music scheduler does not advance its cursor while muted, then loops over the entire elapsed interval on unmute. A fake-clock probe generated **1,760 scheduling calls after ten muted minutes**, 1,759 in the past. | Rebase or skip missed score steps in bounded work. Test mute/unmute and long scheduler stalls; at most the normal lookahead window should be scheduled. Actual audibility/CPU consequences need browser audio testing. |
| P1 | Battle scars are never drawn through the normal path. The session writes a key such as `verdant:0:seed`, while drawing checks `-1:seed` for generated maps. A stubbed-canvas probe recorded zero draw calls after stamping. | Use one shared map/run identity for both operations. Verify scars appear after kills and reset on new runs and rematches. |
| P1 | Planning is not consistently protected. Coins expire during build time; opening reference/settings/tree overlays does not pause the session. The opening tutorial’s disappearance moved the battlefield upward by **54 px** in the desktop inspection. | Pause gameplay for blocking/reference overlays, restore the prior speed on close, freeze collectible expiry while planning, and reserve or overlay hint space. Verify keyboard focus stays in dialogs and background shortcuts cannot act through them. |

Evidence: [terrain and decals](https://github.com/reaperhulk/spirefall/blob/561ba788323d72d39a2c2f0893ae451e8e817669/src/ui/render/terrain.ts#L21), [session lifecycle](https://github.com/reaperhulk/spirefall/blob/561ba788323d72d39a2c2f0893ae451e8e817669/src/ui/session.ts), [replay import and save wiring](https://github.com/reaperhulk/spirefall/blob/561ba788323d72d39a2c2f0893ae451e8e817669/src/ui/App.tsx#L277), [tree detail](https://github.com/reaperhulk/spirefall/blob/561ba788323d72d39a2c2f0893ae451e8e817669/src/ui/SpireTreeGraph.tsx#L343), [music scheduler](https://github.com/reaperhulk/spirefall/blob/561ba788323d72d39a2c2f0893ae451e8e817669/src/ui/music.ts#L255).

Also consolidate saves to once per event batch, add a modest periodic/lifecycle checkpoint, retain a last-known-good save, and surface save failures unobtrusively. Validate imported saves/replays before replacing the live session, with bounded decompression, finite numbers, valid content IDs, and ordered commands. A malformed shared replay should produce a useful error rather than crashing the game.

## 3. Make active play about decisions

The player currently manages placements, upgrades, targeting, spells, a beam, executions, overcharge, coins, boons, and relics. The same pointer collects, aims, selects, and executes. That produces activity, but some of the activity has a nearly automatic answer.

Overcharge is free and per tower. At the current 15-second base cooldown, keeping 30 combat towers charged would require about **120 activations per minute**, before selecting towers or doing anything else. The active bot can charge every ready tower in the same tick, aim precisely, execute instantly, and collect through other bot logic. Its performance is a ceiling, not a realistic reference for a mouse or touch player. [Active bot](https://github.com/reaperhulk/spirefall/blob/561ba788323d72d39a2c2f0893ae451e8e817669/src/harness/bots.ts#L312), [active constants](https://github.com/reaperhulk/spirefall/blob/561ba788323d72d39a2c2f0893ae451e8e817669/src/data/content.ts#L440).

Prototype a shared command-charge pool for overcharge: a few charges force a choice about which tower and which moment deserve the boost. Preserve the beam’s heat rhythm as a second source of tactical judgment, with clear aim mode and a reliable cancel. Make executions forgiving to select, particularly when enemies overlap or move between rendering and command application. Keep spells visually distinct and give their previews a clear affected area.

Keep physical coins initially, but merge nearby payouts into readable piles, allow generous sweeping, and freeze expiry during planning and menus. Measure whether sweeping adds pleasure or interrupts tactics. A more radical alternative to test is guaranteed base income plus a bonus for manually collected drops; this intentionally changes the current collect-or-lose design and needs an economy rebalance.

Add attention-limited bots with reaction delay, one action at a time, and competing collection/aiming budgets. Compare them with passive and unrestricted active bots at fixed seeds, builds, and progression. Judge the change by human decision quality, input burden, and survival differences, not the unrestricted bot’s win rate alone.

## 4. Give runs a stronger arc and identity

Victory currently arrives at wave 24, while bosses arrive every ten waves. Much of the six-boss roster is therefore beyond the first victory. The end of the standard run should be an encounter players remember. [Wave generator](https://github.com/reaperhulk/spirefall/blob/561ba788323d72d39a2c2f0893ae451e8e817669/src/engine/waves.ts), [pacing constants](https://github.com/reaperhulk/spirefall/blob/561ba788323d72d39a2c2f0893ae451e8e817669/src/data/content.ts#L687).

First add a dedicated wave-24 finale. Then test a four-act structure with climaxes around waves 6/12/18/24, redistributing the current encounters rather than merely adding more enemies. Each act introduces one counterplay lesson, one worthwhile build decision, and one payoff. The final boss should test the defense through telegraphed phases, escort threats, and vulnerable windows. Avoid unavoidable destruction of purchased towers.

Offer a modest build-defining choice by wave 2–3. Existing per-wave boons are useful tactical nudges; an early persistent rune or specialization lets the player form a plan before the first wave-5 relic. Keep randomness but provide controlled ways to pursue a build through tagged offers and limited rerolls.

Develop four recognizable build families using the existing roster:

| Build | Core interaction | Decision to deepen |
|---|---|---|
| Shatter defense | Frost, brittle, Shatterheart, cannon splash | Where to cluster enemies and when to trigger the chain |
| Siege defense | Lance ramp, sniper priorities, heavy single hits | How to hold priority targets in the firing lane |
| Storm network | Tesla chains and beacon placement | Network geometry and when to discharge stored power |
| War economy | Mint/interest, temporary vulnerability, delayed upgrades | How much safety to trade for future income |

Expose these relationships directly in rewards and inspection: what is affected, which owned towers benefit, what tradeoff is introduced. Do not guarantee a perfect build every run. Give each specialization a changed silhouette, firing effect, and understandable tactical role. Consider an earlier branch choice at tier 2 if players rarely experience specializations before losing.

## 5. Make the battlefield a place worth defending

The current opening scene is very dark, with small units and towers on a mostly empty grid. It is readable enough to operate, but the title’s central object is visually a small glowing diamond. The Spire should dominate the composition and carry the emotional investment.

Choose one art direction for a vertical slice: **a ruined arcane fortress being rebuilt under siege**. Give the Spire layered architecture, visible damage stages, firing machinery, repairs, and a distinct collapse. Towers should look related to that architecture, with differentiated materials and unmistakable silhouettes. Keep faction colors stable while increasing separation between terrain, friendly structures, enemies, and critical effects.

Improve one biome and three towers first. Author terrain tiles, landmark props, tower bodies, and enemy silhouettes as a coherent set; use animation and VFX to communicate weight and function. Canvas can draw authored sprites and layered assets without an engine migration. The current cached glows, recoil, projectiles, shadows, and interpolation are useful foundations.

Prioritize:

- Greater terrain/path contrast and fewer competing decorative marks.
- Large, legible enemy intent cues: shield block, healing pulse, phasing return, boss wind-up, air route.
- Distinct silhouettes for upgraded/specialized towers, not only colored rings or numbers.
- Strong cause and effect: align impact flashes, deaths, and audio with visible hits. Cannon damage currently resolves immediately while its visual shell flies for 240 ms, so victims can disappear before the displayed explosion.
- An uncluttered setting that reduces routine numbers/effects while preserving urgent tells.
- One custom icon family replacing the current mixture of emoji and symbols; use the same tower artwork in shop, codex, and battlefield.

The Spire Tree deserves a full-screen view, brighter locked labels, a readable selected-node panel, and an obvious route to a desired unlock. Distinguish decorative lineage lines from actual prerequisites: current unlocks depend on branch spending, not purchasing the displayed parent. Move hard reset out of the normal progression screen.

## 6. Add strategic geography and meaningful progression

Generated maps currently vary rocks and biome features, with entry and exit fixed to opposite sides in a narrow center band. That creates variation, but many maps invite the same entrance defense. Keep procedural generation while adding authored structural patterns: an S-bend, a central divide, a mesa overlooking two routes, a marsh basin, or a bridge approach. Validate connectivity and buildable area as today, then measure coverage, choke opportunities, route length, and seed difficulty distributions. [Map generation](https://github.com/reaperhulk/spirefall/blob/561ba788323d72d39a2c2f0893ae451e8e817669/src/engine/mapgen.ts).

Prototype one optional side objective, such as a relic shrine that requires defending a remote tile for a wave. It should challenge the established kill zone and offer a visible reward. Introduce additional entrances only with previewed schedules and enough preparation time. A placement preview should show both the resulting route and the coverage being gained or lost.

Complete the unfinished progression redesign before adding another currency. Iron currently has the only keystone pair; Gold and Ash lack equivalent commitments. Add economy and active-play alternatives after the input redesign stabilizes, and allow safe between-run experimentation. Capstones should transform play with explicit costs, not automatically remove every specialization’s tradeoff.

Ascension should preserve learned variety. Consider retaining tower/ability unlocks while resetting the numerical tree, or letting each ascension preserve one doctrine. Test this against the current full unlock reset; the goal is a new way to play the next cycle, not only faster repetition.

Track time to first meaningful upgrade, first specialization, first boss, and first victory. Evaluate distributions over many seeds. Permit tradeoff keystones to be worse in unsuitable situations; test that each has a viable niche and can be freely changed. An assertion that every keystone must improve every scenario would erase legitimate choices.

## 7. Music and sound: authored identity, procedural responsiveness

Retain the responsive music architecture but remove the zero-assets constraint if it limits the result. Build a recognizable short Spire motif and authored variants for preparation, pressure, bosses, victory, and ascension. Layer or rearrange those phrases using the existing state-driven system. Give biomes different instrumentation and space as well as scales and registers.

Prototype a hybrid score: authored phrases or short stems, procedural transitions and accents, and a small set of distinctive instrument/sample voices. Audition a 15-minute run before expanding production. Evaluate fatigue, thematic recall, transitions, and the mix on both headphones and phone speakers. This requires a listening pass that this review did not perform.

For SFX, add priority classes. The current global cap can suppress a Spire hit, boss cue, or ability behind ordinary shots and kills. Reserve capacity for urgent signals, combine dense repeated impacts, and duck routine combat under major events. Route music and effects through a deliberate master mix; the current music bus connects directly to the destination while SFX pass through their own compressor.

Add or strengthen recognizable feedback for shield rejection, boss vulnerability, beam heat/overheat, execution readiness, and upgrades. Keep action sounds immediate; musical quantization should not introduce input lag. Preserve independent music/SFX volume and add dynamic-range or reduced-audio-density options if listening tests justify them. [SFX implementation](https://github.com/reaperhulk/spirefall/blob/561ba788323d72d39a2c2f0893ae451e8e817669/src/ui/audio.ts).

## 8. Performance and engineering

The simulation benchmark is healthy, but the current budget does not cover Canvas, React, audio, saves, GPU fill, or frame-time spikes. Add a reproducible browser scenario with a dense late-wave board, active beam, coins, effects, and audio at 1×/3×/10×. Record p50/p95/p99 frame times, input latency, simulation time, render time, effect/voice counts, heap growth, and save cost on a desktop and representative phones.

Use 60 fps at 1× as a provisional target on agreed devices; define the reduced-quality fallback explicitly. Do not infer a universal frame rate from the headless result.

Optimize in this order when measurements support it:

1. Fix cache correctness, then cache the renderer’s blocked grid, distance field, and highlighted route until topology changes. They currently rebuild every frame; the engine also rebuilds its field every wave tick.
2. Bound and prioritize transient effects; aggregate coin floats and redundant impacts. Expiry filtering alone does not cap a burst.
3. Cap backing resolution consistently. Terrain limits DPR to 2, while the main canvas uses unrestricted device DPR; scale to actual display size and respond to resizing.
4. Stop unnecessary animation/subscriber work while fully paused or obscured. Reduce catch-up work per frame and explicitly handle tab visibility: the current ceiling is 300 full simulation steps in one frame.
5. Reduce per-frame allocations, including rebuilding enemy interpolation lookup maps. Profile state cloning before changing it; preserve immutable previous state and deterministic iteration.
6. Add a stable spatial index for targeting only if target scans dominate measured time. Consider workers or WebGL only after demonstrating a bottleneck they solve.

Split `App.tsx` by responsibility—run lifecycle/persistence, input, HUD, modal routing—and split overlays by screen as those features are touched. Keep engine commands as the only gameplay write path. Add integration tests at the seams that the existing tests missed: caches versus generated state, resume versus replay, engine respec versus UI, and scheduler time versus mute state.

Align the repository default branch with `main`; both refs currently point to the reviewed commit, but GitHub’s default is still `claude/rogue-lite-tower-defense-1mx7su`, while push CI and deployment target `main`. Refresh stale feature counts, outdated 2× overcharge descriptions, and progression status documents from current data.

## 9. Replayability and accessibility

Make a normalized Daily mode if the goal is comparable challenge results: fixed starting progression, unlocks, Crucible rank, biome, rules version, and scoring. The current Daily shares seed/map but uses each account’s own progression. Personal Daily progression can remain a separate mode. Start with shareable results and versioned replays; a competitive online leaderboard would also require server-side replay validation.

After replay persistence is fixed, add wave checkpoints, seeking, and a simple leak timeline. End-of-run feedback should identify what caused damage and which parts of the defense were ineffective, turning defeat into information for the next run.

Expand keyboard support from construction to the active layer: target cycling, selection, execute, collection, and beam control. Add remapping and toggle/hold options. Existing color assistance, reduced motion, narration, and touch loupe should be retained and verified against busy play, not only menus. Prioritize mobile target size and unobstructed battlefield space; a layout fitting the viewport does not prove that real-time actions are comfortably usable.

## 10. Delivery sequence

Effort is relative: S = localized change; M = several connected systems; L = substantial design/content iteration. These are not calendar promises.

| Milestone | Scope | Effort | Completion gate |
|---|---|---|---|
| 1. Trustworthy foundation | Terrain/decal identity, resumed replays, respec UI, scheduler recovery, planning pauses | M | Focused repros fixed; save/replay round trip and UI respec pass; existing gates remain green |
| 2. Readable opening | One biome/three-tower art pass, Spire identity, stable HUD, guided first two waves, input simplification prototype | L | New players can explain the route, tower roles, pickup rules, and their first leak; controls stay usable during combat |
| 3. Distinct builds | Early persistent choice, four supported build families, reward previews, Gold/Ash commitments | L | Several builds work across held-out seeds; players can describe how their choices changed their plan |
| 4. Memorable run | Wave-24 finale, act pacing prototype, authored map patterns, one optional objective | L | The final encounter is identifiable and fair; failed runs produce actionable lessons; run duration is measured |
| 5. Audio and device finish | Authored theme prototype, prioritized mix, browser profiling, targeted optimizations, mobile/accessibility pass | M–L | Long-session listening review, bounded audio work, agreed frame-time and input-latency targets |
| 6. Replay and mastery | Normalized Daily, replay seeking, richer run analysis, wider seed/endless balance testing | M | Challenges reproduce across accounts/versions; depth improves through choices as well as accumulated power |

Instrumentation starts with milestone 1 and follows every prototype. Audio design should begin alongside the visual slice; final mixing follows stabilized combat timing. Re-derive balance envelopes only for intentional balance changes and test candidate builds on seeds outside the tuning set. Treat cheap wins as findings to investigate: distinguish dominant exploits from rewarding specialist mastery.

**The first five reviewable changes I would queue:** (1) terrain/decal identity; (2) respec UI and persistence; (3) checkpoint-safe replay persistence and validation; (4) bounded music scheduling; (5) stable planning UI and collectible timers. Then build the polished opening slice before producing a large amount of new content.
