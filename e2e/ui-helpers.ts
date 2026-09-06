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
