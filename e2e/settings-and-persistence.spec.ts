import { expect, test } from '@playwright/test'
import { boot, chooseTower, clickCell, clickMenu, findBuildCells, MAP_H, MAP_W } from './ui-helpers'

// UI suite (PLAN.md §5.7): deliberately shallow on game logic — that lives in
// the headless suites — but drives the REAL input path: buttons, canvas
// clicks, and the dev harness the way a playtester would. Runs are seeded
// through the harness so every assertion is deterministic.
// Settings, keyboard play, saves, transfer codes, PWA, the codex.

test('sound button reflects PROBED audio state: pending on load, live after a gesture, mute intent honored', async ({
  page,
}) => {
  const errors = await boot(page, 'e2e-audio-state')
  // No gesture has happened (boot drives the page via evaluate) — the
  // button must not claim working audio it cannot have.
  await expect(page.getByTestId('mute')).toHaveAttribute('aria-label', 'Enable sound')
  expect(await page.evaluate(() => window.__harness.audioLive())).toBe(false)

  // Clicking the pending button means "I want sound": the click unlocks the
  // context and the probe flips the icon — it must NOT mute instead.
  await page.getByTestId('open-menu').click()
  await expect(page.getByTestId('mute')).toHaveAttribute('aria-label', 'Mute sound')
  await expect.poll(() => page.evaluate(() => window.__harness.audioLive())).toBe(true)

  await page.getByRole('button', { name: 'Resume game', exact: true }).click()

  // Live now: the same button is a plain mute toggle again.
  await clickMenu(page, 'mute')
  await expect(page.getByTestId('mute')).toHaveAttribute('aria-label', 'Unmute sound')
  await expect(page.getByTestId('mute')).toHaveAttribute('aria-pressed', 'true')
  expect(errors).toEqual([])
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
  await chooseTower(page, 'shop-cannon')
  const [scx, scy] = (await findBuildCells(page, 1))[0]!
  await clickCell(page, scx!, scy!)
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
  await clickMenu(page, 'open-settings')
  await expect(page.getByTestId('settings-modal')).toBeVisible()
  await page.getByTestId('volume-slider').fill('40')
  await page.getByTestId('music-slider').fill('25')
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
  await expect(page.getByTestId('music-slider')).toHaveValue('25')
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
  await chooseTower(page, 'shop-arrow')
  await clickCell(page, 7, 5)
  await expect.poll(async () => (await page.evaluate(() => window.__harness.snapshot())).towers).toBe(1)

  await clickMenu(page, 'open-settings')
  await page.getByTestId('export-save').click()
  const code = await page.getByTestId('transfer-code').inputValue()
  expect(code.length).toBeGreaterThan(50)

  // Use the reset lifecycle so pagehide cannot restore the old run.
  await page.evaluate(() => window.__harness.reset())
  await page.waitForLoadState()
  await page.waitForSelector('[data-testid="playfield"]')
  expect((await page.evaluate(() => window.__harness.snapshot())).towers).toBe(0)
  await clickMenu(page, 'open-settings')
  await page.getByTestId('transfer-code').fill(code)
  await page.getByTestId('import-save').click()
  await page.getByTestId('confirm-yes').click() // in-app confirm, not window.confirm
  await page.waitForSelector('[data-testid="playfield"]')
  await expect.poll(async () => (await page.evaluate(() => window.__harness.snapshot())).towers).toBe(1)

  // Garbage codes are rejected without nuking anything.
  await clickMenu(page, 'open-settings')
  await page.getByTestId('transfer-code').fill('not-a-save')
  await page.getByTestId('import-save').click()
  await page.getByTestId('confirm-yes').click()
  await expect(page.getByTestId('import-failed')).toBeVisible()
  expect(errors).toEqual([])
})

test('keyboard-only build: arm with 1, steer with arrows, place with Enter', async ({ page }) => {
  const errors = await boot(page, 'e2e-wave')
  await page.locator('.hint-close').click()
  const [cx, cy] = (await findBuildCells(page, 1))[0]!

  await page.keyboard.press('1') // arm the arrow tower
  // Steer from the cursor's spawn point (map center) to the target cell.
  const startX = Math.floor(MAP_W / 2)
  const startY = Math.floor(MAP_H / 2)
  for (let i = 0; i < Math.abs(cx! - startX); i++) {
    await page.keyboard.press(cx! > startX ? 'ArrowRight' : 'ArrowLeft')
  }
  for (let i = 0; i < Math.abs(cy! - startY); i++) {
    await page.keyboard.press(cy! > startY ? 'ArrowDown' : 'ArrowUp')
  }
  await page.keyboard.press('Enter')
  await expect.poll(async () => (await page.evaluate(() => window.__harness.snapshot())).towers).toBe(1)
  expect(await page.evaluate(() => window.__harness.getState().towers[0]!.cell)).toEqual({ cx, cy })

  // Enter with nothing armed must not place a second tower.
  await page.keyboard.press('Escape')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(150)
  expect((await page.evaluate(() => window.__harness.snapshot())).towers).toBe(1)
  expect(errors).toEqual([])
})

