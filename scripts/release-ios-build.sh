#!/usr/bin/env bash
#==============================================================================
# release-ios-build.sh — Coolie iOS 本地打包 (仿 wenlv-next scripts/app-build.sh)
#
# 用法:
#   bash scripts/release-ios-build.sh <version> <debug|release|profile> [选项]
# 示例:
#   bash scripts/release-ios-build.sh 0.5.97 debug --no-codesign   # 未签名兜底包 (爱思助手重签)
#   bash scripts/release-ios-build.sh 0.5.97 release              # 签名 + exportArchive (ad-hoc)
#   bash scripts/release-ios-build.sh 0.5.97 profile              # 同 release
#
# 模式 (mode):
#   debug    xcodebuild archive --no-codesign -> Payload 手工封装 .ipa (无需证书)
#   release  xcodebuild archive + xcodebuild -exportArchive -> 签名 .ipa (method=$IOS_EXPORT_METHOD)
#   profile  同 release (RN 工程只有 Debug/Release 两套 config，Profile 落到 Release)
#
# 选项:
#   --no-codesign    强制走未签名路径 (任意 mode 都关签名，出未签名 .ipa)
#   --skip-prebuild  跳过 expo prebuild
#   --skip-pods      跳过 pod install
#   --repo-update    pod install 加 --repo-update (默认不加，走 Podfile.lock 确定性)
#   -h|--help        显示帮助
#
# 环境:
#   IOS_ENV_FILE   凭证文件 (默认 ~/secure/ios-build.env，gitignored，凭证不入仓)
#                  key 见 ~/secure/ios-build.env 模板: COS_* / APPLE_* / IOS_* / SSH_*
#
# 产物:
#   debug             ios/build/unsigned/Coolie.app  +  ios/build/ipa/coolie-<ver>-ios-unsigned.ipa
#   release/profile   ios/build/ipa/coolie-<ver>-ios.ipa
#
# 说明:
#   · prebuild 不带 --clean: ios/Podfile 里有一段 Xcode 27 的 pod deployment-target
#     补丁，--clean 会连 ios/ 一起删掉，补丁就没了 (wave129 记录)。
#   · 归档前强制修版本漂移: pbxproj MARKETING_VERSION / CURRENT_PROJECT_VERSION
#     与 Info.plist CFBundleShortVersionString / CFBundleVersion 对齐 app.json，
#     否则 runtimeVersion(policy=appVersion) 与 OTA 口径对不上。
#==============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXPO_DIR="$REPO_ROOT/clients/expo"
IOS_DIR="$EXPO_DIR/ios"
BUILD_DIR="$IOS_DIR/build"
IPA_DIR="$BUILD_DIR/ipa"
UNSIGNED_DIR="$BUILD_DIR/unsigned"
SCHEME="${IOS_SCHEME:-Coolie}"
WORKSPACE="$IOS_DIR/Coolie.xcworkspace"
PROJECT="$IOS_DIR/Coolie.xcodeproj"
PBXPROJ="$PROJECT/project.pbxproj"
INFOPLIST="$IOS_DIR/Coolie/Info.plist"

step() { printf '\n=== %s ===\n' "$1"; }
die() { printf '\n失败: %s\n' "$1" >&2; exit 1; }
info() { printf '   %s\n' "$1"; }

# 设备用 Debug 包默认不内嵌 JS bundle (设计上靠 Metro 供包)，重签后无法独立运行。
# pbxproj 的「Bundle React Native code and images」脚本阶段在 Debug 下会
# `export SKIP_BUNDLING=1`，唯一官方覆盖点是它随后 source 的 .xcode.env.updates。
# 临时写入以清空 SKIP_BUNDLING，跑完删除（不永久污染本地工程）。
BUNDLE_OVERRIDE_CREATED=0
cleanup_bundle_override() { if [ "$BUNDLE_OVERRIDE_CREATED" -eq 1 ]; then rm -f "$IOS_DIR/.xcode.env.updates"; fi; }
trap cleanup_bundle_override EXIT

