import { expect, test } from '@playwright/test'
import type { MetaUpgradeId } from '../src/data/metaTree'
import type { TowerSpecId } from '../src/data/content'
import type { TowerType } from '../src/engine/types'
import { boot, clickMenu } from './ui-helpers'

// UI suite (PLAN.md §5.7): deliberately shallow on game logic — that lives in
// the headless suites — but drives the REAL input path: buttons, canvas
// clicks, and the dev harness the way a playtester would. Runs are seeded
// through the harness so every assertion is deterministic.
// Relics, the Spire Tree, the Crucible, and a maxed pilot winning.

test('relic offers appear in the UI and apply on click', async ({ page }) => {
  const errors = await boot(page, 'e2e-relic-a')
  // Actually play: each build phase, buy/upgrade arrows, then send the wave —
  // waves are lethal enough now that a static two-tower setup dies before the
  // wave-5 relic offer.
  await page.evaluate(() => {
    // Freeze the real-time clock: every tick below comes from fastForward, so
    // the whole scripted playthrough is deterministic regardless of rAF timing.
    window.__harness.setSpeed(0)
    // Derive spots from the generated battlefield: open cells flanking the
    // gate's row, one per column, walking outward from the gate.
    const info = window.__harness.getMapInfo()
    const spots: [number, number][] = []
    for (let cx = 2; cx < info.width - 2 && spots.length < 6; cx++) {
      for (const dy of [-1, 1, -2, 2]) {
        const cy = info.spawn.cy + dy
        if (cy < 0 || cy >= info.height) continue
        if (info.buildable[cy * info.width + cx] && !spots.some(([x]) => x === cx)) {
          spots.push([cx, cy])
          break
        }
      }
    }
    const act = (): boolean => {
      const s = window.__harness.getState()
      if (s.towers.length < 4 && s.gold >= 50) {
        const [cx, cy] = spots[s.towers.length]!
        window.__harness.dispatch({ type: 'place_tower', tower: 'arrow', cell: { cx, cy } })
        return true
      }
      const tierOne = s.towers.find((t) => t.tier === 1)
      if (tierOne && s.gold >= 60) {
        window.__harness.dispatch({ type: 'upgrade_tower', id: tierOne.id })
        return true
      }
      const tierTwo = s.towers.find((t) => t.tier === 2)
      if (tierTwo && s.gold >= 140) {
        window.__harness.dispatch({ type: 'upgrade_tower', id: tierTwo.id })
        return true
      }
      if (s.towers.length < spots.length && s.gold >= 50) {
        const [cx, cy] = spots[s.towers.length]!
        window.__harness.dispatch({ type: 'place_tower', tower: 'arrow', cell: { cx, cy } })
        return true
      }
      return false
    }
    for (let guard = 0; guard < 10; guard++) {
      const s = window.__harness.getState()
      if (s.phase !== 'build' || s.relicOffer !== null) break
      while (act()) window.__harness.fastForward(1)
      window.__harness.dispatch({ type: 'start_wave' })
      // Coins only pay when collected: sweep the collector to the richest
      // drop between fast-forward chunks, exactly like a hovering cursor.
      // Forward FIRST — the start_wave dispatch itself needs a tick.
      for (let chunk = 0; chunk < 30; chunk++) {
        window.__harness.fastForward(20)
        const w = window.__harness.getState()
        if (w.coins.length > 0) {
          const richest = w.coins.reduce((a, b) => (b.gold > a.gold ? b : a))
          window.__harness.dispatch({ type: 'set_collect', at: { x: richest.pos.x, y: richest.pos.y } })
        } else if (w.phase !== 'wave') break
      }
    }
  })
  const snap = await page.evaluate(() => window.__harness.snapshot())
  expect(snap.phase).toBe('build') // survived through wave 5
  await expect(page.getByTestId('relic-modal')).toBeVisible()
  await page.locator('.relic-card').first().click()
  await page.evaluate(() => window.__harness.fastForward(1)) // clock is frozen; process the choice
  await expect(page.getByTestId('relic-modal')).not.toBeVisible()
  const after = await page.evaluate(() => window.__harness.snapshot())
  expect(after.relics.length).toBe(1)
  expect(errors).toEqual([])
})

