#!/usr/bin/env node
// scripts/lib/dispatcher-intent-dedup.mjs
// COOA-486: Hermes 派单幂等去重守卫 (掌柜原话归一化 → 近期同题 open 工单复用).
//
// 背景: 掌柜一句微信原话在 wave286 裂变成 5 张工单 (COOA-481~485). 根因是
// scripts/hermes-boss-intent-dispatcher.sh 每次无条件 `POST /issues` 且每次无条件写
// Receipt, Dev Server 侧也没有按标题去重.
//
// 本模块把「原话归一化 + 近期同题匹配」固化为**纯函数**, 供两侧复用:
//   1. hermes-boss-intent-dispatcher.sh 在 POST 建单前先查既有 open 工单 → 命中即复用
//   2. scripts/__tests__/hermes-dispatcher-idempotency.test.mjs 断言「连调两次不裂变」
//
// 归一化 = 去空白 + 去标点 + 统一小写 (仅保留字母/数字, 含 CJK), 再做 sha256 取前 16 hex.
// 匹配口径 = 归一化后的**同题** (exact title) 或「同 wave 徽标 + 同 task 后缀」; 近 N 分钟内的
// open 工单才复用 (更早的历史工单不拦, 允许合法重开). 语义同义 (同义不同字) 不在确定性纯函数
// 覆盖范围内 —— 那交给 §0.06 的巡检查询拦截先拦掉探活原话族.
//
// CLI (供 shell 调用):
//   仅算去重键:
//     node dispatcher-intent-dedup.mjs --input "<原话>" --print-key
//   判定复用 (issues JSON 从 stdin 或 --issues-file 读, 数组或 {issues:[...]} 均可):
//     cat issues.json | node dispatcher-intent-dedup.mjs --input "<原话>" --wave wave286 --window 10
//   输出单行 JSON:
//     {"dedupKey":"...","intentTitle":"...","windowMinutes":10,"hit":{...}|null}

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

/** 视为「开放」的工单状态 (与 scripts/hermes-open-issue-liveness-scan.mjs 同口径). */
export const OPEN_STATUSES = ["backlog", "todo", "in_progress", "in_review", "blocked"];

/** 默认近邻去重窗口 (分钟). */
export const DEFAULT_WINDOW_MINUTES = 10;

/** 掌柜派单标题徽标前缀 (与 hermes-boss-intent-dispatcher.sh 的 title 模板保持一致). */
export const INTENT_TITLE_PREFIX = "【微信·老板·";

/**
 * 原话归一化: 去所有空白 (含全角) + 去标点, 只保留字母/数字 (含 CJK), 统一小写.
 * 例: "修一下工单审批流卡死！" → "修一下工单审批流卡死"
 */
