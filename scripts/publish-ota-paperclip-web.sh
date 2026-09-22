#!/usr/bin/env bash
#==============================================================================
# publish-ota-paperclip-web.sh — 发布 Coolie Web (paperclip-web 套壳) OTA bundle
#
# 代理执行 clients/expo-paperclip-web/scripts/publish-ota.sh:
#   1. 导出 Expo JS Bundle (expo export -p android --output-dir dist)
#   2. 生成自建更新源 manifest (Expo Updates Protocol v0, 含 launchAsset.hash
#      base64url + fileSize + runtimeVersion)
#   3. rsync 到 tc-coolie-claw:/opt/coolie/ui/ota/paperclip-web/
#      (Caddy `handle_path /ota/*` → https://xrobinai.cn/ota/paperclip-web/manifest)
#
# 与驾驶舱 App 的 scripts/publish-ota.sh 互不影响: 两者的远端目录、更新源地址、
# runtimeVersion 都不同, 一份 bundle 不会被装到另一个 App 上。
#
# 用法:
#   bash scripts/publish-ota-paperclip-web.sh [platform] (默认: android)
#==============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT/clients/expo-paperclip-web"

bash scripts/publish-ota.sh "$@"
