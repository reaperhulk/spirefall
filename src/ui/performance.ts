// Bounded diagnostics, exposed through the existing development harness.
const samples = new Map<string, number[]>()
export function measure(name: string, milliseconds: number): void {
  let values = samples.get(name)
  if (!values) { values = []; samples.set(name, values) }
  if (values.length >= 512) values.shift()
  values.push(milliseconds)
}
export function performanceReport() {
  return Object.fromEntries([...samples].map(([name, values]) => {
    const sorted = values.slice().sort((a,b) => a-b)
    const percentile = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0
    return [name, { samples: values.length, p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99) }]
  }))
}
export function resetPerformance(): void { samples.clear() }
