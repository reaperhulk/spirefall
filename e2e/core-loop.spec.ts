import { expect, test } from '@playwright/test'
import { boot, chooseTower, clickCell, clickMenu, findBuildCells } from './ui-helpers'

// UI suite (PLAN.md §5.7): deliberately shallow on game logic — that lives in
// the headless suites — but drives the REAL input path: buttons, canvas
// clicks, and the dev harness the way a playtester would. Runs are seeded
// through the harness so every assertion is deterministic.
// The core loop through the real UI: boot, build, waves, defeat, the next run.

test('deep links: ?seed starts that exact run, ?daily starts the shared seed', async ({ page }) => {
  await page.goto('/?seed=challenge-me')
  await page.waitForSelector('[data-testid="playfield"]')
  expect(await page.evaluate(() => window.__harness.getReplay().seed)).toBe('challenge-me')
  // The param is stripped so a reload resumes normally instead of restarting.
  expect(await page.evaluate(() => window.location.search)).toBe('')

  await page.goto('/?daily=1')
  await page.waitForSelector('[data-testid="playfield"]')
  const seed = await page.evaluate(() => window.__harness.getReplay().seed)
  expect(seed).toMatch(/^daily-\d{4}-\d{2}-\d{2}$/)

  // Challenge links carry the FULL ruleset: a fresh account (only Verdant
  // unlocked) still lands on the sharer's biome, hardships included —
  // otherwise "same seed, same battlefield" is a lie between accounts.
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?seed=cross-account&biome=frostfen&trials=no_mercy,glass_spire')
  await page.waitForSelector('[data-testid="playfield"]')
  const linked = await page.evaluate(() => {
    const s = window.__harness.getState()
    return { seed: s.biome, trials: s.trials }
  })
  expect(linked.seed).toBe('frostfen')
  expect(linked.trials.sort()).toEqual(['glass_spire', 'no_mercy'])
})

test('boots clean: canvas, HUD, and harness all present, no console errors', async ({ page }) => {
  const errors = await boot(page, 'e2e-boot')
  await expect(page.getByTestId('gold')).toContainText('200')
  await expect(page.getByTestId('spire-hp')).toContainText('10/10')
  await expect(page.getByTestId('wave-label')).toContainText('Wave 0/')
  await expect(page.getByTestId('start-wave')).toBeVisible()
  // The scouting report shows what wave 1 will field before it's sent.
  await expect(page.getByTestId('wave-preview')).toContainText('Next wave:')
  await expect(page.locator('.preview-unit').first()).toBeVisible()
  const snap = await page.evaluate(() => window.__harness.snapshot())
  expect(snap.phase).toBe('build')
  expect(errors).toEqual([])
})

test('placing a tower via real shop + canvas clicks spends gold', async ({ page }) => {
  const errors = await boot(page, 'e2e-place')
  await chooseTower(page, 'shop-arrow')
  const cells = await findBuildCells(page, 3)
  for (const [cx, cy] of cells) await clickCell(page, cx, cy)
  // Commands apply on the session's next animation frame — poll the count
  // first. (An early toContainText('50') would match the transient '150'.)
  await expect.poll(async () => (await page.evaluate(() => window.__harness.snapshot())).towers).toBe(3)
  await expect(page.getByTestId('gold')).toHaveText(/^⛀ 50$/)
  // Clicking a tower opens its panel; upgrade button is visible but too
  // expensive right now (50 gold left, upgrade costs 60).
  await page.keyboard.press('Escape')
  await clickCell(page, ...cells[0]!)
  await expect(page.getByTestId('tower-panel')).toBeVisible()
  await expect(page.getByTestId('upgrade-tower')).toBeDisabled()
  // The price shows its goods: the preview states the tier-2 arrow delta
  // straight from the tower table (7→15 dmg, 2.0→2.5 shots/s, 2.8→3.2 range).
  await expect(page.getByTestId('upgrade-preview')).toHaveText(
    'Next: DMG 7 → 15 · 2.0 → 2.5 shots/s · range 2.8 → 3.2',
  )
  expect(errors).toEqual([])
})

test('a defended wave plays out: enemies die, bounties arrive, build phase returns', async ({ page }) => {
  const errors = await boot(page, 'e2e-wave')
  // Four towers around the path mouth — the horde is dense, two won't hold.
  await chooseTower(page, 'shop-arrow')
  await clickCell(page, 4, 5)
  await clickCell(page, 4, 7)
  await clickCell(page, 5, 5)
  await clickCell(page, 5, 7)
  await page.getByTestId('start-wave').click()
  // The invisible narrator announces the wave for screen readers.
  await expect(page.getByTestId('sr-status')).toContainText('Wave 1 started')
  await page.evaluate(() => window.__harness.fastForward(120))
  const snap = await page.evaluate(() => window.__harness.snapshot())
  expect(snap.phase).toBe('build')
  expect(snap.wave).toBe(1)
  expect(snap.kills).toBeGreaterThan(5) // a horde died out there
  expect(snap.spireHp).toBeGreaterThanOrEqual(8) // a defended spire stays near-intact
  await expect(page.getByTestId('sr-status')).toContainText('Wave cleared')
  await expect(page.getByTestId('shop-arrow')).not.toHaveClass(/selected/)
  await expect(page.getByTestId('wave-debrief')).toBeVisible()

  // Mid-run stats: the S key opens live analytics with a sparks estimate.
  await page.keyboard.press('s')
  await expect(page.getByTestId('run-stats')).toBeVisible()
  const statsSparks = await page.getByTestId('stats-sparks').textContent()
  expect(Number(statsSparks!.replace(/\D/g, ''))).toBeGreaterThan(0)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('run-stats')).not.toBeVisible()
  expect(errors).toEqual([])
})

