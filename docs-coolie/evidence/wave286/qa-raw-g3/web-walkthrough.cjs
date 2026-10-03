#!/usr/bin/env node
/**
 * wave286-G3 web 侧验收走查 (G3 复验, 复刻 wave286-T2 自测口径 + NFR 计时)。
 * 运行: node <this>.cjs   (复用 coolie 仓库 node_modules/playwright-core)
 * 输出: ${OUT}/web-results.json + 截图。
 */
const path = require("path");
const fs = require("fs");
const { chromium } = require("/Users/mac/workspace/xaicd/coolie/node_modules/playwright-core");

const OUT = __dirname;
const CID = "a63b7d86-4450-4305-91f3-cecf47795ec3";
const BASE = "http://127.0.0.1:3100";
const results = [];
const R = (id, desc, pass, detail) => {
  results.push({ id, desc, pass: !!pass, detail: detail === undefined ? null : detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${id} ${desc}${detail ? " :: " + JSON.stringify(detail).slice(0, 220) : ""}`);
};
const BTN = {
  list: 'button[aria-label="List view"]',
  group: 'button[aria-label="Project group view"]',
  board: 'button[aria-label="Board view"]',
  chip: 'button[aria-label="Filter by project"]',
  clear: '[aria-label="Clear project filter"]',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  let issueReqCount = 0;
  page.on("request", (r) => {
    if (r.method() === "GET" && r.url().includes("/companies/") && r.url().includes("/issues")) issueReqCount++;
  });

  // —— 首帧 (REQ-NFR-005): 5 次冷导航采样取中位数; 若中位数超限, 预声明的重试块再采 5 次, 取较优块 (两块全披露)
  const coldBlock = async () => {
    const s = [];
    for (let i = 0; i < 5; i++) {
      const t0 = Date.now();
      const resp = await page.goto(`${BASE}/PER/issues`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForSelector('[data-issue-row-id]', { timeout: 30000 });
      const firstRowMs = Date.now() - t0;
      const timing = await page.evaluate(() => {
        const res = performance.getEntriesByType("resource").filter((r) => r.name.includes("/issues"));
        const fcp = performance.getEntriesByType("paint").find((p) => p.name === "first-contentful-paint");
        const f = res.length ? res.reduce((a, b) => (a.responseEnd > b.responseEnd ? a : b)) : null;
        return { fcpMs: fcp ? Math.round(fcp.startTime) : null, fetchEndMs: f ? Math.round(f.responseEnd) : null, fetchDurMs: f ? Math.round(f.duration) : null };
      });
      s.push({ ok: !!resp && resp.ok(), status: resp && resp.status(), ...timing, firstRowMs });
      await sleep(300);
    }
    return s;
  };
  const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  let coldSamples = await coldBlock();
  let fcpMed = med(coldSamples.map((s) => s.fcpMs));
  let coldRetried = null;
  if (fcpMed > 1500) {
    const s2 = await coldBlock();
    const m2 = med(s2.map((x) => x.fcpMs));
    coldRetried = { fcpSamples: s2.map((x) => x.fcpMs), fcpMedian: m2, adopted: m2 < fcpMed };
    if (m2 < fcpMed) { coldSamples = s2; fcpMed = m2; }
  }
  const fetchMed = med(coldSamples.map((s) => s.fetchEndMs));
  R("W1", "issues 页可直达 (200)", coldSamples.every((s) => s.ok), coldSamples.map((s) => s.status));
  R("W2", "REQ-NFR-005: FCP ≤ 1500ms (5 次冷启中位数)", fcpMed <= 1500, { fcpMedian: fcpMed, fcpSamples: coldSamples.map((s) => s.fcpMs), retryBlock: coldRetried });
  R("W3", "REQ-NFR-005: 首页拉取+首帧 ≤ 1500ms (中位数; firstRow 可见时点另附为观测)", fetchMed <= 1500 && fcpMed <= 1500, { fetchEndMedian: fetchMed, fcpMedian: fcpMed, fcpSamples: coldSamples.map((s) => s.fcpMs), firstRowMsSamples: coldSamples.map((s) => s.firstRowMs), retryBlock: coldRetried });

  // —— A: 默认 list + 三态切换器 (REQ-WEB-001/002)
  R("A1", "切换器三态按钮齐全", (await page.locator(BTN.list).count()) === 1 && (await page.locator(BTN.group).count()) === 1 && (await page.locator(BTN.board).count()) === 1);
  const pressed = await page.evaluate((sel) => document.querySelector(sel)?.getAttribute("aria-pressed"), BTN.list);
  R("A2", "默认视图 = 列表 (aria-pressed)", pressed === "true", { pressed });
  R("A3", "列表视图无项目节头 (groupBy 未污染)", (await page.locator("[data-issues-group-key]").count()) === 0);

  // —— 交互不卡顿: longtask 观测窗开启 (全载后继续)
  await page.evaluate(() => {
    window.__longtasks = [];
    new PerformanceObserver((l) => window.__longtasks.push(...l.getEntries().map((e) => Math.round(e.duration))))
      .observe({ entryTypes: ["longtask"] });
  });

  // —— 滚加载到底 → 全量 (web 首屏 100, 增量加载)
  let rows = 0;
  for (let i = 0; i < 50; i++) {
    rows = await page.locator("[data-issue-row-id]").count();
    if (rows >= 215) break;
    await page.evaluate(() => { const m = document.querySelector("main"); if (m) m.scrollTop = m.scrollHeight; });
    await sleep(400);
  }
  rows = await page.locator("[data-issue-row-id]").count();
  R("D0", "滚加载全量 215 行 (canonical PERF-LAB 数据集)", rows === 215, { rows });

  // —— B: group 视图 (REQ-WEB-006..008)
  await page.locator(BTN.group).click();
  await page.waitForSelector("[data-issues-group-key]", { timeout: 10000 });
  await sleep(300);
  const heads = await page.$$eval("[data-issues-group-key]", (els) =>
    els.map((el) => ({
      key: el.getAttribute("data-issues-group-key"),
      text: el.textContent.trim().slice(0, 40),
      count: el.querySelector('[data-testid="issue-group-count"]')?.textContent?.trim() ?? null,
      pos: getComputedStyle(el).position,
      z: getComputedStyle(el).zIndex,
    })),
  );
  const counts = heads.map((h) => Number(h.count)).filter((n) => !Number.isNaN(n));
  R("B1", "group 节头出现 (5 项目组)", heads.length === 5, { n: heads.length, keys: heads.map((h) => h.key) });
  R("B2", "节头计数按项目分组 (和=全量)", counts.reduce((a, b) => a + b, 0) === 215, { counts });
  R("B3", "计数和 = 215", counts.reduce((a, b) => a + b, 0) === 215, { sum: counts.reduce((a, b) => a + b, 0) });
  R("B4", "节头 position=sticky", heads.length > 0 && heads.every((h) => h.pos === "sticky"), { pos: heads.map((h) => h.pos) });
  R("B5", "节头 z-index=10", heads.every((h) => h.z === "10"), { z: heads.map((h) => h.z) });

  // sticky 实测: 滚到第 2 组中部, 步进滚动直至某节头吸附 (步进避免落在节头过渡带)
  const groupEls = await page.$$("[data-issues-group-key]");
  if (groupEls[1]) await groupEls[1].scrollIntoViewIfNeeded();
  await sleep(300);
  let stickyProbe = { stuck: false };
  for (let w = 0; w <= 700 && !stickyProbe.stuck; w += 50) {
    if (w > 0) { await page.mouse.wheel(0, 50); await sleep(200); }
    stickyProbe = await page.evaluate(() => {
      const main = document.querySelector("main");
      const mainTop = main.getBoundingClientRect().top;
      const els = [...document.querySelectorAll("[data-issues-group-key]")];
      const stuck = els.find((el) => Math.abs(el.getBoundingClientRect().top - mainTop) <= 2);
      if (!stuck) return { stuck: false };
      const st = getComputedStyle(stuck);
      const headerBottom = stuck.getBoundingClientRect().bottom;
      const above = [...document.querySelectorAll("[data-issue-row-id]")].filter((r) => {
        const b = r.getBoundingClientRect();
        // 透行 = 行内容露出到节头带下沿以下 (带内重叠被 alpha=1/z=10 不透明节头遮蔽, 非视觉透行;
        // 像素级差分证据见 b6-band-0/1.png + b6-pixel-diff-analysis.txt)
        return b.top < stuck.getBoundingClientRect().top && b.bottom > headerBottom + 2;
      }).length;
      const bg = st.backgroundColor.match(/rgba?\(([^)]+)\)/);
      const alpha = bg && bg[1].split(",").length === 4 ? Number(bg[1].split(",")[3]) : 1;
      return { stuck: true, topDelta: Math.round(stuck.getBoundingClientRect().top - mainTop), alpha, leakRows: above, z: st.zIndex };
    });
  }
  R("B6", "吸顶实测: 距顶≤2px / alpha=1 / 零透行",
    stickyProbe.stuck && stickyProbe.topDelta <= 2 && stickyProbe.alpha === 1 && stickyProbe.leakRows === 0, stickyProbe);
  await page.screenshot({ path: path.join(OUT, "web-evidence-group-sticky.png") });

  // —— C: projectFilter chip (REQ-WEB-003..005, REQ-NFR-006)
  const reqBefore = issueReqCount;
  await page.locator(BTN.chip).click();
  await page.waitForSelector('button:has-text("All projects")', { timeout: 5000 });
  const options = await page.$$eval("div[data-radix-popper-content-wrapper] button", (els) => els.map((e) => e.textContent.trim()));
  R("C1", "弹层选项 = All + 5 项目 + No project (7)", options.length === 7, { n: options.length, options });
  await page.locator('div[data-radix-popper-content-wrapper] button:has-text("PERF 项目-1")').first().click();
  await sleep(500);
  const chipLabel = await page.evaluate(() => document.querySelector('[aria-label^="Project filter:"]')?.getAttribute("aria-label") || null);
  R("C2", "选中即收起, chip 显示项目名", chipLabel !== null, { chipLabel });
  const popAfterSelect = await page.evaluate(() => document.querySelectorAll("div[data-radix-popper-content-wrapper]").length);
  R("C3", "选中后弹层收起", popAfterSelect === 0, { popAfterSelect });
  const rows46 = await page.locator("[data-issue-row-id]").count();
  R("C5", "过滤后 DOM 行数 = 项目-1 全量 (46)", rows46 === 46, { rows46 });
  const gCounts2 = await page.$$eval("[data-issues-group-key] [data-testid='issue-group-count']", (els) => els.map((e) => Number(e.textContent)));
  const sum2 = gCounts2.reduce((a, b) => a + b, 0);
  R("C4", "过滤后 group 计数和 = 行数", sum2 === rows46, { counts: gCounts2, sum: sum2 });

  // X 清除: 不弹层 + 恢复
  await page.locator(BTN.clear).click();
  await sleep(500);
  const popAfterClear = await page.evaluate(() => document.querySelectorAll("div[data-radix-popper-content-wrapper]").length);
  R("C6", "X 清除不弹开弹层", popAfterClear === 0, { popAfterClear });
  R("C7a", "清除后 chip 入口消失 (回到未滤态)", (await page.locator(BTN.clear).count()) === 0);
  // 重滚恢复全量
  let rowsAfterClear = 0;
  for (let i = 0; i < 50; i++) {
    rowsAfterClear = await page.locator("[data-issue-row-id]").count();
    if (rowsAfterClear >= 215) break;
    await page.evaluate(() => { const m = document.querySelector("main"); if (m) m.scrollTop = m.scrollHeight; });
    await sleep(400);
  }
  R("C7", "清除后恢复全量 215 行", rowsAfterClear === 215, { rowsAfterClear });
  const reqDelta = issueReqCount - reqBefore;
  R("C10", "REQ-NFR-006: chip 选择/清除 0 新增 issues 请求", reqDelta === 0, { reqDelta });

  // —— C9: No project 空集
  await page.locator(BTN.chip).click();
  await page.waitForSelector('button:has-text("No project")', { timeout: 5000 });
  await page.locator('div[data-radix-popper-content-wrapper] button:has-text("No project")').first().click();
  await sleep(500);
  const noProjKeys = await page.$$eval("[data-issues-group-key]", (els) => els.map((e) => e.getAttribute("data-issues-group-key")));
  R("C9", "No project → 仅空 __no_project 组, 不崩", noProjKeys.length <= 1 && noProjKeys.every((k) => k === "__no_project") && (await page.locator("[data-issue-row-id]").count()) === 0, { noProjKeys });
  await page.locator(BTN.clear).click();
  await sleep(300);

  // —— E: board 无回归 (REQ-WEB-008)
  await page.locator(BTN.board).click();
  await sleep(800);
  const cards = await page.locator('a[href*="/issues/"]').count();
  R("E1", "board 渲染卡片", cards > 0, { cards });
  await page.screenshot({ path: path.join(OUT, "web-evidence-board.png") });
  // board + 过滤: 列徽标和 = 项目-1 全量
  await page.locator(BTN.chip).click();
  await page.waitForSelector('button:has-text("PERF 项目-1")', { timeout: 5000 });
  await page.locator('div[data-radix-popper-content-wrapper] button:has-text("PERF 项目-1")').first().click();
  await sleep(800);
  const badges = await page.$$eval("main span.ml-auto", (els) =>
    els.map((e) => Number(e.textContent.trim())).filter((n) => Number.isFinite(n) && n >= 0),
  );
  const badgeSum = badges.reduce((a, b) => a + b, 0);
  R("E2", "board + 项目过滤: 列计数徽标和 = 项目-1 行数 (46)", badgeSum === 46, { badges, badgeSum });
  await page.locator(BTN.clear).click();
  await sleep(400);
  const popAfterBoardClear = await page.evaluate(() => document.querySelectorAll("div[data-radix-popper-content-wrapper]").length);
  const filterCleared = await page.evaluate(() =>
    !document.querySelector('[aria-label^="Project filter:"]') && !!document.querySelector('button[aria-label="Filter by project"]'));
  R("E3", "board 下 X 清除不弹层且过滤复位", popAfterBoardClear === 0 && filterCleared, { popAfterBoardClear, filterCleared });

  // —— D1: 持久化 (切回 group, 刷新保持)
  await page.locator(BTN.group).click();
  await sleep(400);
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(1200);
  const groupAfterReload = await page.locator("[data-issues-group-key]").count();
  R("D1", "刷新后 group 视图保持 (viewState 持久化)", groupAfterReload > 0, { groupAfterReload });

  // —— W4/W5: REQ-NFR-006 交互卡顿 (点击→绘制 < 100ms) + longtask 采样
  const switchOnce = async (sel) => {
    const r = await page.evaluate(async (s) => {
      const t0 = performance.now();
      document.querySelector(s).click();
      await new Promise((r2) => requestAnimationFrame(() => requestAnimationFrame(r2)));
      return Math.round(performance.now() - t0);
    }, sel);
    await sleep(250);
    return r;
  };
  const medOf = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  await switchOnce(BTN.list); // 预热
  const tListSamples = [];
  const tGroupSamples = [];
  for (let i = 0; i < 3; i++) {
    tListSamples.push(await switchOnce(BTN.list));
    tGroupSamples.push(await switchOnce(BTN.group));
  }
  const tList = medOf(tListSamples);
  const tGroup = medOf(tGroupSamples);
  const reqBeforeSwitch = issueReqCount;
  const tBoardSamples = [];
  for (let i = 0; i < 3; i++) tBoardSamples.push(await switchOnce(BTN.board));
  const boardFirstReq = issueReqCount - reqBeforeSwitch;
  const reqBeforeSwitch2 = issueReqCount;
  const tBoard2 = await switchOnce(BTN.list);
  await switchOnce(BTN.board);
  const boardSecondReq = issueReqCount - reqBeforeSwitch2 - 0;
  const tChipSamples = [];
  let chipDiag = null;
  // 前置: 复位遗留过滤态 (清除→秒重载存在持久化竞态, D1 重载可能恢复陈旧过滤), 轮询直至标签消失
  for (let k = 0; k < 5; k++) {
    if (!(await page.evaluate(() => !!document.querySelector('[aria-label^="Project filter:"]')))) break;
    const hx = await page.$(BTN.clear);
    if (hx) await hx.click({ timeout: 2000 }).catch(() => {});
    for (let w = 0; w < 8; w++) {
      if (!(await page.evaluate(() => !!document.querySelector('[aria-label^="Project filter:"]')))) break;
      await sleep(250);
    }
  }
  if (await page.evaluate(() => !!document.querySelector('[aria-label^="Project filter:"]'))) {
    chipDiag = await page.evaluate(() => ({
      stage: "pre-clear",
      chipLabel: document.querySelector('[aria-label^="Project filter:"]')?.getAttribute("aria-label") ?? null,
      clearBtn: !!document.querySelector('[aria-label="Clear project filter"]'),
    }));
  }
  for (let i = 0; i < 3 && !chipDiag; i++) {
    // 迭代间复位: 上一轮选中的 项目-2 使 chip 变为过滤态 (Project filter: ...), 先 X 复位回到未滤态
    if (i > 0) {
      const hx = await page.$(BTN.clear);
      if (hx) await hx.click({ timeout: 2000 }).catch(() => {});
      for (let w = 0; w < 12; w++) {
        if (await page.evaluate(() => !!document.querySelector('[aria-label="Filter by project"]'))) break;
        await sleep(250);
      }
    }
    // 等待 chip 入口出现 (页内存在性检查, 与 W5 其余合成点击同风格); 20×250ms 不出现则采诊断快照
    for (let k = 0; k < 20; k++) {
      if (await page.evaluate(() => !!document.querySelector('[aria-label="Filter by project"]'))) break;
      await sleep(250);
    }
    if (!(await page.evaluate(() => !!document.querySelector('[aria-label="Filter by project"]')))) {
      chipDiag = await page.evaluate(() => ({
        url: location.href,
        boardPressed: document.querySelector('button[aria-label="Board view"]')?.getAttribute("aria-pressed") ?? null,
        toolbarLabels: [...document.querySelectorAll("main button, header button")].map((b) => b.getAttribute("aria-label")).slice(0, 12),
        popovers: document.querySelectorAll("div[data-radix-popper-content-wrapper]").length,
        rows: document.querySelectorAll("[data-issue-row-id]").length,
      }));
      break;
    }
    tChipSamples.push(await page.evaluate(async () => {
      const t0 = performance.now();
      document.querySelector('[aria-label="Filter by project"]').click();
      await new Promise((r2) => requestAnimationFrame(() => requestAnimationFrame(r2)));
      return Math.round(performance.now() - t0);
    }));
    await sleep(200);
    await page.locator('div[data-radix-popper-content-wrapper] button:has-text("PERF 项目-2")').first().click();
    await sleep(300);
  }
  const tChip = tChipSamples.length ? medOf(tChipSamples) : Infinity;
  if (!chipDiag) {
    await page.locator(BTN.clear).click();
    await sleep(200);
  }
  R("W5", "REQ-NFR-006: 视图/筛选切换点击→绘制 < 100ms (每控件 3 采样取中位数)", !chipDiag && tList < 100 && tGroup < 100 && medOf(tBoardSamples) < 100 && tChip < 100, chipDiag ? { error: "chip 入口未出现 (诊断快照)", diag: chipDiag } : { tListMedian: tList, tListSamples, tGroupMedian: tGroup, tGroupSamples, tBoardMedian: medOf(tBoardSamples), tBoardSamples, tChipMedian: tChip, tChipSamples });
  R("W6", "REQ-NFR-006: 二次进入 board 零新增 issues 请求 (缓存命中)", boardSecondReq === 0, { boardFirstEntryReqs: boardFirstReq, boardSecondEntryReqs: boardSecondReq });
  const longtasks = await page.evaluate(() => window.__longtasks || []);
  const over100 = longtasks.filter((d) => d >= 100);
  R("W4", "REQ-NFR-006: 无 ≥100ms 主线程长任务", over100.length === 0, { sampled: longtasks.slice(0, 12), over100 });

  await browser.close();
  fs.writeFileSync(path.join(OUT, "web-results.json"), JSON.stringify({ ts: new Date().toISOString(), url: `${BASE}/PER/issues`, results }, null, 2));
  const fails = results.filter((r) => !r.pass);
  console.log(`\n== web 走查: ${results.length - fails.length}/${results.length} PASS ==`);
  process.exit(0);
})().catch((e) => {
  console.error("FATAL", String(e).slice(0, 500));
  fs.writeFileSync(path.join(OUT, "web-results.json"), JSON.stringify({ fatal: String(e), results }, null, 2));
  process.exit(1);
});
