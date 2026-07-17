# Overnight iteration log

A living backlog + log for the autonomous improvement marathon — **50 cycles,
complete**. Each iteration: plan against the current codebase → implement →
verify (`npm run check`, e2e/goldens when touched) → commit → push. Themes
rotated across gameplay depth, game length/post-game, graphics, UX, and
mobile parity.

**Closing state:** 137 unit/harness tests + 18 Playwright specs, all green.
Two fuzzer-found exploit families killed and pinned as regressions (mid-wave
repair tanking; Bounty-Banner/Glass-Cannon economy). 7 towers, 23 relics,
13 enemy types, 6 maps, 4 trials, 6 cataclysms, 12 achievements, full
Spark → Ascension → Ember meta stack, PWA/mobile parity, accessibility pass.

## Backlog (revised every cycle)

- [x] 1. Carrier enemy: late-game spawner that births swarmlings while alive
- [x] 2. Wraith enemy: phases untargetable — punishes pure-DPS, rewards timing
- [x] 3. Two new maps (Serpent, Crossroads) + map name in HUD; recalibrate seeds
- [x] 4. Endless mutators: stacking wave modifiers past the victory wave (Cataclysms)
- [x] 5. Run summary analytics: damage by tower type, kills by enemy type
- [x] 6. Graphics: real projectiles (cannon shells, sniper tracers), muzzle flash
- [x] 7. Graphics: terrain texture, path styling, spire/gate glow-up
- [x] 8. UX: settings panel (volume, reduced motion) + shortcuts help overlay
- [x] 9. Mobile: PWA manifest + offline service worker + install icons
- [x] 10. Ascension: prestige layer resetting the Spire Tree for Embers (M6)
- [x] 11. Relic depth: rarity tiers, more relics, reroll option
- [x] 12. New tower type (7th): the Beacon support pylon
- [x] 13. Save export/import codes
- [x] 14. Achievements with spark rewards
- [x] 15. Wave preview enrichment: threat estimate, elite marks
- [x] 16. First-run tutorial hints
- [x] 17. Lifetime stats screen
- [x] 18. Boss variety: distinct boss per boss wave
- [x] 19. Deep fuzz run + rebalance pass (216-run hunt → mint economy trim)
- [x] 20. Death/hit particles, boss entrance, juice pass
- (re-planned continuously; larger themes split across cycles)

## Log

59. *(post-marathon, playtest)* **Hold-to-aim placement loupe** — on phones
    the board is CSS-downscaled to ~46% (a cell ≈ 16 screen px), so the
    finger hides the exact cell it's placing on. With a tower or ability
    armed, touching the board now starts an aim instead of placing: a
    magnified loupe floats ~104 screen px above the finger showing the
    placement ghost and a crosshair on the target cell, drag to fine-tune,
    release to place at the loupe's cell. The loupe flips below the finger
    near the top edge, sizes itself in screen pixels (finger-sized at any
    CSS scale), and pointercancel aborts cleanly. Touch-action locks to
    none only while armed so normal page scrolling is untouched; the
    click the browser fires after a tap-release is consumed exactly once
    with a deadline (a bare flag would swallow the next genuine tap after
    long drags, which fire no click). Quick taps still place instantly.
    E2e: a drag places at the RELEASE cell, nothing places mid-hold, and
    the armed canvas reports touch-action none. 27 e2e specs.

58. *(post-marathon, playtest)* **The Codex** — an in-game reference with
    three tabs: Enemies (stats, traits, unlock waves, color swatches),
    Towers (full tier tables + niche notes), and Mechanics (armor math,
    shields, elites, crits-vs-shields, repair caps, combat-only cooldowns,
    relic cadence, victory/endless). Everything renders from the same data
    objects the engine reads — the reference cannot drift from the sim.
    Three ways in: a 📖 HUD button, the C hotkey, and tapping any
    scouting-report chip, which opens the codex scrolled to and
    highlighting that enemy's entry. E2e covers all three paths plus a
    data-fidelity assertion (arrow tier-1 cost shown = data file); the
    viewport matrix now guards the 📖 button too. 26 e2e specs.

