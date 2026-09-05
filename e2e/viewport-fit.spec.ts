import { expect, test, type Page } from '@playwright/test'
import type { GameHarness } from '../src/ui/harness'

const DESKTOPS = [
  [1024, 600], [1024, 768], [1280, 720], [1366, 768],
  [1440, 900], [1536, 864], [1920, 1080],
] as const
const TOUCH_SCREENS = [
  [320, 568], [375, 667], [390, 844], [412, 915],
  [667, 375], [844, 390], [768, 1024], [1024, 768],
] as const

async function boot(page: Page) {
  await page.goto('/?seed=e2e-wave')
  await page.getByTestId('playfield').waitFor()
  // First-run hints must stay visible. Dismissing them hid the original
  // height regression from the old horizontal-only viewport matrix.
  await expect(page.getByTestId('hint')).toBeVisible()
}

async function expectDesktopFit(page: Page, phase: string) {
  // Read bounds AND hit targets without scrolling anything into view.
  // overflow:hidden or an overlay cannot make an offscreen control pass.
  await page.mouse.move(1, 1)
  const result = await page.evaluate(() => {
    const inspector = document.querySelector('[data-testid="tower-panel"]')
    const selectors = [
      '.hud button', '[data-testid="playfield"]', '.run-context button',
      '.tactical-buttons button', '.shop-abilities button',
      ...(inspector ? ['.tower-panel-actions button', '.tower-panel-actions select', '[data-testid="close-tower-panel"]'] : ['.shop-card']),
    ]
    const controls = [...document.querySelectorAll<HTMLElement>(selectors.join(','))].map(el => {
      const r = el.getBoundingClientRect()
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      return {id: el.dataset.testid ?? el.getAttribute('aria-label') ?? el.textContent,
        x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height,
        reachable: hit === el || (hit !== null && el.contains(hit))}
    })
    const canvas = document.querySelector('[data-testid="playfield"]')!.getBoundingClientRect()
    const corners = [[canvas.left + 2, canvas.top + 2], [canvas.right - 2, canvas.top + 2],
      [canvas.left + 2, canvas.bottom - 2], [canvas.right - 2, canvas.bottom - 2]]
      .map(([x, y]) => document.elementFromPoint(x!, y!)?.getAttribute('data-testid'))
    return {width: innerWidth, height: innerHeight, scrollX, scrollY,
      scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight,
      controls, corners, clippedNames: inspector ? [] : [...document.querySelectorAll('.shop-card-name')]
        .filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.textContent)}
  })
  expect(result.scrollWidth, `${phase}: horizontal document overflow`).toBeLessThanOrEqual(result.width)
  expect(result.scrollHeight, `${phase}: vertical document overflow`).toBeLessThanOrEqual(result.height + 1)
  expect([result.scrollX, result.scrollY], `${phase}: page scrolled`).toEqual([0, 0])
  for (const c of result.controls) {
    const label = `${phase}: ${c.id} ${JSON.stringify(c)}`
    expect(c.width, label).toBeGreaterThan(0)
    expect(c.x, label).toBeGreaterThanOrEqual(-0.5)
    expect(c.y, label).toBeGreaterThanOrEqual(-0.5)
    expect(c.right, label).toBeLessThanOrEqual(result.width + 0.5)
    expect(c.bottom, label).toBeLessThanOrEqual(result.height + 0.5)
    expect(c.reachable, `${label}: covered or clipped`).toBe(true)
  }
  expect(result.corners, `${phase}: battlefield obscured`).toEqual(Array(4).fill('playfield'))
  expect(result.clippedNames, `${phase}: tower names truncated`).toEqual([])
  const canvas = result.controls.find(c => c.id === 'playfield')!
  expect(canvas.width, `${phase}: board shrank below a useful size`).toBeGreaterThan(350)
  expect(canvas.width / canvas.height).toBeCloseTo(24 / 14, 1)
}

