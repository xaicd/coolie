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
 *   9. `summarizeWaiting()`      — 本 issue **自己的挂起交互** (等人类回复的卡片).
 *                                  大盘回答"工单还回不回得来", 这一节回答"我还在等谁":
 *                                  挂起卡片不进指纹 (年龄每轮都在长), 只记 (计数, kinds 集合)
 *  10. `summarizeGit()`          — 本地仓库的**交付状态**: 本机 HEAD 有没有真的落到远端.
 *                                  前三问都不覆盖这一格 —— 工单可以标 done、评论可以写"已交付",
 *                                  而那个 commit 只活在本地 HEAD 上 (axiom: No Artifact, No Done).
 *                                  同仓还有并发提交进程替心跳落盘 commit, 手工 `rev-list` 每轮重敲.
 *                                  进指纹的只有 delivery 等价类 (synced/unpushed/behind),
 *                                  head sha 与脏文件数只作人读字段 (每轮都在变, 进指纹会让 changed 恒为 true)
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
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  scanIssues,
  VERDICTS,
  ATTENTION_VERDICTS,
  WAKE_CONTINUATION_POLICIES,
  pickInteractions,
} from "./hermes-open-issue-liveness-scan.mjs";

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
 * 活路汇总 (与 liveness 扫描器同源, 不重复实现分类逻辑).
 *
 * 巡检要回答的不只是"有几条 blocked", 而是"这些工单还回不回得来"。
 * 这里把 liveness 扫描器的判定结果压成心跳要用的最小集:
 *   - counts: 各 verdict 计数 (对齐 VERDICTS 全集, 缺失记 0, 便于跨轮比对)
 *   - attention: 需要掌柜出手的 (identifier, verdict, reason)
 *
 * 刻意**不含 idleHours**: 它每轮都在增长, 一旦进指纹 changed 就恒为 true,
 * 把真信号淹没 —— 与 canonicalSnapshot 里 phase-null 同一类坑。
 * 同理 attention 按 identifier 排序, 但扫描器内部按 idle 倒序 (轮次间会抖动)。
 */
export function summarizeLiveness(issues, options = {}) {
  const scan = scanIssues(issues, options);
  const counts = {};
  for (const verdict of VERDICTS) counts[verdict] = scan.counts[verdict] ?? 0;
  const attention = [];
  for (const verdict of ATTENTION_VERDICTS) {
    for (const row of scan.byVerdict[verdict] ?? []) {
      attention.push({
        identifier: row.identifier ?? row.shortId ?? null,
        verdict,
        status: row.status ?? null,
        priority: row.priority ?? null,
        idleHours: row.idleHours ?? null,
        reason: row.reasons?.[row.reasons.length - 1] ?? null,
      });
    }
  }
  attention.sort((a, b) => String(a.identifier).localeCompare(String(b.identifier)));
  return {
    openCount: scan.openCount,
    attentionCount: scan.attentionCount,
    counts,
    attention,
  };
}

/**
 * 挂起卡片的年龄 (分钟, 取整); 时间戳缺失/不可解析 → null, 不猜.
 */
function ageMinutesOf(createdAt, now) {
  const stamp = Date.parse(createdAt ?? "");
  if (!Number.isFinite(stamp)) return null;
  return Math.max(0, Math.round((now - stamp) / 60000));
}

/**
 * 本 issue **自己**挂着的交互卡片 —— 心跳要回答的第三个问题: "我还在等谁".
 *
 * 前两问 ("大盘有几条" / "还回不回得来") 都不覆盖这一格: 主线 4/4 主轴已 done、
 * 盘面无死信, 而我本人正等着一封没人回复的卡片 —— 那是我唯一的等待路径, 却一直
 * 只活在评论的散文里. 这里把它变成可度量的一格:
 *   - pendingCount / kinds / oldestAgeMinutes: 卡片真值 (人读)
 *   - wakeCount: 其中"对方回复即唤醒本 run"的条数 (与 liveness 扫描器同源口径)
 *   - wakesAssignee 只作为**展示**字段, 不进指纹
 *
 * 进指纹的只有 (pendingCount, kinds 集合): 年龄每轮都在长, 进指纹会让 changed 恒为
 * true —— 与 canonicalSnapshot 里 idleHours / phase-null 同一类坑.
 * 查询失败/畸形回包只登记 checked=false + error, 不打断心跳.
 */