test('Ashen Road says what it owes you: the relic debt is on screen, not a surprise', async ({ page }) => {
  const errors = await boot(page, 'e2e-relic-debt')
  // A fresh account owes nothing, so the chip must not be there at all.
  await expect(page.getByTestId('relic-debt')).toHaveCount(0)
  // Buy Ashen Road to the top: starting at wave 10 swallowed the wave-5 and
  // wave-10 relic offers, so the run opens owing two picks.
  const owed = await page.evaluate(() => {
    const h = window.__harness
    h.getMeta().sparks = 1_000_000
    // Ashen Road is Ash tier 2 — pay the branch gate before it will sell.
    for (const id of ['unlock_gold_rush', 'quick_hands', 'quick_hands', 'steady_aim', 'steady_aim'] as const) {
      h.buyMeta(id)
    }
    for (let i = 0; i < 5; i++) h.buyMeta('wave_skip')
    h.newRun('e2e-relic-debt')
    return h.getState().relicDebt
  })
  expect(owed).toBe(2)
  // The count is in the TEXT — touch devices have no tooltip to hover.
  const chip = page.getByTestId('relic-debt')
  await expect(chip).toBeVisible()
  await expect(chip).toContainText('2 relic picks owed')
  // ...and ON SCREEN. The scouting strip scrolls horizontally, so a chip
  // appended at the end sits past the right edge: in the DOM, toBeVisible
  // green, and never once read by a player. Assert it is actually inside the
  // strip's visible box, at phone width too, where the strip is tightest.
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 700 })
    const inView = await page.evaluate(() => {
      const strip = document.querySelector('[data-testid="wave-preview"]')!.getBoundingClientRect()
      const c = document.querySelector('[data-testid="relic-debt"]')!.getBoundingClientRect()
      return c.left >= strip.left - 1 && c.right <= strip.right + 1
    })
    expect(inView, `relic debt chip off screen at ${width}px`).toBe(true)
  }
  // It tracks the debt down as the engine settles it, and clears at zero.
  await page.evaluate(() => {
    const s = window.__harness.getState()
    s.relicDebt = 1
    window.__harness.fastForward(0.2)
  })
  await expect(chip).toContainText('1 relic pick owed') // singular, too
  await page.evaluate(() => {
    const s = window.__harness.getState()
    s.relicDebt = 0
    window.__harness.fastForward(0.2)
  })
  await expect(page.getByTestId('relic-debt')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('the Spire Tree graph: nodes carry state, a purchase runs charge down the line', async ({ page }) => {
  const errors = await boot(page, 'e2e-tree-graph')
  await page.evaluate(() => {
    window.__harness.getMeta().sparks = 600
  })
  await clickMenu(page, 'open-tree')
  await expect(page.getByTestId('tree-graph')).toBeVisible()

  // Tier 1 is open on a fresh account; Iron tier 2 is gated behind spend.
  await expect(page.getByTestId('gnode-tower_damage')).toHaveAttribute('aria-label', /affordable/)
  await expect(page.getByTestId('gnode-crit_chance')).toHaveAttribute('aria-label', /locked/)

  // Selecting a node opens its detail panel; buying it moves the level.
  await page.getByTestId('gnode-tower_damage').click()
  await expect(page.getByTestId('tree-detail')).toBeVisible()
  await page.getByTestId('buy-tower_damage').click()
  await expect
    .poll(async () => page.evaluate(() => window.__harness.getMeta().upgrades['tower_damage'] ?? 0))
    .toBe(1)

  // A locked node says what it wants rather than offering a dead button.
  await page.getByTestId('gnode-crit_chance').click()
  await expect(page.getByTestId('detail-gate')).toContainText('more in Iron')
  await expect(page.getByTestId('buy-crit_chance')).toBeDisabled()

  // Spend until Iron's gate opens: the charge element renders on the edges
  // that were just unveiled — the animation the screen is built around.
  await page.getByTestId('gnode-spire_hp').click()
  for (let i = 0; i < 6; i++) await page.getByTestId('buy-spire_hp').click()
  await expect(page.locator('.tree-edge-charge').first()).toBeAttached()
  await expect(page.getByTestId('gnode-crit_chance')).toHaveAttribute('aria-label', /affordable|unaffordable/)

  // And the graph stays ON SCREEN, not merely in the DOM, at both widths.
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 800 })
    await page.waitForTimeout(120)
    const inside = await page.evaluate(() => {
      const svg = document.querySelector('.tree-graph')!.getBoundingClientRect()
      return svg.left >= -1 && svg.right <= window.innerWidth + 1 && svg.width > 100
    })
    expect(inside, `tree graph off screen at ${width}px`).toBe(true)
  }
  expect(errors).toEqual([])
})

