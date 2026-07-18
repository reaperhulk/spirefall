import type { MetaUpgradeId } from '../data/metaTree'
import { META_TREE } from '../data/metaTree'
import { nextInt, type Rng } from '../engine/rng'
import { BOON_IDS, type BoonId, TOWERS } from '../data/content'
import type { RelicId, RunState, Targeting, TowerType } from '../engine/types'
import { type Bot, type BuildKnobs, buildActions, RELIC_PRIORITY, waveActions } from './bots'
import { PLACEMENT_STRATEGIES, type PlacementStrategy } from './placement'

// A PolicyGenome is a whole strategy as plain data: what to build, when to
// upgrade, what to buy between runs. The build fuzzer searches this space
// for strategies that break the intended difficulty curve. Everything is
// JSON, so any find is trivially reproducible and pinnable as a regression.

export const TOWER_TYPES: TowerType[] = ['arrow', 'cannon', 'frost', 'tesla', 'sniper', 'mint', 'beacon', 'lance']

export interface PolicyGenome {
  ratio: Record<TowerType, number> // build weights, 0 = never build
  earlyType: TowerType // what to build before wave 3
  upgradeAtTowers: number
  targetBase: number
  targetPerWave: number
  targetMax: number
  enhanceStrategy: 'cheapest' | TowerType
  repairDeficit: number
  repairMinGold: number
  waveRepairPct: number // 0 disables mid-wave repairs
  specChoice: 0 | 1 // global tier-3 path fallback (kept for pinned genomes)
  relicPriority: RelicId[]
  metaPriority: MetaUpgradeId[] // spark spending order between runs
  // Breadth axes (2026-07). OPTIONAL: pinned genome literals predate them,
  // and absent fields must reproduce the exact behavior they were pinned
  // with — makePolicyBot defaults each to the pre-axis semantics.
  placement?: PlacementStrategy // spatial doctrine incl. mazing (placement.ts)
  specByType?: Record<TowerType, 0 | 1> // per-type tier-3 paths (32 combos, not 2)
  enhanceFocus?: 'spread' | 'focus' // focus = max ONE tower out
  targetingByType?: Partial<Record<TowerType, Targeting>> // per-type fire doctrine
  // Overcharge doctrine (2026-07, active-play package). The bot plays the
  // attention-free CEILING — arming every ready tower — so the fuzzer probes
  // what perfect spam is worth, which no human reaches.
  overchargePolicy?: 'never' | 'boss' | 'ready'
  // Boon doctrine: preference ranking over BOON_IDS; absent = always skip.
  boonPriority?: BoonId[]
}

const OVERCHARGE_POLICIES = ['never', 'boss', 'ready'] as const

const META_IDS = META_TREE.map((n) => n.id)
const TARGETINGS: readonly Targeting[] = ['first', 'last', 'strongest', 'weakest', 'nearest', 'elites']

// Deterministic helpers on the engine's own seeded RNG — the fuzzer must be
// perfectly reproducible from its seed string (no Math.random, ever).

function draw(rng: Rng, min: number, max: number): { value: number; rng: Rng } {
  return nextInt(rng, min, max)
}

function shuffled<T>(rng: Rng, items: readonly T[]): { value: T[]; rng: Rng } {
  const out = [...items]
  let r = rng
  for (let i = out.length - 1; i > 0; i--) {
    const pick = nextInt(r, 0, i)
    r = pick.rng
    const tmp = out[i]!
    out[i] = out[pick.value]!
    out[pick.value] = tmp
  }
  return { value: out, rng: r }
}

function pickOne<T>(rng: Rng, items: readonly T[]): { value: T; rng: Rng } {
  const pick = nextInt(rng, 0, items.length - 1)
  return { value: items[pick.value]!, rng: pick.rng }
}

