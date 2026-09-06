import type { TowerType } from '../engine/types'
export type DoctrineId = 'shatter' | 'siege' | 'storm' | 'war_economy'
export const DOCTRINES: Record<DoctrineId, { name: string; description: string; towers: TowerType[] }> = {
  shatter: { name: 'Shatter', description: 'Frost hits build up to 3 brittle crystals. Cannon, Sniper and Lance consume them for +20% damage each. Time heavy shots after the chill.', towers: ['frost', 'cannon'] },
  siege: { name: 'Siege', description: 'Snipers and Lances aim at a held target. After 1.5 seconds, their next hit deals +40% damage. Switching targets resets aim.', towers: ['sniper', 'lance'] },
  storm: { name: 'Storm', description: 'Unlock Tesla. Link two or more Teslas within 3.5 cells; every sixth network shot releases a +75% primary discharge.', towers: ['tesla', 'beacon'] },
  war_economy: { name: 'War economy', description: 'Unlock Mint; +15% income, −5% damage. Clear a wave with a Mint to bank a supply crate (max 3). Requisition a crate to instantly ready and overcharge a tower.', towers: ['mint', 'beacon'] },
}
export function doctrineDamage(id: DoctrineId | null | undefined, tower: TowerType, mechanical = false): number {
  if (mechanical) return 0
  return id === 'siege' && (tower === 'sniper' || tower === 'lance') ? 15 : id === 'storm' && tower === 'tesla' ? 20 : 0
}
export const COMMAND_CHARGES = 3
export const COMMAND_RECHARGE_TICKS = 180

export function doctrineDescription(id: DoctrineId, rules = 5): string {
  if (rules >= 5) return DOCTRINES[id].description
  return {
    shatter: 'All towers deal +20% damage to slowed enemies.',
    siege: 'Snipers and Lances deal +15% damage.',
    storm: 'Unlock Tesla for this run; Tesla deals +20% damage.',
    war_economy: 'Unlock Mint; +15% income, −5% tower damage.',
  }[id]
}