57. *(post-marathon, playtest)* **Sound 2.0** — every tower has its own
    voice now (arrow pluck, cannon kick-drum boom, frost shimmer, tesla
    crackle, sniper crack + whistle tail) instead of one shared blip, built
    from layered oscillators plus a shared white-noise buffer through
    resonant bandpass filters — still zero assets. Abilities got stingers
    (meteor whistle-down + impact, frost nova glassy bloom, gold rush coin
    arpeggio, bulwark gong) and cataclysm strikes a three-layer rumble. The
    whole mix routes through a DynamicsCompressor master bus so 10× speed
    ducks instead of clipping, combat percussion gets ±4% random pitch so
    rapid fire doesn't machine-gun one sample, and heavy sounds (cannon,
    sniper, boss, gong) repeat on slower per-kind cooldowns. Zombie-context
    revival, priming, mute, and volume scaling all preserved.

56. *(post-marathon, playtest)* **Wave preview fits phones** — the scouting
    report was one nowrap line that scrolled sideways on a 375px screen, so
    late-wave chips (elites, affix, threat) hung off the right edge. On
    phones (≤640px) the strip now wraps into two compact RESERVED rows
    (constant min-height, so the playfield still never shifts between
    waves); chips/labels drop to 10px. The first fix landed in the phone
    media block *above* the base rule and silently lost the cascade —
    moved below it. Verified at 375px on wave 9 (11 elites + boss chip):
    strip scrollWidth == clientWidth, document never pans. The viewport
    matrix now asserts the preview has no internal sideways scroll on
    sub-640px screens.

55. *(post-marathon, playtest)* **Condensed tower shop** — the horizontal
    scroll strip hid towers past the right edge and players forgot they
    existed. Cards are now compact two-line columns that split the row
    evenly, so all seven towers are always visible at every viewport. On
    phones: hotkey badges dropped (touch), the color dot is replaced by
    coloring the name itself, and ✈ becomes a corner badge — verified
    zero ellipsized names at 375px. The viewport matrix now also asserts
    the LAST shop card is on-screen and that no tower name ever clips.

54. *(post-marathon, playtest)* **Viewport matrix** — a portrait phone was
    getting a sideways-pannable page: the tower shop strip (1052px of
    cards, no wrap, no overflow constraint) widened the whole document to
    1060px on a 375px screen. Shop and ability strips now scroll within
    themselves; the phone header tightened from five loose rows (~220px)
    to four (~130px) via compact paddings and shrunken reserved widths.
    New standing guard: a six-viewport e2e matrix (375/390/412 phones,
    768×1024 + 1024×768 tablets, 1280×720 desktop) asserting zero
    horizontal overflow and every HUD control fully on-screen at build,
    with the tower panel open, and mid-wave. 25 e2e specs total.

53. *(post-marathon)* **Graphics 2.0** — the renderer's biggest jump since
    pixels landed, all Canvas 2D, all render-only. Stage 1: an additive glow
    engine (cached radial sprites, 'lighter' compositing) turns every
    luminous thing into a light source — portal, spire (its pool shrinks as
    it dies), tesla/frost/beacon idles, shells, tracers, bolts, flashes,
    bursts, meteor, nova, motes — plus a once-per-map baked terrain layer
    (speckle grain, per-theme props, rock shadows, top-light, vignette) and
    a brushed rounded road instead of checkerboard path cells. Stage 2:
    battle scars (a fading decal layer stamped by every kill), ground
    shadows + 220ms overshoot pop-in for spawns, color-tiered HP bars,
    tower recoil, tier studs/bright edges + enhance glow, shell smoke
    trails, and mood atmosphere (drifting fog banks, red edge-tension as
    the spire bleeds, violet cataclysm eras). Reduced motion gates the
    drift/pop/recoil. Screenshot-verified per stage; 140 unit + 19 e2e.

52. *(post-marathon, playtest)* **Cooldowns made real** — root cause of
    "cooldown reductions feel ignorable": abilities can't be CAST in the
    build phase, but their cooldowns RECOVERED there, so any unhurried
    player had everything ready every wave and CDR was a dead stat. Ability
    cooldowns now recover only while a wave is live (⏸ shown in build, one
    new unit test; goldens hash-only — bots never idled, outcomes byte-
    identical). Display: single-source-of-truth helpers for effective
    tower/ability cooldowns; tooltips show true fire rate (the old one
    ignored Quickdraw entirely), effective DPS, itemized fire-rate line,
    and ability buttons show remaining/max with reduction sources. Swift
    Sigils repriced 3/6 → 2/4 embers.