export function randomGenome(rng: Rng): { genome: PolicyGenome; rng: Rng } {
  let r = rng
  const ratio = {} as Record<TowerType, number>
  for (const t of TOWER_TYPES) {
    const w = draw(r, 0, 8)
    r = w.rng
    ratio[t] = w.value
  }
  if (TOWER_TYPES.every((t) => ratio[t] === 0)) ratio.arrow = 1 // never a build-nothing genome
  const early = pickOne(r, ['arrow', 'arrow', 'cannon', 'frost'] as const) // cheap openers dominate the draw
  r = early.rng
  const upgradeAt = draw(r, 3, 12)
  r = upgradeAt.rng
  const targetBase = draw(r, 2, 8)
  r = targetBase.rng
  const targetPerWave = draw(r, 0, 2)
  r = targetPerWave.rng
  const targetMax = draw(r, 12, 30)
  r = targetMax.rng
  const enhance = pickOne(r, ['cheapest', 'cheapest', ...TOWER_TYPES] as const)
  r = enhance.rng
  const repairDeficit = draw(r, 1, 5)
  r = repairDeficit.rng
  const repairMinGold = draw(r, 8, 40) // ×10 gold
  r = repairMinGold.rng
  const waveRepairPct = draw(r, 0, 7) // ×10 → 0..70%
  r = waveRepairPct.rng
  const relics = shuffled(r, RELIC_PRIORITY)
  r = relics.rng
  const metas = shuffled(r, META_IDS)
  r = metas.rng
  const placement = pickOne(r, PLACEMENT_STRATEGIES)
  r = placement.rng
  const specByType = {} as Record<TowerType, 0 | 1>
  for (const t of TOWER_TYPES) {
    const bit = draw(r, 0, 1)
    r = bit.rng
    specByType[t] = bit.value as 0 | 1
  }
  const focus = pickOne(r, ['spread', 'spread', 'focus'] as const)
  r = focus.rng
  // Sparse targeting: 0 = leave the engine default, else a doctrine.
  const targetingByType: Partial<Record<TowerType, Targeting>> = {}
  for (const t of TOWER_TYPES) {
    const pick = draw(r, 0, TARGETINGS.length)
    r = pick.rng
    if (pick.value > 0) targetingByType[t] = TARGETINGS[pick.value - 1]!
  }
  const oc = pickOne(r, OVERCHARGE_POLICIES)
  r = oc.rng
  const boons = shuffled(r, BOON_IDS)
  r = boons.rng
  return {
    genome: {
      ratio,
      earlyType: early.value,
      upgradeAtTowers: upgradeAt.value,
      targetBase: targetBase.value,
      targetPerWave: targetPerWave.value,
      targetMax: targetMax.value,
      enhanceStrategy: enhance.value,
      repairDeficit: repairDeficit.value,
      repairMinGold: repairMinGold.value * 10,
      waveRepairPct: waveRepairPct.value * 10,
      specChoice: (waveRepairPct.value % 2) as 0 | 1, // seeded, no extra draw
      relicPriority: relics.value,
      metaPriority: metas.value,
      placement: placement.value,
      specByType,
      enhanceFocus: focus.value,
      targetingByType,
      overchargePolicy: oc.value,
      boonPriority: boons.value,
    },
    rng: r,
  }
}

// Perturb 1–3 aspects of a genome. Mutation is how the search escapes the
// "reasonable strategy" basin and finds degenerate corners.
export function mutateGenome(rng: Rng, genome: PolicyGenome): { genome: PolicyGenome; rng: Rng } {
  let r = rng
  const g: PolicyGenome = JSON.parse(JSON.stringify(genome)) as PolicyGenome
  const count = draw(r, 1, 3)
  r = count.rng
  for (let i = 0; i < count.value; i++) {
    const which = draw(r, 0, 12)
    r = which.rng
    switch (which.value) {
      case 0: {
        // Reweight one tower — including to 0 (mono-builds emerge this way).
        const t = pickOne(r, TOWER_TYPES)
        r = t.rng
        const w = draw(r, 0, 8)
        r = w.rng
        g.ratio[t.value] = w.value
        if (TOWER_TYPES.every((k) => g.ratio[k] === 0)) g.ratio[t.value] = 1
        break
      }
      case 1: {
        const v = draw(r, 3, 12)
        r = v.rng
        g.upgradeAtTowers = v.value
        break
      }
      case 2: {
        const v = draw(r, 12, 30)
        r = v.rng
        g.targetMax = v.value
        break
      }
      case 3: {
        const e = pickOne(r, ['cheapest', ...TOWER_TYPES] as const)
        r = e.rng
        g.enhanceStrategy = e.value
        break
      }
      case 4: {
        const v = draw(r, 0, 7)
        r = v.rng
        g.waveRepairPct = v.value * 10
        g.specChoice = (v.value % 2) as 0 | 1 // ride the same mutation slot
        break
      }
      case 5: {
        // Swap two relic priorities.
        const a = draw(r, 0, g.relicPriority.length - 1)
        r = a.rng
        const b = draw(r, 0, g.relicPriority.length - 1)
        r = b.rng
        const tmp = g.relicPriority[a.value]!
        g.relicPriority[a.value] = g.relicPriority[b.value]!
        g.relicPriority[b.value] = tmp
        break
      }
      case 6: {
        // Promote one meta node to the front of the spending order.
        const m = draw(r, 0, g.metaPriority.length - 1)
        r = m.rng
        const [node] = g.metaPriority.splice(m.value, 1)
        g.metaPriority.unshift(node!)
        break
      }
      case 7: {
        // Switch spatial doctrine — mazing enters and leaves the gene pool here.
        const p = pickOne(r, PLACEMENT_STRATEGIES)
        r = p.rng
        g.placement = p.value
        break
      }
      case 8: {
        // Flip one type's tier-3 path (materializing the map from the
        // global bit for pre-axis genomes).
        const t = pickOne(r, TOWER_TYPES)
        r = t.rng
        g.specByType ??= Object.fromEntries(TOWER_TYPES.map((k) => [k, g.specChoice])) as Record<TowerType, 0 | 1>
        g.specByType[t.value] = (1 - g.specByType[t.value]) as 0 | 1
        break
      }
      case 9: {
        // Redraw one type's targeting doctrine (0 = back to engine default).
        const t = pickOne(r, TOWER_TYPES)
        r = t.rng
        const pick = draw(r, 0, TARGETINGS.length)
        r = pick.rng
        g.targetingByType ??= {}
        if (pick.value === 0) delete g.targetingByType[t.value]
        else g.targetingByType[t.value] = TARGETINGS[pick.value - 1]!
        break
      }
      case 10: {
        // Toggle between spreading enhancements and maxing one tower out.
        g.enhanceFocus = (g.enhanceFocus ?? 'spread') === 'spread' ? 'focus' : 'spread'
        break
      }
      case 11: {
        // Redraw the overcharge doctrine — perfect spam enters the pool here.
        const o = pickOne(r, OVERCHARGE_POLICIES)
        r = o.rng
        g.overchargePolicy = o.value
        break
      }
      case 12: {
        // Reshuffle the boon doctrine (or grant one to a boon-blind genome).
        const b = shuffled(r, BOON_IDS)
        r = b.rng
        g.boonPriority = b.value
        break
      }
    }
  }
  return { genome: g, rng: r }
}

