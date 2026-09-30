#!/usr/bin/env node
/**
 * wave217 — Direct API smoke for the 25 endpoints the QA Web Tester covers.
 *
 * Runs WITHOUT Playwright: hits every endpoint as a board actor (the local
 * PAPERCLIP_API_KEY) and prints a pass/fail line per probe. Exits non-zero
 * if any unexpected failure occurs.
 *
 * Why not Playwright? The existing e2e suite requires a Better Auth browser
 * session + the production xrobinai.cn deployment. This script is the QA
 * team's local CI: hit localhost with the board actor token, prove the
 * surface is up, report. It is intentionally Playwright-free.
 *
 * Usage:
 *   node scripts/qa-api-smoke-25.mjs
 *   PAPERCLIP_API_KEY=... node scripts/qa-api-smoke-25.mjs
 *   API_BASE=http://127.0.0.1:3100 node scripts/qa-api-smoke-25.mjs
 *   E2E_COMPANY=QA-Test-Workshop node scripts/qa-api-smoke-25.mjs
 */
import process from "node:process";

const API_BASE = process.env.API_BASE ?? "http://localhost:3100";
const TOKEN = process.env.PAPERCLIP_API_KEY;
const COMPANY_HINT = process.env.E2E_COMPANY ?? "QA-Test-Workshop";

if (!TOKEN) {
  console.error("PAPERCLIP_API_KEY is required (board actor token).");
  process.exit(2);
}

const HEADERS = { "x-paperclip-api-key": TOKEN };

async function api(method, path, body) {
  const url = `${API_BASE}${path}`;
  const opts = { method, headers: { ...HEADERS } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  return { status: res.status, ok: res.ok, body: parsed };
}

async function resolveCompanyId() {
  const list = await api("GET", "/api/companies?scope=accessible");
  if (!list.ok || !Array.isArray(list.body)) {
    throw new Error(`GET /api/companies → ${list.status}`);
  }
  const match =
    list.body.find((c) => c.name === COMPANY_HINT) ??
    list.body.find((c) => c.issuePrefix === COMPANY_HINT) ??
    list.body[0];
  if (!match) throw new Error(`No accessible company matched "${COMPANY_HINT}"`);
  return match.id;
}

const PROBES = [
  ["GET", "/api/health", false],
  ["GET", "/api/companies?scope=accessible", false],
  ["GET", "/api/companies/templates", false],
  ["GET", "/api/companies/stats", false],
  ["GET", "/api/companies/:companyId", true],
  ["GET", "/api/companies/:companyId/agents", true],
  ["GET", "/api/companies/:companyId/org", false],
  ["GET", "/api/companies/:companyId/dashboard", true],
  ["GET", "/api/companies/:companyId/dispatch", false, true], // POST-only stub
  ["GET", "/api/companies/:companyId/quotas", true],
  ["GET", "/api/companies/:companyId/usage", false],
  ["GET", "/api/companies/:companyId/work-products", true],
  ["GET", "/api/companies/:companyId/sandboxes", true],
  ["GET", "/api/companies/:companyId/cycle-time", true],
  ["GET", "/api/companies/:companyId/metrics/overview", true],
  ["GET", "/api/companies/:companyId/defect-kb", false],
  ["GET", "/api/companies/:companyId/ontology/graph?root_type=company&root_id=:companyId", true],
  ["GET", "/api/companies/:companyId/audit-log", false],
  ["GET", "/api/companies/:companyId/board/conversations", true],
  ["GET", "/api/companies/:companyId/specs/tree", false],
  ["GET", "/api/companies/:companyId/issue-specs", true],
  ["GET", "/api/companies/:companyId/milestones", true],
  ["GET", "/api/companies/:companyId/issues", true],
  ["GET", "/api/companies/:companyId/projects", true],
  ["GET", "/api/companies/:companyId/goals", true],
];

const LABELS = [
  "GET /api/health",
  "GET /api/companies",
  "GET /api/companies/templates",
  "GET /api/companies/stats",
  "GET /companies/:cid",
  "GET /companies/:cid/agents",
  "GET /companies/:cid/org",
  "GET /companies/:cid/dashboard",
  "GET /companies/:cid/dispatch",
  "GET /companies/:cid/quotas",
  "GET /companies/:cid/usage",
  "GET /companies/:cid/work-products",
  "GET /companies/:cid/sandboxes",
  "GET /companies/:cid/cycle-time",
  "GET /companies/:cid/metrics/overview",
  "GET /companies/:cid/defect-kb",
  "GET /companies/:cid/ontology/graph",
  "GET /companies/:cid/audit-log",
  "GET /companies/:cid/board/conversations",
  "GET /companies/:cid/specs/tree",
  "GET /companies/:cid/issue-specs",
  "GET /companies/:cid/milestones",
  "GET /companies/:cid/issues",
  "GET /companies/:cid/projects",
  "GET /companies/:cid/goals",
];

async function main() {
  const cid = await resolveCompanyId();
  console.log(`# QA Web Tester — 25 endpoints @ ${API_BASE}`);
  console.log(`# company: ${COMPANY_HINT} (${cid})`);
  console.log("");

  let pass = 0;
  let fail = 0;
  const failures = [];

  for (let i = 0; i < PROBES.length; i++) {
    const [method, pathTemplate, expectJson, stub] = PROBES[i];
    const label = LABELS[i];
    const path = pathTemplate.replaceAll(":companyId", cid);
    const t0 = Date.now();
    let result;
    try {
      result = await api(method, path);
    } catch (err) {
      result = { status: 0, ok: false, body: String(err) };
    }
    const ms = Date.now() - t0;

    const acceptable =
      result.ok
      || result.status === 405
      || (stub && result.status === 404);

    if (!acceptable || (expectJson && result.body == null)) {
      fail += 1;
      failures.push({ label, status: result.status, body: result.body });
      console.log(`✗ ${result.status.toString().padEnd(3)} ${ms.toString().padStart(4)}ms  ${label}`);
    } else {
      pass += 1;
      console.log(`✓ ${result.status.toString().padEnd(3)} ${ms.toString().padStart(4)}ms  ${label}`);
    }
  }

  console.log("");
  console.log(`# Result: ${pass}/${PROBES.length} green, ${fail} red`);
  if (failures.length > 0) {
    console.log("# Failures:");
    for (const f of failures) console.log("  -", f.label, "→", f.status, JSON.stringify(f.body ?? "").slice(0, 200));
  }
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});