#!/usr/bin/env node
/**
 * scripts/hermes-open-issue-liveness-scan.mjs
 *
 * 开放工单**活路扫描器** (Hermes PM / 守护调度器专用).
 *
 * 背景: COOA-296 守护调度器每 15 分钟唤醒一次做「巡检与状态同步」, 过去每轮
 * 都手写临时 jq 数一遍大盘, 只能看出「有几条 blocked」, 看不出**这些 blocked
 * 还回不回得来**。实测发现 6 条工单长期躺在 `blocked`, 而 blockerAttention
 * 显示 unresolvedBlockerCount=0 / blockingTreeLive=false / unblockDescriptor=null
 * —— 既没有第一方 blocker 边, 也没有具名解阻责任人, 更没有 monitor。
 * 这类工单**永远不会自动恢复**, 每轮巡检都被误读成「已知稳态」。
 *
 * 本脚本把"活路"判定固化成可复算的代码:
 *
 *   存活信号 (任一即算有活路):
 *     - executionRunId / activeRun.id / checkoutRunId  — 有活着的 run
 *     - monitorNextCheckAt                             — 有排定的 monitor 唤醒
 *     - executionState.currentParticipant              — 有执行策略待办人
 *     - reviewAttention.state=covered / paths 非空     — review 挂在一条 pending 交互上
 *       (ask_user_questions / request_confirmation, continuationPolicy=wake_assignee),
 *       对方一回复就唤醒指派 — 这也是活路, 不是"等回复(无表)"
 *
 *   挂起交互复核 (默认开启): 对**准备判死**的工单 (stalled_in_progress / dead_letter /
 *   review_no_monitor / queued_stale) 多查一次 `GET /api/issues/{id}/interactions`,
 *   若挂着 continuationPolicy=wake_assignee(_on_accept) 的 pending 交互 ⇒ 改判 `live`.
 *   实测主线 COOA-114 (in_progress / 零 run / 零 monitor) 正是这一形态, 旧口径每 15
 *   分钟报一次"假活着"假警报. 用 `--no-interaction-probe` 可关闭.
 *
 *   判定结果 (verdict):
 *     live                  — 有活着的 run / monitor / 执行策略待办人
 *     blocked_with_path     — 阻塞但 blocker 边未解 (解阻后 issue_blockers_resolved 自动唤醒)
 *     blocked_with_descriptor — 阻塞且写了具名解阻 owner + action
 *     dead_letter           — **阻塞但零 blocker / 零 descriptor / 零 monitor ⇒ 永不自动恢复**
 *     stalled_in_progress   — in_progress 但无 run 无 monitor (假活着)
 *     review_no_monitor     — in_review 且 run / monitor / 挂起交互三无 (只能等对方主动回复)
 *     waiting_human         — in_review 且已指派给人类用户 (等老板)
 *     orphan                — todo/backlog 且零指派 (没人会认领)
 *     queued_stale          — todo/backlog 有指派但超阈值无 run (唤醒可能未送达)
 *     queued                — todo/backlog 且有指派并在阈值内 (正常排队)
 *
 * 用法:
 *   node scripts/hermes-open-issue-liveness-scan.mjs            # 人读分组报告
 *   node scripts/hermes-open-issue-liveness-scan.mjs --brief    # 一行心脏起搏
 *   node scripts/hermes-open-issue-liveness-scan.mjs --json     # 机器读 JSON
 *   node scripts/hermes-open-issue-liveness-scan.mjs --dead-letter-only
 *   node scripts/hermes-open-issue-liveness-scan.mjs --issue <uuid> --company <cid>
 *
 * 环境变量: PAPERCLIP_API_URL / PAPERCLIP_API_KEY / PAPERCLIP_COMPANY_ID / PAPERCLIP_TASK_ID
 *
 * 退出码: 0 = 扫描完成; 2 = 没有 API base / key. `--dead-letter-only` 下存在无活路
 *         工单时返回 3, 方便 CI/看门狗直接用它当门禁。
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { apiErrorOf, normalizeApiBase, pickIssues } from "./hermes-heartbeat-snapshot.mjs";
import { scanAllIssues } from "./lib/paperclip-issue-scan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "..");

/** 开放工单状态: 只要还占着看板就算开放 */
export const OPEN_STATUSES = ["backlog", "todo", "in_progress", "in_review", "blocked"];