function pickWeighted(state: RunState, genome: PolicyGenome): TowerType {
  if (state.wave < 3) {
    return state.availableTowers.includes(genome.earlyType) ? genome.earlyType : 'arrow'
  }
  const counts = {} as Record<TowerType, number>
  for (const t of TOWER_TYPES) counts[t] = 0
  for (const t of state.towers) counts[t.type] += 1
  let best: TowerType = 'arrow'
  let bestScore = -Infinity
  for (const type of state.availableTowers) {
    const w = genome.ratio[type]
    if (w <= 0) continue
    const score = w - counts[type] * (10 / w)
    if (score > bestScore) {
      best = type
      bestScore = score
    }
  }
  return best
}

export function makePolicyBot(genome: PolicyGenome): Bot {
  // Absent breadth axes default to the exact pre-axis semantics, so pinned
  // genome literals reproduce the behavior they were pinned with.
  const knobs: BuildKnobs = {
    upgradeAtTowers: genome.upgradeAtTowers,
    targetBase: genome.targetBase,
    targetPerWave: genome.targetPerWave,
    targetMax: genome.targetMax,
    repairDeficit: genome.repairDeficit,
    repairMinGold: genome.repairMinGold,
    enhanceStrategy: genome.enhanceStrategy,
    enhanceFocus: genome.enhanceFocus ?? 'spread',
    placement: genome.placement ?? 'pathAdjacent',
    targeting: genome.targetingByType ?? null,
    specChoice: genome.specByType ?? genome.specChoice ?? 0,
    relicPriority: genome.relicPriority,
  }
  return (state) => {
    if (state.phase === 'build') {
      const acts = buildActions(state, (s) => pickWeighted(s, genome), knobs)
      if (state.boonOffer !== null && genome.boonPriority) {
        const pick = [...state.boonOffer].sort(
          (a, b) => genome.boonPriority!.indexOf(a) - genome.boonPriority!.indexOf(b),
        )[0]!
        acts.unshift({ type: 'choose_boon', boon: pick })
      }
      return acts
    }
    if (state.phase === 'wave') {
      const acts = waveActions(state, genome.waveRepairPct)
      const oc = genome.overchargePolicy ?? 'never'
      if (oc === 'ready' || (oc === 'boss' && state.enemies.some((e) => e.type.startsWith('boss')))) {
        for (const t of state.towers) {
          if (TOWERS[t.type].support || t.overcharged || (t.overchargeCd ?? 0) > 0) continue
          acts.push({ type: 'overcharge_tower', id: t.id })
        }
      }
      return acts
    }
    return []
  }
}
