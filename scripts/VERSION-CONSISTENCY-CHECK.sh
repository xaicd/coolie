#!/usr/bin/env bash
#==============================================================================
# VERSION-CONSISTENCY-CHECK.sh — 校验 7 个版本号源全一致 (wave265 老板原话: 「版本号码要一致」)
#
# 用法:
#   bash scripts/VERSION-CONSISTENCY-CHECK.sh             # 默认从 app.json 读期望版本
#   bash scripts/VERSION-CONSISTENCY-CHECK.sh 0.6.19      # 期望版本号 (CI 可显式传)
#   SKIP_REMOTE=1 bash scripts/VERSION-CONSISTENCY-CHECK.sh  # 离线 / CI 不查远端
#
# 校验 7 处版本号源 (必须互相对齐):
#   1. clients/expo/app.json                  → expo.version + expo.android.versionCode
#   2. clients/expo/package.json              → version
#   3. clients/expo/android/app/build.gradle  → versionName + versionCode
#   4. clients/expo/CHANGELOG.md              → 顶部首个 `## v` 节
#   5. 远端 version.json                      → https://xrobinai.cn/version.json (version + versionCode)
#   6. 远端 OTA manifest                      → runtimeVersion (期望值按 app.json 的
#                                                expo.runtimeVersion.policy 分支, wave292:
#                                                fingerprint → 本地同口径哈希 + 真客户端头探针;
#                                                appVersion/缺省/字面量 → 版本号/字面量, 回滚兼容)
#   7. git tag                                 → v<version> 存在 (本地 tag 即可, push 单独管)
#
# 退出码:
#   0  一致
#   1  有不一致项, 报告印到 stderr
#  注: 远端两项 (5 / 6) 网络不可达时仅警告, 不 abort (发版前 OTA 还没上线 / CI 离线)
#==============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXPO_DIR="$REPO_ROOT/clients/expo"
APP_JSON="$EXPO_DIR/app.json"
PKG_JSON="$EXPO_DIR/package.json"
BUILD_GRADLE="$EXPO_DIR/android/app/build.gradle"
CHANGELOG="$EXPO_DIR/CHANGELOG.md"
LOCAL_VERSION_JSON="$REPO_ROOT/version.json"
VERSION_JSON_URL="${VERSION_JSON_URL:-https://xrobinai.cn/version.json}"
OTA_MANIFEST_URL="${OTA_MANIFEST_URL:-https://xrobinai.cn/ota/manifest}"
SKIP_REMOTE="${SKIP_REMOTE:-0}"

EXPECT="${1:-}"
if [ -z "$EXPECT" ]; then
  EXPECT="$(python3 -c 'import json; print(json.load(open("'"$APP_JSON"'"))["expo"]["version"])' 2>/dev/null || echo "")"
fi

step() { printf '\n=== %s ===\n' "$1"; }
warn() { printf '   ⚠ %s\n' "$1"; }
fail() { printf '   ✗ %s\n' "$1" >&2; FAIL=1; }
ok()   { printf '   ✓ %s\n' "$1"; }
have_jq() { command -v jq >/dev/null 2>&1; }

FAIL=0

step "期望版本"
if [ -z "$EXPECT" ]; then
  fail "无法读 app.json 的 expo.version (期望版本未知)"
  printf '无法继续 — 显式传参: bash scripts/VERSION-CONSISTENCY-CHECK.sh 0.6.19\n' >&2
  exit 1
fi
EXPECT_CODE="$(python3 -c "v='$EXPECT'.split('.'); print(int(v[0])*10000+int(v[1])*100+int(v[2]))")"
printf '   期望: %s (versionCode %s)\n' "$EXPECT" "$EXPECT_CODE"

# 第 6 项的期望 runtimeVersion — 按 app.json 的 expo.runtimeVersion 声明分支 (wave292)。
#   fingerprint → 期望值 = 本地同口径哈希: clients/expo/scripts/runtime-version.mjs
#                 --app-json (内部 expo-updates fingerprint:generate, 哈希口径统一声明在
#                 clients/expo/fingerprint.config.js), 探针带真客户端头 (expo-platform/
#                 expo-runtime-version/expo-channel-name), 与装机 App 的检查请求同一条
#                 服务端路径 (wave86 动态分发)。
#   appVersion / 缺省 / 字面量 → wave265 时代口径 (期望 = 版本号 / 字面量), 回滚兼容。
# 本地算不出哈希 (无 node / expo-updates) 时第 6 项降级为警告 — 与远端两项既有哲学一致。
RV_MODE="$(python3 -c '
import json
rv = json.load(open("'"$APP_JSON"'"))["expo"].get("runtimeVersion")
if rv is None or rv == "appVersion" or (isinstance(rv, dict) and rv.get("policy") == "appVersion"):
    print("appVersion")
