#!/usr/bin/env node
// wave129 (retry) — READ-ONLY ground truth via the real signed-in browser session.
// This is the "API 真值" the QA report compares the UI against. No mutations.
import { openAuthed, ORIGIN } from "./lib.mjs";
import fs from "node:fs";

const CID = process.env.CID ?? "4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e";
const OUT = "/tmp/ad-wave129/truth.json";

const main = async () => {
  const { browser, page } = await openAuthed();
  await page.goto(`${ORIGIN}/XROA/projects`, { waitUntil: "networkidle", timeout: 60000 });
  const data = await page.evaluate(async (cid) => {
    const j = async (u) => { const r = await fetch(u, { credentials: "include" }); return { status: r.status, body: await r.json().catch(() => null) }; };
    const projects = await j(`/api/companies/${cid}/projects`);
    const issues = await j(`/api/companies/${cid}/issues`);
    const agents = await j(`/api/companies/${cid}/agents`);
    return { projects, issues, agents };
  }, CID);

  const proj = (data.projects.body ?? []).map((p) => ({ id: p.id, name: p.name, status: p.status, desc: p.description ?? null, goals: p.goals ?? p.goalIds ?? null, taskCount: p.taskCount ?? null }));
  const iss = (data.issues.body ?? []).map((i) => ({ identifier: i.identifier, title: i.title, projectId: i.projectId, assigneeAgentId: i.assigneeAgentId, responsibleUserId: i.responsibleUserId, status: i.status }));
  const ag = (data.agents.body ?? []).map((a) => ({ id: a.id, name: a.name, role: a.role, status: a.status }));

  const mine = iss.filter((i) => (i.title || "").includes("wave129") || (i.title || "").includes("拆解交付流水线"));
  console.log("PROJECTS http:", data.projects.status);
  console.log(JSON.stringify(proj, null, 1));
  console.log("\nCORE-SWE-AGENT:", JSON.stringify(ag.filter((a) => /core-swe/.test(a.name))));
  console.log("\nWAVE129 ISSUES:", JSON.stringify(mine, null, 1));
  console.log("\nISSUES total:", iss.length);
  fs.writeFileSync(OUT, JSON.stringify({ proj, iss, ag, wave129: mine }, null, 2));
  console.log("truth →", OUT);
  await browser.close();
};
main().catch((e) => { console.error(e); process.exit(1); });
