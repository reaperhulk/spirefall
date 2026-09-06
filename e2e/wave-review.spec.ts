import { expect, test } from '@playwright/test'
import type { GameHarness } from '../src/ui/harness'
import { chooseTower } from './ui-helpers'

test('between-wave advice highlights a real tower and reports optional bounty honestly', async ({page}, info) => {
  await page.goto('/?seed=e2e-wave')
  await page.getByTestId('playfield').waitFor()
  await chooseTower(page, 'shop-arrow')
  const box = (await page.getByTestId('playfield').boundingBox())!
  await page.mouse.click(box.x + box.width * 4.5 / 24, box.y + box.height * 5.5 / 14)
  await chooseTower(page, 'shop-arrow')
  await page.evaluate(() => {
    const h = window.__harness as GameHarness, s = h.getState()
    s.phase = 'build'; s.wave = s.wavesCleared = 2
    s.waveStats = {wave: 2, kills: 12, bankedGold: 38, bonusCollected: 1, bonusMissed: 1, damageTaken: 2}
    s.towers[0]!.waveShots = 0; s.towers[0]!.waveBlocked = 0
    s.leaks = [{tick: s.tick, wave: 2, enemy: 'flier', damage: 2}]
    h.fastForward(1 / 30)
  })
  await page.getByTestId('wave-debrief').click()
  const report = page.getByRole('dialog', {name: 'Wave debrief'})
  await expect(report).toContainText('38 bounty banked')
  await expect(report).toContainText('1 optional gold expired')
  await expect(report).toContainText('Fliers bypass the maze')
  await report.getByRole('button').filter({hasText: 'never fired'}).click()
  await expect(report).not.toBeVisible()
  await expect(page.getByTestId('tower-panel')).toContainText('Arrow')
  await info.attach('highlighted-advice.png', {body: await page.screenshot(), contentType: 'image/png'})
})

test('run menu pauses combat and its focus returns to the menu trigger', async ({page}) => {
  await page.goto('/?seed=menu-focus')
  await page.getByTestId('start-wave').click()
  await page.getByTestId('open-menu').click()
  const tick = await page.evaluate(() => (window.__harness as GameHarness).getState().tick)
  await page.waitForTimeout(150)
  expect(await page.evaluate(() => (window.__harness as GameHarness).getState().tick)).toBe(tick)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('open-menu')).toBeFocused()
})
