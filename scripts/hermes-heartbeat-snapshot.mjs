#!/usr/bin/env node
/**
 * scripts/hermes-heartbeat-snapshot.mjs
 *
 * Paperclip routine 心跳巡检的**确定性快照工具** (Hermes PM 专用).
 *
 * 背景: COOA-114 主线长期心跳每 15 分钟唤醒一次, 期间反复踩到同一批坑 —
 * API base 少/多 `/api`、单个 routine 真值要从嵌套对象取、list 端点偶发死、
 * inbox 桶时而 null 时而 error 时而 5 个键、字段阶段态被误判为异常。
 * 这些坑此前靠注释里的"心法 #N"口口相传, 每轮重写一遍 shell 又会重新踩一遍。
 *
 * 本脚本把这些坑一次性固化为代码 + 单测:
 *
 *   1. `normalizeApiBase()`      — 裸 origin / 带尾斜杠 / 已带 /api 三种形态自适应
 *                                  (心法 #84/#159/#161)
 *   2. `pickRoutines()`          — list 端点回包形态自适应; `{error}` / 空 / 数组都安全
 *                                  (心法 #78/#155/#184/#188)
 *   3. `summarizeRoutine()`      — 真值一步 lookup: `lastRun.linkedIssue.{identifier,status,updatedAt}`
 *                                  + `lastRun.dispatchFingerprint`; 字段缺失只登记为
 *                                  `phaseNullFields` (字段阶段态), **绝不报错**
 *                                  (心法 #147/#162/#167/#170/#177)
 *   4. `summarizeInbox()`        — inbox 桶数取自 array.length / number / object keys,
 *                                  `null` 与 `{error}` 都退化为"退化态"而非异常
 *                                  (心法 #138/#143/#153)
 *   5. `--routine-ids` 回退      — list 端点死掉时按已知 routine id 走单条端点
 *                                  (心法 #184/#188 端点反漂移)
 *
 *   6. `summarizeQueue()`        — issues 列表 → 四桶工单大盘 (进行中 / 等拍板 / 阻塞 / 待办),
 *                                  todo 与 backlog 合并计 (与 scripts/coolie-dev-task.sh 同口径)
 *   7. `snapshotSignature()`     — 盘面**规范化指纹**: 排序后的 issue/routines/inbox/queue 元组做 sha256,
 *                                  与上一轮保存的指纹比对 → `changed: true|false` + 人读 delta 行.
 *                                  心跳在盘面无变化时只需发一行, 不再重贴 12KB 样板
 *   8. `--brief`                 — 一行心脏起搏 (无变化一行, 有变化一行 + delta 行)
 *
 * 用法:
 *   node scripts/hermes-heartbeat-snapshot.mjs                 # 人读紧凑快照
 *   node scripts/hermes-heartbeat-snapshot.mjs --brief         # 一行心脏起搏 (心跳默认用这个)
 *   node scripts/hermes-heartbeat-snapshot.mjs --json          # 机器读 JSON
 *   node scripts/hermes-heartbeat-snapshot.mjs --issue <uuid> --company <cid>
 *   node scripts/hermes-heartbeat-snapshot.mjs --no-state      # 只读盘面, 不写比对状态
 *
 * 环境变量: PAPERCLIP_API_URL / PAPERCLIP_API_KEY / PAPERCLIP_RUN_ID / PAPERCLIP_TASK_ID
 *
 * 退出码: 0 = 已产出快照 (含"部分字段不可用"的诚实降级); 2 = 连 API base / key 都没有.
 */

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "..");

/** inbox 的五个桶 (心法 #87/#143) */
export const INBOX_BUCKETS = [
  "pendingApprovals",
  "failures",
  "failedRuns",
  "mentionedBy",
  "joinRequests",
];

/**
 * 把任意形态的 Paperclip origin 归一为带 `/api` 的 base.
 * - `http://127.0.0.1:3100`      → `http://127.0.0.1:3100/api`
 * - `http://127.0.0.1:3100/`     → `http://127.0.0.1:3100/api`
 * - `http://127.0.0.1:3100/api`  → 不变
 * - `http://127.0.0.1:3100/api/` → `http://127.0.0.1:3100/api`
 */
