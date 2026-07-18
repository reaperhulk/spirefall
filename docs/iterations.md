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

> **Marathon II backlog** (re-derived at iteration 10; revised every
> iteration): fuzz sweeps on non-verdant biomes (the evolutionary search
> only ever plays verdant — feature-biome exploits are unsearched);
> music phrase pools (two progressions per biome, ~90s form); phasing
> tell in the wave preview (wraiths/Veilwarden punish burst comps
> unannounced); save-code compression via CompressionStream (shorter
> codes, enables replay URLs); debug spawn hook + true horde perf
> measurement; 320px small-phone audit; beacon/mint identity polish;
> App.tsx/styles.css size check & split.
> Completed 1–10: shareable replays, boss-mech preview warnings,
> endless bosses ×2, relic codex, career sparkline, No Mercy trial,
> Shielded affix (+ dilution lesson + mortar trim), named Crucible
> tiers, 4 new achievements, render-perf measurement.

101. *(marathon II, iteration 13)* **Compressed transfer codes** — save
    codes were raw base64 JSON; v2 codes gzip through CompressionStream
    first (prefix "SF2:", ~4× shorter — friendlier to paste anywhere)
    with the legacy raw format still importable forever and a
    no-CompressionStream fallback for older browsers. Export/import
    went async; the settings UI awaits them. The transfer e2e passes on
    the new format unchanged. 191 unit tests, 34 e2e specs.

100. *(marathon II, iteration 12)* **Phasing tell in the scouting
    report** — wraiths and Veilwarden flicker untargetable, punishing
    burst comps, and the preview never warned. Phasing types now wear a
    ◌ mark with the hidden-window duration (from live data) and the
    counter ("sustained fire beats burst") — completing the preview's
    threat vocabulary: ✈ air, ▣ armor, 🛡/🌀 boss mechs, ◌ phase. E2e
    extends the boss-preview spec to wave 39/Veilwarden. 191 unit
    tests, 34 e2e specs.

99. *(marathon II, iteration 11)* **Biome fuzzing finds the maze farm;
    geometry kills it; a counter-experiment fails honestly** — fuzzBuilds
    gained a `biome` option (FUZZ_BIOME env) because the evolutionary
    search had only ever played verdant. The FIRST emberwaste hunt (60
    runs) found a breaking 8k victory: a mazeLengthen sniper/arrow comp
    stretching the natural 26-cell walk to 54 on the old "sparse cover"
    open field. Ablations: pathAdjacent-on-ember loses, maze-on-verdant
    loses, vents ZEROED still wins — pure geometry, vents innocent (an
    early vent-damage haircut was reverted as unjustified). Fix that
    held: slag heaps — emberwaste rockClusters [1,3] → [4,7] breaks long
    serpentines (same build now caps ~34 path; defeat @ 23/22), identity
    reworded "the land fights, and it will not be walled". EXPERIMENT
    THAT FAILED: a maze→flier wave bias ("the sky answers the maze") —
    reverted after it backfired twice: incidental path-adjacent stretch
    (~148%) reshuffled every baseline, and worse, air-heavy waves are a
    GIFT to anti-air comps — two old pinned genomes started WINNING at
    5k on gamma because the "punishment" fed them budget-inefficient
    fliers. Lesson logged: a counter-mechanic must be a threat to the
    comp it counters, not a comp-shift. EMBER_MAZE pinned as the fourth
    regression genome (defeat on ember alpha+gamma @ 8k). Goldens
    untouched. 191 unit tests, 34 e2e specs.

98. *(marathon II, iteration 10)* **Render-perf measurement pass** —
    frame-time probes in headless Chromium at deviceScaleFactor 2:
    steady state and a REAL mid-game combat scene (wave 9, 14 towers
    firing with projectiles + live music, rich-meta pilot) both hold
    60fps — p50 16.7ms (vsync-locked), p95 17.9ms, p99 23.5ms; no
    missed-frame pattern anywhere measured. Honest gap: a true
    60+-enemy horde scene couldn't be staged through supported commands
    (wave-state surgery produces empty/refused waves; a strong pilot
    melts the field) — if that scene ever needs measuring, add a
    debug-only harness spawn hook first. No code change; measurement
    only. 190 unit tests, 34 e2e specs.

97. *(marathon II, iteration 9)* **Achievements catch up with the
    game** — the 17-achievement list predated specs, trials, and the
    Crucible. Four new one-shots: COMMITTED (three specialized towers
    in one run, 150✦), UNBROKEN (win under No Mercy, 400✦),
    THRICE-FORGED (win at Crucible rank 3+, 350✦), NOT ONE STONE (win
    with the Spire untouched, 300✦) — each rewarding mastery of a
    shipped system, surfaced through the existing run-over unlock chips
    and codex-free settle path. Predicate tests pin all four earn/
    don't-earn boundaries. 190 unit tests, 34 e2e specs.

