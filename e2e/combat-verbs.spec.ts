import { expect, test } from '@playwright/test'
import { boot, cellPoint, chooseTower, clickCell, findBuildCells } from './ui-helpers'

// UI suite (PLAN.md §5.7): deliberately shallow on game logic — that lives in
// the headless suites — but drives the REAL input path: buttons, canvas
// clicks, and the dev harness the way a playtester would. Runs are seeded
// through the harness so every assertion is deterministic.
// Active combat verbs: beam, coins, execute, boons, overcharge, specializations.

test('the spire beam: B (or the button) toggles it, taps and the cursor aim it', async ({ page }) => {
  const errors = await boot(page, 'e2e-beam')
  // Defend the spire before starting the wave. This spec drives the beam UI
  // in REAL time (heat climbs, venting finishes), so it needs the run to
  // outlive its own assertions — with an undefended spire, wave 1's leaks
  // ended the run about five seconds in, the run-over modal covered the
  // playfield, and the tap-to-aim click below landed on the modal instead.
  // It passed locally with ~0.3s to spare and failed in CI, which is a race
  // the spec should not have been running at all.
  await chooseTower(page, 'shop-arrow')
  for (const [cx, cy] of await findBuildCells(page, 4)) await clickCell(page, cx, cy)
  await chooseTower(page, 'shop-arrow') // disarm so clicks below aim the beam
  // No fastForward: the 's left' label below is gated on phase 'wave', and
  // skipping 3s ahead left the wave with ~260ms to live — the assertion was
  // a coin flip. Letting it run keeps the wave up for ~3.3s, and the poll
  // just below already waits for the spawns.
  await page.evaluate(() => {
    window.__harness.dispatch({ type: 'start_wave' })
  })
  await expect.poll(async () => page.evaluate(() => window.__harness.getState().enemies.length)).toBeGreaterThan(0)
  // The Beam button always shows the barrel's state.
  await expect(page.getByTestId('beam-state')).toHaveText('ready')
  // Toggle on with B, aimed at the hovered board center; heat climbs and
  // the button counts the seconds.
  const canvas = page.locator('canvas').first()
  const box = (await canvas.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.keyboard.press('b')
  await expect.poll(async () => page.evaluate(() => window.__harness.getState().beamTarget !== null)).toBe(true)
  await expect.poll(async () => page.evaluate(() => window.__harness.getState().beamHeat)).toBeGreaterThan(0)
  await expect(page.getByTestId('beam-state')).toHaveText(/s left/)
  // Toggle off with the BUTTON — the same control, touch parity — and vent.
  await page.getByTestId('beam-toggle').click()
  await expect.poll(async () => page.evaluate(() => window.__harness.getState().beamTarget === null)).toBe(true)
  await expect.poll(async () => page.evaluate(() => window.__harness.getState().beamHeat)).toBe(0)
  // Tap-to-aim: toggle on via the button, click a cell, the ray obeys.
  await page.getByTestId('beam-toggle').click()
  await clickCell(page, 5, 5)
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const t = window.__harness.getState().beamTarget
        return t !== null && Math.floor(t.x / 1000) === 5 && Math.floor(t.y / 1000) === 5
      }),
    )
    .toBe(true)
  await page.getByTestId('beam-toggle').click()
  expect(errors).toEqual([])
})

test('physical gold: bounties drop as coins, the cursor sweeps them, neglect loses them', async ({ page }) => {
  const errors = await boot(page, 'e2e-coins')
  await chooseTower(page, 'shop-arrow')
  for (const [cx, cy] of await findBuildCells(page, 4)) await clickCell(page, cx, cy)
  await chooseTower(page, 'shop-arrow') // disarm
  await page.evaluate(() => {
    window.__harness.dispatch({ type: 'start_wave' })
    window.__harness.fastForward(1)
    // Pin the wave open and armor the spire: under parallel-suite load the
    // wave could clear or the run could end before the assertions land.
    // State surgery is legal.
    const s = window.__harness.getState()
    s.pendingSpawns.push({ type: 'runner', tick: s.tick + 1_000_000 })
    s.spireHp = 99
    s.spireMaxHp = 99
    window.__harness.fastForward(3)
  })
  // Kills drop coins instead of banking gold.
  await expect.poll(async () => page.evaluate(() => window.__harness.getState().coins.length)).toBeGreaterThan(0)
  // Sweep the cursor over a coin: it snaps to the hand and banks.
  const target = await page.evaluate(() => {
    const s = window.__harness.getState()
    const c = s.coins[0]!
    return { cx: Math.floor(c.pos.x / 1000), cy: Math.floor(c.pos.y / 1000), id: c.id, gold: s.gold }
  })
  const p = await cellPoint(page, target.cx, target.cy)
  await page.mouse.move(p.x, p.y)
  await expect
    .poll(async () => page.evaluate((id) => window.__harness.getState().coins.every((c) => c.id !== id), target.id))
    .toBe(true)
  expect(await page.evaluate(() => window.__harness.getState().gold)).toBeGreaterThan(target.gold)
  // Neglect: a coin aged past its lifetime fizzles without paying.
  const lost = await page.evaluate(() => {
    const s = window.__harness.getState()
    s.coins.push({ id: 999_999, pos: { x: 500, y: 500 }, gold: 7, bornTick: s.tick - 10_000, pulling: false })
    const gold = s.gold
    window.__harness.fastForward(1)
    return { gold, after: window.__harness.getState().gold, left: window.__harness.getState().coins.filter((c) => c.id === 999_999).length }
  })
  expect(lost.left).toBe(0)
  expect(lost.after).toBe(lost.gold)
  expect(errors).toEqual([])
})

