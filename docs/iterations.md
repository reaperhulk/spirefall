# Overnight iteration log

A living backlog + log for the autonomous improvement marathon (50 cycles).
Each iteration: plan against the current codebase → implement → verify
(`npm run check`, e2e/goldens when touched) → commit → push. Themes rotate
across gameplay depth, game length/post-game, graphics, UX, and mobile parity.

## Backlog (revised every cycle)

- [x] 1. Carrier enemy: late-game spawner that births swarmlings while alive
- [ ] 2. Wraith enemy: phases untargetable — punishes pure-DPS, rewards timing
- [ ] 3. Two new maps (Serpent, Crossroads) + map name in HUD; recalibrate seeds
- [x] 4. Endless mutators: stacking wave modifiers past the victory wave (Cataclysms)
- [x] 5. Run summary analytics: damage by tower type, kills by enemy type
- [x] 6. Graphics: real projectiles (cannon shells, sniper tracers), muzzle flash
- [ ] 7. Graphics: terrain texture, path styling, spire/gate glow-up
- [x] 8. UX: settings panel (volume, reduced motion) + shortcuts help overlay
- [x] 9. Mobile: PWA manifest + offline service worker + install icons
- [x] 10. Ascension: prestige layer resetting the Spire Tree for Embers (M6)
- [ ] 11. Relic depth: rarity tiers, more relics, reroll option
- [ ] 12. New tower type (7th) with unlock node + hotkey 7
- [ ] 13. Save export/import codes
- [ ] 14. Achievements with spark rewards
- [ ] 15. Wave preview enrichment: threat estimate, elite marks
- [ ] 16. First-run tutorial hints
- [ ] 17. Lifetime stats screen
- [ ] 18. Boss variety: distinct boss per boss wave
- [ ] 19. Deep fuzz run + rebalance pass
- [ ] 20. Death/hit particles, boss entrance, juice pass
- (re-planned continuously; larger themes split across cycles)

## Log

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
