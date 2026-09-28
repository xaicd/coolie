#!/usr/bin/env node
// wave135 — truth-check the workshop attachment count for a company via the
// authenticated web session. Read-only.
import pw from "/opt/homebrew/lib/node_modules/playwright/index.js";
import fs from "node:fs";
const { chromium } = pw;

const BASE = process.env.WEB_BASE ?? "https://www.xrobinai.cn/XROA";
const ORIGIN = new URL(BASE).origin;
const STATE = process.env.WEB_STATE ?? "/tmp/ad-wave135/web-state.json";
const COMPANY_NAME = process.env.WAVE135_COMPANY ?? "prod-smoke-1789989524";

const main = async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ storageState: fs.existsSync(STATE) ? STATE : undefined, locale: "zh-CN" });
  const page = await ctx.newPage();
  await page.goto(`${ORIGIN}/XROA/projects`, { waitUntil: "networkidle", timeout: 60000 });

  const out = await page.evaluate(async ({ origin, companyName }) => {
    const j = async (u) => { const r = await fetch(origin + u, { credentials: "include" }); const b = await r.json().catch(() => null); return { status: r.status, body: b }; };
    const companies = (await j("/api/companies")).body?.companies ?? (await j("/api/companies")).body ?? [];
    const company = companies.find((c) => c.name === companyName) ?? companies.find((c) => (c.name || "").includes(companyName));
    if (!company) return { error: "company not found", companies: companies.map((c) => c.name) };
    const issues = (await j(`/api/companies/${company.id}/issues?limit=100`)).body;
    const list = Array.isArray(issues) ? issues : (issues?.issues ?? []);
    const board = list.find((i) => i.title === "Board Operations");
    if (!board) return { company: company.name, issueFound: false };
    const attsRes = await j(`/api/issues/${board.id}/attachments`);
    const atts = attsRes.body;
    const attachments = Array.isArray(atts) ? atts : (atts?.attachments ?? []);
    const reqDocx = attachments.filter((a) => String(a.originalFilename ?? a.filename ?? "").includes("req"));
    return {
      company: company.name,
      companyId: company.id,
      issueId: board.id,
      totalAttachments: attachments.length,
      reqDocxCount: reqDocx.length,
      reqDocx: reqDocx.map((a) => ({ id: a.id, name: a.originalFilename ?? a.filename, size: a.byteSize, comment: a.issueCommentId ?? null })),
      recent: attachments.slice(-5).map((a) => ({ name: a.originalFilename ?? a.filename, size: a.byteSize, at: a.createdAt ?? null })),
    };
  }, { origin: ORIGIN, companyName: COMPANY_NAME });

  console.log(JSON.stringify(out, null, 2));
  await browser.close();
};
main().catch((e) => { console.error(e); process.exit(1); });
