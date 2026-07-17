import { expect, test, type Page } from '@playwright/test'

// UI smoke suite (PLAN.md §5.7): deliberately shallow on game logic — that
// lives in the headless suites — but drives the REAL input path: buttons,
// canvas clicks, and the dev harness the way a playtester would. Runs are
// seeded through the harness so every assertion is deterministic.

const CELL = 34

declare global {
  interface Window {
    __harness: {
      getState: () => {
        phase: string
        wave: number
        gold: number
        towers: { id: number; tier: number }[]
        enemies: unknown[]
        relicOffer: unknown[] | null
      }
      snapshot: () => {
        tick: number
        phase: string
        wave: number
        gold: number
        spireHp: number
        towers: number
        enemies: number
        kills: number
        metaSparks: number
        runs: number
      }
      dispatch: (command: unknown) => void
      fastForward: (seconds: number) => void
      newRun: (seed?: string) => void
      setSpeed: (n: number) => void
      getSpeed: () => number
      reset: () => void
    }
  }
}

async function boot(page: Page, seed: string) {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(String(err)))
  await page.goto('/')
  await page.waitForSelector('[data-testid="playfield"]')
  await page.evaluate((s) => {
    localStorage.clear()
    window.__harness.newRun(s)
  }, seed)
  return errors
}

async function clickCell(page: Page, cx: number, cy: number) {
  const box = (await page.locator('[data-testid="playfield"]').boundingBox())!
  await page.mouse.click(box.x + cx * CELL + CELL / 2, box.y + cy * CELL + CELL / 2)
}

test('boots clean: canvas, HUD, and harness all present, no console errors', async ({ page }) => {
  const errors = await boot(page, 'e2e-boot')
  await expect(page.getByTestId('gold')).toContainText('200')
  await expect(page.getByTestId('spire-hp')).toContainText('10/10')
  await expect(page.getByTestId('wave-label')).toContainText('Wave 0/')
  await expect(page.getByTestId('start-wave')).toBeVisible()
  // The scouting report shows what wave 1 will field before it's sent.
  await expect(page.getByTestId('wave-preview')).toContainText('Next wave:')
  await expect(page.locator('.preview-unit').first()).toBeVisible()
  const snap = await page.evaluate(() => window.__harness.snapshot())
  expect(snap.phase).toBe('build')
  expect(errors).toEqual([])
})

test('placing a tower via real shop + canvas clicks spends gold', async ({ page }) => {
  const errors = await boot(page, 'e2e-place')
  await page.getByTestId('shop-arrow').click()
  await clickCell(page, 7, 5)
  await clickCell(page, 8, 5)
  await clickCell(page, 9, 5)
  await expect(page.getByTestId('gold')).toContainText('50')
  const snap = await page.evaluate(() => window.__harness.snapshot())
  expect(snap.towers).toBe(3)
  // Clicking a tower opens its panel; upgrade button is visible but too
  // expensive right now (50 gold left, upgrade costs 60).
  await page.keyboard.press('Escape')
  await clickCell(page, 7, 5)
  await expect(page.getByTestId('tower-panel')).toBeVisible()
  await expect(page.getByTestId('upgrade-tower')).toBeDisabled()
  expect(errors).toEqual([])
})

test('a defended wave plays out: enemies die, bounties arrive, build phase returns', async ({ page }) => {
  const errors = await boot(page, 'e2e-wave')
  // Four towers around the path mouth — the horde is dense, two won't hold.
  await page.getByTestId('shop-arrow').click()
  await clickCell(page, 4, 5)
  await clickCell(page, 4, 7)
  await clickCell(page, 5, 5)
  await clickCell(page, 5, 7)
  await page.getByTestId('start-wave').click()
  await page.evaluate(() => window.__harness.fastForward(120))
  const snap = await page.evaluate(() => window.__harness.snapshot())
  expect(snap.phase).toBe('build')
  expect(snap.wave).toBe(1)
  expect(snap.kills).toBeGreaterThan(5) // a horde died out there
  expect(snap.spireHp).toBeGreaterThanOrEqual(8) // a defended spire stays near-intact
  expect(errors).toEqual([])
})

