#!/usr/bin/env node
// wave139 — read-only snapshot of the live board: agents, projects, recent issues.
import pw from "/opt/homebrew/lib/node_modules/playwright/index.js";
const { chromium } = pw;
import fs from "node:fs";

const BASE = process.env.WEB_BASE ?? "https://www.xrobinai.cn/XROA";
const ORIGIN = new URL(BASE).origin;
const EMAIL = process.env.WEB_EMAIL ?? "robinschen1989@gmail.com";
const PASSWORD = process.env.WEB_PASSWORD ?? "Cx-TWzbcbpOSLCxb4";
const CID = process.env.CID ?? "4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e";
const STATE = "/tmp/ad-wave139/web-state.json";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN", storageState: fs.existsSync(STATE) ? STATE : undefined });
const page = await ctx.newPage();
await page.goto(`${BASE}/projects`, { waitUntil: "networkidle", timeout: 60000 });
if (page.url().includes("/auth")) {
  await page.fill("input[name=email]", EMAIL); await page.fill("input[name=password]", PASSWORD);
  await page.click("button:has-text('Sign In')"); await page.waitForTimeout(5000);
  await ctx.storageState({ path: STATE });
}
const J = async (u) => { const r = await page.request.get(`${ORIGIN}${u}`); return r.ok() ? r.json() : { error: r.status(), body: (await r.text()).slice(0, 200) }; };

const agents = await J(`/api/companies/${CID}/agents`);
console.log("=== agents ===");
if (Array.isArray(agents)) for (const a of agents) console.log(` ${a.id.slice(0,8)} ${a.name} role=${a.role} status=${a.status} adapter=${a.adapterType} reportsTo=${a.reportsTo?.slice(0,8) ?? "-"}`);
else console.log(JSON.stringify(agents).slice(0, 500));

const projects = await J(`/api/companies/${CID}/projects`);
console.log("=== projects ===");
if (Array.isArray(projects)) for (const p of projects) console.log(` ${p.id.slice(0,8)} ${p.name} status=${p.status} goals=${(p.goals??[]).length} wbs=${p.wbsDraft ? "yes" : "no"}`);
else console.log(JSON.stringify(projects).slice(0, 500));

const issues = await J(`/api/companies/${CID}/issues?limit=15`);
console.log("=== issues (15) ===");
const list = Array.isArray(issues) ? issues : issues.issues ?? [];
for (const i of list) console.log(` ${i.key ?? i.id.slice(0,8)} [${i.status}] ${String(i.title).slice(0,50)} assignee=${i.assigneeAgentId?.slice(0,8) ?? "-"} proj=${i.projectId?.slice(0,8) ?? "-"}`);
await browser.close();