# ── 0. 载入凭证 ───────────────────────────────────────────────────────────
IOS_ENV_FILE="${IOS_ENV_FILE:-$HOME/secure/ios-build.env}"
if [ -f "$IOS_ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$IOS_ENV_FILE"
  set +a
else
  echo "[warn] 未找到凭证文件 $IOS_ENV_FILE (debug 未签名路径可不需要签名凭证)" >&2
fi

# ── 1. 参数 ──────────────────────────────────────────────────────────────
NO_CODESIGN=0
SKIP_PREBUILD=0
SKIP_PODS=0
REPO_UPDATE=0
ARGS=()
for arg in "$@"; do
  case "$arg" in
    --no-codesign) NO_CODESIGN=1 ;;
    --skip-prebuild) SKIP_PREBUILD=1 ;;
    --skip-pods) SKIP_PODS=1 ;;
    --repo-update) REPO_UPDATE=1 ;;
    -h|--help) sed -n '3,37p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) ARGS+=("$arg") ;;
  esac
done

VERSION="${ARGS[0]:-}"
MODE="${ARGS[1]:-}"
if [ -z "$VERSION" ] || [ -z "$MODE" ]; then
  echo "用法: bash scripts/release-ios-build.sh <version> <debug|release|profile> [--no-codesign] [--skip-prebuild] [--skip-pods] [--repo-update]" >&2
  exit 2
fi
case "$MODE" in
  debug|release|profile) ;;
  *) die "mode 仅支持 debug / release / profile (收到: $MODE)" ;;
esac
printf '%s' "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || die "版本号格式不对: $VERSION (应形如 0.5.97)"

# debug 模式默认未签名；--no-codesign 可强制任意模式关签名
if [ "$MODE" = "debug" ]; then NO_CODESIGN=1; fi

VERSION_CODE="${IOS_VERSION_CODE:-}"
if [ -z "$VERSION_CODE" ]; then
  VERSION_CODE="$(python3 -c "v='$VERSION'.split('.'); print(int(v[0])*10000+int(v[1])*100+int(v[2]))")"
fi

# 归档配置：debug 用 Debug，release/profile 用 Release
if [ "$MODE" = "debug" ]; then CONFIG="Debug"; else CONFIG="Release"; fi

echo "========================================================"
echo " Coolie iOS 打包"
echo " 版本:     v$VERSION (build $VERSION_CODE)"
echo " 模式:     $MODE (xcconfig $CONFIG)"
echo " 签名:     $([ "$NO_CODESIGN" -eq 1 ] && echo '关闭 (未签名 .ipa)' || echo "开启 (team ${APPLE_TEAM_ID:-未设})")"
echo " 凭证:     $IOS_ENV_FILE"
echo "========================================================"

[ -d "$IOS_DIR" ] || die "未找到 iOS 工程目录: $IOS_DIR (先跑一次 expo prebuild --platform ios)"
command -v xcodebuild >/dev/null 2>&1 || die "未找到 xcodebuild (装 Xcode 并 xcode-select)"

cd "$REPO_ROOT"

# ── 2. expo prebuild (不带 --clean，保住 Podfile 补丁) ─────────────────────
step "[1/6] expo prebuild --platform ios (no --clean)"
if [ "$SKIP_PREBUILD" -eq 1 ]; then
  info "跳过 (--skip-prebuild)"
else
  ( cd "$EXPO_DIR" && npx expo prebuild --platform ios --no-install )
  info "prebuild 完成"
fi

# ── 3. 修版本漂移 + bundle id ─────────────────────────────────────────────
step "[2/6] 修原生工程版本漂移 (→ $VERSION / $VERSION_CODE)"
[ -f "$PBXPROJ" ] || die "未找到 pbxproj: $PBXPROJ"
[ -f "$INFOPLIST" ] || die "未找到 Info.plist: $INFOPLIST"

# bundle id 以 app.json 为唯一真源 (prebuild 也是从它生成原生工程)。
# env 的 APPLE_BUNDLE_ID 只作显式覆盖；与 app.json 不一致时 fail-loud，
# 避免静默打出与仓库不一致的 App ID / 用错 profile。
APP_JSON_BUNDLE_ID="$(python3 -c "import json;print(json.load(open('$EXPO_DIR/app.json'))['expo'].get('ios',{}).get('bundleIdentifier',''))" 2>/dev/null || true)"
if [ -n "${APPLE_BUNDLE_ID:-}" ]; then
  if [ -n "$APP_JSON_BUNDLE_ID" ] && [ "$APPLE_BUNDLE_ID" != "$APP_JSON_BUNDLE_ID" ]; then
    die "bundle id 冲突: env APPLE_BUNDLE_ID=$APPLE_BUNDLE_ID ≠ app.json=$APP_JSON_BUNDLE_ID (改一处使之一致, 或取消 env 覆盖)"
  fi
