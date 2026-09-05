import type { DoctrineId } from './doctrines'
import type { RelicId, TowerType } from '../engine/types'

export const RELIC_TOWERS: Partial<Record<RelicId, TowerType[]>> = {
  piercing_arrows:['arrow'], ricochet_strings:['arrow'], heavy_powder:['cannon'], cinder_shells:['cannon'],
  winters_grip:['frost'], shatter:['frost'], shatterheart:['frost','cannon'], overcharge:['tesla'],
  echo_chamber:['tesla'], storm_coils:['tesla'], deadeye_sigil:['sniper'], mint_condition:['mint'],
  golden_ledger:['mint'], prism_lens:['beacon'], duelists_oath:['lance'],
}
export const BUILD_FAMILIES: Record<DoctrineId, { opening: string; tactic: string; weakness: string; relics: RelicId[] }> = {
  shatter: {
    opening:'Establish Cannon, Arrow and Frost coverage before adding more slow towers.',
    tactic:'Overlap Frost with splash; Permafrost makes each heavy hit matter. Shatterheart turns kills into chain explosions.',
    weakness:'Keep Arrow or Sniper coverage on the direct air route. More Frost without damage will not finish enemies.',
    relics:['shatterheart','shatter','winters_grip','cinder_shells','heavy_powder'],
  },
  siege: {
    opening:'Start with Cannon and Arrow for crowds. Add Frost, then a Sniper or Lance in a long lane.',
    tactic:'Set Snipers to Elite Hunter; hold a Lance on a durable target and spend charges when the guardian is exposed.',
    weakness:'Heavy single-target towers need splash support. Do not spend the whole opening on Lances.',
    relics:['duelists_oath','deadeye_sigil','longsight','last_stand'],
  },
  storm: {
    opening:'Place Tesla beside a busy turn, with Frost to bunch enemies and Arrow for cheap coverage.',
    tactic:'Group chains around a Beacon. Arc Lattice covers crowds; Capacitor rewards a compact firing lane.',
    weakness:'Shields reject light hits. Keep a Cannon, Sniper or shield-piercing specialist for armored waves.',
    relics:['storm_coils','echo_chamber','overcharge','prism_lens'],
  },
  war_economy: {
    opening:'Secure at least four combat towers, then buy a Mint while the Spire is healthy.',
    tactic:'Invest during safe waves, collect payouts, and turn the profit into upgrades before the next guardian.',
    weakness:'Mints do not defend and the doctrine reduces damage. Stop investing after leaks; repair and upgrade first.',
    relics:['mint_condition','golden_ledger','deep_pockets','golden_touch'],
  },
}
