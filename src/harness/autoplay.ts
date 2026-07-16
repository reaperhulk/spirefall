import { assertInvariants } from '../engine/invariants'
import { buyMetaUpgrade, createMeta, createRun, metaUpgradeCost, settleRun } from '../engine/meta'
import { step } from '../engine/step'
import type { Command, GameEvent, MetaState, RunState, RunSummary } from '../engine/types'
import type { MetaUpgradeId } from '../data/metaTree'
import type { Bot } from './bots'

export interface ScheduledCommand {
  tick: number
  command: Command
}

export interface AutoplayOptions {
  checkInvariants?: boolean
  onEvents?: (events: GameEvent[], state: RunState) => void
}

export interface AutoplayResult {
  state: RunState
  commandLog: ScheduledCommand[] // replayable record of everything the bot did
  ticks: number
}

// Let a bot play a run to its end (or a tick cap). The returned commandLog
// replays to the identical final state — bots, replays, and golden tests are
// all the same mechanism.
export function autoplay(initial: RunState, bot: Bot, maxTicks: number, options: AutoplayOptions = {}): AutoplayResult {
  let state = initial
  const commandLog: ScheduledCommand[] = []
  while (state.phase !== 'defeat' && state.phase !== 'victory' && state.tick < maxTicks) {
    const commands = bot(state)
    for (const command of commands) commandLog.push({ tick: state.tick, command })
    const result = step(state, commands)
    state = result.state
    if (options.checkInvariants === true) assertInvariants(state)
    if (options.onEvents) options.onEvents(result.events, state)
  }
  return { state, commandLog, ticks: state.tick }
}

export interface ProgressionResult {
  meta: MetaState
  history: RunSummary[]
}

// Play `runs` consecutive runs, banking Sparks and buying meta upgrades from
// `buyPriority` between runs — a whole player career, headless.
export function playProgression(
  runs: number,
  seedBase: string,
  bot: Bot,
  buyPriority: MetaUpgradeId[],
  options: { maxTicksPerRun?: number; startingMeta?: MetaState } = {},
): ProgressionResult {
  const maxTicks = options.maxTicksPerRun ?? 400_000
  let meta = options.startingMeta ?? createMeta()
  const history: RunSummary[] = []
  for (let i = 1; i <= runs; i++) {
    const run = createRun(meta, `${seedBase}-run${i}`)
    const { state } = autoplay(run, bot, maxTicks)
    if (state.phase !== 'defeat' && state.phase !== 'victory') {
      throw new Error(`run ${i} did not finish within ${maxTicks} ticks (wave ${state.wave})`)
    }
    const settled = settleRun(meta, state)
    meta = settled.meta
    history.push(settled.summary)
    meta = spendSparks(meta, buyPriority)
  }
  return { meta, history }
}

export function spendSparks(meta: MetaState, buyPriority: MetaUpgradeId[]): MetaState {
  let current = meta
  for (;;) {
    let bought = false
    for (const id of buyPriority) {
      const cost = metaUpgradeCost(current, id)
      if (cost !== null && current.sparks >= cost) {
        current = buyMetaUpgrade(current, id).meta
        bought = true
        break
      }
    }
    if (!bought) return current
  }
}