export function normalizeApiBase(raw) {
  if (typeof raw !== "string") return null;
  let base = raw.trim();
  if (base === "") return null;
  base = base.replace(/\/+$/, "");
  if (/\/api$/.test(base) || /\/api\//.test(base)) return base;
  return `${base}/api`;
}

/** list 端点回包形态自适应; 返回 [] 表示"端点没给出 routine 列表" (心法 #78/#184/#188) */
export function pickRoutines(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    if (Array.isArray(payload.routines)) return payload.routines;
    if (Array.isArray(payload.data)) return payload.data;
  }
  return [];
}

/** 回包是不是一个 API 错误 (例如 `{error:"API route not found"}`) */
export function apiErrorOf(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  return typeof payload.error === "string" ? payload.error : null;
}

/** 角色识别: 心祖 (15 分钟常驻) / 交付主线 (小时级) / 示范项目 (小时级) */
export function roleForRoutine(routine) {
  const r = routine ?? {};
  const title = `${r.title ?? ""} ${r.name ?? ""}`;
  const triggers = Array.isArray(r.triggers) ? r.triggers : [];
  const cron = triggers[0]?.cronExpression ?? "";
  if (/Foundry Evolution|持续研发与版本升级/.test(title)) return "心祖";
  if (/示范/.test(title)) return "示范项目";
  if (/交付主线|交付工厂|AI 原生交付/.test(title)) return "交付主线";
  if (cron === "*/15 * * * *") return "心祖";
  return "其他";
}

const PHASE_NULL = (value) => value === null || value === undefined;

/**
 * routine → 紧凑真值摘要.
 * 缺失字段只登记进 `phaseNullFields` (字段阶段态, 心法 #124/#138/#170/#177),
 * 不抛错、不当作异常 —— 这是本工具与"手搓 jq"最大的区别.
 */
export function summarizeRoutine(routine) {
  const r = routine ?? {};
  const lastRun = (r.lastRun && typeof r.lastRun === "object" ? r.lastRun : {}) ?? {};
  const linked = lastRun.linkedIssue && typeof lastRun.linkedIssue === "object" ? lastRun.linkedIssue : null;
  const trigger = (Array.isArray(r.triggers) ? r.triggers[0] : null) ?? {};

  const summary = {
    id: r.id ?? null,
    title: r.title ?? r.name ?? null,
    role: roleForRoutine(r),
    status: r.status ?? null,
    fingerprint: lastRun.dispatchFingerprint ?? null,
    linkedIssueId: lastRun.linkedIssueId ?? null,
    linkedIssue: linked
      ? {
          identifier: linked.identifier ?? null,
          status: linked.status ?? null,
          updatedAt: linked.updatedAt ?? null,
        }
      : null,
    cronExpression: trigger.cronExpression ?? null,
    lastFiredAt: trigger.lastFiredAt ?? r.lastTriggeredAt ?? null,
    nextRunAt: trigger.nextRunAt ?? r.nextRunAt ?? null,
    lastResult: trigger.lastResult ?? null,
    phaseNullFields: [],
  };

  const watched = {
    fingerprint: summary.fingerprint,
    linkedIssueId: summary.linkedIssueId,
    "trigger.cronExpression": summary.cronExpression,
    "trigger.lastFiredAt": summary.lastFiredAt,
    "trigger.nextRunAt": summary.nextRunAt,
  };
  for (const [name, value] of Object.entries(watched)) {
    if (PHASE_NULL(value)) summary.phaseNullFields.push(name);
  }
  if (summary.linkedIssue && PHASE_NULL(summary.linkedIssue.identifier)) {
    summary.phaseNullFields.push("linkedIssue.identifier");
  }
  return summary;
}