51. *(post-marathon, playtest)* **Armor** — playtest: "arrows still make it
    to wave 20 with very little trouble." Measurement agreed: arrow-only
    tracked the balanced comp wave-for-wave to ~21 and only then hit the
    shield cliff. New second defense stat: armor, flat per-hit reduction
    (min 1 lands) on brutes/healers/splitters/carriers/bosses, growing out
    of the HP curve's excess over baseline — zero in the opening (first
    tuning killed fresh runs at wave 5; the onset formula fixed it), ~1 by
    wave 8, a third of every arrow by the late teens while cannons/snipers
    barely notice. The balanced reference became phase-aware (chip-lean
    opening, cannon/sniper lean from wave 9) and keeps its ~20k win;
    arrows now fall behind from midgame and never win. ▣ marks in the
    scouting report and on enemies. Goldens re-pinned (balanced-fresh
    14→12); envelope re-derived (fresh→mid margin +5→+2); both fuzz pins
    green.

50. **The closer: deep fuzz → two relic exploits killed** — the final
    full-depth hunt (1600 runs, 4 seeds) found a mint-heavy economy comp
    winning at 5k/8k on beta/gamma. Ablation isolated TWO enablers: Bounty
    Banner (+1 gold on every kill — linear in the horde's body count, it
    out-earned mints) and Glass Cannon (−20% max HP never actually bound).
    Fixes: Bounty Banner pays on every second kill; Glass Cannon costs 40%
    max HP. Every 5k win is dead on all four seeds; one razor-thin 8k win
    on beta survives all reasonable relic tuning (it's build-order
    optimality, not a relic exploit) and is pinned as a containment
    regression — any 5k win or any 8k spread trips CI. Full sweep green:
    137 unit tests, 18 e2e specs, goldens re-pinned (one-wave-scale drift
    only). Fifty iterations, complete.

49. **Design contract refresh** — PLAN.md brought back in line with shipped
    reality: Trials and achievements join the meta loop, the repair-cast cap
    and its fuzzer origin enter the curve contract (career first win ~13),
    §5.5 documents the two-layer fuzzing story, and M6/M6.5 are marked
    shipped with the marathon's scope.

48. **Boss bar** — a marquee health bar across the top of the field while a
    boss walks: its name in caps, exact HP, framed and filled in the boss's
    own color (color-assist aware). No more squinting at a 3px strip over a
    crowd. Verified with a wave-10 screenshot.

47. **Gauntlet audit** — measured the new map against the rolled pool at
    0/3k/8k sparks: the 5-leg serpentine was a spark farm (fresh accounts
    +4–8 waves). Trimmed to 4 legs: parity at real budgets (+0–1 wave at
    3k/8k across three seeds), with only a gentler fresh-account on-ramp
    remaining — acceptable for an opt-in battlefield that careers and the
    envelope never roll.

46. **The Gauntlet** — a sixth map: a forced serpentine where the horde
    marches every switchback and each corridor is a kill box, dressed in
    forge-iron rust with spark motes. Picker-only via the new
    RANDOM_MAP_POOL boundary, so every existing seed→map roll (goldens,
    envelope, dailies) is provably untouched — unit-pinned.

45. **Per-map records** — every battlefield keeps its own best wave
    (settle-time, never regresses, zero-progress runs leave no entry;
    save-migrated). Shown inline in the Battlefield picker ("The Serpent —
    best 17") and as a row in Records.

44. **Docs + post-relic fuzz audit** — README rewritten for the game as it
    stands (7 towers, 23 relics, Trials, Cataclysms, meta stack, daily,
    deep links, fuzzer story). A fresh 216-run fuzz hunt against the new
    relic pool found NOTHING — zero breaking, zero warnings, best defeats
    at 21–23 waves across 5k/8k/14k budgets. The repair cap holds.

43. **Relic depth** — three new archetypes: Last Stand (rare: +30% damage
    while the Spire sits at half HP or less — shows as an "active" line in
    the damage breakdown), Shatter (rare: slowed enemies take +20%, making
    frost a real damage partner), Soul Harvest (legendary: every 100th kill
    knits +1 HP — sustain that scales with the horde). Pool is now 23.
    Goldens re-pinned: balanced-fresh 13→14 waves; envelope green.

42. **Deep links** — ?seed=&lt;x&gt; boots straight into that run (shareable
    challenges, one-click bug repros) and ?daily=1 into today's shared
    seed; meta carries over, the param strips itself so reloads resume
    normally. The PWA manifest gains a "Daily run" app shortcut. New e2e
    spec (18 total).

41. **Live run stats** — 📊 button / S key opens the run-over analytics
    mid-run: waves + kills, sparks banked if the run ended now, active
    trials, the HP timeline so far, and damage/kill share bars. Read-only
    view over live state; Escape closes; e2e-covered.

40. **Ember depth** — the ascension layer grows from 4 to 6 nodes: Molten
    Vaults (+15% gold/level ×3) and Swift Sigils (ability cooldowns −10%
    /level ×2, new mods.abilityCdPct honored at cast time, floor 1s).
    Save-migrated; goldens hash-only.

39. **Ambient atmosphere** — each battlefield breathes: 26 drifting motes
    in the map's own accent (Greenfield fireflies, Channels spray, Bulwark
    dust, Serpent windblown sand, Crossroads embers). Pure function of the
    animation clock — no state, no RNG, freezes on pause, drawn under
    towers, skipped under reduced motion.

