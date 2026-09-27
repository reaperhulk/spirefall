/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const SLOW = [
  'src/harness/__tests__/balance*.test.ts',
  'src/harness/__tests__/glassforge-floor*.test.ts',
  'src/harness/__tests__/fuzz.test.ts',
]

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: {
      // React changes far less often than the game: its own fingerprinted
      // chunk stays cached across releases.
      output: { manualChunks: { react: ['react', 'react-dom', 'react-dom/client'] } },
    },
  },
  test: {
    // Two projects: `fast` is everything a save should re-run (watch mode,
    // `npm test`); `slow` is the CPU-heavy balance envelope, Glassforge floor
    // and build fuzzer. `npm run test:unit` and CI run both.
    projects: [
      { extends: true, test: { name: 'fast', include: ['src/**/__tests__/**/*.test.ts'], exclude: SLOW } },
      { extends: true, test: { name: 'slow', include: SLOW } },
    ],
  },
})
