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
- [ ] 6. Graphics: real projectiles (cannon shells, sniper tracers), muzzle flash
- [ ] 7. Graphics: terrain texture, path styling, spire/gate glow-up
- [ ] 8. UX: settings panel (volume, reduced motion) + shortcuts help overlay
- [ ] 9. Mobile: PWA manifest + offline service worker + install icons
- [ ] 10. Ascension: prestige layer resetting the Spire Tree for Embers (M6)
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
