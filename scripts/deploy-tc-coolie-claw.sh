#!/usr/bin/env bash
#==============================================================================
# deploy-tc-coolie-claw.sh — 部署编排器 (tc-coolie-claw / xrobinai.cn)
#
# wave349 起 (老板拍 D) 本体拆为三段, 本脚本只做编排, 不再自带部署逻辑:
#   · deploy-tc-coolie-claw-server.sh  server 段: 代码 rsync + install +
#                                      symlinks + 重启 + 健康 (不动 UI)
#   · deploy-tc-coolie-claw-web.sh     web 段: UI 构建 + ui/ rsync + 健康
#                                      (不重启 server, 不动 server 代码)
#   · deploy-tc-coolie-claw-app.sh     app 段: android rsync + 重启刷新 OTA
#
# 用法: bash scripts/deploy-tc-coolie-claw.sh \
#         [--all | --server-only | --web-only | --app-only] [--skip-build]
#
#   --all          默认。三段全跑 (server → web → app), 等价旧单线全量部署
#   --server-only  只跑 server 段
#   --web-only     只跑 web 段
#   --app-only     只跑 app 段
#   --skip-build   跳过 web 段本地 UI 构建 (沿用旧语义, 透传给 web 段)
#
# 兼容性: release-app.sh / publish-ota.sh / auto-deploy-all.sh 既有调用
# `deploy-tc-coolie-claw.sh --skip-build` = 全量部署且不本地构建, 行为不变。
#==============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

MODE="--all"
SKIP_BUILD=""
for arg in "$@"; do
  case "$arg" in
    --all) MODE="--all" ;;
    --server-only) MODE="--server-only" ;;
    --web-only) MODE="--web-only" ;;
    --app-only) MODE="--app-only" ;;
    --skip-build) SKIP_BUILD="--skip-build" ;;
    -h|--help) sed -n '3,23p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "未知参数: $arg (支持 --all / --server-only / --web-only / --app-only / --skip-build)" >&2; exit 2 ;;
  esac
done

case "$MODE" in
  --server-only)
    bash scripts/deploy-tc-coolie-claw-server.sh
    ;;
  --web-only)
    bash scripts/deploy-tc-coolie-claw-web.sh $SKIP_BUILD
    ;;
  --app-only)
    bash scripts/deploy-tc-coolie-claw-app.sh
    ;;
  --all)
    bash scripts/deploy-tc-coolie-claw-server.sh
    bash scripts/deploy-tc-coolie-claw-web.sh $SKIP_BUILD
    bash scripts/deploy-tc-coolie-claw-app.sh
    echo ""
    echo "✅ 全量部署完成 (server + web + app): https://xrobinai.cn"
    ;;
esac
