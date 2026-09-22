#!/usr/bin/env bash
#==============================================================================
# release-app.sh — Coolie App 一键发版 (Android release APK + 云端 version.json + OTA)
#
# 用法:
#   bash scripts/release-app.sh <新版本号> "<更新说明>"
#   bash scripts/release-app.sh <新版本号> "<更新说明>" --dry-run
# 示例:
#   bash scripts/release-app.sh 0.3.1 "修复本体图谱点击错位"
#   bash scripts/release-app.sh 0.3.1 "修复本体图谱点击错位" --dry-run
#
# 流程:
#   1. 前置检查 (clients/expo 工作区干净、全仓 tracked 无改动即 1.5 commit 强制、版本号合法且非当前版本)
#   2. 改 clients/expo/app.json / package.json 版本号
#   3. clients/expo/CHANGELOG.md 顶部插入新版本节
#   4. git add + commit (不 push) — 该 commit hash 记入 version.json 的 commitSha
#   5. 修正 AndroidManifest：OTA 打开 + 原生 runtimeVersion 跟随 app.json（漂移则拒绝发版）
#   6. gradle assembleRelease 出 APK (失败则回退上一步的 commit)
#   7. coscli 上传 APK 到 COS
#   8. 生成 version.json (含 commitSha) 并 scp 到生产 (App 内升级检测用)
#   9. 发布 OTA 增量更新
#  10. 输出汇总
#
# 配置 (环境变量):
#   COS_BUCKET           COS 目标前缀   (默认: cos://gzbucket/coolie/app)
#   DLS_BASE             APK 下载前缀    (默认: https://dls.xrobinai.cn/coolie/app)
#   SSH_TARGET           ssh 目标        (默认: tc-coolie-claw)
#   REMOTE_VERSION_JSON  远端 version.json 路径 (默认: /opt/coolie/ui/dist/version.json)
#==============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXPO_DIR="$REPO_ROOT/clients/expo"
APK_SRC="$EXPO_DIR/android/app/build/outputs/apk/release/app-release.apk"

COS_BUCKET="${COS_BUCKET:-cos://gzbucket/coolie/app}"
DLS_BASE="${DLS_BASE:-https://dls.xrobinai.cn/coolie/app}"
SSH_TARGET="${SSH_TARGET:-tc-coolie-claw}"
REMOTE_VERSION_JSON="${REMOTE_VERSION_JSON:-/opt/coolie/ui/dist/version.json}"
VERSION_JSON_URL="${VERSION_JSON_URL:-https://xrobinai.cn/version.json}"

# gradle 直构建需要 JDK 17 + 命令行工具链
export JAVA_HOME="${JAVA_HOME:-$HOME/jdk/jdk-17.0.20.1+1/Contents/Home}"
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Library/Developer/CommandLineTools}"

DRY_RUN=0
ARGS=()
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help) sed -n '3,30p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) ARGS+=("$arg") ;;
  esac
done

VERSION="${ARGS[0]:-}"
NOTES="${ARGS[1]:-}"
# 说明里的换行会破坏 CHANGELOG 列表，也会让 version.json 变成非法 JSON，统一压成单行
NOTES="$(printf '%s' "$NOTES" | tr -s '[:space:]' ' ' | sed -e 's/^ //' -e 's/ $//')"

step() { printf '\n=== %s ===\n' "$1"; }
die() { printf '\n失败: %s\n' "$1" >&2; exit 1; }
dry() { [ "$DRY_RUN" -eq 1 ]; }
# 执行命令；dry-run 下只打印
run() { if dry; then printf '   [dry-run] %s\n' "$*"; else "$@"; fi; }
run_sh() { if dry; then printf '   [dry-run] %s\n' "$1"; else bash -c "$1"; fi; }

# DS 投产一票否决（gate G4，见 server/src/services/release-gate.ts）。
# 公司上下文由 COOLIE_RELEASE_COMPANY_ID 提供：App 发版本身没有公司概念，
# 未设置时跳过；设置后若该公司最近一期 issue 上没有 DS 的 go 决议即拒绝发版。
require_ds_approval() {
  local company_id="${COOLIE_RELEASE_COMPANY_ID:-}"
  local api_base="${COOLIE_API_BASE:-http://localhost:3100}"
  if [ -z "$company_id" ]; then
    echo "   · 跳过：COOLIE_RELEASE_COMPANY_ID 未设置（无公司上下文的 App 发版）"
    return 0
  fi
  local args=(-sS --fail-with-body "$api_base/api/companies/$company_id/release-gate/ds-approval")
  [ -n "${COOLIE_API_TOKEN:-}" ] && args+=(-H "authorization: Bearer $COOLIE_API_TOKEN")
  local body
  if ! body="$(curl "${args[@]}")"; then
    echo "   ✗ DS gate 查询失败（company_id=${company_id}, API=${api_base}）" >&2
    return 1
  fi
  if printf '%s' "$body" | python3 -c 'import json,sys; sys.exit(0 if json.load(sys.stdin).get("approved") else 1)'; then
    echo "   ✓ DS 已签 go（company_id=${company_id}）"
    return 0
  fi
  echo "   ✗ RELEASE_REJECTED_NEEDS_DS: DS 未签 go，拒绝发版" >&2
  printf '%s' "$body" | python3 -c 'import json,sys; print("     reason:", json.load(sys.stdin).get("reason"))' >&2 || true
  return 1
}

