#!/usr/bin/env node
// wave223 — demo: 用 6 员工 (TEAM_MAPPING) 派活算法给一个真实任务派活.
//
// 演示流程:
//   1. 用 TEAM_MAPPING (在 server/src/services/agent-assign.ts) 算 Phase 1 任务 "1.4 选型研判 (DAR)"
//      应派给 墨斗 (主) + 铁匠 (副).
//   2. 同时打印 ROLE_MAPPING (wave222 算法层) 派的 5 角色 — fda (主) + ds (副) — 演示 5 角色层
//      与 6 员工层的并行关系.
//   3. 列公司所有数字员工, 看角色桶里的具体员工.
//   4. 干跑 / 真跑 (APPLY=1) 创建一条 demo issue, 标题 "1.4 选型研判 (DAR)", assigneeAgentId
//      用 ROLE_MAPPING 给的 5 角色桶里挑的 fda-agent (算法层仍落库 assignee).
//   5. 读回对账.
//
// Usage:
//   API=http://localhost:3100 CID=<companyId> [KEY=<board_key>] [APPLY=1] \
//     [ISSUE_TITLE="1.4 选型研判 (DAR)"] \
//     node scripts/wave223/team-route-demo.mjs
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
  console.error("usage: API= CID= [KEY=] [APPLY=1] [ISSUE_TITLE='1.4 选型研判 (DAR)'] node team-route-demo.mjs");
  process.exit(2);
}

const PHASE = "phase_1_initiation";
const TASK = "p1_dar_selection";

// === TEAM_MAPPING (mirrors server/src/services/agent-assign.ts, 6 员工物理层) ===
const TEAM_MAPPING = {
  [`${PHASE}:${TASK}`]: { phase: PHASE, task: TASK, primary: "modou", secondary: "tieshi", primaryLabel: "墨斗 (fda + ds)", secondaryLabel: "铁匠 (core-swe 主力)" },
};

// === ROLE_MAPPING (mirrors server/src/services/agent-assign.ts, 5 角色算法层) ===
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

// === Step 1: 两层并行查表 ===
const roleBinding = ROLE_MAPPING[`${PHASE}:${TASK}`];
const teamBinding = TEAM_MAPPING[`${PHASE}:${TASK}`];
if (!roleBinding || !teamBinding) {
  console.error("ROLE_MAPPING or TEAM_MAPPING missing — implementation drift");
  process.exit(3);
}
console.log("[1] ROLE_MAPPING (5 角色算法层) hit:");
console.log(`    phase=${roleBinding.phase} task=${roleBinding.task} primary=${roleBinding.primary} secondary=${roleBinding.secondary}`);
console.log("[1b] TEAM_MAPPING (6 员工物理层) hit:");
console.log(`    phase=${teamBinding.phase} task=${teamBinding.task} primary=${teamBinding.primary} (${teamBinding.primaryLabel}) secondary=${teamBinding.secondary} (${teamBinding.secondaryLabel})`);
console.log(`    两层关系: algorithm fda → team 墨斗 (墨斗挂 fda + ds 双角色)`);

// === Step 2: 列公司所有数字员工 ===
const agents = await api(`/companies/${CID}/agents`);
const list = Array.isArray(agents) ? agents : agents.agents ?? agents.items ?? [];
console.log(`\n[2] company has ${list.length} agents:`);
for (const a of list) {
  console.log(`    - ${a.name ?? a.id} role=${a.role} status=${a.status}`);
}

// === Step 3: 算法层桶内查找主 + 副 (按 ROLE_MAPPING 的 5 角色) ===
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

const primaryPick = pickByRole(roleBinding.primary);
const secondaryPick = pickByRole(roleBinding.secondary);

console.log(`\n[3] algorithm-layer (5 角色) bucket picks:`);
console.log(`    primary  role=${roleBinding.primary} -> ${primaryPick.agent ? `${primaryPick.agent.name} (${primaryPick.bucket})` : "(empty)"}`);
console.log(`    secondary role=${roleBinding.secondary} -> ${secondaryPick.agent ? `${secondaryPick.agent.name} (${secondaryPick.bucket})` : "(empty)"}`);
console.log(`\n[3b] physical-layer (6 员工) is what 老板派单 actually does:`);
console.log(`    primary  ${teamBinding.primaryLabel} → Hermes 调度 → 老板跑 \`agy -p "<task>"\``);
console.log(`    secondary ${teamBinding.secondaryLabel} → Hermes 调度 → 老板跑 \`claude -p "<task>" --model claude-glm\``);

if (!primaryPick.agent) {
  console.error(`!! no agent with role=${roleBinding.primary} in company ${CID}. demo cannot proceed.`);
  process.exit(4);
}

// === Step 4: 落库 (干跑 / 真跑) — assigneeAgentId 用算法层 5 角色桶 ===
const createBody = {
  title: ISSUE_TITLE,
  description:
    `wave223 demo: 6 员工 (TEAM_MAPPING) 派活. ${PHASE}/${TASK} ` +
    `team.primary=${teamBinding.primary} (${teamBinding.primaryLabel}) ` +
    `team.secondary=${teamBinding.secondary} (${teamBinding.secondaryLabel}) ` +
    `| role.primary=${roleBinding.primary} role.secondary=${roleBinding.secondary} ` +
    `dry-run=${!APPLY}.`,
  priority: "medium",
  status: "backlog",
  assigneeAgentId: primaryPick.agent.id,
};

console.log(`\n[4] ${APPLY ? "APPLY" : "DRY-RUN"} — POST /companies/${CID}/issues`);
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
  console.log(`\n[5] readback:`);
  console.log(`    title=${JSON.stringify(title)}`);
  console.log(`    assigneeAgentId=${assigneeId}`);
  console.log(`    role=${back.assigneeRole ?? back.issue?.assigneeRole ?? "(not returned)"}`);
  console.log(`    verification=${ok ? "PASS" : "FAIL"}`);
  if (!ok) process.exit(5);
}

console.log(`\n${APPLY ? "demo (applied)" : "demo (dry-run)"} complete.`);