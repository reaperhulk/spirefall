import { expect, test, type Page } from '@playwright/test'

// UI smoke suite (PLAN.md §5.7): deliberately shallow on game logic — that
// lives in the headless suites — but drives the REAL input path: buttons,
// canvas clicks, and the dev harness the way a playtester would. Runs are
// seeded through the harness so every assertion is deterministic.

const CELL = 34

declare global {
  interface Window {
    __harness: {
      getState: () => { phase: string; wave: number; gold: number; towers: { id: number }[]; enemies: unknown[] }
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
  await expect(page.getByTestId('gold')).toContainText('100')
  await expect(page.getByTestId('spire-hp')).toContainText('100/100')
  await expect(page.getByTestId('wave-label')).toContainText('Wave 0/44')
  await expect(page.getByTestId('start-wave')).toBeVisible()
  const snap = await page.evaluate(() => window.__harness.snapshot())
  expect(snap.phase).toBe('build')
  expect(errors).toEqual([])
})

test('placing a tower via real shop + canvas clicks spends gold', async ({ page }) => {
  const errors = await boot(page, 'e2e-place')
  await page.getByTestId('shop-arrow').click()
  await clickCell(page, 7, 5)
  await expect(page.getByTestId('gold')).toContainText('50')
  const snap = await page.evaluate(() => window.__harness.snapshot())
  expect(snap.towers).toBe(1)
  // Clicking the tower opens its panel; upgrade button is visible but too
  // expensive right now (50 gold left, upgrade costs 60).
  await page.keyboard.press('Escape')
  await clickCell(page, 7, 5)
  await expect(page.getByTestId('tower-panel')).toBeVisible()
  await expect(page.getByTestId('upgrade-tower')).toBeDisabled()
  expect(errors).toEqual([])
})

test('a defended wave plays out: enemies die, bounties arrive, build phase returns', async ({ page }) => {
  const errors = await boot(page, 'e2e-wave')
  // Two towers around the path mouth.
  await page.getByTestId('shop-arrow').click()
  await clickCell(page, 4, 5)
  await clickCell(page, 4, 7)
  await page.getByTestId('start-wave').click()
  await page.evaluate(() => window.__harness.fastForward(120))
  const snap = await page.evaluate(() => window.__harness.snapshot())
  expect(snap.phase).toBe('build')
  expect(snap.wave).toBe(1)
  expect(snap.kills).toBeGreaterThan(0)
  expect(snap.spireHp).toBe(100)
  expect(errors).toEqual([])
})

test('the rogue-lite loop closes in the browser: defeat → sparks → spire tree → stronger next run', async ({
  page,
}) => {
  const errors = await boot(page, 'e2e-loop')
  // Send waves undefended until the spire falls (fastForward is instant).
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
  expect(snap.gold).toBe(130) // 100 base + 30 from War Chest level 1
  expect(snap.runs).toBe(1)
  expect(errors).toEqual([])
})

test('relic offers appear in the UI and apply on click', async ({ page }) => {
  const errors = await boot(page, 'e2e-relic')
  // A solid defense so wave 5 is reached: build a killbox, then loop waves.
  await page.getByTestId('shop-arrow').click()
  for (const [cx, cy] of [
    [3, 5],
    [4, 5],
    [5, 5],
    [3, 7],
    [4, 7],
  ] as const) {
    await clickCell(page, cx, cy)
  }
  await page.keyboard.press('Escape')
  await page.evaluate(() => {
    for (let wave = 0; wave < 5; wave++) {
      const s = window.__harness.getState()
      if (s.phase !== 'build') break
      window.__harness.dispatch({ type: 'start_wave' })
      window.__harness.fastForward(300)
    }
  })
  const snap = await page.evaluate(() => window.__harness.snapshot())
  expect(snap.phase).toBe('build') // survived through wave 5
  await expect(page.getByTestId('relic-modal')).toBeVisible()
  await page.locator('.relic-card').first().click()
  await expect(page.getByTestId('relic-modal')).not.toBeVisible()
  const after = await page.evaluate(() => window.__harness.snapshot())
  expect(after.relics.length).toBe(1)
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
