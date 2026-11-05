import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  use: { baseURL: 'http://127.0.0.1:5178', viewport: { width: 375, height: 812 }, headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', trace: 'retain-on-failure' },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5178 --strictPort --mode browser-test',
    url: 'http://127.0.0.1:5178', reuseExistingServer: false,
    env: { VITE_SUPABASE_URL: 'https://mock-tracker.example.test', VITE_SUPABASE_ANON_KEY: 'browser-test-key' },
  },
});
