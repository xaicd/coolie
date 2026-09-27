#!/usr/bin/env node
/**
 * check-mobile-entry-budget.mjs — SPEC-COOLIE-MOBILE-002 §3.5 G2 门禁。
 *
 * 统计每个移动端屏幕文件的可点入口数 (onPress/onPressIn/onRefresh 出现次数,
 * 含 JSX 与 style 内联), 对照 scripts/mobile-entry-budget.json 的预算上限。
 *
 * 用法:
 *   node scripts/check-mobile-entry-budget.mjs            # 按预算表检查 (CI 门禁)
 *   node scripts/check-mobile-entry-budget.mjs --update   # 用当前实况刷新预算表
 *                                                     (只在「有意放宽/收紧」时用)
 *
 * 规则出处: v3.1.0 用 EARS 写了「不许出现什么」却没写「不许超过多少」, 每个 wave
 * +1 卡片无人拦截, 最终长成 175 入口。此脚本把预算变成可执行断言:
 * zero-net-add —— 新入口必须删除或降级一个等价入口, 否则这里红灯。
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCREENS_DIR = join(ROOT, "clients/expo/src/screens");
const COMPONENTS_DIR = join(ROOT, "clients/expo/src/components");
const BUDGET_PATH = join(ROOT, "scripts/mobile-entry-budget.json");

/** 入口预算表: 文件名 → 最大允许入口数。未列出的文件不设限 (新屏需先登记)。 */
const DEFAULT_BUDGET = {
  "DashboardScreen.tsx": 22,
  "TasksScreen.tsx": 8,
  "NewTaskPage.tsx": 18,
  "BoardChatScreen.tsx": 34,
  "OrgAssetsScreen.tsx": 14,
  "OntologyDomainListScreen.tsx": 60,
  "ProjectsScreen.tsx": 34,
  "ArtifactsScreen.tsx": 30,
  "AgentsScreen.tsx": 14,
  "AppBar.tsx": 6,
  "TabBar.tsx": 8,
};

function listTsxFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".tsx"));
}

function countEntries(filePath) {
  const src = readFileSync(filePath, "utf8");
  const onPress = (src.match(/onPress\b/g) || []).length;
  const onPressIn = (src.match(/onPressIn\b/g) || []).length;
  const onRefresh = (src.match(/onRefresh\b/g) || []).length;
  return onPress + onPressIn + onRefresh;
}

function currentCounts() {
  const counts = {};
  for (const f of listTsxFiles(SCREENS_DIR)) counts[f] = countEntries(join(SCREENS_DIR, f));
  for (const f of listTsxFiles(COMPONENTS_DIR)) {
    // 只统计全局壳层组件 (AppBar/TabBar); 业务组件随宿主屏计
    if (f === "AppBar.tsx" || f === "TabBar.tsx") counts[f] = countEntries(join(COMPONENTS_DIR, f));
  }
  return counts;
}

const update = process.argv.includes("--update");
const budget = update
  ? (() => {
      const counts = currentCounts();
      const next = {};
      for (const [f, n] of Object.entries(counts)) {
        next[f] = DEFAULT_BUDGET[f] !== undefined ? Math.max(DEFAULT_BUDGET[f], n) : n;
      }
      return next;
    })()
  : (existsSync(BUDGET_PATH) ? JSON.parse(readFileSync(BUDGET_PATH, "utf8")) : DEFAULT_BUDGET);

if (update) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(BUDGET_PATH, JSON.stringify(budget, null, 2) + "\n");
  console.log("✓ mobile-entry-budget.json 已按当前实况刷新");
}

const counts = currentCounts();
let failures = 0;
console.log("移动端入口预算检查 (SPEC-COOLIE-MOBILE-002 G2):\n");
for (const [file, limit] of Object.entries(budget).sort()) {
  const actual = counts[file];
  if (actual === undefined) {
    console.log(`  ⚠  ${file}: 预算 ${limit}, 文件已不存在 (从预算表移除)`);
    continue;
  }
  const headroom = limit - actual;
  const mark = actual > limit ? "✗" : "✓";
  if (actual > limit) failures += 1;
  console.log(`  ${mark} ${file}: ${actual}/${limit} (余量 ${headroom})`);
}
console.log("");
if (failures > 0) {
  console.error(`✗ ${failures} 个屏幕超出入口预算。zero-net-add: 新入口必须删除或降级一个等价入口。`);
  process.exit(1);
}
console.log("✓ 全部屏幕在入口预算内");
