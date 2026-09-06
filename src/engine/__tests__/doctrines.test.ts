import { expect, it } from 'vitest'
import { COMMAND_CHARGES, COMMAND_RECHARGE_TICKS } from '../../data/doctrines'
import { createMeta, createRun } from '../meta'
import { step } from '../step'
import { effectiveDamagePct } from '../combat'
import { attentionBot } from '../../harness/bots'
import { buildCandidates } from '../../harness/placement'

it('offers a persistent build identity after wave two and permits only one choice', () => {
  let s = createRun(createMeta(), 'doctrine')
  expect(step(s, [{ type: 'choose_doctrine', doctrine: 'storm' }]).events[0]?.type).toBe('command_rejected')
  s.wave = s.wavesCleared = 2
  s = step(s, [{ type: 'choose_doctrine', doctrine: 'storm' }]).state
  expect(s.availableTowers).toContain('tesla')
  expect(effectiveDamagePct(s, 'tesla')).toBe(100) // power comes from connected discharges
  expect(step(s, [{ type: 'choose_doctrine', doctrine: 'siege' }]).state.doctrine).toBe('storm')
})
it('war economy exchanges damage for income and grants access to Mint', () => {
  let s = createRun(createMeta(), 'economy')
  s.wave = s.wavesCleared = 2
  s = step(s, [{ type: 'choose_doctrine', doctrine: 'war_economy' }]).state
  expect(s.mods.goldPct).toBe(15)
  expect(effectiveDamagePct(s, 'arrow')).toBe(95)
  expect(s.availableTowers).toContain('mint')
})
it('overcharge consumes a shared pool even when several towers are available', () => {
  let s = createRun(createMeta(), 'charges')
  s.gold = 1000
  for (let i = 0; i < 4; i++) s = step(s, [{ type: 'place_tower', tower: 'arrow', cell: buildCandidates(s)[0]! }]).state
  const result = step(s, s.towers.map(t => ({ type: 'overcharge_tower', id: t.id })))
  expect(result.state.commandCharges).toBe(0)
  expect(result.state.towers.filter(t => t.overcharged)).toHaveLength(COMMAND_CHARGES)
  expect(result.events.at(-1)?.type).toBe('command_rejected')
  expect(s.commandCharges).toBe(COMMAND_CHARGES) // immutable input
})
it('charges recover on combat time, never by waiting in menus or build phase', () => {
  let s = createRun(createMeta(), 'recharge')
  s.commandCharges = 0
  for (let i = 0; i < COMMAND_RECHARGE_TICKS; i++) s = step(s, []).state
  expect(s.commandCharges).toBe(0)
  s.phase = 'wave'
  s.pendingSpawns = [{ type: 'runner', tick: 10000 }]
  for (let i = 0; i < COMMAND_RECHARGE_TICKS; i++) s = step(s, []).state
  expect(s.commandCharges).toBe(1)
})
it('the attention reference cannot issue several commands or react between action windows', () => {
  const s = createRun(createMeta(), 'attention')
  expect(attentionBot(s).length).toBeLessThanOrEqual(1)
  s.tick = 1
  expect(attentionBot(s)).toEqual([])
})