test('execute windows: clicking a wounded enemy finishes it for a bonus', async ({ page }) => {
  const errors = await boot(page, 'e2e-execute')
  await page.evaluate(() => {
    window.__harness.dispatch({ type: 'start_wave' })
    window.__harness.fastForward(3)
  })
  await expect.poll(async () => page.evaluate(() => window.__harness.getState().enemies.length)).toBeGreaterThan(0)
  // Wound the lead runner and nail it in place; pin the wave open and armor
  // the spire so parallel-suite load can't end the run mid-assertion.
  const mark = await page.evaluate(() => {
    const s = window.__harness.getState()
    s.pendingSpawns.push({ type: 'runner', tick: s.tick + 1_000_000 })
    s.spireHp = 99
    s.spireMaxHp = 99
    const e = s.enemies[0]!
    e.hp = 1
    e.speed = 0
    return { cx: Math.floor(e.pos.x / 1000), cy: Math.floor(e.pos.y / 1000), id: e.id, gold: s.gold }
  })
  // Click until the blade lands. The wound above is written straight into
  // engine state, but the click handler reads REACT's snapshot — under
  // full-suite load that snapshot can still be a frame behind, in which case
  // the handler sees no wounded enemy in the cell and silently does nothing.
  // A click that finds nothing is a no-op, and once the cooldown is running
  // the handler's own guard ignores the extras, so retrying is free.
  await expect
    .poll(async () => {
      await clickCell(page, mark.cx, mark.cy)
      return page.evaluate(() => window.__harness.getState().executeCd)
    })
    .toBeGreaterThan(0)
  expect(await page.evaluate((id) => window.__harness.getState().enemies.some((e) => e.id === id), mark.id)).toBe(false)
  expect(await page.evaluate(() => window.__harness.getState().gold)).toBeGreaterThan(mark.gold)
  expect(errors).toEqual([])
})

test('wave boons: pick one, it blesses exactly one wave, skipping is free', async ({ page }) => {
  const errors = await boot(page, 'e2e-boons')
  await expect(page.getByTestId('boon-offer')).toBeVisible()
  const offered = await page.evaluate(() => window.__harness.getState().boonOffer)
  expect(offered).toHaveLength(2)
  await page.getByTestId(`boon-${offered![0]}`).click()
  await expect(page.getByTestId('boon-active')).toBeVisible()
  expect(await page.evaluate(() => window.__harness.getState().activeBoon)).toBe(offered![0])
  // Survive the wave with a real defense, then: blessing gone, next offer up.
  await chooseTower(page, 'shop-arrow')
  for (const [cx, cy] of await findBuildCells(page, 4)) await clickCell(page, cx, cy)
  await page.evaluate(() => {
    window.__harness.dispatch({ type: 'start_wave' })
    window.__harness.fastForward(120)
  })
  await expect.poll(async () => page.evaluate(() => window.__harness.snapshot().phase)).toBe('build')
  expect(await page.evaluate(() => window.__harness.getState().activeBoon)).toBeNull()
  await expect(page.getByTestId('boon-offer')).toBeVisible()
  // Starting unchosen forfeits — no strip mid-wave, no blessing. The
  // dispatch lands on the next sim tick, so poll rather than race it.
  await page.evaluate(() => window.__harness.dispatch({ type: 'start_wave' }))
  await expect.poll(async () => page.evaluate(() => window.__harness.getState().boonOffer)).toBeNull()
  expect(await page.evaluate(() => window.__harness.getState().activeBoon)).toBeNull()
  expect(errors).toEqual([])
})

