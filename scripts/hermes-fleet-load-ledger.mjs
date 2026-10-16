#!/usr/bin/env node
/**
 * scripts/hermes-fleet-load-ledger.mjs
 *
 * **数字员工舰队负载与球权台账 (Fleet Load & Ball Ownership Ledger)** — 巡检第四问.
 *
 * 巡检工具链已回答了三问:
 *   1. 工单还有活路吗  → `hermes-open-issue-liveness-scan.mjs` (per-issue 判决)
 *   2. 调度器还在起搏吗 → `hermes-scheduler-health-check.mjs` (routine/trigger)
 *   3. 谁在收口执行单   → `hermes-routine-execution-audit.mjs` (闭环率/漏网)
 *
 * 三问都答不了第四问: **球在谁手里** —— 谁在扛、谁在等、谁闲着, 以及
 * 「有人没事干 + 有事没人干」这对矛盾是否同时成立。而这正是本 routine
 * 存在的理由: 驱动长周期主线工单持续推进 —— 不知道球权分布就无从驱动.
 *
 * 判定口径 (per 员工, 全部由控制面字段推导, 不做时间近似):
 *   overloaded      — 同时在手 (in_progress) ≥ 阈值 (默认 2): 单人原子签出下需核查是否真并行
 *   driving         — 在手 1 条及以上
 *   waiting_review  — 无在手, 全部在等拍板 (in_review)
 *   queued          — 无在手无待拍, 但有排队的 todo/backlog 或卡住的 blocked
 *   idle            — 零开放工单 ⇒ 有产能可派 (老板需求⑦「看空闲度」的机器真值)
 *   unknown_agent   — 开放工单指派的 agentId 不在公司名册 ⇒ 数据面漂移, 单列不猜
 *
 * 门禁 (--gate, 退出码 3) 只认两类**派单缺口**, 不重复 liveness 的逐单死信判定:
 *   unassigned_open    — 存在**待派**的零指派开放工单 (todo / 已启动却无主)
 *   idle_capacity_gap  — 有空转员工 **且** 存在待派工单 ⇒ 有人没事干 + 有事没人干
 *
 * **零指派 backlog 是结构性搁置, 不是派单缺口 (2026-10-16 口径修正)**. 控制面真值:
 * 建单默认 `status = hasAssignee ? "todo" : "backlog"`, 且状态机只允许 `backlog -> todo`
 * ⇒ 「无人认领的 backlog」是系统对无主工单的**默认静止态**, 计入即让门禁长期 FAIL.
 * 实测代价: 门禁连响后 sibling run 把两条**已记明搁置**的 backlog 件 (COOA-253 本单
 * 「保留于 backlog, routine/老板触发时接管」; COOA-191 为 plan 件) 也强行派了 owner,
 * 正是 skill 明令「plan 件 / 常驻会话单 / 有治理决定的 backlog 件不动」的反例.
 * 口径因此拆两层且都在报告里: `unassigned` (与 liveness orphan 同源, 仅对照) =
 * `parked` (零指派 backlog, 非门禁, 只登记 + 报 idle) + `actionable` (待派, 门禁口径).
 *
 * 用法:
 *   node scripts/hermes-fleet-load-ledger.mjs            # 人读台账
 *   node scripts/hermes-fleet-load-ledger.mjs --brief    # 一行台账 (心跳用)
 *   node scripts/hermes-fleet-load-ledger.mjs --json     # 机器读 JSON
 *   node scripts/hermes-fleet-load-ledger.mjs --gate     # 门禁: 有派单缺口时退出码 3
 *   node scripts/hermes-fleet-load-ledger.mjs --issue <uuid>   # 由工单反查 companyId (心法 #148)
 *
 * 环境变量: PAPERCLIP_API_URL / PAPERCLIP_API_KEY / PAPERCLIP_COMPANY_ID / PAPERCLIP_TASK_ID
 *
 * 退出码: 0 = 台账完成 (无门禁缺口, 或不带 --gate); 2 = 缺 API base/key 或 companyId;
 *         3 = `--gate` 下存在 unassigned_open / idle_capacity_gap.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeApiBase, pickIssues } from "./hermes-heartbeat-snapshot.mjs";
import { OPEN_STATUSES, idleHours, resolveCompanyId } from "./hermes-open-issue-liveness-scan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "..");

/** 判定分组顺序 (人读报告按这个顺序渲染) */
export const LEDGER_VERDICTS = [
  "overloaded",
  "driving",
  "waiting_review",
  "queued",
  "idle",
  "unknown_agent",
];

