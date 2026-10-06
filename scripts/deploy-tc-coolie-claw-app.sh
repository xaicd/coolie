#!/usr/bin/env bash
#==============================================================================
# deploy-tc-coolie-claw-app.sh — app-only 部署 (tc-coolie-claw / xrobinai.cn)
#
# wave349 拆段之三 (老板拍 D): 只部署 App 侧 —— rsync clients/expo/android
# 原生树到远端 + 重启 server (OTA manifest 路由 server/src/routes/ota-manifest.ts
# 按 ui/ota 与 ui/dist/version.json 动态分发, 重启后 /api/ota/manifest 重新
# 解析版本清单)。不动 server 代码与 Web UI。
#
# 注意: OTA JS bundle 的真正产出/分发仍是 scripts/publish-ota.sh
# (expo export → rsync ui/ota)。本段只负责把 android 原生树同步到生产
# 并重启刷新服务。
#
# 用法: bash scripts/deploy-tc-coolie-claw-app.sh
#==============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

SSH_TARGET="tc-coolie-claw"
REMOTE_DIR="/opt/coolie"

echo "=== [app 1/3] rsync clients/expo/android → 远端 ==="
# 全量部署历来 --exclude 'clients/expo', 远端首次没有该目录, 先建。
# 排除本机构建产物与机器本地配置 (local.properties 记录本机 SDK 路径)。
ssh $SSH_TARGET "mkdir -p $REMOTE_DIR/clients/expo/android"
rsync -az --delete \
  --exclude '.gradle' \
  --exclude 'build' \
  --exclude 'local.properties' \
  clients/expo/android/ "$SSH_TARGET:$REMOTE_DIR/clients/expo/android/"

echo "=== [app 2/3] 重启 server (刷新 OTA manifest 分发) ==="
ssh $SSH_TARGET "sudo systemctl restart coolie"

echo "=== [app 3/3] 健康验证 ==="
sleep 6
ssh $SSH_TARGET "curl -s localhost:3100/api/health | head -c 200; echo; curl -s localhost:3100/api/ota/manifest | head -c 120; echo; systemctl is-active coolie"
echo ""
echo "✅ app 段部署完成: android 原生树已同步, OTA manifest 已刷新"
