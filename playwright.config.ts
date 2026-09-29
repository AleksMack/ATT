import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';
import 'dotenv/config';

// Saved session (login is done once in tests/setup/*.setup.ts)
export const AUTH_FILE = 'playwright/.auth/user.json';

if (!process.env.BASE_URL) {
  console.warn('WARNING: BASE_URL is not set. Check the .env file.');
}

export default defineConfig({
  testDir: './tests',

  // The CRM can be slow to load
  timeout: 60_000,
  expect: { timeout: 10_000 },

  // Tests run one at a time for now (shared data on the test environment)
  fullyParallel: false,
  workers: 1,

  retries: process.env.CI ? 2 : 0,
  forbidOnly: !!process.env.CI,

  // Reports: console + HTML (npx playwright show-report)
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: process.env.BASE_URL,
    ...devices['Desktop Chrome'],
    viewport: { width: 1600, height: 900 },
    headless: true,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,

    // Artifacts for investigating failures
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    // 1. Log in and save the session to AUTH_FILE
    {
      name: 'setup',
      testDir: './tests/setup',
      testMatch: /.*\.setup\.ts/,
      use: {
        // Traces record fill() values and videos show the OTP field,
        // so keep only the failure screenshot (password field is masked)
        trace: 'off',
        video: 'off',
      },
    },

    // 2. UI e2e tests
    {
      name: 'ui',
      testDir: './tests/ui',
      dependencies: ['setup'],
      use: {
        // Only use the session if the file already exists
        storageState: fs.existsSync(AUTH_FILE) ? AUTH_FILE : undefined,
      },
    },

    // 3. API tests
    {
      name: 'api',
      testDir: './tests/api',
      use: {
        baseURL: process.env.API_URL,
        extraHTTPHeaders: {
          Accept: 'application/json',
        },
      },
    },
  ],
});
