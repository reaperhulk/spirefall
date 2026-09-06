import { expect, it } from 'vitest'
import { SoundBudget } from '../soundBudget'
it('reserves all three tactical cues after a saturated battle mix and releases ducking', () => {
  const budget = new SoundBudget()
  for(let i=0;i<20;i++) budget.admit('shot_arrow',100,false)
  for(let i=0;i<20;i++) budget.admit('meteor',100,false)
  for(const cue of ['execute_ready','core_open','beam_warning']) expect(budget.admit(cue,100,false)).toEqual({urgent:true})
  expect(budget.admit('core_open',101,false)).toBeNull()
  expect(budget.duck(899)).toBe(0.35)
  expect(budget.duck(901)).toBe(1)
  expect(budget.admit('core_open',1000,false)).not.toBeNull()
})
it('quiet mode bounds ordinary sounds while retaining urgent slots', () => {
  const budget = new SoundBudget()
  expect(Array.from({length:30},()=>budget.admit('kill',0,true)).filter(Boolean)).toHaveLength(3)
  expect(budget.admit('spire_hit',0,true)).toEqual({urgent:true})
  expect(budget.duck(499)).toBe(0.55)
  expect(budget.duck(501)).toBe(1)
})