export function summarizeWaiting(payload, options = {}) {
  const now = options.now ?? Date.now();
  if (typeof payload === "string") {
    return { checked: false, error: "unparsable response", pendingCount: null, wakeCount: null, kinds: [], oldestAgeMinutes: null, items: [] };
  }
  const shapeOk = Array.isArray(payload) || (payload && typeof payload === "object" && Array.isArray(payload.interactions));
  const error = apiErrorOf(payload) ?? (shapeOk ? null : "unrecognized interactions payload");
  if (error) {
    return { checked: false, error, pendingCount: null, wakeCount: null, kinds: [], oldestAgeMinutes: null, items: [] };
  }
  const items = pickInteractions(payload)
    .filter((item) => item && item.status === "pending")
    .map((item) => ({
      id: item.id ?? null,
      kind: item.kind ?? "interaction",
      continuationPolicy: item.continuationPolicy ?? null,
      resolverPolicy: item.resolverPolicy ?? null,
      createdAt: item.createdAt ?? null,
      ageMinutes: ageMinutesOf(item.createdAt, now),
      wakesAssignee: WAKE_CONTINUATION_POLICIES.includes(item.continuationPolicy),
    }))
    .sort((a, b) => String(a.kind).localeCompare(String(b.kind)) || String(a.id).localeCompare(String(b.id)));
  const ages = items.map((item) => item.ageMinutes).filter((value) => typeof value === "number");
  return {
    checked: true,
    error: null,
    pendingCount: items.length,
    wakeCount: items.filter((item) => item.wakesAssignee).length,
    kinds: [...new Set(items.map((item) => item.kind))].sort(),
    oldestAgeMinutes: ages.length > 0 ? Math.max(...ages) : null,
    items,
  };
}

/**
 * 当前 issue 的锁状态等价类 (指纹用), 不是 run id 字面量.
 * 心跳每轮都由 harness 重新签出本 issue → checkoutRunId 必然换新;
 * 把 run id 放进指纹会让每一轮都恒为 changed, "无变化就只发一行"直接失效.
 * 只区分: null(无锁) / self(本 run 持锁) / other(他人 run 持锁) / locked(不知道 self).
 */
export function lockStateOf(issue, selfRunId = null) {
  if (!issue || issue.error) return null;
  const run = issue.checkoutRunId ?? null;
  if (!run) return null;
  if (!selfRunId) return "locked";
  return run === selfRunId ? "self" : "other";
}

/** 交付状态等价类 —— 只有这四类进指纹 (数值细节会每轮摆动) */
export const GIT_DELIVERIES = ["synced", "unpushed", "behind", "no-upstream", "unavailable"];

/** 默认 git 执行器: 与心跳同仓 (REPO_ROOT), 只读命令, 失败抛错由调用方捕获 */
function defaultRunGit(args, cwd = REPO_ROOT) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 8 * 1024 * 1024,
  }).trim();
}

/**
 * 本地仓库交付状态 —— 心跳要回答的第四个问题: "我这轮交付真的到远端了吗".
 *
 * 为什么单开一格: 工单可以标 done、评论可以写"已交付", 而 commit 只活在本地 HEAD 上;
 * 同仓还常驻并发提交进程 (替心跳落盘 commit) —— 交付是否落地只能问 git, 不能问记忆.
 *
 * 进指纹的只有 `delivery` 等价类:
 *   - head sha: 每有一次提交就变 (并发提交进程随时落盘) → 进了指纹 changed 恒为 true
 *   - 脏文件数: 共享工作区里长期非零 → 同样会让 changed 失去意义
 * 两者只作为人读字段输出, 不进指纹 (与 idleHours / phase-null 同一类坑).
 *
 * git 不可用 / 不是仓库 / 无 upstream 时诚实降级 (`unavailable` / `no-upstream`),
 * 绝不假装 synced —— 假 synced 比不报更坏: 它会把未推送的交付读成已落地.
 */