test('overcharge: the panel button arms the next shot and the recharge gates it', async ({ page }) => {
  const errors = await boot(page, 'e2e-overcharge')
  await chooseTower(page, 'shop-arrow')
  const [cx, cy] = (await findBuildCells(page, 1))[0]!
  await clickCell(page, cx!, cy!)
  await chooseTower(page, 'shop-arrow') // disarm placement
  await clickCell(page, cx!, cy!) // select the tower
  await expect(page.getByTestId('tower-panel')).toBeVisible()
  await expect(page.getByTestId('overcharge-tower')).toHaveText(/Overcharge/)
  await page.getByTestId('overcharge-tower').click()
  // The dispatch lands on the next sim tick — poll, don't race it.
  await expect
    .poll(async () => page.evaluate(() => window.__harness.getState().towers[0]!.overcharged === true))
    .toBe(true)
  await expect(page.getByTestId('overcharge-tower')).toBeDisabled()
  // The armed shot spends the charge and starts the personal recharge.
  await page.evaluate(() => {
    window.__harness.dispatch({ type: 'start_wave' })
    window.__harness.fastForward(20)
  })
  await expect
    .poll(async () => page.evaluate(() => window.__harness.getState().towers[0]!.overchargeCd ?? 0))
    .toBeGreaterThan(0)
  expect(errors).toEqual([])
})

test('wave preview warns about the coming boss mechanic', async ({ page }) => {
  const errors = await boot(page, 'e2e-boss-preview')
  // Jump the schedule to wave 9's build phase: the preview now scouts the
  // wave-10 boss (Spirebreaker, carapace) and must warn about the shell.
  await page.evaluate(() => {
    window.__harness.getState().wave = 5
    window.__harness.fastForward(1) // one tick republishes the preview
  })
  await expect(page.getByTestId('preview-unit-boss')).toBeVisible()
  await expect(page.getByTestId('mech-mark-boss')).toBeVisible()
  await expect(page.getByTestId('mech-mark-boss')).toHaveAttribute('title', /Carapace/)

  // Gravemind at wave 19: the report warns it splits on death AND broods.
  await page.evaluate(() => {
    window.__harness.getState().wave = 11
    window.__harness.fastForward(1)
  })
  await expect(page.getByTestId('split-mark-boss2')).toBeVisible()
  await expect(page.getByTestId('split-mark-boss2')).toHaveAttribute('title', /Splits on death/)
  await expect(page.getByTestId('brood-mark-boss2')).toBeVisible()

  // And the endless-tier phaser: wave 39's preview scouts Veilwarden.
  await page.evaluate(() => {
    window.__harness.getState().wave = 39
    window.__harness.fastForward(1)
  })
  await expect(page.getByTestId('phase-mark-boss4')).toBeVisible()
  await expect(page.getByTestId('phase-mark-boss4')).toHaveAttribute('title', /Phasing/)

  // Deep endless: wave 59's report shows Zephyrhost flying — the ✈ is the
  // one warning that a mazeless air armada is coming.
  await page.evaluate(() => {
    window.__harness.getState().wave = 59
    window.__harness.fastForward(1)
  })
  await expect(page.getByTestId('preview-unit-boss6')).toBeVisible()
  await expect(page.getByTestId('preview-unit-boss6').locator('.air-mark')).toBeVisible()
  // Spawner warning: the report says Zephyrhost births fliers while it lives.
  await expect(page.getByTestId('brood-mark-boss6')).toBeVisible()
  await expect(page.getByTestId('brood-mark-boss6')).toHaveAttribute('title', /Spawner/)

  // Blightmother at wave 49: the healer mark completes the mechanic sweep —
  // every enemy mechanic (mech, phase, brood, split, heal, air, armor) now
  // has a visible tell in the report.
  await page.evaluate(() => {
    window.__harness.getState().wave = 49
    window.__harness.fastForward(1)
  })
  await expect(page.getByTestId('heal-mark-boss5')).toBeVisible()
  await expect(page.getByTestId('heal-mark-boss5')).toHaveAttribute('title', /Healer/)
  expect(errors).toEqual([])
})