38. **Test health + Tempered** — root-caused the flaky placement e2e: after
    one tower, gold reads '150' and `toContainText('50')` matched it early,
    racing the remaining clicks (commands apply on the session's next
    animation frame). Now polls tower count then asserts gold exactly —
    10/10 green. All canvas coordinates derive from the live bounding box
    (shared cellPoint/clickCell/tapCell helpers). Plus the Tempered
    achievement: win with a Trial active (+300✦).

37. **Trials** — opt-in run handicaps that pay bonus sparks: Glass Spire
    (half HP, +40%✦), Swift Horde (+15% speed, +25%✦), Iron Horde (+25% HP,
    +35%✦), Famine (−25% gold, +30%✦). Chosen next to the battlefield picker
    (persisted; dailies ignore both), worn as a HUD badge, previewed
    honestly in the scouting report, credited on the run-over screen.
    Goldens hash-only.

36. **Deep fuzz → repair economy fix** — a 1600-run hunt found a real break:
    all-offense accounts (Honed Arsenal first, zero spire HP) winning at 5k
    sparks by converting kill gold into unlimited mid-wave repairs. Ablation
    isolated the crutch (same build dies at wave 20 without mid-wave
    repairs; Honed cost nerfs failed AND bent the intended curve). Fix:
    repair crews cast once per live wave (build phase unlimited). The
    breaking family now loses at 5k/8k on every seed while every anchor
    holds exactly (60k 3/4 wins, 20k alpha victory, career-18 first win at
    13, career-6 winless). Exploit genome pinned as a regression test;
    goldens hash-only.

35. **Accessibility pass** — every icon-only control gains an accessible
    name (mute, speed group, daily, settings, auto-advance — with
    aria-pressed state where it's a toggle), the spire bar is a real
    progressbar, the canvas describes itself, and all five modals are
    proper aria-modal dialogs.

34. **Color assist** — a High-visibility colors setting swaps the enemy
    palette for an Okabe–Ito-derived colorblind-safe set (hues that separate
    under deuteranopia/protanopia, lightness steps for the rest). Live
    lookup, so toggling recolors the next frame; kill bursts and boss floats
    follow. Persisted and e2e-covered.

33. **Mobile feel** — haptic feedback (spire hits buzz short, defeats long,
    victories celebrate, cataclysms rumble; throttled, feature-checked,
    settable — default on, e2e-persisted), plus notch/home-bar safety:
    viewport-fit=cover with safe-area insets on the app frame and the
    bottom-sheet tower panel.

32. **HP timeline** — the engine samples spire HP at every wave clear
    (`hpByWave`, invariant-checked, save-migrated), and the run-over screen
    draws it as a sparkline: dips show exactly which waves drew blood, red
    line when the run ended below a third. Goldens re-pinned — hash-only
    diff, ticks/waves/kills/sparks all byte-identical.

31. **Map themes** — each battlefield now wears its own terrain palette
    (Greenfield moss, Channels cold slate, Bulwark grey masonry, Serpent
    desert sand, Crossroads ashen violet): background, checker, path, grid,
    and rocks all keyed by map name, presentation-only. Verified with
    headless screenshots of all five maps.

30. **Map select** — the run-over screen gains a Battlefield picker (🎲
    Random or any of the five maps, persisted). createRun takes an optional
    map override that swaps only the battlefield — the roll still burns, so
    every RNG stream is untouched (unit-proven). Daily runs ignore the
    preference: everyone shares the daily's rolled map.

29. **Shareable replays** — 🐞 Copy replay on the run-over screen exports
    seed + map + meta snapshot + the full command log as JSON (clipboard +
    visible textarea). Same seed, same commands, same run — every bug report
    and balance complaint is now reproducible. E2e drives the button and
    parses the payload.

28. **Relic pity** — from wave 15 on, an offer never rolls all commons while
    the pool still holds better: the last slot upgrades to a random rare+.
    Pity draws from the relics stream only when it fires, so pinned goldens
    were untouched. Deterministic seed-sweep test proves both the trigger
    and the guarantee.

27. **Endless clarity + rewards** — HUD chip counts down to the next
    Cataclysm ("in N waves", pulsing red when this wave lands it), driven by
    a pure engine helper that mirrors the strike schedule exactly. Two new
    endless achievements pay out at waves 30 (Beyond the Break, 250) and 40
    (Eye of the Storm, 400), giving the post-game its own goal ladder.

26. **Targeting depth** — two new tower targeting modes: *Weakest* (finish
    low-HP stragglers — pairs with splash chip damage) and *Elite Hunter*
    (prioritize elites/bosses over the horde, falling back to first-past when
    no elite is up). Full six-mode cycle in the popover + engine validation,
    unit-tested target selection for both.

25. **Perf** — towersFire candidate lists hoisted to once-per-tick (was two
    array allocations per tower per tick); range check inlined into
    selectTarget. Live-checks preserve exact mid-tick kill semantics —
    goldens pass byte-identical, proving the refactor pure.

24. **Daily run** — 📅 button starts today's shared seed (UTC-dated, Date
    strictly UI-side); best-of-today tracked locally and shown on the button.