function bucketCount(value) {
  if (Array.isArray(value)) return value.length;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object") {
    const keys = Object.keys(value);
    return keys.length > 0 ? keys.length : null;
  }
  return null;
}

/**
 * inbox → 桶计数. `null` / `{error}` / 缺键统一退化为"退化态",
 * 不是异常 (心法 #138/#143/#153).
 */
export function summarizeInbox(payload) {
  const error = apiErrorOf(payload);
  const out = { degenerate: false, error, shape: null };
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    out.degenerate = true;
    out.shape = Array.isArray(payload) ? "array" : "none";
    for (const bucket of INBOX_BUCKETS) out[bucket] = null;
    return out;
  }
  if (error) out.degenerate = true;
  let allNull = true;
  for (const bucket of INBOX_BUCKETS) {
    const count = bucketCount(payload[bucket]);
    out[bucket] = count;
    if (count !== null) allNull = false;
  }
  out.shape = allNull ? "all-null" : "populated";
  return out;
}

/** issues 列表回包形态自适应: 数组 / `{issues:[...]}` / `{data:[...]}` (心法 #78 同族坑) */
export function pickIssues(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    if (Array.isArray(payload.issues)) return payload.issues;
    const viaRoutines = pickRoutines(payload);
    if (viaRoutines.length > 0) return viaRoutines;
  }
  return [];
}

/** 工单大盘四桶 (与 scripts/coolie-dev-task.sh 同口径: todo 与 backlog 合并计) */
export const QUEUE_BUCKETS = [
  { key: "in_progress", label: "进行中", statuses: ["in_progress"] },
  { key: "in_review", label: "等拍板", statuses: ["in_review"] },
  { key: "blocked", label: "阻塞中", statuses: ["blocked"] },
  { key: "todo", label: "待办", statuses: ["todo", "backlog"] },
];

/**
 * issues 列表 → 四桶工单大盘.
 * 只保留稳定标识/状态字段 (identifier/status/priority/checkoutRunId),
 * 并按 identifier 排序 —— 这样指纹不会因回包顺序抖动而误报"变化".
 */
export function summarizeQueue(issues) {
  const rows = pickIssues(issues);
  const byBucket = Object.fromEntries(QUEUE_BUCKETS.map((b) => [b.key, []]));
  let unscoped = 0;
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const bucket = QUEUE_BUCKETS.find((b) => b.statuses.includes(raw.status));
    if (!bucket) {
      unscoped += 1;
      continue;
    }
    byBucket[bucket.key].push({
      id: raw.id ?? null,
      identifier: raw.identifier ?? null,
      title: raw.title ?? null,
      status: raw.status ?? null,
      priority: raw.priority ?? null,
      checkoutRunId: raw.checkoutRunId ?? null,
    });
  }
  for (const bucket of QUEUE_BUCKETS) {
    byBucket[bucket.key].sort((a, b) => queueKeyOf(a).localeCompare(queueKeyOf(b)));
  }
  return { total: rows.length, unscoped, buckets: byBucket };
}

/** 工单大盘一行摘要: `2/1/6/4` (进行中/等拍板/阻塞/待办) */
export function queueLineCounts(queue) {
  if (!queue) return null;
  return QUEUE_BUCKETS.map((b) => queue.buckets[b.key]?.length ?? 0).join("/");
}

/**
 * 大盘里的稳定显示键: 有 identifier 用 identifier, 没有就用 id 前 8 位.
 * (实测: 部分受限工单 identifier 为 null 只有 uuid, 不兜底就会渲染成空串)
 */
export function queueKeyOf(item) {
  if (!item) return "?";
  if (item.identifier) return item.identifier;
  if (item.id) return String(item.id).slice(0, 8);
  return "?";
}

/**
 * 盘面规范化: 只取"变了才值得知道"的维度, 且全部排序 → 可做稳定 sha256.
 * 字段阶段态 (phase-null) 刻意不进指纹: 它每轮都在 null 与实值之间摆,
 * 进指纹会让 changed 长期恒为 true, 反而淹没真信号.
 */