if [ -z "$VERSION" ] || [ -z "$NOTES" ]; then
  echo "用法: bash scripts/release-app.sh <新版本号> \"<更新说明>\" [--dry-run]" >&2
  exit 2
fi
if ! printf '%s' "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  die "版本号格式不对: $VERSION (应形如 0.3.1)"
fi

VERSION_CODE="$(python3 -c "v='$VERSION'.split('.'); print(int(v[0])*10000+int(v[1])*100+int(v[2]))")"
APK_URL="$DLS_BASE/$VERSION/coolie-release.apk"
COS_OBJECT="$COS_BUCKET/$VERSION/coolie-release.apk"
TODAY="$(date +%F)"

echo "========================================================"
echo " Coolie App 发版"
echo " 新版本:     v$VERSION (versionCode $VERSION_CODE)"
echo " 更新说明:   $NOTES"
echo " APK 直链:   $APK_URL"
echo " 模式:       $([ "$DRY_RUN" -eq 1 ] && echo 'dry-run (只打印步骤)' || echo '正式发版')"
echo "========================================================"

cd "$REPO_ROOT"

step "[0/9] DS 投产一票否决 (release-gate)"
require_ds_approval || exit 1

step "[1/9] 前置检查"
DIRTY="$(git status --porcelain -- clients/expo)"
if [ -n "$DIRTY" ]; then
  printf 'clients/expo 下有未提交的改动，先处理干净再发版:\n%s\n' "$DIRTY" >&2
  exit 1
fi
# === 1.5 commit 强制检查 (NEW, boss 09-22 23:59 OOB) ===
# 「每个部署打包最好要有提交, 不然丢版本了」: 发版前工作区必须是干净的 commit,
# 否则发出去的产物对不上任何 commit, 无法回溯 / 重发。tracked 有改动直接 abort。
if [ -n "$(git status --porcelain | grep -v '^??')" ]; then
  die "[sanity] git status NOT clean (modified files in tracked). Commit first. Don't ship dirty state."
fi
# untracked 只警告不 abort: 发版要带的源文件若还没 add, 先提醒 (clients/ 下尤其危险)。
if [ -n "$(git status --porcelain clients/ packages/ server/ docs-coolie/ scripts/ 2>/dev/null | grep '^??')" ]; then
  echo "[warning] untracked files in tracked dirs. Run 'git add' first."
fi

CURRENT_VERSION="$(python3 -c "import json; print(json.load(open('$EXPO_DIR/app.json'))['expo']['version'])")"
[ "$CURRENT_VERSION" != "$VERSION" ] || die "当前已是 v${CURRENT_VERSION}，无需发版"
COMMIT_BEFORE="$(git rev-parse HEAD)"
echo "工作区干净；当前版本 v$CURRENT_VERSION → v$VERSION"
echo "回退点: ${COMMIT_BEFORE:0:12}"

step "[2/9] 更新 app.json / package.json 版本号"
if dry; then
  echo "   [dry-run] $EXPO_DIR/app.json      expo.version = $VERSION"
  echo "   [dry-run] $EXPO_DIR/package.json  version      = $VERSION"
else
  python3 - "$EXPO_DIR/app.json" "expo.version" "$VERSION" "$EXPO_DIR/package.json" "version" "$VERSION" <<'PY'
import json
import sys

args = sys.argv[1:]
for path, key, value in zip(args[0::3], args[1::3], args[2::3]):
    with open(path, encoding="utf-8") as handle:
        data = json.load(handle)
    target = data
    parts = key.split(".")
    for part in parts[:-1]:
        target = target[part]
    target[parts[-1]] = value
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    print(f"   ✓ {path} → {key} = {value}")
PY
fi