96. *(marathon II, iteration 8)* **Named Crucible tiers** — repeat
    victories used to change one number (+10% HP/rank); now rank
    milestones change the horde's TEXTURE, cumulatively: rank 2
    SEETHING (+5% speed), rank 4 IRONBOUND (+1 armor on every enemy),
    rank 6 UNRELENTING (+5% speed again). Data-driven
    (CRUCIBLE_TIERS + crucibleTiersAt), applied in the spawn pipeline;
    the HUD badge names the highest tier and its tooltip itemizes all
    active ones, and the next-run summary on the run-over screen spells
    out what the horde will bring. Goldens untouched — tiers begin at
    rank 2, which no golden run reaches. Engine test pins the speed and
    armor math at ranks 0/2/4 and the tier table itself. 189 unit
    tests, 34 e2e specs.

95. *(marathon II, iteration 7)* **Shielded affix — and the dilution
    lesson** — new wave affix: every enemy raises a small flat shield
    (AFFIX_SHIELD_BONUS 4; sniper-pierceable, heavy-shot-breakable —
    the composition check spread across a whole wave). The interesting
    part was what it broke: adding a 5th affix at the old 35% roll
    chance DILUTED armored/frenzied draws (8.75% → 7% of waves each),
    waves got net easier, and the pinned Mortar-Blizzard genome
    resurrected its 8k win on gamma. Fixes: AFFIX_CHANCE_PCT 35 → 44
    (restores each affix's per-wave rate: new affixes must ADD threat,
    not discount existing threat) and MORTAR_DAMAGE_PCT 125 → 120 (the
    reshuffled world still handed the comp a legitimate 24-wave clear;
    one more click on the original lever kills it). All three pins
    green again. Goldens regenerated: balanced-fresh 10 → 9 waves
    (affix density restored + the new affix), balanced-rich unchanged
    at 13; envelope re-derived green. Engine test pins the flat shield
    on every spawn under the affix. 188 unit tests, 34 e2e specs.

