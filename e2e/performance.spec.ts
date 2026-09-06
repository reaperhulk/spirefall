import { expect, test } from '@playwright/test'
import type { GameHarness } from '../src/ui/harness'

// Same dense board for each speed. Synthetic high-HP enemies keep the load
// stable; this measures browser work, not difficulty or representative devices.
for (const speed of [1, 3, 10]) test(`dense browser profile ${speed}x`, async ({ page }, testInfo) => {
  await page.goto('/?seed=browser-profile')
  await page.getByTestId('playfield').waitFor()
  await page.getByTestId('open-menu').click()
  await page.getByRole('button', {name:'Resume game',exact:true}).click()
  const before = await page.evaluate((speed) => {
    const h = window.__harness as GameHarness
    h.setSpeed(0)
    const state = h.getState()
    state.gold = 100000
    state.spireHp = state.spireMaxHp = 100000
    state.availableTowers = ['arrow','cannon','frost','tesla','sniper','mint','beacon','lance']
    const info = h.getMapInfo()
    const route = new Set(info.path.map(c => c.cy * info.width + c.cx))
    const types = state.availableTowers
    // Keep all defenses close enough to the route to fire. Filling rows
    // from the top exercised entities but left most turrets out of range.
    const cells = info.buildable.map((yes,i) => ({yes,i,cx:i%info.width,cy:Math.floor(i/info.width)}))
      .filter(c => c.yes && !route.has(c.i))
      .map(c => ({...c,d:Math.min(...info.path.map(p => (p.cx-c.cx)**2+(p.cy-c.cy)**2))}))
      .sort((a,b) => a.d-b.d || a.i-b.i)
    for (const cell of cells) {
      if (h.getState().towers.length >= 40) break
      h.dispatch({type:'place_tower',tower:types[h.getState().towers.length % types.length]!,cell:{cx:cell.cx,cy:cell.cy}})
      h.fastForward(1/30)
    }
    h.spawnHorde(300)
    const s = h.getState()
    for (let i=0; i<s.enemies.length; i++) {
      const enemy = s.enemies[i]!, at = info.path[(i*7) % Math.max(1, info.path.length-2)]!
      enemy.pos = {x:at.cx*1000+500, y:at.cy*1000+500}
      enemy.hp = enemy.maxHp = 100000; enemy.speed = 1
    }
    s.coins = Array.from({length:100}, (_,i) => ({id:s.nextEntityId++, pos:{x:2500+(i%18)*1000,y:2500+Math.floor(i/18)*1000},gold:5,bornTick:s.tick,pulling:false}))
    h.dispatch({type:'set_beam',target:{x:8500,y:6500}})
    h.dispatch({type:'set_collect',at:{x:6500,y:6500}})
    h.resetPerformance(); h.setSpeed(speed)
    const memory = (performance as Performance & {memory?:{usedJSHeapSize:number}}).memory
    return { towers:s.towers.length, enemies:s.enemies.length, heap:memory?.usedJSHeapSize ?? null }
  }, speed)
  await expect.poll(async () => page.evaluate(() => (window.__harness as GameHarness).getPerformance().frame?.samples ?? 0), {timeout:30000}).toBeGreaterThan(90)
  // Repeated real key events through the UI, spread across simulation ticks.
  // These measure command dispatch to engine application and completed draw;
  // OS input queues and physical display scan-out are outside the measurement.
  for (let i=0; i<120; i++) {
    await page.keyboard.press(i%2 ? 'ArrowLeft' : 'ArrowRight')
    await page.waitForTimeout(35)
  }
  await expect.poll(() => page.evaluate(() => (window.__harness as GameHarness).getPerformance().inputToRender?.samples ?? 0)).toBeGreaterThanOrEqual(120)
  // One checkpoint cycle includes real serialization/storage in the profile.
  await expect.poll(async () => page.evaluate(() => (window.__harness as GameHarness).getPerformance().save?.samples ?? 0), {timeout:15000}).toBeGreaterThan(0)
  const result = await page.evaluate(() => {
    const h = window.__harness as GameHarness
    h.setSpeed(0)
    return { metrics:h.getPerformance(), firingTowers:h.getState().towers.filter(t=>t.shots>0).length, audio:h.audioState(), heap:(performance as Performance & {memory?:{usedJSHeapSize:number}}).memory?.usedJSHeapSize ?? null }
  })
  expect(before.towers).toBe(40)
  expect(before.enemies).toBe(300)
  expect(result.firingTowers).toBeGreaterThanOrEqual(20)
  expect(result.metrics.effects!.p99).toBeLessThanOrEqual(256)
  expect(result.metrics.render!.p95).toBeGreaterThan(0)
  expect(result.metrics.input!.samples).toBeGreaterThanOrEqual(120)
  expect(result.metrics.inputToRender!.p95).toBeLessThan(150)
  console.log('BROWSER_PROFILE', JSON.stringify({speed,before,...result}))
  await testInfo.attach(`browser-profile-${speed}x.json`, {body:JSON.stringify({speed,before,...result},null,2),contentType:'application/json'})
})
