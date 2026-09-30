#!/usr/bin/env node
/**
 * wave221 — Populate the Coolie Ops company with 7 ops 员工 (role-mapping fix).
 *
 * wave220 originally put all 7 ops 员工 on `role: "devops"`. Boss correction:
 * "不加角色, 本体 palantir 有新角色吗" — fork 不加新角色, 7 个 ops 按职能
 * 映射到 Palantir 5 角色. Ops 全部偏 SRE (monitoring / build / release
 * pipeline), 一律 pre-sre. ops-* specialty 走 metadata.
 *
 * Mapping (wave221):
 *   Ops Lead     → pre-sre
 *   Mobile Ops   → pre-sre
 *   iOS Ops      → pre-sre
 *   Web Ops      → pre-sre
 *   Server Ops   → pre-sre
 *   Build Ops    → pre-sre
 *   Release Ops  → pre-sre
 *
 * Idempotent: re-runs do not create duplicates (matches by name within the
 * Coolie-Ops-Control-Room company). Logs every step.
 *
 * Run order: `qa-bootstrap-ops-team.mjs` (company) → `qa-bootstrap-ops.mjs`.
 *
 * Usage:
 *   node scripts/qa-bootstrap-ops.mjs
 *   PAPERCLIP_API_KEY=... node scripts/qa-bootstrap-ops.mjs
 */
import process from "node:process";

const API_BASE = process.env.API_BASE ?? "http://localhost:3100";
const TOKEN = process.env.PAPERCLIP_API_KEY;
const OPS_COMPANY_NAME = process.env.OPS_COMPANY ?? "Coolie-Ops-Control-Room";

// `PAPERCLIP_API_KEY` is required on `authenticated` deployments. On
// `local_trusted` the actor middleware grants implicit board access; we
// still pass the header if a token is provided, but do not refuse without
// one — wave220/221 ops scripts are meant to run from the local operator box.
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

const OPS_AGENTS = [
  {
    name: "Ops Lead",
    role: "pre-sre",
    title: "运营总监 / daily-qa-report 触发 + 4 护栏绿决策",
    capabilities: "scheduling, 4-护栏 gating, hot-fix dispatch, P0/P1/P2 triage",
    specialty: "ops-lead",
    personaNote: "Ops Lead owns daily 08:00 trigger and post-deploy 4-护栏 gate",
  },
  {
    name: "Mobile Ops",
    role: "pre-sre",
    title: "Android 运营 / agent-device AVDs + 30 项 E2E + 撞机报告",
    capabilities: "adb install, agent-device driver, app e2e, deep-link validation",
    specialty: "ops-mobile",
    personaNote: "Mobile Ops drives API 28 (Chromium 66) + API 33 + 34 — Android matrix",
  },
  {
    name: "iOS Ops",
    role: "pre-sre",
    title: "iOS 运营 / iPhone 17 Pro 模拟器 + iOS E2E",
    capabilities: "xcrun simctl, ios-deploy, webkit quirks, app store smoke",
    specialty: "ops-ios",
    personaNote: "iOS Ops installs IPA on iPhone 17 Pro simulator + drives 30 iOS E2E",
  },
  {
    name: "Web Ops",
    role: "pre-sre",
    title: "Web 运营 / agent-browser (Playwright) + 25 端点 smoke + 拖拽",
    capabilities: "playwright cross-browser, websocket replay, accessibility tree, drag-and-drop",
    specialty: "ops-web",
    personaNote: "Web Ops owns Playwright matrix (Chrome / Safari / Firefox) + board UI E2E",
  },
  {
    name: "Server Ops",
    role: "pre-sre",
    title: "服务运营 / 日志 + 端点状态 + 数据库 + 撞机通知",
    capabilities: "log tail, endpoint probe, pglite size, alert routing",
    specialty: "ops-server",
    personaNote: "Server Ops monitors 25 endpoints every 5 min + watches PGlite backup age",
  },
  {
    name: "Build Ops",
    role: "pre-sre",
    title: "构建运营 / 版本 bump + APK build + OTA 发布",
    capabilities: "release-app.sh driver, version.json minting, OTA manifest",
    specialty: "ops-build",
    personaNote: "Build Ops owns clients/expo/version bump → publish-ota sequence",
  },
  {
    name: "Release Ops",
    role: "pre-sre",
    title: "发版运营 / tag + push + TestFlight + 4 护栏验证",
    capabilities: "git tag, gh release, ios-cos upload, 4-护栏 verification",
    specialty: "ops-release",
    personaNote: "Release Ops owns commit → tag → push → TestFlight sequence + 4 护栏",
  },
];

