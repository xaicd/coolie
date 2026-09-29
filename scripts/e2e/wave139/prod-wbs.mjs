#!/usr/bin/env node
// wave139 — production WBS/issue helpers for the chain run.
import pw from "/opt/homebrew/lib/node_modules/playwright/index.js";
const { chromium } = pw;
import fs from "node:fs";

const BASE = process.env.WEB_BASE ?? "https://www.xrobinai.cn/XROA";
const ORIGIN = new URL(BASE).origin;
const EMAIL = process.env.WEB_EMAIL ?? "robinschen1989@gmail.com";
const PASSWORD = process.env.WEB_PASSWORD ?? "Cx-TWzbcbpOSLCxb4";
const CID = process.env.CID ?? "4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e";
const PID = process.env.PID ?? "b0e465c4-3a06-49e6-93cc-e97ca3eebf9f";
const STATE = "/tmp/ad-wave139/web-state.json";

export async function session() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN", storageState: fs.existsSync(STATE) ? STATE : undefined });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/projects`, { waitUntil: "networkidle", timeout: 60000 });
  if (page.url().includes("/auth") || (await page.locator("input[name=email]").count())) {
    await page.fill("input[name=email]", EMAIL);
    await page.fill("input[name=password]", PASSWORD);
    await page.click("button:has-text('Sign In')");
    await page.waitForTimeout(5000);
    await ctx.storageState({ path: STATE });
  }
  return { browser, ctx, page };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { browser, page } = await session();
  const H = { Origin: ORIGIN, Referer: `${ORIGIN}/` };
  const r = await page.request.get(`${ORIGIN}/api/companies/${CID}/projects/${PID}/wbs`, { headers: H });
  console.log("wbs status:", r.status());
  const body = await r.json();
  console.log(JSON.stringify(body, null, 1).slice(0, 2500));
  const iss = await page.request.get(`${ORIGIN}/api/companies/${CID}/issues?limit=40`, { headers: H });
  const ib = await iss.json();
  const arr = Array.isArray(ib) ? ib : ib.issues ?? [];
  console.log("=== issues in project ===");
  for (const i of arr.filter((x) => x.projectId === PID)) console.log(` ${i.identifier} [${i.status}] ${i.title.slice(0, 46)} milestone=${i.isMilestone} assignee=${(i.assigneeAgentId || "-").slice(0, 8)}`);
  await browser.close();
}
