#!/usr/bin/env node
// wave139 — drive the back half of the chain on the LOCAL dev instance:
//   派发 (assign) → 员工交付 (agent run) → 回写 (comment/artifact) → done.
// Local_trusted board: mutations need no origin. Prints a polling trail.
import fs from "node:fs";
import path from "node:path";

const API = process.env.API ?? "http://localhost:3100";
const CID = process.env.CID ?? "b1d6850c-02a4-41cc-a716-67797fe2b494";
const AID = process.env.AID ?? "bb7cdfc0-2e9a-4bd0-bd9d-449822c784a0"; // core-swe-agent
const PID = process.env.PID ?? "a10daa9d-efd6-40ce-a9ba-d8ed8943f485"; // wave129-repro-norepo (has workspace)
const OUT = path.resolve("docs-coolie/evidence/wave139");
fs.mkdirSync(OUT, { recursive: true });

const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return { raw: t.slice(0, 300) }; } };
const get = (u) => fetch(`${API}${u}`).then(j);
const post = (u, b) => fetch(`${API}${u}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b ?? {}) }).then(j);

const trail = [];
const log = (m) => { console.log(m); trail.push(`[${new Date().toISOString()}] ${m}`); };

// 1. 派发 — create a task and assign the real employee.
const title = `wave139 全链路复测 · 交付一个自检说明 ${Date.now().toString().slice(-6)}`;
const issue = await post(`/api/companies/${CID}/issues`, {
  projectId: PID,
  title,
  description: "请在当前工作目录创建文件 wave139-delivery.txt，写入一行中文说明：'wave139 员工交付自检通过'。完成后把结论回写到本任务评论，并把状态置为 done。",
  status: "todo",
  priority: "medium",
  assigneeAgentId: AID,
});
const iid = issue.id ?? issue.issue?.id;
log(`派发: issue ${issue.identifier ?? iid} created, assignee=${AID.slice(0, 8)} → ${issue.assigneeAgentId ? "set" : "?"}`);
if (!iid) { console.log(JSON.stringify(issue).slice(0, 500)); process.exit(1); }

// 2. wake the employee
const wake = await post(`/api/agents/${AID}/wakeup`, { source: "assignment", triggerDetail: "manual", reason: "wave139 全链路复测" });
log(`唤醒: ${JSON.stringify(wake).slice(0, 200)}`);

// 3. poll 员工交付 / 回写 / done
let final = null;
const deadline = Date.now() + 8 * 60_000;
let last = "";
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 10_000));
  const cur = await get(`/api/companies/${CID}/issues/${iid}`);
  const comments = await get(`/api/issues/${iid}/comments`).catch(() => []);
  const cArr = Array.isArray(comments) ? comments : comments.comments ?? [];
  const sig = `${cur.status}|${cArr.length}`;
  if (sig !== last) { log(`  poll status=${cur.status} comments=${cArr.length}`); last = sig; }
  if (cur.status === "done" || cur.status === "in_review" || cur.status === "blocked") { final = cur; break; }
}
const cur = final ?? (await get(`/api/companies/${CID}/issues/${iid}`));
const comments = await get(`/api/issues/${iid}/comments`).catch(() => []);
const cArr = Array.isArray(comments) ? comments : comments.comments ?? [];
const runs = await get(`/api/companies/${CID}/heartbeat-runs?limit=5`);

const rec = {
  api: API, companyId: CID, agentId: AID, projectId: PID, issueId: iid, identifier: cur.identifier,
  issue: { title: cur.title, status: cur.status, assigneeAgentId: cur.assigneeAgentId },
  commentCount: cArr.length,
  comments: cArr.slice(-4).map((c) => ({ author: c.authorAgentId || c.authorUserId || c.userId, body: String(c.body ?? c.content ?? "").slice(0, 400) })),
  recentRuns: (Array.isArray(runs) ? runs : runs.runs ?? []).slice(0, 5).map((r) => ({ id: r.id, status: r.status, agentId: r.agentId, error: r.error ?? r.lastError ?? null })),
  trail,
};
fs.writeFileSync(path.join(OUT, "local-chain.json"), JSON.stringify(rec, null, 2));
log(`\nFINAL issue ${cur.identifier} status=${cur.status} comments=${cArr.length}`);
for (const c of rec.comments) log(`   comment[${String(c.author).slice(0,8)}]: ${c.body.slice(0, 160)}`);
log(`runs: ${JSON.stringify(rec.recentRuns)}`);