test('the Crucible: a chosen rank hardens the next run and surfaces in the HUD', async ({ page }) => {
  const errors = await boot(page, 'e2e-wave')
  await page.locator('.hint-close').click()

  // No victories yet: no badge, no fire on the tree button.
  await expect(page.getByTestId('crucible')).not.toBeVisible()
  await expect(page.getByTestId('open-tree')).not.toContainText('🔥')

  // Rank 2 unlocked and chosen, with a win this cycle -> the next run is
  // Crucible II and Ascension is ready.
  await page.evaluate(() => {
    const meta = window.__harness.getMeta()
    meta.victories = 2
    meta.cycleVictories = 2
    meta.crucibleUnlocked = 2
    meta.crucibleRank = 2
    window.__harness.newRun('e2e-crucible')
  })
  await page.getByTestId('open-menu').click()
  await expect(page.getByTestId('crucible')).toBeVisible()
  await expect(page.getByTestId('crucible')).toContainText('Crucible II')
  await expect(page.getByTestId('open-tree')).toContainText('🔥')
  expect(await page.evaluate(() => window.__harness.getState().crucible)).toBe(2)
  expect(errors).toEqual([])
})

// The maxed-account pilot: buys every Spire Tree node through the real
// purchase path, then plays only real commands — picket-line placement,
// abilities, mid-wave repairs, tier-3 specs, enhancement sinks. Shared by
// the victory spec (verdant, tuned to win) and the biome-generalization
// spec (reach goal). Injected into the page via page.evaluate.
const MAXED_PILOT = (seed: string) => {
  const h = window.__harness
  h.getMeta().sparks = 1_000_000
  // No Ashen Road: skipping ahead lands a tier-1 scatter in front of
  // late-wave HP scale. Ramping from wave 1 lets the kill box compound.
  // Every damage vein by name: Honed Edge is split across three tiers since
  // the tree restructure, so a list naming only the first caps the pilot at
  // 8 levels instead of 20 — measured as dying on wave 22 instead of winning.
  // Battle-Hardened and Relic Cartography are the Iron/Gold tier-3 nodes that
  // took over the budget of Honed Edge III's retired levels.
  // The Ash tier-1 nodes also pay that branch's gate, which Bulwark needs.
  const ids: MetaUpgradeId[] = [
    'starting_gold', 'spire_hp', 'tower_damage', 'tower_damage_2', 'tower_damage_3',
    'battle_hardened', 'crit_chance', 'gold_income', 'spark_gain', 'relic_cartography',
    'unlock_tesla', 'unlock_mint', 'unlock_beacon', 'unlock_gold_rush', 'quick_hands',
    'steady_aim', 'unlock_bulwark', 'magnet_reach', 'spire_magnet',
  ]
  for (let pass = 0; pass < 25; pass++) for (const id of ids) h.buyMeta(id)
  h.newRun(seed)

  // Place hugging the LIVE walk (getMapInfo().path accounts for towers):
  // the generated route rarely follows the spawn row, so a fixed-row
  // scatter guards grass while the horde marches elsewhere. Cells the
  // engine rejects (e.g. the placement would seal the path) get banned so
  // the pilot moves on instead of retrying the same illegal cell forever.
  // Placement, learned the hard way (each alternative below was measured,
  // not theorized): a dense killbox anywhere mid-path gets REROUTED around
  // (open-field mazing works against the builder too), and a spire-mouth
  // box leaks every survivor straight into the walls. What wins here is a
  // PICKET LINE: towers spread along the long straight flanking the gate
  // row, layering attrition over the whole walk without ever bending it.
  const banned = new Set<string>()
  const cells: [number, number][] = []
  {
    const info = h.getMapInfo()
    for (let cx = 1; cx < info.width - 1 && cells.length < 18; cx++) {
      for (const dy of [-1, 1, -2, 2]) {
        const cy = info.spawn.cy + dy
        if (cy < 0 || cy >= info.height) continue
        if (info.buildable[cy * info.width + cx] && !cells.some(([x]) => x === cx)) {
          cells.push([cx, cy])
          break
        }
      }
    }
  }
  const nextBuildCell = (): { cx: number; cy: number } | null => {
    const used = new Set(h.getState().towers.map((t) => `${t.cell.cx},${t.cell.cy}`))
    for (const [cx, cy] of cells) {
      const key = `${cx},${cy}`
      if (!used.has(key) && !banned.has(key)) return { cx, cy }
    }
    return null
  }
  // Frost (slow) and beacon (aura amplifier) are force multipliers a pure
  // DPS line lacks — they're what push the line over the wave-24 hump.
  // 18 posts, not 14: the consolidated elites survive the gate-side guns
  // and die along the enfilade, so the line runs deeper down the walk.
  const types: TowerType[] = ['arrow', 'tesla', 'cannon', 'arrow', 'frost', 'beacon', 'sniper', 'tesla', 'cannon', 'arrow', 'frost', 'tesla', 'cannon', 'arrow', 'sniper', 'frost', 'tesla', 'cannon']
  let lastGold = -1 // whiff detector: a build action that moved no gold means "stop shopping, send the wave"
  for (let guard = 0; guard < 1500; guard++) {
    const s = h.getState()
    if (s.phase === 'victory' || s.phase === 'defeat') break
    if (s.relicOffer && s.relicOffer.length > 0) {
      // Guardian spoils are an exchange; the pilot keeps its build.
      h.dispatch({ type: 'choose_relic', relic: s.relicSpoils ? null : s.relicOffer[0]! })
      h.fastForward(0.2)
      continue
    }
    if (s.phase !== 'build') {
      // Fight with everything: meteor + frost nova on the lead pack every
      // time they're off cooldown (rejects are harmless), and Bulwark's 5s
      // of spire invulnerability once the leaks start landing — that's the
      // difference at the wave-23/24 hump.
      const es = s.enemies as { pos: { x: number; y: number } }[]
      if (es.length > 3) {
        const lead = es.reduce((a, b) => (b.pos.x > a.pos.x ? b : a))
        const cell = { cx: Math.floor(lead.pos.x / 1000), cy: Math.floor(lead.pos.y / 1000) }
        h.dispatch({ type: 'cast_ability', ability: 'meteor', cell })
        h.dispatch({ type: 'cast_ability', ability: 'frost_nova', cell })
      }
      if (s.spireHp < s.spireMaxHp) {
        h.dispatch({ type: 'cast_ability', ability: 'bulwark', cell: { cx: 0, cy: 0 } })
      }
      if (s.spireHp <= s.spireMaxHp - 8 && s.gold >= 1500) {
        // The crews manage two patches even under fire — spend the war
        // chest on walls while the towers grind the flood down.
        h.dispatch({ type: 'repair_spire' })
      }
      // Coins wait on the field until someone picks them up; sweep the
      // collector to the richest drop so the war chest actually fills.
      const coins = s.coins as { pos: { x: number; y: number }; gold: number }[]
      if (coins.length > 0) {
        const richest = coins.reduce((a, b) => (b.gold > a.gold ? b : a))
        h.dispatch({ type: 'set_collect', at: { x: richest.pos.x, y: richest.pos.y } })
      }
      h.fastForward(4)
      continue
    }
    if (s.victoryClaimed) {
      h.dispatch({ type: 'abandon_run' }) // the "End run" path: bank the win
      h.fastForward(0.2)
      continue
    }
    // Build phase: leftovers from the last wave sit on the grass until
    // collected — vacuum before shopping so the budget is real.
    const groundGold = s.coins as { pos: { x: number; y: number }; gold: number }[]
    if (groundGold.length > 0) {
      const richest = groundGold.reduce((a, b) => (b.gold > a.gold ? b : a))
      h.dispatch({ type: 'set_collect', at: { x: richest.pos.x, y: richest.pos.y } })
      h.fastForward(0.2)
      continue
    }
    if (s.gold === lastGold) {
      lastGold = -1
      h.dispatch({ type: 'start_wave' })
      h.fastForward(1)
      continue
    }
    // A small core first, then depth over breadth (focused tier 3s carry
    // mid-waves where a tier-1 scatter dies), then breadth, then repairs
    // and enhancement sinks.
    const upgradeTarget = s.towers.filter((t) => t.tier < 3).sort((a, b) => b.tier - a.tier)[0]
    const wantPlace =
      (s.towers.length < 4 && s.gold >= 200) || (!upgradeTarget && s.towers.length < types.length && s.gold >= 400)
    const cand = wantPlace ? nextBuildCell() : null
    if (cand) {
      h.dispatch({ type: 'place_tower', tower: types[s.towers.length % types.length]!, cell: cand })
      h.fastForward(0.2)
      if (h.getState().towers.length === s.towers.length) banned.add(`${cand.cx},${cand.cy}`)
      continue
    }
    if (upgradeTarget && s.gold >= 600) {
      lastGold = s.gold
      h.dispatch({ type: 'upgrade_tower', id: upgradeTarget.id })
      h.fastForward(0.2)
      continue
    }
    // Tier 3s then commit to specs — Permafrost's brittle (+25% damage
    // taken) multiplies the whole line; Volley/Mortar/Lattice clear hordes.
    const SPECS: Record<string, TowerSpecId> = {
      arrow: 'volley',
      cannon: 'mortar',
      frost: 'permafrost',
      tesla: 'lattice',
      sniper: 'overpen',
    }
    const specTarget = s.towers.find(
      (t) => t.tier >= 3 && t.spec === null && SPECS[(t as unknown as { type: string }).type] !== undefined,
    )
    if (specTarget && s.gold >= 300) {
      lastGold = s.gold
      h.dispatch({
        type: 'specialize_tower',
        id: specTarget.id,
        spec: SPECS[(specTarget as unknown as { type: string }).type]!,
      })
      h.fastForward(0.2)
      continue
    }
    if (s.spireHp < s.spireMaxHp && s.gold >= 800) {
      // Patch the walls between waves — long-run attrition is what kills
      // an otherwise winning kill box.
      lastGold = s.gold
      h.dispatch({ type: 'repair_spire' })
      h.fastForward(0.2)
      continue
    }
    if (s.gold >= 2500 && s.towers.length > 0) {
      // Everything tier 3 and rich: pour the surplus into enhancements.
      lastGold = s.gold
      const sink = [...s.towers].sort(
        (a, b) => (a as unknown as { enhance: number }).enhance - (b as unknown as { enhance: number }).enhance,
      )[0]!
      h.dispatch({ type: 'upgrade_tower', id: sink.id })
      h.fastForward(0.2)
      continue
    }
    lastGold = -1
    h.dispatch({ type: 'start_wave' })
    h.fastForward(1)
  }
  const s = h.getState()
  return {
    phase: s.phase,
    wave: (s as unknown as { wave: number }).wave,
    towers: s.towers
      .map((t) => `${(t as unknown as { type: string }).type}${t.tier}@${t.cell.cx},${t.cell.cy}`)
      .join(' '),
    gold: s.gold,
    spireHp: s.spireHp,
    path: h
      .getMapInfo()
      .path.map((p) => `${p.cx},${p.cy}`)
      .join(' '),
  }
}

