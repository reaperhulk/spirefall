import { expect, test } from '@playwright/test'
import type { GameHarness } from '../src/ui/harness'

test('placement reports coverage before committing a tower', async ({page}) => {
  await page.goto('/?seed=coverage-preview')
  await page.getByTestId('playfield').waitFor()
  await page.getByTestId('shop-arrow').click()
  const cell = await page.evaluate(() => {
    const h = window.__harness as GameHarness, map = h.getMapInfo()
    return map.buildable.findIndex((yes, i) => yes && !map.path.some(c => c.cy * map.width + c.cx === i))
  })
  const canvas = page.getByTestId('playfield'), box = (await canvas.boundingBox())!
  await page.mouse.move(box.x + (cell % 24 + 0.5) * box.width / 24, box.y + (Math.floor(cell / 24) + 0.5) * box.height / 14)
  await expect(page.getByTestId('placement-report')).toContainText('route cells')
  expect(await page.evaluate(() => (window.__harness as GameHarness).getState().towers.length)).toBe(0)
  await page.mouse.down(); await page.mouse.up()
  await expect.poll(() => page.evaluate(() => (window.__harness as GameHarness).getState().towers.length)).toBe(1)
})

test('a doctrine guide leads to a paid focused relic choice', async ({page}) => {
  await page.goto('/?seed=focused-relic')
  await page.getByTestId('playfield').waitFor()
  await page.evaluate(() => {
    const h = window.__harness as GameHarness, s = h.getState()
    s.wave = 5; s.gold = 1000; s.doctrine = 'storm'
    s.relicOffer = ['keen_sights', 'field_medicine', 'deep_pockets']
    h.fastForward(1 / 30)
  })
  await page.getByTestId('relic-focus').click()
  await expect(page.getByTestId('relic-focus')).toBeDisabled()
  const offer = await page.evaluate(() => (window.__harness as GameHarness).getState().relicOffer)
  expect(offer!.some(r => ['storm_coils','echo_chamber','overcharge','prism_lens'].includes(r))).toBe(true)
  expect(await page.evaluate(() => (window.__harness as GameHarness).getState().gold)).toBeLessThan(1000)
  await page.locator('.relic-card').first().click()
  await page.getByText('Build guide', {exact:true}).click()
  await expect(page.locator('.doctrine-summary')).toContainText('Shield')
})
