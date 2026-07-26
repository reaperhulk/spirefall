// Browser-side preferences and seeds: the daily rotation, the remembered
// battlefield and trial picks, and fresh run seeds. Everything here touches
// localStorage or the wall clock, which is exactly why it is not in the
// engine — the sim only ever sees the seed string these produce.
import { BIOME_IDS } from '../data/biomes'
import { TRIALS } from '../data/content'

export function newSeed(runs: number): string {
  return `run-${runs + 1}-${Math.random().toString(36).slice(2, 8)}`
}


// The daily: one seed the whole world shares, rotating at UTC midnight.
// (Date lives strictly in the UI — the engine only ever sees the seed.)
export function dailySeed(): string {
  return `daily-${new Date().toISOString().slice(0, 10)}`
}


export interface DailyBest {
  date: string
  waves: number
  streak?: number // consecutive days with a finished daily
}


// The raw record survives across days — the streak chain needs yesterday.
export function loadDailyRaw(): DailyBest | null {
  try {
    const raw = localStorage.getItem('spirefall-daily')
    return raw ? (JSON.parse(raw) as DailyBest) : null
  } catch {
    return null
  }
}


export function loadDailyBest(): DailyBest | null {
  const parsed = loadDailyRaw()
  return parsed && parsed.date === new Date().toISOString().slice(0, 10) ? parsed : null
}


// Battlefield preference: 'random' keeps the seed's roll; an index pins the
// map. Daily runs ignore this — everyone shares the daily's rolled map.
export const MAP_PREF_KEY = 'spirefall-map'


// Trial preference: comma-joined TrialIds ('' = none). Daily runs ignore
// trials — the shared seed means a shared ruleset.
export const TRIAL_PREF_KEY = 'spirefall-trial'


// Stored as a comma-joined TrialId list ('' = none). The pre-stacking format
// ('none' or a single id) normalizes through the same filter.
export function loadTrialPref(): string {
  try {
    const raw = localStorage.getItem(TRIAL_PREF_KEY)
    if (raw !== null) {
      return raw
        .split(',')
        .filter((t) => Object.prototype.hasOwnProperty.call(TRIALS, t))
        .join(',')
    }
  } catch {
    // fall through
  }
  return ''
}


export function loadMapPref(): string {
  try {
    const raw = localStorage.getItem(MAP_PREF_KEY)
    if (raw !== null && (raw === 'random' || (BIOME_IDS as string[]).includes(raw))) return raw
  } catch {
    // fall through
  }
  return 'random'
}
