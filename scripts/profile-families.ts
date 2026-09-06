import { writeFileSync } from 'node:fs'
import { BIOME_IDS } from '../src/data/biomes'
import { DOCTRINES, type DoctrineId } from '../src/data/doctrines'
import { createRun } from '../src/engine/meta'
import { autoplay } from '../src/harness/autoplay'
import { makeFamilyBot } from '../src/harness/families'
import { richMeta } from '../src/harness/scenarios'
import { RULES_VERSION } from '../src/ui/validation'

// Freeze the policies before this held-out sweep. None of these seeds is in
// goldens, evolutionary tuning, or the earlier six-seed release probe.
const seeds = ['audit-copper', 'audit-heron', 'audit-thistle', 'audit-tide', 'audit-quartz', 'audit-lantern']
const runs = []
for (const budget of [10000, 20000]) for (const family of Object.keys(DOCTRINES) as DoctrineId[]) {
  for (const biome of BIOME_IDS) for (const seed of seeds) {
    const meta = richMeta(budget)
    Object.assign(meta.upgrades, {unlock_tesla:1, unlock_mint:1, unlock_beacon:1, unlock_lance:1})
    const milestones: Record<string, number> = {}
    const result = autoplay(createRun(meta, seed, biome), makeFamilyBot(family), 120000, {onEvents: (events, s) => {
      for (const e of events) {
        if (e.type === 'tower_upgraded') milestones.upgrade ??= s.tick / 30
        if (e.type === 'tower_specialized') milestones.specialization ??= s.tick / 30
        if (e.type === 'enemy_spawned' && e.enemy.startsWith('boss')) milestones.boss ??= s.tick / 30
        if (e.type === 'victory_achieved') milestones.victory ??= s.tick / 30
      }
    }})
    const s = result.state
    runs.push({budget, family, biome, seed, waves:s.wavesCleared, victory:s.victoryClaimed, seconds:s.tick / 30, commands:result.commandLog.length, milestones, towers:s.towers.length, specialized:s.towers.filter(t => t.spec).length})
  }
  console.log(JSON.stringify({budget, family, runs:runs.filter(r => r.budget === budget && r.family === family).length}))
}
writeFileSync(process.env.PROFILE_OUTPUT ?? 'docs/family-profile.json', JSON.stringify({rules:RULES_VERSION, notes:'192 runs: two reference progression budgets plus all tower unlocks, four families, four biomes, six held-out seeds. At most one command every 400ms, including planning, collection and abilities. Policies are documented in src/harness/families.ts. Simulated time includes automated planning; these are policy measurements, not human win rates.', runs}, null, 2) + '\n')
