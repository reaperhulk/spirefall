import { afterEach, expect, it, vi } from 'vitest'
import { generateMap } from '../../engine/mapgen'
import { createMeta, createRun } from '../../engine/meta'
import { GameSession } from '../session'
import { drawDecals, stampDecal, terrainLayer } from '../render/terrain'
import { mapTheme } from '../render/theme'

afterEach(() => vi.unstubAllGlobals())

function canvasStub() {
  const drawImage = vi.fn()
  const context = new Proxy({ drawImage }, {
    get(target, key) {
      if (key === 'drawImage') return target.drawImage
      if (key === 'createRadialGradient' || key === 'createLinearGradient') return () => ({ addColorStop() {} })
      return () => {}
    },
    set() { return true },
  }) as unknown as CanvasRenderingContext2D
  vi.stubGlobal('window', { devicePixelRatio: 1 })
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => context }) })
  return { context, drawImage }
}

it('equal rock counts and gate rows do not reuse different terrain', () => {
  canvasStub()
  const a = generateMap('verdant', 'review-0')
  const b = generateMap('verdant', 'review-4')
  expect(a.spawn.cy).toBe(b.spawn.cy)
  expect(a.rocks.filter(Boolean).length).toBe(b.rocks.filter(Boolean).length)
  expect(a.rocks).not.toEqual(b.rocks)
  const first = terrainLayer(a, mapTheme(a))
  expect(terrainLayer(a, mapTheme(a))).toBe(first)
  expect(terrainLayer(b, mapTheme(b))).not.toBe(first)
})

it('scars render for their session and never leak into a rematch', () => {
  const { context, drawImage } = canvasStub()
  const run = createRun(createMeta(), 'scar-repro')
  const first = new GameSession(run)
  stampDecal(first.renderId, { x: 500, y: 500 }, '#ffffff')
  drawDecals(context, first.renderId)
  expect(drawImage).toHaveBeenCalledTimes(1)
  const rematch = new GameSession(run)
  drawDecals(context, rematch.renderId)
  expect(drawImage).toHaveBeenCalledTimes(1)
})
