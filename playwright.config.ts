import { defineConfig, devices } from '@playwright/test';

/**
 * Runs UI flows in **Google Chrome** (installed channel). Start the dev server first, or rely on webServer.
 * @see e2e/prism-walkthrough.spec.ts for step-by-step instructions.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    /** When 5173 is already taken, stop the other dev server or set `CI=true` for a fresh process. */
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      // Sovereign e2e (`e2e/sovereign-command-motions.spec.ts`) + `src/prismSovereignIx.ts` E2E path
      VITE_E2E: '1',
      VITE_PRISM_PROGRAM_ID: 'GmaDrppBC7P5ARKV8g3djiwP89vz1jLK23V2GBjuAEGB',
    },
  },
  projects: [
    {
      name: 'Google Chrome',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
      },
    },
  ],
});