test('the rogue-lite loop closes in the browser: defeat → sparks → spire tree → stronger next run', async ({
  page,
}) => {
  const errors = await boot(page, 'e2e-loop')
  // Mount a light defense — sparks pay for PROGRESS (waves cleared + kills),
  // so a totally undefended collapse would bank nothing to spend below.
  await chooseTower(page, 'shop-arrow')
  for (const [cx, cy] of await findBuildCells(page, 4)) await clickCell(page, cx, cy)
  // Then send waves until the spire falls (fastForward is instant).
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

  // The shareable run card renders, and both share buttons acknowledge.
  await expect(page.getByTestId('run-card')).toBeVisible()
  await page.getByTestId('copy-challenge').click()
  await expect(page.getByTestId('copy-challenge')).toContainText('copied')
  await page.getByTestId('copy-card').click()
  await expect(page.getByTestId('copy-card')).toContainText('copied')

  // The replay button exposes seed + the full command log as JSON.
  await page.getByTestId('copy-replay').click()
  const replay = JSON.parse(await page.getByTestId('replay-json').inputValue()) as {
    seed: string
    log: { command: { type: string } }[]
  }
  expect(replay.seed).toBe('e2e-loop')
  expect(replay.log.some((c) => c.command.type === 'place_tower')).toBe(true)
  expect(replay.log.some((c) => c.command.type === 'start_wave')).toBe(true)

  // Spend sparks on starting gold (Spire Tree tab), pick a biome and trial
  // (Next Run tab), then begin. (A fresh account has only Verdant unlocked —
  // the picker's other biomes are disabled, which this select would fail on.)
  await page.getByTestId('tab-tree').click()
  // The tree is a graph now: select the node, then buy from its panel.
  await page.getByTestId('gnode-starting_gold').click()
  await page.getByTestId('buy-starting_gold').click()
  await page.getByTestId('tab-next').click()
  await page.getByTestId('map-select').selectOption('verdant')
  await page.getByTestId('trial-select').selectOption('glass_spire')
  await page.getByTestId('next-run').click()
  expect(await page.evaluate(() => window.__harness.getState().biome)).toBe('verdant')
  const trialState = await page.evaluate(() => {
    const s = window.__harness.getState()
    return { trials: s.trials, maxHp: s.spireMaxHp }
  })
  expect(trialState.trials).toEqual(['glass_spire'])
  await expect(page.getByTestId('trials')).toContainText('Glass Spire')
  const snap = await page.evaluate(() => window.__harness.snapshot())
  expect(snap.phase).toBe('build')
  expect(snap.wave).toBe(0)
  expect(snap.gold).toBe(230) // 200 base + 30 from War Chest level 1
  expect(snap.runs).toBe(1)

  // Trials STACK (the codex promise) — and Blackout darkens the scouting
  // report: no counts, no threat estimate.
  await page.evaluate(() => window.__harness.dispatch({ type: 'abandon_run' }))
  await expect(page.getByTestId('run-over')).toBeVisible()
  await page.getByTestId('tab-next').click()
  await page.getByTestId('trial-select').selectOption(['blackout', 'iron_horde'])
  await page.getByTestId('next-run').click()
  expect((await page.evaluate(() => window.__harness.getState().trials)).sort()).toEqual(['blackout', 'iron_horde'])
  await expect(page.getByTestId('blackout-report')).toBeVisible()
  await expect(page.getByTestId('wave-preview')).not.toContainText('HP')
  expect(errors).toEqual([])
})

test('an armed but unaffordable shop selection never traps you', async ({ page }) => {
  const errors = await boot(page, 'e2e-trap')
  // Spend everything: four arrows at 50 each leaves 0 gold with arrow armed.
  await chooseTower(page, 'shop-arrow')
  await clickCell(page, 4, 5)
  await clickCell(page, 4, 7)
  await clickCell(page, 5, 5)
  await clickCell(page, 5, 7)
  await expect.poll(async () => (await page.evaluate(() => window.__harness.snapshot())).gold).toBe(0)

  // The unaffordable card must still toggle the selection off...
  await expect(page.getByTestId('shop-arrow')).toBeEnabled()
  await chooseTower(page, 'shop-arrow')
  await clickCell(page, 4, 5)
  await expect(page.getByTestId('tower-panel')).toBeVisible() // click selects, not places

  // ...and clicking an existing tower while re-armed inspects it directly.
  await page.getByTestId('close-tower-panel').click()
  await chooseTower(page, 'shop-arrow')
  await clickCell(page, 4, 7)
  await expect(page.getByTestId('tower-panel')).toBeVisible()
  const snap = await page.evaluate(() => window.__harness.snapshot())
  expect(snap.towers).toBe(4) // no phantom placements happened
  expect(errors).toEqual([])
})