/** 判定分组顺序 (人读报告按这个顺序渲染) */
export const VERDICTS = [
  "dead_letter",
  "stalled_in_progress",
  "review_no_monitor",
  "orphan",
  "queued_stale",
  "blocked_with_descriptor",
  "blocked_with_path",
  "waiting_human",
  "live",
  "queued",
];

/** 需要掌柜出手的分组 (人读报告里标 ❌ / ⏸ / 👻 / ⚠️ / 🐌) */
export const ATTENTION_VERDICTS = [
  "dead_letter",
  "stalled_in_progress",
  "review_no_monitor",
  "orphan",
  "queued_stale",
];

/** 指派在册但长期无 run 的排队工单阈值 (小时) */
export const DEFAULT_STALE_QUEUED_HOURS = 48;

/** run 刚落幕的交接宽限窗口 (分钟) — 窗口内不判"假活着", 避免误报主线 */ 
export const DEFAULT_HANDOFF_GRACE_MINUTES = 10;

/**
 * 会唤醒待办人的交互续跑策略 (控制面 `continuationPolicy`).
 * 挂在这类交互上的工单**不是死信**: 对方一回复就唤醒指派 (与 reviewAttention 同源口径).
 */
export const WAKE_CONTINUATION_POLICIES = ["wake_assignee", "wake_assignee_on_accept"];

/**
 * 值得多花一次 API 去查挂起交互的判决 (准备判死时才取证, 不为健康工单付代价).
 * 实测: 主线 COOA-114 处于 in_progress 且零 run / 零 monitor, 但它挂着一条
 * `ask_user_questions` (continuationPolicy=wake_assignee) —— 旧口径把它报成
 * "假活着", 每 15 分钟一条假警报, 把真死信淹在噪音里 (与 reviewAttention 同一类误报).
 */
export const PROBE_VERDICTS = ["stalled_in_progress", "dead_letter", "review_no_monitor", "queued_stale"];

/** 交互列表回包自适应: 数组 / {interactions:[]} / 错误体都接得住 */
export function pickInteractions(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object" && Array.isArray(payload.interactions)) return payload.interactions;
  return [];
}

/** 挂起且**回复即唤醒**的交互 (其余 pending 交互不算活路) */
export function pendingWakeInteractions(payload) {
  return pickInteractions(payload).filter(
    (item) => item && item.status === "pending" && WAKE_CONTINUATION_POLICIES.includes(item.continuationPolicy),
  );
}

/**
 * 用挂起交互真值复核一条待判死的扫描行 (原地改写 row, 返回同一对象).
 *
 * - 查到 wake 类挂起交互 ⇒ 判决改判 `live`, 理由写明在维对象与唤醒策略
 * - 没查到 / 查询失败 ⇒ 保留原判决, 但在 `interactionProbe` 上留痕 (降级不崩)
 */
export function applyInteractionProbe(row, payload) {
  if (!row || !PROBE_VERDICTS.includes(row.verdict)) return row;
  const error = typeof payload === "string" ? "unparsable response" : apiErrorOf(payload);
  if (error) {
    row.interactionProbe = { checked: false, error };
    return row;
  }
  const wake = pendingWakeInteractions(payload);
  row.interactionProbe = {
    checked: true,
    pendingWakeCount: wake.length,
    kinds: [...new Set(wake.map((item) => item.kind ?? "interaction"))],
  };
  if (wake.length > 0) {
    const lead = wake[0];
    row.verdict = "live";
    row.reasons = [
      `挂在挂起交互上 (${lead.kind ?? "interaction"}${lead.resolverPolicy ? ` → ${lead.resolverPolicy}` : ""}, ${
        lead.continuationPolicy
      }) — 对方回复即唤醒`,
    ];
  }
  return row;
}

const VERDICT_BADGE = {
  dead_letter: "❌ 无活路",
  stalled_in_progress: "⏸ 假活着",
  review_no_monitor: "⚠️ 等回复(无表)",
  orphan: "👻 无人认领",
  queued_stale: "🐌 排队超期",
  blocked_with_descriptor: "🧷 阻塞(有 owner)",
  blocked_with_path: "🔗 阻塞(有 blocker 边)",
  waiting_human: "🧑 等老板",
  live: "✅ 有活路",
  queued: "🕒 排队",
};

