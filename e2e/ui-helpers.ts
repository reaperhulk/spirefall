import type { Page } from '@playwright/test'
export async function clickMenu(page: Page, id: string, touch = false) {
  if (!await page.getByRole('dialog', { name: 'Run menu', exact: true }).isVisible()) {
    if (touch) await page.getByTestId('open-menu').tap(); else await page.getByTestId('open-menu').click()
  }
  if (touch) await page.getByTestId(id).tap(); else await page.getByTestId(id).click()
  if (['mute', 'auto-start'].includes(id)) await page.getByRole('button', { name: 'Resume game', exact: true }).click()
}
export async function chooseTower(page: Page, id: string, touch = false) {
  if (!await page.getByTestId(id).isVisible()) {
    if (touch) await page.getByTestId('toggle-build').tap(); else await page.getByTestId('toggle-build').click()
  }
  if (touch) await page.getByTestId(id).tap(); else await page.getByTestId(id).click()
}

// Logical grid dimensions (src/data/maps.ts). Cell pixel size is derived
// from the live bounding box on every click — the canvas is responsive, so
// a hardcoded pixel size drifts whenever layout shifts (fonts, hint banner).
export const MAP_W = 24
export const MAP_H = 14

export async function boot(page: Page, seed: string) {
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

export async function cellPoint(page: Page, cx: number, cy: number) {
  // On short phones, choosing a shop card can scroll the board away.
  await page.getByTestId('playfield').scrollIntoViewIfNeeded()
  const box = (await page.locator('[data-testid="playfield"]').boundingBox())!
  return { x: box.x + ((cx + 0.5) * box.width) / MAP_W, y: box.y + ((cy + 0.5) * box.height) / MAP_H }
}

export async function clickCell(page: Page, cx: number, cy: number) {
  const p = await cellPoint(page, cx, cy)
  await page.mouse.click(p.x, p.y)
}

export async function tapCell(page: Page, cx: number, cy: number) {
  const p = await cellPoint(page, cx, cy)
  await page.touchscreen.tap(p.x, p.y)
}

// Battlefields are GENERATED per seed now — specs that just need "somewhere
// legal to build" derive cells from the live map instead of pinning layouts:
// open cells flanking the gate's row, spread across columns so a handful of
// towers never walls off the path.
export async function findBuildCells(page: Page, n: number): Promise<[number, number][]> {
  return await page.evaluate((count) => {
    const info = window.__harness.getMapInfo()
    const cells: [number, number][] = []
    for (let cx = 2; cx < info.width - 2 && cells.length < count; cx++) {
      for (const dy of [-1, 1, -2, 2]) {
        const cy = info.spawn.cy + dy
        if (cy < 0 || cy >= info.height) continue
        if (info.buildable[cy * info.width + cx] && !cells.some(([x]) => x === cx)) {
          cells.push([cx, cy])
          break
        }
      }
    }
    return cells
  }, n)
}
