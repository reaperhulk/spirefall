import { expect, test } from '@playwright/test'
import { boot, cellPoint, chooseTower, clickCell, tapCell } from './ui-helpers'

// UI suite (PLAN.md §5.7): deliberately shallow on game logic — that lives in
// the headless suites — but drives the REAL input path: buttons, canvas
// clicks, and the dev harness the way a playtester would. Runs are seeded
// through the harness so every assertion is deterministic.
// Touch input and layout across phone, tablet and desktop viewports.

test.describe('touch', () => {
  test.use({ hasTouch: true })

  test('tower popups dismiss on touch: ✕ closes the panel, tooltips never stick', async ({ page }) => {
    const errors = await boot(page, 'e2e-touch')
    await chooseTower(page, 'shop-arrow', true)
    await tapCell(page, 7, 5)
    await expect.poll(async () => (await page.evaluate(() => window.__harness.snapshot())).towers).toBe(1)

    // Disarm, then tap the tower: the panel opens and no hover tooltip sticks.
    await chooseTower(page, 'shop-arrow', true)
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

  test('hold-to-aim: a touch drag shows the loupe and places at the RELEASE cell', async ({ page }) => {
    const errors = await boot(page, 'e2e-wave')
    await page.locator('.hint-close').tap()
    await chooseTower(page, 'shop-arrow', true)

    // While armed, touch drags must aim — not scroll the page.
    await expect(page.getByTestId('playfield')).toHaveCSS('touch-action', 'none')

    const firePointer = async (type: string, cx: number, cy: number) => {
      const p = await cellPoint(page, cx, cy)
      await page.evaluate(
        ([t, x, y]) => {
          document.querySelector('[data-testid="playfield"]')!.dispatchEvent(
            new PointerEvent(t as string, {
              bubbles: true,
              pointerId: 1,
              pointerType: 'touch',
              isPrimary: true,
              clientX: x as number,
              clientY: y as number,
            }),
          )
        },
        [type, p.x, p.y] as const,
      )
    }

    // Finger down on one cell, drag to another: nothing places mid-hold.
    await firePointer('pointerdown', 4, 5)
    await firePointer('pointermove', 5, 7)
    await page.waitForTimeout(150)
    expect((await page.evaluate(() => window.__harness.snapshot())).towers).toBe(0)

    // The loupe overlay is visible and NOT under the finger — on phones the
    // board is too short to host it, so it floats in screen space (it used
    // to flip below and sit exactly under the touch point at board-center).
    const loupe = page.getByTestId('placement-loupe')
    await expect(loupe).toBeVisible()
    const fingerAtCenter = await cellPoint(page, 12, 7)
    await firePointer('pointermove', 12, 7)
    await page.waitForTimeout(100)
    const loupeBox = (await loupe.boundingBox())!
    const covers =
      fingerAtCenter.x >= loupeBox.x &&
      fingerAtCenter.x <= loupeBox.x + loupeBox.width &&
      fingerAtCenter.y >= loupeBox.y &&
      fingerAtCenter.y <= loupeBox.y + loupeBox.height
    expect(covers, 'loupe must never sit under the finger').toBe(false)
    await firePointer('pointermove', 5, 7)

    // Release: the tower lands on the cell under the loupe — the release
    // cell, not the touch-down cell.
    await firePointer('pointerup', 5, 7)
    await expect.poll(async () => (await page.evaluate(() => window.__harness.snapshot())).towers).toBe(1)
    const cell = await page.evaluate(() => window.__harness.getState().towers[0]!.cell)
    expect(cell).toEqual({ cx: 5, cy: 7 })
    await expect(loupe).not.toBeVisible()

    // Dragging OFF the board and releasing is a cancel, not a placement.
    const box = (await page.locator('[data-testid="playfield"]').boundingBox())!
    await firePointer('pointerdown', 8, 5)
    await page.evaluate(
      ([x, y]) => {
        for (const t of ['pointermove', 'pointerup']) {
          document.querySelector('[data-testid="playfield"]')!.dispatchEvent(
            new PointerEvent(t, {
              bubbles: true,
              pointerId: 1,
              pointerType: 'touch',
              isPrimary: true,
              clientX: x as number,
              clientY: y as number,
            }),
          )
        }
      },
      [box.x + 40, box.y - 60] as const, // well above the board
    )
    await page.waitForTimeout(150)
    expect((await page.evaluate(() => window.__harness.snapshot())).towers).toBe(1) // still just the first tower
    await expect(loupe).not.toBeVisible()

    // Disarmed again after checking: quick taps (down+up in place) still
    // place instantly — the existing touch spec covers that path.
    expect(errors).toEqual([])
  })
})

// Standard-viewport layout matrix: the standing guard against layout
// regressions on real device sizes. For every viewport: the document must
// never overflow horizontally (an overflowing child lets the whole page pan
// sideways on touch), and every HUD control must fit horizontally —
// at boot, with the tower panel open, and during a live wave.
const STANDARD_VIEWPORTS: [string, number, number][] = [
  // 320 is the floor of the real world (iPhone SE 1st gen, older Androids,
  // and any phone in a split-screen half). The stylesheet already claimed to
  // handle it; nothing proved it until this row existed.
  ['phone-tiny', 320, 568],
  ['phone-small', 375, 667],
  ['phone', 390, 844],
  ['phone-large', 412, 915],
  ['tablet-portrait', 768, 1024],
  ['tablet-landscape', 1024, 768],
  ['desktop', 1280, 720],
]

const HUD_CONTROLS = ['open-menu', 'start-wave', 'pause-game', 'game-speed', 'repair-spire', 'shop-arrow', 'shop-lance']

for (const [name, width, height] of STANDARD_VIEWPORTS) {
  test.describe(`layout @ ${name} (${width}×${height})`, () => {
    test.use({ viewport: { width, height } })

    test('no horizontal overflow; every control fits the screen width', async ({ page }) => {
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
          // Desktop management replaces the palette; spells and tactical
          // controls remain visible beside it (viewport-fit.spec.ts).
          if (id.startsWith('shop-') && !await page.getByTestId(id).isVisible()) continue
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
        // On phones the scouting report wraps — internal horizontal scroll
        // would hide wave data past the right edge.
        if (width < 640) {
          const preview = await page.evaluate(() => {
            const el = document.querySelector('[data-testid="wave-preview"]')
            return el ? { scrollW: el.scrollWidth, clientW: el.clientWidth } : null
          })
          if (preview) {
            expect(preview.clientW, `${phase}: bounded scouting strip`).toBeLessThanOrEqual(width)
          }
        }
      }

      await assertLayout('build phase')

      // Tower panel open (a bottom sheet on phones) must not break layout.
      await chooseTower(page, 'shop-arrow')
      await clickCell(page, 4, 5)
      await expect.poll(async () => (await page.evaluate(() => window.__harness.snapshot())).towers).toBe(1)
      await chooseTower(page, 'shop-arrow') // disarm
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

    test('run-over tabs fit: no tab overflows the modal, next-run pickers on screen', async ({ page }) => {
      // The matrix predates the tabbed run-over screen — each tab has its own
      // widest element (share row / spire tree / trial dropdown), so every tab
      // must be swept at every size, not just the phone that first broke.
      const errors = await boot(page, 'e2e-wave')
      await page.evaluate(() => window.__harness.dispatch({ type: 'abandon_run' }))
      await expect(page.getByTestId('run-over')).toBeVisible()

      for (const tab of ['tab-result', 'tab-tree', 'tab-next']) {
        await page.getByTestId(tab).click()
        const overflow = await page
          .locator('[data-testid="run-over"] .modal')
          .evaluate((el) => el.scrollWidth - el.clientWidth)
        expect(overflow, `${tab}: modal content overflows horizontally`).toBeLessThanOrEqual(1)
        // The tab strip itself must also stay inside the viewport.
        const strip = await page.locator('[data-testid="run-over"] .tab-bar').boundingBox()
        expect(strip!.x, `${tab}: tab bar clipped left`).toBeGreaterThanOrEqual(-0.5)
        expect(strip!.x + strip!.width, `${tab}: tab bar clipped right`).toBeLessThanOrEqual(width + 0.5)
      }

      // Next Run is the interactive tab: its pickers and the launch button
      // must sit fully on screen or the player literally cannot start a run.
      for (const id of ['map-select', 'trial-select', 'next-run', 'rematch']) {
        const box = await page.getByTestId(id).boundingBox()
        expect(box, `${id} not rendered`).not.toBeNull()
        expect(box!.x, `${id} clipped left`).toBeGreaterThanOrEqual(-0.5)
        expect(box!.x + box!.width, `${id} clipped right`).toBeLessThanOrEqual(width + 0.5)
      }
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
    await chooseTower(page, 'shop-arrow')
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
    await chooseTower(page, 'shop-arrow', true)
    await tapCell(page, 7, 5)
    await expect.poll(async () => (await page.evaluate(() => window.__harness.snapshot())).towers).toBe(1)
    await chooseTower(page, 'shop-arrow', true) // disarm
    await tapCell(page, 7, 5)
    await expect(page.getByTestId('tower-panel')).toBeVisible()

    // Playwright refuses to tap covered controls — these prove the panel
    // wins the stacking fight with the shop cards beneath it.
    await page.getByTestId('upgrade-tower').tap()
    await expect.poll(async () => (await page.evaluate(() => window.__harness.getState())).towers[0]!.tier).toBe(2)
    await page.getByTestId('close-tower-panel').tap()
    await expect(page.getByTestId('tower-panel')).not.toBeVisible()

    // With the sheet gone, the shop is interactive again.
    await chooseTower(page, 'shop-cannon', true)
    await expect(page.getByTestId('shop-cannon')).toHaveClass(/selected/)
    expect(errors).toEqual([])
  })

  test('a touch tap unlocks the audio context', async ({ page }) => {
    // Touch grants user activation on pointerup/touchend — NOT pointerdown
    // (which only counts for mouse). This pins the unlock listeners against
    // regressing to a desktop-only set that leaves phones silent.
    const errors = await boot(page, 'e2e-mobile-audio')
    await chooseTower(page, 'shop-arrow', true)
    await expect.poll(() => page.evaluate(() => window.__harness.audioState())).toBe('running')
    // Not just claimed — PROBED: the audio clock was observed advancing.
    await expect.poll(() => page.evaluate(() => window.__harness.audioLive())).toBe(true)
    expect(errors).toEqual([])
  })

  test('boon offers are legible without hover: each button names its effect on screen', async ({ page }) => {
    const errors = await boot(page, 'e2e-mobile-boons')
    const offer = page.getByTestId('boon-offer')
    await expect(offer).toBeVisible()
    // Touch has no tooltips: every offered boon must carry a visible effect
    // tag (the compact form from the BOONS table) inside the button itself.
    const ids = await page.evaluate(() => window.__harness.getState().boonOffer)
    expect(ids!.length).toBeGreaterThan(0)
    for (const id of ids!) {
      const tag = page.getByTestId(`boon-${id}`).locator('.boon-effect')
      await expect(tag).toBeVisible()
      expect((await tag.textContent())!.trim().length).toBeGreaterThan(0)
    }
    // The strip itself must not push the page wide on a phone.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)
    expect(errors).toEqual([])
  })

  test('run-over modal fits the phone: the trial dropdown cannot force horizontal scroll', async ({ page }) => {
    const errors = await boot(page, 'e2e-mobile-overflow')
    await page.evaluate(() => window.__harness.dispatch({ type: 'abandon_run' }))
    await expect(page.getByTestId('run-over')).toBeVisible()
    await page.getByTestId('tab-next').click() // the pickers live on the Next Run tab

    // The modal is the scroll container; its content (the trial select's
    // intrinsic width, driven by long option labels) must not exceed it.
    const overflow = await page
      .locator('[data-testid="run-over"] .modal')
      .evaluate((el) => el.scrollWidth - el.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)

    const box = await page.getByTestId('trial-select').boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(375)
    expect(errors).toEqual([])
  })
})
