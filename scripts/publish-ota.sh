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
#   bash scripts/publish-ota.sh --allow-dirty [platform]  # 明知故犯的逃生口
#==============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# === commit 强制 pre-check (hard fail, wave100 09-27) ===
# expo export 打包的是当前工作区——不管 commit 没 commit。wave98 在未 commit 的
# 工作区上跑过本脚本, 09-26 23:40 起生产 OTA 一直 serving 一份不存在于任何
# commit 的幽灵 bundle (不可审计、不可复现)。所以这里从 warning 升级为硬阻断:
# 工作区不干净就拒绝发布, 先 commit 让 bundle 可追溯到 SHA。
ALLOW_DIRTY=0
PLATFORM_ARGS=()
for arg in "$@"; do
  case "$arg" in
    --allow-dirty) ALLOW_DIRTY=1 ;;
    *) PLATFORM_ARGS+=("$arg") ;;
  esac
done

cd "$REPO_ROOT"
if [ -n "$(git status --porcelain)" ]; then
  if [ "$ALLOW_DIRTY" -eq 1 ]; then
    echo "[warning] git status NOT clean (--allow-dirty given). 发布的 bundle 可能无法追溯到任何 commit."
  else
    echo "[error] git status NOT clean — 拒绝从未 commit 的工作区发布 OTA."
    echo "        先 commit (OTA bundle 必须能从一个 commit SHA 复现),"
    echo "        或确实要发实验包时显式传 --allow-dirty."
    git status --short | head -20
    exit 1
  fi
fi

cd "$REPO_ROOT/clients/expo"
# 空数组 + set -u 在 macOS bash 3.2 上会炸, 所以只在非空时展开
if [ ${#PLATFORM_ARGS[@]} -gt 0 ]; then
  bash scripts/publish-ota.sh "${PLATFORM_ARGS[@]}"
else
  bash scripts/publish-ota.sh
fi