async function selectTower(page: Page, touch = false) {
  const arrow = page.getByTestId('shop-arrow')
  if (touch) await arrow.tap(); else await arrow.click()
  const canvas = page.getByTestId('playfield')
  if (touch) await canvas.scrollIntoViewIfNeeded()
  const box = (await canvas.boundingBox())!
  const point = {x: box.x + 4.5 * box.width / 24, y: box.y + 5.5 * box.height / 14}
  if (touch) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y)
  await expect.poll(() => page.evaluate(() => (window.__harness as GameHarness).getState().towers.length)).toBe(1)
  if (touch) await arrow.tap(); else await arrow.click()
  if (touch) await canvas.scrollIntoViewIfNeeded()
  const current = (await canvas.boundingBox())!
  const select = {x: current.x + 4.5 * current.width / 24, y: current.y + 5.5 * current.height / 14}
  if (touch) await page.touchscreen.tap(select.x, select.y); else await page.mouse.click(select.x, select.y)
  await expect(page.getByTestId('tower-panel')).toBeVisible()
}

async function lateRun(page: Page) {
  await page.evaluate(() => {
    const h = window.__harness as GameHarness, s = h.getState()
    s.phase = 'build'; s.wave = 29; s.enemies = []; s.pendingSpawns = []
    s.gold = 123456; s.spireHp = 50; s.spireMaxHp = 100; s.doctrine = 'siege'
    s.availableTowers = ['arrow', 'cannon', 'frost', 'tesla', 'sniper', 'mint', 'beacon', 'lance']
    s.abilities = {meteor: 0, frost_nova: 0, gold_rush: 0, bulwark: 0}
    s.shrine = {cell: {cx: 4, cy: 4}, status: 'offered', wave: 29}
    s.crucible = 3; s.trials = ['iron_horde', 'swift_horde']; s.cataclysms = ['surge', 'swarm']
    s.relicOffer = null; s.cataclysmOffer = null
    h.fastForward(1 / 30)
  })
  await expect(page.getByTestId('open-shrine')).toBeVisible()
}

for (const [width, height] of DESKTOPS) {
  test.describe(`desktop fits ${width}×${height}`, () => {
    test.use({viewport: {width, height}})
    test('opening, inspector, combat and late-run controls need no page scrolling', async ({page}, info) => {
      await boot(page)
      await expectDesktopFit(page, 'first run with tutorial')
      await info.attach('opening.png', {body: await page.screenshot(), contentType: 'image/png'})
      await selectTower(page)
      await expectDesktopFit(page, 'tower inspector')
      await page.getByTestId('close-tower-panel').click()
      await page.getByTestId('start-wave').click()
      await expect(page.getByTestId('start-wave')).toBeDisabled()
      await expectDesktopFit(page, 'live combat')
      await lateRun(page)
      await expectDesktopFit(page, 'all spells, shrine, doctrine and repair')
      // Tier-three specializations are the tallest inspector state.
      await page.evaluate(() => {
        const h = window.__harness as GameHarness
        h.getState().towers[0]!.tier = 3
        h.fastForward(1 / 30)
      })
      const box = (await page.getByTestId('playfield').boundingBox())!
      await page.mouse.click(box.x + 4.5 * box.width / 24, box.y + 5.5 * box.height / 14)
      await expect(page.getByTestId('tower-panel')).toBeVisible()
      await expectDesktopFit(page, 'specializations and all spells')
      await info.attach('late-run.png', {body: await page.screenshot(), contentType: 'image/png'})
    })
  })
}

test('desktop resize recomputes the usable battlefield without reload', async ({page}) => {
  await boot(page)
  for (const [width, height] of [...DESKTOPS].reverse()) {
    await page.setViewportSize({width, height})
    await expectDesktopFit(page, `resized to ${width}×${height}`)
    await expect.poll(() => page.getByTestId('playfield').evaluate((c: HTMLCanvasElement) =>
      Math.abs(c.width - c.clientWidth * Math.min(devicePixelRatio, 2)))).toBeLessThan(4)
  }
})

