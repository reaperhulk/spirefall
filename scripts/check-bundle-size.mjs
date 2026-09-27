// Bundle budget: fails `npm run check` when the gzipped JavaScript the page
// loads grows past the budget. Raise the budget deliberately, in the same
// commit as the growth, and say why.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const BUDGET_GZIP_KB = 185
const dir = join(import.meta.dirname, '..', 'dist', 'assets')
let total = 0
for (const file of readdirSync(dir).filter((f) => f.endsWith('.js')).sort()) {
  const gz = gzipSync(readFileSync(join(dir, file))).length
  total += gz
  console.log(`${file.padEnd(32)} ${(gz / 1024).toFixed(1)} kB gzip`)
}
console.log(`total${' '.repeat(27)} ${(total / 1024).toFixed(1)} kB gzip (budget ${BUDGET_GZIP_KB} kB)`)
if (total > BUDGET_GZIP_KB * 1024) {
  console.error(`Bundle over budget by ${((total - BUDGET_GZIP_KB * 1024) / 1024).toFixed(1)} kB gzip.`)
  process.exit(1)
}
