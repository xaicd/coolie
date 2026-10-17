#!/usr/bin/env node
// scripts/lib/dispatch-dedup-key-check.mjs
// COOA-486: receipt 级幂等去重键检查.
//
// dispatch-local-employee.sh 在写 Receipt 前调用本脚本: 若已存在同 (dedupKey, agent) 且
// **未终结** (queued/running) 的 receipt, 则跳过新增 (echo 复用), 杜绝同一条掌柜原话在
// 本地派单账本里反复新增 Receipt.
//
// 与 scripts/lib/dispatch-dedup-check.mjs 的区别: 后者只认 status=done 的重复 (wave358),
// 本脚本认**未终结**的重复, 且用归一化哈希键 (bossInput) 而非 wave+task 字面量.
//
// 用法: node dispatch-dedup-key-check.mjs <dispatch_dir> <dedupKey> [agent]
// 输出 (stdout, 单行 JSON): 命中 {"id","status","file"}; 未命中: 空 (exit 0)
// 退出码: 0 = 检测完成; 2 = 参数缺失

import fs from "node:fs";
import path from "node:path";

const [, , dispatchDir, dedupKey, agent] = process.argv;

if (!dispatchDir || !dedupKey) {
  process.stderr.write(
    "[dispatch-dedup-key] usage: dispatch-dedup-key-check.mjs <dispatch_dir> <dedupKey> [agent]\n",
  );
  process.exit(2);
}

if (!fs.existsSync(dispatchDir)) process.exit(0);

const TERMINAL = new Set(["done", "failed", "cancelled"]);

for (const file of fs.readdirSync(dispatchDir).filter((f) => f.endsWith(".json"))) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(dispatchDir, file), "utf8"));
    if (data.dedupKey !== dedupKey) continue;
    if (agent && data.subagentType !== agent) continue;
    if (TERMINAL.has(data.status)) continue;
    process.stdout.write(`${JSON.stringify({ id: data.id ?? null, status: data.status ?? null, file })}\n`);
    process.exit(0);
  } catch {
    // 静默跳过破损 receipt
  }
}
process.exit(0);