elif isinstance(rv, str):
    print("literal")
elif isinstance(rv, dict) and rv.get("policy") == "fingerprint":
    print("fingerprint")
elif isinstance(rv, dict) and isinstance(rv.get("policy"), str):
    print("unsupported:" + rv["policy"])
else:
    print("unknown")
' 2>/dev/null || echo unknown)"

WANT_RT=""
case "$RV_MODE" in
  appVersion)
    WANT_RT="$EXPECT" ;;
  literal)
    WANT_RT="$(python3 -c 'import json; print(json.load(open("'"$APP_JSON"'"))["expo"]["runtimeVersion"])')" ;;
  fingerprint)
    RT_ERR="$(mktemp -t coolie-fperr.XXXXXX)"
    if command -v node >/dev/null 2>&1 \
       && WANT_RT="$(node "$EXPO_DIR/scripts/runtime-version.mjs" --app-json 2>"$RT_ERR")"; then
      if printf '%s' "$WANT_RT" | grep -qE '^[0-9a-f]{40}$'; then
        printf '   runtimeVersion 期望: %s (policy=fingerprint 本地同口径哈希)\n' "$WANT_RT"
      else
        warn "本地 fingerprint 哈希形态异常 ($WANT_RT) — 第 6 项仅警告"
        WANT_RT=""
      fi
    else
      warn "无法本地计算 fingerprint 哈希 ($(tail -1 "$RT_ERR" 2>/dev/null || echo 'node/expo-updates 不可用')) — 第 6 项仅警告"
      WANT_RT=""
    fi
    rm -f "$RT_ERR"
    ;;
  unsupported:*)
    fail "expo.runtimeVersion.policy=${RV_MODE#unsupported:} 不支持 (runtime-version.mjs 同样会拒绝)"
    ;;
  *)
    fail "无法识别的 expo.runtimeVersion 形态"
    ;;
esac

step "1. clients/expo/app.json"
V1="$(python3 -c 'import json; print(json.load(open("'"$APP_JSON"'"))["expo"]["version"])')"
C1="$(python3 -c 'import json; print(json.load(open("'"$APP_JSON"'"))["expo"]["android"]["versionCode"])')"
if [ "$V1" = "$EXPECT" ] && [ "$C1" = "$EXPECT_CODE" ]; then
  ok "expo.version=$V1, expo.android.versionCode=$C1"
else
  fail "app.json: version=$V1 (want $EXPECT), versionCode=$C1 (want $EXPECT_CODE)"
fi

step "2. clients/expo/package.json"
V2="$(python3 -c 'import json; print(json.load(open("'"$PKG_JSON"'"))["version"])')"
if [ "$V2" = "$EXPECT" ]; then
  ok "version=$V2"
else
  fail "package.json: version=$V2 (want $EXPECT)"
fi

step "3. clients/expo/android/app/build.gradle"
V3_NAME="$(grep -E 'versionName "' "$BUILD_GRADLE" | head -1 | sed -E 's/.*versionName "([^"]+)".*/\1/')"
V3_CODE="$(grep -E 'versionCode [0-9]+' "$BUILD_GRADLE" | head -1 | sed -E 's/.*versionCode ([0-9]+).*/\1/')"
if [ "$V3_NAME" = "$EXPECT" ] && [ "$V3_CODE" = "$EXPECT_CODE" ]; then
  ok "versionName=\"$V3_NAME\", versionCode=$V3_CODE"
else
  fail "build.gradle: versionName=\"$V3_NAME\" (want $EXPECT), versionCode=$V3_CODE (want $EXPECT_CODE)"
fi

step "4. clients/expo/CHANGELOG.md (顶部首个 ## v 节)"
V4="$(grep -m1 -E '^## v[0-9]+\.[0-9]+\.[0-9]+' "$CHANGELOG" | sed -E 's/^## v//')"
if [ -z "$V4" ]; then
  fail "CHANGELOG.md 找不到 ## v... 节"
elif [ "$V4" = "$EXPECT" ]; then
  ok "顶部节 = v$V4"
else
  fail "CHANGELOG.md 顶部 v$V4 (want v$EXPECT)"