94. *(marathon II, iteration 6)* **No Mercy trial** — a fifth opt-in
    handicap for the players who treat the repair button as a crutch:
    the Spire cannot be repaired at all (the command bounces with the
    trial's reason) and the wave-clear knit never fires — what breaks
    stays broken. +45% sparks, the richest trial bonus, because every
    point of damage is now permanent. Pure data + two engine guards;
    the trial picker, run-over summary, and preview pick it up from
    TRIALS automatically. Engine test pins both the rejected repair
    (gold untouched) and the silent knit. 187 unit tests, 34 e2e specs.

93. *(marathon II, iteration 5)* **Career sparkline** — meta.history
    powered only an 8-row table; the actual shape of a player's career
    (am I getting deeper?) was invisible. Settings now leads its Run
    history section with a bar sparkline of the last 20 runs,
    chronological, height = waves cleared, victories in gold — the
    climb IS the progression, and a plateau is a prompt to change
    strategy. Renders only once there are 2+ runs. E2e extends the
    give-up spec: after a second finished run the spark shows exactly
    two bars. 186 unit tests, 34 e2e specs.

92. *(marathon II, iteration 4)* **Relic codex** — 30 relics existed
    nowhere outside the ten-second draft moment; planning a build around
    Cinder Shells or Golden Ledger meant memorizing offers. The codex
    gains a RELICS tab: all relics grouped by rarity band (legendary/
    rare/common, color-coded), alphabetical within band, each with its
    live description — and relics held THIS run wear a ✦ mark and a
    gold edge, so mid-run the tab doubles as "what am I building
    around". Draft cadence explained up top from the live constants.
    E2e asserts the tab renders relic entries with real data. 186 unit
    tests, 34 e2e specs.

91. *(marathon II, iteration 3)* **Endless-tier bosses: Veilwarden and
    Blightmother** — the 3-boss roster meant endless runs met a repeat
    by wave 40. Two new bosses extend the cycle to 5, both PURE DATA on
    machinery the engine already had: Veilwarden (wave 40) rides the
    wraith phasing config — a tanky armored boss that flickers
    untargetable for 50-tick windows, punishing burst-only comps;
    Blightmother (wave 50) rides the healer pulse — a slow shielded
    mass that mends the whole horde around her (amount scales on the hp
    curve), turning her escort into a race. Distinct colors (plus
    Okabe–Ito assist entries) and sizes; the codex, preview chips, and
    boss music pick them up automatically. The core 24-wave run never
    sees them, so goldens and the balance envelope are untouched —
    pinned by the roster-cycle test (10→boss … 40→boss4, 50→boss5,
    60→around again) plus machinery tests through the real engine
    paths. 186 unit tests, 34 e2e specs.

90. *(marathon II, iteration 2)* **The scouting report warns about boss
    mechanics** — the wave preview listed the boss as just another unit;
    the carapace/gale surprise landed mid-fight. Boss chips now carry a
    mech mark (🛡 carapace / 🌀 gale) whose tooltip explains the counter
    ("every hit capped at 1 unless a single hit deals 40+ — bring heavy
    shots" / "hastes the horde — any slow cancels it; bring frost"), the
    numbers sourced from the live constants. Also fixed: the preview's
    boss-first sort and highlight only matched the FIRST boss ('boss'),
    so Gravemind and Stormcaller sorted as commons — now any boss type.
    E2e pins the wave-9 preview showing the carapace warning. 183 unit
    tests, 34 e2e specs.

89. *(marathon II, iteration 1)* **Shareable replays** — the replay
    export is now v2: it embeds the run's tick-0 RunState alongside the
    command log, so ANY account can reconstruct the exact run without
    sharing meta state. Settings gains a "Shared replay" section: paste
    any copied replay JSON → ▶ Watch — a spectator session that never
    touches the local meta or save; exit returns to whatever the player
    was doing, mid-run included (the live session freezes while parked).
    Malformed pastes fail softly with a hint. E2e extends the replay
    spec: copy a defeated run's v2 JSON, start a fresh run, import,
    watch to completion — identical wave/kills/spire-HP triple — then
    exit back to the untouched fresh run. 183 unit tests, 33 e2e specs.

88. *(program 3/4)* **Watchable replays** — the deterministic engine
    makes this nearly free, so now it's a feature: every session pins
    its tick-0 state, and `replaySession()` spawns a spectator session
    that feeds the recorded command log back at the exact ticks it was
    logged. "▶ Watch replay" on the run-over Result tab swaps the ended
    session for the spectator (parked and restored on exit); a fixed
    banner marks the mode; player dispatches are ignored ("history
    cannot be changed") and App suppresses meta settlement, victory
    prompts, and saves for replaying sessions — the run already
    happened. Speed controls still work for scrubbing. E2e proves the
    contract: a real defeated run, replayed to completion, lands on the
    IDENTICAL wave/kills/spire-HP triple, spectator inputs no-op, and
    exit restores the run-over screen. 183 unit tests, 33 e2e specs.

87. *(program 2/4)* **Run-over screen: three tabs instead of one long
    scroll** — the loop's most-visited screen had accreted run stats,
    the share card, three share/replay buttons, the entire Spire Tree,
    the Ascension panel, and the next-run pickers into a single phone
    scroll with "Begin next run" at the very bottom. Now: RESULT
    (default — summary, trials, unlocks, sparkline, analytics, card,
    share/replay), SPIRE TREE (spark balance in the tab label, ascend
    callout, tree, ascension panel), NEXT RUN (biome, trial, crucible
    badge, launch — everything above the fold at 375px). Header + spark
    summary stay visible on every tab. E2e flows updated to click
    through tabs; screenshots verified both tabs fit a phone screen.
    183 unit tests, 32 e2e specs.

86. *(program 1/4 + 4/4)* **Victory hunt clean; victory + Crucible get
    their sounds** — HUNT: 768 runs (pop 16 × 4 gens × seeds α–δ) at
    8k/14k/20k over the full breadth space. ZERO breaking finds; no
    fuzzer victory even at 20k (the win stays skill-shaped); one +7
    overperformance warning at 8k/delta — an economy-snowball cousin of
    the pinned Bounty genome (mint-7, golden_ledger/bounty_banner,
    longbow+breaker specs) that reached 23 waves WITHOUT winning:
    that's the envelope working (strong play beats the reference), not
    a break — no tuning. Placement axes confirmed active in the niche
    logs (25 archetypes at 20k). MUSIC: victory is now a structural
    gesture — the filter throws wide open, the pad swells and holds a
    bright tonic, a six-note ascent climbs the chord, then easy high
    sparkles; defeat's mirror, resolution as texture. And a run that
    starts at Crucible rank N announces it: N dark pulses (capped 4) on
    the flattened second — the same darkness the boss vamp leans on —
    each under a heartbeat kick. 183 unit tests, 32 e2e specs.

84. *(playtest feedback)* **Boss music is structural, defeat is a
    collapse** — the boss entrance read as a NOISE on top of an
    unchanged score (additive kick+drone over the same progression,
    register, and groove), and defeat only eased an intensity variable
    (the pad hummed on as if nothing happened). Both rebuilt as
    structural changes to what gets scheduled: BOSS — entrance triggers
    a one-bar DROPOUT (bass/hats/melody silenced, heartbeat kick under
    a ducked pad), the pad drops an OCTAVE and stays there, and while
    the boss lives the harmony abandons the 8-chord progression for a
    two-chord half-bar VAMP (different harmonic material, not a faster
    cycle). DEFEAT — on run_ended the pad sinks an octave in a slow
    power-down glide, the filter closes to 160Hz, the groove stops
    being scheduled entirely, and a dry low bell tolls every other bar;
    the silence between tolls is the defeat. Verified in a REAL
    playthrough (rich-meta pilot driven through the harness, analyser
    tap, SFX muted): boss vamp low-register median 97Hz vs 221Hz
    pre-boss (octave+ shift), entrance dropout dips to 32% of combat
    RMS, post-defeat median RMS 20% of combat. 183 unit tests, 32 e2e
    specs.

83. *(fuzzer breadth program)* **The search space now covers the spatial
    game** — audit verdict on "does the fuzzer try mazes / single-tower
    maxing / meta dumps?": meta dumps yes, tower-maxing partial, mazes
    not at all (every bot shared one hardcoded path-adjacent placement).
    Shipped four new genome axes, all OPTIONAL fields defaulting to
    pre-axis semantics so the three pinned genomes reproduce exactly:
    (1) `placement` — five deterministic spatial doctrines in
    `placement.ts`: pathAdjacent (legacy), mazeLengthen (greedy
    path-length maximization via hypothetical distanceField), 
    killboxCluster (max path cells in reach), mesaFirst (highlands high
    ground), spireChoke (stack the last line); (2) `specByType` — 
    per-type tier-3 paths (32 combos, was 2); (3) `enhanceFocus` — 
    'focus' feeds the SAME tower forever (true single-tower maxing,
    inexpressible before because 'cheapest' round-robins); (4)
    `targetingByType` — per-type fire doctrine (set_targeting existed,
    no bot ever used it). Search side: fuzzBuilds keeps a MAP-elites-lite
    ARCHIVE (best genome per placement×dominantTower×focus archetype,
    persisted across generations) and breeds mutants from every niche
    elite instead of the global top third — plus nichesByBudget in the
    result so breadth is measured, not assumed. Mutation gained 4 slots;
    a test pins that every axis is mutation-reachable. 8 new tests
    (placement legality/determinism, maze-lengthens-the-walk, mesa
    claim, choke distance, per-type spec, focus-vs-spread, targeting
    once-then-quiet, axis reachability). 183 unit tests green with
    goldens and pinned genomes untouched. First deep hunt over the new
    space (288 runs, budgets 0/5k/8k, pop 12 × 4 gens): NO breaking or
    warning finds — best 21 waves @ 8k against a 24-wave win — with
    21–24 archetypes visited per budget incl. the mazing niches, so the
    curve currently holds against the spatial game too.

82. *(playtest feedback)* **Score reactions land before the enemy dies** —
    the #81 reactions were lagging indicators: boss double-time waited
    for the next bar boundary (up to ~2.7s, longer than many bosses
    live) and kill heat needed a long streak to register. Reactions now
    fire on ARRIVAL and DEATH: a boss's entrance slams the chord on the
    very next step (~0.3s) with a heartbeat kick, a long dark root drone,
    and the pad filter snapping shut before creeping back open; a boss
    going DOWN triggers the triumphant cadence run immediately; a wave
    starting plays a two-note rising call as the horde arrives (the
    score reacts to enemies appearing, not only dying). Kill heat is
    punchier and stickier: cap 16, slower decay, bigger melody-gate
    bonus, and it now drives the groove directly — hats join when kills
    stream (heat>5), the bass shifts to eighth-note pulses on a hot
    streak (heat>7), and the melody reaches a chord tone higher
    (heat>8). 175 unit tests, 32 e2e specs.

81. *(the coupling runs both ways)* **Combat plays the score** — the
    reverse direction of #79: Music.handleEvents rides the same GameEvent
    stream as the SFX. Kill momentum (a decaying heat counter) audibly
    thickens the melody line during a hot streak; a living boss DOUBLES
    the harmonic rhythm — same progression, chords turning over every
    half bar, urgency without touching tempo; a cleared wave answers
    with a descending chord-tone cadence run (echoed, resolving onto the
    root) that owns the melody for four steps; an enemy reaching the
    Spire makes the pad flinch — an immediate duck recovering over a
    second, re-owned by the next bar boundary so there's no scheduling
    fight. With tonal SFX quantized to the live key (#79) and the score
    now listening back, combat and music are one instrument played from
    both ends. 175 unit tests, 32 e2e specs.

80. *(playtest feedback)* **Audio liveness is probed, never assumed** —
    the sound button claimed 🔊 from load, but browsers gate audio behind
    a user gesture (and disagree about which events count, whether
    resume()'s promise ever settles, and whether a 'running' context is
    actually rendering). Sfx now keeps a PROBED `live` flag: true only
    after a probe observes ctx.state === 'running' AND currentTime
    advancing 200ms later — the only browser-agnostic ground truth — and
    it drops on statechange if the context dies later. The button has
    three honest states: 🔇 muted, 🔈 pending (gently pulsing; title
    explains sound starts on first tap), 🔊 live. Clicking the pending
    button means "I want sound" — the click itself unlocks, and it does
    NOT flip to mute; pressing M always mutes (someone racing to silence
    the page must win). React side uses useSyncExternalStore over an
    Sfx subscription. `__harness.audioLive()` exposes the probe; e2e
    covers pending-on-load → live-after-gesture → mute, and the mobile
    unlock test now asserts probed liveness, not just claimed state.
    175 unit tests, 32 e2e specs.

79. *(playtest feedback)* **SFX ring in the score's key** — the sound
    effects and the music lived in unrelated tonal worlds. Now the score
    publishes its live tonality (scale + the chord sounding right now, as
    pitch classes — `src/ui/tonality.ts`) and every TONAL sfx voice
    (pluck/fm/oscillator) snaps to it at play time: musical stingers
    (kill, wave cleared, relic, victory, place, gold rush, bulwark) land
    on CHORD tones, rapid combat ticks on the wider scale, noise
    percussion stays free (no pitch to clash). Design pitches keep their
    register — the snap never moves a note more than a tritone. Pitch
    jitter is skipped for quantized voices (detuning a snapped note
    defeats the point). Found and fixed along the way: the Karplus-Strong
    pluck rang ~45 cents FLAT of its commanded pitch (the in-loop damping
    filter's group delay lengthens the string) — inaudible with arbitrary
    pitches, a real clash against a quantized score; the delay line now
    subtracts 1/(2π·fc). Verified end-to-end by hooking createDelay in
    headless Chromium: a placed tower's pluck was commanded at exactly
    196.00 Hz (G3, 0.0 cents off), a chord tone of the run's key. The
    quantizer is a pure module with 5 unit tests. 175 unit tests, 31
    e2e specs.

78. *(playtest feedback)* **Longer musical form** — the 4-bar progression
    (~11s) announced its loop too fast. Progressions doubled to 8 bars as
    two real phrases (a wandering antecedent, a cadencing consequent), and
    every other pass through the progression is a LIFT: the melody reaches
    one chord tone higher and drops fewer pattern hits, the pad plays
    louder/brighter, and the bass answers with the fifth regardless of
    intensity — so the audible form is 16 bars (~44s), and the last bar of
    every pass fills in its back half as a cadence hand-off. The 6-mask
    rhythm rotation interleaves against the 8-bar harmony (LCM 24 bars),
    so literal repetition only lines up every ~2 minutes. Verified with
    the analyser tap: the per-bar low-register peak traces an exact 8-bar
    root sequence (231→350→231→275→312→312→350→231, repeating), no
    console errors over 50s of play. 170 unit tests, 31 e2e specs.

77. *(playtest feedback)* **The score is music now, not a drone** — the old
    generative music held one root+fifth pad chord forever; everything
    melodic hid behind intensity gates and low random densities, so calm
    play was literally a sustained filtered sawtooth (measured: ONE
    spectral peak, ZERO peak transitions in 11s). Rebuilt around harmonic
    motion: each biome owns a chord PROGRESSION (verdant I–V–vi–ii,
    frostfen unresolved minor drift, emberwaste leaning on the phrygian
    b2, highlands I–vi–IV–V) advancing every bar; the pad voices glide
    between chords, swell on the downbeat and relax through the bar, and
    the filter blooms per change; a triangle bass walks the chord roots
    (audible on phone speakers, unlike a sine sub); the melody plays
    seeded one-bar rhythm patterns — chord tones on strong beats, scale
    walks between — through a tempo-synced dotted-eighth feedback echo.
    Intensity still breathes the whole thing wider in combat. Verified by
    tapping the audio graph with an AnalyserNode in headless Chromium:
    old = 1 peak / 0 transitions, new = 6 peaks / 16 transitions with
    clear onsets. Fallout: a signed-shift rhythm salt went negative for
    half of all seeds and crashed the scheduler every step — caught by
    the e2e console-error nets, fixed with an unsigned shift. 170 unit
    tests, 31 e2e specs.

76. *(mobile playtest fix)* **Silent phones: audio never unlocked on touch** —
    the autoplay-unlock listeners were `pointerdown` + `keydown`, but a
    TOUCH pointerdown does not grant user activation (only mouse pointerdown
    does; touch grants on pointerup/touchend/click). So on phones the
    AudioContext was created unauthorized, sat `suspended`, and every
    resume — including the scrap-and-rebuild fallback — was equally
    unauthorized, forever. Desktop mice masked the bug completely. The
    revive listener set now covers pointerdown/pointerup/touchend/click/
    keydown, so the first real tap authorizes the context. Second iOS
    killer fixed in the same pass: Safari mutes Web Audio while the ringer
    switch is on silent unless the page declares a `playback` audio
    session (16.4+) — set best-effort at Sfx construction; the in-app mute
    button still rules. `__harness.audioState()` now exposes the context
    state for on-device debugging, and a mobile e2e pins that a touch tap
    drives it to `running`. 170 unit tests, 31 e2e specs.

75. *(mobile playtest fixes)* **Long-press selection + run-over overflow** —
    two phone bugs from live play: (1) holding to aim a tower placement
    started a browser TEXT SELECTION when the finger didn't move — the app
    shell now sets `user-select: none` (inputs/textareas opt back in so
    replay JSON and transfer codes stay copyable), the playfield disables
    the iOS long-press callout, and the canvas swallows `contextmenu` (the
    Android long-press route into selection). (2) The run-over modal
    scrolled HORIZONTALLY on phones: the trial `<select>`'s intrinsic
    width — driven by long option labels like "Iron Horde (+35% ✦) — …" —
    forced the modal wide; `.map-pick` and its select now clamp to
    `max-width: 100%` / `min-width: 0`, so the closed control shrinks to
    fit while the native dropdown still shows full option text. New e2e
    (mobile 375×667): abandon a run, assert the modal has zero internal
    horizontal scroll and the trial select sits fully on-screen. 170 unit
    tests, 30 e2e specs.

74. *(burn-down sprint)* **Polish + debt burn-down** — five tasks, one
    pass: (1) PANEL TRUTHFULNESS — damageBreakdown ignored the tier-3
    multipliers, so a Mortar cannon's panel showed base numbers; the
    breakdown now carries a multiplicative specPct mirroring towersFire's
    exact order (pinned: the panel's number IS the shot's number), the
    panel itemizes the path line and shows Capacitor's ×1.5 sustained
    DPS. (2) STATUS TELLS — burning enemies flicker with an ember lick,
    Permafrost-brittle bodies craze with pale ice lines, gale-hastened
    enemies trail amber speed streaks (slows keep their blue ring; the
    ring now correctly excludes haste), and Frostfen pools got a contrast
    boost. (3) SPEC IDENTITY — committed towers wear a gold diamond badge
    on the plate crown, so the tier-3 choice reads on the field. (4) E2e
    covers music-volume persistence. (5) DOCS DEBT — PLAN.md gains a
    kept-current shipped-systems index (biomes/specs/relics/bosses/
    crucible/codex/music/cards + the three pinned exploit genomes) and a
    corrected repo layout; CLAUDE.md now warns getRunMap-not-getMap and
    describes the biome-era data layer. 170 unit tests, 29 e2e specs.

73. *(five-item program, 5/5)* **Tier-3 specializations** — at tier 3,
    every combat tower commits to one of two paths (a one-time purchase;
    Mint/Beacon keep their economy identity): Arrow → Volley (2 extra
    targets at 60%) or Longbow (+30% range, pierces shields); Cannon →
    Mortar (+60% splash, +25% dmg, 60% slower) or Breaker (no splash,
    +80% single-target); Frost → Blizzard (slow splashes 0.9 cells at
    HALF duration) or Permafrost (its slow makes victims BRITTLE: +25%
    damage from ALL sources); Tesla → Arc Lattice (+3 chain) or Capacitor
    (every 4th shot ×3); Sniper → Executor (execute <10%) or
    Overpenetration (slug carries into one more enemy at full weight).
    Panel offers both paths at tier 3 with a commitment chime + float;
    codex lists them per tower; reference bot buys its preferred path and
    the fuzz genome LEARNS the choice (specChoice gene). The fuzzer
    immediately earned its keep: a cannon-8/frost-7 Mortar+Blizzard comp
    perma-slowed the field into an 8k win — killed by the blizzard
    splash-duration haircut (50%) + mortar trim (140→125), and pinned as
    the third permanent regression genome. Also fixed en route: the
    invariant checker still validated towers against the FIXED map
    registry (latent since the biome pivot — caught by the hostile
    property test rolling a cell that is rock on old map 0). Goldens:
    hash-only. 169 unit tests, 29 e2e specs.

72. *(five-item program, 4/5)* **Endless milestones + shareable run cards**
    — the long tail gets goals and the game gets its only backend-less
    social loop. Four achievements: Into the Dark / Storm-Sworn /
    World-Ender (1/3/6 stacked Cataclysms, 150/300/600 ✦) and Worldwalker
    (win in every biome, 500 ✦ — counts the settling run's own biome). A
    live "★ new depth" HUD badge appears whenever the current run passes
    the biome's standing record. The run-over screen now leads with a
    canvas-rendered RUN CARD (biome, outcome, waves/kills/sparks/crucible,
    damage-profile bars, seed) — copy it as a PNG to the clipboard, or
    copy a challenge line ("Wave 31 in Frostfen — beat it: <?seed= link>")
    that drops anyone onto the exact same battlefield. RunSummary carries
    seed/biome/crucible for the card. E2e drives both share buttons;
    milestone predicates unit-tested. 162 unit tests, 28 e2e specs.

71. *(five-item program, 3/5)* **Generative score** — the game has music
    now, zero assets, same philosophy as the SFX stack. Three layers over
    a 200ms-lookahead scheduler: a two-voice detuned saw drone through a
    slow lowpass, a sparse modal arpeggio, and a bass+hat+kick pulse that
    only wakes as the fight heats up. INTENSITY derives from the live
    battlefield (phase, horde size, boss presence, spire health) and is
    eased, so the score swells into a wave and exhales when it clears;
    bosses add a heartbeat kick. Each biome owns a mode and register
    (verdant major-pentatonic, frostfen airy minor, emberwaste phrygian
    low, highlands mixolydian) and the run seed transposes the key — no
    two runs share a root, one run stays consistent. Rides the Sfx
    AudioContext so autoplay-unlock/zombie-revival stay in one place. New
    music-volume slider in settings (persisted; default 60%), mute button
    silences it with everything else. UI-layer only — the sim never sees
    any of it.

70. *(five-item program, 2/5)* **Boss encounters** — every 10th wave is an
    encounter with counterplay, not a stat check. Spirebreaker: Carapace —
    every 8s a 2s shell caps all hits at 1 damage, but a single heavy blow
    (40+) shatters it instantly and lands full (cannons/snipers answer;
    chip waits). Gravemind: births 2 bounty-less splitlings every 6s while
    alive (pure data — rides the carrier brood machinery) on top of its
    split-on-death. Stormcaller: Gale Surge every 7s hastens the whole
    horde to 140% — but slows OVERRIDE haste, so frost coverage cancels
    the storm outright. Boss bar announces CARAPACE UP; the shell draws a
    bright ring on the body; floats + FM clang / wind-whoosh sounds; codex
    documents each mechanic and its answer. Boss waves already land on
    relic-offer waves (10/20/30 are multiples of 5), so the reward anchor
    exists for free. Goldens: HASH-ONLY diff — reference outcomes did not
    move (the bot's tier-2 cannons break carapaces naturally); biome
    envelope + fuzz containment pass unchanged. 161 unit tests (4 new
    exact-arithmetic boss tests), 28 e2e specs.

69. *(five-item program, 1/5)* **Biome balance: measured, verified, pinned**
    — reference measurements across all four biomes: mid meta (3000 sparks)
    lands 11–14 waves everywhere (the features' upsides and their costs
    nearly cancel at the reference floor); deep meta (20k) wins 3-of-4
    seeds on verdant/frostfen and 2-of-4 on emberwaste/highlands — the
    late-unlock biomes correctly a touch harder. Property numbers ship
    as-is on the evidence. Two new standing guards: a biome envelope in
    balance.test (each biome within ±4 waves of verdant at mid meta; a
    deep tree must still win on every biome) and biome containment in
    fuzz.test (both pinned near-exploit genomes must stay defeated at 8k
    on frostfen/emberwaste/highlands — the features are all
    player-favorable in isolation; this pins that no known comp converts
    one into a cheap win). 157 unit tests.

68. *(post-marathon, design)* **Biomes: generated battlefields** — maps are
    no longer fixed layouts: every run generates a fresh structure from its
    seed inside its biome's rules. Four biomes, unlocking across the meta
    ladder: Verdant Reach (baseline, always open), Frostfen (wave 8+ —
    marsh pools slow ground enemies to 80% but can't be built on), Ember
    Waste (first victory — fissures erupt every 3s, searing ground enemies,
    damage riding the wave HP curve), The Highlands (first ascension —
    mesas are enemy-impassable but BUILDABLE, +20% range: high ground
    without true elevation, per design). The generator is pure and
    memoized, draws from its own local stream (other streams untouched),
    validates every layout (gate-to-Spire path + open-ground minimum,
    salted retries, bare-field fallback), and keeps gates in the center
    band — edge gates opened flank detours that collapsed fresh runs at
    wave ~5 (found via a golden regression, fixed before ship). Dailies
    share one biome roll across all players regardless of unlocks. The
    picker is now a biome picker with 🔒 unlock hints; per-biome bests
    replace per-map bests; legacy saves keep their fixed map via a
    migration path. Balance held: envelope, careers, and fuzz genomes all
    pass on generated battlefields unchanged. E2e specs that needed "a
    legal cell" now derive build spots from the live map through a new
    harness getMapInfo — layout-agnostic against future generator tweaks.
    155 unit tests (7 new: generator determinism/playability sweeps ×160
    layouts, marsh/mesa/vent exact arithmetic), 28 e2e specs.

67. *(post-marathon, playtest)* **Loupe fixes** — (1) releasing a drag off
    the board cancels instead of placing (the loupe vanishes off-board as
    the cancel affordance; e2e pins it); (2) the "weird blue circle" in
    the loupe's corner was the ring drawn after ctx.restore() — raw device
    px on dpr>1 phones rendered it quarter-scale top-left; it now draws in
    its own dpr-scaled frame (headless dpr-1 screenshots had hidden this —
    re-verified at deviceScaleFactor 2); (3) zoom relaxed 46 → 30 px per
    cell, so ~4 cells of context are visible instead of ~2.6.

66. *(post-marathon, review)* **Transformative relic tier** — seven relics
    that change HOW a tower plays, not its numbers: Ricochet Strings
    (arrows bounce at 50%), Cinder Shells (cannon hits burn 60% over 2s,
    armor-proof), Shatterheart (slowed deaths detonate 30% max HP),
    Storm Coils (tesla ramps +15%/hit to +75%), Deadeye Sigil (snipers
    execute non-bosses under 15%), Golden Ledger (wave-clear interest,
    capped — the Bounty Banner lesson), Prism Lens (beacon auras grant
    crit). Rare/legendary, so a run sees one or two and builds an identity
    around them — the answer to "every run plays the same". Reference bot
    now leans its comp toward owned transformative relics (that's the
    intended play pattern). Balance: pool dilution (23 → 30) stretched
    the reference career's first win ~15 → ~20 runs and made FRESH runs
    stronger (alpha 9 → 12 — comp-matched mechanics beat early spark
    upgrades), so the envelope was re-derived: career horizon 22, strict
    fresh<mid monotonicity, new deep>fresh+8 ladder bound. Fuzz pinned
    genomes stay contained. 7 new engine tests pin each mechanic's exact
    arithmetic; goldens regenerated (draw-shift magnitude: one bot −1
    wave, one +28 sparks). 148 unit tests, 28 e2e specs.

65. *(post-marathon, playtest)* **The Crucible + ascension discoverability**
    — answering "why play again after winning?". Each victory in a cycle
    now hardens the next run (+10% enemy HP per victory, applied as a
    final stage in the same HP pipeline as Iron Horde — preview mirror
    included) and sweetens it (+15% Sparks per victory), on top of the
    existing +1 Ember per cycle victory at ascension. A repeat win is an
    escalating ladder with visible stakes, not a replay of a solved
    puzzle; ascending resets the Crucible with the cycle. Pre-victory
    balance untouched (envelope + fuzz + careers all bind on fresh meta).
    Discoverability: the victory prompt now explains the choice concretely
    (ascend for N Embers vs. win again for +1 Ember at +10%/+15% stakes),
    the run-over screen shows an Ascension-ready callout above the trees,
    the Spire Tree button wears 🔥 whenever ascension is available, the
    HUD shows a Crucible badge during hardened runs, and the next-run row
    states the coming run's rank. New RunState field `crucible` (save
    migration backfills 0; goldens regenerated — hash-only diff, all
    outcomes byte-identical). 141 unit tests, 28 e2e specs.

64. *(post-marathon, playtest)* **Approach lane: shipped, then reverted** —
    a two-cell pre-battlefield strip where pending spawns marched in ahead
    of the gate. Playtest verdict: the shifted playfield looked ugly; the
    anticipation win didn't pay for the visual cost. Reverted wholesale
    (lane canvas, loupe re-anchor, tooltip offset, matrix assertion).
    Enemy anticipation still lives in the scouting report + boss telegraph.

63. *(post-marathon, playtest)* **Sound 3.0: real synthesis voices** — the
    per-action sounds themselves rebuilt (feedback: layering polish wasn't
    enough; oscillator beeps read as programmer art). Two new voices:
    Karplus-Strong plucked string (noise burst ringing in a tuned feedback
    delay — the arrow is an actual bowstring now, placement is a planted
    post) and two-operator FM (modulation depth collapsing inside each hit:
    frost chimes, tesla discharge, kill clink, spire-hit clang, relic glass
    bell, coin tinks, victory bell fanfare, and a real gong for Bulwark).
    Every note gets an attack ramp (no envelope clicks), tonal notes play
    as detuned pairs through a softening lowpass, a procedurally generated
    convolution reverb adds room air (stingers wet, rapid combat dry), and
    combat sounds pan to their battlefield position. Still zero assets.

62. *(post-marathon, playtest)* **Loupe unbound from the board** — the
    aim loupe was drawn inside the playfield canvas, and on a phone the
    board is only ~170 screen px tall: for most cells "above the finger"
    didn't exist, so the flip-below fallback parked the loupe exactly
    under the finger (reported in playtest). The loupe is now a separate
    screen-space canvas overlay that can float over the header/preview
    area; placement prefers above the finger, falls back right → left →
    below only if the viewport truly corners it. Fixed screen size (120px,
    cell magnified to ~46px) at any board scale. E2e now pins the
    regression: aiming at the board's center cell, the loupe's box must
    not contain the touch point; it hides on release.

61. *(post-marathon, playtest)* **DPS column, narrower table** — the codex
    tower tables gain a DPS column (per-target, from the same effective
    damage/cooldown helpers, base in parens when modified) while getting
    NARROWER: the Rate column is gone (hit × rate = DPS, and per-hit damage
    is the number armor/shields judge), and the Special column — the widest
    cell by far — is compressed to one tier-progression line under each
    table ("Splash 0.9 → 1.1 → 1.2 cells"). A muted note flags the
    per-target caveat (splash/chain multiply it; armor taxes fast firers).
    Net result at 375px: six of seven tables fit with ZERO internal
    scroll even with modifier parentheticals (previously all scrolled).
    E2e adds a DPS fidelity check: 3 Honed Arsenal levels flip arrow tier
    3 to 117 (96).

60. *(post-marathon, playtest)* **Codex shows YOUR numbers** — the tower
    tables and ability reference now quote effective values through the
    same engine helpers combat uses (`effectiveDamagePct`,
    `effectiveTowerCooldown`, new `effectiveTowerRange`,
    `effectiveAbilityCooldown`), with base values in muted parentheses
    when a modifier moved them and an amber note explaining why. Spire
    Tree damage levels, relics (Quickdraw, Longsight, Glass Cannon…), and
    Dampening cataclysms all flow in. The Longsight range math was inlined
    in towersFire — extracted to a shared helper first (goldens prove the
    refactor behavior-identical). On phones the wider tables scroll within
    themselves. E2e: buying 3 Honed Arsenal levels must move sniper tier 3
    from 260 to 322 with the base alongside.

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
