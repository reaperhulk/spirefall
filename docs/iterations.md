# Overnight iteration log

A living backlog + log for the autonomous improvement marathon (50 cycles).
Each iteration: plan against the current codebase → implement → verify
(`npm run check`, e2e/goldens when touched) → commit → push. Themes rotate
across gameplay depth, game length/post-game, graphics, UX, and mobile parity.

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