/** 人类可读的状态标志 (缺失时不报错, 只登记为"未知") */
function blockerAttentionOf(issue) {
  const attn = issue && issue.blockerAttention;
  return attn && typeof attn === "object" ? attn : {};
}

/**
 * review 面的 attention 真值 (控制面 reviewAttention)。
 *
 * 实测 COOA-44 / COOA-278: 都是 `in_review` + 零 run + 零 monitor, 但各自挂着一条
 * `pending` 交互 (ask_user_questions / request_confirmation, continuationPolicy=wake_assignee)。
 * 只看 run/monitor 会把"球已经递出去了"读成"等回复(无表)", 于是每轮巡检都对这两条
 * 报假警报 —— 假警报一多, 真死路 (COOA-4 那种) 就淹在噪音里, 这正是本脚本存在的理由。
 */
function reviewAttentionOf(issue) {
  const attn = issue && issue.reviewAttention;
  return attn && typeof attn === "object" ? attn : {};
}

/** reviewAttention.paths 里的待办路径 (畸形行直接剔除, 不猜) */
function reviewPathsOf(attn) {
  const paths = attn && Array.isArray(attn.paths) ? attn.paths : [];
  return paths.filter((p) => p && typeof p === "object");
}

/** "Pending ask user questions → Board" 这种人读摘要 */
function describeReviewPaths(paths) {
  const labels = paths
    .map((p) => [p.label, p.responder].filter(Boolean).join(" → "))
    .filter(Boolean);
  return labels.length > 0 ? [...new Set(labels)].join(" / ") : "state=covered";
}

function runIdOf(issue) {
  return (
    (issue && issue.executionRunId) ||
    (issue && issue.activeRun && issue.activeRun.id) ||
    (issue && issue.checkoutRunId) ||
    null
  );
}

function stageParticipantOf(issue) {
  const state = issue && issue.executionState;
  if (!state || typeof state !== "object") return null;
  return state.currentParticipant || state.currentStageType || null;
}

function epochOf(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || value === "") return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

/**
 * 工单最近一次**状态变更**时间 — 空转口径。
 *
 * 取 `updatedAt` 而不是 `lastActivityAt`: 实测 COOA-4 (in_progress, 无 run 无 monitor)
 * 的 `lastActivityAt` 会被控制面 attention 巡检刷成"当下", 于是空转 6.5 小时的工单
 * 会被算成 idle=0h, 假活着完全看不出来。`updatedAt` 只在真实状态变更时前移, 稳定可复算。
 */
export function lastActivityMs(issue) {
  return epochOf(issue && issue.updatedAt) ?? epochOf(issue && issue.lastActivityAt) ?? null;
}

/** 空转小时数; 无时间戳时返回 null (不猜) */
export function idleHours(issue, now = Date.now()) {
  const ms = lastActivityMs(issue);
  if (ms === null) return null;
  return Math.max(0, (now - ms) / 3600000);
}

export function isOpenIssue(issue) {
  return Boolean(issue) && OPEN_STATUSES.includes(issue.status);
}

/**
 * 单条工单活路判定 — 纯函数, 无网络无副作用。
 * 返回 { verdict, reasons } ; reasons 是人读的"为什么这么判"。
 */
