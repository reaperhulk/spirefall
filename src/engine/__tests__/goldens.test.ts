import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { autoplay } from '../../harness/autoplay'
import { hashState } from '../../harness/hash'
import { BOT_FOR, SCENARIOS } from '../../harness/scenarios'
import { createRun } from '../meta'

// Golden playthroughs: named deterministic scenarios whose outcomes are
// pinned. Any engine or content change that alters gameplay trips these —
// intentionally. To accept a balance change run `npm run goldens:update`
// and commit the diff; the review shows exactly how outcomes moved.

interface Golden {
  ticks: number
  wavesCleared: number
  kills: number
  outcome: string
  sparks: number
  stateHash: string
}

const FIXTURE = join(import.meta.dirname, '..', '..', '..', 'fixtures', 'goldens.json')
const UPDATE = process.env['UPDATE_GOLDENS'] === '1'

function playAll(): Record<string, Golden> {
  const results: Record<string, Golden> = {}
  for (const scenario of SCENARIOS) {
    const run = createRun(scenario.meta(), scenario.seed)
    const { state } = autoplay(run, BOT_FOR[scenario.bot], scenario.maxTicks)
    results[scenario.name] = {
      ticks: state.tick,
      wavesCleared: state.wavesCleared,
      kills: state.kills,
      outcome: state.phase,
      sparks: state.sparksEarned,
      stateHash: hashState(state),
    }
  }
  return results
}

describe('golden playthroughs', () => {
  it(
    'match the pinned outcomes (run `npm run goldens:update` to accept changes)',
    () => {
      const actual = playAll()
      if (UPDATE) {
        mkdirSync(dirname(FIXTURE), { recursive: true })
        writeFileSync(FIXTURE, JSON.stringify(actual, null, 2) + '\n')
        return
      }
      const expected = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Record<string, Golden>
      expect(actual).toEqual(expected)
    },
    // Four full bot playthroughs — well past vitest's 5s default on CI runners.
    120_000,
  )
})