test('victory: an honest win dresses the screen in gold and names the first triumph', async ({ page }) => {
  const errors = await boot(page, 'e2e-victory')
  await page.locator('.hint-close').click()

  // A real victory, fast: max the account through the actual purchase path
  // (a granted spark hoard, then buyMeta over every node — Ashen Road skips
  // to wave 11), then a simple pilot playing only real commands: build a
  // kill box, take every relic, finish tier 3s, send waves. Deterministic
  // seed → deterministic outcome.
  const end = await page.evaluate(MAXED_PILOT, 'e2e-victory')
  expect(end, JSON.stringify(end)).toMatchObject({ phase: 'victory' })

  // The win must LOOK different from a loss: gold modal, rising embers, and
  // — on an account's very first victory — the named callout.
  await expect(page.getByTestId('run-over')).toBeVisible()
  await expect(page.locator('.modal.run-over.victory')).toBeVisible()
  await expect(page.locator('.modal.run-over h2')).toHaveText('THE SPIRE STANDS')
  await expect(page.getByTestId('victory-embers')).toBeVisible()
  await expect(page.getByTestId('first-victory')).toBeVisible()

  // The pilot took every relic offered — the Result tab must show the build
  // that carried the run.
  expect(await page.getByTestId('summary-relics').locator('.loadout-chip').count()).toBeGreaterThan(0)

  // Reduced motion kills the ember layer entirely — it's decoration.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.getByTestId('victory-embers')).not.toBeVisible()
  await expect(page.locator('.modal.run-over.victory')).toBeVisible() // the gold stays

  expect(errors).toEqual([])
})