# android/app/build.gradle 才是 gradle 直构建真正的版本来源：app.json 的
# android.versionCode 只在 `expo prebuild` 时写进 build.gradle。本仓库的 android/
# 是 gitignore 的本地预构建目录、走 gradle 直构建（不跑 prebuild），所以这里
# 就地同步它的版本号，否则 APK 的 manifest 会一直停在上一个版本，和 version.json
# 对不上。android/ 不进提交，改完即用。
if dry; then
  echo "   [dry-run] $EXPO_DIR/app.json  expo.android.versionCode = $VERSION_CODE"
  echo "   [dry-run] $EXPO_DIR/android/app/build.gradle  versionCode $VERSION_CODE / versionName \"$VERSION\""
else
  python3 - "$EXPO_DIR/app.json" "$VERSION_CODE" <<'PY'
import json
import sys

path, code = sys.argv[1], int(sys.argv[2])
with open(path, encoding="utf-8") as handle:
    data = json.load(handle)
data["expo"]["android"]["versionCode"] = code
with open(path, "w", encoding="utf-8") as handle:
    json.dump(data, handle, indent=2, ensure_ascii=False)
    handle.write("\n")
print(f"   ✓ {path} → expo.android.versionCode = {code}")
PY
  sed -i '' -E "s/versionCode [0-9]+/versionCode $VERSION_CODE/" "$EXPO_DIR/android/app/build.gradle"
  sed -i '' -E "s/versionName \"[^\"]*\"/versionName \"$VERSION\"/" "$EXPO_DIR/android/app/build.gradle"
  grep -nE 'versionCode|versionName' "$EXPO_DIR/android/app/build.gradle" | sed 's/^/   ✓ build.gradle /'
fi

step "[3/9] CHANGELOG.md 顶部插入 v$VERSION 节"
if dry; then
  echo "   [dry-run] 在首个 '## v' 节前插入: ## v$VERSION / > Released: $TODAY · Android release APK / ### 更新 / - $NOTES"
else
  python3 - "$EXPO_DIR/CHANGELOG.md" "$VERSION" "$TODAY" "$NOTES" <<'PY'
import sys

path, version, today, notes = sys.argv[1:5]
section = (
    f"## v{version}\n\n"
    f"> Released: {today} · Android release APK\n\n"
    "### 更新\n\n"
    f"- {notes}\n\n"
    "---\n\n"
)
with open(path, encoding="utf-8") as handle:
    lines = handle.readlines()
index = next((i for i, line in enumerate(lines) if line.startswith("## v")), len(lines))
lines.insert(index, section)
with open(path, "w", encoding="utf-8") as handle:
    handle.writelines(lines)
print(f"   ✓ 已插入 v{version} 节 (位于第 {index + 1} 行)")
PY
fi

step "[4/9] 提交发版 commit (不 push)"
if dry; then
  echo "   [dry-run] git add clients/expo/{app.json,package.json,CHANGELOG.md}"
  echo "   [dry-run] git commit -m \"release: v$VERSION — $NOTES\""
else
  # android/ 是 gitignore 的本地预构建目录，不进提交；[2/9] 已就地改好它的版本号。
  git add "$EXPO_DIR/app.json" "$EXPO_DIR/package.json" "$EXPO_DIR/CHANGELOG.md"
  git commit -m "release: v$VERSION — $NOTES"
  echo "   ✓ 已提交 $(git rev-parse --short HEAD)"
fi
# 发版 commit hash — 写入 version.json 的 commitSha (J2)，供回溯 / 重发。
RELEASE_COMMIT="$(git rev-parse HEAD)"
echo "发版 commit: ${RELEASE_COMMIT:0:12}"

step "[5/9] 确保 Android OTA 配置打开 + 运行时版本跟随 app.json"
# fix-android-manifest.sh 会把原生 EXPO_RUNTIME_VERSION 重写成 app.json 的运行时意图
# (policy=appVersion → expo.version)。native 与 app.json 漂移时 expo-updates 会认为
# 运行时不符，bundle 只下载不加载 —— 所以这里 fail-loud 断言，而不是让它带病出包。
run bash "$EXPO_DIR/scripts/fix-android-manifest.sh"
NATIVE_MANIFEST="$EXPO_DIR/android/app/src/main/AndroidManifest.xml"
EXPECTED_RUNTIME="$(node "$EXPO_DIR/scripts/runtime-version.mjs" --app-json)"
if dry; then
  echo "   [dry-run] 断言 $NATIVE_MANIFEST 的 EXPO_RUNTIME_VERSION == $EXPECTED_RUNTIME"
