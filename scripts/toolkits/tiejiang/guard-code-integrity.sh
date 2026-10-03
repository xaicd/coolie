#!/usr/bin/env bash
# [铁匠 Core SWE 专属] 增量代码完整性、编译与依赖守卫
set -euo pipefail
cd "/host-workspace/xaicd/coolie"

echo "=== [1/3] 检查 Monorepo 内部依赖与插件软链 ==="
if [ -d "server/node_modules/@paperclipai" ]; then
  echo "  ✅ server/node_modules/@paperclipai 目录就绪"
else
  echo "  ⚠️ 检测到软链缺失，自动执行补链..."
  bash scripts/deploy-workspace-symlinks.sh || true
fi

echo "=== [2/3] 运行增量类型检查 (TypeScript) ==="
RUN_TC="pnpm -r --filter=./packages/shared --filter=./server typecheck"
if [ -f "scripts/host-exec.sh" ] && [ -f "/.dockerenv" ]; then
  bash scripts/host-exec.sh "$RUN_TC"
else
  eval "$RUN_TC"
fi

echo "=== [3/3] 检查数据库 Schema 与迁移同步性 ==="
RUN_DB="pnpm --filter=./packages/db build"
if [ -f "scripts/host-exec.sh" ] && [ -f "/.dockerenv" ]; then
  bash scripts/host-exec.sh "$RUN_DB"
else
  eval "$RUN_DB"
fi

echo "✅ 铁匠代码防线检查全部通过！"
