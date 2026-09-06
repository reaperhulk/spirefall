import { useEffect, useRef } from 'react'
import type { TowerType } from '../engine/types'
import { drawTowerBody } from './render/towers'
export function TowerPortrait({ type }: { type: TowerType }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, 64, 64)
    const scale = type === 'lance' ? 1.55 : type === 'tesla' ? 2 : 2.3
    ctx.save(); ctx.translate(32, 34); ctx.scale(scale, scale)
    drawTowerBody(ctx, { type, tier: 1, id: 0, spec: null }, -Math.PI / 2, 0)
    ctx.restore()
  }, [type])
  return <canvas ref={ref} width={64} height={64} className="tower-portrait" aria-hidden="true" />
}
