export type GraphicsQuality = 'auto' | 'high' | 'low'
export const graphicsState = { reduced:false }
// Auto evaluates two-second windows. Sustained costly frames reduce pixel
// work; three healthy windows are required to restore a resolution rung.
export class AdaptiveResolution {
  private rung = 0
  private frames = 0
  private costly = 0
  private healthy = 0
  private recovery = 0
  get scale(): number { return [1, 0.75, 0.5][this.rung]! }
  sample(workMs:number): void {
    this.frames++
    if (workMs > 14) this.costly++
    if (workMs < 7) this.healthy++
    if (this.frames < 120) return
    if (this.costly > 24) { this.rung = Math.min(2,this.rung+1); this.recovery = 0 }
    else if (this.healthy > 110) {
      if (++this.recovery >= 3) { this.rung = Math.max(0,this.rung-1); this.recovery = 0 }
    } else this.recovery = 0
    this.frames = this.costly = this.healthy = 0
  }
}
export function backingScale(displayWidth:number, logicalWidth:number, deviceDpr:number, quality:GraphicsQuality, adaptiveScale=1): number {
  const dpr = Math.max(1,Math.min(quality === 'low' ? 1 : 2, deviceDpr || 1))
  return Math.max(1 / logicalWidth, displayWidth / logicalWidth * dpr * (quality === 'auto' ? adaptiveScale : 1))
}
