import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    // The engine must stay pure and deterministic: no ambient time, no ambient
    // randomness, no DOM, no scheduling, no I/O. See PLAN.md §3.2.
    files: ['src/engine/**/*.ts', 'src/data/**/*.ts', 'src/harness/**/*.ts'],
    ignores: ['src/engine/__tests__/**'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: 'Engine code must not read ambient time. Time is the tick counter.' },
        { name: 'performance', message: 'Engine code must not read ambient time.' },
        { name: 'setTimeout', message: 'Engine code must not schedule work.' },
        { name: 'setInterval', message: 'Engine code must not schedule work.' },
        { name: 'requestAnimationFrame', message: 'Engine code must not touch the render loop.' },
        { name: 'window', message: 'Engine code must not touch the DOM.' },
        { name: 'document', message: 'Engine code must not touch the DOM.' },
        { name: 'localStorage', message: 'Engine code must not do I/O.' },
        { name: 'fetch', message: 'Engine code must not do I/O.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded RNG in state (src/engine/rng.ts).' },
        { object: 'Math', property: 'sin', message: 'Not spec-pinned to exact results; use lookup tables.' },
        { object: 'Math', property: 'cos', message: 'Not spec-pinned to exact results; use lookup tables.' },
        { object: 'Math', property: 'tan', message: 'Not spec-pinned to exact results; use lookup tables.' },
        { object: 'Math', property: 'atan2', message: 'Not spec-pinned to exact results; use lookup tables.' },
        { object: 'Math', property: 'pow', message: 'Not spec-pinned to exact results; use integer math.' },
        { object: 'Math', property: 'exp', message: 'Not spec-pinned to exact results; use integer math.' },
        { object: 'Math', property: 'log', message: 'Not spec-pinned to exact results; use integer math.' },
      ],
    },
  },
)
