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

# === commit 强制 sanity check (warning, boss 09-22 23:59 OOB) ===
# 发布物必须有对应 commit; 工作区脏时仍然发布, 但提示先 commit 以免丢版本。
cd "$REPO_ROOT"
if [ -n "$(git status --porcelain | grep -v '^??')" ]; then
  echo "[warning] git status NOT clean (modified files). publish-ota still runs but commit first."
fi

cd "$REPO_ROOT/clients/expo"
bash scripts/publish-ota.sh "$@"
