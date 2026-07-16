import { describe, expect, it } from 'vitest'
import { TOWERS } from '../../data/content'
import { autoplay } from '../../harness/autoplay'
import { afkBot, balancedBot, buildCandidates } from '../../harness/bots'
import { cloneRun } from '../clone'
import { assertInvariants } from '../invariants'
import { createMeta, createRun } from '../meta'
import { step } from '../step'
import type { RunState } from '../types'

function freshRun(seed = 'step-test'): RunState {
  return createRun(createMeta(), seed)
}

function stepUntil(state: RunState, done: (s: RunState) => boolean, maxTicks: number): RunState {
  let s = state
  while (!done(s) && s.tick < maxTicks) s = step(s, []).state
  return s
}

describe('step basics', () => {
  it('never mutates the input state', () => {
    const state = freshRun()
    const placed = step(state, [
      { type: 'place_tower', tower: 'arrow', cell: buildCandidates(state)[0]! },
    ]).state
    const snapshot = cloneRun(placed)
    step(placed, [{ type: 'start_wave' }])
    expect(placed).toEqual(snapshot)
  })

  it('createRun passes invariants', () => {
    expect(() => assertInvariants(freshRun())).not.toThrow()
  })
})

describe('tower commands', () => {
  it('placing a tower costs gold and emits an event', () => {
    const state = freshRun()
    const cell = buildCandidates(state)[0]!
    const { state: s, events } = step(state, [{ type: 'place_tower', tower: 'arrow', cell }])
    expect(s.towers).toHaveLength(1)
    expect(s.gold).toBe(state.gold - TOWERS.arrow.tiers[0].cost)
    expect(events.some((e) => e.type === 'tower_placed')).toBe(true)
  })

  it('rejects unaffordable, locked, and invalid placements', () => {
    const state = { ...freshRun(), gold: 10 }
    const cell = buildCandidates(state)[0]!
    const poor = step(state, [{ type: 'place_tower', tower: 'arrow', cell }])
    expect(poor.state.towers).toHaveLength(0)
    expect(poor.events[0]).toMatchObject({ type: 'command_rejected', reason: 'not enough gold' })

    const locked = step({ ...state, gold: 1000 }, [{ type: 'place_tower', tower: 'tesla', cell }])
    expect(locked.events[0]).toMatchObject({ type: 'command_rejected', reason: 'tower not unlocked' })

    const hostile = step({ ...state, gold: 1000 }, [
      { type: 'place_tower', tower: 'nuke' as never, cell },
    ])
    expect(hostile.events[0]).toMatchObject({ type: 'command_rejected', reason: 'unknown tower type' })
  })

  it('upgrade and sell round-trip: upgrade costs, sell refunds 70% of invested', () => {
    const state = freshRun()
    const cell = buildCandidates(state)[0]!
    let s = step({ ...state, gold: 1000 }, [{ type: 'place_tower', tower: 'arrow', cell }]).state
    const id = s.towers[0]!.id
    s = step(s, [{ type: 'upgrade_tower', id }]).state
    expect(s.towers[0]!.tier).toBe(2)
    expect(s.gold).toBe(1000 - 50 - 60)
    const sold = step(s, [{ type: 'sell_tower', id }])
    expect(sold.state.towers).toHaveLength(0)
    expect(sold.state.gold).toBe(1000 - 110 + Math.floor((110 * 70) / 100))
  })

  it('set_targeting validates the mode', () => {
    const state = freshRun()
    const cell = buildCandidates(state)[0]!
    const s = step(state, [{ type: 'place_tower', tower: 'arrow', cell }]).state
    const id = s.towers[0]!.id
    const ok = step(s, [{ type: 'set_targeting', id, targeting: 'strongest' }])
    expect(ok.state.towers[0]!.targeting).toBe('strongest')
    const bad = step(s, [{ type: 'set_targeting', id, targeting: 'weakest' as never }])
    expect(bad.events[0]).toMatchObject({ type: 'command_rejected' })
  })
})

