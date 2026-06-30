import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.E2E_PORT || 5173;
const BASE = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: BASE,
    trace: 'on-first-retry',
    // La app guarda en localStorage por origen; cada test arranca con storage limpio (ver beforeEach).
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'node tests/e2e/server.mjs',
    url: BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
