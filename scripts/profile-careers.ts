// Career pacing profile: the incremental loop measured end to end.
// ./node_modules/.bin/vite-node scripts/profile-careers.ts [runs] [out.json]
import { writeFileSync } from 'node:fs'
import { playProgression } from '../src/harness/autoplay'
import { BOTS } from '../src/harness/bots'
import { DEFAULT_BUY_PRIORITY, DEFAULT_EMBER_PRIORITY, DEFAULT_ASCEND_WHEN } from '../src/harness/scenarios'
import { careerPacing } from '../src/harness/pacing'

const runs = Number(process.argv[2] ?? 40)
const out = process.argv[3]
const seeds = (process.env['CAREER_SEEDS'] ?? 'career').split(',')
const results = []
for (const seed of seeds) for (const pilot of ['balanced', 'active'] as const) {
  const career = playProgression(runs, seed, BOTS[pilot], DEFAULT_BUY_PRIORITY, {
    ascendWhen: DEFAULT_ASCEND_WHEN,
    emberPriority: DEFAULT_EMBER_PRIORITY,
  })
  const pacing = careerPacing(career)
  const result = {
    pilot,
    seed,
    ...pacing,
    history: career.history.map((h, i) => ({ waves: h.wavesCleared, sparks: h.sparks, outcome: h.outcome, crucible: h.crucible, bought: career.purchases[i], seconds: career.simSeconds[i] })),
  }
  results.push(result)
  console.log(pilot, seed, JSON.stringify(pacing.cycles.map((c) => c.firstVictory)))
  console.log('  ' + result.history.map((h) => `${h.waves}${h.outcome === 'victory' ? 'V' : ''}/${h.sparks}/${h.bought}`).join(' '))
}
if (out) writeFileSync(out, JSON.stringify({ note: 'Deterministic reference careers (waves/sparks/levels bought), not human win rates.', results }, null, 2) + '\n')
