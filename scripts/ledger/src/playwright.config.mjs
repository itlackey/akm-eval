import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const port = process.env.LEDGER_PORT || '4173'; // webServer inherits the environment, so preview.mjs uses the same port.

export default defineConfig({
  testDir: './browser',
  testMatch: '**/*.check.mjs', // Separate from the repository's Bun unit-test discovery.
  workers: 1,
  forbidOnly: !!process.env.CI,
  timeout: 30000,
  reporter: 'list',
  outputDir: '../../../.browser-results',
  use: {
    baseURL: process.env.LEDGER_TEST_URL || `http://127.0.0.1:${port}`,
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: process.env.LEDGER_CHROMIUM_PATH ? { executablePath: process.env.LEDGER_CHROMIUM_PATH } : {},
  },
  webServer: process.env.LEDGER_TEST_URL ? undefined : {
    command: 'bun run build:site && node scripts/ledger/src/preview.mjs',
    cwd: fileURLToPath(new URL('../../../', import.meta.url)),
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 30000,
  },
});