test('the rogue-lite loop closes in the browser: defeat → sparks → spire tree → stronger next run', async ({
  page,
}) => {
  const errors = await boot(page, 'e2e-loop')
  // Mount a light defense — sparks pay for PROGRESS (waves cleared + kills),
  // so a totally undefended collapse would bank nothing to spend below.
  await page.getByTestId('shop-arrow').click()
  await clickCell(page, 4, 5)
  await clickCell(page, 4, 7)
  await clickCell(page, 5, 5)
  await clickCell(page, 5, 7)
  // Then send waves until the spire falls (fastForward is instant).
  await page.evaluate(() => {
    const send = () => {
      const s = window.__harness.getState()
      if (s.phase === 'build') window.__harness.dispatch({ type: 'start_wave' })
      window.__harness.fastForward(300)
      if (window.__harness.snapshot().phase !== 'defeat') send()
    }
    send()
  })
  await expect(page.getByTestId('run-over')).toBeVisible()
  const sparksText = await page.getByTestId('sparks-earned').textContent()
  expect(Number(sparksText!.replace(/\D/g, ''))).toBeGreaterThan(0)

  // Spend sparks on starting gold, then begin the next run.
  await page.getByTestId('buy-starting_gold').click()
  await page.getByTestId('next-run').click()
  const snap = await page.evaluate(() => window.__harness.snapshot())
  expect(snap.phase).toBe('build')
  expect(snap.wave).toBe(0)
  expect(snap.gold).toBe(230) // 200 base + 30 from War Chest level 1
  expect(snap.runs).toBe(1)
  expect(errors).toEqual([])
})

