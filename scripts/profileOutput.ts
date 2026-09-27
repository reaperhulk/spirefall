import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

// Where a profile script writes its report: PROFILE_OUTPUT if set, else the
// gitignored profiles/ directory. Committed snapshots in docs/ are
// historical records — copy a fresh report there only on purpose, with a
// note of the rules version and commit it measured.
export function profileOutput(name: string): string {
  const path = process.env['PROFILE_OUTPUT'] ?? join('profiles', name)
  mkdirSync(dirname(path), { recursive: true })
  return path
}
