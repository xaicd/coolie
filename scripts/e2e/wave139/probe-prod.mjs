#!/usr/bin/env node
// wave139 — probe prod: login, list companies, confirm the 产融 company is reachable.
import pw from "/opt/homebrew/lib/node_modules/playwright/index.js";
const { chromium } = pw;
import fs from "node:fs";

const BASE = process.env.WEB_BASE ?? "https://www.xrobinai.cn/XROA";
const ORIGIN = new URL(BASE).origin;
const EMAIL = process.env.WEB_EMAIL ?? "robinschen1989@gmail.com";
const PASSWORD = process.env.WEB_PASSWORD ?? "Cx-TWzbcbpOSLCxb4";
const STATE = "/tmp/ad-wave139/web-state.json";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: "zh-CN",
  storageState: fs.existsSync(STATE) ? STATE : undefined,
});
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") console.log("[console.error]", m.text().slice(0, 160)); });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));

await page.goto(`${BASE}/projects`, { waitUntil: "networkidle", timeout: 60000 });
console.log("url:", page.url());
if (page.url().includes("/auth") || (await page.locator("input[name=email]").count())) {
  await page.fill("input[name=email]", EMAIL);
  await page.fill("input[name=password]", PASSWORD);
  await page.click("button:has-text('Sign In')");
  await page.waitForTimeout(5000);
  console.log("after login url:", page.url());
  await ctx.storageState({ path: STATE });
}
const res = await page.request.get(`${ORIGIN}/api/companies`);
console.log("companies status:", res.status());
const companies = await res.json();
for (const c of companies) console.log(" ", c.id, c.name, c.issuePrefix);
await browser.close();
