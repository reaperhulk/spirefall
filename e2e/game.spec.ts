import { expect, test, type Page } from '@playwright/test'

// UI smoke suite (PLAN.md §5.7): deliberately shallow on game logic — that
// lives in the headless suites — but drives the REAL input path: buttons,
// canvas clicks, and the dev harness the way a playtester would. Runs are
// seeded through the harness so every assertion is deterministic.

// Logical grid dimensions (src/data/maps.ts). Cell pixel size is derived
// from the live bounding box on every click — the canvas is responsive, so
// a hardcoded pixel size drifts whenever layout shifts (fonts, hint banner).
const MAP_W = 24
const MAP_H = 14

declare global {
  interface Window {
    __harness: {
      getState: () => {
        phase: string
        wave: number
        biome: string
        crucible: number
        gold: number
        towers: { id: number; tier: number; spec: string | null; cell: { cx: number; cy: number } }[]
        enemies: unknown[]
        relicOffer: unknown[] | null
      }
      snapshot: () => {
        tick: number
        phase: string
        wave: number
        gold: number
        spireHp: number
        towers: number
        enemies: number
        kills: number
        metaSparks: number
        runs: number
      }
      dispatch: (command: unknown) => void
      fastForward: (seconds: number) => void
      newRun: (seed?: string) => void
      getMeta: () => { sparks: number; cycleVictories: number }
      getMapInfo: () => {
        width: number
        height: number
        spawn: { cx: number; cy: number }
        spire: { cx: number; cy: number }
        buildable: boolean[]
      }
      buyMeta: (id: string) => void
      setSpeed: (n: number) => void
      getSpeed: () => number
      getReplay: () => { seed: string; log: unknown[] }
      audioState: () => string
      audioLive: () => boolean
      reset: () => void
    }
  }
}

async function boot(page: Page, seed: string) {
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

async function cellPoint(page: Page, cx: number, cy: number) {
  const box = (await page.locator('[data-testid="playfield"]').boundingBox())!
  return { x: box.x + ((cx + 0.5) * box.width) / MAP_W, y: box.y + ((cy + 0.5) * box.height) / MAP_H }
}

async function clickCell(page: Page, cx: number, cy: number) {
  const p = await cellPoint(page, cx, cy)
  await page.mouse.click(p.x, p.y)
}

async function tapCell(page: Page, cx: number, cy: number) {
  const p = await cellPoint(page, cx, cy)
  await page.touchscreen.tap(p.x, p.y)
}

// Battlefields are GENERATED per seed now — specs that just need "somewhere
// legal to build" derive cells from the live map instead of pinning layouts:
// open cells flanking the gate's row, spread across columns so a handful of
// towers never walls off the path.
async function findBuildCells(page: Page, n: number): Promise<[number, number][]> {
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
  await page.getByTestId('shop-arrow').click()
  await clickCell(page, 7, 5)
  await clickCell(page, 8, 5)
  await clickCell(page, 9, 5)
  // Commands apply on the session's next animation frame — poll the count
  // first. (An early toContainText('50') would match the transient '150'.)
  await expect.poll(async () => (await page.evaluate(() => window.__harness.snapshot())).towers).toBe(3)
  await expect(page.getByTestId('gold')).toHaveText(/^⛀ 50$/)
  // Clicking a tower opens its panel; upgrade button is visible but too
  // expensive right now (50 gold left, upgrade costs 60).
  await page.keyboard.press('Escape')
  await clickCell(page, 7, 5)
  await expect(page.getByTestId('tower-panel')).toBeVisible()
  await expect(page.getByTestId('upgrade-tower')).toBeDisabled()
  expect(errors).toEqual([])
})

test('a defended wave plays out: enemies die, bounties arrive, build phase returns', async ({ page }) => {
  const errors = await boot(page, 'e2e-wave')
  // Four towers around the path mouth — the horde is dense, two won't hold.
  await page.getByTestId('shop-arrow').click()
  await clickCell(page, 4, 5)
  await clickCell(page, 4, 7)
  await clickCell(page, 5, 5)
  await clickCell(page, 5, 7)
  await page.getByTestId('start-wave').click()
  await page.evaluate(() => window.__harness.fastForward(120))
  const snap = await page.evaluate(() => window.__harness.snapshot())
  expect(snap.phase).toBe('build')
  expect(snap.wave).toBe(1)
  expect(snap.kills).toBeGreaterThan(5) // a horde died out there
  expect(snap.spireHp).toBeGreaterThanOrEqual(8) // a defended spire stays near-intact

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
  await page.getByTestId('shop-arrow').click()
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
  expect(errors).toEqual([])
})

