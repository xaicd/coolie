#!/usr/bin/env node
// wave139 — watch the prod chain leaf issue (correct detail endpoint).
import fs from "node:fs";
import path from "node:path";
import { session } from "./prod-wbs.mjs";

const BASE = process.env.WEB_BASE ?? "https://www.xrobinai.cn/XROA";
const ORIGIN = new URL(BASE).origin;
const CID = process.env.CID ?? "4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e";
const PID = process.env.PID ?? "b0e465c4-3a06-49e6-93cc-e97ca3eebf9f";
const LEAF_ID = process.env.LEAF_ID ?? await (async () => {
  const r = await (await import("./prod-wbs.mjs")).session();
  const rr = await r.page.request.get(`${ORIGIN}/api/companies/${CID}/issues?limit=80`, { headers: { Origin: ORIGIN, Referer: `${ORIGIN}/` } });
  const b = await rr.json();
  const arr = Array.isArray(b) ? b : b.issues ?? [];
  await r.browser.close();
  const hit = arr.find((i) => i.identifier === "XROA-168") ?? arr.find((i) => i.projectId === PID && !i.isMilestone);
  return hit?.id;
})();
const OUT = path.resolve("docs-coolie/evidence/wave139/prod");
fs.mkdirSync(OUT, { recursive: true });

const { browser, page } = await session();
const H = { Origin: ORIGIN, Referer: `${ORIGIN}/` };
const J = async (u) => { const r = await page.request.get(`${ORIGIN}${u}`, { headers: H }); return r.ok() ? r.json() : { __error: r.status() }; };

const runs = await J(`/api/companies/${CID}/heartbeat-runs?limit=6`);
console.log("recent runs:", JSON.stringify((Array.isArray(runs) ? runs : runs.runs ?? []).slice(0, 5).map((r) => ({ id: String(r.id).slice(0, 8), status: r.status, agent: String(r.agentId).slice(0, 8), at: r.startedAt }))));

const deadline = Date.now() + 8 * 60_000;
let cur = {}, comments = [], lastSig = "";
while (Date.now() < deadline) {
  cur = await J(`/api/issues/${LEAF_ID}`);
  const c = await J(`/api/issues/${LEAF_ID}/comments`);
  comments = Array.isArray(c) ? c : c.comments ?? [];
  const sig = `${cur.status}|${comments.length}`;
  if (sig !== lastSig) { console.log(`  ${new Date().toISOString()} ${cur.identifier} status=${cur.status} assignee=${String(cur.assigneeAgentId || "-").slice(0, 8)} comments=${comments.length}`); lastSig = sig; }
  if (["done", "in_review", "blocked"].includes(cur.status) && comments.length > 0) break;
  await page.waitForTimeout(12_000);
}

const rec = {
  base: BASE, projectId: PID, issueId: LEAF_ID, identifier: cur.identifier, finalStatus: cur.status,
  assigneeAgentId: cur.assigneeAgentId, commentCount: comments.length,
  comments: comments.slice(-5).map((c) => ({ author: String(c.authorAgentId || c.authorUserId || "").slice(0, 8), createdAt: c.createdAt, body: String(c.body || c.content || "").slice(0, 600) })),
  recentRuns: (Array.isArray(runs) ? runs : runs.runs ?? []).slice(0, 6).map((r) => ({ id: r.id, status: r.status, agentId: r.agentId, startedAt: r.startedAt, finishedAt: r.finishedAt, error: r.error ?? r.lastError ?? null })),
  at: new Date().toISOString(),
};
fs.writeFileSync(path.join(OUT, "chain-watch.json"), JSON.stringify(rec, null, 2));
console.log(`\nFINAL ${cur.identifier} status=${cur.status} comments=${comments.length}`);
for (const c of rec.comments) console.log(`  [${c.author} ${c.createdAt}] ${c.body.slice(0, 220)}`);
await browser.close();
