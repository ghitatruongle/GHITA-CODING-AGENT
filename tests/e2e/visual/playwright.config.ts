import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './',
  timeout: 30000,
  expect: {
    toHaveScreenshot: { maxDiffPixels: 100, threshold: 0.2 },
  },
  use: {
    baseURL: 'http://localhost:1420',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
