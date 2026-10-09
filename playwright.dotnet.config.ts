import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({
  ...base,
  // Match the deliberately bounded two-review worker pool; saturation is tested separately.
  workers: 2,
  // Full review completion is asynchronous; this is a correctness suite, not a latency benchmark.
  expect: { timeout: 15000 },
  webServer: {
    command: 'npx tsx tests/migration/ui-server.ts',
    url: 'http://127.0.0.1:4318',
    reuseExistingServer: false,
    timeout: 60000,
  },
});
