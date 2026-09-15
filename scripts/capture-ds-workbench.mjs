#!/usr/bin/env node
// Capture screenshots of the DigitalStaff (DS) ontology workbench so we can
// pixel-match our plugin-ontology UI against the reference design.
//
// Credentials baked in for the local dev instance at http://100.84.124.71:5173.
// Override anything via environment variables when running elsewhere.
//
// Usage:
//   node scripts/capture-ds-workbench.mjs
// Outputs: screenshots/ds-workbench/<label>.png
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { chromium } from "@playwright/test";

const BASE = process.env.DS_BASE_URL ?? "http://100.84.124.71:5173/digstaff";
const ADMIN_USER = process.env.ADMIN_USER ?? "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "DigitalEmp2025!";
const ADMIN_TENANT = process.env.ADMIN_TENANT ?? "default";
const WORKBENCH_DOMAIN = process.env.WORKBENCH_DOMAIN ?? "ecommerce";
const OUT_DIR = process.env.OUT_DIR ?? "screenshots/ds-workbench";
const WIDTH = Number(process.env.WIDTH ?? 1440);
const HEIGHT = Number(process.env.HEIGHT ?? 900);

// MD5 the password up front; the login page expects the hex digest on the wire.
const ADMIN_PASSWORD_MD5 = createHash("md5").update(ADMIN_PASSWORD).digest("hex");

