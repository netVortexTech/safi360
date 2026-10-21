import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  projects: [
    // PLAYWRIGHT_CHANNEL=chrome runs on the installed Chrome where the bundled
    // Chromium is unavailable (e.g. macOS versions Playwright no longer ships for).
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: process.env.PLAYWRIGHT_CHANNEL } },
    { name: 'mobile', use: { ...devices['Pixel 5'], channel: process.env.PLAYWRIGHT_CHANNEL } },
  ],
  webServer: {
    // --host 127.0.0.1: on Windows/Node ≥ 17 "localhost" binds IPv6 only (::1) and the
    // IPv4 readiness poll below never succeeds.
    command: 'pnpm build && pnpm preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