export function canonicalSnapshot(snapshot) {
  const s = snapshot ?? {};
  const issue =
    s.issue && !s.issue.error
      ? [s.issue.identifier, s.issue.status, s.issue.priority, s.issue.checkoutRunId ?? null]
      : null;
  const routines = (s.routines?.items ?? [])
    .map((r) => [
      r.id ?? null,
      r.role ?? null,
      r.status ?? null,
      r.fingerprint ?? null,
      r.linkedIssue?.identifier ?? null,
      r.linkedIssue?.status ?? null,
    ])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const inbox = s.inbox ? INBOX_BUCKETS.map((b) => [b, s.inbox[b] ?? null]) : null;
  const queue = s.queue
    ? QUEUE_BUCKETS.map((b) => [
        b.key,
        (s.queue.buckets?.[b.key] ?? []).map((i) => `${queueKeyOf(i)}:${i.status}`),
      ])
    : null;
  return { issue, routines, inbox, queue };
}

/** 盘面指纹 (16 hex); 同盘面必同指纹, 与回包顺序无关 */
export function snapshotSignature(snapshot) {
  return createHash("sha256").update(JSON.stringify(canonicalSnapshot(snapshot))).digest("hex").slice(0, 16);
}

/** 两轮盘面的差异 → 人读 delta 行 (最多 12 条, 超出折叠计数) */
export function diffSnapshots(previous, current) {
  if (!previous) return ["(无上一轮状态, 本轮为基线)"];
  const before = previous.canonical ?? canonicalSnapshot(previous);
  const after = canonicalSnapshot(current);
  const deltas = [];

  if (JSON.stringify(before.issue) !== JSON.stringify(after.issue)) {
    const fmt = (i) => (i ? `${i[0]} ${i[1]} ${i[2]} run=${String(i[3] ?? "null").slice(0, 8)}` : "unavailable");
    deltas.push(`~ issue: ${fmt(before.issue)} -> ${fmt(after.issue)}`);
  }

  const byId = (list) => new Map((list ?? []).map((r) => [String(r[0]), r]));
  const oldRoutines = byId(before.routines);
  const newRoutines = byId(after.routines);
  for (const [id, next] of newRoutines) {
    const prev = oldRoutines.get(id);
    if (!prev) {
      deltas.push(`+ routine ${next[1] ?? id} 出现 (status=${next[2]}, fp=${String(next[3] ?? "null").slice(0, 12)})`);
      continue;
    }
    if (prev[3] !== next[3]) {
      deltas.push(`~ ${next[1] ?? id} fp ${String(prev[3] ?? "null").slice(0, 12)} -> ${String(next[3] ?? "null").slice(0, 12)}`);
    }
    const oldLink = `${prev[4] ?? "null"} ${prev[5] ?? "null"}`;
    const newLink = `${next[4] ?? "null"} ${next[5] ?? "null"}`;
    if (oldLink !== newLink) deltas.push(`~ ${next[1] ?? id} linkedIssue ${oldLink} -> ${newLink}`);
  }
  for (const [id, prev] of oldRoutines) {
    if (!newRoutines.has(id)) deltas.push(`- routine ${prev[1] ?? id} 消失`);
  }

  const oldInbox = new Map((before.inbox ?? []).map(([k, v]) => [k, v]));
  for (const [bucket, count] of after.inbox ?? []) {
    const prior = oldInbox.has(bucket) ? oldInbox.get(bucket) : null;
    if (prior !== count) deltas.push(`~ inbox ${bucket} ${prior ?? "null"} -> ${count ?? "null"}`);
  }

  const oldQueue = new Map((before.queue ?? []).map(([k, ids]) => [k, new Set(ids ?? [])]));
  for (const [bucket, ids] of after.queue ?? []) {
    const prior = oldQueue.get(bucket) ?? new Set();
    const now = new Set(ids ?? []);
    for (const id of now) if (!prior.has(id)) deltas.push(`+ ${bucket}: ${id}`);
    for (const id of prior) if (!now.has(id)) deltas.push(`- ${bucket}: ${id}`);
  }

  if (deltas.length === 0) return [];
  if (deltas.length <= 12) return deltas;
  return [...deltas.slice(0, 12), `... 另有 ${deltas.length - 12} 条变化`];
}

