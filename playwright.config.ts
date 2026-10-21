import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  // A primeira navegação compila o módulo no Vite (~50s a frio); 60s estourava sob carga.
  timeout: 120_000,
  fullyParallel: false,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:3001',
    headless: true,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'edge',
      use: { channel: 'msedge' },
    },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1',
    url: 'http://127.0.0.1:3001/tests/e2e/fixtures/assignment.html',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
