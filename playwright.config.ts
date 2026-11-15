import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const TEST_DATABASE = 'data/pglite-e2e';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 60_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    viewport: { width: 1440, height: 1000 },
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'light', use: { colorScheme: 'light' } },
    { name: 'dark', use: { colorScheme: 'dark' } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        // The database folder is cleared as the server starts.
        command: `rm -rf ${TEST_DATABASE} && pnpm dev`,
        env: {
          // Model requests are intercepted by browser tests; the placeholder
          // enables their controls without a provider credential.
          GOOGLE_GENERATIVE_AI_API_KEY: 'playwright-synthetic-key',
          // Empty, not absent: a variable already set is not overridden by
          // .env.local, so tests never write to the database it names, and
          // the server falls back to PGlite in a folder of its own.
          DATABASE_URL: '',
          DATABASE_URL_UNPOOLED: '',
          SAFEPOINT_PGLITE_DIR: TEST_DATABASE,
        },
        // With reuseExistingServer, a server already on the port is used as
        // it is, whatever database it has: only the one started here is safe.
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
