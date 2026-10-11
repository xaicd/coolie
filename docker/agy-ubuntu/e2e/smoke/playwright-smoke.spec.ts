import { test, expect } from '@playwright/test';

// 容器内通过 mihomo TUN 出口,所以 example.com 必须经过代理。
// 期望:三引擎均能加载并截图到 /root/workspace/e2e/reports/<engine>-example.png

test.describe('agy-ubuntu e2e playwright smoke', () => {
  for (const engine of ['chromium', 'firefox', 'webkit'] as const) {
    test(`${engine} hits example.com and screenshots`, async ({ browser }, testInfo) => {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto('https://example.com', { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveTitle(/Example Domain/);

      const out = `/root/workspace/e2e/reports/${engine}-example.png`;
      await page.screenshot({ path: out, fullPage: true });
      console.log(`[smoke] screenshot: ${out} (project=${testInfo.project.name})`);
      await ctx.close();
    });
  }
});