#!/usr/bin/env node
/**
 * wave220 — Bootstrap the Coolie Ops company shell (production-operations).
 *
 * Just the company; agents are created by `qa-bootstrap-ops.mjs`. Splitting
 * them lets ops roll out the company + skeleton first and add roles later
 * (matches the user's wave220 brief: `qa-bootstrap-ops-team.mjs` = company,
 * `qa-bootstrap-ops.mjs` = 7 ops 员工).
 *
 * Why a second ops company (separate from QA-Test-Workshop)?
 * - QA = 撞机器 / 出报告 / 决策 go/no-go. Runs at release-time, on demand.
 * - Ops = 持续监控 / 自动跑 daily-qa-report / 自动发版 / 自动 OTA. Runs on a
 *   cron / at deploy-time, 24×7. Different lifecycle, different cells.
 * - Separation keeps org chart + responsibility clean: QA is "lab", ops is
 *   "control room".
 *
 * Usage:
 *   node scripts/qa-bootstrap-ops-team.mjs
 *   PAPERCLIP_API_KEY=... node scripts/qa-bootstrap-ops-team.mjs
 */
import process from "node:process";

const API_BASE = process.env.API_BASE ?? "http://localhost:3100";
const TOKEN = process.env.PAPERCLIP_API_KEY;

// `PAPERCLIP_API_KEY` is required on `authenticated` deployments. On
// `local_trusted` the actor middleware grants implicit board access; we
// still pass the header if a token is provided (so the same script works
// against production with a concierge key), but we do not refuse without
// one — wave220 ops scripts are meant to run from the local operator box.
if (!TOKEN) {
  log("start", { apiBase: API_BASE, auth: "local_trusted (no PAPERCLIP_API_KEY)" });
}

const HEADERS = {
  ...(TOKEN ? { "x-paperclip-api-key": TOKEN } : {}),
  "Content-Type": "application/json",
};

function log(stage, payload) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${stage}`, payload ? JSON.stringify(payload) : "");
}

async function api(method, path, body) {
  const url = `${API_BASE}${path}`;
  const opts = { method, headers: { ...HEADERS } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (!res.ok) {
    log("ERR", { method, path, status: res.status, body: json ?? text });
    throw new Error(`${method} ${path} → ${res.status}`);
  }
  return json;
}

const OPS_COMPANY = {
  name: "Coolie-Ops-Control-Room",
  description:
    "Coolie 内部 ops 团队 — 日常监控 + 自动发版 + 自动 OTA + 撞机派活, 让老板只看结论不亲自盯",
  budgetMonthlyCents: 0,
};

async function findCompanyByName(name) {
  const list = await api("GET", "/api/companies");
  return list.find((c) => c.name === name) ?? null;
}

async function main() {
  log("start", { apiBase: API_BASE });
  const health = await api("GET", "/api/health").catch((err) => {
    log("health.fail", { err: String(err) });
    process.exit(3);
  });
  log("health.ok", health);

  const existing = await findCompanyByName(OPS_COMPANY.name);
  if (existing) {
    log("company.exists", { id: existing.id, name: existing.name });
    log("done", {
      companyId: existing.id,
      companyName: existing.name,
      action: "noop",
    });
    return;
  }

  const created = await api("POST", "/api/companies", OPS_COMPANY);
  log("company.created", { id: created.id, name: created.name });
  log("done", {
    companyId: created.id,
    companyName: created.name,
    action: "created",
    next: "node scripts/qa-bootstrap-ops.mjs",
  });
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});