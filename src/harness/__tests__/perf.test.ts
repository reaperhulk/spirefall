import { describe, expect, it } from 'vitest'
import { ENEMIES } from '../../data/content'
import { cellCenter } from '../../engine/grid'
import { getRunMap } from '../../engine/mapgen'
import { createMeta, createRun } from '../../engine/meta'
import { step } from '../../engine/step'
import type { Enemy, RunState } from '../../engine/types'
import { autoplay, spendSparks } from '../autoplay'
import { balancedBot, buildCandidates } from '../bots'
import { DEFAULT_BUY_PRIORITY } from '../scenarios'

// Performance budget (PLAN.md §5.8): the sim must stay cheap enough that CI
// can afford thousands of headless runs. The budget includes bot overhead —
// that's the realistic cost of a harness tick — and is generous enough to
// avoid CI-hardware flake while still catching order-of-magnitude regressions.
describe('performance budget', () => {
  it('a full bot run averages under 0.5ms per tick', () => {
    const t0 = performance.now()
    const { state } = autoplay(createRun(createMeta(), 'perf'), balancedBot, 400_000)
    const elapsed = performance.now() - t0
    expect(state.phase).toBe('defeat') // sanity: a real, full run was measured
    expect(state.tick).toBeGreaterThan(2_000) // fresh runs are deliberately short now
    expect(elapsed / state.tick).toBeLessThan(0.5)
  }, 120_000)

  // The test above measures a FRESH account, which dies around wave 9 with a
  // few dozen bodies on the board — nowhere near the worst tick the engine
  // actually has to survive. The expensive tick is late-endless: a full
  // battlefield of towers against a horde, where the per-tick work is
  // towers x enemies. Build that directly rather than grinding a bot to
  // wave 30 for it, so the budget names one explicit worst case.
  //
  // Measured 2026-07: ~0.28ms for 39 towers x ~260 enemies. The 2ms ceiling
  // is ~7x that — loose enough for slower CI hardware, tight enough that an
  // order-of-magnitude regression (an accidental O(n^2) over enemies, say)
  // cannot hide the way it would under the 15x headroom this started with.
  it('a full board against a 300-strong horde stays under 2ms per tick', () => {
    let s: RunState = { ...createRun(spendSparks({ ...createMeta(), sparks: 60_000 }, DEFAULT_BUY_PRIORITY), 'perf-horde'), gold: 500_000 }

    // A full board: every buildable cell the placement doctrine likes, in a
    // spread of types so beacon auras and mint payouts are in the mix too.
    const types = ['arrow', 'cannon', 'frost', 'tesla', 'sniper', 'beacon', 'mint'] as const
    const spots = buildCandidates(s).slice(0, 40)
    for (const [i, cell] of spots.entries()) {
      s = step(s, [{ type: 'place_tower', tower: types[i % types.length]!, cell }]).state
    }
    expect(s.towers.length).toBeGreaterThanOrEqual(30)

    // The horde: a real late-wave mix, spread back along the spawn corridor
    // so they stream rather than stack on one cell.
    const map = getRunMap(s)
    const spawn = cellCenter(map.spawn)
    const mix = ['runner', 'swarmling', 'brute', 'shieldbearer', 'wraith', 'healer'] as const
    s.phase = 'wave'
    s.wave = 30
    s.pendingSpawns = [{ type: 'runner', tick: 1_000_000 }] // pin the wave open
    for (let i = 0; i < 300; i++) {
      const type = mix[i % mix.length]!
      const def = ENEMIES[type]
      const enemy: Enemy = {
        id: s.nextEntityId++,
        type,
        pos: { x: spawn.x - (i % 30) * 200, y: spawn.y + ((Math.floor(i / 30) % 5) - 2) * 300 },
        hp: def.hp * 20,
        maxHp: def.hp * 20,
        speed: def.speed,
        slowFactor: 100,
        slowTicks: 0,
        bounty: def.bounty,
        damage: def.damage,
        shield: def.shield,
        armor: def.armor ?? 0,
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
      }
      s.enemies.push(enemy)
    }

    const enemiesAtStart = s.enemies.length
    const TICKS = 600
    const t0 = performance.now()
    for (let i = 0; i < TICKS; i++) s = step(s, []).state
    const perTick = (performance.now() - t0) / TICKS

    // Sanity: this measured a genuinely loaded board, not an empty one that
    // cleared on tick 2. Enemies are given 20x HP so the horde survives the
    // whole window and every tick pays full targeting cost.
    expect(enemiesAtStart).toBe(300)
    expect(s.enemies.length).toBeGreaterThan(200)
    // Print it: a budget nobody can see the headroom on is a budget that
    // silently rots until the day it fails.
    console.log(
      `horde tick: ${perTick.toFixed(3)}ms with ${s.towers.length} towers x ${s.enemies.length} enemies ` +
        `(budget 2ms, ${Math.round((perTick / 2) * 100)}% used)`,
    )
    expect(perTick).toBeLessThan(2)
  }, 120_000)
})