describe('wave lifecycle', () => {
  it('start_wave spawns enemies which march at the spire', () => {
    const state = freshRun()
    let s = step(state, [{ type: 'start_wave' }]).state
    expect(s.phase).toBe('wave')
    expect(s.pendingSpawns.length).toBeGreaterThan(0)
    s = stepUntil(s, (st) => st.enemies.length > 0, 200)
    expect(s.enemies.length).toBeGreaterThan(0)
    const before = s.enemies[0]!.pos.x
    s = step(s, []).state
    expect(s.enemies[0]!.pos.x).toBeGreaterThan(before) // marching toward the spire (east)
  })

  it('an undefended wave damages the spire; wave then clears', () => {
    const state = freshRun()
    let s = step(state, [{ type: 'start_wave' }]).state
    s = stepUntil(s, (st) => st.phase !== 'wave', 20_000)
    expect(s.phase).toBe('build')
    expect(s.spireHp).toBeLessThan(s.spireMaxHp)
    expect(s.wavesCleared).toBe(1)
    expect(s.gold).toBeGreaterThan(state.gold) // wave-clear income
  })

  it('towers kill enemies and pay bounties', () => {
    const state = { ...freshRun(), gold: 10_000 }
    let s = state
    // A killbox of arrows around the path start.
    for (let i = 0; i < 6; i++) {
      const cell = buildCandidates(s)[0]
      if (!cell) break
      s = step(s, [{ type: 'place_tower', tower: 'arrow', cell }]).state
    }
    const goldAfterBuild = s.gold
    s = step(s, [{ type: 'start_wave' }]).state
    s = stepUntil(s, (st) => st.phase !== 'wave', 20_000)
    expect(s.kills).toBeGreaterThan(0)
    expect(s.spireHp).toBe(s.spireMaxHp) // wave 1 should not scratch a defended spire
    expect(s.gold).toBeGreaterThan(goldAfterBuild)
  })

  it('every afk run ends in defeat: the rogue-lite guarantee', () => {
    const { state } = autoplay(freshRun('doomed'), afkBot, 400_000, { checkInvariants: false })
    expect(state.phase).toBe('defeat')
    expect(state.spireHp).toBe(0)
    expect(state.sparksEarned).toBeGreaterThan(0)
  })

  it('commands after the run ends are rejected', () => {
    const { state } = autoplay(freshRun('doomed'), afkBot, 400_000)
    const after = step(state, [{ type: 'start_wave' }])
    expect(after.state.phase).toBe('defeat')
    expect(after.events[0]).toMatchObject({ type: 'command_rejected', reason: 'run is over' })
  })
})

describe('abilities', () => {
  it('meteor kills a cluster and goes on cooldown; casting again is rejected', () => {
    const state = freshRun()
    let s = step(state, [{ type: 'start_wave' }]).state
    s = stepUntil(s, (st) => st.enemies.length >= 2, 2000)
    const at = { cx: Math.floor(s.enemies[0]!.pos.x / 1000), cy: Math.floor(s.enemies[0]!.pos.y / 1000) }
    const hpBefore = s.enemies.reduce((sum, e) => sum + e.hp, 0)
    const cast = step(s, [{ type: 'cast_ability', ability: 'meteor', cell: at }])
    const hpAfter = cast.state.enemies.reduce((sum, e) => sum + e.hp, 0)
    expect(hpAfter).toBeLessThan(hpBefore)
    expect(cast.state.abilities['meteor']).toBeGreaterThan(0)
    const again = step(cast.state, [{ type: 'cast_ability', ability: 'meteor', cell: at }])
    expect(again.events[0]).toMatchObject({ type: 'command_rejected', reason: 'ability on cooldown' })
  })

  it('cannot cast during build phase or cast unequipped abilities', () => {
    const s = freshRun()
    const build = step(s, [{ type: 'cast_ability', ability: 'meteor', cell: { cx: 5, cy: 6 } }])
    expect(build.events[0]).toMatchObject({ type: 'command_rejected' })
    let wave = step(s, [{ type: 'start_wave' }]).state
    wave = step(wave, []).state
    const locked = step(wave, [{ type: 'cast_ability', ability: 'gold_rush', cell: { cx: 5, cy: 6 } }])
    expect(locked.events[0]).toMatchObject({ type: 'command_rejected', reason: 'ability not equipped' })
  })
})

describe('relics', () => {
  it('an offer appears after wave 5 and choosing applies it', () => {
    // Drive a competent bot until the first relic offer shows up, then choose
    // manually. The loop condition is checked before the bot acts, so the bot
    // never gets to pick the relic itself.
    let s = freshRun('relic-run')
    while (s.relicOffer === null && s.phase !== 'defeat' && s.tick < 200_000) {
      s = step(s, balancedBot(s)).state
    }
    if (s.phase === 'defeat') throw new Error('balanced bot died before the first relic offer')
    expect(s.relicOffer).not.toBeNull()
    expect(s.wavesCleared % 5).toBe(0)
    const relic = s.relicOffer![0]!
    const chosen = step(s, [{ type: 'choose_relic', relic }]).state
    expect(chosen.relics).toContain(relic)
    expect(chosen.relicOffer).toBeNull()
  })

  it('choosing nothing clears the offer; bogus picks are rejected', () => {
    const state = { ...freshRun(), relicOffer: ['overcharge', 'heavy_powder'] as RunState['relicOffer'] }
    const skipped = step(state, [{ type: 'choose_relic', relic: null }])
    expect(skipped.state.relicOffer).toBeNull()
    expect(skipped.state.relics).toHaveLength(0)
    const bogus = step(state, [{ type: 'choose_relic', relic: 'spark_siphon' }])
    expect(bogus.events[0]).toMatchObject({ type: 'command_rejected', reason: 'relic not in the offer' })
  })
})