export function normalizeBossInput(text) {
  if (typeof text !== "string") return "";
  return text
    .toLowerCase()
    .replace(/[\s\u3000]+/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

/** 归一化哈希去重键 (16 hex); 空输入 → "" (调用方据此跳过去重). */
export function dedupKeyOf(text) {
  const normalized = normalizeBossInput(text);
  if (!normalized) return "";
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

/** 由 wave 与 task 拼出与 dispatcher 一致的派单标题. */
export function intentTitleOf(wave, task) {
  const w = wave && String(wave).trim() ? String(wave).trim() : "wave-local";
  return `${INTENT_TITLE_PREFIX}${w}】${task ?? ""}`;
}

/** 既有工单标题是否命中本次意图 (exact 或「同徽标前缀 + 同 task 后缀」). */
export function issueMatchesIntent(issueTitle, task, intentTitle) {
  if (typeof issueTitle !== "string") return false;
  if (issueTitle === intentTitle) return true;
  if (!task) return false;
  return issueTitle.startsWith(INTENT_TITLE_PREFIX) && issueTitle.endsWith(`】${task}`);
}

/**
 * 在一批既有工单里找「近 windowMinutes 分钟内同题 open 工单」.
 * @returns {{ intentTitle:string, windowMinutes:number, candidates:Array, hit:object|null }}
 *   hit = 最早的窗口内命中 (identifier/id/title/status/ageMinutes); 无窗口内命中 → null.
 */
export function findReusableIssue({ issues, task, wave, windowMinutes = DEFAULT_WINDOW_MINUTES, now = Date.now() } = {}) {
  const intentTitle = intentTitleOf(wave, task);
  const list = Array.isArray(issues)
    ? issues
    : issues && typeof issues === "object" && Array.isArray(issues.issues)
      ? issues.issues
      : [];
  const window = Math.max(0, Number(windowMinutes) || 0);

  const candidates = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    if (!OPEN_STATUSES.includes(raw.status)) continue;
    if (!issueMatchesIntent(raw.title, task, intentTitle)) continue;
    const stamp = Date.parse(raw.updatedAt ?? raw.createdAt ?? "");
    const ageMinutes = Number.isFinite(stamp) ? Math.max(0, Math.round((now - stamp) / 60000)) : null;
    candidates.push({
      id: raw.id ?? null,
      identifier: raw.identifier ?? null,
      title: raw.title ?? null,
      status: raw.status ?? null,
      ageMinutes,
      withinWindow: ageMinutes !== null && ageMinutes <= window,
    });
  }

  const inWindow = candidates
    .filter((c) => c.withinWindow)
    .sort((a, b) => (a.ageMinutes ?? Number.MAX_SAFE_INTEGER) - (b.ageMinutes ?? Number.MAX_SAFE_INTEGER));

  return { intentTitle, windowMinutes: window, candidates, hit: inWindow[0] ?? null };
}

/** CLI 参数解析 (可测). */
export function parseDedupArgs(argv = []) {
  const options = { input: "", wave: null, window: DEFAULT_WINDOW_MINUTES, now: null, issuesFile: null, printKey: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i];
    switch (arg) {
      case "--input":
        options.input = next() ?? "";
        break;
      case "--wave":
        options.wave = next() ?? null;
        break;
      case "--window":
        options.window = Number(next() ?? DEFAULT_WINDOW_MINUTES);
        break;
      case "--now":
        options.now = next() ?? null;
        break;
      case "--issues-file":
        options.issuesFile = next() ?? null;
        break;
      case "--print-key":
        options.printKey = true;
        break;
      default:
        if (arg.startsWith("--input=")) options.input = arg.slice("--input=".length);
        else if (arg.startsWith("--wave=")) options.wave = arg.slice("--wave=".length);
        else if (arg.startsWith("--window=")) options.window = Number(arg.slice("--window=".length));
        else if (arg.startsWith("--now=")) options.now = arg.slice("--now=".length);
        else if (arg.startsWith("--issues-file=")) options.issuesFile = arg.slice("--issues-file=".length);
        break;
    }
  }
  return options;
}

function readIssues(options) {
  const raw = options.issuesFile
    ? fs.readFileSync(options.issuesFile, "utf8")
    : fs.readFileSync(0, "utf8");
  if (!raw || raw.trim() === "") return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const options = parseDedupArgs(process.argv.slice(2));
  const dedupKey = dedupKeyOf(options.input);
  if (options.printKey) {
    process.stdout.write(`${dedupKey}\n`);
    process.exit(0);
  }
  const issues = readIssues(options);
  const now = options.now ? Date.parse(options.now) : Date.now();
  const result = findReusableIssue({
    issues,
    task: options.input,
    wave: options.wave,
    windowMinutes: options.window,
    now: Number.isFinite(now) ? now : Date.now(),
  });
  process.stdout.write(
    `${JSON.stringify({ dedupKey, intentTitle: result.intentTitle, windowMinutes: result.windowMinutes, hit: result.hit })}\n`,
  );
  process.exit(0);
}
