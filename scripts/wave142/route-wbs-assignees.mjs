#!/usr/bin/env node
// wave142 — route a project's WBS work-package issues to the right digital employee.
//
// boss 2026-09-28: 产融项目 939ff822 有 45 条 WBS 工作包 assignee=None (等分配),
// 要按 (phase + skills) 自动路由到现有员工。本工具只 PATCH assigneeAgentId,
// 不改 status (激活由使用方决定)。默认 DRY RUN, 只有 APPLY=1 才写库。
//
//   API=https://www.xrobinai.cn/api CID=<companyId> PID=<projectId> \
//   KEY=<pcp_board_...> node scripts/wave142/route-wbs-assignees.mjs
//
// 规则表 (first match wins) 见 RULES; 每条命中都带 reason, 便于对账。

const API = process.env.API ?? "https://www.xrobinai.cn/api";
const CID = process.env.CID;
const PID = process.env.PID;
const KEY = process.env.KEY;
const APPLY = process.env.APPLY === "1";

if (!CID || !PID || !KEY) {
  console.error("usage: API= CID= PID= KEY= [APPLY=1] node route-wbs-assignees.mjs");
  process.exit(2);
}

// Company xrobinai's staff (from GET /companies/:cid/agents).
const AGENTS = {
  "core-swe": { id: "95069d63-2221-4500-9e17-25a472c5a921", label: "core-swe-agent (平台核心研发)" },
  fdse: { id: "5de33aed-2ed3-443d-ad2e-51085a158a36", label: "fdse-agent (前线部署全栈工程师/交付第一责任人)" },
  ds: { id: "a6911d32-83cb-49e0-bd0f-cb12a14cd583", label: "ds-agent (部署战略/业务方案专家)" },
  "pre-sre": { id: "3e3dbce1-d8cb-47bd-af68-2872200ac509", label: "pre-sre-agent (产品可靠性工程师)" },
  fda: { id: "5fdf1a19-ec56-4d6f-85d0-363a57614307", label: "fda-agent (前线架构师)" },
};

const phaseOf = (title) => (String(title).match(/^S(\d+)(?:\.\d+)?/) || [])[1] ?? null;

// Ordered rules. Each: { when(phase, text) -> bool, agent, reason }.
const RULES = [
  {
    agent: "pre-sre",
    reason: "S6 上线部署/监控拨测/移交培训/运维核验 → 可靠性(SRE)责任人",
    when: (p) => p === "6",
  },
  {
    agent: "ds",
    reason: "S5 对账证据/初验报告 → 业务方案(DS)主审",
    when: (p, t) => p === "5" && /对账|初验|终验/.test(t),
  },
  {
    agent: "core-swe",
    reason: "S5 接口契约清单 → 契约/门禁守护(Core SWE)",
    when: (p, t) => p === "5" && /契约|接口/.test(t),
  },
  {
    agent: "fdse",
    reason: "S5 集成实施/流程嵌入/测试计划与报告 → 交付全栈(FDSE)",
    when: (p) => p === "5",
  },
  {
    agent: "fda",
    reason: "隔离/权限/领域模型/状态机边界 → 前线架构(FDA)",
    when: (_p, t) => /安全隔离|隔离|角色与权限|权限清单|状态机|数据模型|领域模型|守恒/.test(t),
  },
  {
    agent: "fdse",
    reason: "S4 核心场景开发(8大功能) → 交付全栈(FDSE)",
    when: (p) => p === "4",
  },
  {
    agent: "core-swe",
    reason: "文档类交付物(手册/材料/清单/报告/规范/设计/方案/计划/应答/调研) → 平台核心(Core SWE)",
    when: (_p, t) => /手册|材料|清单|报告|文档|说明书|规范|设计|方案|计划|应答|调研|确认书/.test(t),
  },
];

// Fallback — parse 责任角色 from the description (boss rule D).
function fallbackAgent(desc) {
  const m = /责任角色\**[:：]\s*(.+)/.exec(desc ?? "");
  const role = (m?.[1] ?? "").trim();
  if (/SRE/i.test(role)) return { agent: "pre-sre", reason: `兜底 责任角色「${role}」含 SRE` };
  if (/测试/.test(role)) return { agent: "fdse", reason: `兜底 责任角色「${role}」含 测试` };
  if (/方案顾问/.test(role)) return { agent: "ds", reason: `兜底 责任角色「${role}」含 方案顾问` };
  if (/架构|隔离/.test(role)) return { agent: "fda", reason: `兜底 责任角色「${role}」含 架构` };
  return { agent: "core-swe", reason: `兜底 (责任角色「${role || "空"}」无更具体匹配)` };
}

function classify(issue) {
  const text = `${issue.title ?? ""}\n${issue.description ?? ""}`;
  const phase = phaseOf(issue.title);
  for (const rule of RULES) {
    if (rule.when(phase, text)) return { agent: rule.agent, reason: rule.reason };
  }
  return fallbackAgent(issue.description);
}

async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "x-paperclip-api-key": KEY,
      Authorization: `Bearer ${KEY}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

const body = await api(`/companies/${CID}/issues?projectId=${PID}&limit=200`);
const issues = Array.isArray(body) ? body : body.issues ?? body.items ?? [];
const targets = issues
  .filter((i) => /^S\d/.test(i.title ?? "") && i.status === "backlog")
  .sort((a, b) => (a.identifier > b.identifier ? 1 : -1));

if (targets.length === 0) {
  console.log("no backlog WBS work packages found");
  process.exit(0);
}

console.log(`${APPLY ? "APPLY" : "DRY-RUN"} — ${targets.length} backlog WBS work packages\n`);
const rows = [];
for (const issue of targets) {
  const { agent, reason } = classify(issue);
  const { id, label } = AGENTS[agent];
  rows.push({ identifier: issue.identifier, id: issue.id, phase: phaseOf(issue.title), agent, label, reason });
  if (APPLY && issue.assigneeAgentId !== id) {
    await api(`/issues/${issue.id}`, {
      method: "PATCH",
      body: JSON.stringify({ assigneeAgentId: id }),
    });
  }
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad("identifier", 11)}${pad("phase", 7)}${pad("newAssignee", 28)}reason`);
for (const r of rows) console.log(`${pad(r.identifier, 11)}${pad("S" + r.phase, 7)}${pad(r.label, 28)}${r.reason}`);

const dist = {};
for (const r of rows) dist[r.agent] = (dist[r.agent] ?? 0) + 1;
console.log("\ndistribution:", dist);
console.log(APPLY ? "\nassigned via API." : "\n(dry run — set APPLY=1 to write)");