/** 球权四桶 (与 coolie-dev-task.sh 同口径: todo 与 backlog 合并计) */
export const BUCKETS = [
  { key: "carrying", label: "在手", statuses: ["in_progress"] },
  { key: "waiting", label: "等拍板", statuses: ["in_review"] },
  { key: "blocked", label: "卡住", statuses: ["blocked"] },
  { key: "queued", label: "排队", statuses: ["todo", "backlog"] },
];

/** 同时在手多少条算超载 (单人原子签出下 2 条已需核查) */
export const DEFAULT_OVERLOAD_THRESHOLD = 2;

/** 工单列表条数上限 (与 liveness 同默认) */
export const DEFAULT_ISSUE_LIMIT = 500;

/** 门禁原因 (只有这两类算「派单缺口」) */
export const GATE_REASONS = ["unassigned_open", "idle_capacity_gap"];

export const VERDICT_BADGE = {
  overloaded: "⚠️ 超载",
  driving: "🔨 在扛",
  waiting_review: "⏳ 等拍板",
  queued: "📋 排队",
  idle: "💤 空转",
  unknown_agent: "❔ 名册外",
};

export const REASON_BADGE = {
  unassigned_open: "无人认领的开放工单",
  idle_capacity_gap: "有空转却有事没人干 (派单缺口)",
};

const isNum = (value) => typeof value === "number" && Number.isFinite(value);

/** agents 回包形态自适应: 数组 / `{agents:[...]}` */
export function pickAgents(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object" && Array.isArray(payload.agents)) return payload.agents;
  return [];
}

export function isOpenIssue(issue) {
  return Boolean(issue) && OPEN_STATUSES.includes(issue.status);
}

/** 零指派开放工单: agent 与 human 双空 ⇒ 没有心跳会认领它 */
export function isUnassigned(issue) {
  if (!isOpenIssue(issue)) return false;
  return !issue.assigneeAgentId && !issue.assigneeUserId;
}

/**
 * 结构性搁置: 零指派 **且** status=backlog.
 *
 * 控制面真值 (不是时间近似、不是标题正则):
 *   - `packages/shared/src/validators/issue.ts` 建单默认 `status = hasAssignee ? "todo" : "backlog"`
 *     ⇒ 无主工单的**默认静止态**就是 backlog;
 *   - `doc/SPEC-implementation.md` 的状态机只允许 `backlog -> todo` (先提升, 再排期/认领).
 *
 * 因此「零指派 backlog」等的是所属 wave, 不是 owner ⇒ 登记在报告里, 但不构成派单缺口.
 * 把它计进门禁会让门禁对着系统默认态长期 FAIL, 并逼出对既有搁置件 (plan 件 / 常驻会话单 /
 * 已记明"保留在 backlog"的 wave 入口件) 的错误派单.
 */
export function isParkedUnassigned(issue) {
  return isUnassigned(issue) && issue.status === "backlog";
}

export function bucketKeyOf(status) {
  const bucket = BUCKETS.find((b) => b.statuses.includes(status));
  return bucket ? bucket.key : null;
}

export function labelOf(issue) {
  if (!issue) return "?";
  return issue.identifier || String(issue.id ?? "").slice(0, 8) || "?";
}