export function summarizeGit(options = {}) {
  const upstream = options.upstream ?? "origin/main";
  const cwd = options.cwd ?? REPO_ROOT;
  const runGit = options.runGit ?? ((args) => defaultRunGit(args, cwd));
  const read = (args) => {
    try {
      return { ok: true, value: runGit(args) };
    } catch (error) {
      return { ok: false, value: null, error: String(error?.message ?? error) };
    }
  };

  const branch = read(["rev-parse", "--abbrev-ref", "HEAD"]);
  const head = read(["rev-parse", "--short", "HEAD"]);
  if (!branch.ok || !head.ok) {
    const detail = branch.error ?? head.error ?? "git unavailable";
    return {
      checked: false,
      error: detail.split("\n")[0].slice(0, 120),
      branch: null,
      head: null,
      upstream,
      ahead: null,
      behind: null,
      dirtyFiles: null,
      untrackedFiles: null,
      delivery: "unavailable",
    };
  }

  const counts = read(["rev-list", "--left-right", "--count", `${upstream}...HEAD`]);
  let ahead = null;
  let behind = null;
  if (counts.ok) {
    const match = String(counts.value).match(/^(\d+)\s+(\d+)$/);
    if (match) {
      behind = Number(match[1]);
      ahead = Number(match[2]);
    }
  }

  const status = read(["status", "--porcelain"]);
  let dirtyFiles = null;
  let untrackedFiles = null;
  if (status.ok) {
    const lines = String(status.value).split("\n").filter((line) => line.trim().length > 0);
    untrackedFiles = lines.filter((line) => line.startsWith("??")).length;
    dirtyFiles = lines.length - untrackedFiles;
  }

  const delivery =
    ahead === null ? "no-upstream" : ahead > 0 ? "unpushed" : behind > 0 ? "behind" : "synced";

  return {
    checked: true,
    error: null,
    branch: branch.value || null,
    head: head.value || null,
    upstream,
    ahead,
    behind,
    dirtyFiles,
    untrackedFiles,
    delivery,
  };
}

/**
 * "git=synced" / "git=UNPUSHED ahead=1" — 一行说清交付落没落地:
 *   - `git=skip` : 没查 (--skip-git)
 *   - `git=?`    : 查了但 git 不可用 —— 不假装已推送
 *   - `git=synced`          : HEAD 已全部在 upstream 上
 *   - `git=UNPUSHED ahead=1`: 有 1 个 commit 只在本地 —— 必须推送才能算交付 (大写以示需出手)
 */
export function gitDeliveryText(git) {
  if (!git) return "git=skip";
  if (git.checked === false) return "git=?";
  if (git.delivery === "synced") return "git=synced";
  if (git.delivery === "unpushed") return `git=UNPUSHED ahead=${git.ahead ?? "?"}`;
  if (git.delivery === "behind") return `git=behind=${git.behind ?? "?"}`;
  if (git.delivery === "no-upstream") return `git=no-upstream`;
  return `git=${git.delivery ?? "?"}`;
}

/**
 * 盘面规范化: 只取"变了才值得知道"的维度, 且全部排序 → 可做稳定 sha256.
 * 字段阶段态 (phase-null) 刻意不进指纹: 它每轮都在 null 与实值之间摆,
 * 进指纹会让 changed 长期恒为 true, 反而淹没真信号.
 * 同理: 本 issue 的 checkoutRunId 每轮换新, 指纹里只记 lockStateOf 等价类.
 */
