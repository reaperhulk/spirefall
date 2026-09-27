import { expect, test } from '@playwright/test'
import { boot, chooseTower, clickCell, findBuildCells } from './ui-helpers'

// UI suite (PLAN.md §5.7): deliberately shallow on game logic — that lives in
// the headless suites — but drives the REAL input path: buttons, canvas
// clicks, and the dev harness the way a playtester would. Runs are seeded
// through the harness so every assertion is deterministic.
// Replays and rematches: recordings reproduce runs exactly, in the browser.

test('rematch: one click refights the exact battlefield, next run still rolls fresh', async ({ page }) => {
  const errors = await boot(page, 'e2e-rematch')
  const first = await page.evaluate(() => {
    const s = window.__harness.getState()
    return { seed: s.seed, biome: s.biome }
  })
  await page.evaluate(() => window.__harness.dispatch({ type: 'abandon_run' }))
  await expect(page.getByTestId('run-over')).toBeVisible()
  await page.getByTestId('tab-next').click()
  await page.getByTestId('rematch').click()
  await expect(page.getByTestId('run-over')).not.toBeVisible()
  const again = await page.evaluate(() => {
    const s = window.__harness.getState()
    return { seed: s.seed, biome: s.biome, wave: s.wave, phase: window.__harness.snapshot().phase }
  })
  expect(again.seed).toBe(first.seed) // the SAME battlefield —
  expect(again.biome).toBe(first.biome)
  expect(again.wave).toBe(0) // — fought fresh from wave zero.
  expect(again.phase).toBe('build')
  // The rematch must not sticky the seed: Begin next run still rolls new.
  await page.evaluate(() => window.__harness.dispatch({ type: 'abandon_run' }))
  await expect(page.getByTestId('run-over')).toBeVisible()
  await page.getByTestId('tab-next').click()
  await page.getByTestId('next-run').click()
  expect(await page.evaluate(() => window.__harness.getState().seed)).not.toBe(first.seed)
  expect(errors).toEqual([])
})

test('watch replay: the last run replays deterministically to the same outcome', async ({ page }) => {
  const errors = await boot(page, 'e2e-replay-watch')
  // A short real run: two towers, waves until the spire falls.
  await chooseTower(page, 'shop-arrow')
  for (const [cx, cy] of await findBuildCells(page, 2)) await clickCell(page, cx, cy)
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
  const original = await page.evaluate(() => {
    const s = window.__harness.snapshot()
    return { wave: s.wave, kills: s.kills, spireHp: s.spireHp }
  })

  // Watch: the overlay yields to the spectator banner and the battlefield
  // restarts from the top. (The replay plays in REAL time from the moment
  // it mounts, so under load a few ticks may already have elapsed by the
  // time we look — "near zero" is the honest assertion, exact zero races.)
  await page.getByTestId('watch-replay').click()
  await expect(page.getByTestId('replay-banner')).toBeVisible()
  await expect(page.getByTestId('run-over')).not.toBeVisible()
  expect((await page.evaluate(() => window.__harness.snapshot())).tick).toBeLessThan(60)

  // Spectator inputs are ignored — history cannot be changed.
  await page.evaluate(() => window.__harness.dispatch({ type: 'repair_spire' }))

  // Race the replay to its end: determinism demands the SAME outcome.
  await page.evaluate(() => {
    for (let i = 0; i < 40 && window.__harness.snapshot().phase !== 'defeat'; i++) {
      window.__harness.fastForward(300)
    }
  })
  const replayed = await page.evaluate(() => {
    const s = window.__harness.snapshot()
    return { wave: s.wave, kills: s.kills, spireHp: s.spireHp }
  })
  expect(replayed).toEqual(original)

  // Exit restores the ended live session and its run-over screen.
  await page.getByTestId('exit-replay').click()
  await expect(page.getByTestId('run-over')).toBeVisible()

  // SHARED replays: copy this run's v2 JSON, move on to a fresh run, then
  // import and watch it — it must land on the same outcome again.
  await page.getByTestId('copy-replay').click()
  const shared = await page.getByTestId('replay-json').inputValue()
  expect(JSON.parse(shared).v).toBe(3)
  await page.getByTestId('tab-next').click()
  await page.getByTestId('next-run').click()
  await expect(page.getByTestId('run-over')).not.toBeVisible()

  await page.keyboard.press('?')
  await expect(page.getByTestId('settings-modal')).toBeVisible()
  await page.getByTestId('replay-import').fill(shared)
  await page.getByTestId('watch-imported').click()
  await expect(page.getByTestId('replay-banner')).toBeVisible()
  await page.evaluate(() => {
    for (let i = 0; i < 40 && window.__harness.snapshot().phase !== 'defeat'; i++) {
      window.__harness.fastForward(300)
    }
  })
  const imported = await page.evaluate(() => {
    const s = window.__harness.snapshot()
    return { wave: s.wave, kills: s.kills, spireHp: s.spireHp }
  })
  expect(imported).toEqual(original)
  // Exit returns to the LIVE fresh run, unharmed by the spectated defeat
  // (build phase, wave 0, no towers — a few idle ticks are fine).
  await page.getByTestId('exit-replay').click()
  const live = await page.evaluate(() => window.__harness.snapshot())
  expect(live.phase).toBe('build')
  expect(live.wave).toBe(0)
  expect(live.towers).toBe(0)
  expect(errors).toEqual([])
})