/** 工单 → 台账行 (空转一律按 updatedAt 算, 心法: lastActivityAt 会被 attention 刷成当下) */
export function issueRow(issue, now = Date.now()) {
  const hours = idleHours(issue, now);
  return {
    id: issue.id,
    identifier: issue.identifier || null,
    label: labelOf(issue),
    status: issue.status,
    priority: issue.priority || null,
    title: issue.title || "",
    parentId: issue.parentId || null,
    idleHours: hours === null ? null : Math.round(hours * 10) / 10,
  };
}

/**
 * 单个员工负载判定 — 纯函数, 无网络无副作用.
 *
 * @param {object} agent 控制面 `/companies/{cid}/agents` 的一条 (可为名册外伪员工)
 * @param {object[]} issues 全量工单
 * @param {{now?:number, overloadThreshold?:number}} [opts]
 */
export function evaluateAgent(agent, issues, { now = Date.now(), overloadThreshold = DEFAULT_OVERLOAD_THRESHOLD } = {}) {
  const agentId = agent?.id ?? null;
  const open = (Array.isArray(issues) ? issues : [])
    .filter(isOpenIssue)
    .filter((issue) => agentId !== null && issue.assigneeAgentId === agentId);

  const buckets = {};
  for (const bucket of BUCKETS) buckets[bucket.key] = [];
  for (const issue of open) {
    const key = bucketKeyOf(issue.status);
    if (key) buckets[key].push(issueRow(issue, now));
  }
  for (const key of Object.keys(buckets)) {
    buckets[key].sort((a, b) => (b.idleHours ?? -1) - (a.idleHours ?? -1));
  }

  const counts = {};
  for (const key of Object.keys(buckets)) counts[key] = buckets[key].length;

  const oldestCarryIdleHours = buckets.carrying.length
    ? Math.max(...buckets.carrying.map((row) => row.idleHours ?? -1))
    : null;

  let verdict = "idle";
  if (counts.carrying >= overloadThreshold) verdict = "overloaded";
  else if (counts.carrying >= 1) verdict = "driving";
  else if (counts.waiting >= 1) verdict = "waiting_review";
  else if (counts.blocked >= 1 || counts.queued >= 1) verdict = "queued";

  const notes = [];
  if (verdict === "overloaded") {
    notes.push(`同时在手 ${counts.carrying} 条 ≥ 阈值 ${overloadThreshold} (单人原子签出下球权集中, 需核查是否真并行)`);
  }
  if (verdict === "idle") notes.push("零开放工单 ⇒ 有产能可派 (老板需求⑦「看空闲度」真值)");
  if (verdict === "waiting_review") notes.push("无在手工作, 全部在等对方/掌柜拍板");
  if (verdict === "queued") notes.push("有活排着/卡着但没开跑");
  if (verdict === "unknown_agent") notes.push("该 agentId 不在公司名册 ⇒ 数据面漂移, 不猜归属");

  return {
    id: agentId,
    name: agent?.name ?? null,
    role: agent?.role ?? null,
    roleLabel: agent?.roleLabel ?? agent?.role ?? null,
    harnessStatus: agent?.status ?? null,
    verdict,
    counts,
    total: open.length,
    oldestCarryIdleHours,
    buckets,
    hand: [...buckets.carrying, ...buckets.waiting, ...buckets.blocked, ...buckets.queued],
    notes,
  };
}

/**
 * 舰队台账: 名册 × 开放工单 → 球权分布 + 派单缺口.
 *
 * @param {{agents?:object[], issues?:object[]}} input
 * @param {number} now
 * @param {{overloadThreshold?:number}} [opts]
 */
