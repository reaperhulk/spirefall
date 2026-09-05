import { expect, it } from 'vitest'
import { ACTION_KEYS, normalizeBindings, validBinding } from '../settings'
it('keeps remapped actions reachable and preserves spell and menu keys', () => {
  expect(validBinding('q')).toBe(false)
  expect(validBinding('c')).toBe(false)
  const bindings = normalizeBindings({ b:'v', v:'g', g:'b', o:'q', r:'j', u:'j' })
  const physical = ACTION_KEYS.map(k => bindings[k] ?? k)
  expect(new Set(physical).size).toBe(ACTION_KEYS.length)
  expect(bindings.o).toBeUndefined()
  expect(bindings.b).toBe('v')
  expect(bindings.g).toBe('b')
})
