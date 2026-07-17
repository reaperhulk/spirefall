import { describe, it } from 'vitest'
import { autoplay, playProgression } from '../../harness/autoplay'
import { BOTS } from '../../harness/bots'
import { DEFAULT_BUY_PRIORITY, richMeta } from '../../harness/scenarios'
import { createMeta, createRun } from '../meta'

describe('measure', () => {
  it('10hp envelope', () => {
    for (const seed of ['alpha', 'beta', 'delta']) {
      for (const [name, bot] of Object.entries(BOTS)) {
        const { state } = autoplay(createRun(createMeta(), seed), bot, 800_000)
        console.log(`${seed}/${name}: waves=${state.wavesCleared} sparks=${state.sparksEarned} min@1x=${(state.tick / 1800).toFixed(1)}`)
      }
    }
    for (const sparks of [1000, 3000, 20000, 60000]) {
      const meta = richMeta(sparks)
      for (const seed of ['alpha', 'beta']) {
        const { state } = autoplay(createRun(meta, seed), BOTS.balanced, 900_000)
        console.log(`rich(${sparks})/${seed}: waves=${state.wavesCleared} outcome=${state.phase}`)
      }
    }
    const { history } = playProgression(18, 'career', BOTS.balanced, DEFAULT_BUY_PRIORITY, { maxTicksPerRun: 900_000 })
    console.log(`career18: [${history.map((h) => h.wavesCleared).join(',')}] [${history.map((h) => h.outcome[0]).join(',')}]`)
  }, 900_000)
})