export function buildLedger(input = {}, now = Date.now(), opts = {}) {
  const { agents, issues } = input ?? {};
  const overloadThreshold = opts.overloadThreshold ?? DEFAULT_OVERLOAD_THRESHOLD;
  const roster = Array.isArray(agents) ? agents.filter((agent) => agent && agent.id) : [];
  const all = Array.isArray(issues) ? issues : [];

  const rows = roster.map((agent) => evaluateAgent(agent, all, { now, overloadThreshold }));

  // 名册外指派: 开放工单指向不在名册的 agentId ⇒ 单列 unknown_agent (不猜, 不合并)
  const rosterIds = new Set(roster.map((agent) => agent.id));
  const strayByAgent = new Map();
  for (const issue of all.filter(isOpenIssue)) {
    const agentId = issue.assigneeAgentId;
    if (!agentId || rosterIds.has(agentId)) continue;
    if (!strayByAgent.has(agentId)) strayByAgent.set(agentId, []);
    strayByAgent.get(agentId).push(issue);
  }
  for (const [agentId, strayIssues] of strayByAgent) {
    const row = evaluateAgent({ id: agentId, name: null, role: null }, strayIssues, { now, overloadThreshold });
    row.verdict = "unknown_agent";
    row.notes = ["该 agentId 不在公司名册 ⇒ 数据面漂移, 不猜归属"];
    rows.push(row);
  }

  rows.sort((a, b) => {
    const rank = (row) => LEDGER_VERDICTS.indexOf(row.verdict);
    return rank(a) - rank(b) || String(a.name ?? a.id).localeCompare(String(b.name ?? b.id));
  });

  const counts = {};
  for (const verdict of LEDGER_VERDICTS) counts[verdict] = 0;
  for (const row of rows) counts[row.verdict] = (counts[row.verdict] ?? 0) + 1;

  // 零指派工单拆两层 (2026-10-16 口径修正, 见文件头):
  //   parked      — status=backlog = 控制面对无主工单的**默认静止态** (建单即 backlog),
  //                 等的是所属 wave, 不是 owner ⇒ 只登记 + 报 idle, **不门禁**
  //   actionable  — todo / 已启动却无主 = 待派 ⇒ 这才是派单缺口
  //   unassigned  — 两者之和, 与 liveness 的 orphan 同源, 仅供对照报告
  const unassignedIssues = all.filter(isUnassigned);
  const parked = unassignedIssues.filter(isParkedUnassigned).map((issue) => issueRow(issue, now));
  const actionable = unassignedIssues.filter((issue) => !isParkedUnassigned(issue)).map((issue) => issueRow(issue, now));
  const byIdleDesc = (a, b) => (b.idleHours ?? -1) - (a.idleHours ?? -1);
  parked.sort(byIdleDesc);
  actionable.sort(byIdleDesc);
  const unassigned = [...parked, ...actionable].sort(byIdleDesc);

  const idleAgents = rows.filter((row) => row.verdict === "idle").map((row) => row.name ?? row.id);
  const handTotal = rows.reduce((sum, row) => sum + row.counts.carrying, 0);
  const openTotal = all.filter(isOpenIssue).length;

  const gateReasons = [];
  if (actionable.length > 0) gateReasons.push("unassigned_open");
  if (actionable.length > 0 && idleAgents.length > 0) gateReasons.push("idle_capacity_gap");

  return {
    generatedAt: new Date(now).toISOString(),
    agents: rows,
    counts,
    idleAgents,
    unassigned,
    parked,
    actionable,
    openTotal,
    handTotal,
    overloadThreshold,
    gate: {
      failed: gateReasons.length > 0,
      reasons: gateReasons,
      unassignedLabels: actionable.map((row) => row.label),
      parkedLabels: parked.map((row) => row.label),
      idleAgents,
    },
  };
}

