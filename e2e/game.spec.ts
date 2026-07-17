import { expect, test, type Page } from '@playwright/test'

// UI smoke suite (PLAN.md §5.7): deliberately shallow on game logic — that
// lives in the headless suites — but drives the REAL input path: buttons,
// canvas clicks, and the dev harness the way a playtester would. Runs are
// seeded through the harness so every assertion is deterministic.

// Logical grid dimensions (src/data/maps.ts). Cell pixel size is derived
// from the live bounding box on every click — the canvas is responsive, so
// a hardcoded pixel size drifts whenever layout shifts (fonts, hint banner).
const MAP_W = 24
const MAP_H = 14

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
      getReplay: () => { seed: string; log: unknown[] }
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

async function cellPoint(page: Page, cx: number, cy: number) {
  const box = (await page.locator('[data-testid="playfield"]').boundingBox())!
  return { x: box.x + ((cx + 0.5) * box.width) / MAP_W, y: box.y + ((cy + 0.5) * box.height) / MAP_H }
}

async function clickCell(page: Page, cx: number, cy: number) {
  const p = await cellPoint(page, cx, cy)
  await page.mouse.click(p.x, p.y)
}

async function tapCell(page: Page, cx: number, cy: number) {
  const p = await cellPoint(page, cx, cy)
  await page.touchscreen.tap(p.x, p.y)
}

test('deep links: ?seed starts that exact run, ?daily starts the shared seed', async ({ page }) => {
  await page.goto('/?seed=challenge-me')
  await page.waitForSelector('[data-testid="playfield"]')
  expect(await page.evaluate(() => window.__harness.getReplay().seed)).toBe('challenge-me')
  // The param is stripped so a reload resumes normally instead of restarting.
  expect(await page.evaluate(() => window.location.search)).toBe('')

  await page.goto('/?daily=1')
  await page.waitForSelector('[data-testid="playfield"]')
  const seed = await page.evaluate(() => window.__harness.getReplay().seed)
  expect(seed).toMatch(/^daily-\d{4}-\d{2}-\d{2}$/)
})

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
  // Commands apply on the session's next animation frame — poll the count
  // first. (An early toContainText('50') would match the transient '150'.)
  await expect.poll(async () => (await page.evaluate(() => window.__harness.snapshot())).towers).toBe(3)
  await expect(page.getByTestId('gold')).toHaveText(/^⛀ 50$/)
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

  // Mid-run stats: the S key opens live analytics with a sparks estimate.
  await page.keyboard.press('s')
  await expect(page.getByTestId('run-stats')).toBeVisible()
  const statsSparks = await page.getByTestId('stats-sparks').textContent()
  expect(Number(statsSparks!.replace(/\D/g, ''))).toBeGreaterThan(0)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('run-stats')).not.toBeVisible()
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

  // The replay button exposes seed + the full command log as JSON.
  await page.getByTestId('copy-replay').click()
  const replay = JSON.parse(await page.getByTestId('replay-json').inputValue()) as {
    seed: string
    log: { command: { type: string } }[]
  }
  expect(replay.seed).toBe('e2e-loop')
  expect(replay.log.some((c) => c.command.type === 'place_tower')).toBe(true)
  expect(replay.log.some((c) => c.command.type === 'start_wave')).toBe(true)

  // Spend sparks on starting gold, pick a battlefield, then begin the next run.
  await page.getByTestId('buy-starting_gold').click()
  await page.getByTestId('map-select').selectOption('3')
  await page.getByTestId('trial-select').selectOption('glass_spire')
  await page.getByTestId('next-run').click()
  expect(await page.evaluate(() => window.__harness.getState().mapId)).toBe(3)
  const trialState = await page.evaluate(() => {
    const s = window.__harness.getState()
    return { trials: s.trials, maxHp: s.spireMaxHp }
  })
  expect(trialState.trials).toEqual(['glass_spire'])
  await expect(page.getByTestId('trials')).toContainText('Glass Spire')
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
    await tapCell(page, 7, 5)
    await expect.poll(async () => (await page.evaluate(() => window.__harness.snapshot())).towers).toBe(1)

    // Disarm, then tap the tower: the panel opens and no hover tooltip sticks.
    await page.getByTestId('shop-arrow').tap()
    await tapCell(page, 7, 5)
    await expect(page.getByTestId('tower-panel')).toBeVisible()
    await expect(page.getByTestId('tower-tooltip')).not.toBeVisible()

    // The ✕ button dismisses it...
    await page.getByTestId('close-tower-panel').tap()
    await expect(page.getByTestId('tower-panel')).not.toBeVisible()

    // ...and so does tapping empty ground, with no tooltip left behind.
    await tapCell(page, 7, 5)
    await expect(page.getByTestId('tower-panel')).toBeVisible()
    await tapCell(page, 10, 9)
    await expect(page.getByTestId('tower-panel')).not.toBeVisible()
    await expect(page.getByTestId('tower-tooltip')).not.toBeVisible()
    expect(errors).toEqual([])
  })
})

