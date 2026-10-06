#!/usr/bin/env bash
# [门神 FDSE 专属] 7 处版本号一致性与 UI Token 门禁检查
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$REPO_ROOT"

echo "=== [1/2] 校验移动端与线上 7 处版本号一致性 ==="
if [ -f "scripts/VERSION-CONSISTENCY-CHECK.sh" ]; then
  bash scripts/VERSION-CONSISTENCY-CHECK.sh || {
    echo "❌ 版本号一致性校验未通过！请勿发版！"
    exit 1
  }
fi

echo "=== [2/2] 校验前端 UI Token 规范 (防硬编码颜色/样式) ==="
if [ -f "scripts/check-token-gates.mjs" ]; then
  node scripts/check-token-gates.mjs || {
    echo "❌ 发现未放行的硬编码样式，违反前端规范！"
    exit 1
  }
fi

echo "✅ 门神端侧与 UI 门禁检查全部通过！"
