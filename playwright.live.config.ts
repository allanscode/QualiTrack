import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'session-termination.live.spec.ts',
  timeout: 90_000,
  fullyParallel: false,
  reporter: 'line',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'https://qualitrack.vercel.app',
    headless: true,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'edge',
      use: { channel: 'msedge' },
    },
  ],
});