// Standard-viewport layout matrix: the standing guard against layout
// regressions on real device sizes. For every viewport: the document must
// never overflow horizontally (an overflowing child lets the whole page pan
// sideways on touch), and every HUD control must sit fully on screen —
// at boot, with the tower panel open, and during a live wave.
const STANDARD_VIEWPORTS: [string, number, number][] = [
  ['phone-small', 375, 667],
  ['phone', 390, 844],
  ['phone-large', 412, 915],
  ['tablet-portrait', 768, 1024],
  ['tablet-landscape', 1024, 768],
  ['desktop', 1280, 720],
]

const HUD_CONTROLS = [
  'mute',
  'daily-run',
  'open-stats',
  'open-tree',
  'open-settings',
  'abandon-run',
  'start-wave',
  'auto-start',
  'repair-spire',
  'shop-arrow',
  'shop-beacon', // the LAST tower card: all seven must share the row, never scroll off-edge
]

for (const [name, width, height] of STANDARD_VIEWPORTS) {
  test.describe(`layout @ ${name} (${width}×${height})`, () => {
    test.use({ viewport: { width, height } })

    test('no horizontal overflow; every control fully on screen', async ({ page }) => {
      // Same seed everywhere: the map (and thus buildable cells) stays
      // fixed, so the viewport is the only variable under test.
      const errors = await boot(page, 'e2e-wave')
      await page.locator('.hint-close').click()

      const assertLayout = async (phase: string) => {
        const m = await page.evaluate(() => ({
          scrollW: document.documentElement.scrollWidth,
          innerW: window.innerWidth,
        }))
        expect(m.scrollW, `${phase}: page overflows horizontally`).toBeLessThanOrEqual(m.innerW)
        for (const id of HUD_CONTROLS) {
          const box = await page.getByTestId(id).boundingBox()
          expect(box, `${phase}: ${id} not rendered`).not.toBeNull()
          expect(box!.x, `${phase}: ${id} clipped left`).toBeGreaterThanOrEqual(-0.5)
          expect(box!.x + box!.width, `${phase}: ${id} clipped right`).toBeLessThanOrEqual(width + 0.5)
        }
        // Every tower name must render whole — an ellipsized shop card means
        // the compact layout no longer fits this viewport.
        const clipped = await page.evaluate(() =>
          [...document.querySelectorAll('.shop-card-name')]
            .filter((el) => el.scrollWidth > el.clientWidth + 0.5)
            .map((el) => el.textContent),
        )
        expect(clipped, `${phase}: tower names ellipsized`).toEqual([])
      }

      await assertLayout('build phase')

      // Tower panel open (a bottom sheet on phones) must not break layout.
      await page.getByTestId('shop-arrow').click()
      await clickCell(page, 4, 5)
      await expect.poll(async () => (await page.evaluate(() => window.__harness.snapshot())).towers).toBe(1)
      await page.getByTestId('shop-arrow').click() // disarm
      await clickCell(page, 4, 5)
      await expect(page.getByTestId('tower-panel')).toBeVisible()
      const panel = (await page.getByTestId('tower-panel').boundingBox())!
      expect(panel.x, 'tower panel clipped left').toBeGreaterThanOrEqual(-0.5)
      expect(panel.x + panel.width, 'tower panel clipped right').toBeLessThanOrEqual(width + 0.5)
      await assertLayout('tower panel open')
      await page.keyboard.press('Escape')

      // Mid-wave (start-wave disabled, live-status strip) must hold too.
      await page.getByTestId('start-wave').click()
      await expect(page.getByTestId('start-wave')).toBeDisabled()
      await assertLayout('wave live')
      expect(errors).toEqual([])
    })
  })
}

