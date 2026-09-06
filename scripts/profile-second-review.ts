import { writeFileSync } from 'node:fs'
import { playProgression } from '../src/harness/autoplay'
import { BOTS } from '../src/harness/bots'
import { DEFAULT_BUY_PRIORITY } from '../src/harness/scenarios'
const results = []
for (const pilot of ['balanced', 'active'] as const) {
  const { history, meta } = playProgression(24, 'career', BOTS[pilot], DEFAULT_BUY_PRIORITY)
  const result = { pilot, firstVictory: history.findIndex(h => h.outcome === 'victory') + 1, totalSparks: meta.totalSparks,
    history: history.map(h => ({ waves: h.wavesCleared, biome: h.biome, sparks: h.sparks, outcome: h.outcome })) }
  results.push(result); console.log(JSON.stringify(result))
}
writeFileSync('docs/second-review-careers.json', JSON.stringify({ rules: 5, note: 'Deterministic reference careers, not human win rates.', results }, null, 2) + '\n')
