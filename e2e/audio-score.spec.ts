import { expect, test } from '@playwright/test'
import type { GameHarness } from '../src/ui/harness'

test('authored phrases produce finite, unclipped audio and settle to silence in every biome', async ({page}, testInfo) => {
  await page.goto('/?seed=audio-render')
  await page.getByTestId('playfield').waitFor()
  const rows = await page.evaluate(async () => {
    const h = window.__harness as GameHarness, rows = []
    for (const biome of ['verdant','frostfen','emberwaste','highlands'] as const) {
      for (const phase of ['preparation','pressure','boss','victory','ascension'] as const) rows.push({biome,phase,...await h.renderScorePreview(biome,phase)})
    }
    return rows
  })
  for (const row of rows) {
    expect(row.peak, JSON.stringify(row)).toBeGreaterThan(0.001)
    expect(row.peak).toBeLessThan(0.5)
    expect(row.rms).toBeGreaterThan(0.0001)
    expect(row.tailRms).toBeLessThan(0.00001)
  }
  console.log('AUDIO_PROFILE',JSON.stringify(rows))
  await testInfo.attach('audio-profile.json',{body:JSON.stringify(rows,null,2),contentType:'application/json'})
})
