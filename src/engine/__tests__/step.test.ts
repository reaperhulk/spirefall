import { describe, expect, it } from 'vitest'
import { ENHANCE_COST_GROWTH_PCT, RELIC_IDS, RELIC_PITY_WAVE, RELICS, relicSkipGold, TOWERS } from '../../data/content'
import { autoplay } from '../../harness/autoplay'
import { afkBot, balancedBot, buildCandidates } from '../../harness/bots'
import { cloneRun } from '../clone'
import { damageBreakdown, drawRelicOffer, effectiveDamagePct } from '../combat'
import { assertInvariants } from '../invariants'
import { createMeta, createRun } from '../meta'
import { cellCenter, getMap } from '../grid'
import { computeSparks, previewNextWave, step, wavesUntilCataclysm } from '../step'
import type { RelicId, RunState } from '../types'

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

  it('selling an unfired tower is a free undo: 100% refund, even after upgrades', () => {
    const state = freshRun()
    const cell = buildCandidates(state)[0]!
    let s = step({ ...state, gold: 1000 }, [{ type: 'place_tower', tower: 'arrow', cell }]).state
    const id = s.towers[0]!.id
    s = step(s, [{ type: 'upgrade_tower', id }]).state
    expect(s.towers[0]!.tier).toBe(2)
    expect(s.gold).toBe(1000 - 50 - 60)
    const sold = step(s, [{ type: 'sell_tower', id }])
    expect(sold.state.towers).toHaveLength(0)
    expect(sold.state.gold).toBe(1000) // never fired → every coin comes back
  })

  it('selling a tower that has fired refunds 70% of invested', () => {
    let s = { ...freshRun(), gold: 1000 }
    const cell = buildCandidates(s)[0]!
    s = step(s, [{ type: 'place_tower', tower: 'arrow', cell }]).state
    const id = s.towers[0]!.id
    s = step(s, [{ type: 'start_wave' }]).state
    s = stepUntil(s, (st) => st.towers[0]!.shots > 0, 20_000)
    expect(s.towers[0]!.shots).toBeGreaterThan(0)
    const goldBefore = s.gold
    const sold = step(s, [{ type: 'sell_tower', id }]).state
    expect(sold.gold).toBe(goldBefore + Math.floor((TOWERS.arrow.tiers[0].cost * 70) / 100))
  })

  it('set_targeting validates the mode', () => {
    const state = freshRun()
    const cell = buildCandidates(state)[0]!
    const s = step(state, [{ type: 'place_tower', tower: 'arrow', cell }]).state
    const id = s.towers[0]!.id
    const ok = step(s, [{ type: 'set_targeting', id, targeting: 'strongest' }])
    expect(ok.state.towers[0]!.targeting).toBe('strongest')
    const bad = step(s, [{ type: 'set_targeting', id, targeting: 'bogus' as never }])
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

  it('an undefended horde overruns the base spire; a tall spire tanks it and the wave clears', () => {
    // At the base 10 HP, wave 1's horde is lethal with no towers at all.
    const overrun = stepUntil(step(freshRun(), [{ type: 'start_wave' }]).state, (st) => st.phase !== 'wave', 20_000)
    expect(overrun.phase).toBe('defeat')

    // With enough HP to soak it, the wave clears and pays out.
    const state = { ...freshRun(), spireHp: 1000, spireMaxHp: 1000 }
    let s = step(state, [{ type: 'start_wave' }]).state
    s = stepUntil(s, (st) => st.phase !== 'wave', 20_000)
    expect(s.phase).toBe('build')
    expect(s.spireHp).toBeLessThan(s.spireMaxHp) // the horde got its hits in
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
    // Analytics tallies reconcile with the counters.
    expect(Object.values(s.killsByEnemy).reduce((a, b) => a + b, 0)).toBe(s.kills)
    expect(s.damageByTower.arrow).toBeGreaterThan(0)
  })

  it('every afk run ends in defeat: the rogue-lite guarantee', () => {
    const { state } = autoplay(freshRun('doomed'), afkBot, 400_000, { checkInvariants: false })
    expect(state.phase).toBe('defeat')
    expect(state.spireHp).toBe(0)
    // The horde overruns an undefended spire before wave 1 clears — and
    // sparks pay for progress only, so literally doing nothing earns nothing.
    expect(state.sparksEarned).toBe(0)
  })

  it('abandon_run concedes immediately — but zero progress pays zero sparks', () => {
    // The exploit guard: repeatedly starting and abandoning runs must farm
    // nothing. Sparks come from progress only.
    const s = step(freshRun('quitter'), [{ type: 'start_wave' }]).state
    expect(s.phase).toBe('wave')
    const result = step(s, [{ type: 'abandon_run' }])
    expect(result.state.phase).toBe('defeat')
    expect(result.state.spireHp).toBe(0)
    expect(result.state.sparksEarned).toBe(0) // wave 1 started but not cleared, no kills
    expect(result.events.some((e) => e.type === 'run_ended')).toBe(true)
    expect(() => assertInvariants(result.state)).not.toThrow()
    // Works from the build phase too, and only once.
    const fromBuild = step(freshRun('quitter-2'), [{ type: 'abandon_run' }])
    expect(fromBuild.state.phase).toBe('defeat')
    expect(fromBuild.state.sparksEarned).toBe(0)
    const again = step(result.state, [{ type: 'abandon_run' }])
    expect(again.events[0]).toMatchObject({ type: 'command_rejected', reason: 'run is over' })
  })

  it('abandoning WITH progress still pays for that progress', () => {
    // Tank wave 1 on a tall spire, then concede: the cleared wave pays.
    const tall = { ...freshRun('honest-quitter'), spireHp: 1000, spireMaxHp: 1000 }
    let s = step(tall, [{ type: 'start_wave' }]).state
    s = stepUntil(s, (st) => st.phase !== 'wave', 20_000)
    expect(s.phase).toBe('build')
    expect(s.wavesCleared).toBe(1)
    const result = step(s, [{ type: 'abandon_run' }])
    expect(result.state.sparksEarned).toBeGreaterThan(0)
  })

  it('commands after the run ends are rejected', () => {
    const { state } = autoplay(freshRun('doomed'), afkBot, 400_000)
    const after = step(state, [{ type: 'start_wave' }])
    expect(after.state.phase).toBe('defeat')
    expect(after.events[0]).toMatchObject({ type: 'command_rejected', reason: 'run is over' })
  })
})