// Same pilot, different worlds: each feature biome bends the rules (marsh
// forbids soft ground, slag heaps break the field, mesas add buildable high
// ground). The goal is REACH (well past the fresh-account wall), not victory
// — the win stays pinned to the tuned verdant seed; these prove the
// machinery isn't verdant-shaped.
for (const biome of ['frostfen', 'emberwaste', 'highlands'] as const) {
  test(`the pilot generalizes: a maxed account reaches deep waves on ${biome}`, async ({ page }) => {
    const errors = await boot(page, `e2e-${biome}-reach`)
    await page.evaluate((b) => localStorage.setItem('spirefall-map', b), biome)
    await page.reload()
    await page.waitForSelector('[data-testid="playfield"]')
    const end = await page.evaluate(MAXED_PILOT, `e2e-${biome}-reach`)
    expect(await page.evaluate(() => window.__harness.getState().biome)).toBe(biome)
    expect(end.wave, JSON.stringify(end)).toBeGreaterThanOrEqual(15)
    expect(errors).toEqual([])
  })
}

test('between-run keystone respec refunds Sparks, switches commitment and survives reload', async ({ page }) => {
  const errors = await boot(page, 'e2e-respec')
  await page.evaluate(() => {
    const meta = window.__harness.getMeta()
    meta.sparks = 20000
    for (let i=0; i<8; i++) window.__harness.buyMeta('tower_damage')
    window.__harness.buyMeta('ks_glassforge')
  })
  await clickMenu(page, 'open-tree')
  await page.getByTestId('gnode-ks_glassforge').click()
  const before = await page.evaluate(() => window.__harness.getMeta().sparks)
  await page.getByTestId('respec-ks_glassforge').click()
  await expect.poll(() => page.evaluate(() => window.__harness.getMeta().sparks)).toBe(before + 1200)
  await page.getByTestId('gnode-ks_bastion').click()
  await page.getByTestId('buy-ks_bastion').click()
  await page.keyboard.press('Escape')
  await page.reload()
  await page.getByTestId('playfield').waitFor()
  const upgrades = await page.evaluate(() => window.__harness.getMeta().upgrades)
  expect(upgrades.ks_glassforge ?? 0).toBe(0)
  expect(upgrades.ks_bastion).toBe(1)
  expect(errors).toEqual([])
})
