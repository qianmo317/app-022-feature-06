import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4322',
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: 'npm run preview -- --port 4322 --strictPort',
    port: 4322,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
