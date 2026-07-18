import { describe, expect, it } from 'vitest'
import {
  BOON_BOUNTY_GOLD,
  BOON_DAMAGE_PCT,
  BOON_IDS,
  BOON_SLOW_PCT,
  ENEMIES,
} from '../../data/content'
import { effectiveDamagePct } from '../combat'
import { cellCenter } from '../grid'
import { createMeta, createRun } from '../meta'
import { step } from '../step'
import type { Enemy, RunState } from '../types'

// Wave boons: two single-wave perks offered every build phase. Never a
// gate, nothing outlives its wave, every effect exact.

function makeEnemy(state: RunState, overrides: Partial<Enemy> & { id: number }): Enemy {
  const def = ENEMIES.runner
  return {
    type: 'runner',
    pos: cellCenter({ cx: 10, cy: 6 }),
    hp: def.hp,
    maxHp: def.hp,
    speed: def.speed,
    slowFactor: 100,
    slowTicks: 0,
    bounty: 1,
    damage: 1,
    shield: 0,
    armor: 0,
    healCooldown: 0,
    broodCooldown: 0,
    phased: false,
    phaseCooldown: 0,
    burnTicks: 0,
    burnPerTick: 0,
    overcharge: 0,
    mechCooldown: 0,
    mechActiveTicks: 0,
    brittleTicks: 0,
    targetCell: null,
    ...overrides,
  }
}

describe('wave boons', () => {
  it('the first offer is on the table at run start — two distinct boons', () => {
    const s = createRun(createMeta(), 'boon-lab')
    expect(s.boonOffer).toHaveLength(2)
    expect(s.boonOffer![0]).not.toBe(s.boonOffer![1])
    for (const b of s.boonOffer!) expect(BOON_IDS).toContain(b)
  })

  it('choosing applies for the coming wave; starting unchosen forfeits', () => {
    let s = createRun(createMeta(), 'boon-lab')
    const pick = s.boonOffer![0]!
    let r = step(s, [{ type: 'choose_boon', boon: pick }])
    expect(r.state.activeBoon).toBe(pick)
    expect(r.state.boonOffer).toBeNull()
    expect(r.events.some((e) => e.type === 'boon_chosen')).toBe(true)
    // An un-offered boon is refused.
    s = createRun(createMeta(), 'boon-lab')
    const notOffered = BOON_IDS.find((b) => !s.boonOffer!.includes(b))!
    r = step(s, [{ type: 'choose_boon', boon: notOffered }])
    expect(r.events.some((e) => e.type === 'command_rejected')).toBe(true)
    // Skipping: start the wave and the offer is gone, no boon active.
    s = createRun(createMeta(), 'boon-lab')
    r = step(s, [{ type: 'start_wave' }])
    expect(r.state.boonOffer).toBeNull()
    expect(r.state.activeBoon).toBeNull()
  })

  it('the blessing dies with its wave, and the next offer appears', () => {
    let s = createRun(createMeta(), 'boon-lab')
    s.activeBoon = 'sharpened'
    s.phase = 'wave'
    s.wave = 1
    s.enemies = []
    s.pendingSpawns = []
    s = step(s, []).state // wave clears this tick
    expect(s.phase).toBe('build')
    expect(s.activeBoon).toBeNull()
    expect(s.boonOffer).toHaveLength(2)
  })

  it('Sharpened Steel: exactly +15% while active', () => {
    const s = createRun(createMeta(), 'boon-lab')
    expect(effectiveDamagePct(s, 'arrow')).toBe(100)
    s.activeBoon = 'sharpened'
    expect(effectiveDamagePct(s, 'arrow')).toBe(100 + BOON_DAMAGE_PCT)
  })

  it('War Levy: +2 gold per kill, this wave only', () => {
    let s = createRun(createMeta(), 'boon-lab')
    s.phase = 'wave'
    s.wave = 1
    s.pendingSpawns = [{ type: 'runner', tick: 1_000_000 }]
    s.activeBoon = 'bounty'
    s.enemies = [makeEnemy(s, { id: 1, hp: 0 })]
    s.collectAt = cellCenter({ cx: 10, cy: 6 }) // the levy drops as a coin; catch it
    const before = s.gold
    s = step(s, []).state
    expect(s.gold).toBe(before + 1 + BOON_BOUNTY_GOLD)
  })

  it('Swift Sigils: +1 ability recovery per tick', () => {
    let s = createRun(createMeta(), 'boon-lab')
    s.phase = 'wave'
    s.wave = 1
    s.pendingSpawns = [{ type: 'runner', tick: 1_000_000 }]
    s.activeBoon = 'swift'
    s.abilities = { meteor: 100 }
    s = step(s, []).state
    expect(s.abilities['meteor']).toBe(98)
  })

  it('Hoarfrost Wind: the horde wades at 90% speed', () => {
    const s = createRun(createMeta(), 'boon-lab')
    s.phase = 'wave'
    s.wave = 1
    s.pendingSpawns = [{ type: 'runner', tick: 1_000_000 }]
    const at = cellCenter({ cx: 2, cy: 2 })
    s.enemies = [makeEnemy(s, { id: 1, pos: { ...at } })]
    const plain = step(s, []).state.enemies[0]!.pos
    const slowed = createRun(createMeta(), 'boon-lab')
    slowed.phase = 'wave'
    slowed.wave = 1
    slowed.pendingSpawns = [{ type: 'runner', tick: 1_000_000 }]
    slowed.activeBoon = 'frosted'
    slowed.enemies = [makeEnemy(slowed, { id: 1, pos: { ...at } })]
    const dragged = step(slowed, []).state.enemies[0]!.pos
    const plainMoved = Math.abs(plain.x - at.x) + Math.abs(plain.y - at.y)
    const draggedMoved = Math.abs(dragged.x - at.x) + Math.abs(dragged.y - at.y)
    expect(draggedMoved).toBe(Math.floor((ENEMIES.runner.speed * BOON_SLOW_PCT) / 100))
    expect(draggedMoved).toBeLessThan(plainMoved)
  })
})