test('wave preview warns about the coming boss mechanic', async ({ page }) => {
  const errors = await boot(page, 'e2e-boss-preview')
  // Jump the schedule to wave 9's build phase: the preview now scouts the
  // wave-10 boss (Spirebreaker, carapace) and must warn about the shell.
  await page.evaluate(() => {
    window.__harness.getState().wave = 9
    window.__harness.fastForward(1) // one tick republishes the preview
  })
  await expect(page.getByTestId('preview-unit-boss')).toBeVisible()
  await expect(page.getByTestId('mech-mark-boss')).toBeVisible()
  await expect(page.getByTestId('mech-mark-boss')).toHaveAttribute('title', /Carapace/)

  // And the endless-tier phaser: wave 39's preview scouts Veilwarden.
  await page.evaluate(() => {
    window.__harness.getState().wave = 39
    window.__harness.fastForward(1)
  })
  await expect(page.getByTestId('phase-mark-boss4')).toBeVisible()
  await expect(page.getByTestId('phase-mark-boss4')).toHaveAttribute('title', /Phasing/)
  expect(errors).toEqual([])
})

test('watch replay: the last run replays deterministically to the same outcome', async ({ page }) => {
  const errors = await boot(page, 'e2e-replay-watch')
  // A short real run: two towers, waves until the spire falls.
  await page.getByTestId('shop-arrow').click()
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
  // restarts from tick 0.
  await page.getByTestId('watch-replay').click()
  await expect(page.getByTestId('replay-banner')).toBeVisible()
  await expect(page.getByTestId('run-over')).not.toBeVisible()
  expect((await page.evaluate(() => window.__harness.snapshot())).tick).toBe(0)

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
  expect(JSON.parse(shared).v).toBe(2)
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
  await page.getByTestId('shop-arrow').click()
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

test('relic offers appear in the UI and apply on click', async ({ page }) => {
  const errors = await boot(page, 'e2e-relic-a')
  // Actually play: each build phase, buy/upgrade arrows, then send the wave —
  // waves are lethal enough now that a static two-tower setup dies before the
  // wave-5 relic offer.
  await page.evaluate(() => {
    // Freeze the real-time clock: every tick below comes from fastForward, so
    // the whole scripted playthrough is deterministic regardless of rAF timing.
    window.__harness.setSpeed(0)
    // Derive spots from the generated battlefield: open cells flanking the
    // gate's row, one per column, walking outward from the gate.
    const info = window.__harness.getMapInfo()
    const spots: [number, number][] = []
    for (let cx = 2; cx < info.width - 2 && spots.length < 6; cx++) {
      for (const dy of [-1, 1, -2, 2]) {
        const cy = info.spawn.cy + dy
        if (cy < 0 || cy >= info.height) continue
        if (info.buildable[cy * info.width + cx] && !spots.some(([x]) => x === cx)) {
          spots.push([cx, cy])
          break
        }
      }
    }
    const act = (): boolean => {
      const s = window.__harness.getState()
      if (s.towers.length < 4 && s.gold >= 50) {
        const [cx, cy] = spots[s.towers.length]!
        window.__harness.dispatch({ type: 'place_tower', tower: 'arrow', cell: { cx, cy } })
        return true
      }
      const tierOne = s.towers.find((t) => t.tier === 1)
      if (tierOne && s.gold >= 60) {
        window.__harness.dispatch({ type: 'upgrade_tower', id: tierOne.id })
        return true
      }
      const tierTwo = s.towers.find((t) => t.tier === 2)
      if (tierTwo && s.gold >= 140) {
        window.__harness.dispatch({ type: 'upgrade_tower', id: tierTwo.id })
        return true
      }
      if (s.towers.length < spots.length && s.gold >= 50) {
        const [cx, cy] = spots[s.towers.length]!
        window.__harness.dispatch({ type: 'place_tower', tower: 'arrow', cell: { cx, cy } })
        return true
      }
      return false
    }
    for (let guard = 0; guard < 10; guard++) {
      const s = window.__harness.getState()
      if (s.phase !== 'build' || s.relicOffer !== null) break
      while (act()) window.__harness.fastForward(1)
      window.__harness.dispatch({ type: 'start_wave' })
      window.__harness.fastForward(600)
    }
  })
  const snap = await page.evaluate(() => window.__harness.snapshot())
  expect(snap.phase).toBe('build') // survived through wave 5
  await expect(page.getByTestId('relic-modal')).toBeVisible()
  await page.locator('.relic-card').first().click()
  await page.evaluate(() => window.__harness.fastForward(1)) // clock is frozen; process the choice
  await expect(page.getByTestId('relic-modal')).not.toBeVisible()
  const after = await page.evaluate(() => window.__harness.snapshot())
  expect(after.relics.length).toBe(1)
  expect(errors).toEqual([])
})

test('an armed but unaffordable shop selection never traps you', async ({ page }) => {
  const errors = await boot(page, 'e2e-trap')
  // Spend everything: four arrows at 50 each leaves 0 gold with arrow armed.
  await page.getByTestId('shop-arrow').click()
  await clickCell(page, 4, 5)
  await clickCell(page, 4, 7)
  await clickCell(page, 5, 5)
  await clickCell(page, 5, 7)
  await expect.poll(async () => (await page.evaluate(() => window.__harness.snapshot())).gold).toBe(0)

  // The unaffordable card must still toggle the selection off...
  await expect(page.getByTestId('shop-arrow')).toBeEnabled()
  await page.getByTestId('shop-arrow').click()
  await clickCell(page, 4, 5)
  await expect(page.getByTestId('tower-panel')).toBeVisible() // click selects, not places

  // ...and clicking an existing tower while re-armed inspects it directly.
  await page.getByTestId('shop-arrow').click()
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
  await page.getByRole('button', { name: '10×' }).click()
  expect(await page.evaluate(() => window.__harness.getSpeed())).toBe(10)

  page.on('dialog', (dialog) => dialog.accept())
  await page.getByTestId('abandon-run').click()
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

test.describe('touch', () => {
  test.use({ hasTouch: true })

  test('tower popups dismiss on touch: ✕ closes the panel, tooltips never stick', async ({ page }) => {
    const errors = await boot(page, 'e2e-touch')
    await page.getByTestId('shop-arrow').tap()
    await tapCell(page, 7, 5)
    await expect.poll(async () => (await page.evaluate(() => window.__harness.snapshot())).towers).toBe(1)

    // Disarm, then tap the tower: the panel opens and no hover tooltip sticks.
    await page.getByTestId('shop-arrow').tap()
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
    await page.getByTestId('shop-arrow').tap()

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
// sideways on touch), and every HUD control must sit fully on screen —
// at boot, with the tower panel open, and during a live wave.
const STANDARD_VIEWPORTS: [string, number, number][] = [
  ['phone-small', 375, 667],
  ['phone', 390, 844],
  ['phone-large', 412, 915],
  ['tablet-portrait', 768, 1024],
  ['tablet-landscape', 1024, 768],
  ['desktop', 1280, 720],
]

const HUD_CONTROLS = [
  'mute',
  'daily-run',
  'open-stats',
  'open-codex',
  'open-tree',
  'open-settings',
  'abandon-run',
  'start-wave',
  'auto-start',
  'repair-spire',
  'shop-arrow',
  'shop-beacon', // the LAST tower card: all seven must share the row, never scroll off-edge
]

for (const [name, width, height] of STANDARD_VIEWPORTS) {
  test.describe(`layout @ ${name} (${width}×${height})`, () => {
    test.use({ viewport: { width, height } })

    test('no horizontal overflow; every control fully on screen', async ({ page }) => {
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
            expect(preview.scrollW, `${phase}: wave preview scrolls internally`).toBeLessThanOrEqual(preview.clientW + 1)
          }
        }
      }

      await assertLayout('build phase')

      // Tower panel open (a bottom sheet on phones) must not break layout.
      await page.getByTestId('shop-arrow').click()
      await clickCell(page, 4, 5)
      await expect.poll(async () => (await page.evaluate(() => window.__harness.snapshot())).towers).toBe(1)
      await page.getByTestId('shop-arrow').click() // disarm
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
      for (const id of ['map-select', 'trial-select', 'next-run']) {
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
    await page.getByTestId('shop-arrow').click()
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
    await page.getByTestId('shop-arrow').tap()
    await tapCell(page, 7, 5)
    await expect.poll(async () => (await page.evaluate(() => window.__harness.snapshot())).towers).toBe(1)
    await page.getByTestId('shop-arrow').tap() // disarm
    await tapCell(page, 7, 5)
    await expect(page.getByTestId('tower-panel')).toBeVisible()

    // Playwright refuses to tap covered controls — these prove the panel
    // wins the stacking fight with the shop cards beneath it.
    await page.getByTestId('upgrade-tower').tap()
    await expect.poll(async () => (await page.evaluate(() => window.__harness.getState())).towers[0]!.tier).toBe(2)
    await page.getByTestId('close-tower-panel').tap()
    await expect(page.getByTestId('tower-panel')).not.toBeVisible()

    // With the sheet gone, the shop is interactive again.
    await page.getByTestId('shop-cannon').tap()
    await expect(page.getByTestId('shop-cannon')).toHaveClass(/selected/)
    expect(errors).toEqual([])
  })

  test('a touch tap unlocks the audio context', async ({ page }) => {
    // Touch grants user activation on pointerup/touchend — NOT pointerdown
    // (which only counts for mouse). This pins the unlock listeners against
    // regressing to a desktop-only set that leaves phones silent.
    const errors = await boot(page, 'e2e-mobile-audio')
    await page.getByTestId('shop-arrow').tap()
    await expect.poll(() => page.evaluate(() => window.__harness.audioState())).toBe('running')
    // Not just claimed — PROBED: the audio clock was observed advancing.
    await expect.poll(() => page.evaluate(() => window.__harness.audioLive())).toBe(true)
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

test('sound button reflects PROBED audio state: pending on load, live after a gesture, mute intent honored', async ({
  page,
}) => {
  const errors = await boot(page, 'e2e-audio-state')
  // No gesture has happened (boot drives the page via evaluate) — the
  // button must not claim working audio it cannot have.
  await expect(page.getByTestId('mute')).toHaveText('🔈')
  expect(await page.evaluate(() => window.__harness.audioLive())).toBe(false)

  // Clicking the pending button means "I want sound": the click unlocks the
  // context and the probe flips the icon — it must NOT mute instead.
  await page.getByTestId('mute').click()
  await expect(page.getByTestId('mute')).toHaveText('🔊')
  await expect.poll(() => page.evaluate(() => window.__harness.audioLive())).toBe(true)

  // Live now: the same button is a plain mute toggle again.
  await page.getByTestId('mute').click()
  await expect(page.getByTestId('mute')).toHaveText('🔇')
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
  await page.getByTestId('shop-cannon').click()
  const [[scx, scy]] = await findBuildCells(page, 1)
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
  await page.getByTestId('open-settings').click()
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
  await page.getByTestId('shop-arrow').click()
  await clickCell(page, 7, 5)
  await expect.poll(async () => (await page.evaluate(() => window.__harness.snapshot())).towers).toBe(1)

  await page.getByTestId('open-settings').click()
  await page.getByTestId('export-save').click()
  const code = await page.getByTestId('transfer-code').inputValue()
  expect(code.length).toBeGreaterThan(50)

  // Nuke everything, then import the code back.
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.waitForSelector('[data-testid="playfield"]')
  expect((await page.evaluate(() => window.__harness.snapshot())).towers).toBe(0)
  page.on('dialog', (d) => d.accept())
  await page.getByTestId('open-settings').click()
  await page.getByTestId('transfer-code').fill(code)
  await page.getByTestId('import-save').click()
  await page.waitForSelector('[data-testid="playfield"]')
  await expect.poll(async () => (await page.evaluate(() => window.__harness.snapshot())).towers).toBe(1)

  // Garbage codes are rejected without nuking anything.
  await page.getByTestId('open-settings').click()
  await page.getByTestId('transfer-code').fill('not-a-save')
  await page.getByTestId('import-save').click()
  await expect(page.getByTestId('import-failed')).toBeVisible()
  expect(errors).toEqual([])
})

test('first-run hints guide placement, then retire forever', async ({ page }) => {
  const errors = await boot(page, 'e2e-hints')
  await expect(page.getByTestId('hint')).toContainText('Pick a tower')
  await page.getByTestId('shop-arrow').click()
  await clickCell(page, 7, 5)
  await clickCell(page, 8, 5)
  await expect(page.getByTestId('hint')).toContainText('Send the wave')
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
  await page.getByTestId('shop-arrow').click()
  for (const [cx, cy] of [[4, 5], [4, 7], [5, 5], [5, 7]]) {
    await clickCell(page, cx!, cy!)
  }
  await page.getByTestId('auto-start').click()
  await page.getByTestId('start-wave').click()
  await page.evaluate(() => window.__harness.fastForward(120)) // clear wave 1
  // Without touching anything, wave 2 should start on its own.
  await expect.poll(async () => (await page.evaluate(() => window.__harness.snapshot())).wave, { timeout: 8000 }).toBe(2)
  expect(errors).toEqual([])
})

test('daily run: shared date seed, best-of-today recorded', async ({ page }) => {
  const errors = await boot(page, 'e2e-daily')
  page.on('dialog', (d) => d.accept())
  await page.getByTestId('daily-run').click()
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

test('codex: opens from the HUD, focuses an enemy from a preview chip, Escape closes', async ({ page }) => {
  const errors = await boot(page, 'e2e-wave')
  await page.locator('.hint-close').click()

  // HUD button → full reference with all four tabs.
  await page.getByTestId('open-codex').click()
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
  await page.getByTestId('open-codex').click()
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

test('the Crucible: cycle victories harden the next run and surface in the HUD', async ({ page }) => {
  const errors = await boot(page, 'e2e-wave')
  await page.locator('.hint-close').click()

  // No victories yet: no badge, no fire on the tree button.
  await expect(page.getByTestId('crucible')).not.toBeVisible()
  await expect(page.getByTestId('open-tree')).not.toContainText('🔥')

  // Two victories this cycle -> the next run is Crucible II.
  await page.evaluate(() => {
    window.__harness.getMeta().cycleVictories = 2
    window.__harness.newRun('e2e-crucible')
  })
  await expect(page.getByTestId('crucible')).toBeVisible()
  await expect(page.getByTestId('crucible')).toContainText('Crucible II')
  await expect(page.getByTestId('open-tree')).toContainText('🔥')
  expect(await page.evaluate(() => window.__harness.getState().crucible)).toBe(2)
  expect(errors).toEqual([])
})

test('tier-3 specialization: the panel offers both paths, the pick sticks', async ({ page }) => {
  const errors = await boot(page, 'e2e-wave')
  await page.locator('.hint-close').click()
  const [[cx, cy]] = await findBuildCells(page, 1)
  await page.evaluate(
    ([x, y]) => {
      const h = window.__harness
      h.getState().gold = 5000
      h.dispatch({ type: 'place_tower', tower: 'arrow', cell: { cx: x, cy: y } })
    },
    [cx, cy] as const,
  )
  await expect.poll(async () => (await page.evaluate(() => window.__harness.snapshot())).towers).toBe(1)
  await page.evaluate(() => {
    const h = window.__harness
    const id = h.getState().towers[0]!.id
    h.dispatch({ type: 'upgrade_tower', id })
    h.dispatch({ type: 'upgrade_tower', id })
  })
  await expect.poll(async () => await page.evaluate(() => window.__harness.getState().towers[0]!.tier)).toBe(3)

  await clickCell(page, cx!, cy!)
  await expect(page.getByTestId('tower-panel')).toBeVisible()
  await expect(page.getByTestId('spec-volley')).toBeVisible()
  await expect(page.getByTestId('spec-longbow')).toBeVisible()
  await page.getByTestId('spec-volley').click()
  await expect(page.getByTestId('tower-panel')).toContainText('Volley')
  await expect(page.getByTestId('spec-volley')).not.toBeVisible() // committed
  expect(await page.evaluate(() => window.__harness.getState().towers[0]!.spec)).toBe('volley')
  expect(errors).toEqual([])
})
