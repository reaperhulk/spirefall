import { defineConfig } from '@playwright/test'
import { existsSync } from 'node:fs'

// The remote dev container pre-installs a Chromium at /opt/pw-browsers/chromium
// (with PLAYWRIGHT_BROWSERS_PATH set); CI installs browsers via
// `npx playwright install chromium`. Use the direct binary when present so the
// suite runs in both without downloads.
const localChromium = '/opt/pw-browsers/chromium'

// Wall-clock budgets (frame time, input latency, heap growth) measure the
// machine as much as the code, so they run as their own project: CI gives
// them a separate, non-blocking job instead of letting a noisy shared runner
// fail the functional gate.
const PERFORMANCE = ['performance.spec.ts', 'sustained-performance.spec.ts']

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  // No retries: a failing test is a bug to root-cause, never a flake to mask.
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: existsSync(localChromium) ? { executablePath: localChromium } : {},
  },
  projects: [
    { name: 'functional', testIgnore: PERFORMANCE },
    { name: 'performance', testMatch: PERFORMANCE },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