23. **Bulwark** — 4th ability (Aegis Sigil unlock, 250 sparks): 5s of total
    spire invulnerability on a 40s cooldown, hotkey F. Golden shell renders
    while active; bots cast it under pressure; arrivals absorbed to 0.

22. **Hit feedback** — struck enemies flash white for 110ms (render-side hit
    map fed by tower_fired targets); shielded enemies wear a ⛨N label showing
    the block threshold, so bounced shots explain themselves.

21. **Auto-advance** — ▶▶ toggle (persisted) auto-sends the next wave after a
    1.2s beat, pausing itself whenever a relic offer, victory prompt, or
    run-over needs the player.

20. **Beacon** — 7th tower, first support archetype: a pylon that amplifies
    towers within its radius (+12/18/25% by tier, strongest-only, never
    stacking so beacon farms can't dominate). Signal Fires unlock node,
    hotkey 7, rotating-halo rendering, aura itemized in damage breakdowns,
    wired into bots + the fuzzer's genome space. Fuzz smoke clean.

19. **Juice** — kills burst into shards colored like the fallen (suppressed
    above 3×), bosses rise with a shockwave nova + name-drop float + ominous
    two-note sawtooth, wave starts announce themselves quietly.

18. **Achievements** — nine one-shot goals (waves 10/15/20, first victory,
    horde slayer, collector, stormrider, ascendant…) evaluated as pure
    predicates at settle; first run to earn one banks its spark bounty.
    Run-over shows medal chips; Records shows the full grid with locks.

16. **Fuzz + rebalance** — 216-run evolutionary hunt against the post-relic/
    wraith/carrier/boss game: no breaking builds (8k floor holds at 21 waves),
    but a mint-8 economy comp won repeatedly at 14k (30% under the intended
    threshold). Mint t3 yield 62→52 killed every warning on re-hunt; envelope
    and careers unaffected.

17. **First-run hints** — three contextual banners for brand-new accounts
    (build → send → economy), retired forever after the first run ends or on
    dismiss (persisted). E2e drives the whole arc.

15. **Boss roster** — waves 10/20/30 rotate Spirebreaker (tank), Gravemind
    (splits into Amalgams on death → cascading shards), Stormcaller (FLYING
    boss: ground-only comps have no answer). Deterministic rotation, honest
    unlock waves (a property test caught the 99 sentinel), shared boss
    rendering with per-boss palette.

14. **Records** — meta tracks bestWave, lifetimeKills, and the last 12 runs.
    Settings shows the records row + recent-run table (trophies for wins);
    the run-over screen stars a new personal best.

13. **Threat estimate** — the scouting report now shows the wave's exact
    total effective HP (mirrors spawn math through affixes and Juggernaut
    cataclysms; pinned by a test that spawns the wave and reconciles) and an
    elite count chip.

12. **Save transfer codes** — Settings gains Export (base64 of the save JSON,
    auto-copied) and Import (validated through the normal migrate() path,
    garbage rejected without damage). Fixed a real persistence gap found by
    the e2e: saves now also write on tower place/sell/upgrade, so closing the
    tab mid-build no longer loses placements.

11. **Wraith** — wave-12+ ghost cycling 2s corporeal / 1.5s phased. Towers
    cannot target it while phased (it keeps marching); Meteor and Frost Nova
    ignore the veil, giving abilities a unique job. Ghost rendering with
    wispy tail, 30% alpha while phased. Envelope + goldens recalibrated.

10. **Maps** — The Serpent (four alternating vertical walls force a long
    winding gauntlet) and Crossroads (central block + pylons split the horde
    into lanes) join the pool of five. Map name shown in the HUD. New
    connectivity test pins every map reachable. Seed→map assignments
    reshuffled; envelope + goldens + all 13 e2e recalibrated and green.

9. **Board glow-up** — checkered ground tint, faceted rocks with deterministic
   per-cell variation and lit facets, path chevrons drifting toward the spire,
   swirling counter-rotating spawn portal, breathing crystal spire with inner
   facet and an orbiting guardian mote while healthy. Render-only.

8. **Relic depth** — rarity tiers (common 60 / rare 32 / legendary 8 weighted
   draws), six new relics incl. two new mechanical axes (Quickdraw attack
   speed, Longsight range) plus Field Medicine, Deep Pockets, Echo Chamber,
   Colossus. One paid reroll per offer (costs the skip gold). Rarity-styled
   cards. Envelope held unchanged with bots drafting the new pool.

7. **Ascension (M6)** — victories bank cycleVictories; Ascend burns the Spire
   Tree + sparks + unlocks for Embers (1 + 1/victory). Ember Tree (Kindled
   Arsenal +10% dmg, Eternal Core +2 HP, Ember Memory +25% sparks, Ashen
   Legacy 300 sparks/cycle) persists forever and compounds with the spark
   tree. HUD ember counter, ascension panel in tree modal + run-over, save
   backfill, full unit coverage.

6. **PWA** — web app manifest (standalone, dark theme, 192/512 icons from the
   logo), offline service worker (network-first navigations so new builds
   land, cache-first for fingerprinted assets), registered in prod builds
   only. E2e verifies manifest/icons/sw are served and coherent.

5. **Settings & shortcuts** — ⚙/? opens a modal with an SFX volume slider,
   a reduced-motion toggle (kills screen shake + full-screen flashes), and
   the complete keyboard reference. Persisted separately from the save so a
   progress wipe never wipes accessibility choices. Escape now always works,
   even from inside form controls. E2e proves persistence across reloads.

4. **Projectiles** — cannon shells lob along an arc and the splash lands on
   impact (future-scheduled effects), sniper tracers with a leading slug,
   arrow darts, jagged flickering tesla arcs, muzzle flashes on every shot.
   Render-only.

3. **Run analytics** — run-lifetime damageByTower / killsByEnemy tallies in
   RunState (survive tower sales), carried into RunSummary, rendered as share
   bars on the run-over screen. Invariant: killsByEnemy sums exactly to kills.

2. **Endless Cataclysms** — clearing waves 24, 29, 34… permanently stacks a
   seeded modifier (Surge +20% speed, Juggernaut +30% HP, Endless Swarm +25%
   budget, Dampening −10% tower damage, Crumbling −2 max HP, Ironclad +50%
   shields). Struck at wave CLEAR so the build phase and scouting report see
   the new world. HUD badges with ×n stacking, strike flash + float, damage
   breakdown shows Dampening as a negative part, tower output floored at 10%
   of base. Endless is a gauntlet now, not a flat grind.

1. **Carrier (Broodmother)** — wave-18+ elite spawner hatching bounty-less
   swarmlings every ~4.7s. Fallout fixed along the way: (a) engine bug —
   enemies hatched/split ON the spire cell stood there forever, stalling the
   wave (now standing on the spire = arrival); (b) crits no longer punch
   through shields (shields judge pre-crit damage) — this was quietly powering
   arrow-only wins; (c) shield scaling moved to half the HP curve's rate (full
   rate walled out cannons at a sharp cliff ~wave 23); (d) weighted wave
   composition support added to the generator; (e) crit demoted in the default
   meta buy priority. Curve re-verified: career first win run 16, 20k wins
   3/4, arrow-only loses 4/4.
