#!/usr/bin/env node
// wave139 — activate the leaf (backlog → todo) then re-wake, and watch the delivery.
import fs from "node:fs";
import path from "node:path";
import { session } from "./prod-wbs.mjs";

const BASE = process.env.WEB_BASE ?? "https://www.xrobinai.cn/XROA";
const ORIGIN = new URL(BASE).origin;
const CID = process.env.CID ?? "4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e";
const PID = process.env.PID ?? "b0e465c4-3a06-49e6-93cc-e97ca3eebf9f";
const IDENT = process.env.IDENT ?? "XROA-168";
const OUT = path.resolve("docs-coolie/evidence/wave139/prod");
fs.mkdirSync(OUT, { recursive: true });

const { browser, page } = await session();
const H = { Origin: ORIGIN, Referer: `${ORIGIN}/` };
const J = async (u) => { const r = await page.request.get(`${ORIGIN}${u}`, { headers: H }); return r.ok() ? r.json() : { __error: r.status() }; };

const issues = await J(`/api/companies/${CID}/issues?limit=120`);
const arr = Array.isArray(issues) ? issues : issues.issues ?? [];
const leaf = arr.find((i) => i.identifier === IDENT);
if (!leaf) throw new Error(`issue ${IDENT} not found`);
const AID = leaf.assigneeAgentId;
console.log(`leaf ${leaf.identifier} id=${leaf.id} status=${leaf.status} assignee=${String(AID).slice(0, 8)}`);

// activate
const p = await page.request.patch(`${ORIGIN}/api/issues/${leaf.id}`, { headers: H, data: { status: "todo" } });
console.log("activate →", p.status());
const wake = await page.request.post(`${ORIGIN}/api/agents/${AID}/wakeup`, { headers: H, data: { source: "assignment", triggerDetail: "manual", reason: "wave139 全链路末段复测(激活后)" } });
console.log("wake →", wake.status(), JSON.stringify(await wake.json()).slice(0, 160));

const deadline = Date.now() + 8 * 60_000;
let cur = leaf, comments = [], lastSig = "";
while (Date.now() < deadline) {
  await page.waitForTimeout(12_000);
  cur = await J(`/api/issues/${leaf.id}`);
  const c = await J(`/api/issues/${leaf.id}/comments`);
  comments = Array.isArray(c) ? c : c.comments ?? [];
  const sig = `${cur.status}|${comments.length}`;
  if (sig !== lastSig) { console.log(`  ${new Date().toISOString().slice(11, 19)} status=${cur.status} comments=${comments.length}`); lastSig = sig; }
  if (["done", "in_review", "blocked"].includes(cur.status) && comments.length > 0) break;
}

const runs = await J(`/api/companies/${CID}/heartbeat-runs?limit=6`);
const rec = {
  identifier: cur.identifier, issueId: leaf.id, finalStatus: cur.status, commentCount: comments.length,
  comments: comments.slice(-5).map((c) => ({ author: String(c.authorAgentId || c.authorUserId || "").slice(0, 8), at: c.createdAt, body: String(c.body || c.content || "").slice(0, 700) })),
  recentRuns: (Array.isArray(runs) ? runs : runs.runs ?? []).slice(0, 5).map((r) => ({ id: r.id, status: r.status, agentId: r.agentId, startedAt: r.startedAt, finishedAt: r.finishedAt, error: r.error ?? r.lastError ?? null })),
  at: new Date().toISOString(),
};
fs.writeFileSync(path.join(OUT, "chain-2.json"), JSON.stringify(rec, null, 2));
console.log(`\nFINAL ${cur.identifier} status=${cur.status} comments=${comments.length}`);
for (const c of rec.comments) console.log(`  [${c.author} ${c.at}] ${c.body.slice(0, 260)}`);
console.log("runs:", JSON.stringify(rec.recentRuns.map((r) => `${r.id.slice(0, 8)}/${r.status}`)));
await browser.close();
