import { expect, it } from 'vitest'
import { createMeta, createRun } from '../../engine/meta'
import { step } from '../../engine/step'
import { getRunMap } from '../../engine/mapgen'
import { canPlaceTower } from '../../engine/grid'
import { navigation } from '../../engine/navigation'
import { buildCandidates } from '../../harness/placement'
import { placementPreview } from '../placementPreview'
it('placement forecasts the route that the command produces and refreshes affordability', () => {
 let state=createRun(createMeta(),'placement-compare');state.gold=10000
 for(let i=0;i<5;i++)state=step(state,[{type:'place_tower',tower:'arrow',cell:buildCandidates(state)[0]!}]).state
 const cell=buildCandidates(state)[0]!, before=JSON.stringify(state)
 const preview=placementPreview(state,'cannon',cell)
 const built=step(state,[{type:'place_tower',tower:'cannon',cell}]).state
 expect(preview.ok).toBe(canPlaceTower(state,getRunMap(state),cell).ok)
 expect(preview.after).toEqual(navigation(getRunMap(built),built.towers).path)
 expect(preview.newCoverage).toBeGreaterThan(0)
 expect(JSON.stringify(state)).toBe(before)
 expect(placementPreview({...state,gold:0},'cannon',cell).affordable).toBe(false)
 expect(placementPreview(state,'cannon',state.towers[0]!.cell).ok).toBe(false)
})
