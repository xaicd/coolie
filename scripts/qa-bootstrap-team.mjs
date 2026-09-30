#!/usr/bin/env node
/**
 * wave221 — Bootstrap the Coolie QA test team (role-mapping fix).
 *
 * wave217 originally put all 6 QA 员工 on `role: "qa"`. Boss correction:
 * "不加角色, 本体 palantir 有新角色吗" — Palantir ontology has 5 roles
 * (fda / core-swe / pre-sre / fdse / ds) and we should not be adding new
 * roles in fork. Each QA 员工 gets mapped to the closest Palantir 5 role by
 * function; the qa-* specialty lives in metadata (so the org chart still
 * distinguishes QA Lead from Mobile Tester from iOS Tester …).
 *
 * Mapping (wave221):
 *   QA Lead           → fdse     (test reporting, go/no-go tooling)
 *   Mobile Tester     → core-swe (android emulator + e2e scripts)
 *   iOS Tester        → core-swe (xcode device + e2e scripts)
 *   Web Tester        → core-swe (playwright + api smoke driver)
 *   Performance Tester→ pre-sre  (lighthouse, perf trace, regression)
 *   Accessibility     → fdse     (axe-core, voiceover, contrast audit)
 *
 * Idempotent: re-runs do not create duplicates (matches by name within the
 * QA company). Logs every step.
 *
 * Usage:
 *   node scripts/qa-bootstrap-team.mjs
 *   API_BASE=http://127.0.0.1:3100 node scripts/qa-bootstrap-team.mjs
 *   PAPERCLIP_API_KEY=... node scripts/qa-bootstrap-team.mjs
 */
import process from "node:process";

const API_BASE = process.env.API_BASE ?? "http://localhost:3100";
const TOKEN = process.env.PAPERCLIP_API_KEY;

// `PAPERCLIP_API_KEY` is required on `authenticated` deployments. On
// `local_trusted` the actor middleware grants implicit board access; we
// still pass the header if a token is provided, but do not refuse without
// one — this script is meant to run from the local operator box as well as
// from a concierge on production.
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

const QA_COMPANY = {
  name: "QA-Test-Workshop",
  description:
    "Coolie 内部 QA 测试团队 — 装新版本, 跑真值实验, 出测试报告, 让老板只看结论不撞真机",
  budgetMonthlyCents: 0,
};

/**
 * QA 员工按职能映射到 Palantir 5 角色之一 — qa-* specialty 走 metadata.
 * Adapter: `process` + echo — 这些员工是 org-chart entry; 实际 checklist 由
 * `qa-run-daily.mjs` / `qa-run-release.mjs` 跑, 不靠 LLM. 这样 bootstrap 不
 * 要 Claude/Codex key, 启动确定性高.
 */
const QA_AGENTS = [
  {
    name: "QA Lead",
    role: "fdse",
    title: "测试负责人 / E2E 编写 + 报告产出",
    capabilities: "end-to-end testing, test reporting, bug triage, regression gating",
    specialty: "qa-lead",
    personaNote: "QA Lead owns the daily-qa-report and qa-wave-* artefacts",
  },
  {
    name: "Mobile Tester",
    role: "core-swe",
    title: "移动端真机 + 模拟器 (Android API 28/34, Samsung, iPhone)",
    capabilities: "android emulator, ios device farms, app e2e, deep-link/OTA validation",
    specialty: "qa-mobile",
    personaNote: "Mobile Tester drives API 28 (Chromium 66) + API 34 (Chromium 120)",
  },
  {
    name: "iOS Tester",
    role: "core-swe",
    title: "iOS 真机验真 (iPhone 14/15, iOS 17/18)",
    capabilities: "ios xcode device testing, webkit quirks, app store build smoke",
    specialty: "qa-ios",
    personaNote: "iOS Tester runs the iOS-specific deep links + OTA paths",
  },
  {
    name: "Web Tester",
    role: "core-swe",
    title: "Web 端到端 (Chromium / WebKit / Firefox)",
    capabilities: "playwright cross-browser, accessibility tree, websocket replay",
    specialty: "qa-web",
    personaNote: "Web Tester owns the 25-endpoint api-smoke + the board UI E2E suite",
  },
  {
    name: "Performance Tester",
    role: "pre-sre",
    title: "性能 (启动 / 滚动 FPS / 内存峰值 / OTA 包大小)",
    capabilities: "lighthouse, perf trace, bundle size budget, regression detection",
    specialty: "qa-perf",
    personaNote: "Performance Tester guards the 1.5s cold-start + 250MB RAM budgets",
  },
  {
    name: "Accessibility Tester",
    role: "fdse",
    title: "a11y (WCAG 2.1 AA / 屏幕阅读器 / 键盘导航 / 颜色对比)",
    capabilities: "axe-core, voiceover, NVDA, contrast audit, focus order",
    specialty: "qa-a11y",
    personaNote: "Accessibility Tester runs axe on every shipped screen",
  },
];

async function findCompanyByName(name) {
  const list = await api("GET", "/api/companies");
  return list.find((c) => c.name === name) ?? null;
}

async function ensureCompany() {
  const existing = await findCompanyByName(QA_COMPANY.name);
  if (existing) {
    log("company.exists", { id: existing.id, name: existing.name });
    return existing;
  }
  const created = await api("POST", "/api/companies", QA_COMPANY);
  log("company.created", { id: created.id, name: created.name });
  return created;
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
    adapterConfig: { command: "echo", args: [`qa:${agentSpec.name}`] },
    budgetMonthlyCents: 0,
    metadata: { qaPersonaNote: agentSpec.personaNote, qaTeam: "wave217", qaSpecialty: agentSpec.specialty },
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
  log("start", { apiBase: API_BASE });
  const health = await api("GET", "/api/health").catch((err) => {
    log("health.fail", { err: String(err) });
    process.exit(3);
  });
  log("health.ok", health);

  const company = await ensureCompany();
  const agents = [];
  for (const spec of QA_AGENTS) {
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