else
  APPLE_BUNDLE_ID="$APP_JSON_BUNDLE_ID"
fi

sed -i '' -E "s/MARKETING_VERSION = [^;]*;/MARKETING_VERSION = $VERSION;/g" "$PBXPROJ"
sed -i '' -E "s/CURRENT_PROJECT_VERSION = [^;]*;/CURRENT_PROJECT_VERSION = $VERSION_CODE;/g" "$PBXPROJ"
if [ -n "$APPLE_BUNDLE_ID" ]; then
  sed -i '' -E "s/PRODUCT_BUNDLE_IDENTIFIER = [^;]*;/PRODUCT_BUNDLE_IDENTIFIER = $APPLE_BUNDLE_ID;/g" "$PBXPROJ"
fi
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $VERSION" "$INFOPLIST" 2>/dev/null \
  || sed -i '' -E "/<key>CFBundleShortVersionString<\/key>/{n;s#<string>[^<]*</string>#<string>$VERSION</string>#;}" "$INFOPLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $VERSION_CODE" "$INFOPLIST" 2>/dev/null \
  || sed -i '' -E "/<key>CFBundleVersion<\/key>/{n;s#<string>[^<]*</string>#<string>$VERSION_CODE</string>#;}" "$INFOPLIST"

info "pbxproj: $(grep -m1 -E 'MARKETING_VERSION = [^;]*;' "$PBXPROJ" | tr -d '\t')"
info "pbxproj: $(grep -m1 -E 'CURRENT_PROJECT_VERSION = [^;]*;' "$PBXPROJ" | tr -d '\t')"
info "bundleId: $(grep -m1 -E 'PRODUCT_BUNDLE_IDENTIFIER = [^;]*;' "$PBXPROJ" | tr -d '\t')"
info "Info.plist: short=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$INFOPLIST" 2>/dev/null) build=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$INFOPLIST" 2>/dev/null)"

# ── 4. pod install ───────────────────────────────────────────────────────
step "[3/6] pod install"
if [ "$SKIP_PODS" -eq 1 ]; then
  info "跳过 (--skip-pods)"
else
  if [ "$NO_CODESIGN" -eq 0 ] && [ ! -d "$WORKSPACE" ]; then
    info "未找到 workspace，强制 pod install 生成"
  fi
  POD_ARGS=(install)
  [ "$REPO_UPDATE" -eq 1 ] && POD_ARGS+=(--repo-update)
  ( cd "$IOS_DIR" && bundle exec pod "${POD_ARGS[@]}" 2>/dev/null || pod "${POD_ARGS[@]}" )
  info "pod install 完成"
fi
[ -d "$WORKSPACE" ] || die "未找到 workspace: $WORKSPACE (pod install 未生成?)"

# ── 5. archive ───────────────────────────────────────────────────────────
mkdir -p "$BUILD_DIR" "$IPA_DIR" "$UNSIGNED_DIR"
ARCHIVE_PATH="$BUILD_DIR/Coolie-$VERSION-$MODE.xcarchive"
rm -rf "$ARCHIVE_PATH"

step "[4/6] xcodebuild archive ($CONFIG)"
# Debug + 设备：清空 SKIP_BUNDLING，让归档把 JS bundle 内嵌进 .app（见顶部说明）。
if [ "$NO_CODESIGN" -eq 1 ] && [ "$CONFIG" = "Debug" ] && [ ! -f "$IOS_DIR/.xcode.env.updates" ]; then
  printf 'export SKIP_BUNDLING=\n' > "$IOS_DIR/.xcode.env.updates"
  BUNDLE_OVERRIDE_CREATED=1
  info "临时写 .xcode.env.updates (清空 SKIP_BUNDLING, 内嵌 JS bundle)"
fi
ARCHIVE_ARGS=(
  archive
  -workspace "$WORKSPACE"
  -scheme "$SCHEME"
  -configuration "$CONFIG"
  -sdk iphoneos
  -destination "generic/platform=iOS"
  -archivePath "$ARCHIVE_PATH"
  -derivedDataPath "$BUILD_DIR/DerivedData"
)
if [ "$NO_CODESIGN" -eq 1 ]; then
  info "未签名归档 (CODE_SIGNING_ALLOWED=NO)"
  xcodebuild "${ARCHIVE_ARGS[@]}" \
    CODE_SIGN_IDENTITY="" CODE_SIGNING_REQUIRED=NO CODE_SIGNING_ALLOWED=NO
