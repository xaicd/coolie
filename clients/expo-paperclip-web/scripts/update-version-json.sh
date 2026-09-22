#!/usr/bin/env bash
#==============================================================================
# update-version-json.sh — 把 Coolie Web (paperclip-web) 的版本信息合并进生产
#   /opt/coolie/ui/dist/version.json 的 `paperclipWeb` 字段。
#
# version.json 被两个 App 共用一个入口 https://xrobinai.cn/version.json:
#   顶层 version/versionCode/downloadUrl   → 驾驶舱 App (cloud.coolie.app)
#   paperclipWeb.{version,versionCode,...} → Coolie Web (cloud.coolie.app.web)
# 所以这里**只增不改**: 读回远端现有 JSON, 只覆盖 `paperclipWeb` 键, 其余字段
# 原样保留。绝不重写顶层驾驶舱字段 (那是 scripts/release-app.sh 的职责)。
#
# 放在 clients/ 下而非根 scripts/: 与驾驶舱的同类脚本
# (clients/expo/scripts/publish-version-json.sh) 一致, 且 clients/ 是我们自己的
# 树 —— 不占 upstream fork surface (scripts/check-fork-surface.mjs)。
#
# 用法:
#   bash clients/expo-paperclip-web/scripts/update-version-json.sh "<更新说明>"
# 环境变量:
#   SSH_TARGET             默认 tc-coolie-claw
#   REMOTE_VERSION_JSON    默认 /opt/coolie/ui/dist/version.json
#   PAPERCLIP_WEB_APP_DIR  默认本脚本所在包的目录 (clients/expo-paperclip-web)
#   PAPERCLIP_WEB_DLS_BASE 默认 https://dls.xrobinai.cn/coolie/app
#==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${PAPERCLIP_WEB_APP_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
SSH_TARGET="${SSH_TARGET:-tc-coolie-claw}"
REMOTE_VERSION_JSON="${REMOTE_VERSION_JSON:-/opt/coolie/ui/dist/version.json}"
DLS_BASE="${PAPERCLIP_WEB_DLS_BASE:-https://dls.xrobinai.cn/coolie/app}"
VERSION_JSON_URL="${VERSION_JSON_URL:-https://xrobinai.cn/version.json}"

NOTES="${1:-}"
if [ -z "$NOTES" ]; then
  echo "用法: bash clients/expo-paperclip-web/scripts/update-version-json.sh \"<更新说明>\"" >&2
  exit 2
fi
# 换行会破坏 JSON 合法性, 统一压成单行。
NOTES="$(printf '%s' "$NOTES" | tr -s '[:space:]' ' ' | sed -e 's/^ //' -e 's/ $//')"

APP_JSON="$APP_DIR/app.json"
[ -f "$APP_JSON" ] || { echo "找不到 $APP_JSON" >&2; exit 1; }

VERSION="$(node -e "console.log(require('$APP_JSON').expo.version)")"
VERSION_CODE="$(node -e "console.log(require('$APP_JSON').expo.android.versionCode)")"
# COS 对象目录带 `-paperclip-web` 后缀, 与驾驶舱 App 的 APK 路径区分开。
APK_URL="$DLS_BASE/${VERSION}-paperclip-web/coolie-release.apk"

echo "========================================================"
echo " Coolie Web version.json 合并"
echo " 版本:        $VERSION (versionCode $VERSION_CODE)"
echo " APK 直链:    $APK_URL"
echo " 目标:        $SSH_TARGET:$REMOTE_VERSION_JSON"
echo "========================================================"

TMP_REMOTE="$(mktemp -t coolie-version-remote.XXXXXX)"
TMP_OUT="$(mktemp -t coolie-version-out.XXXXXX)"
trap 'rm -f "$TMP_REMOTE" "$TMP_OUT"' EXIT

# 读回远端现有 version.json; 不存在则从空对象起 (首次加 paperclipWeb 字段)。
if ssh "$SSH_TARGET" "test -f '$REMOTE_VERSION_JSON'" 2>/dev/null; then
  ssh "$SSH_TARGET" "cat '$REMOTE_VERSION_JSON'" > "$TMP_REMOTE"
else
  echo "· 远端无现有 version.json, 从空对象开始"
  echo '{}' > "$TMP_REMOTE"
fi

python3 - "$TMP_REMOTE" "$TMP_OUT" "$VERSION" "$VERSION_CODE" "$APK_URL" "$NOTES" <<'PY'
import json
import sys

remote_path, out_path, version, code, url, notes = sys.argv[1:7]
with open(remote_path, encoding="utf-8") as handle:
    text = handle.read().strip()
data = json.loads(text) if text else {}

# 只覆盖 paperclipWeb, 顶层驾驶舱字段原样保留。
data["paperclipWeb"] = {
    "version": version,
    "versionCode": int(code),
    "downloadUrl": url,
    "releaseNotes": notes,
}

with open(out_path, "w", encoding="utf-8") as handle:
    json.dump(data, handle, indent=2, ensure_ascii=False)
    handle.write("\n")
print(json.dumps(data["paperclipWeb"], indent=2, ensure_ascii=False))
PY

scp "$TMP_OUT" "$SSH_TARGET:$REMOTE_VERSION_JSON" >/dev/null
# Caddy 以 caddy 用户直出该文件; scp 落盘 mode 受远端 umask 影响, 显式放开读权限,
# 否则 403 → App 静默判定「无更新」。
ssh "$SSH_TARGET" "chmod 644 '$REMOTE_VERSION_JSON'"

echo ""
echo "✅ 已合并 paperclipWeb → $VERSION_JSON_URL"
