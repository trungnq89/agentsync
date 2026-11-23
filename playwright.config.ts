import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';

const e2eUrl = process.env.DATABASE_URL_E2E;
if (!e2eUrl) throw new Error('DATABASE_URL_E2E is not set (see .env.example)');
const PORT = 3100;
const SLACK_PORT = 3199;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  // Accept-Language outranks DEFAULT_LOCALE, so pin the browser to Vietnamese like the pre-i18n UI.
  use: { baseURL: `http://localhost:${PORT}`, ...devices['Desktop Chrome'], locale: 'vi-VN' },
  webServer: [
    {
      // Fake Slack Web API for the digest e2e tests; the app below talks to it through SLACK_API_BASE.
      command: 'pnpm exec tsx tests/helpers/fake-slack-cli.ts',
      url: `http://127.0.0.1:${SLACK_PORT}/__posts`,
      timeout: 30_000,
      reuseExistingServer: false,
      env: { FAKE_SLACK_PORT: String(SLACK_PORT) },
    },
    {
      command: `pnpm exec tsx src/db/migrate.ts && pnpm exec next dev -p ${PORT}`,
      url: `http://localhost:${PORT}/login`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        DATABASE_URL: e2eUrl,
        SLACK_API_BASE: `http://127.0.0.1:${SLACK_PORT}`,
        APP_URL: `http://localhost:${PORT}`,
        DEFAULT_LOCALE: 'vi',
        SETTINGS_ENCRYPTION_KEY: process.env.SETTINGS_ENCRYPTION_KEY ?? 'dGVzdC1rZXktdGVzdC1rZXktdGVzdC1rZXktMTIzNDU=',
      },
    },
  ],
});
