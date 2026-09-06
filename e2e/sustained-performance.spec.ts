import { expect, test } from '@playwright/test'
import type { GameHarness } from '../src/ui/harness'

// CPU and screen emulation, not a claim about a particular physical phone.
// Sixty seconds retains steady enemy load while real pointer events measure
// dispatch-to-draw latency in six separate windows, including audio and saves.
for (const profile of [
  {name:'desktop',width:1280,height:720,dpr:1,cpu:2,touch:false},
  {name:'phone',width:390,height:844,dpr:3,cpu:4,touch:true},
]) test(`sustained emulated ${profile.name} under dense combat`, async ({browser}, info) => {
  test.setTimeout(150000)
  const context = await browser.newContext({viewport:{width:profile.width,height:profile.height},deviceScaleFactor:profile.dpr,hasTouch:profile.touch,isMobile:profile.touch})
  const page = await context.newPage()
  const errors:string[] = []; page.on('pageerror',e=>errors.push(e.message))
  await page.goto('/?seed=browser-profile')
  await page.getByTestId('playfield').waitFor()
  await page.getByTestId('open-menu').click()
  await page.getByRole('button',{name:'Resume game',exact:true}).click()
  await page.evaluate(() => {
    const h=window.__harness as GameHarness; h.setSpeed(0)
    const s=h.getState(); s.gold=100000; s.spireHp=s.spireMaxHp=100000
    s.availableTowers=['arrow','cannon','frost','tesla','sniper','mint','beacon','lance']
    const map=h.getMapInfo(), types=s.availableTowers
    const route=new Set(map.path.map(p=>p.cy*map.width+p.cx))
    const cells=map.buildable.map((yes,i)=>({yes,i,cx:i%map.width,cy:Math.floor(i/map.width)}))
      .filter(c=>c.yes && !route.has(c.i))
      .sort((a,b)=>Math.min(...map.path.map(p=>(p.cx-a.cx)**2+(p.cy-a.cy)**2))-Math.min(...map.path.map(p=>(p.cx-b.cx)**2+(p.cy-b.cy)**2)))
    for(const c of cells) {
      if(h.getState().towers.length >= 40) break
      h.dispatch({type:'place_tower',tower:types[h.getState().towers.length%types.length]!,cell:{cx:c.cx,cy:c.cy}})
      h.fastForward(1/30)
    }
    h.spawnHorde(300)
    const live=h.getState()
    live.wave=10; live.boonOffer=null
    live.abilities={meteor:0,frost_nova:0,gold_rush:0,bulwark:0}
    live.coins=Array.from({length:80},(_,i)=>({id:live.nextEntityId++,pos:{x:2500+i%18*1000,y:2500+Math.floor(i/18)*1000},gold:1,bornTick:live.tick,pulling:false}))
    for(let i=0;i<live.enemies.length;i++) {
      const e=live.enemies[i]!, at=map.path[i*7%(map.path.length-2)]!
      e.pos={x:at.cx*1000+500,y:at.cy*1000+500}; e.hp=e.maxHp=100000000; e.speed=0
    }
    h.fastForward(1/30); h.setSpeed(1)
  })
  await page.getByTestId('beam-toggle').click()
  const cdp=await context.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:profile.cpu})
  await cdp.send('Performance.enable')
  await page.waitForTimeout(2000)
  const windows=[]
  for(let windowIndex=0;windowIndex<6;windowIndex++) {
    await page.evaluate(()=>(window.__harness as GameHarness).resetPerformance())
    const started=Date.now()
    for(let i=0;i<20;i++) {
      const r=(await page.getByTestId('playfield').boundingBox())!
      const x=r.x+r.width*(0.3+(i%4)*0.12),y=r.y+r.height*0.55
      if(profile.touch) await page.touchscreen.tap(x,y)
      else { await page.mouse.move(x,y); await page.mouse.click(x,y) }
      await page.waitForTimeout(450)
    }
    const left=10000-(Date.now()-started)
    if(left>0) await page.waitForTimeout(left)
    const snapshot=await page.evaluate(() => {
      const h=window.__harness as GameHarness
      return {metrics:h.getPerformance(),enemies:h.getState().enemies.length,towers:h.getState().towers.length,
        firing:h.getState().towers.filter(t=>t.shots>0).length,audio:h.audioState(),
        fits:document.documentElement.scrollHeight<=innerHeight+1 && document.documentElement.scrollWidth<=innerWidth+1}
    })
    await cdp.send('HeapProfiler.collectGarbage')
    const m=await cdp.send('Performance.getMetrics')
    const heap=m.metrics.find(x=>x.name==='JSHeapUsedSize')!.value
    windows.push({window:windowIndex,seconds:(Date.now()-started)/1000,heap,...snapshot})
  }
  const result={profile,note:'Chrome CPU/device emulation; forced GC between windows. Not physical thermal or input scan-out measurements.',windows}
  await info.attach(`sustained-${profile.name}.json`,{body:JSON.stringify(result,null,2),contentType:'application/json'})
  await info.attach(`sustained-${profile.name}.png`,{body:await page.screenshot(),contentType:'image/png'})
  console.log('SUSTAINED_PROFILE',JSON.stringify(result))
  for(const w of windows) {
    expect(w.fits).toBe(true); expect(w.enemies).toBe(300); expect(w.towers).toBe(40)
    expect(w.firing).toBeGreaterThanOrEqual(20); expect(w.audio).toBe('running')
    expect(w.metrics.inputToRender?.samples).toBeGreaterThanOrEqual(15)
    expect(w.metrics.inputToRender?.p95).toBeLessThan(profile.touch ? 200 : 150)
    expect(w.metrics.effects?.p99 ?? 0).toBeLessThanOrEqual(256)
  }
  expect(windows.at(-1)!.heap-Math.min(...windows.slice(1,3).map(w=>w.heap))).toBeLessThan(12*1024*1024)
  expect(errors).toEqual([])
  await context.close()
})
