import { defineConfig } from '@playwright/test';
// Verificações puras do pacote R1, sem banco nem login.
export default defineConfig({ testDir: './e2e', testMatch: /unit-home-pipeline\.spec\.ts/, workers: 1, retries: 0, reporter: 'list' });
