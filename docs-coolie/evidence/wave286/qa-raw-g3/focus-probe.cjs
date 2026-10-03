#!/usr/bin/env node
/** G3 收尾探针: W3 拉取/首帧分解 + B6 像素级透行检验 (同轴双采样差分)。 */
const path = require("path");
const { chromium } = require("/Users/mac/workspace/xaicd/coolie/node_modules/playwright-core");
const OUT = __dirname;
const BASE = "http://127.0.0.1:3100";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();

  // —— W3: 拉取与首帧分解 (3 次冷导航采样)
  const samples = [];
  for (let i = 0; i < 3; i++) {
    await page.goto(`${BASE}/PER/issues`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector("[data-issue-row-id]", { timeout: 30000 });
    samples.push(await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      const res = performance.getEntriesByType("resource").filter((r) => r.name.includes("/issues"));
      const fcp = performance.getEntriesByType("paint").find((p) => p.name === "first-contentful-paint");
      const f = res.length ? res.reduce((a, b) => (a.responseEnd > b.responseEnd ? a : b)) : null;
      return {
        fcpMs: fcp ? Math.round(fcp.startTime) : null,
        issuesFetchEndMs: f ? Math.round(f.responseEnd) : null,
        issuesFetchDurMs: f ? Math.round(f.duration) : null,
        issuesRespBytes: f ? f.transferSize : null,
        firstRowAfterNavMs: Math.round(performance.now()),
      };
    }));
    await sleep(400);
  }
  console.log("W3 samples:", JSON.stringify(samples, null, 1));

  // —— B6: group 视图, 找到吸附节头, 同一节头在两个不同 scrollY 下采样像素带
  await page.locator('button[aria-label="Project group view"]').click();
  await page.waitForSelector("[data-issues-group-key]", { timeout: 10000 });
  const els = await page.$$("[data-issues-group-key]");
  if (els[1]) await els[1].scrollIntoViewIfNeeded();
  await sleep(300);
  const mainTop = await page.evaluate(() => document.querySelector("main").getBoundingClientRect().top);
  let pinned = null;
  for (let w = 0; w <= 700 && !pinned; w += 50) {
    if (w > 0) { await page.mouse.wheel(0, 50); await sleep(180); }
    pinned = await page.evaluate((mt) => {
      const el = [...document.querySelectorAll("[data-issues-group-key]")].find(
        (e) => Math.abs(e.getBoundingClientRect().top - mt) <= 2);
      return el ? { key: el.getAttribute("data-issues-group-key") } : null;
    }, mainTop);
  }
  if (!pinned) { console.log("B6: no pinned header found"); process.exit(1); }
  const grabs = [];
  let sy = await page.evaluate(() => document.querySelector("main").scrollTop);
  for (let n = 0; n < 14 && grabs.length < 2; n++) {
    const st = await page.evaluate((mt) => {
      const el = [...document.querySelectorAll("[data-issues-group-key]")].find(
        (e) => Math.abs(e.getBoundingClientRect().top - mt) <= 2);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { key: el.getAttribute("data-issues-group-key"), x: r.x, y: r.y, w: r.width, h: r.height,
               topDelta: Math.round(r.top - mt), alpha: cs.backgroundColor, z: cs.zIndex };
    }, mainTop);
    if (st && st.key === pinned.key) {
      const f = path.join(OUT, `b6-band-${grabs.length}.png`);
      await page.screenshot({ path: f, clip: { x: st.x, y: st.y, width: st.w, height: st.h } });
      grabs.push({ scrollY: sy, ...st, file: path.basename(f) });
    }
    await page.mouse.wheel(0, 50); await sleep(180);
    sy = await page.evaluate(() => document.querySelector("main").scrollTop);
  }
  console.log("B6 grabs:", JSON.stringify(grabs, null, 1));
  console.log(grabs.length === 2 && grabs[0].scrollY !== grabs[1].scrollY ? "B6-SAMPLING-OK (same header, two scroll offsets)" : "B6-SAMPLING-INCOMPLETE");
  await browser.close();
})().catch((e) => { console.error("FATAL", String(e).slice(0, 400)); process.exit(1); });
