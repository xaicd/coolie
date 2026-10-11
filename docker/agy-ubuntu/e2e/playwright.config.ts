import { defineConfig, devices as playwrightDevices } from '@playwright/test';

// Playwright 产物统一落到 /root/workspace/e2e/(自动 bind-mount 到宿主 ./workspace/e2e/)
export default defineConfig({
  testDir: './smoke',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,                 // 三引擎串行,避免互相干扰
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: '/root/workspace/e2e/reports/playwright-html', open: 'never' }],
    ['junit', { outputFile: '/root/workspace/e2e/reports/junit/results.xml' }],
  ],
  outputDir: '/root/workspace/e2e/artifacts',

  use: {
    baseURL: 'https://example.com',
    trace: 'on',
    video: { mode: 'on', dir: '/root/workspace/e2e/videos' },
    screenshot: 'on',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },

  projects: [
    { name: 'chromium', use: { ...playwrightDevices['Desktop Chrome'] } },
    { name: 'firefox',  use: { ...playwrightDevices['Desktop Firefox'] } },
    { name: 'webkit',   use: { ...playwrightDevices['Desktop Safari'] } },
  ],
});