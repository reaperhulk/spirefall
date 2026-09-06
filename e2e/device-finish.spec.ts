import { chooseTower, clickMenu } from './ui-helpers'
import { expect, test } from '@playwright/test'
import type { GameHarness } from '../src/ui/harness'

test('retina phone resolution follows display size, low quality, and rotation', async ({browser}) => {
  const context = await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true})
  const page = await context.newPage()
  await page.goto('/?seed=retina-resize')
  await page.getByTestId('playfield').waitFor()
  const dimensions = () => page.getByTestId('playfield').evaluate((c:HTMLCanvasElement) => ({backing:c.width,display:c.clientWidth}))
  await expect.poll(async () => (await dimensions()).display).toBeGreaterThan(340)
  await expect.poll(async () => { const d=await dimensions(); return Math.abs(d.backing - d.display*2) }).toBeLessThan(5)
  await clickMenu(page, 'open-settings')
  await page.getByLabel('Graphics quality',{exact:true}).selectOption('low')
  await page.keyboard.press('Escape')
  await expect.poll(async () => { const d=await dimensions(); return Math.abs(d.backing - d.display) }).toBeLessThan(3)
  await page.setViewportSize({width:844,height:390})
  await expect.poll(async () => { const d=await dimensions(); return Math.abs(d.backing - d.display) }).toBeLessThan(3)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  for (const name of ['cycle-target','execute-target','beam-toggle']) {
    const box = (await page.getByTestId(name).boundingBox())!
    expect(box.height).toBeGreaterThanOrEqual(44); expect(box.width).toBeGreaterThanOrEqual(44)
  }
  await page.reload()
  await page.getByTestId('playfield').waitFor()
  await expect.poll(async () => { const d=await dimensions(); return Math.abs(d.backing - d.display) }).toBeLessThan(3)
  await chooseTower(page, 'shop-arrow', true)
  const cell = await page.evaluate(() => {
    const map=(window.__harness as GameHarness).getMapInfo()
    // Use a central buildable cell to exercise touch after rotation.
    return map.buildable.map((yes,i) => ({yes,i,d:(i%map.width-map.width/2)**2+(Math.floor(i/map.width)-map.height/2)**2}))
      .filter(c => c.yes && !map.path.some(p => p.cy*map.width+p.cx===c.i)).sort((a,b) => a.d-b.d)[0]!.i
  })
  await page.getByTestId('playfield').scrollIntoViewIfNeeded()
  const field = (await page.getByTestId('playfield').boundingBox())!
  const at = {x:field.x+(cell%24+0.5)*field.width/24,y:field.y+(Math.floor(cell/24)+0.5)*field.height/14}
  expect(await page.evaluate(at => document.elementFromPoint(at.x,at.y)?.getAttribute('data-testid'),at)).toBe('playfield')
  await page.touchscreen.tap(at.x,at.y)
  await expect.poll(() => page.evaluate(() => (window.__harness as GameHarness).getState().towers.length)).toBe(1)
  await context.close()
})

test('paused scenes stop drawing but a placement cursor still updates', async ({page}) => {
  await page.goto('/?seed=idle-frame')
  await page.getByTestId('playfield').waitFor()
  // Desktop sizing also reserves height for the HUD and wave planning.
  expect((await page.getByTestId('playfield').boundingBox())!.width).toBeGreaterThanOrEqual(500)
  await page.getByRole('button',{name:'Pause',exact:true}).click()
  await page.waitForTimeout(1100)
  await page.evaluate(() => (window.__harness as GameHarness).resetPerformance())
  await expect.poll(() => page.evaluate(() => (window.__harness as GameHarness).getPerformance().idleFrame?.samples ?? 0)).toBeGreaterThan(20)
  expect(await page.evaluate(() => (window.__harness as GameHarness).getPerformance().render?.samples ?? 0)).toBeLessThan(3)
  await page.getByTestId('shop-arrow').click()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('placement-report')).not.toHaveText('')
  expect(await page.evaluate(() => (window.__harness as GameHarness).getPerformance().render?.samples ?? 0)).toBeGreaterThan(0)
})

test('touch-sized controls cycle and execute an overlapping wounded target', async ({page}) => {
  await page.goto('/?seed=target-buttons')
  await page.getByTestId('playfield').waitFor()
  await page.evaluate(() => {
    const h=window.__harness as GameHarness
    h.spawnHorde(2)
    for (const enemy of h.getState().enemies) { enemy.hp=1; enemy.maxHp=100; enemy.speed=1 }
    h.getState().spireHp=h.getState().spireMaxHp=10000
    h.fastForward(1/30)
  })
  await page.getByTestId('cycle-target').click()
  await expect(page.getByTestId('target-status')).toContainText('HP')
  await page.getByTestId('execute-target').focus()
  await page.keyboard.press('Space')
  await expect.poll(() => page.evaluate(() => (window.__harness as GameHarness).getState().executeCd)).toBeGreaterThan(0)
  await expect(page.getByTestId('execute-target')).toBeDisabled()
})

test('repeated dense sessions release retained heap and keep audio alive', async ({page},testInfo) => {
  test.setTimeout(90000)
  await page.goto('/?seed=memory-soak')
  await page.getByTestId('playfield').waitFor()
  await page.getByTestId('open-menu').click()
  await page.getByRole('button',{name:'Resume game',exact:true}).click()
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Performance.enable')
  const samples = []
  for (let cycle=0; cycle<10; cycle++) {
    await page.evaluate(cycle => {
      const h=window.__harness as GameHarness
      h.newRun(`soak-${cycle}`)
      h.spawnHorde(300)
      const s=h.getState(); s.spireHp=s.spireMaxHp=100000
      for (const e of s.enemies) { e.hp=e.maxHp=100000; e.speed=5 }
      h.dispatch({type:'set_beam',target:{x:8500,y:6500}})
      h.setSpeed(3)
    },cycle)
    await page.waitForTimeout(3000)
    await cdp.send('HeapProfiler.collectGarbage')
    const metrics = await cdp.send('Performance.getMetrics')
    samples.push({cycle,heap:metrics.metrics.find(m => m.name==='JSHeapUsedSize')!.value,nodes:metrics.metrics.find(m => m.name==='Nodes')?.value ?? null})
  }
  const growth = samples.at(-1)!.heap - Math.min(...samples.slice(2,5).map(s => s.heap))
  expect(growth).toBeLessThan(12*1024*1024)
  expect(await page.evaluate(() => (window.__harness as GameHarness).audioState())).toBe('running')
  console.log('MEMORY_PROFILE',JSON.stringify({seconds:30,forcedGc:true,samples,retainedGrowth:growth}))
  await testInfo.attach('memory-profile.json',{body:JSON.stringify({seconds:30,forcedGc:true,samples,retainedGrowth:growth},null,2),contentType:'application/json'})
})