async function expectVisibleBounds(page: Page, selector: string) {
  const el = page.locator(selector)
  const r = (await el.boundingBox())!
  const viewport = page.viewportSize()!
  expect(r.x, selector).toBeGreaterThanOrEqual(0)
  expect(r.y, selector).toBeGreaterThanOrEqual(0)
  expect(r.x + r.width, selector).toBeLessThanOrEqual(viewport.width + 1)
  expect(r.y + r.height, selector).toBeLessThanOrEqual(viewport.height + 1)
  expect(await el.evaluate(el => el.scrollWidth <= el.clientWidth + 1), `${selector}: internal horizontal overflow`).toBe(true)
}

for (const [width, height] of TOUCH_SCREENS) {
  test.describe(`touch fits ${width}×${height}`, () => {
    test.use({viewport: {width, height}, hasTouch: true, isMobile: true, deviceScaleFactor: 2})
    test('whole board, tower actions and planning dialogs remain reachable', async ({page}, info) => {
      await boot(page)
      await page.getByTestId('playfield').scrollIntoViewIfNeeded()
      await expectVisibleBounds(page, '[data-testid="playfield"]')
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      for (const id of ['shop-arrow', 'cycle-target', 'execute-target', 'beam-toggle', 'open-plan']) {
        const r = (await page.getByTestId(id).boundingBox())!
        expect(r.width, `${id} touch width`).toBeGreaterThanOrEqual(44)
        expect(r.height, `${id} touch height`).toBeGreaterThanOrEqual(44)
      }
      await selectTower(page, true)
      await expectVisibleBounds(page, '[data-testid="tower-panel"]')
      for (const id of ['upgrade-tower', 'overcharge-tower', 'sell-tower', 'close-tower-panel']) {
        await expectVisibleBounds(page, `[data-testid="${id}"]`)
      }
      await page.getByTestId('upgrade-tower').tap()
      await expect.poll(() => page.evaluate(() => (window.__harness as GameHarness).getState().towers[0]!.tier)).toBe(2)
      await page.getByTestId('close-tower-panel').tap()
      await page.evaluate(() => {
        const h = window.__harness as GameHarness
        h.getState().wave = 2; h.fastForward(1 / 30)
      })
      await page.getByTestId('open-plan').tap()
      await expectVisibleBounds(page, '.planning-modal')
      await page.getByTestId('doctrine-storm').tap()
      await expect(page.getByRole('dialog')).not.toBeVisible()
      await lateRun(page)
      await page.getByTestId('open-shrine').tap()
      await expectVisibleBounds(page, '.planning-modal')
      await page.getByTestId('accept-shrine').tap()
      await expect(page.getByTestId('open-shrine')).toHaveText('Defending shrine')
      await page.getByTestId('open-settings').tap()
      await expectVisibleBounds(page, '[role="dialog"]')
      await info.attach('settings.png', {body: await page.screenshot(), contentType: 'image/png'})
      await page.keyboard.press('Escape')
      // Rotate without reloading and verify the entire board is still usable.
      await page.setViewportSize({width: height, height: width})
      await page.getByTestId('playfield').scrollIntoViewIfNeeded()
      await expectVisibleBounds(page, '[data-testid="playfield"]')
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(height)
    })
  })
}

test('opening the build guide pauses combat and Escape restores focus', async ({page}) => {
  await boot(page)
  await page.getByTestId('start-wave').click()
  await page.getByTestId('open-plan').click()
  await expectVisibleBounds(page, '.planning-modal')
  const tick = await page.evaluate(() => (window.__harness as GameHarness).getState().tick)
  await page.waitForTimeout(250)
  expect(await page.evaluate(() => (window.__harness as GameHarness).getState().tick)).toBe(tick)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('open-plan')).toBeFocused()
  await expect.poll(() => page.evaluate(() => (window.__harness as GameHarness).getState().tick)).toBeGreaterThan(tick)
})
