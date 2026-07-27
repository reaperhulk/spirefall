# The Spire Tree, restructured as a skill tree

Read alongside PLAN.md §2 (the curve) — the tree is the rogue-lite engine, so
anything here re-derives the balance envelope.

**Status: phase 1 shipped (iteration 214).** Branches, gates, keystones with
free respec, authored coordinates, the Honed Edge split, the Ash tier-1
nodes, save migration, and gate-aware `spendSparks` are live; the old list
screen still renders them, grouped by branch and honest about locks. Phase 2
(the SVG graph view) and phase 3 (Gold/Ash keystones, capstones, the no-trap
test) are still ahead. Two measured lessons from phase 1 are recorded in
iteration 214 and worth reading before phase 3: buy-priority lists must keep
the damage veins adjacent, and gates can *improve* a badly ordered build.

## 1. What is actually wrong with the list

Fifteen nodes, all purchasable from run one, no relationships. Diagnosed
against the live data rather than taste:

1. **There is no choice, only an order.** Every node is eventually bought at
   full depth; the sole decision is sequence, and `DEFAULT_BUY_PRIORITY`
   already encodes the answer. The fuzzer's `metaPriority` gene searches that
   order and finds it worth a wave or two — a real but thin axis.
2. **No two accounts look different.** At 20k sparks every tree is the same
   tree. Nothing about a player's tree says how they play.
3. **Depth is a slider, not a decision.** `tower_damage` has *25 levels*.
   Pacing comes entirely from the cost curve; structure contributes nothing.
4. **It cannot teach.** A new player sees fifteen equal rows. Nothing conveys
   that Storm Coils leads anywhere, or what a deep account looks like.
5. **Trap nodes are invisible.** Ashen Road cut win rate by 90% for 10,700
   sparks (entry 210) and the list had no way to show that a node carries a
   cost beyond its price. A tree with explicit branches and keystones makes
   "this is a commitment" a visible property.
6. **The active layer has no representation at all.** Overcharge, execute,
   the beam, and boons are worth +3–5 waves (entry 209) and *not one node in
   the tree touches them*. That is the single biggest content gap.

## 2. Structure

A root (the Spire) with three branches. The branches are not flavour — they
are the three ways the game already measures a player: raw power, economy,
and the active layer.

```
                      ┌── IRON ──┐        things that kill
   THE SPIRE ─────────┼── GOLD ──┤        things that pay
                      └── ASH  ──┘        things you do with your hands
```

### Node types (this is what makes a tree instead of a list)

- **Veins** — small nodes, 2–5 levels, cheap. The stat trickle. Crucially,
  `tower_damage`'s 25 levels are **split into three separate damage veins at
  three depths across the tree**, so "buy damage" becomes "walk a path", and
  the path costs you position somewhere else.
- **Gates** — a branch tier opens once you have spent N sparks *in that
  branch*. Commitment without exclusivity; the classic ARPG shape.
- **Keystones** — one choice per branch tier, **mutually exclusive within
  that tier**, and they change *how* you play rather than by how much. This
  is where the fun lives.
- **Capstones** — one per branch, visible and greyed from run one with its
  price on it. The long pull.

### The proposed tree (~24 nodes; sparks totals held near today's ~202k)

**IRON — the war branch**

| Tier | Nodes |
|---|---|
| 1 | Honed Edge (+6% dmg ×3) · Reinforced Core (+2 HP ×4) · Storm Coils (Tesla) |
| gate | 400 sparks spent in Iron |
| 2 | Killer Instinct (crit ×4) · Duelist Doctrine (Lance) · Honed Edge II (+6% dmg ×4) |
| keystone | **Glassforge** — +35% damage, −40% Spire max HP · **or** · **Bastion Line** — +6 max HP, repairs cost half |
| 3 | Honed Edge III (+6% dmg ×5) · capstone **Arsenal Mastery** — tier-3 towers may take a *second* spec |

**GOLD — the coin branch**

| Tier | Nodes |
|---|---|
| 1 | War Chest (+30 gold ×3) · Collector's Reach (×2) · Deep Vaults (Mint) |
| gate | 400 sparks spent in Gold |
| 2 | Tithe of the Fallen (+8% gold ×4) · Spire Magnet (×3) · Signal Fires (Beacon) |
| keystone | **Bounty Doctrine** — +25% kill gold, coins expire 40% faster · **or** · **Vault Doctrine** — mints pay double, kill gold −15% |
| 3 | Ember Memory (+10% sparks ×4) · capstone **Mint Sovereign** — mints scale with the wave budget |

**ASH — the tempo branch** (all new; closes the gap from §1.6)

| Tier | Nodes |
|---|---|
| 1 | Prospector's Charm (Gold Rush) · Quick Hands (execute cooldown −20% ×2) · Steady Aim (overcharge cooldown −15% ×2) |
| gate | 400 sparks spent in Ash |
| 2 | Aegis Sigil (Bulwark) · Coolant Lines (beam heat cap +25% ×2) · Ashen Road (wave skip, now *inside* a branch where its commitment reads) |
| keystone | **Bladed Rhythm** — execute cooldown halved, boons offer 1 instead of 2 · **or** · **Long Watch** — the beam never overheats, but deals 30% less |
| 3 | capstone **Spire Ascendant** — two boons every wave |

