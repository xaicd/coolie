#!/usr/bin/env bash
#==============================================================================
# publish-h5.sh — 把 Coolie h5 端 dist/ 部署到生产 (xrobinai.cn/h5/)
#
# 流程:
#   1. pnpm --filter @coolie/h5 build  (产出 clients/h5/dist/)
#   2. rsync dist/ 到 tc-coolie-claw:/opt/coolie/ui/dist/h5/
#   3. Caddy 已经在 /h5/* 反代 /opt/coolie/ui/dist/h5/ (无需 reload)
#
# 用法:
#   bash scripts/publish-h5.sh
#==============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT/clients/h5"

echo "[publish-h5] building clients/h5..."
pnpm --filter @coolie/h5 build 2>&1 | tail -5

DIST="$REPO_ROOT/clients/h5/dist"
if [ ! -f "$DIST/index.html" ]; then
  echo "ERROR: dist/index.html missing after build"
  exit 1
fi

echo "[publish-h5] rsync dist/ -> tc-coolie-claw:/opt/coolie/ui/dist/h5/"
rsync -avz --delete \
  --exclude='node_modules' \
  --exclude='*.map' \
  "$DIST/" \
  tc-coolie-claw:/opt/coolie/ui/dist/h5/

echo "[publish-h5] done. smoke:"
curl -fsS https://xrobinai.cn/h5/ | head -c 200