test.describe('tablet portrait', () => {
  test.use({ viewport: { width: 768, height: 1024 } })

  test('the playfield never shifts across phase transitions', async ({ page }) => {
    // iPad-portrait regression: the start-wave button used to unmount during
    // waves and the scouting strip vanished, re-wrapping the header — the
    // playfield jumped every wave. Both are now constant-presence.
    const errors = await boot(page, 'e2e-tablet')
    await page.locator('.hint-close').click() // the one-time hint banner is a legitimate shift; remove it
    await page.getByTestId('shop-arrow').click()
    await clickCell(page, 4, 5)
    await clickCell(page, 4, 7)
    await expect.poll(async () => (await page.evaluate(() => window.__harness.snapshot())).towers).toBe(2)

    const before = (await page.locator('[data-testid="playfield"]').boundingBox())!
    await page.getByTestId('start-wave').click()
    await expect(page.getByTestId('start-wave')).toBeDisabled() // still mounted, just disabled
    const during = (await page.locator('[data-testid="playfield"]').boundingBox())!
    expect(during.y).toBe(before.y)

    await page.evaluate(() => window.__harness.fastForward(120)) // clear wave 1
    await expect(page.getByTestId('start-wave')).toBeEnabled()
    const after = (await page.locator('[data-testid="playfield"]').boundingBox())!
    expect(after.y).toBe(before.y)
    expect(errors).toEqual([])
  })
})

test.describe('mobile viewport', () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true })

  test('tower panel is a bottom sheet: buttons stay tappable over the shop', async ({ page }) => {
    const errors = await boot(page, 'e2e-mobile')
    await page.getByTestId('shop-arrow').tap()
    await tapCell(page, 7, 5)
    await expect.poll(async () => (await page.evaluate(() => window.__harness.snapshot())).towers).toBe(1)
    await page.getByTestId('shop-arrow').tap() // disarm
    await tapCell(page, 7, 5)
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
  await page.getByTestId('haptics').uncheck() // defaults on; the off choice must stick
  await page.getByTestId('color-assist').check()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('settings-modal')).not.toBeVisible()

  await page.reload()
  await page.waitForSelector('[data-testid="playfield"]')
  await page.keyboard.press('?') // keyboard route in
  await expect(page.getByTestId('settings-modal')).toBeVisible()
  await expect(page.getByTestId('volume-slider')).toHaveValue('40')
  await expect(page.getByTestId('reduced-motion')).toBeChecked()
  await expect(page.getByTestId('haptics')).not.toBeChecked()
  await expect(page.getByTestId('color-assist')).toBeChecked()
  expect(errors).toEqual([])
})

