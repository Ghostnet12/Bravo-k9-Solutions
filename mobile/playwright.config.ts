import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: '**/*.ui.ts', timeout: 30000,
  use: { launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH, args: ['--no-sandbox','--disable-dev-shm-usage'] } : {}, baseURL: 'http://127.0.0.1:8094', viewport: { width: 390, height: 844 }, trace: 'retain-on-failure' },
  webServer: { command: 'python3 scripts/serve-preview.py', url: 'http://127.0.0.1:8094', reuseExistingServer: !process.env.CI },
});
