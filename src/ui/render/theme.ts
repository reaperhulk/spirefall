// Palette and per-biome theming: every colour the battlefield uses, plus the
// terrain look each biome paints with. Split out of render.ts — it was the
// only part of the renderer with no drawing in it at all.


import type { MapDef } from '../../data/maps'
import type { TowerType } from '../../engine/types'
import { settings } from '../settings'
export const CELL_PX = 34


export const ENEMY_COLORS: Record<string, string> = {
  runner: '#f7768e',
  swarmling: '#ff9e64',
  brute: '#db4b4b',
  shieldbearer: '#c0caf5',
  flier: '#7aa2f7',
  healer: '#9ece6a',
  splitter: '#d19a66',
  splitling: '#f0a45d',
  wraith: '#9aa5ce',
  carrier: '#d16d9e',
  boss: '#ff007c',
  boss2: '#c53b53',
  boss3: '#ffc777',
  boss4: '#b39dff',
  boss5: '#7fbf5f',
  boss6: '#8fd6e8',
  boss_final: '#ffe6ad',
}


// High-visibility alternates, derived from the Okabe–Ito colorblind-safe
// palette: hues separate under deuteranopia/protanopia and lightness steps
// disambiguate the rest. Body shapes already differ per type; color assist
// makes the palette pull in the same direction instead of against it.
export const ENEMY_COLORS_ASSIST: Record<string, string> = {
  runner: '#e69f00', // orange
  swarmling: '#f0e442', // yellow
  brute: '#d55e00', // vermillion
  shieldbearer: '#ffffff', // white
  flier: '#56b4e9', // sky blue
  healer: '#009e73', // bluish green
  splitter: '#cc79a7', // reddish purple
  splitling: '#e7b3d0', // lighter step of splitter
  wraith: '#999999', // grey
  carrier: '#aa4499', // deep purple
  boss: '#ee3377', // magenta
  boss2: '#0077bb', // strong blue
  boss3: '#eecc66', // pale gold
  boss4: '#ddccff', // pale violet
  boss5: '#117733', // deep green
  boss6: '#66ccee', // sky blue (Okabe–Ito adjacent)
}


// Live palette lookup: reads the settings singleton each call, so toggling
// color assist recolors the very next frame.
export function enemyColor(type: string): string {
  const table = settings.colorAssist ? ENEMY_COLORS_ASSIST : ENEMY_COLORS
  return table[type] ?? ENEMY_COLORS[type] ?? '#ffd76e'
}


export const COLORS = {
  bg: '#19232c',
  gridLine: '#151b28',
  rock: '#2c3448',
  rockEdge: '#3a445c',
  path: '#324349',
  spawn: '#8856ff',
  spire: '#e5c07b',
  towers: {
    arrow: '#9ece6a',
    cannon: '#e0af68',
    frost: '#7dcfff',
    tesla: '#bb9af7',
    sniper: '#73daca',
    mint: '#e5c07b',
    beacon: '#ff9e64',
    lance: '#f7768e',
  } as Record<TowerType, string>,
  hpBack: '#30354a',
  hpFill: '#9ece6a',
  ghostOk: 'rgba(158, 206, 106, 0.35)',
  ghostBad: 'rgba(219, 75, 75, 0.35)',
  range: 'rgba(255, 255, 255, 0.08)',
  rangeEdge: 'rgba(255, 255, 255, 0.25)',
}


// Per-map terrain palettes: each battlefield reads distinct at a glance.
// Presentation only — the sim never sees color. Keyed by map name so map
// reordering can't silently swap themes.
export type PropKind = 'tuft' | 'puddle' | 'crack' | 'pebbles' | 'bones' | 'ember'


export interface MapTheme {
  bg: string
  checker: string
  path: string
  gridLine: string
  rock: string
  rockEdge: string
  mote: string // ambient drifting particles: fireflies, spray, dust, embers
  props: PropKind // scattered ground detail baked into the terrain layer
  propColor: string
}


export const DEFAULT_THEME: MapTheme = {
  bg: COLORS.bg,
  checker: '#0d1119',
  path: COLORS.path,
  gridLine: COLORS.gridLine,
  rock: COLORS.rock,
  rockEdge: COLORS.rockEdge,
  mote: '#9aa5ce',
  props: 'pebbles',
  propColor: '#2a3248',
}


export const MAP_THEMES: Record<string, MapTheme> = {
  // Verdant lowlands: mossy greens, drifting fireflies.
  Greenfield: { bg: '#15261f', checker: '#192c24', path: '#344d3e', gridLine: '#14231c', rock: '#2b3d33', rockEdge: '#3c5245', mote: '#b8e08a', props: 'tuft', propColor: '#2e4a34' },
  // Flooded cuts: cold blue slate, hanging spray.
  'The Channels': { bg: '#172832', checker: '#1c2d38', path: '#354d60', gridLine: '#132133', rock: '#28374d', rockEdge: '#365071', mote: '#8fd0ff', props: 'puddle', propColor: '#1a2c44' },
  // Fortress stone: neutral grey masonry, settling dust.
  'The Bulwark': { bg: '#0f0f12', checker: '#131318', path: '#17171e', gridLine: '#1d1d26', rock: '#34343f', rockEdge: '#4a4a59', mote: '#9a9aa8', props: 'crack', propColor: '#232329' },
  // Sun-scoured desert: warm sand on the wind.
  'The Serpent': { bg: '#14100a', checker: '#1a150d', path: '#504736', gridLine: '#2a2115', rock: '#453824', rockEdge: '#5e4d31', mote: '#e0c080', props: 'pebbles', propColor: '#3a2e1c' },
  // Ashen wastes: scorched violet dusk, rising embers.
  Crossroads: { bg: '#100b14', checker: '#150e1b', path: '#1b1223', gridLine: '#23172e', rock: '#3a2c4a', rockEdge: '#503e66', mote: '#c586e0', props: 'bones', propColor: '#4a3c5c' },
  // Forge iron: rust and heat, sparks off the anvil.
  'The Gauntlet': { bg: '#140c08', checker: '#1a100b', path: '#594133', gridLine: '#2b1a12', rock: '#4a2f22', rockEdge: '#6b4230', mote: '#ff9d5c', props: 'ember', propColor: '#5c2f16' },
}


// Generated battlefields carry their biome's display name; each aliases a
// fitting palette (Frostfen borrows the cold Channels slate, Ember Waste the
// forge heat, the Highlands the desert mesa tones).
const BIOME_THEME_ALIAS: Record<string, string> = {
  'Verdant Reach': 'Greenfield',
  Frostfen: 'The Channels',
  'Ember Waste': 'The Gauntlet',
  'The Highlands': 'The Serpent',
}


export function mapTheme(map: MapDef): MapTheme {
  return MAP_THEMES[map.name] ?? MAP_THEMES[BIOME_THEME_ALIAS[map.name] ?? ''] ?? DEFAULT_THEME
}
