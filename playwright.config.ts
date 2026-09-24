import { defineConfig } from '@playwright/test';
import { assertStaging } from './e2e/env';

// Blocca tutto se l'app non punta al progetto Supabase di staging: i test creano e
// annullano prenotazioni e muovono saldi, non devono MAI girare sulla produzione.
assertStaging();

export default defineConfig({
  testDir: './e2e',
  // Gli stessi account di prova (Mario, Luigi, admin) sono condivisi tra i test:
  // un test alla volta, nell'ordine dei file.
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://localhost:8080',
    // Edge già installato sul PC: nessun browser da scaricare, e usa i certificati di
    // Windows (la rete aziendale ispeziona le connessioni cifrate, Node non si fida).
    channel: 'msedge',
    locale: 'it-IT',
    timezoneId: 'Europe/Rome',
    viewport: { width: 1400, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'login', testMatch: /auth\.setup\.ts/ },
    { name: 'wallet', testMatch: /.*\.spec\.ts/, dependencies: ['login'] },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:8080',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
