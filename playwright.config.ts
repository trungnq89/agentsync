import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';

const e2eUrl = process.env.DATABASE_URL_E2E;
if (!e2eUrl) throw new Error('DATABASE_URL_E2E is not set (see .env.example)');
const PORT = 3100;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  // Accept-Language outranks DEFAULT_LOCALE, so pin the browser to Vietnamese like the pre-i18n UI.
  use: { baseURL: `http://localhost:${PORT}`, ...devices['Desktop Chrome'], locale: 'vi-VN' },
  webServer: {
    command: `pnpm exec tsx src/db/migrate.ts && pnpm exec next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: { DATABASE_URL: e2eUrl, APP_URL: `http://localhost:${PORT}`, DEFAULT_LOCALE: 'vi' },
  },
});
