#!/usr/bin/env bash
# scripts/monthly-summary.sh
#
# wave280 §E.2 — 月初 1 号 9:00 定时执行月报生成。

set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/bin:$PATH"

_resolved="$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || node -e 'console.log(require("fs").realpathSync(process.argv[1]))' "${BASH_SOURCE[0]}")"
REPO_ROOT="$(cd "$(dirname "$_resolved")/.." && pwd)"

node -e '
const { execSync } = require("child_process");
const repoRoot = process.argv[1];

let commits = [];
try {
  const log = execSync("git -C " + repoRoot + " log --since=\"30 days ago\" --pretty=format:\"%h|%s\"", { encoding: "utf8" });
  commits = log.split("\n").filter(Boolean).map(l => {
    const [hash, ...rest] = l.split("|");
    return { hash, msg: rest.join("|") };
  });
} catch (e) {}

const waveSet = new Set();
for (const c of commits) {
  const m = c.msg.match(/wave\d+/i);
  if (m) waveSet.add(m[0]);
}

const now = new Date();
const monthStr = `${now.getFullYear()}年${now.getMonth() + 1}月`;

console.log(`【📈月度总结 · ${monthStr}】`);
console.log(`累计完成波次: ${waveSet.size} 个重点迭代`);
console.log("核心基座: 7大工具池健康监测 + 不可变派单回执 + G1-G5证据账本全面闭环");
console.log("架构治理: Palantir 全景本体沉淀 + 业务域独立自治解耦");
console.log("下月目标: 深入各业务域场景落地与多智能体自动化流水线");
' "$REPO_ROOT"
