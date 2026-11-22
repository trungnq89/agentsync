import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/components\//, replacement: path.resolve(__dirname, 'components') + '/' },
      { find: /^@\/lib\//, replacement: path.resolve(__dirname, 'lib') + '/' },
      { find: /^@\//, replacement: path.resolve(__dirname, 'src') + '/' },
    ],
  },
  test: {
    environment: 'node',
    // Fixed test-only key (32 bytes, base64); set before any module (incl. dotenv) loads.
    env: { SETTINGS_ENCRYPTION_KEY: 'dGVzdC1rZXktdGVzdC1rZXktdGVzdC1rZXktMTIzNDU=' },
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/global-setup.ts'],
    setupFiles: ['tests/setup.ts'],
    fileParallelism: false,
  },
});
