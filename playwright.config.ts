import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  timeout: 45000,
  use: {
    baseURL: 'http://127.0.0.1:4318',
    headless: true,
    viewport: { width: 1512, height: 1080 },
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npx tsx tests/ui-server.ts',
    url: 'http://127.0.0.1:4318',
    reuseExistingServer: false,
    timeout: 60000,
  },
  reporter: 'list',
});
