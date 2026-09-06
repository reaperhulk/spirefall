import { expect, test } from '@playwright/test'
import type { GameHarness } from '../src/ui/harness'

for(const biome of ['verdant','frostfen','emberwaste','highlands'] as const) test(`battlefield art review: ${biome}`,async ({page},info)=>{
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/?seed=art-review')
  await page.getByTestId('playfield').waitFor()
  await page.evaluate(biome=>{
    const h=window.__harness as GameHarness; h.setSpeed(0)
    h.getState().biome=biome; h.getState().gold=100000
    h.getState().availableTowers=['arrow','cannon','frost','tesla','sniper','lance','beacon','mint']
    const types=h.getState().availableTowers, map=h.getMapInfo()
    const path=new Set(map.path.map(p=>p.cy*map.width+p.cx))
    for(let i=0;i<map.buildable.length;i++) {
      if(h.getState().towers.length>=16) break
      if(!map.buildable[i] || path.has(i) || Math.floor(i/map.width)<3) continue
      h.dispatch({type:'place_tower',tower:types[h.getState().towers.length%8]!,cell:{cx:i%map.width,cy:Math.floor(i/map.width)}})
      h.fastForward(1/30)
    }
    const specs=['volley','mortar','blizzard','lattice','executor','momentum',null,null,'longbow','breaker','permafrost','capacitor','overpen','skewer',null,null] as const
    for(let i=0;i<h.getState().towers.length;i++) {const t=h.getState().towers[i]!;t.tier=2;t.spec=specs[i]!}
    h.spawnHorde(8)
    const s=h.getState();s.wave=6;s.doctrine='shatter';s.boonOffer=null;s.spireHp=s.spireMaxHp=100000
    const creatures=['runner','brute','shieldbearer','flier','healer','carrier','wraith','boss'] as const
    s.enemies.forEach((e,i)=>{const at=map.path[Math.floor((i+1)*map.path.length/10)]!;e.type=creatures[i]!;e.pos={x:at.cx*1000+500,y:at.cy*1000+500};e.hp=800;e.maxHp=1000;e.speed=0;e.frostStacks=i%4;e.mechCooldown=300})
    h.resetPerformance(); h.fastForward(1/30)
  },biome)
  await expect.poll(()=>page.evaluate(()=>(window.__harness as GameHarness).getPerformance().render?.samples ?? 0)).toBeGreaterThan(0)
  // Let the spawn scale and hit flashes finish before judging silhouettes.
  await page.waitForTimeout(400)
  expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1)).toBe(true)
  await info.attach(`battlefield-${biome}.png`,{body:await page.screenshot(),contentType:'image/png'})
})
