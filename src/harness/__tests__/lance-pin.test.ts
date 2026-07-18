import { describe, expect, it } from 'vitest'
import { createMeta, createRun } from '../../engine/meta'
import { autoplay, spendSparks } from '../autoplay'
import { makePolicyBot, type PolicyGenome } from '../policy'
import { RELIC_PRIORITY } from '../bots'

// Lance launch pin (marathon II-74): a dedicated lance-rush must not win
// below the intended curve. Measured at launch: defeats at waves 14-16
// across 5k/8k/20k — the ramp is a specialist's tool (1-2 lances holding a
// boss for a real comp), not a core to rush. If this goes red, the ramp
// economy broke.
const LANCE_RUSH: PolicyGenome = {
  ratio: { arrow: 3, cannon: 2, frost: 2, tesla: 0, sniper: 0, mint: 1, beacon: 2, lance: 8 },
  earlyType: 'arrow',
  upgradeAtTowers: 6,
  targetBase: 5,
  targetPerWave: 1,
  targetMax: 18,
  enhanceStrategy: 'lance',
  repairDeficit: 2,
  repairMinGold: 180,
  waveRepairPct: 40,
  specChoice: 0,
  placement: 'killboxCluster',
  enhanceFocus: 'focus',
  targetingByType: { lance: 'strongest' },
  relicPriority: RELIC_PRIORITY,
  metaPriority: [
    'unlock_lance', 'tower_damage', 'unlock_beacon', 'crit_chance', 'gold_income',
    'spire_hp', 'wave_skip', 'unlock_tesla', 'unlock_mint', 'spark_gain',
    'unlock_gold_rush', 'unlock_bulwark', 'starting_gold',
  ],
}

describe('lance probe', () => {
  it('a lance-rush cannot win below the curve', () => {
    for (const budget of [5000, 8000]) {
      for (const seed of ['alpha', 'gamma']) {
        const meta = spendSparks({ ...createMeta(), sparks: budget }, LANCE_RUSH.metaPriority)
        const { state } = autoplay(createRun(meta, seed), makePolicyBot(LANCE_RUSH), 150_000)
        expect(state.phase, `${seed} @ ${budget} sparks`).toBe('defeat')
      }
    }
  }, 300_000)
})
