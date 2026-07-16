import { defineConfig } from '@playwright/test'
import { existsSync } from 'node:fs'

// The remote dev container pre-installs a Chromium at /opt/pw-browsers/chromium
// (with PLAYWRIGHT_BROWSERS_PATH set); CI installs browsers via
// `npx playwright install chromium`. Use the direct binary when present so the
// suite runs in both without downloads.
const localChromium = '/opt/pw-browsers/chromium'

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:4173',
    screenshot: 'only-on-failure',
    launchOptions: existsSync(localChromium) ? { executablePath: localChromium } : {},
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
