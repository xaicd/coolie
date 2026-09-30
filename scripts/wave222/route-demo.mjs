#!/usr/bin/env node
// wave222 — demo: 用 5 角色映射算法给一个真实任务派活.
//
// 演示流程:
//   1. 用 ROLE_MAPPING (在 server/src/services/agent-assign.ts) 算 Phase 1 任务 "1.4 选型研判 (DAR)"
//      应派给 fda (主) + ds (副).
//   2. 在公司里查找 role=fda 的 active 数字员工 (默认 fda-agent) 作为主派.
//   3. 在公司里查找 role=ds 的 active 数字员工作为副派.
//   4. 建一个 Phase 1 issue 标题 "1.4 选型研判 (DAR)" → PATCH assigneeAgentId = fda-agent 的 id.
//   5. 读回, 验证派活落库正确.
//
// Usage:
//   API=http://localhost:3100 CID=<companyId> [KEY=<board_key>] [APPLY=1] \
//     [ISSUE_TITLE="1.4 选型研判 (DAR)"] \
//     node scripts/wave222/route-demo.mjs
//
// KEY 可省 — local_trusted 模式下 session 自动为 local-board 提权.
// APPLY=1 才落库; 落库后会立刻 GET 回读对账.

const API = (process.env.API ?? "http://localhost:3100").replace(/\/$/, "");
// All Paperclip routes live under /api; strip a stray /api on API= so callers can pass either.
const apiRoot = API.endsWith("/api") ? API : `${API}/api`;
const CID = process.env.CID;
const KEY = process.env.KEY ?? "";
const APPLY = process.env.APPLY === "1";
const ISSUE_TITLE = process.env.ISSUE_TITLE ?? "1.4 选型研判 (DAR)";

if (!CID) {
  console.error("usage: API= CID= [KEY=] [APPLY=1] [ISSUE_TITLE='1.4 选型研判 (DAR)'] node route-demo.mjs");
  process.exit(2);
}

const PHASE = "phase_1_initiation";
const TASK = "p1_dar_selection";

// === ROLE_MAPPING (mirrors server/src/services/agent-assign.ts) ===
const ROLE_MAPPING = {
  [`${PHASE}:${TASK}`]: { phase: PHASE, task: TASK, primary: "fda", secondary: "ds" },
};

// === HTTP helper ===
async function api(path, init = {}) {
  const headers = {
    Accept: "application/json",
    // Default Node User-Agent triggers Vite dev-middleware HTML fallback
    // (the dev server catches any 404 from /api/* and serves the SPA shell).
    // curl-style UA bypasses it and hits the real API.
    "User-Agent": "curl/8.0",
    ...(init.headers ?? {}),
  };
  if (init.body) headers["content-type"] = "application/json";
  if (KEY) {
    headers["x-paperclip-api-key"] = KEY;
    headers.Authorization = `Bearer ${KEY}`;
  }
  const res = await fetch(`${apiRoot}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status} ${body}`);
  }
  return res.json();
}

// === Step 1: 查 ROLE_MAPPING ===
const binding = ROLE_MAPPING[`${PHASE}:${TASK}`];
if (!binding) {
  console.error("ROLE_MAPPING missing — implementation drift");
  process.exit(3);
}
console.log("[1] ROLE_MAPPING hit:");
console.log(`    phase=${binding.phase} task=${binding.task} primary=${binding.primary} secondary=${binding.secondary}`);

// === Step 2: 列公司所有数字员工 ===
const agents = await api(`/companies/${CID}/agents`);
const list = Array.isArray(agents) ? agents : agents.agents ?? agents.items ?? [];
console.log(`[2] company has ${list.length} agents:`);
for (const a of list) {
  console.log(`    - ${a.name ?? a.id} role=${a.role} status=${a.status}`);
}

// === Step 3: 桶内查找主 + 副 ===
function pickByRole(role) {
  // Prefer active, then idle, then anything. Same algorithm as resolveCandidateAgents.
  const active = list.filter((a) => a.role === role && a.status === "active");
  if (active.length > 0) return { agent: active[0], bucket: "active" };
  const idle = list.filter((a) => a.role === role && a.status === "idle");
  if (idle.length > 0) return { agent: idle[0], bucket: "idle" };
  const any = list.filter((a) => a.role === role);
  if (any.length > 0) return { agent: any[0], bucket: "fallback" };
  return { agent: null, bucket: "empty" };
}

const primaryPick = pickByRole(binding.primary);
const secondaryPick = pickByRole(binding.secondary);

console.log(`[3] role buckets:`);
console.log(`    primary  role=${binding.primary} -> ${primaryPick.agent ? `${primaryPick.agent.name} (${primaryPick.bucket})` : "(empty)"}`);
console.log(`    secondary role=${binding.secondary} -> ${secondaryPick.agent ? `${secondaryPick.agent.name} (${secondaryPick.bucket})` : "(empty)"}`);

if (!primaryPick.agent) {
  console.error(`!! no agent with role=${binding.primary} in company ${CID}. demo cannot proceed.`);
  process.exit(4);
}

// === Step 4: 落库 (干跑 / 真跑) ===
const createBody = {
  title: ISSUE_TITLE,
  description:
    `wave222 demo: ROLE_MAPPING 派活. ${PHASE}/${TASK} primary=${binding.primary} secondary=${binding.secondary}. ` +
    `dry-run=${!APPLY}.`,
  priority: "medium",
  status: "backlog",
  assigneeAgentId: primaryPick.agent.id,
};

console.log(`[4] ${APPLY ? "APPLY" : "DRY-RUN"} — POST /companies/${CID}/issues`);
console.log(`    payload: ${JSON.stringify(createBody)}`);

let createdId = null;
if (APPLY) {
  const created = await api(`/companies/${CID}/issues`, {
    method: "POST",
    body: JSON.stringify(createBody),
  });
  createdId = created.id ?? created.issue?.id ?? null;
  console.log(`    created id=${createdId}`);
} else {
  console.log(`    (skipped — set APPLY=1 to write)`);
}

// === Step 5: 回读对账 (only when APPLY) ===
if (APPLY && createdId) {
  const back = await api(`/issues/${createdId}`);
  const title = back.title ?? back.issue?.title;
  const assigneeId = back.assigneeAgentId ?? back.issue?.assigneeAgentId;
  const ok = title === ISSUE_TITLE && assigneeId === primaryPick.agent.id;
  console.log(`[5] readback:`);
  console.log(`    title=${JSON.stringify(title)}`);
  console.log(`    assigneeAgentId=${assigneeId}`);
  console.log(`    role=${back.assigneeRole ?? back.issue?.assigneeRole ?? "(not returned)"}`);
  console.log(`    verification=${ok ? "PASS" : "FAIL"}`);
  if (!ok) process.exit(5);
}

console.log(`\n${APPLY ? "demo (applied)" : "demo (dry-run)"} complete.`);