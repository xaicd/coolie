#!/usr/bin/env node
// wave139 — production (or any live board) enrichment check:
//   建临时项目 → 上传《产融…技术规范书》→ 轮询项目详情 → 打印 description/goals 从 0 → N.
// Reuses the wave129 Playwright login. Writes a JSON record + screenshots.
//
//   TAG=before node scripts/e2e/wave139/prod-enrichment.mjs
//   TAG=after  node scripts/e2e/wave139/prod-enrichment.mjs
import pw from "/opt/homebrew/lib/node_modules/playwright/index.js";
const { chromium } = pw;
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.WEB_BASE ?? "https://www.xrobinai.cn/XROA";
const ORIGIN = new URL(BASE).origin;
const EMAIL = process.env.WEB_EMAIL ?? "robinschen1989@gmail.com";
const PASSWORD = process.env.WEB_PASSWORD ?? "Cx-TWzbcbpOSLCxb4";
const CID = process.env.CID ?? "4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e"; // xrobinai
const DOC = process.env.DOC ?? "/tmp/req.docx";
const TAG = process.env.TAG ?? "run";
const STATE = "/tmp/ad-wave139/web-state.json";
const OUT = path.resolve("docs-coolie/evidence/wave139");
fs.mkdirSync(OUT, { recursive: true });

const rec = { tag: TAG, base: BASE, companyId: CID, doc: DOC, startedAt: new Date().toISOString() };
const log = (...a) => console.log(...a);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 }, locale: "zh-CN",
  storageState: fs.existsSync(STATE) ? STATE : undefined,
});
const page = await ctx.newPage();
const api = page.request;
// Board mutations are origin-checked; the guard trusts the request Host, so the
// page's own origin is the one to present.
const ORIGIN_HEADERS = { Origin: ORIGIN, Referer: `${ORIGIN}/` };

await page.goto(`${BASE}/projects`, { waitUntil: "networkidle", timeout: 60000 });
if (page.url().includes("/auth") || (await page.locator("input[name=email]").count())) {
  await page.fill("input[name=email]", EMAIL);
  await page.fill("input[name=password]", PASSWORD);
  await page.click("button:has-text('Sign In')");
  await page.waitForTimeout(5000);
  await ctx.storageState({ path: STATE });
}

async function project(id) {
  const r = await api.get(`${ORIGIN}/api/projects/${id}`);
  if (!r.ok()) throw new Error(`GET project ${id} → ${r.status()} ${await r.text()}`);
  return r.json();
}

// 1. create a throwaway project
const name = `wave139 解析真验 ${TAG} ${Date.now()}`;
const createRes = await api.post(`${ORIGIN}/api/companies/${CID}/projects`, { data: { name }, headers: ORIGIN_HEADERS });
if (!createRes.ok()) throw new Error(`create project → ${createRes.status()} ${await createRes.text()}`);
const created = await createRes.json();
const pid = created.id ?? created.project?.id;
rec.projectId = pid;
rec.projectName = name;
log(`project ${pid}  name=${name}`);

// 2. initial state (before upload)
const before = await project(pid);
rec.before = { description: before.description ?? null, goals: (before.goals ?? []).map((g) => g.title), goalIds: before.goalIds ?? [] };
log(`BEFORE upload: description=${JSON.stringify(rec.before.description)} goals=${rec.before.goals.length}`);

// 3. upload the real 技术规范书 (triggers async enrichment)
const buf = fs.readFileSync(DOC);
const up = await api.post(`${ORIGIN}/api/companies/${CID}/projects/${pid}/documents`, {
  headers: ORIGIN_HEADERS,
  multipart: {
    file: {
      name: "某公司产融智能体应用系统集成服务项目技术规范书.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: buf,
    },
  },
});
log(`upload status=${up.status()}`);
if (!up.ok()) throw new Error(`upload → ${up.status()} ${await up.text()}`);
rec.upload = { status: up.status(), bytes: buf.length };

// 4. poll for the async enrichment to land
const t0 = Date.now();
let after = null;
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(750);
  after = await project(pid);
  const n = (after.goals ?? []).length;
  const d = after.description ?? null;
  if (n > 0 || d) { rec.enrichmentLatencyMs = Date.now() - t0; break; }
}
rec.after = {
  description: after.description ?? null,
  goals: (after.goals ?? []).map((g) => g.title),
  goalIds: after.goalIds ?? [],
};
log(`AFTER upload (${rec.enrichmentLatencyMs ?? ">30s"}ms): description=${JSON.stringify(rec.after.description)} goals=${rec.after.goals.length}`);
for (const g of rec.after.goals) log(`   - ${g}`);
rec.goalCount = rec.after.goals.length;

// 5. the wave140 WBS draft (may or may not be deployed)
try {
  const w = await api.get(`${ORIGIN}/api/companies/${CID}/projects/${pid}/wbs`);
  if (w.ok()) {
    const body = await w.json();
    rec.wbsDraft = body.draft ? { source: body.draft.source, items: body.draft.items?.length ?? 0, goalTitles: body.draft.goalTitles ?? [] } : null;
    log(`WBS draft: ${rec.wbsDraft ? `${rec.wbsDraft.items} items from ${rec.wbsDraft.source}` : "none"}`);
  } else {
    rec.wbsDraft = { error: `GET wbs → ${w.status()}` };
  }
} catch (e) { rec.wbsDraft = { error: String(e) }; }

// 6. screenshot the project detail page for the record
try {
  await page.goto(`${BASE}/projects/${pid}`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, `prod-${TAG}-project-detail.png`), fullPage: true });
} catch (e) { log("screenshot failed:", String(e)); }

rec.finishedAt = new Date().toISOString();
fs.writeFileSync(path.join(OUT, `prod-${TAG}.json`), JSON.stringify(rec, null, 2));
log(`\nwrote ${path.join(OUT, `prod-${TAG}.json`)}`);
log(`PROJECT_ID=${pid}`);
await browser.close();
