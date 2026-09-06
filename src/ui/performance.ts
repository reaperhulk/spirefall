// Bounded diagnostics: overwrite a ring slot instead of shifting 511 entries
// on every timing sample. Sorting only happens when a report is requested.
const CAPACITY = 512
const samples = new Map<string, {values:Float64Array; count:number; next:number}>()
export function measure(name: string, milliseconds: number): void {
  let series = samples.get(name)
  if (!series) { series = {values:new Float64Array(CAPACITY),count:0,next:0}; samples.set(name,series) }
  series.values[series.next] = milliseconds
  series.next = (series.next + 1) % CAPACITY
  series.count = Math.min(CAPACITY,series.count + 1)
}
export function performanceReport() {
  return Object.fromEntries([...samples].map(([name, series]) => {
    const sorted = Array.from(series.values.subarray(0,series.count)).sort((a,b) => a-b)
    const percentile = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0
    return [name, { samples: series.count, p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99) }]
  }))
}
export function resetPerformance(): void { samples.clear() }