test('give up ends the run, zero-progress abandons pay zero sparks, and high speeds are selectable', async ({
  page,
}) => {
  const errors = await boot(page, 'e2e-giveup')
  await page.getByTestId('game-speed').selectOption('10')
  expect(await page.evaluate(() => window.__harness.getSpeed())).toBe(10)

  // Cancel first: the dialog must be a real question, not a speed bump.
  await clickMenu(page, 'abandon-run')
  await page.getByTestId('confirm-no').click()
  await expect(page.getByTestId('confirm-modal')).not.toBeVisible()
  expect((await page.evaluate(() => window.__harness.snapshot())).phase).toBe('build') // run unharmed

  await clickMenu(page, 'abandon-run')
  await page.getByTestId('confirm-yes').click() // in-app confirm, not window.confirm
  await expect(page.getByTestId('run-over')).toBeVisible()
  // Exploit guard: giving up before clearing anything must earn NOTHING —
  // otherwise mashing "give up → next run" farms unlimited sparks.
  const sparksText = await page.getByTestId('sparks-earned').textContent()
  expect(Number(sparksText!.replace(/\D/g, ''))).toBe(0)
  await page.getByTestId('tab-next').click()
  await page.getByTestId('next-run').click()
  const snap = await page.evaluate(() => window.__harness.snapshot())
  expect(snap.phase).toBe('build')
  expect(snap.runs).toBe(1)

  // A second finished run makes the career sparkline appear in Settings.
  await page.evaluate(() => window.__harness.dispatch({ type: 'abandon_run' }))
  await expect(page.getByTestId('run-over')).toBeVisible()
  await page.keyboard.press('?')
  await expect(page.getByTestId('history-spark')).toBeVisible()
  expect(await page.locator('[data-testid="history-spark"] rect').count()).toBe(2)
  expect(errors).toEqual([])
})

test('first-run hints guide placement, then retire forever', async ({ page }) => {
  const errors = await boot(page, 'e2e-hints')
  await expect(page.getByTestId('hint')).toContainText('Build beside the lit path')
  await chooseTower(page, 'shop-arrow')
  await clickCell(page, 7, 5)
  await clickCell(page, 8, 5)
  await expect(page.getByTestId('hint')).toContainText('Send the wave')
  // Waves 1 and 2: gold economy, then the ability nudge mid-wave-2 — the
  // footer buttons players most often never discover on their own.
  await page.getByTestId('start-wave').click()
  await page.evaluate(() => window.__harness.fastForward(90))
  await expect(page.getByTestId('hint')).toContainText('Check the wave report')
  await page.getByTestId('start-wave').click()
  await expect(page.getByTestId('hint')).toContainText('Meteor')
  // Dismiss kills hints permanently, across reloads.
  await page.locator('.hint-close').click()
  await expect(page.getByTestId('hint')).not.toBeVisible()
  await page.reload()
  await page.waitForSelector('[data-testid="playfield"]')
  await expect(page.getByTestId('hint')).not.toBeVisible()
  expect(errors).toEqual([])
})

test('auto-advance sends the next wave by itself', async ({ page }) => {
  const errors = await boot(page, 'e2e-auto')
  await chooseTower(page, 'shop-arrow')
  for (const [cx, cy] of [[4, 5], [4, 7], [5, 5], [5, 7]]) {
    await clickCell(page, cx!, cy!)
  }
  await clickMenu(page, 'auto-start')
  await page.getByTestId('start-wave').click()
  await page.evaluate(() => window.__harness.fastForward(120)) // clear wave 1
  // Without touching anything, wave 2 should start on its own.
  await expect.poll(async () => (await page.evaluate(() => window.__harness.snapshot())).wave, { timeout: 8000 }).toBe(2)
  expect(errors).toEqual([])
})

test('daily run: shared date seed, best-of-today recorded', async ({ page }) => {
  const errors = await boot(page, 'e2e-daily')
  await clickMenu(page, 'daily-run')
  await page.getByTestId('confirm-yes').click() // in-app confirm, not window.confirm
  const today = new Date().toISOString().slice(0, 10)
  await expect.poll(async () => await page.evaluate(() => window.__harness.getReplay().seed)).toBe(`daily-${today}`)

  // Die undefended; the daily best (0 waves is still a record) is stored.
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
  const stored = await page.evaluate(() => localStorage.getItem('spirefall-daily'))
  expect(JSON.parse(stored!).date).toBe(today)
  expect(JSON.parse(stored!).streak).toBe(1) // first day of a fresh chain
  expect(errors).toEqual([])
})
