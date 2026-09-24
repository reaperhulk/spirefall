import { RELIC_IDS, RELIC_SEALS, specForTower, TOWERS, type RelicSealId } from '../data/content'
import { BUILD_FAMILIES } from '../data/buildFamilies'
import type { DoctrineId } from '../data/doctrines'
import type { Enemy, MetaState, RelicId, RunState, Tower, TowerType } from './types'
import type { TowerSpecId } from '../data/content'
import { cellCenter, distSq } from './grid'

// Absence is deliberate: saved rules-3/4 runs retain their original semantics.
export const modernRules = (s: RunState): boolean => (s.rulesVersion ?? 4) >= 5
// Rules 6: the incremental layer — depth-scaled spark pay, guardian spoils,
// the sealed relic pool. Rules-5 runs and replays keep their exact outcomes.
export const RULES_VERSION: number = 6
export const rules6 = (s: RunState): boolean => (s.rulesVersion ?? 4) >= 6
export const GUARDIAN_MILESTONES = [
  { enemy: 'boss', name: 'Gatebreaker', unlock: 'Frostfen', wave: 6 },
  { enemy: 'boss2', name: 'Broodbreaker', unlock: 'Ember Waste', wave: 12 },
  { enemy: 'boss3', name: 'Stormwalker', unlock: 'The Highlands', wave: 18 },
] as const
export type AssaultId = 'iron_column' | 'swift_swarm'
export const ASSAULTS: Record<AssaultId, { name: string; danger: string; reward: string }> = {
  iron_column: { name: 'Iron Column', danger: 'Next three waves: +20% enemy HP and +2 armor.', reward: 'Stoneskin relic (heavy enemies deal 1 less Spire damage); if owned, repair 5 HP.' },
  swift_swarm: { name: 'Swift Swarm', danger: 'Next three waves: +20% wave budget and +15% enemy speed.', reward: 'A supply cache worth 180 + 12 × the final wave in gold.' },
}
export function assaultActive(s: RunState, wave = s.wave): boolean {
  return !!s.assault && wave > s.assault.fromWave && wave <= s.assault.untilWave
}
export function bankGuardianMilestones(meta: MetaState, run: RunState): MetaState {
  if (run.seed.startsWith('daily-')) return meta
  const earned = GUARDIAN_MILESTONES.filter(m => (run.killsByEnemy[m.enemy] ?? 0) > 0).map(m => m.enemy)
  const previous = meta.guardianMilestones ?? []
  if (earned.every(id => previous.includes(id))) return meta
  return { ...meta, guardianMilestones: [...new Set([...previous, ...earned])] }
}
// Which relic seals the account's record has earned. The ladder check
// mirrors crucibleUnlocked (meta.ts) without importing it, to keep this
// module a leaf.
function earnedSeals(meta: MetaState): RelicSealId[] {
  return RELIC_SEALS.map((seal) => seal.id).filter((id) => {
    if (id === 'victory') return meta.victories > 0
    if (id === 'crucible') return (meta.crucibleUnlocked ?? (meta.victories > 0 ? Math.max(1, meta.cycleVictories) : 0)) >= 2
    return (meta.guardianMilestones ?? []).includes(id)
  })
}
// Broken seals are banked in meta.relicSeals at settle; saves from before
// the field derive them from the record they already carry.
export function brokenSeals(meta: MetaState): RelicSealId[] {
  return meta.relicSeals ?? earnedSeals(meta)
}
export function bankRelicSeals(meta: MetaState): MetaState {
  const banked = brokenSeals(meta)
  const next = [...new Set([...banked, ...earnedSeals(meta)])]
  return next.length === banked.length && meta.relicSeals !== undefined ? meta : { ...meta, relicSeals: next }
}
export function sealedRelics(meta: MetaState): RelicId[] {
  const broken = brokenSeals(meta)
  return RELIC_SEALS.filter((seal) => !broken.includes(seal.id)).flatMap((seal) => seal.relics)
}
// The relics a run can still be offered: unowned and unsealed.
export function relicPool(s: RunState): RelicId[] {
  const sealed = s.sealedRelics ?? []
  return RELIC_IDS.filter((r) => !s.relics.includes(r) && !sealed.includes(r))
}
// Relics whose effect was paid once at pick time (a max-HP cut) can never
// be exchanged away: shedding the relic would keep the price paid or need
// a refund nothing else in the game makes.
export const SWAP_LOCKED_RELICS: RelicId[] = ['glass_cannon', 'golden_touch']
export function swappableRelics(s: RunState): RelicId[] {
  return s.relics.filter((r) => !SWAP_LOCKED_RELICS.includes(r))
}
// A focused reroll needs a family relic that is still on the table.
export function familyRelicsAvailable(s: RunState, doctrine: DoctrineId): RelicId[] {
  const pool = relicPool(s)
  return BUILD_FAMILIES[doctrine].relics.filter((r) => pool.includes(r))
}
export function canSpecialize(s: RunState, t: Tower): boolean {
  return t.spec === null && t.tier >= (modernRules(s) ? 2 : 3)
}
export function specializationCost(s: RunState, t: Tower, id: TowerSpecId): number {
  const base = specForTower(t.type, id)?.cost ?? 0
  // One opening commission per run. Selling the tower cannot restore it.
  return modernRules(s) && s.wave >= 2 && !s.commissionUsed ? Math.min(base, 20) : base
}
export function stormNetwork(s: RunState, tower: Tower): Tower[] {
  const network = [tower]
  for (let i = 0; i < network.length; i++) {
    const source = network[i]!
    for (const other of s.towers) {
      if (other.type !== 'tesla' || network.includes(other)) continue
      if (distSq(cellCenter(source.cell), cellCenter(other.cell)) <= 3500 * 3500) network.push(other)
    }
  }
  return network.sort((a, b) => a.id - b.id)
}
export function isHeavy(type: TowerType): boolean {
  return type === 'cannon' || type === 'sniper' || type === 'lance'
}
export function addFrostBrittleness(s: RunState, enemy: Enemy): void {
  if (modernRules(s) && s.doctrine === 'shatter' && enemy.hp > 0) enemy.frostStacks = Math.min(3, (enemy.frostStacks ?? 0) + 1)
}
export function warSupply(s: RunState): number {
  return modernRules(s) && s.doctrine === 'war_economy' ? s.supply ?? 0 : 0
}
export const TOWER_ROLES: Record<TowerType, string> = {
  arrow: 'Air defense', cannon: 'Crowd breaker', frost: 'Control', tesla: 'Chain damage',
  sniper: 'Elite hunter', mint: 'Income', beacon: 'Support aura', lance: 'Boss damage',
}
export function combatTowers(s: RunState): Tower[] { return s.towers.filter(t => !TOWERS[t.type].support) }
