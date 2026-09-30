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
#   bash scripts/publish-ota.sh --server-deploy [platform]  # OTA + server 联动
#   bash scripts/publish-ota.sh --4-guard [platform]  # OTA 后跑 4 护栏
#
# flag 语义 (wave233):
#   --server-deploy   OTA 跑完后调 deploy-tc-coolie-claw.sh --skip-build
#                     (默认 OFF — 保持向后兼容; --server-deploy 用于"OTA
#                     发布 + server 联动"一锅出, e.g. 改 shared schema 之后
#                     老板想一份命令全发)。
#   --4-guard         OTA 跑完后跑 4 护栏 (version.json / ota/manifest /
#                     APK HEAD / /api/health), 写证据到
#                     $AUTO_DEPLOY_EVIDENCE_DIR (默认 ./docs-coolie/evidence/wave233)。
#   --allow-dirty     显式接受脏树 (wave100 老 escape, 仍在用)。
#==============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# === commit 强制 pre-check (hard fail, wave100 09-27) ===
# expo export 打包的是当前工作区——不管 commit 没 commit。wave98 在未 commit 的
# 工作区上跑过本脚本, 09-26 23:40 起生产 OTA 一直 serving 一份不存在于任何
# commit 的幽灵 bundle (不可审计、不可复现)。所以这里从 warning 升级为硬阻断:
# 工作区不干净就拒绝发布, 先 commit 让 bundle 可追溯到 SHA。
ALLOW_DIRTY=0
SERVER_DEPLOY=0
RUN_4_GUARD=0
PLATFORM_ARGS=()
for arg in "$@"; do
  case "$arg" in
    --allow-dirty) ALLOW_DIRTY=1 ;;
    --server-deploy) SERVER_DEPLOY=1 ;;
    --4-guard) RUN_4_GUARD=1 ;;
    --no-server-deploy) SERVER_DEPLOY=0 ;;
    --no-4-guard) RUN_4_GUARD=0 ;;
    -h|--help) sed -n '3,24p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) PLATFORM_ARGS+=("$arg") ;;
  esac
done

# wave233 — 4 护栏 + (可选) server 联动. lib 与 release-app.sh 共享一份
# (scripts/lib/auto-deploy.sh), dry-run 透传子脚本.
# shellcheck source=/dev/null
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/auto-deploy.sh"

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

cd "$REPO_ROOT"

# wave233 — server 联动 (OTA 改 shared/schema 后 server 必跟, 否则 App 端
# 紧急按钮点 404 — 跟 release-app.sh step 10 同源).
if [ "$SERVER_DEPLOY" = "1" ]; then
  echo ""
  echo "=== [server-deploy] deploy-tc-coolie-claw.sh --skip-build ==="
  ad_run bash "$REPO_ROOT/scripts/deploy-tc-coolie-claw.sh" --skip-build
  if [[ "${AUTO_DEPLOY_DRY_RUN:-0}" != "1" ]]; then
    HEALTH=$(ssh "${SSH_TARGET:-tc-coolie-claw}" "curl -s -m 5 localhost:3100/api/health | head -c 120")
    echo "   ✓ /api/health: $HEALTH"
  fi
fi

# wave233 — 4 护栏. --4-guard 启用时跑, 写证据到 AUTO_DEPLOY_EVIDENCE_DIR.
if [ "$RUN_4_GUARD" = "1" ]; then
  echo ""
  echo "=== [4-guard] version.json / ota/manifest / APK HEAD / /api/health ==="
  if [ -z "${AUTO_DEPLOY_EVIDENCE_DIR:-}" ]; then
    export AUTO_DEPLOY_EVIDENCE_DIR="$REPO_ROOT/docs-coolie/evidence/wave233"
  fi
  # publish-ota.sh 不强求 VERSION (OTA 可以跨多个 APK 版本生效), 但 lib 要
  # APK_URL — 从 ota/manifest 读 latest 的 downloadUrl, 或者让调用方传.
  if [ -z "${APK_URL:-}" ] && [[ "${AUTO_DEPLOY_DRY_RUN:-0}" != "1" ]]; then
    export APK_URL
    APK_URL="$(curl -sS -m 8 https://xrobinai.cn/version.json | python3 -c '
import json, sys
try:
    print(json.load(sys.stdin).get("downloadUrl", ""))
except Exception:
    pass
')"
    if [ -z "$APK_URL" ]; then
      ad_die "4 护栏要 APK_URL 但从 version.json 读不到 — 设 APK_URL 或 VERSION 再跑"
    fi
  fi
  ad_guard_4 "$AUTO_DEPLOY_EVIDENCE_DIR"
fi
