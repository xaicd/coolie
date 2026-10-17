#!/usr/bin/env bash
# [门神 FDSE 专属] 7 处版本号一致性与 UI Token 门禁检查
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$REPO_ROOT"

echo "=== [1/3] 校验移动端与线上 7 处版本号一致性 ==="
if [ -f "scripts/VERSION-CONSISTENCY-CHECK.sh" ]; then
  if [ -f "/.dockerenv" ] && command -v host-exec >/dev/null 2>&1; then
    host-exec "bash scripts/VERSION-CONSISTENCY-CHECK.sh" || {
      echo "❌ 版本号一致性校验未通过！请勿发版！"
      exit 1
    }
  else
    bash scripts/VERSION-CONSISTENCY-CHECK.sh || {
      echo "❌ 版本号一致性校验未通过！请勿发版！"
      exit 1
    }
  fi
fi

echo "=== [2/3] 校验前端 UI Token 规范 (防硬编码颜色/样式) ==="
if [ -f "scripts/check-token-gates.mjs" ]; then
  node scripts/check-token-gates.mjs || {
    echo "❌ 发现未放行的硬编码样式，违反前端规范！"
    exit 1
  }
fi

echo "=== [3/3] 校验 Agent-Device/Browser 反向自测试与两字 UI 门禁 ==="
if [ -f "scripts/check-testability-and-ops-gates.mjs" ]; then
  node scripts/check-testability-and-ops-gates.mjs || {
    echo "❌ 前端组件违反自测性或两字 UI 规范！"
    exit 1
  }
fi

echo "✅ 门神端侧与 UI 门禁检查全部通过！"
