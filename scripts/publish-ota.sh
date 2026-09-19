#!/usr/bin/env bash
#==============================================================================
# publish-ota.sh — 发布 Coolie Expo 客户端增量更新 (OTA) 到生产机器
#
# 代理执行 clients/expo/scripts/publish-ota.sh:
#   1. 导出 Expo JS Bundle (expo export --platform all)
#   2. 生成自建更新源所需的 manifest 及静态资产映射
#   3. 通过 rsync 部署至 tc-coolie-claw:/opt/coolie/ui/ota/ (映射 https://xrobinai.cn/ota/)
#
# 用法:
#   bash scripts/publish-ota.sh [platform] (默认: all)
#==============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT/clients/expo"

bash scripts/publish-ota.sh "$@"
