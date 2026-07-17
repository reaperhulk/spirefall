import type { CellPos } from '../engine/types'

// Map layouts as string art: '.' open ground, '#' rock, 'S' spawn gate,
// 'T' the Spire. Every row must be exactly WIDTH chars; parse() validates.
export const MAP_WIDTH = 24
export const MAP_HEIGHT = 14

export interface MapDef {
  id: number
  name: string
  width: number
  height: number
  rocks: boolean[] // index = cy * width + cx
  spawn: CellPos
  spire: CellPos
}

const ART: { name: string; rows: string[] }[] = [
  {
    name: 'Greenfield',
    rows: [
      '........................',
      '........................',
      '......#........#........',
      '........................',
      '...#................#...',
      '........................',
      'S......................T',
      '........................',
      '...#................#...',
      '........................',
      '......#........#........',
      '........................',
      '........................',
      '........................',
    ],
  },
  {
    name: 'The Channels',
    rows: [
      '........................',
      '..######......######....',
      '........................',
      '........................',
      '..####....####....####..',
      '........................',
      'S......................T',
      '........................',
      '..####....####....####..',
      '........................',
      '........................',
      '..######......######....',
      '........................',
      '........................',
    ],
  },
  {
    name: 'The Bulwark',
    rows: [
      '........................',
      '........................',
      '........##....##........',
      '........#......#........',
      '........................',
      '...........##...........',
      'S.........#..#.........T',
      '...........##...........',
      '........................',
      '........#......#........',
      '........##....##........',
      '........................',
      '........................',
      '........................',
    ],
  },
  {
    name: 'The Serpent',
    rows: [
      '....#.........#.........',
      '....#.........#.........',
      '....#.........#.........',
      '....#.........#.........',
      '....#....#....#....#....',
      '....#....#....#....#....',
      'S...#....#....#....#...T',
      '....#....#....#....#....',
      '....#....#....#....#....',
      '....#....#....#....#....',
      '.........#.........#....',
      '.........#.........#....',
      '.........#.........#....',
      '.........#.........#....',
    ],
  },
  {
    name: 'Crossroads',
    rows: [
      '........................',
      '........................',
      '.....#............#.....',
      '.....#............#.....',
      '.....#............#.....',
      '..........####..........',
      'S.........####.........T',
      '..........####..........',
      '..........####..........',
      '.....#............#.....',
      '.....#............#.....',
      '.....#............#.....',
      '........................',
      '........................',
    ],
  },
  {
    // Picker-only (see RANDOM_MAP_POOL): a forced serpentine — the horde
    // marches the full switchback and every corridor is a kill box, but the
    // gaps are wide enough that mazing them still matters.
    name: 'The Gauntlet',
    rows: [
      'S.......................',
      '........................',
      '....####################',
      '........................',
      '........................',
      '........................',
      '####################....',
      '........................',
      '........................',
      '........................',
      '....####################',
      '........................',
      '........................',
      '.......................T',
    ],
  },
]

function parse(id: number, name: string, rows: string[]): MapDef {
  if (rows.length !== MAP_HEIGHT) throw new Error(`map ${name}: expected ${MAP_HEIGHT} rows, got ${rows.length}`)
  const rocks: boolean[] = new Array<boolean>(MAP_WIDTH * MAP_HEIGHT).fill(false)
  let spawn: CellPos | null = null
  let spire: CellPos | null = null
  rows.forEach((row, cy) => {
    if (row.length !== MAP_WIDTH) throw new Error(`map ${name} row ${cy}: expected ${MAP_WIDTH} chars, got ${row.length}`)
    for (let cx = 0; cx < MAP_WIDTH; cx++) {
      const ch = row[cx]
      if (ch === '#') rocks[cy * MAP_WIDTH + cx] = true
      else if (ch === 'S') spawn = { cx, cy }
      else if (ch === 'T') spire = { cx, cy }
      else if (ch !== '.') throw new Error(`map ${name}: unknown char '${ch}'`)
    }
  })
  if (!spawn || !spire) throw new Error(`map ${name}: missing spawn or spire`)
  return { id, name, width: MAP_WIDTH, height: MAP_HEIGHT, rocks, spawn, spire }
}

export const MAPS: MapDef[] = ART.map((a, i) => parse(i, a.name, a.rows))

// The seed's map roll draws from the first N maps only. Maps past the pool
// are picker-only: adding one never shifts existing seed→map assignments,
// so goldens, the balance envelope, and shared daily seeds stay stable.
export const RANDOM_MAP_POOL = 5