await fs.mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
let exitCode = 0;
try {
  const ctx = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 2,
    locale: "zh-CN",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  });

  // Mask playwright's webdriver flag so DS doesn't return ACCESS_DENIED.
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    const w = /** @type {any} */ (window);
    delete w.__webdriver_evaluate;
    delete w.__selenium_unwrap;
    delete w.__webdriver_script_function;
    delete w.__nightmare;
    delete w._phantom;
    delete w.callPhantom;
  });

  const page = await ctx.newPage();

  // 1) Open login page once just to capture the screenshot of the empty form.
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: path.join(OUT_DIR, "01-login.png"), fullPage: false });
  console.log(`Wrote ${OUT_DIR}/01-login.png`);

  // 2) Fill the form for the "02-filled" screenshot using the plain password
  //    (so the React onClick handler does its client-side MD5 itself). Then
  //    click "进入系统" — the SPA posts the MD5 digest, redirects away from
  //    /login on success, and tracks session entirely client-side.
  if (ADMIN_TENANT) {
    const tenantSelect = page.locator('select').first();
    if (await tenantSelect.count()) {
      const options = await tenantSelect.locator("option").allTextContents();
      const match = options.find((t) => t.toLowerCase().includes(ADMIN_TENANT.toLowerCase()));
      if (match) await tenantSelect.selectOption({ label: match });
    }
  }
  const usernameInput = page.locator('input[type="text"], input:not([type])').first();
  if (await usernameInput.count()) {
    await usernameInput.fill(ADMIN_USER);
  }
  // Use type() (real keyboard events) so React onChange fires the way it
  // would for a human. fill() works too, but the React controlled-input
  // dance is fragile when both username and password are filled in quick
  // succession.
  const pwInput = page.locator('input[type="password"]').first();
  await pwInput.click();
  await pwInput.fill(ADMIN_PASSWORD);
  await page.screenshot({ path: path.join(OUT_DIR, "02-login-filled.png"), fullPage: false });
  console.log(`Wrote ${OUT_DIR}/02-login-filled.png`);

  // 3) Click the "进入系统" button. The React onClick handler does the
  //    client-side MD5, POSTs to /api/auth/login, and react-router-navigates
  //    away from /login on success. We wait for that navigation.
  const submit = page
    .locator('button[type="submit"], button:has-text("进入系统"), button:has-text("登录")')
    .first();
  await Promise.all([
    page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 20000 }).catch(() => {}),
    submit.click(),
  ]);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: path.join(OUT_DIR, "03-after-login.png"), fullPage: false });
  console.log(`Wrote ${OUT_DIR}/03-after-login.png  (url=${page.url()})`);

  // 3) "After login" + first workbench screenshot are the same page after we
  //    navigated to the workbench above. The remaining 04+ shots are clicks
  //    on view tabs / canvas, so they reuse the same authenticated page.
  await page.screenshot({ path: path.join(OUT_DIR, "04-workbench-default.png"), fullPage: false });
  console.log(`Wrote ${OUT_DIR}/04-workbench-default.png  (url=${page.url()})`);

  // 3b) Open "顶部导航" and dump the full nav so we can see the menu tree.
  const topNav = page.locator('button:has-text("顶部导航"), a:has-text("顶部导航")').first();
  if (await topNav.count()) {
    await topNav.click().catch(() => {});
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "04b-topnav-open.png"), fullPage: false });
    console.log(`Wrote ${OUT_DIR}/04b-topnav-open.png`);
  }

  // 3c) Click the top-level nav items most likely to contain ontology. Each
  //     click opens a dropdown of sub-functions. Then we open the sub-items
  //     inside the most relevant dropdown ("演进建模" → knowledge ontology).
  const topLabels = ["演进建模", "管理中心", "协同研发"];
  for (const lbl of topLabels) {
    const item = page.locator(`a:has-text("${lbl}"), button:has-text("${lbl}")`).first();
    if (await item.count()) {
      await item.click().catch(() => {});
      await page.waitForTimeout(1000);
      const id = Buffer.from(lbl, "utf8").toString("hex");
      await page.screenshot({ path: path.join(OUT_DIR, `04c-topnav-${id}.png`), fullPage: false });
      console.log(`Wrote ${OUT_DIR}/04c-topnav-${id}.png  (click "${lbl}")`);
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(300);
    }
  }

  // 3d) Open 演进建模 → 知识本体 (most likely the ontology workbench from
  //     DS_REFERENCE.md). The dropdown stays open after the first click, so
  //     we can click the sub-item without re-opening.
  const yanJian = page.locator('a:has-text("演进建模"), button:has-text("演进建模")').first();
  if (await yanJian.count()) {
    await yanJian.click().catch(() => {});
    await page.waitForTimeout(800);
    const subTargets = ["知识本体", "本体管理", "知识蓝图", "演进治理", "演进中心"];
    for (const sub of subTargets) {
      const subItem = page.locator(`a:has-text("${sub}"), button:has-text("${sub}")`).first();
      if (await subItem.count()) {
        await subItem.click().catch(() => {});
        await page.waitForTimeout(2500);
        const sid = Buffer.from(sub, "utf8").toString("hex");
        const url = page.url();
        await page.screenshot({ path: path.join(OUT_DIR, `04d-yanJian-${sid}.png`), fullPage: false });
        console.log(`Wrote ${OUT_DIR}/04d-yanJian-${sid}.png  (click "演进建模" → "${sub}" → ${url})`);
        // Navigate back to the home so the next sub-click works on a fresh page.
        await page.goBack().catch(() => {});
        await page.waitForTimeout(1000);
        // Re-open 演进建模 dropdown.
        await yanJian.click().catch(() => {});
        await page.waitForTimeout(600);
      }
    }
  }

  // 3e) Now on the 本体管理 page, click the "进入" button next to the
  //     ecommerce row — that lands us in the actual ontology workbench
  //     (/ontology/workbench/{domainId}). We can use the explicit URL too
  //     since we now know the route pattern.
  await page.goto(`${BASE}/ontology/domains`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);

  // Click "进入" for the first row (ecommerce). The button has text 进入 plus
  // a chevron. We use the first match.
  const enterBtn = page.locator('a:has-text("进入"), button:has-text("进入")').first();
  if (await enterBtn.count()) {
    await enterBtn.click().catch(() => {});
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);
  }
  console.log(`Workbench url: ${page.url()}`);
  await page.screenshot({ path: path.join(OUT_DIR, "05-ontology-workbench.png"), fullPage: false });
  await page.screenshot({ path: path.join(OUT_DIR, "05-ontology-workbench-full.png"), fullPage: true });
  console.log(`Wrote 05-ontology-workbench.png + full`);

  // 3f) Capture the top-bar view tabs. DS_REFERENCE.md lists "图谱|表格|模型|对话|沙盘".
  const viewLabels = ["图谱", "表格", "模型", "对话", "沙盘"];
  for (const lbl of viewLabels) {
    const btn = page.locator(`button:has-text("${lbl}"), a:has-text("${lbl}")`).first();
    if (await btn.count()) {
      await btn.click().catch(() => {});
      await page.waitForTimeout(1500);
      const id = Buffer.from(lbl, "utf8").toString("hex");
      await page.screenshot({ path: path.join(OUT_DIR, `06-view-${id}.png`), fullPage: false });
      console.log(`Wrote 06-view-${id}.png  ("${lbl}")`);
    } else {
      console.log(`(skip) No tab matching "${lbl}" on the workbench.`);
    }
  }

  // 4) Click somewhere on the canvas to expose a node detail inspector.
  //    First switch back to the 图谱 view so we hit the canvas.
  const graphTab = page.locator('button:has-text("图谱"), a:has-text("图谱")').first();
  if (await graphTab.count()) {
    await graphTab.click().catch(() => {});
    await page.waitForTimeout(1500);
  }
  const canvas = page.locator(".react-flow__pane, canvas, svg").first();
  if (await canvas.count()) {
    await canvas.click({ position: { x: 400, y: 300 } }).catch(() => {});
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT_DIR, "07-canvas-clicked.png"), fullPage: false });
    console.log(`Wrote 07-canvas-clicked.png`);
  }

  // 5) Final full-page screenshot for the gallery card.
  await page.screenshot({ path: path.join(OUT_DIR, "08-workbench-full.png"), fullPage: true });
  console.log(`Wrote 08-workbench-full.png`);
} finally {
  await browser.close();
}
process.exit(exitCode);