fi

step "5. 远端 version.json ($VERSION_JSON_URL)"
VJSON="$(mktemp -t coolie-version-json.XXXXXX)"
VJSON_HTTP=""
if [ "$SKIP_REMOTE" = "1" ]; then
  warn "SKIP_REMOTE=1 — 跳过远端 version.json 检查"
elif ! VJSON_HTTP="$(curl -sS -m 8 -o "$VJSON" -w '%{http_code}' "$VERSION_JSON_URL" 2>/dev/null)"; then
  warn "远端 version.json 抓取超时 — 仅警告"
elif [ "$VJSON_HTTP" != "200" ]; then
  warn "远端 version.json HTTP $VJSON_HTTP — 仅警告"
else
  V5="$(python3 -c 'import json; print(json.load(open("'"$VJSON"'"))["version"])' 2>/dev/null || echo "")"
  C5="$(python3 -c 'import json; print(json.load(open("'"$VJSON"'"))["versionCode"])' 2>/dev/null || echo "")"
  if [ "$V5" = "$EXPECT" ] && [ "$C5" = "$EXPECT_CODE" ]; then
    ok "version=$V5, versionCode=$C5"
  else
    fail "远端 version.json: version=$V5 (want $EXPECT), versionCode=$C5 (want $EXPECT_CODE)"
  fi
fi
rm -f "$VJSON"

step "6. 远端 OTA manifest ($OTA_MANIFEST_URL)"
OTA_BODY="$(mktemp -t coolie-ota.XXXXXX)"
HTTP_CODE=""
# fingerprint 政策下探针带真客户端头, 走装机 App 同一条服务端动态分发路径 (wave86);
# 其余政策保留裸取 (回滚兼容)。值均为无空格的 token, 可安全走无引号展开 (bash 3.2 兼容)。
OTA_CURL_HDRS=""
if [ "$RV_MODE" = "fingerprint" ] && [ -n "$WANT_RT" ]; then
  OTA_CURL_HDRS="-H expo-platform:android -H expo-runtime-version:$WANT_RT -H expo-channel-name:production"
fi
if [ "$SKIP_REMOTE" = "1" ]; then
  warn "SKIP_REMOTE=1 — 跳过远端 OTA manifest 检查"
elif [ -z "$WANT_RT" ]; then
  warn "期望 runtimeVersion 未知 (见「期望版本」段的 policy 分支) — 跳过比对, 仅警告"
elif ! HTTP_CODE="$(curl -sS -m 8 $OTA_CURL_HDRS -o "$OTA_BODY" -w '%{http_code}' "$OTA_MANIFEST_URL" 2>/dev/null)"; then
  warn "OTA manifest 抓取超时 — 发版前可能 OTA 还没上线, 仅警告"
elif [ "$HTTP_CODE" != "200" ]; then
  warn "OTA manifest HTTP $HTTP_CODE — 仅警告 (期望 $WANT_RT 未上线)"
else
  if have_jq; then
    OTA_RT="$(jq -r '.runtimeVersion // empty' < "$OTA_BODY" 2>/dev/null || true)"
  else
    OTA_RT="$(python3 -c 'import json,sys; d=json.load(open("'"$OTA_BODY"'")); print(d.get("runtimeVersion",""))' 2>/dev/null || true)"
  fi
  if [ -z "$OTA_RT" ]; then
    warn "OTA manifest 200 但解析不到 runtimeVersion — 仅警告"
  elif [ "$OTA_RT" = "$WANT_RT" ]; then
    if [ -n "$OTA_CURL_HDRS" ]; then
      ok "runtimeVersion=$OTA_RT (真客户端头探针, policy=$RV_MODE)"
    else
      ok "runtimeVersion=$OTA_RT"
    fi
  else
    fail "OTA manifest runtimeVersion=$OTA_RT (want $WANT_RT)"
  fi
fi
rm -f "$OTA_BODY"

step "7. git tag v$EXPECT"
if git rev-parse "v$EXPECT" >/dev/null 2>&1; then
  ok "本地 tag v$EXPECT → $(git rev-parse --short v$EXPECT)"
else
  fail "git tag v$EXPECT 不存在 (本地)"
fi

step "总结"
if [ "$FAIL" -eq 0 ]; then
  printf '   ✅ 7 处版本号源全一致 = %s\n' "$EXPECT"
  exit 0
fi
printf '   ❌ 有 %d 处不一致 (见上), 退出码 1\n' "$FAIL" >&2
exit 1