export function canonicalSnapshot(snapshot) {
  const s = snapshot ?? {};
  const issue =
    s.issue && !s.issue.error
      ? [s.issue.identifier, s.issue.status, s.issue.priority, lockStateOf(s.issue, s.selfRunId ?? null)]
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
  // 活路: 只记"需出手"的 (identifier, verdict) 对与计数 —— 不含 idleHours (每轮都在长)
  const liveness = s.liveness
    ? [
        s.liveness.attentionCount ?? null,
        (s.liveness.attention ?? []).map((a) => `${a.identifier}:${a.verdict}`).sort(),
      ]
    : null;
  // 挂起卡片: 只记 (计数, kinds) —— 年龄每轮都在长, 进指纹会让 changed 恒为 true
  const waiting = s.waiting
    ? [s.waiting.pendingCount ?? null, (s.waiting.kinds ?? []).slice().sort()]
    : null;
  // 交付: 只记 delivery 等价类 —— head sha 每有提交就变, 脏文件数在共享工作区长期非零,
  // 两者进指纹都会让 changed 恒为 true (与 idleHours / phase-null 同一类坑)
  const git = s.git ? (s.git.delivery ?? null) : null;
  return { issue, routines, inbox, queue, liveness, waiting, git };
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
    const fmt = (i) => (i ? i.join(" ") : "unavailable");
    const onlyLock =
      before.issue &&
      after.issue &&
      JSON.stringify(before.issue.slice(0, 3)) === JSON.stringify(after.issue.slice(0, 3));
    deltas.push(
      onlyLock
        ? `~ issue ${after.issue[0]}: lock=${before.issue[3] ?? "null"} -> ${after.issue[3] ?? "null"}`
        : `~ issue: ${fmt(before.issue)} -> ${fmt(after.issue)}`
    );
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

  // 活路变化: 一条工单从"有活路"掉进"需出手"(或反向回来) 是最该被看见的信号
  if (JSON.stringify(before.liveness ?? null) !== JSON.stringify(after.liveness ?? null)) {
    const oldLive = new Set((before.liveness?.[1] ?? []).map(String));
    const newLive = new Set((after.liveness?.[1] ?? []).map(String));
    for (const entry of newLive) if (!oldLive.has(entry)) deltas.push(`+ 活路: ${entry}`);
    for (const entry of oldLive) if (!newLive.has(entry)) deltas.push(`- 活路: ${entry}`);
  }

  // 挂起卡片变化: "我在等谁" 的转变 (卡片被答/被撤/新挂一张) 值得一行 —— 它决定我下一轮还回不回得来
  const beforeWaiting = before.waiting ?? null;
  const afterWaiting = after.waiting ?? null;
  if (JSON.stringify(beforeWaiting) !== JSON.stringify(afterWaiting)) {
    const fmtWaiting = (w) => (w === null ? "未记录" : `${w[0] ?? "?"} pending ${JSON.stringify(w[1] ?? [])}`);
    deltas.push(`~ 挂起卡片: ${fmtWaiting(beforeWaiting)} -> ${fmtWaiting(afterWaiting)}`);
  }

  // 交付状态变化: "本地 HEAD 有 commit 没推到远端" 是最该被看见的一格
  // (未推送的交付 = 远端拿不到 = 工单标 done 也不成立)
  const beforeGit = before.git ?? null;
  const afterGit = after.git ?? null;
  if (JSON.stringify(beforeGit) !== JSON.stringify(afterGit)) {
    const fmtGit = (g) => (g === null ? "未记录" : String(g ?? "null"));
    deltas.push(`~ 交付: ${fmtGit(beforeGit)} -> ${fmtGit(afterGit)}`);
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

/**
 * 基线状态文件按 issue 分文件.
 * 同仓可能同时跑多个心跳 (COOA-114 与心祖自己的执行 issue), 共用一个状态文件会互相覆盖基线,
 * 表现就是每轮都报 CHANGED 并刷一屏 "- routine 消失" 的假 delta.
 * 未知 issue 时退化为 "shared", 至少自洽.
 */
export function statePathFor(issueKey, base = DEFAULT_STATE_PATH) {
  const key = issueKey ? String(issueKey).replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 64) : "shared";
  return path.join(path.dirname(base), `${path.basename(base, ".json")}.${key}.json`);
}

/**
 * 上一轮基线是否属于同一个 issue.
 * 不是同一 issue (或任一盘面处于退化态) 时不能做 deltas 比对, 只能当新基线 ——
 * 否则会把两个不同 issue 的盘面差当成"变化"刷出来.
 */
export function isSameIssue(previous, snapshot) {
  if (!previous) return true; // 首轮无基线 → 正常走基线路径
  const prevId = previous?.canonical?.issue?.[0] ?? null;
  if (!prevId) return false; // 上一轮基线自身是退化盘面, 不可比
  const current = snapshot?.issue;
  if (!current || current.error) return false; // 本轮盘面退化, 不拿它当基线
  return prevId === (current.identifier ?? null);
}

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
  const flags = { json: false, help: false, skipInbox: false, skipQueue: false, skipWaiting: false, skipGit: false, brief: false, noState: false };
  const options = { issue: null, company: null, apiBase: null, routineIds: [], state: null, stateBase: null };
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
      case "--skip-waiting":
        flags.skipWaiting = true;
        break;
      case "--skip-git":
        flags.skipGit = true;
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
      case "--state-base":
        options.stateBase = next() ?? null;
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
        } else if (arg.startsWith("--state-base=")) {
          options.stateBase = arg.slice("--state-base=".length);
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
                                            [--skip-waiting] [--skip-git] [--state <path> | --state-base <path>]
                                            [--no-state] [--api-base <url>]

说明:
  --routine-ids  当 companies-scoped list 端点不可用时, 按已知 routine id 走单条端点回退.
                 不传则诚实标注 routines: unavailable, 不编造数据.
  --brief        一行心脏起搏: 无变化一行, 有变化一行 + delta 行.
  --state        与上一轮比对用的状态文件 (精确覆盖, 不做分 issue 派生).
  --state-base   基线文件的基准路径; 实际写 <base 同目录>/<stem>.<issue>.json ——
                 同仓并发跑多个心跳 (COOA-114 与心祖执行 issue) 时互不覆盖基线.
                 默认 scripts/.hermes-tmp/heartbeat-snapshot-state.json.
  --no-state     只读盘面, 不写比对状态 (适合一次性排查).

活路 (liveness):
  大盘只回答"有几条", 不回答"还回不回得来". 本工具复用
  hermes-open-issue-liveness-scan 的判定, 在同一份 issues 回包上算出
  dead_letter / stalled_in_progress / review_no_monitor / orphan / queued_stale
  五类"需出手"工单, 汇总为一行 lx N/M. 只列非零项; 全零显示 lx N/M (ok).
  指纹只含 (identifier:verdict), 不含 idle 时长 —— 否则 changed 恒为 true.

挂起卡片 (waiting):
  本 issue 自己挂着的交互卡片 —— 一行回答"我还在等谁", 便于判断主线是在等人类回复
  还是在等 routine 自驱. wait=0p 就是没人可等, wait=1p/23m 就是有一张挂了 23 分钟.
  指纹只含 (计数, kinds), 不含年龄 —— 同样是为了不让 changed 恒为 true.
  --skip-waiting 跳过这一节 (跳过时不做基线比对, 避免半盘面污染基线).

交付 (git):
  一行回答"我这轮交付真的到远端了吗": git=synced 表示 HEAD 已全在 upstream;
  git=UNPUSHED ahead=1 表示有 1 个 commit 只在本地 —— 远端拿不到, 工单标 done 也不成立.
  指纹只含 delivery 等价类; head sha 与脏文件数只作人读字段 (每轮都在变).
  --skip-git 跳过这一节 (git 不可用时也会自动降级为 git=?).
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
    skipWaiting = false,
    livenessNow = Date.now(),
    fetchImpl = globalThis.fetch,
  } = config;

  const snapshot = {
    apiBase,
    selfRunId: runId,
    issue: null,
    companyId: company,
    routines: { source: null, unavailableReason: null, items: [] },
    inbox: null,
    queue: null,
    queueUnavailableReason: null,
    liveness: null,
    waiting: null,
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

  // 1.5 本 issue 自己的挂起交互 ("我还在等谁") —— 只查本 issue, 不扫全盘
  if (!skipWaiting && snapshot.issue && !snapshot.issue.error && snapshot.issue.id) {
    const list = await getJson(`${apiBase}/issues/${snapshot.issue.id}/interactions`, { apiKey, runId, fetchImpl });
    const payload = list.ok ? list.body : (apiErrorOf(list.body) ?? `HTTP ${list.status}`);
    snapshot.waiting = summarizeWaiting(payload, { now: livenessNow });
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
  let boardRows = [];
  if (!skipQueue && snapshot.companyId) {
    const issues = await getJson(`${apiBase}/companies/${snapshot.companyId}/issues?limit=400`, {
      apiKey,
      runId,
      fetchImpl,
    });
    boardRows = pickIssues(issues.body);
    if (boardRows.length > 0) {
      snapshot.queue = summarizeQueue(boardRows);
    } else {
      snapshot.queueUnavailableReason = apiErrorOf(issues.body) ?? `HTTP ${issues.status}`;
    }
  }

  // 6. 活路判定: 复用上面同一份 rows —— 零额外请求, 且"巡检"与"检测"口径永远同源.
  //    分开两处数一次大盘, 迟早会漂移成两个说法 (本仓已有过一次: 4 桶 blocked=6 与
  //    liveness dead=6 各说各话, 谁也没说这两组是不是同一批工单).
  if (boardRows.length > 0) {
    snapshot.liveness = summarizeLiveness(boardRows, { now: livenessNow });
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
        : `issue   : ${i.identifier} ${i.status} ${i.priority} run=${(i.checkoutRunId ?? "null").slice(0, 8)} lock=${lockStateOf(i, snapshot.selfRunId)}`
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
  if (snapshot.waiting) {
    lines.push(`waiting : ${waitingSummaryText(snapshot.waiting)}`);
    for (const item of snapshot.waiting.items ?? []) {
      lines.push(
        `  ${item.kind} ${item.id ?? "?"} pending ${item.ageMinutes ?? "?"}m ` +
          `policy=${item.continuationPolicy ?? "null"}${item.wakesAssignee ? " (回复即唤醒)" : ""}`
      );
    }
  }
  if (snapshot.git) {
    const g = snapshot.git;
    lines.push(
      g.checked === false
        ? `git     : unavailable (${g.error})`
        : `git     : ${g.branch ?? "?"}@${g.head ?? "?"} delivery=${g.delivery ?? "?"} ` +
            `ahead=${g.ahead ?? "?"} behind=${g.behind ?? "?"} dirty=${g.dirtyFiles ?? "?"} ` +
            `untracked=${g.untrackedFiles ?? "?"} upstream=${g.upstream}`
    );
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
  // 活路: "还回不回得来" 与 "有几条" 是两件事, 只报桶数会把永不恢复的工单读成已知稳态
  if (snapshot.liveness) {
    lines.push(`liveness: ${livenessSummaryText(snapshot.liveness)}`);
    for (const a of snapshot.liveness.attention ?? []) {
      lines.push(
        `  ${a.identifier} ${a.verdict} ${a.status ?? "?"} idle=${a.idleHours ?? "?"}h — ${a.reason ?? ""}`
      );
    }
  }
  if (snapshot.signature) {
    lines.push(`changed : ${snapshot.changed === true} sig=${snapshot.signature} prev=${snapshot.previousSignature ?? "null"}`);
    for (const delta of snapshot.deltas ?? []) lines.push(`  ${delta}`);
  }
  return lines.join("\n");
}

/** 活路短码: 让一行里塞得下四五个 verdict 计数 */
const LIVENESS_SHORT = {
  dead_letter: "dead",
  stalled_in_progress: "stall",
  review_no_monitor: "nomon",
  orphan: "orphan",
  queued_stale: "qstale",
};

/** "lx 6/13 (stall=1 nomon=1 orphan=4)" — 只列非零项; 全零显示 ok */
export function livenessSummaryText(liveness) {
  if (!liveness) return "lx null";
  const parts = ATTENTION_VERDICTS.map((v) => [v, liveness.counts?.[v] ?? 0]).filter(([, n]) => n > 0);
  const inner = parts.length === 0 ? "ok" : parts.map(([v, n]) => `${LIVENESS_SHORT[v] ?? v}=${n}`).join(" ");
  return `lx ${liveness.attentionCount ?? "?"}/${liveness.openCount ?? "?"} (${inner})`;
}

/**
 * "wait=1p/23m ask_user_questions" — 一行说清我在等谁:
 *   - `wait=skip` : 没查 (--skip-waiting / 没传 issue)
 *   - `wait=?`    : 查了但端点不可用 —— 不假装"没人在等"
 *   - `wait=0p`   : 确实没有挂起卡片 (别等我)
 *   - `wait=1p/23m ask_user_questions`: 1 张挂起卡片, 最老 23 分钟, 是问人的卡片
 */
export function waitingSummaryText(waiting) {
  if (!waiting) return "wait=skip";
  if (waiting.checked === false) return "wait=?";
  const count = waiting.pendingCount ?? 0;
  if (count === 0) return "wait=0p";
  const age = typeof waiting.oldestAgeMinutes === "number" ? `${waiting.oldestAgeMinutes}m` : "?m";
  const kinds = (waiting.kinds ?? []).join("/");
  return `wait=${count}p/${age}${kinds ? ` ${kinds}` : ""}`;
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
    `queue ${counts} · ${inbox} · ${livenessSummaryText(snapshot.liveness)} · ${waitingSummaryText(snapshot.waiting)} · ` +
    `${gitDeliveryText(snapshot.git)}`;
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

  const issueParam = options.issue ?? env.PAPERCLIP_TASK_ID ?? null;

  const snapshot = await collectSnapshot({
    apiBase,
    apiKey,
    runId: env.PAPERCLIP_RUN_ID ?? null,
    issue: issueParam,
    company: options.company ?? env.PAPERCLIP_COMPANY_ID ?? null,
    routineIds,
    skipInbox: flags.skipInbox,
    skipQueue: flags.skipQueue,
    skipWaiting: flags.skipWaiting,
  });

  // 交付状态: 本机 git 只读查询 (本地事实, 不占 API 请求); --skip-git 或 git 不可用时诚实降级
  // HERMES_HEARTBEAT_GIT_CWD 让测试指向确定性 fixture 仓库 (真实仓库的交付状态每分钟都在变)
  if (!flags.skipGit) snapshot.git = summarizeGit({ cwd: env.HERMES_HEARTBEAT_GIT_CWD || REPO_ROOT });

  // 与上一轮比对: 只在完整盘面 (未跳过任何区块) 上做, 避免半盘面污染基线
  // 默认状态文件按 issue 分文件: 同仓并发心跳不互相覆盖基线
  // 键优先用解析出的 identifier (人类可读, 与传 uuid 还是传 key 无关)
  const stateKey = snapshot.issue && !snapshot.issue.error ? (snapshot.issue.identifier ?? issueParam) : issueParam;
  const stateBase = options.stateBase ?? env.HERMES_HEARTBEAT_STATE_BASE ?? DEFAULT_STATE_PATH;
  const statePath = options.state ?? env.HERMES_HEARTBEAT_STATE ?? statePathFor(stateKey, stateBase);
  const fullBoard = !flags.skipInbox && !flags.skipQueue && !flags.skipWaiting && !flags.skipGit;
  if (!flags.noState && fullBoard) {
    const previous = readState(statePath);
    const comparable = isSameIssue(previous, snapshot);
    snapshot.signature = snapshotSignature(snapshot);
    snapshot.previousSignature = comparable ? (previous?.signature ?? null) : null;
    snapshot.changed = snapshot.previousSignature !== snapshot.signature;
    snapshot.deltas = comparable
      ? snapshot.changed
        ? diffSnapshots(previous, snapshot)
        : []
      : ["(无上一轮状态, 本轮为基线)"];
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