describe('gold sinks', () => {
  it('tier-3 towers enhance indefinitely at escalating cost', () => {
    const state = { ...freshRun(), gold: 100_000 }
    const cell = buildCandidates(state)[0]!
    let s = step(state, [{ type: 'place_tower', tower: 'arrow', cell }]).state
    const id = s.towers[0]!.id
    s = step(s, [{ type: 'upgrade_tower', id }]).state
    s = step(s, [{ type: 'upgrade_tower', id }]).state
    expect(s.towers[0]!.tier).toBe(3)

    const goldBefore = s.gold
    const first = step(s, [{ type: 'upgrade_tower', id }])
    expect(first.state.towers[0]!.enhance).toBe(1)
    const firstCost = goldBefore - first.state.gold
    expect(firstCost).toBe(Math.floor((140 * ENHANCE_COST_GROWTH_PCT) / 100))
    expect(first.events).toContainEqual({ type: 'tower_enhanced', id, level: 1, cost: firstCost })

    const second = step(first.state, [{ type: 'upgrade_tower', id }])
    const secondCost = first.state.gold - second.state.gold
    expect(secondCost).toBeGreaterThan(firstCost) // escalates forever
    expect(second.state.towers[0]!.enhance).toBe(2)
  })

  it('repair_spire heals for gold, capped per cast and at max HP', () => {
    const damaged = { ...freshRun(), spireHp: 4, gold: 1000 }
    const healed = step(damaged, [{ type: 'repair_spire' }])
    expect(healed.state.spireHp).toBe(7) // +3 cap
    expect(healed.state.gold).toBe(1000 - 3 * 40) // wave 0: base cost per point
    expect(healed.events[0]).toMatchObject({ type: 'spire_repaired', amount: 3 })

    const nearlyFull = { ...freshRun(), spireHp: 9, gold: 1000 }
    const topped = step(nearlyFull, [{ type: 'repair_spire' }])
    expect(topped.state.spireHp).toBe(10) // never over max

    const full = step({ ...freshRun(), gold: 1000 }, [{ type: 'repair_spire' }])
    expect(full.events[0]).toMatchObject({ type: 'command_rejected', reason: 'spire is at full health' })

    const broke = step({ ...freshRun(), spireHp: 4, gold: 39 }, [{ type: 'repair_spire' }])
    expect(broke.events[0]).toMatchObject({ type: 'command_rejected', reason: 'not enough gold' })
  })

  it('mid-wave repairs are capped per wave; build-phase repairs are not', () => {
    // Under fire: the second cast in the same wave is refused — gold must
    // not tank a live wave (the build fuzzer won at 5k sparks this way).
    // A far-future pending spawn keeps the wave live through the casts.
    const underFire = {
      ...freshRun(),
      phase: 'wave' as const,
      spireHp: 1,
      spireMaxHp: 10,
      gold: 10_000,
      pendingSpawns: [{ type: 'runner' as const, tick: 9_999_999 }],
    }
    const first = step(underFire, [{ type: 'repair_spire' }])
    expect(first.state.spireHp).toBe(4)
    expect(first.state.repairsThisWave).toBe(1)
    const second = step(first.state, [{ type: 'repair_spire' }])
    expect(second.events[0]).toMatchObject({ type: 'command_rejected', reason: expect.stringContaining('repair crews') })
    expect(second.state.spireHp).toBe(4)

    // The next wave brings fresh crews.
    const nextWave = step({ ...cloneRun(second.state), phase: 'build' as const }, [{ type: 'start_wave' }]).state
    expect(nextWave.repairsThisWave).toBe(0)
    const again = step(nextWave, [{ type: 'repair_spire' }])
    expect(again.state.spireHp).toBe(7)

    // Between waves the crews work freely — three casts in a row all land.
    let calm = { ...freshRun(), spireHp: 1, spireMaxHp: 10, gold: 10_000 }
    for (const expected of [4, 7, 10]) {
      calm = step(calm, [{ type: 'repair_spire' }]).state
      expect(calm.spireHp).toBe(expected)
    }
    expect(calm.repairsThisWave).toBe(0)
  })

  it('towers record kills and damage dealt', () => {
    const state = { ...freshRun(), gold: 10_000 }
    let s = state
    for (let i = 0; i < 6; i++) {
      const cell = buildCandidates(s)[0]
      if (!cell) break
      s = step(s, [{ type: 'place_tower', tower: 'arrow', cell }]).state
    }
    s = step(s, [{ type: 'start_wave' }]).state
    s = stepUntil(s, (st) => st.phase !== 'wave', 20_000)
    expect(s.kills).toBeGreaterThan(0)
    const towerKills = s.towers.reduce((sum, t) => sum + t.kills, 0)
    const towerDamage = s.towers.reduce((sum, t) => sum + t.damageDealt, 0)
    expect(towerKills).toBe(s.kills) // every kill is attributed to a tower
    expect(towerDamage).toBeGreaterThan(0)
    // The health timeline sampled the clear: one entry, the current HP.
    if (s.phase === 'build') expect(s.hpByWave).toEqual([s.spireHp])
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

  it('golden_touch scales current HP proportionally — a damaged spire never gets relatively healthier', () => {
    const base = { ...freshRun(), relicOffer: ['golden_touch'] as RunState['relicOffer'] }
    const damaged = { ...base, spireHp: 8 }
    const s = step(damaged, [{ type: 'choose_relic', relic: 'golden_touch' }]).state
    expect(s.spireMaxHp).toBe(9)
    expect(s.spireHp).toBe(7) // same fraction of the new max as before
    // At full health it stays full.
    const full = step(base, [{ type: 'choose_relic', relic: 'golden_touch' }]).state
    expect(full.spireHp).toBe(full.spireMaxHp)
  })

  it('last_stand arms only while the spire is at half HP or less', () => {
    const healthy = { ...cloneRun(freshRun('last-stand')), relics: ['last_stand'] as RunState['relics'], spireHp: 6, spireMaxHp: 10 }
    expect(effectiveDamagePct(healthy, 'arrow')).toBe(100)
    const bleeding = { ...cloneRun(healthy), spireHp: 5 }
    expect(effectiveDamagePct(bleeding, 'arrow')).toBe(130)
    // The itemized breakdown shows the active bonus and matches the math.
    const tower = { id: 1, type: 'arrow' as const, cell: { cx: 0, cy: 0 }, tier: 1 as const, cooldown: 0, kills: 0, damageDealt: 0, targeting: 'first' as const, enhance: 0, shots: 0 }
    expect(damageBreakdown(bleeding, tower).totalPct).toBe(130)
    expect(damageBreakdown(healthy, tower).totalPct).toBe(100)
  })

  it('shatter punishes slowed enemies; soul_harvest knits on the 100th kill', () => {
    // Shatter: identical duel, but the slowed copy takes +20%.
    const duel = (slowTicks: number) => {
      const s = cloneRun(freshRun('shatter-duel'))
      s.phase = 'wave'
      s.wave = 1
      s.relics = ['shatter']
      s.pendingSpawns = [{ type: 'runner', tick: 9_999_999 }]
      s.towers.push({ id: s.nextEntityId++, type: 'arrow', cell: { cx: 6, cy: 4 }, tier: 1, cooldown: 0, kills: 0, damageDealt: 0, targeting: 'first', enhance: 0, shots: 0 })
      s.enemies.push({ id: s.nextEntityId++, type: 'brute', pos: cellCenter({ cx: 6, cy: 5 }), hp: 1000, maxHp: 1000, speed: 0, slowFactor: slowTicks > 0 ? 60 : 100, slowTicks, bounty: 3, damage: 3, shield: 0, healCooldown: 0, broodCooldown: 0, phased: false, phaseCooldown: 0, targetCell: null })
      return step(s, []).state.towers[0]!.damageDealt
    }
    const plain = duel(0)
    const slowed = duel(50)
    expect(slowed).toBe(Math.floor((plain * 120) / 100))

    // Soul Harvest: the 100th kill knits +1.
    const s = cloneRun(freshRun('harvest'))
    s.relics = ['soul_harvest']
    s.kills = 99
    s.spireHp = 5
    s.phase = 'wave'
    s.pendingSpawns = [{ type: 'runner', tick: 9_999_999 }]
    s.towers.push({ id: s.nextEntityId++, type: 'sniper', cell: { cx: 6, cy: 4 }, tier: 3, cooldown: 0, kills: 0, damageDealt: 0, targeting: 'first', enhance: 0, shots: 0 })
    s.enemies.push({ id: s.nextEntityId++, type: 'runner', pos: cellCenter({ cx: 6, cy: 5 }), hp: 1, maxHp: 1, speed: 0, slowFactor: 100, slowTicks: 0, bounty: 1, damage: 1, shield: 0, healCooldown: 0, broodCooldown: 0, phased: false, phaseCooldown: 0, targetCell: null })
    const after = step(s, []).state
    expect(after.kills).toBe(100)
    expect(after.spireHp).toBe(6)
  })

  it('choosing nothing pays wave-scaled gold; bogus picks are rejected', () => {
    const state = { ...freshRun(), wave: 5, relicOffer: ['overcharge', 'heavy_powder'] as RunState['relicOffer'] }
    const skipped = step(state, [{ type: 'choose_relic', relic: null }])
    expect(skipped.state.relicOffer).toBeNull()
    expect(skipped.state.relics).toHaveLength(0)
    expect(skipped.state.gold).toBe(state.gold + relicSkipGold(5)) // skipping is compensated, not a dead end
    expect(skipped.events[0]).toMatchObject({ type: 'relic_chosen', relic: null, goldAwarded: relicSkipGold(5) })
    const bogus = step(state, [{ type: 'choose_relic', relic: 'spark_siphon' }])
    expect(bogus.events[0]).toMatchObject({ type: 'command_rejected', reason: 'relic not in the offer' })
  })
})

describe('wave preview', () => {
  it('previews exactly what start_wave then fields — types, counts, and affix', () => {
    for (const seed of ['scout-a', 'scout-b', 'scout-c']) {
      let s = freshRun(seed)
      // Walk several waves deep (past AFFIX_FIRST_WAVE) comparing every one.
      for (let wave = 1; wave <= 8; wave++) {
        const preview = previewNextWave(s)!
        expect(preview.wave).toBe(wave)
        const started = step(s, [{ type: 'start_wave' }]).state
        expect(started.activeAffix).toBe(preview.affix)
        const counts: Record<string, number> = {}
        for (const p of started.pendingSpawns) counts[p.type] = (counts[p.type] ?? 0) + 1
        expect(counts).toEqual(preview.counts)
        expect(started.pendingSpawns.length).toBe(preview.total)
        // Fast-forward to the next build phase with no towers (undefended),
        // topping up spire HP so the run survives all 8 waves.
        s = stepUntil(started, (st) => st.phase !== 'wave', 60_000)
        if (s.phase === 'defeat') {
          s = { ...cloneRun(s), phase: 'build', spireHp: 1000, spireMaxHp: 1000 }
        } else {
          s = { ...cloneRun(s), spireHp: 1000, spireMaxHp: 1000 }
        }
      }
    }
  })

  it('previewing is pure: state (including rng streams) is untouched', () => {
    const s = freshRun('scout-pure')
    const before = JSON.stringify(s)
    previewNextWave(s)
    previewNextWave(s)
    expect(JSON.stringify(s)).toBe(before)
    // And repeated previews agree with each other.
    expect(previewNextWave(s)).toEqual(previewNextWave(s))
  })

  it('marks boss waves and returns null outside the build phase', () => {
    const s = { ...freshRun('scout-boss'), wave: 9, waveBudget: 2000, hpScalePct: 300 }
    const preview = previewNextWave(s)!
    expect(preview.boss).toBe(true)
    expect(preview.counts['boss']).toBe(1)
    const inWave = step(s, [{ type: 'start_wave' }]).state
    expect(previewNextWave(inWave)).toBeNull()
  })
})

describe('cataclysms', () => {
  const clearedAt = (wave: number, extra: Partial<RunState> = {}) => {
    const s = cloneRun(freshRun('cataclysm'))
    s.phase = 'wave'
    s.wave = wave
    s.wavesCleared = wave - 1
    s.spireHp = 100
    s.spireMaxHp = 100
    Object.assign(s, extra)
    return step(s, [])
  }

  it('clearing the victory wave claims victory AND strikes the first cataclysm', () => {
    const { state, events } = clearedAt(24)
    expect(state.victoryClaimed).toBe(true)
    expect(state.cataclysms).toHaveLength(1)
    expect(events.some((e) => e.type === 'cataclysm_struck')).toBe(true)
    expect(() => assertInvariants(state)).not.toThrow()
    // Strikes repeat every 5th cleared wave…
    const later = clearedAt(29, { victoryClaimed: true, cataclysms: [...state.cataclysms] })
    expect(later.state.cataclysms).toHaveLength(2)
    // …and never off-cycle.
    const off = clearedAt(27, { victoryClaimed: true, cataclysms: [...state.cataclysms] })
    expect(off.state.cataclysms).toHaveLength(1)
  })

  it('juggernaut/surge bend the next wave; swarm inflates the scouting report', () => {
    const base = {
      ...cloneRun(freshRun('cataclysm-fx')),
      victoryClaimed: true,
      wave: 25,
      wavesCleared: 25,
      waveBudget: 3000,
      hpScalePct: 2000,
      spireHp: 100,
      spireMaxHp: 100,
    }
    const spawnFirst = (cataclysms: RunState['cataclysms']) => {
      let s = cloneRun({ ...base, cataclysms })
      s = step(s, [{ type: 'start_wave' }]).state
      s = stepUntil(s, (st) => st.enemies.length > 0, 200)
      return s.enemies[0]!
    }
    const plain = spawnFirst([])
    const bent = spawnFirst(['juggernaut', 'surge'])
    expect(bent.maxHp).toBe(Math.floor((plain.maxHp * 130) / 100))
    expect(bent.speed).toBe(Math.floor((plain.speed * 120) / 100))

    // Small budget so the wave unit cap doesn't mask the swarm inflation.
    const lean = { ...base, waveBudget: 600 }
    const calm = previewNextWave(cloneRun({ ...lean, cataclysms: [] }))!
    const swarmed = previewNextWave(cloneRun({ ...lean, cataclysms: ['swarm', 'swarm'] }))!
    expect(swarmed.total).toBeGreaterThan(calm.total)
  })

  it('trials bend spawns exactly as previewed, and pay their spark bonus', () => {
    const base = {
      ...cloneRun(freshRun('trial-fx')),
      wave: 8,
      wavesCleared: 8,
      waveBudget: 2000,
      hpScalePct: 500,
      spireHp: 100,
      spireMaxHp: 100,
    }
    const spawnFirst = (trials: RunState['trials']) => {
      let s = cloneRun({ ...base, trials })
      s = step(s, [{ type: 'start_wave' }]).state
      s = stepUntil(s, (st) => st.enemies.length > 0, 200)
      return s.enemies[0]!
    }
    const plain = spawnFirst([])
    const iron = spawnFirst(['iron_horde'])
    const swift = spawnFirst(['swift_horde'])
    expect(iron.maxHp).toBe(Math.floor((plain.maxHp * 125) / 100))
    expect(swift.speed).toBe(Math.floor((plain.speed * 115) / 100))
    // The scouting report includes the trial — preview never lies.
    const calm = previewNextWave(cloneRun({ ...base, trials: [] }))!
    const ironPreview = previewNextWave(cloneRun({ ...base, trials: ['iron_horde'] }))!
    expect(ironPreview.totalHp).toBeGreaterThan(calm.totalHp)
    // And hardship pays: same progress, bigger spark payout.
    const progressed = { ...cloneRun(freshRun('trial-sparks')), wavesCleared: 10, kills: 120 }
    const plainSparks = computeSparks(progressed)
    const trialSparks = computeSparks({ ...progressed, trials: ['glass_spire'] })
    expect(trialSparks).toBe(Math.floor(((10 * 15 + 10) * 140) / 100))
    expect(trialSparks).toBeGreaterThan(plainSparks)
  })

  it('wavesUntilCataclysm mirrors the strike schedule', () => {
    const s = cloneRun(freshRun('cataclysm-countdown'))
    // No victory yet → no countdown.
    expect(wavesUntilCataclysm(s)).toBeNull()
    // Mid-wave on a strike wave: this clear lands it.
    const striking = { ...s, victoryClaimed: true, phase: 'wave' as const, wave: 29 }
    expect(wavesUntilCataclysm(striking)).toBe(1)
    // Building right after a strike: the full interval lies ahead (waves
    // 25–29 must clear before the next one).
    const justStruck = { ...s, victoryClaimed: true, phase: 'build' as const, wave: 24 }
    expect(wavesUntilCataclysm(justStruck)).toBe(5)
    // Mid-cycle, mid-wave: wave 27 means 27, 28, 29 remain.
    const midCycle = { ...s, victoryClaimed: true, phase: 'wave' as const, wave: 27 }
    expect(wavesUntilCataclysm(midCycle)).toBe(3)
  })
})

describe('single-target niches', () => {
  // One tower, one tanky enemy in range, one tick: the first shot isolates
  // per-target bonuses with no targeting or hp-cap noise.
  const duel = (tower: 'arrow' | 'sniper', enemyType: RunState['enemies'][number]['type'], shield = 0) => {
    const s = cloneRun(freshRun('niche-duel'))
    s.phase = 'wave'
    s.wave = 1
    s.towers.push({
      id: s.nextEntityId++,
      type: tower,
      tier: 1,
      enhance: 0,
      cell: { cx: 5, cy: 5 },
      cooldown: 0,
      targeting: 'first',
      kills: 0,
      damageDealt: 0,
      shots: 0,
    })
    s.enemies.push({
      id: s.nextEntityId++,
      type: enemyType,
      pos: { x: 6500, y: 5500 },
      hp: 1000,
      maxHp: 1000,
      speed: 0,
      slowFactor: 100,
      slowTicks: 0,
      bounty: 1,
      damage: 1,
      shield,
      healCooldown: 0,
      broodCooldown: 0,
      phased: false,
      phaseCooldown: 0,
      targetCell: null,
    })
    return step(s, []).state.towers[0]!.damageDealt
  }

  it('arrows deal double damage to fliers', () => {
    expect(duel('arrow', 'runner')).toBe(7)
    expect(duel('arrow', 'flier')).toBe(14)
  })

  it('snipers deal +50% damage to elites', () => {
    expect(duel('sniper', 'runner')).toBe(60)
    expect(duel('sniper', 'brute')).toBe(90)
    expect(duel('sniper', 'boss')).toBe(90)
  })

  it('snipers pierce shields that block everything else', () => {
    expect(duel('arrow', 'shieldbearer', 999)).toBe(0) // fully blocked
    expect(duel('sniper', 'shieldbearer', 999)).toBe(90) // pierced, and elite
  })
})

describe('probability layer', () => {
  it('crit chance 100 doubles every shot; executioners_seal makes it triple', () => {
    // One arrow (7 dmg), one tanky brute in range: the first tick's shot
    // isolates the multiplier with no hp-cap or targeting noise.
    const duel = (critPct: number, relics: RunState['relics']) => {
      const s = cloneRun(freshRun('crit-duel'))
      s.phase = 'wave'
      s.wave = 1
      s.mods = { ...s.mods, critChancePct: critPct }
      s.relics = relics
      s.towers.push({
        id: s.nextEntityId++,
        type: 'arrow',
        tier: 1,
        enhance: 0,
        cell: { cx: 5, cy: 5 },
        cooldown: 0,
        targeting: 'first',
        kills: 0,
        damageDealt: 0,
        shots: 0,
      })
      s.enemies.push({
        id: s.nextEntityId++,
        type: 'brute',
        pos: { x: 6500, y: 5500 },
        hp: 1000,
        maxHp: 1000,
        speed: 0,
        slowFactor: 100,
        slowTicks: 0,
        bounty: 6,
        damage: 5,
        shield: 0,
        healCooldown: 0,
      broodCooldown: 0,
      phased: false,
      phaseCooldown: 0,
        targetCell: null,
      })
      const { state, events } = step(s, [])
      const fired = events.find((e) => e.type === 'tower_fired')!
      return { dealt: state.towers[0]!.damageDealt, crit: fired.crit }
    }
    expect(duel(0, [])).toEqual({ dealt: 7, crit: false })
    expect(duel(100, [])).toEqual({ dealt: 14, crit: true }) // ×2
    expect(duel(100, ['executioners_seal'])).toEqual({ dealt: 21, crit: true }) // ×3
  })

  it('zero crit investment never touches the combat stream', () => {
    let s = { ...freshRun('crit-zero'), gold: 10_000 }
    const combatBefore = { ...s.rng.combat }
    for (let i = 0; i < 6; i++) {
      const cell = buildCandidates(s)[0]
      if (cell) s = step(s, [{ type: 'place_tower', tower: 'arrow', cell }]).state
    }
    s = step(s, [{ type: 'start_wave' }]).state
    s = stepUntil(s, (st) => st.phase !== 'wave', 20_000)
    expect(s.kills).toBeGreaterThan(0)
    expect(s.rng.combat).toEqual(combatBefore) // no crit, no fortune_idol: stream untouched
  })

  it('fortune_idol doubles some bounties, never more, and stays deterministic', () => {
    const play = (relics: RunState['relics']) => {
      let s = { ...freshRun('fortune-run'), gold: 10_000, relics }
      for (let i = 0; i < 6; i++) {
        const cell = buildCandidates(s)[0]
        if (cell) s = step(s, [{ type: 'place_tower', tower: 'arrow', cell }]).state
      }
      const goldBefore = s.gold
      const luckyKills: boolean[] = []
      s = step(s, [{ type: 'start_wave' }]).state
      for (let t = 0; t < 20_000 && s.phase === 'wave'; t++) {
        const r = step(s, [])
        s = r.state
        for (const e of r.events) if (e.type === 'enemy_killed') luckyKills.push(e.lucky)
      }
      return { earned: s.gold - goldBefore, luckyKills, kills: s.kills }
    }
    const plain = play([])
    const lucky = play(['fortune_idol'])
    expect(plain.luckyKills.every((l) => !l)).toBe(true)
    expect(lucky.kills).toBe(plain.kills) // same seed, same fight
    expect(lucky.luckyKills.some((l) => l)).toBe(true) // ~20% of ~30 kills: some fire
    expect(lucky.luckyKills.every((l) => !l)).toBe(false)
    expect(lucky.earned).toBeGreaterThan(plain.earned)
    expect(lucky.earned).toBeLessThanOrEqual(plain.earned * 2)
    expect(play(['fortune_idol'])).toEqual(lucky) // seeded: perfectly reproducible
  })
})

describe('relic depth', () => {
  it('rerolling costs gold, redraws once, and is refused twice', () => {
    const state = {
      ...freshRun('reroll'),
      wave: 5,
      gold: 500,
      relicOffer: ['overcharge', 'heavy_powder', 'stoneskin'] as RunState['relicOffer'],
    }
    const first = step(state, [{ type: 'reroll_relic' }])
    expect(first.state.gold).toBe(500 - relicSkipGold(5))
    expect(first.state.relicOffer).toHaveLength(3)
    expect(first.state.relicRerolled).toBe(true)
    expect(first.events.some((e) => e.type === 'relic_offered')).toBe(true)
    const second = step(first.state, [{ type: 'reroll_relic' }])
    expect(second.events[0]).toMatchObject({ type: 'command_rejected', reason: 'offer already rerolled' })
    const broke = step({ ...state, gold: 0 }, [{ type: 'reroll_relic' }])
    expect(broke.events[0]).toMatchObject({ type: 'command_rejected', reason: 'not enough gold' })
  })

  it('quickdraw shortens cooldowns; longsight stretches range', () => {
    const duel = (relics: RunState['relics'], enemyX: number) => {
      const s = cloneRun(freshRun('relic-duel'))
      s.phase = 'wave'
      s.wave = 1
      s.relics = relics
      s.towers.push({
        id: s.nextEntityId++,
        type: 'arrow',
        tier: 1,
        enhance: 0,
        cell: { cx: 5, cy: 5 },
        cooldown: 0,
        targeting: 'first',
        kills: 0,
        damageDealt: 0,
        shots: 0,
      })
      s.enemies.push({
        id: s.nextEntityId++,
        type: 'brute',
        pos: { x: enemyX, y: 5500 },
        hp: 1000,
        maxHp: 1000,
        speed: 0,
        slowFactor: 100,
        slowTicks: 0,
        bounty: 3,
        damage: 3,
        shield: 0,
        healCooldown: 0,
        broodCooldown: 0,
        phased: false,
        phaseCooldown: 0,
        targetCell: null,
      })
      return step(s, []).state.towers[0]!
    }
    // In range for both: quickdraw reloads faster (15 → 13 ticks).
    expect(duel([], 6500).cooldown).toBe(15)
    expect(duel(['quickdraw'], 6500).cooldown).toBe(13)
    // 3.0 cells out: beyond base arrow range (2.8), inside longsight (3.22).
    expect(duel([], 8500).shots).toBe(0)
    expect(duel(['longsight'], 8500).shots).toBe(1)
  })

  it('weighted offers only ever contain unowned relics, no duplicates', () => {
    const s = cloneRun(freshRun('weighted'))
    s.relics = ['colossus', 'glass_cannon'] // both legendaries owned
    const pool = RELIC_IDS.filter((r) => !s.relics.includes(r))
    const offer = drawRelicOffer(s, pool, 3)
    expect(new Set(offer).size).toBe(3)
    for (const id of offer) expect(s.relics).not.toContain(id)
  })

  it('pity floor: past wave 15 an offer never rolls all commons', () => {
    // Early draws CAN roll all-common (that's the variance pity removes);
    // find such a seed deterministically, then prove the same stream at
    // wave 15 upgrades a slot.
    let pitiedSeed: string | null = null
    for (let i = 0; i < 50 && pitiedSeed === null; i++) {
      const s = cloneRun(freshRun(`pity-${i}`))
      const offer = drawRelicOffer(s, [...RELIC_IDS], 3) as RelicId[]
      if (offer.every((id) => RELICS[id].rarity === 'common')) pitiedSeed = `pity-${i}`
    }
    expect(pitiedSeed).not.toBeNull()
    const deep = cloneRun(freshRun(pitiedSeed!))
    deep.wave = RELIC_PITY_WAVE
    const offer = drawRelicOffer(deep, [...RELIC_IDS], 3) as RelicId[]
    expect(offer.some((id) => RELICS[id].rarity !== 'common')).toBe(true)
    // And the guarantee holds across many deep-run seeds.
    for (let i = 0; i < 40; i++) {
      const s = cloneRun(freshRun(`pity-deep-${i}`))
      s.wave = RELIC_PITY_WAVE + (i % 10)
      const o = drawRelicOffer(s, [...RELIC_IDS], 3) as RelicId[]
      expect(o.some((id) => RELICS[id].rarity !== 'common')).toBe(true)
      expect(new Set(o).size).toBe(3)
    }
  })
})

describe('threat estimate', () => {
  it('preview totalHp matches the wave that actually spawns, affixes and all', () => {
    for (const seed of ['threat-a', 'threat-b']) {
      // Deep enough that affixes can roll; tall spire so waves clear.
      let s = { ...cloneRun(freshRun(seed)), spireHp: 100_000, spireMaxHp: 100_000 }
      for (let wave = 1; wave <= 9; wave++) {
        const preview = previewNextWave(s)!
        let started = step(s, [{ type: 'start_wave' }]).state
        let spawnedHp = 0
        let spawned = 0
        while ((started.pendingSpawns.length > 0 || started.enemies.length > 0) && started.tick < 60_000) {
          const before = new Set(started.enemies.map((e) => e.id))
          started = step(started, []).state
          for (const e of started.enemies) {
            if (!before.has(e.id) && e.type !== 'splitling' && e.bounty !== 0) {
              // count only wave spawns (not splits/broods)
              spawnedHp += e.maxHp
              spawned += 1
            }
          }
        }
        expect(spawned, `${seed} wave ${wave}`).toBe(preview.total)
        expect(spawnedHp, `${seed} wave ${wave}`).toBe(preview.totalHp)
        s = cloneRun(started)
      }
    }
  })
})

describe('bulwark', () => {
  it('absorbs arrivals entirely while active, then expires', () => {
    const s = cloneRun(freshRun('bulwark'))
    s.abilities['bulwark'] = 0
    s.phase = 'wave'
    s.wave = 1
    s.spireHp = 10
    s.spireMaxHp = 10
    const map = getMap(s.mapId)
    // A boss standing on the spire cell arrives next tick for 8 damage.
    s.enemies.push({
      id: s.nextEntityId++,
      type: 'boss',
      pos: cellCenter(map.spire),
      hp: 500,
      maxHp: 500,
      speed: 46,
      slowFactor: 100,
      slowTicks: 0,
      bounty: 40,
      damage: 8,
      shield: 0,
      healCooldown: 0,
      broodCooldown: 0,
      phased: false,
      phaseCooldown: 0,
      targetCell: null,
    })
    const shielded = step(s, [{ type: 'cast_ability', ability: 'bulwark', cell: map.spire }]).state
    expect(shielded.spireHp).toBe(10) // absorbed
    expect(shielded.bulwarkTicks).toBeGreaterThan(0)
    expect(shielded.abilities['bulwark']).toBeGreaterThan(0) // on cooldown

    // Without the sigil, the same arrival hurts (then the clear knits +1).
    const bare = step(s, []).state
    expect(bare.spireHp).toBe(10 - 8 + 1)

    // The window expires on its own.
    let expiring = shielded
    for (let i = 0; i < 200 && expiring.bulwarkTicks > 0; i++) expiring = step(expiring, []).state
    expect(expiring.bulwarkTicks).toBe(0)
  })
})