test('replay links: opening a ?replay= URL spectates the exact run on arrival', async ({ page }) => {
  const errors = await boot(page, 'e2e-replay-link')
  await chooseTower(page, 'shop-arrow')
  for (const [cx, cy] of await findBuildCells(page, 2)) await clickCell(page, cx, cy)
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
  const original = await page.evaluate(() => {
    const s = window.__harness.snapshot()
    return { wave: s.wave, kills: s.kills, spireHp: s.spireHp }
  })
  await page.getByTestId('copy-replay-link').click()
  await expect(page.getByTestId('replay-json')).toBeVisible()
  const link = await page.getByTestId('replay-json').inputValue()
  expect(link).toContain('?replay=')

  // Open the link cold: the app boots and spectates immediately.
  await page.goto(link)
  await expect(page.getByTestId('replay-banner')).toBeVisible()
  await page.evaluate(() => {
    for (let i = 0; i < 40 && window.__harness.snapshot().phase !== 'defeat'; i++) {
      window.__harness.fastForward(300)
    }
  })
  const spectated = await page.evaluate(() => {
    const s = window.__harness.snapshot()
    return { wave: s.wave, kills: s.kills, spireHp: s.spireHp }
  })
  expect(spectated).toEqual(original)
  expect(errors).toEqual([])
})

test('starting a run from a replay leaves replay mode', async ({ page }) => {
  const errors = await boot(page, 'e2e-replay-exit-by-run')
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
  await page.getByTestId('watch-replay').click()
  await expect(page.getByTestId('replay-banner')).toBeVisible()
  await page.keyboard.press('Space') // begins the next run
  await expect(page.getByTestId('replay-banner')).not.toBeVisible()
  const next = await page.evaluate(() => window.__harness.snapshot())
  expect(next.phase).toBe('build')
  expect(next.wave).toBe(0)
  expect(errors).toEqual([])
})

test('reload preserves a complete replay and the timeline seeks back to the start', async ({ page }) => {
  const errors = await boot(page, 'e2e-resume-seek')
  await chooseTower(page, 'shop-arrow')
  for (const [x,y] of await findBuildCells(page, 2)) await clickCell(page,x,y)
  await page.getByTestId('start-wave').click()
  await page.evaluate(() => window.__harness.fastForward(1))
  await page.reload()
  await page.getByTestId('playfield').waitFor()
  await page.evaluate(() => {
    for (let i=0; i<30 && window.__harness.getState().phase !== 'defeat'; i++) {
      if (window.__harness.getState().phase === 'build') window.__harness.dispatch({type:'start_wave'})
      window.__harness.fastForward(300)
    }
  })
  await page.getByTestId('copy-replay').click()
  const recording = JSON.parse(await page.getByTestId('replay-json').inputValue())
  expect(recording.initial.tick).toBe(0)
  expect(recording.log.filter((c: {command:{type:string}}) => c.command.type === 'place_tower')).toHaveLength(2)
  await page.getByTestId('watch-replay').click()
  await page.getByRole('button', {name:'Pause',exact:true}).click()
  const slider = page.getByRole('slider', {name:'Replay position'})
  await slider.focus()
  await slider.press('End')
  await expect.poll(() => page.evaluate(() => window.__harness.snapshot().phase)).toBe('defeat')
  await slider.press('Home')
  await expect.poll(() => page.evaluate(() => window.__harness.snapshot().tick)).toBe(0)
  expect((await page.evaluate(() => window.__harness.snapshot())).towers).toBe(0)
  expect(errors).toEqual([])
})