async function findCompanyByName(name) {
  const list = await api("GET", "/api/companies");
  return list.find((c) => c.name === name) ?? null;
}

async function listAgents(companyId) {
  return api("GET", `/api/companies/${companyId}/agents`);
}

async function findAgentByName(companyId, name) {
  const agents = await listAgents(companyId);
  return agents.find((a) => a.name === name) ?? null;
}

async function createAgent(companyId, agentSpec) {
  const payload = {
    name: agentSpec.name,
    role: agentSpec.role,
    title: agentSpec.title,
    capabilities: agentSpec.capabilities,
    adapterType: "process",
    adapterConfig: { command: "echo", args: [`ops:${agentSpec.name}`] },
    budgetMonthlyCents: 0,
    metadata: {
      opsPersonaNote: agentSpec.personaNote,
      opsTeam: "wave220",
      opsSpecialty: agentSpec.specialty,
    },
  };
  return api("POST", `/api/companies/${companyId}/agents`, payload);
}

async function ensureAgent(companyId, agentSpec) {
  const existing = await findAgentByName(companyId, agentSpec.name);
  if (existing) {
    log("agent.exists", { id: existing.id, name: existing.name, role: existing.role });
    return existing;
  }
  const created = await createAgent(companyId, agentSpec);
  log("agent.created", { id: created.id, name: created.name, role: created.role });
  return created;
}

async function main() {
  log("start", { apiBase: API_BASE, opsCompany: OPS_COMPANY_NAME });
  const health = await api("GET", "/api/health").catch((err) => {
    log("health.fail", { err: String(err) });
    process.exit(3);
  });
  log("health.ok", health);

  const company = await findCompanyByName(OPS_COMPANY_NAME);
  if (!company) {
    log("ERR", {
      msg: `Ops company "${OPS_COMPANY_NAME}" not found — run qa-bootstrap-ops-team.mjs first`,
    });
    process.exit(4);
  }
  log("company.found", { id: company.id, name: company.name });

  // wave226 — Boss: "不扩" (don't expand). Coolie-Ops-Control-Room was
  // wave220's bootstrap; that wave was reverted and the 7 ops employees
  // became orphaned. Re-running this script would add MORE agents on top of
  // the already-oversized roster. Refuse unless the boss explicitly sets
  // OPS_ALLOW_BOOTSTRAP=1 to acknowledge the override, OR has manually raised
  // metadata.maxAgents above the existing 7.
  const allowEnv = process.env.OPS_ALLOW_BOOTSTRAP === "1";
  const currentAgents = await listAgents(company.id);
  const companyMax =
    typeof company.metadata?.maxAgents === "number"
      ? company.metadata.maxAgents
      : 6;
  const wouldExceed = currentAgents.length + OPS_AGENTS.length > companyMax;
  log("quota.preflight", {
    current: currentAgents.length,
    requested: OPS_AGENTS.length,
    max: companyMax,
    wouldExceed,
    opsAllowBootstrap: allowEnv,
  });
  if (wouldExceed && !allowEnv) {
    log("ERR", {
      msg: "Ops company agent count would exceed quota — refusing to bootstrap",
      hint: "Boss decision required: either set company.metadata.maxAgents higher, " +
        "or run with OPS_ALLOW_BOOTSTRAP=1 to acknowledge explicit override",
    });
    console.error("FATAL: ops company quota exceeded; refusing to bootstrap");
    process.exit(5);
  }

  const agents = [];
  for (const spec of OPS_AGENTS) {
    const agent = await ensureAgent(company.id, spec);
    agents.push(agent);
  }

  log("done", {
    companyId: company.id,
    companyName: company.name,
    agentCount: agents.length,
    agents: agents.map((a) => ({ id: a.id, name: a.name, role: a.role })),
  });
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