Note the keystones each carry a real downside. That is the point, and it is
only safe because of the next rule.

### Respec, and why it is non-negotiable

**Keystone choices are free to change between runs. Veins and gates are
permanent.** Exploration stays safe — the Ashen Road lesson says a permanent
purchase that makes you weaker is the worst thing this game can do to a
player — while the grind still compounds exactly as it does today. It also
keeps the data shape: keystones are ordinary `maxLevel: 1` nodes in
`upgrades`, and a respec sets one back to 0 and refunds it.

## 3. Why this is more fun

- **Identity.** "I'm a Glassforge/Bounty player" is a sentence that cannot be
  said today. Two accounts at 20k sparks now look different and *play*
  different.
- **The choice arrives early and repeats.** First keystone lands around run
  4–6, then again per branch. Something to decide, not just accumulate.
- **A visible far goal.** Capstones are on screen, greyed, priced, from the
  first run. Incrementals live on the thing you can see and cannot afford.
- **Gates create pacing that isn't arithmetic.** "180 more sparks in Gold and
  tier 2 opens" is a goal with a shape; "level 14 of 25" is not.
- **The active layer finally progresses.** The verbs the game teaches now
  have somewhere to grow, which also gives the Ash branch a reason to exist.

## 4. UI

**Promote it to a full-screen view.** It is a modal tab today; a graph needs
the room, and on a phone a modal graph is hopeless.

- **SVG, not canvas.** Real DOM nodes are focusable buttons: keyboard
  navigation (this repo has keyboard-only specs), screen-reader labels,
  `getByTestId` per node, CSS theming. The battlefield canvas stays canvas.
- **Hand-authored coordinates in the data, never auto-layout.** Deterministic,
  reviewable in a diff, and the shape can carry meaning. Two authored
  coordinate sets — `wide` and `compact` — selected by media query, so phones
  get a stacked three-column tree from the same component and data.
- **Node states**, each visually distinct: locked (gate unmet) · available ·
  owned-partial (level pips around the ring) · maxed · keystone-taken ·
  keystone-locked-out.
- **Detail panel on tap** — bottom sheet on mobile (the tower panel already
  uses this pattern), side panel on desktop: name, effect now → next, cost,
  gate requirement, Buy.
- **Path preview.** Select a locked node and the cheapest route to it
  highlights, with the total sparks it needs. This is the best single feature
  on the list for an incremental: it converts "someday" into a plan.
- **"Now affordable" pulse** after a run, tied into the existing run-over
  tree tab: you earned ✦N, here is what just came into reach. Respects
  `prefers-reduced-motion` (no pulse, static ring instead).
- **The lesson from iteration 213 applies here hardest**: in a pannable
  viewport, "in the DOM" is not "on screen". Every node spec asserts the
  node's box lies inside the viewport box after Fit, at 1280px and 375px.

## 5. Blast radius, and the honest cost

The tree is upstream of nearly every measurement in the repo.

| Area | What changes |
|---|---|
| `spendSparks` (harness) | must respect gates — buy in priority order among *purchasable* nodes, and open gates deliberately |
| fuzzer `metaPriority` | stays a list of ids; **add a keystone-choice gene per tier** — a small discrete axis, ideal for the search |
| goldens | `richMeta(2000)` changes shape → all six scenarios move |
| balance envelope | every band re-derived |
| BREAKING floor | re-measure the 4×8 grid; re-run the eight-seed biome hunt after |
| saves | migration below |
| e2e | tree specs rewritten against the graph |

**Migration.** Old saves map 1:1 for surviving ids. For split nodes (damage
25 → three veins), convert by *value*: compute the sparks sunk into the old
node, allocate down the new branch in canonical order, bank the remainder as
sparks. Lossless in value, not in shape — plus a one-time free full respec
for existing accounts, so nobody logs in to find 25 levels of damage gone.

**A new test the redesign earns: the no-trap check.** Generalise entry 210's
lesson — for every keystone, assert that owning it does not *reduce* measured
depth against the 4×8 grid versus not owning it. A keystone may cost you
something; it may not cost you the run.

## 6. Phasing

1. **Data + rules, old screen still rendering.** Branches, gates, keystones,
   coordinates, respec, migration, `spendSparks` gate-awareness, harness
   genes. Provable headlessly before a pixel moves.
2. **The SVG view.** Full-screen, detail panel, path preview, mobile
   coordinates, keyboard nav, the on-screen specs.
3. **Content + re-derivation.** The Ash branch and the keystones, then
   goldens, envelope, the 4×8 grid, the biome hunt, and the no-trap test.

Phase 1 is the risky one and it is fully testable without UI. Phase 3 is the
one that moves the curve; it ends with a full re-derivation or it isn't done.