export function classifyIssue(
  issue,
  {
    now = Date.now(),
    queuedStaleHours = DEFAULT_STALE_QUEUED_HOURS,
    handoffGraceMinutes = DEFAULT_HANDOFF_GRACE_MINUTES,
  } = {},
) {
  const reasons = [];
  const status = issue && issue.status;
  const runId = runIdOf(issue);
  const monitor = issue && issue.monitorNextCheckAt;
  const stage = stageParticipantOf(issue);
  const attn = blockerAttentionOf(issue);
  const reviewAttn = reviewAttentionOf(issue);
  const reviewPaths = reviewPathsOf(reviewAttn);
  const reviewLive = reviewPaths.length > 0 || reviewAttn.state === "covered";
  const unresolved = Number.isFinite(attn.unresolvedBlockerCount) ? attn.unresolvedBlockerCount : null;
  const treeLive = attn.blockingTreeLive === true;
  const descriptor = issue && issue.unblockDescriptor;
  const agentOwner = (issue && issue.assigneeAgentId) || null;
  const humanOwner = (issue && issue.assigneeUserId) || null;

  if (runId) reasons.push(`active run ${String(runId).slice(0, 8)}`);
  if (monitor) reasons.push(`monitor @ ${monitor}`);
  if (stage) reasons.push(`执行策略待办人 ${stage}`);

  const hasLiveWake = Boolean(runId || monitor || stage);

  if (status === "in_progress") {
    if (hasLiveWake) return { verdict: "live", reasons };
    const hours = idleHours(issue, now);
    if (hours !== null && hours * 60 < handoffGraceMinutes) {
      reasons.push(
        `run 刚落幕 (${Math.round(hours * 60)}min < ${handoffGraceMinutes}min 交接窗口)`,
      );
      return { verdict: "live", reasons };
    }
    reasons.push("in_progress 但无 active run / 无 monitor");
    return { verdict: "stalled_in_progress", reasons };
  }

  if (status === "in_review") {
    if (hasLiveWake) return { verdict: "live", reasons };
    if (humanOwner) {
      reasons.push(`已指派人类 owner ${humanOwner}`);
      return { verdict: "waiting_human", reasons };
    }
    if (reviewLive) {
      reasons.push(`review 挂在挂起交互上 (${describeReviewPaths(reviewPaths)}) — 对方回复即唤醒`);
      return { verdict: "live", reasons };
    }
    reasons.push("in_review 但无 monitor / 无 active run / 无挂起交互 — 只能等对方主动回复");
    return { verdict: "review_no_monitor", reasons };
  }

  if (status === "blocked") {
    if (hasLiveWake) return { verdict: "live", reasons };
    if (unresolved === null) {
      reasons.push("blockerAttention 缺失 — 活路未知");
    }
    if ((unresolved !== null && unresolved > 0) || treeLive) {
      reasons.push(
        `blocker 边未解 (unresolved=${unresolved ?? "?"}${treeLive ? " · 树在跑" : ""}) — 解阻后自动唤醒`,
      );
      return { verdict: "blocked_with_path", reasons };
    }
    if (descriptor) {
      reasons.push("有具名解阻 owner + action");
      return { verdict: "blocked_with_descriptor", reasons };
    }
    reasons.push("零 blocker 边 · 零 unblockDescriptor · 零 monitor — 永不自动恢复");
    return { verdict: "dead_letter", reasons };
  }

  if (status === "todo" || status === "backlog") {
    if (!agentOwner && !humanOwner) {
      reasons.push("零指派 — 没有心跳会认领它");
      return { verdict: "orphan", reasons };
    }
    if (!hasLiveWake) {
      const hours = idleHours(issue, now);
      if (hours !== null && hours >= queuedStaleHours) {
        reasons.push(
          `指派在册但 ${Math.round(hours)}h 无 run (阈值 ${queuedStaleHours}h) — 唤醒可能未送达`,
        );
        return { verdict: "queued_stale", reasons };
      }
    }
    reasons.push(`排队中 (owner ${String(agentOwner || humanOwner).slice(0, 8)})`);
    return { verdict: "queued", reasons };
  }

  reasons.push("非开放状态");
  return { verdict: "closed", reasons };
}

/** 把一条 issue 压成扫描行 */
export function scanRow(
  issue,
  {
    now = Date.now(),
    queuedStaleHours = DEFAULT_STALE_QUEUED_HOURS,
    handoffGraceMinutes = DEFAULT_HANDOFF_GRACE_MINUTES,
  } = {},
) {
  const { verdict, reasons } = classifyIssue(issue, { now, queuedStaleHours, handoffGraceMinutes });
  const hours = idleHours(issue, now);
  return {
    id: issue.id,
    identifier: issue.identifier || null,
    shortId: String(issue.id || "").slice(0, 8),
    title: issue.title || "",
    status: issue.status,
    priority: issue.priority || null,
    verdict,
    reasons,
    assigneeAgentId: issue.assigneeAgentId || null,
    assigneeUserId: issue.assigneeUserId || null,
    idleHours: hours === null ? null : Math.round(hours * 10) / 10,
    lastActivityAt: issue.lastActivityAt || issue.updatedAt || null,
    monitorNextCheckAt: issue.monitorNextCheckAt || null,
  };
}