else
  ACTUAL_RUNTIME="$(node "$EXPO_DIR/scripts/runtime-version.mjs" --native-manifest "$NATIVE_MANIFEST")" ||
    die "读不到 $NATIVE_MANIFEST 的 EXPO_RUNTIME_VERSION"
  [ "$ACTUAL_RUNTIME" = "$EXPECTED_RUNTIME" ] ||
    die "原生 EXPO_RUNTIME_VERSION=$ACTUAL_RUNTIME ≠ app.json 意图 $EXPECTED_RUNTIME —— OTA 会「下了不装」，拒绝发版"
  echo "   ✓ 原生 runtimeVersion = $EXPECTED_RUNTIME (与 app.json 一致)"
fi

step "[6/9] gradle assembleRelease"
echo "   JAVA_HOME=$JAVA_HOME"
echo "   DEVELOPER_DIR=$DEVELOPER_DIR"
BUILD_OK=1
if dry; then
  echo "   [dry-run] cd $EXPO_DIR/android && ./gradlew assembleRelease -x lint --no-daemon"
else
  if ! ( cd "$EXPO_DIR/android" && ./gradlew assembleRelease -x lint --no-daemon ); then
    BUILD_OK=0
  fi
fi
if [ "$BUILD_OK" -eq 0 ]; then
  echo ""
  echo "构建失败，回退发版 commit 到 ${COMMIT_BEFORE:0:12}"
  if dry; then
    echo "   [dry-run] git reset --hard $COMMIT_BEFORE"
  else
    git reset --hard "$COMMIT_BEFORE"
  fi
  die "gradle assembleRelease 失败，已回退 commit（未上传任何产物）"
fi
[ -f "$APK_SRC" ] || dry || die "未找到构建产物: $APK_SRC"
echo "   ✓ 产物就绪: $APK_SRC"

step "[7/9] 上传 APK 到 COS ($COS_OBJECT)"
run_sh "no_proxy=.myqcloud.com coscli cp '$APK_SRC' '$COS_OBJECT'"
echo "   ✓ APK 直链: $APK_URL"

step "[8/9] 生成并上传 version.json ($SSH_TARGET:$REMOTE_VERSION_JSON)"
TMP_JSON="$(mktemp -t coolie-version-json.XXXXXX)"
if dry; then
  echo "   [dry-run] 生成 version.json:"
  printf '   [dry-run]   { "version": "%s", "versionCode": %s, "downloadUrl": "%s", "releaseNotes": "%s", "commitSha": "%s" }\n' \
    "$VERSION" "$VERSION_CODE" "$APK_URL" "$NOTES" "$RELEASE_COMMIT"
  echo "   [dry-run] scp <tmp>/version.json $SSH_TARGET:$REMOTE_VERSION_JSON"
else
  python3 - "$TMP_JSON" "$VERSION" "$VERSION_CODE" "$APK_URL" "$NOTES" "$RELEASE_COMMIT" <<'PY'
import json
import sys

path, version, code, url, notes, commit = sys.argv[1:7]
with open(path, "w", encoding="utf-8") as handle:
    json.dump(
        {
            "version": version,
            "versionCode": int(code),
            "downloadUrl": url,
            "releaseNotes": notes,
            "commitSha": commit,
        },
        handle,
        indent=2,
        ensure_ascii=False,
    )
    handle.write("\n")
PY
  cat "$TMP_JSON"
  scp "$TMP_JSON" "$SSH_TARGET:$REMOTE_VERSION_JSON"
  # Caddy 以 caddy 用户读这个文件直出 /version.json。scp 落盘的 mode 受远端
  # umask 影响（实测 600），会让直出变成 403、App 静默判定「无更新」。显式放开读权限。
  ssh "$SSH_TARGET" "chmod 644 '$REMOTE_VERSION_JSON'"
fi
rm -f "$TMP_JSON"
echo "   ✓ 升级检测地址: $VERSION_JSON_URL"

step "[9/9] 发布 OTA 增量更新 (android)"
run_sh "cd '$EXPO_DIR' && bash scripts/publish-ota.sh android"

printf '\n========================================================\n'
printf ' 发版完成:      v%s (versionCode %s)\n' "$VERSION" "$VERSION_CODE"
printf ' APK 直链:      %s\n' "$APK_URL"
printf ' COS 对象:      %s\n' "$COS_OBJECT"
printf ' version.json:  %s → %s:%s\n' "$VERSION_JSON_URL" "$SSH_TARGET" "$REMOTE_VERSION_JSON"
printf ' OTA (android): %s\n' "$(dry && echo 'dry-run 未发布' || echo '已发布到 https://xrobinai.cn/ota/manifest')"
printf '========================================================\n'
