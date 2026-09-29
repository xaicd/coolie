#!/usr/bin/env node
import { session } from "./prod-wbs.mjs";

const BASE = "https://www.xrobinai.cn/XROA";
const ORIGIN = new URL(BASE).origin;
const CID = "4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e";

const { browser, page } = await session();
const H = { Origin: ORIGIN, Referer: `${ORIGIN}/` };
const J = async (u) => { const r = await page.request.get(`${ORIGIN}${u}`, { headers: H }); return r.ok() ? r.json() : { error: r.status() }; };

const runs = await J(`/api/companies/${CID}/heartbeat-runs?limit=12`);
const arr = Array.isArray(runs) ? runs : runs.runs ?? runs.heartbeatRuns ?? [];
console.log("=== recent runs ===", arr.length);
for (const r of arr) console.log(` ${String(r.id).slice(0, 8)} [${r.status}] agent=${String(r.agentId || "").slice(0, 8)} issue=${r.issueIdentifier || String(r.issueId || "").slice(0, 8)} ${String(r.startedAt || "").slice(0, 19)} err=${String(r.error || r.lastError || "").slice(0, 50)}`);

// a recently done issue's writeback
for (const key of ["cis-", "XROA-", "PROA-"]) {
  const r = await J(`/api/companies/${CID}/issues?limit=40&status=done`);
  const list = Array.isArray(r) ? r : r.issues ?? [];
  const done = list[0];
  if (done) {
    console.log(`=== sample done issue ${done.identifier} `, done.title);
    const c = await J(`/api/issues/${done.id}/comments`);
    const carr = Array.isArray(c) ? c : c.comments ?? [];
    console.log(" comments:", carr.length);
    for (const x of carr.slice(-3)) console.log(`   [${String(x.authorAgentId || x.authorUserId || "").slice(0, 8)}] ${String(x.body || x.content || "").slice(0, 180)}`);
    break;
  }
}
await browser.close();