else
  [ -n "${APPLE_TEAM_ID:-}" ] || die "签名模式缺少 APPLE_TEAM_ID (在 $IOS_ENV_FILE 配置)"
  info "签名归档 (team $APPLE_TEAM_ID)"
  xcodebuild "${ARCHIVE_ARGS[@]}" \
    -allowProvisioningUpdates \
    DEVELOPMENT_TEAM="$APPLE_TEAM_ID" CODE_SIGN_STYLE=Automatic
fi
[ -d "$ARCHIVE_PATH" ] || die "archive 未生成: $ARCHIVE_PATH"
info "xcarchive: $ARCHIVE_PATH"

APP_PATH="$ARCHIVE_PATH/Products/Applications/$SCHEME.app"
if [ ! -d "$APP_PATH" ]; then
  APP_PATH="$(/usr/bin/find "$ARCHIVE_PATH/Products/Applications" -maxdepth 1 -name '*.app' 2>/dev/null | head -1 || true)"
fi
[ -n "$APP_PATH" ] && [ -d "$APP_PATH" ] || die "archive 内未找到 .app"

# ── 6. 出 .ipa ───────────────────────────────────────────────────────────
step "[5/6] 生成 .ipa"
if [ "$NO_CODESIGN" -eq 1 ]; then
  IPA_PATH="$IPA_DIR/coolie-$VERSION-ios-unsigned.ipa"
  rm -rf "$UNSIGNED_DIR"
  mkdir -p "$UNSIGNED_DIR/Payload"
  cp -R "$APP_PATH" "$UNSIGNED_DIR/Payload/"
  ( cd "$UNSIGNED_DIR" && zip -qry "$IPA_PATH" Payload )
  info "未签名 .app: $UNSIGNED_DIR/Payload/$(basename "$APP_PATH")"
else
  IPA_PATH="$IPA_DIR/coolie-$VERSION-ios.ipa"
  EXPORT_PLIST="$BUILD_DIR/ExportOptions.plist"
  EXPORT_METHOD="${IOS_EXPORT_METHOD:-ad-hoc}"
  cat > "$EXPORT_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>$EXPORT_METHOD</string>
  <key>teamID</key><string>${APPLE_TEAM_ID:-}</string>
  <key>signingStyle</key><string>automatic</string>
  <key>compileBitcode</key><false/>
  <key>stripSwiftSymbols</key><true/>
</dict>
</plist>
PLIST
  info "exportArchive method=$EXPORT_METHOD"
  xcodebuild -exportArchive \
    -archivePath "$ARCHIVE_PATH" \
    -exportPath "$IPA_DIR" \
    -exportOptionsPlist "$EXPORT_PLIST" \
    -allowProvisioningUpdates
  EXPORTED="$(/usr/bin/find "$IPA_DIR" -maxdepth 1 -name '*.ipa' -newer "$EXPORT_PLIST" 2>/dev/null | head -1 || true)"
  [ -n "$EXPORTED" ] || EXPORTED="$(/usr/bin/find "$IPA_DIR" -maxdepth 1 -name '*.ipa' 2>/dev/null | head -1 || true)"
  [ -n "$EXPORTED" ] || die "exportArchive 未产生 .ipa"
  if [ "$EXPORTED" != "$IPA_PATH" ]; then mv "$EXPORTED" "$IPA_PATH"; fi
fi
[ -f "$IPA_PATH" ] || die "未生成 .ipa: $IPA_PATH"

# ── 7. 汇总 ──────────────────────────────────────────────────────────────
step "[6/6] 产物"
SHA="$(shasum -a 256 "$IPA_PATH" | awk '{print $1}')"
SIZE="$(wc -c < "$IPA_PATH" | tr -d '[:space:]')"
echo "   IPA:    $IPA_PATH"
echo "   size:   $SIZE bytes"
echo "   sha256: $SHA"
if [ "$NO_CODESIGN" -eq 1 ]; then
  echo "   签名:   未签名 (爱思助手/Sideloadly 以个人 Apple ID 重签后安装)"
else
  echo "   签名:   $(codesign -dv "$IPA_PATH" 2>&1 | grep -m1 -E 'Authority|Signature' || echo '(见 .app 内签名)')"
fi
echo "   → 发布: bash scripts/release-ios-cos.sh --version $VERSION [--register] [--verify]"
