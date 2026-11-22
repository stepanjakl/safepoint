import { defineConfig, devices } from '@playwright/test';

const E2E_PORT = 3001;
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${E2E_PORT}`;
const TEST_DATABASE = 'data/pglite-e2e';
// The Local World's runs (server/workflows/), apart from the developer's.
const TEST_WORKFLOWS = 'data/workflow-e2e';

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
        // The database and workflow folders are cleared as the server starts.
        command: `rm -rf ${TEST_DATABASE} ${TEST_WORKFLOWS} && pnpm dev -p ${E2E_PORT}`,
        env: {
          // Separate Next output directory so Playwright can run beside an
          // already-running `pnpm dev` without contending on `.next/dev/lock`.
          NEXT_DIST_DIR: '.next-e2e',
          SAFEPOINT_DEV_PAUSE: '0',
          // Model requests are intercepted by browser tests; the placeholder
          // enables their controls without a provider credential.
          GOOGLE_GENERATIVE_AI_API_KEY: 'playwright-synthetic-key',
          // Empty, not absent: a variable already set is not overridden by
          // .env.local, so tests never write to the database it names, and
          // the server falls back to PGlite in a folder of its own.
          DATABASE_URL: '',
          DATABASE_URL_UNPOOLED: '',
          SAFEPOINT_PGLITE_DIR: TEST_DATABASE,
          // Named, not left to withWorkflow, which otherwise puts every
          // server's runs in .next/workflow-data whatever the folder says.
          WORKFLOW_TARGET_WORLD: 'local',
          WORKFLOW_LOCAL_DATA_DIR: TEST_WORKFLOWS,
          // No annotation server or AI SDK DevTools for tests (scripts/runtime/dev.ts).
          AGENTATION: 'off',
          DEVTOOLS: 'off',
        },
        // Never reuse a developer's server: Playwright must always talk to its
        // own isolated server and PGlite database.
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