/** 默认比对状态文件位置 (scripts/.hermes-tmp 已在 .gitignore 中) */
export const DEFAULT_STATE_PATH = path.join(HERE, ".hermes-tmp", "heartbeat-snapshot-state.json");

/** 读上一轮状态; 任何损坏/缺失都退化为 null (首轮无基线, 不是异常) */
export function readState(statePath = DEFAULT_STATE_PATH) {
  try {
    const raw = fs.readFileSync(statePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/** 写本轮状态; 写不进去也不影响心跳 (返回 false, 不抛错) */
export function writeState(state, statePath = DEFAULT_STATE_PATH) {
  try {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
    return true;
  } catch {
    return false;
  }
}

/** 命令行参数解析 (可测) */
export function parseArgs(argv = []) {
  const flags = { json: false, help: false, skipInbox: false, skipQueue: false, brief: false, noState: false };
  const options = { issue: null, company: null, apiBase: null, routineIds: [], state: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i];
    switch (arg) {
      case "--json":
        flags.json = true;
        break;
      case "--help":
      case "-h":
        flags.help = true;
        break;
      case "--skip-inbox":
        flags.skipInbox = true;
        break;
      case "--brief":
        flags.brief = true;
        break;
      case "--no-state":
        flags.noState = true;
        break;
      case "--skip-queue":
        flags.skipQueue = true;
        break;
      case "--issue":
        options.issue = next() ?? null;
        break;
      case "--company":
        options.company = next() ?? null;
        break;
      case "--api-base":
        options.apiBase = next() ?? null;
        break;
      case "--state":
        options.state = next() ?? null;
        break;
      case "--routine-ids":
        options.routineIds = (next() ?? "").split(",").map((s) => s.trim()).filter(Boolean);
        break;
      default:
        if (arg.startsWith("--routine-ids=")) {
          options.routineIds = arg.slice("--routine-ids=".length).split(",").map((s) => s.trim()).filter(Boolean);
        } else if (arg.startsWith("--issue=")) {
          options.issue = arg.slice("--issue=".length);
        } else if (arg.startsWith("--company=")) {
          options.company = arg.slice("--company=".length);
        } else if (arg.startsWith("--api-base=")) {
          options.apiBase = arg.slice("--api-base=".length);
        } else if (arg.startsWith("--state=")) {
          options.state = arg.slice("--state=".length);
        }
        break;
    }
  }
  return { flags, options };
}

const HELP = `hermes-heartbeat-snapshot — Paperclip routine 心跳确定性快照

用法:
  node scripts/hermes-heartbeat-snapshot.mjs [--brief|--json] [--issue <id|key>] [--company <cid>]
                                            [--routine-ids a,b,c] [--skip-inbox] [--skip-queue]
                                            [--state <path>] [--no-state] [--api-base <url>]

说明:
  --routine-ids  当 companies-scoped list 端点不可用时, 按已知 routine id 走单条端点回退.
                 不传则诚实标注 routines: unavailable, 不编造数据.
  --brief        一行心脏起搏: 无变化一行, 有变化一行 + delta 行.
  --state        与上一轮比对用的状态文件 (默认 scripts/.hermes-tmp/heartbeat-snapshot-state.json).
  --no-state     只读盘面, 不写比对状态 (适合一次性排查).
`;

/** 默认状态路径可用 env 覆盖 (跨机复刻时不必改代码) */

async function getJson(url, { apiKey, runId, fetchImpl = globalThis.fetch } = {}) {
  const headers = { Accept: "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  if (runId) headers["X-Paperclip-Run-Id"] = runId;
  try {
    const response = await fetchImpl(url, { headers });
    const text = await response.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    return { ok: response.ok, status: response.status, body, text };
  } catch (error) {
    return { ok: false, status: 0, body: null, text: String(error?.message ?? error) };
  }
}

/** 收集快照 (网络部分; 纯函数部分全部可单测) */
export async function collectSnapshot(config) {
  const {
    apiBase,
    apiKey = null,
    runId = null,
    issue = null,
    company = null,
    routineIds = [],
    skipInbox = false,
    skipQueue = false,
    fetchImpl = globalThis.fetch,
  } = config;

  const snapshot = {
    apiBase,
    issue: null,
    companyId: company,
    routines: { source: null, unavailableReason: null, items: [] },
    inbox: null,
    queue: null,
    queueUnavailableReason: null,
  };

  // 1. issue 真值 + companyId 反查 (心法 #148: env 未注入 companyId 时走 issue 反查)
  if (issue) {
    const result = await getJson(`${apiBase}/issues/${issue}`, { apiKey, runId, fetchImpl });
    if (result.ok && result.body) {
      snapshot.issue = {
        id: result.body.id ?? null,
        identifier: result.body.identifier ?? null,
        title: result.body.title ?? null,
        status: result.body.status ?? null,
        priority: result.body.priority ?? null,
        checkoutRunId: result.body.checkoutRunId ?? null,
        executionRunId: result.body.executionRunId ?? null,
        companyId: result.body.companyId ?? null,
      };
      if (!snapshot.companyId && result.body.companyId) snapshot.companyId = result.body.companyId;
    } else {
      snapshot.issue = { error: apiErrorOf(result.body) ?? `HTTP ${result.status}`, text: result.text.slice(0, 200) };
    }
  }

  // 2. routines: companies-scoped list 是唯一真值源 (心法 #78/#155), 死掉时按 id 回退 (心法 #184/#188)
  if (snapshot.companyId) {
    const list = await getJson(`${apiBase}/companies/${snapshot.companyId}/routines`, { apiKey, runId, fetchImpl });
    const items = pickRoutines(list.body);
    if (items.length > 0) {
      snapshot.routines.source = "companies-list";
      snapshot.routines.items = items.map(summarizeRoutine);
    } else {
      const error = apiErrorOf(list.body) ?? `HTTP ${list.status}`;
      snapshot.routines.unavailableReason = `companies-list: ${error}`;
      if (routineIds.length > 0) {
        snapshot.routines.source = "single-endpoint-fallback";
        for (const id of routineIds) {
          const single = await getJson(`${apiBase}/routines/${id}`, { apiKey, runId, fetchImpl });
          if (single.ok && single.body) snapshot.routines.items.push(summarizeRoutine(single.body));
        }
        if (snapshot.routines.items.length === 0) {
          snapshot.routines.source = null;
          snapshot.routines.unavailableReason += "; single-endpoint: all failed";
        }
      }
    }
    // 3. linkedIssue.identifier 缺失时用 linkedIssueId 补一步 lookup (心法 #147/#167)
    for (const item of snapshot.routines.items) {
      if (item.linkedIssueId && (!item.linkedIssue || PHASE_NULL(item.linkedIssue.identifier))) {
        const issue = await getJson(`${apiBase}/issues/${item.linkedIssueId}`, { apiKey, runId, fetchImpl });
        if (issue.ok && issue.body) {
          item.linkedIssue = {
            identifier: issue.body.identifier ?? null,
            status: issue.body.status ?? null,
            updatedAt: issue.body.updatedAt ?? null,
          };
        }
      }
    }
  } else {
    snapshot.routines.unavailableReason = "no companyId (pass --company or --issue)";
  }

  // 4. inbox 桶 (退化态不是异常, 心法 #138/#143/#153)
  if (!skipInbox && snapshot.companyId) {
    const inbox = await getJson(`${apiBase}/inbox?companyId=${snapshot.companyId}`, { apiKey, runId, fetchImpl });
    snapshot.inbox = summarizeInbox(inbox.body);
    if (snapshot.inbox.shape === "all-null" && !snapshot.inbox.error && !inbox.ok) {
      snapshot.inbox.error = `HTTP ${inbox.status}`;
      snapshot.inbox.degenerate = true;
    }
  }

  // 5. 工单大盘四桶 (心法 #56/#144: list 是初盘, 真值以单条 API 为终判)
  if (!skipQueue && snapshot.companyId) {
    const issues = await getJson(`${apiBase}/companies/${snapshot.companyId}/issues?limit=400`, {
      apiKey,
      runId,
      fetchImpl,
    });
    const rows = pickIssues(issues.body);
    if (rows.length > 0) {
      snapshot.queue = summarizeQueue(rows);
    } else {
      snapshot.queueUnavailableReason = apiErrorOf(issues.body) ?? `HTTP ${issues.status}`;
    }
  }

  snapshot.generatedAt = new Date().toISOString();
  return snapshot;
}

function shortTime(value) {
  if (!value || typeof value !== "string") return "null";
  const match = value.match(/T(\d{2}:\d{2}:\d{2})/);
  return match ? `${match[1]}Z` : value;
}

/** 人读紧凑渲染: 一屏看完, 不打印重复的样板文字 */
export function renderText(snapshot) {
  const lines = [];
  lines.push(`Hermes heartbeat snapshot · ${snapshot.generatedAt}`);
  lines.push(`api     : ${snapshot.apiBase}`);
  if (snapshot.issue) {
    const i = snapshot.issue;
    lines.push(
      i.error
        ? `issue   : unavailable (${i.error})`
        : `issue   : ${i.identifier} ${i.status} ${i.priority} run=${(i.checkoutRunId ?? "null").slice(0, 8)}`
    );
  }
  lines.push(`company : ${snapshot.companyId ?? "null"}`);
  if (snapshot.routines.source) {
    lines.push(`routines: ${snapshot.routines.items.length} via ${snapshot.routines.source}`);
    for (const r of snapshot.routines.items) {
      const link = r.linkedIssue
        ? `${r.linkedIssue.identifier ?? "?"} ${r.linkedIssue.status ?? "?"} (${shortTime(r.linkedIssue.updatedAt)})`
        : `linkedIssueId=${(r.linkedIssueId ?? "null").slice(0, 8)}`;
      lines.push(
        `  [${r.role}] ${r.status} fp=${(r.fingerprint ?? "null").slice(0, 12)} ` +
          `cron=${r.cronExpression ?? "null"} fired=${shortTime(r.lastFiredAt)} next=${shortTime(r.nextRunAt)} -> ${link}`
      );
      if (r.phaseNullFields.length > 0) {
        lines.push(`    phase-null: ${r.phaseNullFields.join(", ")}`);
      }
    }
  } else {
    lines.push(`routines: unavailable (${snapshot.routines.unavailableReason})`);
  }
  if (snapshot.inbox) {
    const inbox = snapshot.inbox;
    const counts = INBOX_BUCKETS.map((b) => `${b}=${inbox[b] ?? "null"}`).join(" ");
    lines.push(`inbox   : ${counts}${inbox.error ? ` error="${inbox.error}"` : ""}`);
  }
  if (snapshot.queue) {
    lines.push(`queue   : ${queueLineCounts(snapshot.queue)} 总计 ${snapshot.queue.total} (进行中/等拍板/阻塞/待办)`);
    for (const bucket of QUEUE_BUCKETS) {
      const items = snapshot.queue.buckets[bucket.key] ?? [];
      if (items.length === 0) continue;
      lines.push(`  ${bucket.label}: ${items.map((i) => queueKeyOf(i)).join(" ")}`);
    }
  } else if (snapshot.queueUnavailableReason) {
    lines.push(`queue   : unavailable (${snapshot.queueUnavailableReason})`);
  }
  if (snapshot.signature) {
    lines.push(`changed : ${snapshot.changed === true} sig=${snapshot.signature} prev=${snapshot.previousSignature ?? "null"}`);
    for (const delta of snapshot.deltas ?? []) lines.push(`  ${delta}`);
  }
  return lines.join("\n");
}

/**
 * 一行心脏起搏: 盘面无变化时只输出一行 (不再重贴 12KB 样板),
 * 有变化时追加 delta 行. 这是心跳的默认输出形态.
 */
export function renderBrief(snapshot) {
  const stamp = snapshot.generatedAt ?? "";
  const issue =
    snapshot.issue && !snapshot.issue.error
      ? `${snapshot.issue.identifier} ${snapshot.issue.status}`
      : "issue unavailable";
  const routines = snapshot.routines?.source
    ? `${snapshot.routines.items.filter((r) => r.status === "active").length}/${snapshot.routines.items.length} active`
    : "routines unavailable";
  const counts = queueLineCounts(snapshot.queue) ?? "null";
  const inbox = snapshot.inbox
    ? `pa=${snapshot.inbox.pendingApprovals ?? "null"} f=${snapshot.inbox.failures ?? "null"} fr=${snapshot.inbox.failedRuns ?? "null"}`
    : "inbox=null";
  const state = snapshot.signature ? (snapshot.changed ? "CHANGED" : "no-change") : "no-baseline";
  const head =
    `HB ${stamp} ${state} sig=${snapshot.signature ?? "null"} · ${issue} · ${routines} · ` +
    `queue ${counts} · ${inbox}`;
  return [head, ...(snapshot.deltas ?? []).map((d) => `  ${d}`)].join("\n");
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const { flags, options } = parseArgs(argv);
  if (flags.help) {
    process.stdout.write(HELP);
    return 0;
  }
  const apiBase = normalizeApiBase(options.apiBase ?? env.PAPERCLIP_API_URL);
  if (!apiBase) {
    process.stderr.write("缺少 API base: 请设置 PAPERCLIP_API_URL 或传 --api-base\n");
    return 2;
  }
  const apiKey = env.PAPERCLIP_API_KEY ?? null;
  if (!apiKey) {
    process.stderr.write("缺少 PAPERCLIP_API_KEY, 无法请求 Paperclip API\n");
    return 2;
  }

  const routineIds =
    options.routineIds.length > 0
      ? options.routineIds
      : (env.HERMES_ROUTINE_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  const snapshot = await collectSnapshot({
    apiBase,
    apiKey,
    runId: env.PAPERCLIP_RUN_ID ?? null,
    issue: options.issue ?? env.PAPERCLIP_TASK_ID ?? null,
    company: options.company ?? env.PAPERCLIP_COMPANY_ID ?? null,
    routineIds,
    skipInbox: flags.skipInbox,
    skipQueue: flags.skipQueue,
  });

  // 与上一轮比对: 只在完整盘面 (未跳过任何区块) 上做, 避免半盘面污染基线
  const statePath = options.state ?? env.HERMES_HEARTBEAT_STATE ?? DEFAULT_STATE_PATH;
  const fullBoard = !flags.skipInbox && !flags.skipQueue;
  if (!flags.noState && fullBoard) {
    const previous = readState(statePath);
    snapshot.signature = snapshotSignature(snapshot);
    snapshot.previousSignature = previous?.signature ?? null;
    snapshot.changed = snapshot.previousSignature !== snapshot.signature;
    snapshot.deltas = snapshot.changed ? diffSnapshots(previous, snapshot) : [];
    snapshot.statePath = statePath;
    writeState(
      {
        signature: snapshot.signature,
        savedAt: snapshot.generatedAt,
        canonical: canonicalSnapshot(snapshot),
      },
      statePath
    );
  }

  const output = flags.brief
    ? renderBrief(snapshot)
    : flags.json
      ? JSON.stringify(snapshot, null, 2)
      : renderText(snapshot);
  process.stdout.write(`${output}\n`);
  return 0;
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      process.stderr.write(`heartbeat snapshot failed: ${error?.stack ?? error}\n`);
      process.exit(1);
    });
}
