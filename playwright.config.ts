import { defineConfig, devices } from '@playwright/test';
import { loadEnv } from './e2e/helpers/env';

// E2E da Bee Platform. Roda o app local (vite) contra o Supabase de produção,
// logado como o usuário de teste ISOLADO (e2e-hive@beeconsulting.test): o RLS
// separa os dados dele dos do Marcos. Chamadas de IA são mockadas por padrão
// (determinístico e sem custo); a suíte "live" (@live) usa IA de verdade.
loadEnv();
const PORT = 5199;

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,       // um único usuário de teste → sem corrida entre specs
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'e2e',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, storageState: 'e2e/.auth/user.json' },
      dependencies: ['setup'],
      grepInvert: process.env.TOOLS ? /@live/ : /@live|@tool/, // TOOLS=1 roda as ferramentas (e2e/tools)
    },
    {
      name: 'live',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, storageState: 'e2e/.auth/user.json' },
      dependencies: ['setup'],
      grep: /@live/,
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
