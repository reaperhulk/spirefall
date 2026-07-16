// M0 placeholder entry: prove the pure engine runs unchanged in the browser by
// executing a short headless run and printing its event log. Replaced at M2 by
// the canvas renderer + React shell (PLAN.md §6).
import { createRun, TICKS_PER_SECOND } from './engine/step'
import type { GameEvent } from './engine/types'
import { simulate, type ScheduledCommand } from './harness/simulate'

const seed = `demo-${new Date().toISOString().slice(0, 10)}`
const log: ScheduledCommand[] = []
for (let wave = 0; wave < 50; wave++) {
  log.push({ tick: wave * 4 * TICKS_PER_SECOND, command: { type: 'start_wave' } })
}

const { state, events } = simulate(createRun(seed), log, 300 * TICKS_PER_SECOND)

const lines = [
  `seed: ${seed}`,
  '',
  ...events
    .filter((e): e is Exclude<GameEvent, { type: 'command_rejected' }> => e.type !== 'command_rejected')
    .map((e) => {
      switch (e.type) {
        case 'wave_started':
          return `wave ${e.wave} begins`
        case 'spire_damaged':
          return `  the spire takes ${e.amount} damage (${e.spireHp} hp left)`
        case 'wave_cleared':
          return `  wave ${e.wave} survived (+${e.goldAwarded} gold)`
        case 'run_ended':
          return `\nTHE SPIRE FALLS. ${e.wavesCleared} waves cleared → ${e.sparks} sparks earned.`
      }
    }),
  '',
  `final state: tick=${state.tick} phase=${state.phase} sparks=${state.sparksEarned}`,
]

document.querySelector('#demo')!.textContent = lines.join('\n')