/** 扫描行 → 分组报告 (判决被改判后可用同一口径重建, 单一口径源) */
export function regroupScan(rows, { now = Date.now() } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const byVerdict = new Map(VERDICTS.map((v) => [v, []]));
  for (const row of list) {
    if (!byVerdict.has(row.verdict)) byVerdict.set(row.verdict, []);
    byVerdict.get(row.verdict).push(row);
  }
  for (const group of byVerdict.values()) {
    group.sort((a, b) => (b.idleHours ?? -1) - (a.idleHours ?? -1));
  }
  const counts = {};
  for (const [verdict, group] of byVerdict) counts[verdict] = group.length;
  const attention = ATTENTION_VERDICTS.reduce((sum, v) => sum + (counts[v] || 0), 0);
  return {
    generatedAt: new Date(now).toISOString(),
    openCount: list.length,
    counts,
    attentionCount: attention,
    byVerdict: Object.fromEntries(byVerdict),
    rows: list,
  };
}

/** 全量扫描: 开放工单 → 分组 */
export function scanIssues(
  issues,
  {
    now = Date.now(),
    queuedStaleHours = DEFAULT_STALE_QUEUED_HOURS,
    handoffGraceMinutes = DEFAULT_HANDOFF_GRACE_MINUTES,
  } = {},
) {
  const open = (Array.isArray(issues) ? issues : []).filter(isOpenIssue);
  const rows = open.map((issue) => scanRow(issue, { now, queuedStaleHours, handoffGraceMinutes }));
  return regroupScan(rows, { now });
}

export function labelOf(row) {
  return row.identifier || row.shortId;
}

function idleText(row) {
  if (row.idleHours === null) return "idle=?";
  return row.idleHours >= 48
    ? `idle=${(row.idleHours / 24).toFixed(1)}d`
    : `idle=${row.idleHours}h`;
}

/** 人读报告 */
export function renderText(scan) {
  const lines = [];
  lines.push(`开放工单活路扫描 @ ${scan.generatedAt} · 开放 ${scan.openCount} 条 · 待出手 ${scan.attentionCount} 条`);
  lines.push("────────────────────────────────────────");
  if (scan.openCount === 0) {
    lines.push("(无开放工单)");
    return lines.join("\n");
  }
  for (const verdict of VERDICTS) {
    const list = scan.byVerdict[verdict] || [];
    if (list.length === 0) continue;
    lines.push(`${VERDICT_BADGE[verdict] || verdict} ${list.length} 条`);
    for (const row of list) {
      lines.push(
        `  ${labelOf(row).padEnd(12)} ${String(row.status).padEnd(11)} ${String(row.priority || "-").padEnd(7)} ${idleText(row).padEnd(11)} ${row.title.slice(0, 34)}`,
      );
      lines.push(`    └ ${row.reasons.join(" · ")}`);
    }
  }
  return lines.join("\n");
}

/** 一行心脏起搏 */
export function renderBrief(scan) {
  const c = scan.counts;
  return `LIVENESS ${scan.generatedAt} open=${scan.openCount} dead=${c.dead_letter || 0} stall=${c.stalled_in_progress || 0} orphan=${c.orphan || 0} qstale=${c.queued_stale || 0} review=${c.review_no_monitor || 0} live=${c.live || 0}`;
}

export function parseArgs(argv = []) {
  const flags = { json: false, brief: false, deadLetterOnly: false, help: false };
  const options = {
    issue: null,
    company: null,
    limit: 500,
    staleQueuedHours: DEFAULT_STALE_QUEUED_HOURS,
    handoffGraceMinutes: DEFAULT_HANDOFF_GRACE_MINUTES,
    probeInteractions: true,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") flags.json = true;
    else if (arg === "--brief") flags.brief = true;
    else if (arg === "--dead-letter-only") flags.deadLetterOnly = true;
    else if (arg === "--no-interaction-probe") options.probeInteractions = false;
    else if (arg === "--help" || arg === "-h") flags.help = true;
    else if (arg === "--issue") options.issue = argv[++i] || null;
    else if (arg === "--company") options.company = argv[++i] || null;
    else if (arg === "--limit") options.limit = Number(argv[++i]) || 500;
    else if (arg === "--stale-queued-hours")
      options.staleQueuedHours = Number(argv[++i]) || DEFAULT_STALE_QUEUED_HOURS;
    else if (arg === "--handoff-grace-minutes")
      options.handoffGraceMinutes = Number(argv[++i]) || DEFAULT_HANDOFF_GRACE_MINUTES;
    else throw new Error(`未知参数: ${arg}`);
  }
  return { flags, options };
}

