import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// Ambient state no simulation or headless tool may touch.
const AMBIENT = [
  { name: 'Date', message: 'Engine code must not read ambient time. Time is the tick counter.' },
  { name: 'performance', message: 'Engine code must not read ambient time.' },
  { name: 'setTimeout', message: 'Engine code must not schedule work.' },
  { name: 'setInterval', message: 'Engine code must not schedule work.' },
  { name: 'setImmediate', message: 'Engine code must not schedule work.' },
  { name: 'queueMicrotask', message: 'Engine code must not schedule work.' },
  { name: 'requestAnimationFrame', message: 'Engine code must not touch the render loop.' },
  { name: 'window', message: 'Engine code must not touch the DOM.' },
  { name: 'document', message: 'Engine code must not touch the DOM.' },
  { name: 'navigator', message: 'Engine code must not touch the DOM.' },
  { name: 'globalThis', message: 'Engine code must not reach ambient globals (globalThis.Math.random, ...).' },
  { name: 'localStorage', message: 'Engine code must not do I/O.' },
  { name: 'fetch', message: 'Engine code must not do I/O.' },
  { name: 'crypto', message: 'Engine code must not use ambient randomness. Use the seeded RNG.' },
  { name: 'Intl', message: 'Locale-dependent: results vary by platform.' },
]
// Math functions the spec only "approximates": results may differ across
// engines. (abs, floor, ceil, round, trunc, sign, min, max, imul, clz32 and
// fround are exact.)
const INEXACT_MATH = ['sqrt', 'cbrt', 'hypot', 'pow', 'exp', 'expm1', 'log', 'log1p', 'log2', 'log10',
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh']

export default tseslint.config(
  // public/sw.js runs in a ServiceWorker global scope, not the app bundle.
  { ignores: ['dist', 'coverage', 'node_modules', 'playwright-report', 'test-results', 'public/sw.js'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}', 'scripts/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    files: ['src/ui/**/*.{ts,tsx}', 'src/main.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // The engine must stay pure and deterministic: no ambient time, no ambient
    // randomness, no DOM, no scheduling, no I/O. See PLAN.md §3.2.
    files: ['src/engine/**/*.ts', 'src/data/**/*.ts', 'src/harness/**/*.ts'],
    ignores: ['src/**/__tests__/**'],
    rules: {
      'no-restricted-globals': ['error', ...AMBIENT],
      'no-restricted-properties': ['error', { object: 'Math', property: 'random', message: 'Use the seeded RNG in state (src/engine/rng.ts).' }],
      'no-restricted-imports': ['error', { patterns: [
        { group: ['react', 'react-dom', 'react/*', 'react-dom/*'], message: 'Headless code must not depend on the UI.' },
        { group: ['**/ui/**', '../ui', './ui'], message: 'Headless code must not depend on the UI.' },
      ] }],
    },
  },
  {
    // The simulation itself: gameplay math is integer/fixed-point (rule 5),
    // and it reads nothing from the process. Harness tooling may read
    // process.env for its knobs, so it only gets the block above.
    files: ['src/engine/**/*.ts', 'src/data/**/*.ts'],
    ignores: ['src/**/__tests__/**'],
    rules: {
      'no-restricted-globals': ['error', ...AMBIENT,
        { name: 'process', message: 'Engine code must not read the process environment.' },
      ],
      'no-restricted-properties': ['error',
        { object: 'Math', property: 'random', message: 'Use the seeded RNG in state (src/engine/rng.ts).' },
        ...INEXACT_MATH.map((property) => ({ object: 'Math', property, message: 'Not spec-pinned to exact results; use integer math or lookup tables.' })),
      ],
      'no-restricted-syntax': ['error',
        { selector: "BinaryExpression[operator='**']", message: '`**` is Math.pow: not spec-pinned. Multiply integers instead.' },
        { selector: "AssignmentExpression[operator='**=']", message: '`**=` is Math.pow: not spec-pinned. Multiply integers instead.' },
      ],
      'no-restricted-imports': ['error', { patterns: [
        { group: ['node:*', 'fs', 'path', 'os', 'crypto'], message: 'Engine code must not do I/O.' },
        { group: ['react', 'react-dom', 'react/*', 'react-dom/*'], message: 'Headless code must not depend on the UI.' },
        { group: ['**/ui/**', '../ui', './ui'], message: 'Headless code must not depend on the UI.' },
        { group: ['**/harness/**', '../harness'], message: 'The engine must not depend on test tooling.' },
      ] }],
    },
  },
  {
    // Promise safety where async code lives: a missing await is the classic
    // Playwright flake, and a dropped promise in the UI swallows errors.
    files: ['e2e/**/*.ts', 'src/ui/**/*.{ts,tsx}'],
    ignores: ['src/**/__tests__/**'],
    languageOptions: { parserOptions: { project: ['./tsconfig.json', './tsconfig.node.json'], tsconfigRootDir: import.meta.dirname } },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
      '@typescript-eslint/await-thenable': 'error',
    },
  },
)