/** 一行台账 (心跳专用) */
export function renderBrief(ledger) {
  const head =
    `FLEET ${ledger.generatedAt} agents=${ledger.agents.length} ` +
    LEDGER_VERDICTS.filter((v) => ledger.counts[v] > 0)
      .map((v) => `${v}=${ledger.counts[v]}`)
      .join(" ") +
    ` · unassigned=${ledger.unassigned.length} (待派${ledger.actionable.length}/搁置${ledger.parked.length}) · open=${ledger.openTotal} · gate=${ledger.gate.failed ? `FAIL(${ledger.gate.reasons.join(",")})` : "OK"}`;

  const body = ledger.agents
    .map((row) => {
      const who = row.name ?? `${String(row.id ?? "").slice(0, 8)}(名册外)`;
      const age = isNum(row.oldestCarryIdleHours) ? ` 最久${row.oldestCarryIdleHours}h` : "";
      return `${who}:${VERDICT_BADGE[row.verdict] ?? row.verdict} 在手${row.counts.carrying} 等${row.counts.waiting} 卡${row.counts.blocked} 排${row.counts.queued}${age}`;
    })
    .join(" · ");

  return body ? `${head} · ${body}` : head;
}

/** 人读分组台账 */
export function renderText(ledger) {
  const lines = [];
  lines.push(`═══ 数字员工舰队负载与球权台账 (Fleet Load Ledger) @ ${ledger.generatedAt} ═══`);
  lines.push(
    `员工 ${ledger.agents.length} 名 · 开放工单 ${ledger.openTotal} 条 (在手 ${ledger.handTotal}) · ` +
      LEDGER_VERDICTS.filter((v) => ledger.counts[v] > 0)
        .map((v) => `${v}=${ledger.counts[v]}`)
        .join(" · "),
  );
  lines.push(
    `门禁: ${ledger.gate.failed ? `❌ FAIL (${ledger.gate.reasons.map((r) => `${r}: ${REASON_BADGE[r] ?? r}`).join(" · ")})` : "✅ OK"}`,
  );
  lines.push("");

  for (const row of ledger.agents) {
    lines.push(
      `${VERDICT_BADGE[row.verdict] ?? row.verdict}  ${row.name ?? "(名册外)"}${row.roleLabel ? ` · ${row.roleLabel}` : ""}  ` +
        `hand=${row.counts.carrying} wait=${row.counts.waiting} blocked=${row.counts.blocked} queued=${row.counts.queued}  harness=${row.harnessStatus ?? "?"}`,
    );
    lines.push(`    id=${row.id}`);
    for (const issue of row.hand.slice(0, 8)) {
      lines.push(
        `    · ${issue.label.padEnd(12)} ${String(issue.status).padEnd(11)} ${String(issue.priority ?? "-").padEnd(7)} idle=${
          issue.idleHours === null ? "?" : `${issue.idleHours}h`
        }  ${String(issue.title).slice(0, 40)}`,
      );
    }
    if (row.hand.length > 8) lines.push(`    · … 另有 ${row.hand.length - 8} 条`);
    for (const note of row.notes) lines.push(`    └ ${note}`);
    lines.push("");
  }

  const rowLine = (row) =>
    `  ${row.label.padEnd(12)} ${String(row.status).padEnd(11)} ${String(row.priority ?? "-").padEnd(7)} idle=${
      row.idleHours === null ? "?" : `${row.idleHours}h`
    }  ${String(row.title).slice(0, 44)}`;

  lines.push(
    `待派: 零指派且已进入待办/执行态的开放工单 ${ledger.actionable.length} 条 (门禁口径 ⇒ 没有心跳会认领它):`,
  );
  if (ledger.actionable.length === 0) lines.push("  (无)");
  for (const row of ledger.actionable) lines.push(rowLine(row));

  lines.push("");
  lines.push(
    `搁置: 零指派 backlog ${ledger.parked.length} 条 (非门禁 — 等的是所属 wave, 不是 owner):`,
  );
  if (ledger.parked.length === 0) lines.push("  (无)");
  for (const row of ledger.parked) lines.push(rowLine(row));
  lines.push(
    `  └ 零指派开放工单合计 ${ledger.unassigned.length} 条 (待派 + 搁置, 与 liveness 的 orphan 同源, 仅供对照)`,
  );
  return lines.join("\n");
}

