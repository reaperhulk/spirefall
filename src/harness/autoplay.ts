import { assertInvariants } from '../engine/invariants'
import { ascend, buyEmberUpgrade, buyMetaUpgrade, canAscend, createMeta, createRun, metaUpgradeCost, settleRun } from '../engine/meta'
import { step } from '../engine/step'
import type { Command, GameEvent, MetaState, RunState, RunSummary } from '../engine/types'
import type { MetaUpgradeId } from '../data/metaTree'
import type { EmberUpgradeId } from '../data/emberTree'
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
  purchases: number[] // Spire Tree levels bought after each run
  ascensions: number[] // 1-based run numbers after which the career ascended
  simSeconds: number[] // simulated length of each run (ticks / 30)
}

export interface ProgressionOptions {
  maxTicksPerRun?: number
  startingMeta?: MetaState
  // Prestige policy: asked after every settled run. A career that never
  // ascends measures one cycle; one that does measures the loop.
  ascendWhen?: (meta: MetaState, history: RunSummary[]) => boolean
  emberPriority?: EmberUpgradeId[]
  // Crucible rank to start each run at (clamped to what the ladder allows).
  // Absent = the account's chosen rank, which defaults to 0.
  crucibleFor?: (meta: MetaState) => number
  // End the career early once it has shown what it needed to.
  stopWhen?: (history: RunSummary[], ascensions: number[]) => boolean
}

// Play `runs` consecutive runs, banking Sparks and buying meta upgrades from
// `buyPriority` between runs — a whole player career, headless.
export function playProgression(
  runs: number,
  seedBase: string,
  bot: Bot,
  buyPriority: MetaUpgradeId[],
  options: ProgressionOptions = {},
): ProgressionResult {
  const maxTicks = options.maxTicksPerRun ?? 400_000
  let meta = options.startingMeta ?? createMeta()
  const history: RunSummary[] = []
  const purchases: number[] = []
  const ascensions: number[] = []
  const simSeconds: number[] = []
  for (let i = 1; i <= runs; i++) {
    const run = createRun(meta, `${seedBase}-run${i}`, undefined, undefined, options.crucibleFor?.(meta))
    const { state } = autoplay(run, bot, maxTicks)
    if (state.phase !== 'defeat' && state.phase !== 'victory') {
      throw new Error(`run ${i} did not finish within ${maxTicks} ticks (wave ${state.wave})`)
    }
    simSeconds.push(Math.round(state.tick / 30))
    const settled = settleRun(meta, state)
    meta = settled.meta
    history.push(settled.summary)
    if (options.ascendWhen && canAscend(meta) && options.ascendWhen(meta, history)) {
      meta = spendEmbers(ascend(meta), options.emberPriority ?? [])
      ascensions.push(i)
    }
    const levelsBefore = totalLevels(meta)
    meta = spendSparks(meta, buyPriority)
    purchases.push(totalLevels(meta) - levelsBefore)
    if (options.stopWhen?.(history, ascensions)) break
  }
  return { meta, history, purchases, ascensions, simSeconds }
}

function totalLevels(meta: MetaState): number {
  return Object.values(meta.upgrades).reduce((sum, n) => sum + n, 0)
}

// Spend Embers down a priority list, cheapest-first within it: the list is
// walked from the top every time, so an unaffordable head never strands
// Embers a lower entry could use.
export function spendEmbers(meta: MetaState, priority: EmberUpgradeId[]): MetaState {
  let current = meta
  for (;;) {
    let bought = false
    for (const id of priority) {
      const result = buyEmberUpgrade(current, id)
      if (!result.ok) continue
      current = result.meta
      bought = true
      break
    }
    if (!bought) return current
  }
}

// Spend down the priority list, skipping anything the tree will not sell:
// maxed nodes, unaffordable ones, tiers whose branch gate is unpaid, and
// keystones whose rival is already taken. buyMetaUpgrade is the single
// authority on all of that — asking it and believing the answer means the
// bots can never buy something a player could not.
export function spendSparks(meta: MetaState, buyPriority: MetaUpgradeId[]): MetaState {
  let current = meta
  for (;;) {
    let bought = false
    for (const id of buyPriority) {
      const cost = metaUpgradeCost(current, id)
      if (cost === null || current.sparks < cost) continue
      const result = buyMetaUpgrade(current, id)
      if (!result.ok) continue // locked tier or keystone conflict — try the next
      current = result.meta
      bought = true
      break
    }
    if (!bought) return current
  }
}