test('codex: opens from the HUD, focuses an enemy from a preview chip, Escape closes', async ({ page }) => {
  const errors = await boot(page, 'e2e-wave')
  await page.locator('.hint-close').click()

  // HUD button → full reference with all four tabs.
  await clickMenu(page, 'open-codex')
  await expect(page.getByTestId('codex-modal')).toBeVisible()
  await expect(page.getByTestId('codex-enemy-runner')).toBeVisible()
  await page.getByTestId('codex-tab-towers').click()
  await expect(page.getByTestId('codex-tower-arrow')).toBeVisible()
  // Tower data comes straight from the data file: arrow tier-1 cost.
  await expect(page.getByTestId('codex-tower-arrow')).toContainText('⛀ 50')
  await page.getByTestId('codex-tab-relics').click()
  await expect(page.getByTestId('codex-relic-colossus')).toBeVisible()
  await expect(page.getByTestId('codex-relic-colossus')).toContainText('+25%')
  await page.getByTestId('codex-tab-mechanics').click()
  await expect(page.getByTestId('codex-mechanic-armor')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('codex-modal')).not.toBeVisible()

  // A scouting-report chip opens the codex focused on that enemy.
  const chip = page.locator('[data-testid^="preview-unit-"]').first()
  const chipId = await chip.getAttribute('data-testid')
  const enemy = chipId!.replace('preview-unit-', '')
  await chip.click()
  await expect(page.getByTestId('codex-modal')).toBeVisible()
  const focused = page.locator('[data-focused="true"]')
  await expect(focused).toHaveAttribute('data-codex-enemy', enemy)
  await expect(focused).toBeInViewport()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('codex-modal')).not.toBeVisible()

  // C toggles it from the keyboard.
  await page.keyboard.press('c')
  await expect(page.getByTestId('codex-modal')).toBeVisible()
  await page.keyboard.press('c')
  await expect(page.getByTestId('codex-modal')).not.toBeVisible()

  // Permanent upgrades flow into the numbers. Three Honed Arsenal levels
  // (+24% damage) must move the tower tables: sniper tier 3 reads the
  // effective 322 with the base 260 alongside — via the same engine helper
  // combat uses, so the codex can never drift from what towers actually do.
  await page.evaluate(() => {
    window.__harness.getMeta().sparks = 99999
    window.__harness.buyMeta('tower_damage')
    window.__harness.buyMeta('tower_damage')
    window.__harness.buyMeta('tower_damage')
    window.__harness.newRun('e2e-wave')
  })
  await clickMenu(page, 'open-codex')
  await page.getByTestId('codex-tab-towers').click()
  await expect(page.getByTestId('codex-modifier-note')).toBeVisible()
  await expect(page.getByTestId('codex-tower-sniper')).toContainText('322')
  await expect(page.getByTestId('codex-tower-sniper')).toContainText('(260)')
  // DPS column: arrow tier 3 = floor(32 × 1.24) × 3 shots/s = 117 (base 96).
  await expect(page.getByTestId('codex-tower-arrow')).toContainText('117')
  await expect(page.getByTestId('codex-tower-arrow')).toContainText('(96)')
  await page.keyboard.press('Escape')
  expect(errors).toEqual([])
})

test('planning pauses combat and remapped hold-beam controls remain usable', async ({ page }) => {
  const errors = await boot(page, 'e2e-planning-controls')
  await page.getByTestId('start-wave').click()
  await clickMenu(page, 'open-settings')
  await expect(page.getByTestId('settings-modal')).toBeVisible()
  const pausedTick = (await page.evaluate(() => window.__harness.snapshot())).tick
  await page.getByRole('textbox', { name: 'Beam key', exact: true }).fill('j')
  await page.getByLabel('Hold beam key', {exact:true}).check()
  await page.keyboard.press('Tab')
  expect(await page.evaluate(() => !!document.activeElement?.closest('[aria-modal="true"]'))).toBe(true)
  expect((await page.evaluate(() => window.__harness.snapshot())).tick).toBe(pausedTick)
  await page.keyboard.press('Escape')
  await page.keyboard.down('j')
  await expect.poll(() => page.evaluate(() => window.__harness.getState().beamTarget)).not.toBeNull()
  await page.keyboard.up('j')
  await expect.poll(() => page.evaluate(() => window.__harness.getState().beamTarget)).toBeNull()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('spirefall-settings')!).keyBindings.b)).toBe('j')
  expect(errors).toEqual([])
})
