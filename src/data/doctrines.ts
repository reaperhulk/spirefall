import type { TowerType } from '../engine/types'
export type DoctrineId = 'shatter' | 'siege' | 'storm' | 'war_economy'
export const DOCTRINES: Record<DoctrineId, { name: string; description: string; towers: TowerType[] }> = {
  shatter: { name: 'Shatter', description: 'All towers deal +20% to slowed enemies. Build overlapping Frost coverage.', towers: ['frost', 'cannon'] },
  siege: { name: 'Siege', description: 'Snipers and Lances deal +15% damage. Hold elites in long firing lanes; bring splash support against swarms.', towers: ['sniper', 'lance'] },
  storm: { name: 'Storm', description: 'Unlock Tesla for this run; Tesla deals +20% damage. Chain through dense packs.', towers: ['tesla', 'beacon'] },
  war_economy: { name: 'War economy', description: 'Unlock Mint; +15% bounty gold, but all towers deal 5% less damage. Invest early.', towers: ['mint', 'beacon'] },
}
export function doctrineDamage(id: DoctrineId | null | undefined, tower: TowerType): number {
  return id === 'siege' && (tower === 'sniper' || tower === 'lance') ? 15 : id === 'storm' && tower === 'tesla' ? 20 : 0
}
export const COMMAND_CHARGES = 3
export const COMMAND_RECHARGE_TICKS = 180