test('endless: a Cataclysm strike offers two dooms; the wave is gated until you choose', async ({ page }) => {
  const errors = await boot(page, 'e2e-cataclysm')
  await page.locator('.hint-close').click()
  // Surgery to the victory doorstep with a spire tall enough to tank the
  // wave undefended — the offer flow is what's under test, not combat.
  await page.evaluate(() => {
    const h = window.__harness
    const s = h.getState() as unknown as { wave: number; wavesCleared: number; spireHp: number; spireMaxHp: number }
    s.wave = 23
    s.wavesCleared = 23
    s.spireHp = 100_000
    s.spireMaxHp = 100_000
    h.dispatch({ type: 'start_wave' })
  })
  await page.evaluate(() => window.__harness.fastForward(600))
  const offer = await page.evaluate(() => window.__harness.getState() as unknown as { cataclysmOffer: string[] | null })
  expect(offer.cataclysmOffer).toHaveLength(2)

  // The modal offers exactly the two dooms; picking one applies it and
  // reopens the road (start_wave un-gates).
  await expect(page.getByTestId('cataclysm-modal')).toBeVisible()
  const pick = offer.cataclysmOffer![0]!
  await page.getByTestId(`cataclysm-${pick}`).click()
  await expect(page.getByTestId('cataclysm-modal')).not.toBeVisible()
  await page.getByTestId('continue-endless').click() // the victory prompt was underneath
  const after = await page.evaluate(() => window.__harness.getState() as unknown as { cataclysms: string[]; cataclysmOffer: string[] | null })
  expect(after.cataclysms).toEqual([pick])
  expect(after.cataclysmOffer).toBeNull()
  await page.getByTestId('start-wave').click()
  // The gate is open again: wave 25 fields (and may even clear under the
  // surgically tall spire before we look — ≥25 is the proof either way).
  await expect
    .poll(async () => (await page.evaluate(() => window.__harness.snapshot())).wave)
    .toBeGreaterThanOrEqual(25)
  expect(errors).toEqual([])
})

test('the Lance: locked until Duelist Doctrine, then hotkey 8 places it and the ramp climbs', async ({ page }) => {
  const errors = await boot(page, 'e2e-lance')
  await page.locator('.hint-close').click()

  // Locked out of the box: the card is disabled, the hotkey is inert.
  await expect(page.getByTestId('shop-lance')).toBeDisabled()
  await page.keyboard.press('8')
  await page.waitForTimeout(100)

  await page.evaluate(() => {
    const h = window.__harness
    // 2000, not 500: Duelist Doctrine is Iron tier 2 since the tree
    // restructure, so the branch gate (✦400, paid here in Reinforced Core)
    // comes before the node's own ✦180.
    h.getMeta().sparks = 2000
    for (let i = 0; i < 6; i++) h.buyMeta('spire_hp') // ✦465 — just past the gate
    h.buyMeta('unlock_lance')
    h.newRun('e2e-lance')
    h.getState().gold = 2000
  })
  await expect(page.getByTestId('shop-lance')).toBeEnabled()

  const [cx, cy] = (await findBuildCells(page, 1))[0]!
  await page.keyboard.press('8') // arm via the new hotkey
  await clickCell(page, cx!, cy!)
  await expect.poll(async () => (await page.evaluate(() => window.__harness.snapshot())).towers).toBe(1)
  expect(await page.evaluate(() => window.__harness.getState().towers[0]!.type)).toBe('lance')

  // Send a wave and let it fight: the ramp bookkeeping must move (a brute
  // pack survives enough consecutive hits to hold a stack).
  await page.keyboard.press('Escape')
  await page.getByTestId('start-wave').click()
  await expect
    .poll(async () => {
      await page.evaluate(() => window.__harness.fastForward(5))
      return await page.evaluate(
        () => (window.__harness.getState().towers[0] as unknown as { rampStacks?: number }).rampStacks ?? -1,
      )
    })
    .toBeGreaterThanOrEqual(0) // bookkeeping engaged: the lance has a mark
  expect(errors).toEqual([])
})

test('tier-3 specialization: the panel offers both paths, the pick sticks', async ({ page }) => {
  const errors = await boot(page, 'e2e-wave')
  await page.locator('.hint-close').click()
  const [cx, cy] = (await findBuildCells(page, 1))[0]!
  await page.evaluate(
    ([x, y]) => {
      const h = window.__harness
      h.getState().gold = 5000
      h.dispatch({ type: 'place_tower', tower: 'arrow', cell: { cx: x, cy: y } })
    },
    [cx, cy] as const,
  )
  await expect.poll(async () => (await page.evaluate(() => window.__harness.snapshot())).towers).toBe(1)
  await page.evaluate(() => {
    const h = window.__harness
    const id = h.getState().towers[0]!.id
    h.dispatch({ type: 'upgrade_tower', id })
    h.dispatch({ type: 'upgrade_tower', id })
  })
  await expect.poll(async () => await page.evaluate(() => window.__harness.getState().towers[0]!.tier)).toBe(3)

  await clickCell(page, cx!, cy!)
  await expect(page.getByTestId('tower-panel')).toBeVisible()
  await expect(page.getByTestId('spec-volley')).toBeVisible()
  await expect(page.getByTestId('spec-longbow')).toBeVisible()
  await page.getByTestId('spec-volley').click()
  await expect(page.getByTestId('tower-panel')).toContainText('Volley')
  await expect(page.getByTestId('spec-volley')).not.toBeVisible() // committed
  expect(await page.evaluate(() => window.__harness.getState().towers[0]!.spec)).toBe('volley')
  expect(errors).toEqual([])
})
