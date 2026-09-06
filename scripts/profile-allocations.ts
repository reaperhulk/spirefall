import { writeFileSync } from 'node:fs'
import { measure, performanceReport, resetPerformance } from '../src/ui/performance'

// Isolate the two bounded histories on the hot path. Medians of nine
// alternating-order samples avoid claiming one noisy timing as a speedup.
let sink=0
const leaks=Array.from({length:512},(_,i)=>({tick:i,wave:1,enemy:'runner',damage:1}))
const oldSamples=new Map<string,number[]>()
function oldMeasure(name:string,value:number) {
  let values=oldSamples.get(name)
  if(!values) {values=[];oldSamples.set(name,values)}
  if(values.length>=512) values.shift()
  values.push(value)
}
const cases=[
  {name:'immutable leak history copy',iterations:100000,before:()=>{const a=leaks.map(l=>({...l}));sink+=a[0]!.damage},after:()=>{const a=leaks.slice();sink+=a[0]!.damage}},
  {name:'diagnostic sample append',iterations:1000000,before:()=>oldMeasure('render',1),after:()=>measure('render',1)},
]
const results=[]
for(const c of cases) {
  for(let i=0;i<10000;i++) {c.before();c.after()}
  const times={before:[] as number[],after:[] as number[]}
  for(let sample=0;sample<9;sample++) for(const kind of sample%2 ? ['after','before'] as const : ['before','after'] as const) {
    const start=performance.now();for(let i=0;i<c.iterations;i++) c[kind]()
    times[kind].push(performance.now()-start)
  }
  const median=(a:number[])=>a.toSorted((x,y)=>x-y)[4]!
  results.push({name:c.name,iterations:c.iterations,beforeMs:median(times.before),afterMs:median(times.after),samples:times})
}
sink+=performanceReport().render!.samples;resetPerformance()
const report={runtime:process.version,note:'Isolated allocation microbenchmarks, not end-to-end frame speedups. Nine alternating-order samples after warmup; 512-entry histories.',sink,results}
writeFileSync('docs/second-review-allocations.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report))
