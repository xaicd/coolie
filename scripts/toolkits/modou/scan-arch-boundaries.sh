#!/usr/bin/env bash
# [墨斗 FDA 专属] 架构边界与公司作用域隔离安全扫描
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$REPO_ROOT"

echo "=== [1/2] 扫描非法绕过 companyId 的路由实体 ==="
# 检查 server/src/routes 下是否存在漏掉 companyId 鉴权的直接操作
grep -rn "from.*issues" server/src/routes/*.ts | grep -v "companyId" | head -n 10 || echo "  ✅ 未检测到显式绕过 companyId 的路由"

echo "=== [2/2] 扫描跨模块单向依赖合法性 ==="
echo "  规则: packages/shared 严禁反向依赖 server 或 ui"
if grep -rnE "from .*(/server/|server/src)" packages/shared/src/ 2>/dev/null; then
  echo "  ❌ 发现 shared 反向依赖 server，违反依赖单向性！"
  exit 1
else
  echo "  ✅ packages/shared 模块边界纯净（无越界依赖）"
fi

echo "✅ 墨斗架构防线扫描完成！"
