// M0/M1 placeholder entry: prove the pure engine runs unchanged in the browser
// by letting a bot play a full run headlessly and printing what happened.
// Replaced at M2 by the canvas renderer + React shell (PLAN.md §6).
import { createMeta, createRun } from './engine/meta'
import { autoplay } from './harness/autoplay'
import { balancedBot } from './harness/bots'

const seed = `demo-${new Date().toISOString().slice(0, 10)}`
const run = createRun(createMeta(), seed)
const { state, commandLog } = autoplay(run, balancedBot, 400_000)

const lines = [
  `seed: ${seed}  (map ${state.mapId})`,
  '',
  `a bot just played a whole run in your browser:`,
  `  waves cleared: ${state.wavesCleared}`,
  `  kills: ${state.kills}`,
  `  towers built: ${state.towers.length}`,
  `  relics: ${state.relics.join(', ') || 'none'}`,
  `  commands issued: ${commandLog.length}`,
  `  outcome: ${state.phase}`,
  '',
  `THE SPIRE FALLS. ${state.sparksEarned} sparks earned.`,
]

document.querySelector('#demo')!.textContent = lines.join('\n')
