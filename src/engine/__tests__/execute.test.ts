import { describe, expect, it } from 'vitest'
import {
  ENEMIES,
  EXECUTE_BONUS_PCT,
  EXECUTE_COOLDOWN_TICKS,
  EXECUTE_THRESHOLD_PCT,
} from '../../data/content'
import { cellCenter } from '../grid'
import { createMeta, createRun } from '../meta'
import { step } from '../step'
import type { Enemy, RunState } from '../types'

// Execute windows: click a wounded enemy to finish it for bonus gold.
// One blade, one global cooldown, no reach into the phased.

function makeEnemy(state: RunState, overrides: Partial<Enemy> & { id: number }): Enemy {
  const def = ENEMIES.brute
  return {
    type: 'brute',
    pos: cellCenter({ cx: 10, cy: 6 }),
    hp: def.hp,
    maxHp: def.hp,
    speed: 0,
    slowFactor: 100,
    slowTicks: 0,
    bounty: def.bounty,
    damage: 3,
    shield: 0,
    armor: 1,
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

function waveState(): RunState {
  const s = createRun(createMeta(), 'execute-lab')
  s.phase = 'wave'
  s.wave = 5
  s.pendingSpawns = [{ type: 'runner', tick: 1_000_000 }]
  return s
}

const woundedHp = (maxHp: number) => Math.floor((maxHp * EXECUTE_THRESHOLD_PCT) / 100)

describe('execute windows', () => {
  it('finishes a wounded enemy: full kill bookkeeping plus the bonus', () => {
    let s = waveState()
    const max = ENEMIES.brute.hp
    s.enemies = [makeEnemy(s, { id: 1, hp: woundedHp(max), maxHp: max })]
    s.collectAt = cellCenter({ cx: 10, cy: 6 }) // the bounty drops as a coin; catch it
    const gold = s.gold
    const r = step(s, [{ type: 'execute_enemy', id: 1 }])
    s = r.state
    expect(r.events.some((e) => e.type === 'enemy_executed')).toBe(true)
    expect(r.events.some((e) => e.type === 'enemy_killed')).toBe(true) // collectDead books it
    expect(s.kills).toBe(1)
    expect(s.combo).toBe(1) // an execution feeds the streak like any kill
    const bonus = Math.floor((ENEMIES.brute.bounty * EXECUTE_BONUS_PCT) / 100)
    expect(s.gold).toBe(gold + ENEMIES.brute.bounty + bonus)
    expect(s.executeCd).toBe(EXECUTE_COOLDOWN_TICKS - 1) // set, then ticked once
  })

  it('refuses the healthy, the phased, and the impatient', () => {
    const s = waveState()
    const max = ENEMIES.brute.hp
    s.enemies = [
      makeEnemy(s, { id: 1, hp: max }), // healthy
      makeEnemy(s, { id: 2, hp: woundedHp(max), maxHp: max, phased: true }),
      makeEnemy(s, { id: 3, hp: woundedHp(max), maxHp: max }),
    ]
    let r = step(s, [{ type: 'execute_enemy', id: 1 }])
    expect(r.events.some((e) => e.type === 'command_rejected')).toBe(true)
    r = step(s, [{ type: 'execute_enemy', id: 2 }])
    expect(r.events.some((e) => e.type === 'command_rejected')).toBe(true)
    // A legal execution starts the cooldown; a second blade is refused.
    r = step(s, [{ type: 'execute_enemy', id: 3 }])
    const again = makeEnemy(r.state, { id: 9, hp: woundedHp(max), maxHp: max })
    r.state.enemies.push(again)
    const second = step(r.state, [{ type: 'execute_enemy', id: 9 }])
    expect(second.events.some((e) => e.type === 'command_rejected')).toBe(true)
    expect(second.state.enemies.find((e) => e.id === 9)!.hp).toBeGreaterThan(0)
  })

  it('the blade recovers on wave time only', () => {
    let s = waveState()
    s.executeCd = 10
    s.enemies = [makeEnemy(s, { id: 1 })]
    s = step(s, []).state
    expect(s.executeCd).toBe(9)
    s.phase = 'build'
    s.enemies = []
    s.pendingSpawns = []
    s = step(s, []).state
    expect(s.executeCd).toBe(9)
  })
})