test('PWA surface: manifest and service worker are served and coherent', async ({ page, request }) => {
  await page.goto('/')
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(manifestHref).toBe('./manifest.webmanifest')
  const manifest = await request.get('/manifest.webmanifest')
  expect(manifest.ok()).toBe(true)
  const data = await manifest.json()
  expect(data.name).toBe('Spirefall')
  for (const icon of data.icons) {
    const res = await request.get(`/${icon.src.replace('./', '')}`)
    expect(res.ok(), icon.src).toBe(true)
  }
  const sw = await request.get('/sw.js')
  expect(sw.ok()).toBe(true)
})

test('save transfer: export a code, wipe, import restores progress', async ({ page }) => {
  const errors = await boot(page, 'e2e-transfer')
  await page.getByTestId('shop-arrow').click()
  await clickCell(page, 7, 5)
  await expect.poll(async () => (await page.evaluate(() => window.__harness.snapshot())).towers).toBe(1)

  await page.getByTestId('open-settings').click()
  await page.getByTestId('export-save').click()
  const code = await page.getByTestId('transfer-code').inputValue()
  expect(code.length).toBeGreaterThan(50)

  // Nuke everything, then import the code back.
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.waitForSelector('[data-testid="playfield"]')
  expect((await page.evaluate(() => window.__harness.snapshot())).towers).toBe(0)
  page.on('dialog', (d) => d.accept())
  await page.getByTestId('open-settings').click()
  await page.getByTestId('transfer-code').fill(code)
  await page.getByTestId('import-save').click()
  await page.waitForSelector('[data-testid="playfield"]')
  await expect.poll(async () => (await page.evaluate(() => window.__harness.snapshot())).towers).toBe(1)

  // Garbage codes are rejected without nuking anything.
  await page.getByTestId('open-settings').click()
  await page.getByTestId('transfer-code').fill('not-a-save')
  await page.getByTestId('import-save').click()
  await expect(page.getByTestId('import-failed')).toBeVisible()
  expect(errors).toEqual([])
})

test('first-run hints guide placement, then retire forever', async ({ page }) => {
  const errors = await boot(page, 'e2e-hints')
  await expect(page.getByTestId('hint')).toContainText('Pick a tower')
  await page.getByTestId('shop-arrow').click()
  await clickCell(page, 7, 5)
  await clickCell(page, 8, 5)
  await expect(page.getByTestId('hint')).toContainText('Send the wave')
  // Dismiss kills hints permanently, across reloads.
  await page.locator('.hint-close').click()
  await expect(page.getByTestId('hint')).not.toBeVisible()
  await page.reload()
  await page.waitForSelector('[data-testid="playfield"]')
  await expect(page.getByTestId('hint')).not.toBeVisible()
  expect(errors).toEqual([])
})

test('auto-advance sends the next wave by itself', async ({ page }) => {
  const errors = await boot(page, 'e2e-auto')
  await page.getByTestId('shop-arrow').click()
  for (const [cx, cy] of [[4, 5], [4, 7], [5, 5], [5, 7]]) {
    await clickCell(page, cx!, cy!)
  }
  await page.getByTestId('auto-start').click()
  await page.getByTestId('start-wave').click()
  await page.evaluate(() => window.__harness.fastForward(120)) // clear wave 1
  // Without touching anything, wave 2 should start on its own.
  await expect.poll(async () => (await page.evaluate(() => window.__harness.snapshot())).wave, { timeout: 8000 }).toBe(2)
  expect(errors).toEqual([])
})

test('daily run: shared date seed, best-of-today recorded', async ({ page }) => {
  const errors = await boot(page, 'e2e-daily')
  page.on('dialog', (d) => d.accept())
  await page.getByTestId('daily-run').click()
  const today = new Date().toISOString().slice(0, 10)
  await expect.poll(async () => await page.evaluate(() => window.__harness.getReplay().seed)).toBe(`daily-${today}`)

  // Die undefended; the daily best (0 waves is still a record) is stored.
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
  const stored = await page.evaluate(() => localStorage.getItem('spirefall-daily'))
  expect(JSON.parse(stored!).date).toBe(today)
  expect(errors).toEqual([])
})
