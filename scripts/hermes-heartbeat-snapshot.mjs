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
 * 用法:
 *   node scripts/hermes-heartbeat-snapshot.mjs                 # 人读紧凑快照
 *   node scripts/hermes-heartbeat-snapshot.mjs --json          # 机器读 JSON
 *   node scripts/hermes-heartbeat-snapshot.mjs --issue <uuid> --company <cid>
 *
 * 环境变量: PAPERCLIP_API_URL / PAPERCLIP_API_KEY / PAPERCLIP_RUN_ID / PAPERCLIP_TASK_ID
 *
 * 退出码: 0 = 已产出快照 (含"部分字段不可用"的诚实降级); 2 = 连 API base / key 都没有.
 */

import path from "node:path";
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

/** 命令行参数解析 (可测) */
export function parseArgs(argv = []) {
  const flags = { json: false, help: false, skipInbox: false };
  const options = { issue: null, company: null, apiBase: null, routineIds: [] };
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
      case "--issue":
        options.issue = next() ?? null;
        break;
      case "--company":
        options.company = next() ?? null;
        break;
      case "--api-base":
        options.apiBase = next() ?? null;
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
        }
        break;
    }
  }
  return { flags, options };
}

const HELP = `hermes-heartbeat-snapshot — Paperclip routine 心跳确定性快照

用法:
  node scripts/hermes-heartbeat-snapshot.mjs [--json] [--issue <id|key>] [--company <cid>]
                                            [--routine-ids a,b,c] [--skip-inbox] [--api-base <url>]

说明:
  --routine-ids  当 companies-scoped list 端点不可用时, 按已知 routine id 走单条端点回退.
                 不传则诚实标注 routines: unavailable, 不编造数据.
`;

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
    fetchImpl = globalThis.fetch,
  } = config;

  const snapshot = {
    apiBase,
    issue: null,
    companyId: company,
    routines: { source: null, unavailableReason: null, items: [] },
    inbox: null,
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
  return lines.join("\n");
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
  });

  process.stdout.write(
    flags.json ? `${JSON.stringify(snapshot, null, 2)}\n` : `${renderText(snapshot)}\n`
  );
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