/** 与仓库既有工具同形: {flags, options}, 未知参数抛错由 main 归一为退出码 2 */
export function parseArgs(argv = []) {
  const flags = { json: false, brief: false, gate: false, help: false };
  const options = {
    issue: null,
    company: null,
    limit: DEFAULT_ISSUE_LIMIT,
    overloadThreshold: DEFAULT_OVERLOAD_THRESHOLD,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") flags.json = true;
    else if (arg === "--brief") flags.brief = true;
    else if (arg === "--gate") flags.gate = true;
    else if (arg === "--help" || arg === "-h") flags.help = true;
    else if (arg === "--issue") options.issue = argv[++i] || null;
    else if (arg === "--company") options.company = argv[++i] || null;
    else if (arg === "--limit") options.limit = Number(argv[++i]) || DEFAULT_ISSUE_LIMIT;
    else if (arg === "--overload-threshold")
      options.overloadThreshold = Number(argv[++i]) || DEFAULT_OVERLOAD_THRESHOLD;
    else throw new Error(`未知参数: ${arg}`);
  }
  return { flags, options };
}

const HELP = `hermes-fleet-load-ledger — 数字员工舰队负载与球权台账 (巡检第四问: 球在谁手里)

  --brief                        一行台账 (心跳专用)
  --json                         机器读 JSON
  --gate                         门禁: 存在 unassigned_open / idle_capacity_gap 时退出码 3 (待派口径, 零指派 backlog 属搁置不计入)
  --issue <uuid>                 用该工单解析 companyId (心法 #148)
  --company <cid>                指定 companyId (默认取 PAPERCLIP_COMPANY_ID)
  --limit <n>                    工单列表条数上限 (默认 ${DEFAULT_ISSUE_LIMIT})
  --overload-threshold <n>       同时在手多少条算超载 (默认 ${DEFAULT_OVERLOAD_THRESHOLD})
`;

async function getJson(url, { apiKey, fetchImpl = globalThis.fetch } = {}) {
  const res = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}: ${text.slice(0, 200)}`);
  return text === "" ? null : JSON.parse(text);
}

export async function main(argv = process.argv.slice(2), env = process.env, deps = {}) {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (err) {
    console.error(String(err?.message || err));
    return 2;
  }
  const { flags, options } = parsed;
  if (flags.help) {
    console.log(HELP);
    return 0;
  }

  const apiKey = env.PAPERCLIP_API_KEY;
  const apiBase = normalizeApiBase(env.PAPERCLIP_API_URL);
  if (!apiKey || !apiBase) {
    console.error("缺少 PAPERCLIP_API_URL / PAPERCLIP_API_KEY");
    return 2;
  }

  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  const now = deps.now ?? Date.now();
  const issueId = options.issue || env.PAPERCLIP_TASK_ID || null;
  const companyId = await resolveCompanyId({
    apiBase,
    apiKey,
    companyId: options.company || env.PAPERCLIP_COMPANY_ID || null,
    issueId,
    fetchImpl,
  });
  if (!companyId) {
    console.error("无法解析 companyId (传 --company / --issue 或注入 PAPERCLIP_COMPANY_ID)");
    return 2;
  }

  // 心法 #155: 名册与工单都走 `GET /api/companies/{cid}/{resource}` (单条 issue 才走 root)
  const agentsPayload = await getJson(`${apiBase}/companies/${companyId}/agents`, { apiKey, fetchImpl });
  const issuesPayload = await getJson(`${apiBase}/companies/${companyId}/issues?limit=${options.limit}`, {
    apiKey,
    fetchImpl,
  });
  const ledger = buildLedger(
    { agents: pickAgents(agentsPayload), issues: pickIssues(issuesPayload) },
    now,
    { overloadThreshold: options.overloadThreshold },
  );

  if (flags.json) console.log(JSON.stringify({ companyId, ...ledger }, null, 2));
  else if (flags.brief) console.log(renderBrief(ledger));
  else console.log(renderText(ledger));

  if (flags.gate && ledger.gate.failed) return 3;
  return 0;
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(String(err && err.stack ? err.stack : err));
      process.exit(1);
    });
}