test('relic offers appear in the UI and apply on click', async ({ page }) => {
  const errors = await boot(page, 'e2e-relic-a')
  // Actually play: each build phase, buy/upgrade arrows, then send the wave —
  // waves are lethal enough now that a static two-tower setup dies before the
  // wave-5 relic offer.
  await page.evaluate(() => {
    // Freeze the real-time clock: every tick below comes from fastForward, so
    // the whole scripted playthrough is deterministic regardless of rAF timing.
    window.__harness.setSpeed(0)
    const spots = [
      [4, 5],
      [4, 7],
      [5, 5],
      [5, 7],
      [6, 5],
      [6, 7],
    ]
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
      window.__harness.fastForward(600)
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

test('an armed but unaffordable shop selection never traps you', async ({ page }) => {
  const errors = await boot(page, 'e2e-trap')
  // Spend everything: four arrows at 50 each leaves 0 gold with arrow armed.
  await page.getByTestId('shop-arrow').click()
  await clickCell(page, 4, 5)
  await clickCell(page, 4, 7)
  await clickCell(page, 5, 5)
  await clickCell(page, 5, 7)
  await expect.poll(async () => (await page.evaluate(() => window.__harness.snapshot())).gold).toBe(0)

  // The unaffordable card must still toggle the selection off...
  await expect(page.getByTestId('shop-arrow')).toBeEnabled()
  await page.getByTestId('shop-arrow').click()
  await clickCell(page, 4, 5)
  await expect(page.getByTestId('tower-panel')).toBeVisible() // click selects, not places

  // ...and clicking an existing tower while re-armed inspects it directly.
  await page.getByTestId('shop-arrow').click()
  await clickCell(page, 4, 7)
  await expect(page.getByTestId('tower-panel')).toBeVisible()
  const snap = await page.evaluate(() => window.__harness.snapshot())
  expect(snap.towers).toBe(4) // no phantom placements happened
  expect(errors).toEqual([])
})

test('give up ends the run, zero-progress abandons pay zero sparks, and high speeds are selectable', async ({
  page,
}) => {
  const errors = await boot(page, 'e2e-giveup')
  await page.getByRole('button', { name: '10×' }).click()
  expect(await page.evaluate(() => window.__harness.getSpeed())).toBe(10)

  page.on('dialog', (dialog) => dialog.accept())
  await page.getByTestId('abandon-run').click()
  await expect(page.getByTestId('run-over')).toBeVisible()
  // Exploit guard: giving up before clearing anything must earn NOTHING —
  // otherwise mashing "give up → next run" farms unlimited sparks.
  const sparksText = await page.getByTestId('sparks-earned').textContent()
  expect(Number(sparksText!.replace(/\D/g, ''))).toBe(0)
  await page.getByTestId('next-run').click()
  const snap = await page.evaluate(() => window.__harness.snapshot())
  expect(snap.phase).toBe('build')
  expect(snap.runs).toBe(1)
  expect(errors).toEqual([])
})

test.describe('touch', () => {
  test.use({ hasTouch: true })

  test('tower popups dismiss on touch: ✕ closes the panel, tooltips never stick', async ({ page }) => {
    const errors = await boot(page, 'e2e-touch')
    await page.getByTestId('shop-arrow').tap()
    const box = (await page.locator('[data-testid="playfield"]').boundingBox())!
    await page.touchscreen.tap(box.x + 7 * CELL + CELL / 2, box.y + 5 * CELL + CELL / 2)
    await expect.poll(async () => (await page.evaluate(() => window.__harness.snapshot())).towers).toBe(1)

    // Disarm, then tap the tower: the panel opens and no hover tooltip sticks.
    await page.getByTestId('shop-arrow').tap()
    await page.touchscreen.tap(box.x + 7 * CELL + CELL / 2, box.y + 5 * CELL + CELL / 2)
    await expect(page.getByTestId('tower-panel')).toBeVisible()
    await expect(page.getByTestId('tower-tooltip')).not.toBeVisible()

    // The ✕ button dismisses it...
    await page.getByTestId('close-tower-panel').tap()
    await expect(page.getByTestId('tower-panel')).not.toBeVisible()

    // ...and so does tapping empty ground, with no tooltip left behind.
    await page.touchscreen.tap(box.x + 7 * CELL + CELL / 2, box.y + 5 * CELL + CELL / 2)
    await expect(page.getByTestId('tower-panel')).toBeVisible()
    await page.touchscreen.tap(box.x + 10 * CELL + CELL / 2, box.y + 9 * CELL + CELL / 2)
    await expect(page.getByTestId('tower-panel')).not.toBeVisible()
    await expect(page.getByTestId('tower-tooltip')).not.toBeVisible()
    expect(errors).toEqual([])
  })
})

test.describe('mobile viewport', () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true })

  test('tower panel is a bottom sheet: buttons stay tappable over the shop', async ({ page }) => {
    const errors = await boot(page, 'e2e-mobile')
    await page.getByTestId('shop-arrow').tap()
    const box = (await page.locator('[data-testid="playfield"]').boundingBox())!
    const cell = box.width / 24 // canvas scales down; derive the cell size
    await page.touchscreen.tap(box.x + 7.5 * cell, box.y + 5.5 * cell)
    await expect.poll(async () => (await page.evaluate(() => window.__harness.snapshot())).towers).toBe(1)
    await page.getByTestId('shop-arrow').tap() // disarm
    await page.touchscreen.tap(box.x + 7.5 * cell, box.y + 5.5 * cell)
    await expect(page.getByTestId('tower-panel')).toBeVisible()

    // Playwright refuses to tap covered controls — these prove the panel
    // wins the stacking fight with the shop cards beneath it.
    await page.getByTestId('upgrade-tower').tap()
    await expect.poll(async () => (await page.evaluate(() => window.__harness.getState())).towers[0]!.tier).toBe(2)
    await page.getByTestId('close-tower-panel').tap()
    await expect(page.getByTestId('tower-panel')).not.toBeVisible()

    // With the sheet gone, the shop is interactive again.
    await page.getByTestId('shop-cannon').tap()
    await expect(page.getByTestId('shop-cannon')).toHaveClass(/selected/)
    expect(errors).toEqual([])
  })
})

test('keyboard shortcuts: 1 arms the arrow, U upgrades, X sells for a full refund', async ({ page }) => {
  const errors = await boot(page, 'e2e-keys')
  await page.keyboard.press('1') // arm the arrow tower
  await clickCell(page, 7, 5)
  await expect.poll(async () => (await page.evaluate(() => window.__harness.snapshot())).towers).toBe(1)
  await expect(page.getByTestId('gold')).toContainText('150')

  await page.keyboard.press('Escape') // disarm, then select the tower
  await clickCell(page, 7, 5)
  await expect(page.getByTestId('tower-panel')).toBeVisible()
  await page.keyboard.press('u')
  await expect.poll(async () => (await page.evaluate(() => window.__harness.getState())).towers[0]!.tier).toBe(2)

  await page.keyboard.press('x') // unfired: sell refunds every coin
  await expect.poll(async () => (await page.evaluate(() => window.__harness.snapshot())).towers).toBe(0)
  await expect(page.getByTestId('gold')).toContainText('200')
  expect(errors).toEqual([])
})

test('saves survive a reload mid-run', async ({ page }) => {
  const errors = await boot(page, 'e2e-save')
  await page.getByTestId('shop-cannon').click()
  await clickCell(page, 6, 5)
  await page.evaluate(() => {
    window.__harness.dispatch({ type: 'start_wave' })
    window.__harness.fastForward(300)
  })
  const before = await page.evaluate(() => window.__harness.snapshot())
  expect(before.phase).toBe('build')

  await page.reload()
  await page.waitForSelector('[data-testid="playfield"]')
  const after = await page.evaluate(() => window.__harness.snapshot())
  expect(after.wave).toBe(before.wave)
  expect(after.gold).toBe(before.gold)
  expect(after.towers).toBe(before.towers)
  expect(after.spireHp).toBe(before.spireHp)
  expect(errors).toEqual([])
})

test('settings: volume and reduced motion persist across reloads', async ({ page }) => {
  const errors = await boot(page, 'e2e-settings')
  await page.getByTestId('open-settings').click()
  await expect(page.getByTestId('settings-modal')).toBeVisible()
  await page.getByTestId('volume-slider').fill('40')
  await page.getByTestId('reduced-motion').check()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('settings-modal')).not.toBeVisible()

  await page.reload()
  await page.waitForSelector('[data-testid="playfield"]')
  await page.keyboard.press('?') // keyboard route in
  await expect(page.getByTestId('settings-modal')).toBeVisible()
  await expect(page.getByTestId('volume-slider')).toHaveValue('40')
  await expect(page.getByTestId('reduced-motion')).toBeChecked()
  expect(errors).toEqual([])
})
