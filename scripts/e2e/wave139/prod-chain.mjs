#!/usr/bin/env node
// wave139 — production full-chain back half:
//   拆解 (adopt WBS) → 派发 (assign a leaf work package) → 员工交付 → 回写 → done.
// Real UI screenshots + API truth. Bounded polling.
import fs from "node:fs";
import path from "node:path";
import { session } from "./prod-wbs.mjs";

const BASE = process.env.WEB_BASE ?? "https://www.xrobinai.cn/XROA";
const ORIGIN = new URL(BASE).origin;
const CID = process.env.CID ?? "4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e";
const PID = process.env.PID ?? "b0e465c4-3a06-49e6-93cc-e97ca3eebf9f";
const AID = process.env.AID ?? "95069d63-"; // core-swe-agent (prod, matched by prefix below)
const OUT = path.resolve("docs-coolie/evidence/wave139/prod");
fs.mkdirSync(OUT, { recursive: true });
const rec = { base: BASE, companyId: CID, projectId: PID, startedAt: new Date().toISOString(), steps: [] };
const step = (name, data) => { rec.steps.push({ name, at: new Date().toISOString(), ...data }); console.log(`STEP ${name}: ${JSON.stringify(data).slice(0, 300)}`); };

const { browser, page } = await session();
const H = { Origin: ORIGIN, Referer: `${ORIGIN}/` };
const J = async (u) => { const r = await page.request.get(`${ORIGIN}${u}`, { headers: H }); return r.ok() ? r.json() : { __error: r.status(), body: (await r.text()).slice(0, 200) }; };
const POST = async (u, d) => { const r = await page.request.post(`${ORIGIN}${u}`, { headers: H, data: d ?? {} }); return r.ok() ? r.json() : { __error: r.status(), body: (await r.text()).slice(0, 300) }; };

const agents = await J(`/api/companies/${CID}/agents`);
const coreSwe = (agents ?? []).find((a) => a.name === "core-swe-agent") ?? (agents ?? [])[0];
step("agents", { picked: coreSwe?.name, id: coreSwe?.id, adapter: coreSwe?.adapterType });

// ---- 拆解: adopt the WBS draft into the milestone mainline -------------------
const adopt = await POST(`/api/companies/${CID}/projects/${PID}/wbs/adopt`);
step("拆解 adopt", adopt);
if (adopt.__error) { fs.writeFileSync(path.join(OUT, "chain.json"), JSON.stringify(rec, null, 2)); await browser.close(); process.exit(1); }

await page.waitForTimeout(2500);
const issuesRes = await J(`/api/companies/${CID}/issues?limit=60`);
const issues = (issuesRes ?? []).filter?.((x) => x.projectId === PID) ?? [];
const leaf = issues.find((i) => !i.isMilestone && i.wbsType === "work_package") ?? issues.find((i) => !i.isMilestone);
step("拆解 tasks", { count: issues.length, milestones: issues.filter((i) => i.isMilestone).length, pickedLeaf: leaf?.identifier, leafTitle: leaf?.title });
rec.leafIssueId = leaf?.id;
rec.leafIdentifier = leaf?.identifier;

// screenshot the mainline view
try {
  await page.goto(`${BASE}/projects/${PID}`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT, "chain-01-project.png"), fullPage: true });
} catch (e) { step("shot-project", { error: String(e) }); }

// ---- 派发: assign the leaf to the employee ----------------------------------
const deliverable = "wave139 全链路末段复测：请在本任务的工作目录创建文件 wave139-delivery.txt，写入一行中文：'wave139 员工交付自检通过'。完成后在本任务评论里回写结论（文件路径 + 内容），并把状态置为 done。";
const patch = await page.request.patch(`${ORIGIN}/api/issues/${leaf.id}`, { headers: H, data: { assigneeAgentId: coreSwe.id, description: deliverable } });
step("派发 assign", { status: patch.status(), ok: patch.ok() });
const assigned = await J(`/api/companies/${CID}/issues/${leaf.id}`);
step("派发 readback", { assigneeAgentId: assigned.assigneeAgentId, status: assigned.status });

// ---- 员工交付: wake the employee --------------------------------------------
const wake = await POST(`/api/agents/${coreSwe.id}/wakeup`, { source: "assignment", triggerDetail: "manual", reason: "wave139 全链路末段复测" });
step("唤醒", wake);

// ---- poll 员工交付 → 回写 → done --------------------------------------------
const deadline = Date.now() + 9 * 60_000;
let cur = assigned, comments = [];
let lastSig = "";
while (Date.now() < deadline) {
  await page.waitForTimeout(12_000);
  cur = await J(`/api/companies/${CID}/issues/${leaf.id}`);
  const c = await J(`/api/issues/${leaf.id}/comments`);
  comments = Array.isArray(c) ? c : c.comments ?? [];
  const sig = `${cur.status}|${comments.length}`;
  if (sig !== lastSig) { console.log(`  poll ${cur.identifier} status=${cur.status} comments=${comments.length}`); lastSig = sig; }
  if (["done", "in_review", "blocked"].includes(cur.status) && comments.length > 0) break;
}
rec.finalStatus = cur.status;
rec.commentCount = comments.length;
step("员工交付结果", { status: cur.status, comments: comments.length });

const runs = await J(`/api/companies/${CID}/heartbeat-runs?limit=6`);
rec.recentRuns = (Array.isArray(runs) ? runs : runs.runs ?? []).slice(0, 6).map((r) => ({ id: r.id, status: r.status, agentId: r.agentId, startedAt: r.startedAt, error: r.error ?? r.lastError ?? null }));

try {
  await page.goto(`${BASE}/issues/${leaf.identifier}`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT, "chain-02-issue.png"), fullPage: true });
} catch (e) { step("shot-issue", { error: String(e) }); }

rec.comments = comments.slice(-4).map((c) => ({ author: String(c.authorAgentId || c.authorUserId || "").slice(0, 8), body: String(c.body || c.content || "").slice(0, 500) }));
rec.finishedAt = new Date().toISOString();
fs.writeFileSync(path.join(OUT, "chain.json"), JSON.stringify(rec, null, 2));
console.log(`\nFINAL ${cur.identifier} status=${cur.status} comments=${comments.length}`);
for (const c of rec.comments) console.log(`  [${c.author}] ${c.body.slice(0, 200)}`);
await browser.close();