const HELP = `hermes-open-issue-liveness-scan — 开放工单活路扫描

  --json                       机器读 JSON
  --brief                      一行心脏起搏
  --dead-letter-only           只看无活路工单; 存在时退出码 3 (可当门禁)
  --no-interaction-probe       关掉挂起交互复核 (默认开启: 只在准备判死的工单上多查一次)
  --issue <uuid>               用该工单解析 companyId (心法 #148)
  --company <cid>              指定 companyId (默认取 PAPERCLIP_COMPANY_ID)
  --limit <n>                  工单列表条数上限 (默认 500)
  --stale-queued-hours <n>     排队超期阈值小时数 (默认 ${DEFAULT_STALE_QUEUED_HOURS})
  --handoff-grace-minutes <n>  run 落幕交接宽限分钟数 (默认 ${DEFAULT_HANDOFF_GRACE_MINUTES})
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

/** companyId 解析: --company > PAPERCLIP_COMPANY_ID > 从 --issue 反查 (心法 #148) */
export async function resolveCompanyId({ apiBase, apiKey, companyId, issueId, fetchImpl } = {}) {
  if (companyId) return companyId;
  if (!issueId) return null;
  const issue = await getJson(`${apiBase}/issues/${issueId}`, { apiKey, fetchImpl });
  return (issue && issue.companyId) || null;
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (err) {
    console.error(String(err.message || err));
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

  const issueId = options.issue || env.PAPERCLIP_TASK_ID || null;
  const companyId = await resolveCompanyId({
    apiBase,
    apiKey,
    companyId: options.company || env.PAPERCLIP_COMPANY_ID || null,
    issueId,
  });
  if (!companyId) {
    console.error("无法解析 companyId (--company / PAPERCLIP_COMPANY_ID / --issue 均未给出)");
    return 2;
  }

  // 必须翻页: 单枪 `?limit=N` 会静默截断 (469 条时漏 69, 含 3 张等拍板) —
  // 活路判定被喂短名单就会把"看不见"读成"有活路". 见 scripts/lib/paperclip-issue-scan.mjs
  const scanRows = await scanAllIssues({
    loadPage: async (params) =>
      pickIssues(await getJson(`${apiBase}/companies/${companyId}/issues?${params.toString()}`, { apiKey })),
    pageLimit: options.limit,
  });
  let scan = scanIssues(scanRows.rows, {
    now: Date.now(),
    queuedStaleHours: options.staleQueuedHours,
    handoffGraceMinutes: options.handoffGraceMinutes,
  });

  // 准备判死的工单才值得多花一次 API: 复核它是否挂在一条"回复即唤醒"的挂起交互上.
  // 实测 COOA-114 (in_progress / 零 run / 零 monitor) 挂着 ask_user_questions 被误报"假活着".
  if (options.probeInteractions) {
    const candidates = scan.rows.filter((row) => PROBE_VERDICTS.includes(row.verdict));
    for (const row of candidates) {
      const interactions = await getJson(`${apiBase}/issues/${row.id}/interactions`, { apiKey });
      applyInteractionProbe(row, interactions);
    }
    scan = regroupScan(scan.rows, { now: Date.now() });
  }

  if (flags.json) console.log(JSON.stringify(scan, null, 2));
  else if (flags.brief) console.log(renderBrief(scan));
  else if (flags.deadLetterOnly) {
    const rows = scan.byVerdict.dead_letter || [];
    if (rows.length === 0) console.log("DEAD-LETTER 0 条 — 全部开放工单都有活路");
    else {
      console.log(`DEAD-LETTER ${rows.length} 条 (阻塞但零 blocker/零 owner/零 monitor, 永不自动恢复)`);
      for (const row of rows) console.log(`  ${labelOf(row)}  ${row.title.slice(0, 40)}  ${idleText(row)}`);
    }
  } else console.log(renderText(scan));

  if (flags.deadLetterOnly && (scan.byVerdict.dead_letter || []).length > 0) return 3;
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
