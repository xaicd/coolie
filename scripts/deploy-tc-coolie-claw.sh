#!/usr/bin/env bash
#==============================================================================
# deploy-tc-coolie-claw.sh — 部署 Coolie 到生产 (tc-coolie-claw / xrobinai.cn)
#
# 流程: 本地构建UI → rsync 代码 → 远端安装依赖+构建 → 重启 systemd → 健康验证
# 用法: bash scripts/deploy-tc-coolie-claw.sh [--skip-build]
#==============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

SSH_TARGET="tc-coolie-claw"
REMOTE_DIR="/opt/coolie"
SKIP_BUILD="${1:-}"

echo "=== [1/5] 本地构建 UI ==="
if [ "$SKIP_BUILD" != "--skip-build" ]; then
  (cd ui && pnpm build)
  (cd clients/api-client && pnpm build 2>/dev/null || true)
fi

echo "=== [2/5] rsync 代码(排除 node_modules/.git/本地数据) ==="
rsync -az --delete \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '.claude' \
  --exclude '.commandcode' \
  --exclude 'screenshots' \
  --exclude 'data' \
  --exclude 'server/data' \
  --exclude 'clients/expo/node_modules' \
  --exclude 'clients/expo/.expo' \
  --exclude 'doc/plans' \
  ./ "$SSH_TARGET:$REMOTE_DIR/"

echo "=== [3/5] 远端安装依赖 ==="
ssh $SSH_TARGET "cd $REMOTE_DIR && pnpm install --frozen-lockfile 2>&1 | tail -2 || pnpm install 2>&1 | tail -2"

echo "=== [4/5] 重启服务 ==="
ssh $SSH_TARGET "sudo systemctl restart coolie"

echo "=== [5/5] 健康验证 ==="
sleep 6
ssh $SSH_TARGET "curl -s localhost:3100/api/health | head -c 200; echo; systemctl is-active coolie"
echo ""
echo "✅ 部署完成: https://xrobinai.cn"
