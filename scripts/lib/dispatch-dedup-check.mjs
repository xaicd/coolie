#!/usr/bin/env node
// scripts/lib/dispatch-dedup-check.mjs
// wave358 PRE-SRE: 派单入队去重守护。
// 老板硬规矩: 凭据过期 → 派单自动降级, 禁止反复弹微信;
// 同样禁止同一 brief 反复入队消耗 dispatch 资源 + 触发重复 worker run。
//
// 用法: node dispatch-dedup-check.mjs <dispatch_dir> <wave> <agent> <task>
//
// 输出 (stdout, 单行 JSON):
//   - 命中既有 done receipt: {"id":..., "commit":..., "completedAt":...}
//   - 未命中: 空字符串 (exit 0)
//
// 退出码:
//   0 = 检测完成 (无论是否命中)
//   2 = 参数缺失

import fs from "node:fs";
import path from "node:path";

const [, , dispatchDir, W, A, T] = process.argv;

if (!dispatchDir || !W || !A || !T) {
  process.stderr.write(
    `[dispatch-dedup] usage: dispatch-dedup-check.mjs <dispatch_dir> <wave> <agent> <task>\n`
  );
  process.exit(2);
}

if (!fs.existsSync(dispatchDir)) {
  process.exit(0);
}

const files = fs
  .readdirSync(dispatchDir)
  .filter((f) => f.endsWith(".json"));

let hit = null;
for (const f of files) {
  try {
    const d = JSON.parse(
      fs.readFileSync(path.join(dispatchDir, f), "utf8")
    );
    if (
      d.wave === W &&
      d.subagentType === A &&
      d.task === T &&
      d.status === "done"
    ) {
      hit = {
        file: f,
        id: d.id,
        commit: d.commit ?? null,
        completedAt: d.completedAt ?? null,
      };
      break; // 命中第一条 done 即可
    }
  } catch (_e) {
    // 静默跳过破损 receipt, 让 dispatch 主流程不因此卡住
  }
}

if (hit) {
  process.stdout.write(JSON.stringify(hit) + "\n");
}
process.exit(0);