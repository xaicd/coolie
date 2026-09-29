#!/usr/bin/env node
// wave139 — generic prod issue reader/mutator for the chain.
import { session } from "./prod-wbs.mjs";
const BASE = "https://www.xrobinai.cn/XROA";
const ORIGIN = new URL(BASE).origin;
const H = { Origin: ORIGIN, Referer: `${ORIGIN}/` };
const CID = process.env.CID ?? "4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e";
const ID = process.env.ID ?? await (async () => {
  const IDENT = process.env.IDENT;
  const r = await (await import("./prod-wbs.mjs")).session();
  const rr = await r.page.request.get(`${ORIGIN}/api/companies/${CID}/issues?limit=120`, { headers: H });
  const b = await rr.json();
  const arr = Array.isArray(b) ? b : b.issues ?? [];
  await r.browser.close();
  return (arr.find((i) => i.identifier === IDENT) ?? {}).id;
})();

const { browser, page } = await session();
const J = async (u) => { const r = await page.request.get(`${ORIGIN}${u}`, { headers: H }); return r.ok() ? r.json() : { __error: r.status(), body: (await r.text()).slice(0, 200) }; };

const cur = await J(`/api/issues/${ID}`);
console.log("issue:", JSON.stringify({ id: cur.id, identifier: cur.identifier, status: cur.status, assignee: cur.assigneeAgentId, title: cur.title }).slice(0, 300));
const c = await J(`/api/issues/${ID}/comments`);
const arr = Array.isArray(c) ? c : c.comments ?? [];
console.log("comments:", arr.length);
for (const x of arr) console.log(`  [${String(x.authorAgentId || x.authorUserId || "").slice(0, 8)} ${x.createdAt}] ${String(x.body || x.content || "").slice(0, 400)}`);
const acts = await J(`/api/companies/${cur.companyId}/activity?limit=12`);
const aArr = Array.isArray(acts) ? acts : acts.activity ?? [];
console.log("activity (12):");
for (const a of aArr) console.log(`  ${String(a.createdAt).slice(11, 19)} ${a.action} ${String(a.entityType || "")}:${String(a.entityId || "").slice(0, 8)}`);
await browser.close();
