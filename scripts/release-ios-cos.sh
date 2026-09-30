#!/usr/bin/env bash
#==============================================================================
# release-ios-cos.sh — Coolie iOS .ipa 直传腾讯 COS + 可选登记 (仿 wenlv-next app-release-cos.sh)
#
# 用法:
#   bash scripts/release-ios-cos.sh --version 0.5.97 [--ipa <path>] [--register] [--verify] [--guardrails] [--dry-run]
# 示例:
#   bash scripts/release-ios-cos.sh --version 0.5.97 --verify
#   bash scripts/release-ios-cos.sh --version 0.5.97 --register   # 传 + 生成 manifest/QR + 回填 version.json
#
# 参数:
#   --version <v>   必填，版本号 (进对象键 $COS_PREFIX/$VERSION/coolie-release-ios.ipa)
#   --ipa <path>    安装包路径，默认 ios/build/ipa/coolie-<ver>-ios.ipa (退 <ver>-ios-unsigned.ipa)
#   --verify        上传前 file / codesign -dvv / sha256 校验
#   --register      上传后生成 manifest.plist + QR，回填 version.json 的 ios 字段 (保留 android)，
#                   scp 到生产并公网校验
#   --guardrails    4 项护栏断言: version.json / ota manifest / ios manifest / health 各 200
#   --dry-run       只打印将执行的命令，不真正上传/写远端
#
# 环境 (source ~/secure/ios-build.env，gitignored):
#   COS_BUCKET / COS_PREFIX / COS_PUBLIC_BASE / PUBLIC_ORIGIN
#   APPLE_BUNDLE_ID / IOS_VERSION / SSH_TARGET / REMOTE_VERSION_JSON
#
# 纪律: 腾讯云密钥只在 ~/.cos.yaml；本脚本不打印任何密钥，凭证不入仓。
#==============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXPO_DIR="$REPO_ROOT/clients/expo"
IOS_DIR="$EXPO_DIR/ios"
IPA_DIR="$IOS_DIR/build/ipa"
EVIDENCE_DIR="$REPO_ROOT/docs-coolie/evidence/wave149"

step() { printf '\n=== %s ===\n' "$1"; }
die() { printf '\n失败: %s\n' "$1" >&2; exit 1; }
info() { printf '   %s\n' "$1"; }

PROBE=""; STAGE=""
trap 'rm -rf "${PROBE:-}" "${STAGE:-}"' EXIT

# ── 0. 载入凭证 ───────────────────────────────────────────────────────────
IOS_ENV_FILE="${IOS_ENV_FILE:-$HOME/secure/ios-build.env}"
[ -f "$IOS_ENV_FILE" ] || die "未找到凭证文件 $IOS_ENV_FILE (见 ~/secure/ios-build.env 模板)"
set -a
# shellcheck disable=SC1090
source "$IOS_ENV_FILE"
set +a
COS_BUCKET="${COS_BUCKET:-}"; COS_PREFIX="${COS_PREFIX:-coolie/app}"
COS_PUBLIC_BASE="${COS_PUBLIC_BASE:-}"; PUBLIC_ORIGIN="${PUBLIC_ORIGIN:-https://xrobinai.cn}"
SSH_TARGET="${SSH_TARGET:-tc-coolie-claw}"; REMOTE_VERSION_JSON="${REMOTE_VERSION_JSON:-/opt/coolie/ui/dist/version.json}"
APPLE_BUNDLE_ID="${APPLE_BUNDLE_ID:-cn.xrobinai.cn}"
COSCLI_CONFIG="${COSCLI_CONFIG:-$HOME/.cos.yaml}"

# ── 1. 参数 ──────────────────────────────────────────────────────────────
VERSION=""; IPA_ARG=""; VERIFY=0; REGISTER=0; GUARDRAILS=0; DRY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --version) VERSION="${2:-}"; shift 2 ;;
    --ipa) IPA_ARG="${2:-}"; shift 2 ;;
    --verify) VERIFY=1; shift ;;
    --register) REGISTER=1; shift ;;
    --guardrails) GUARDRAILS=1; shift ;;
    --dry-run) DRY=1; shift ;;
    -h|--help) sed -n '3,24p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "未知参数: $1" ;;
  esac
done
[ -n "$VERSION" ] || die "缺少 --version"
printf '%s' "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || die "版本号格式不对: $VERSION"

run() { if [ "$DRY" -eq 1 ]; then printf '   [dry-run] %s\n' "$*"; else "$@"; fi; }

# ── 2. 定位 ipa + 前置校验 ────────────────────────────────────────────────
if [ -n "$IPA_ARG" ]; then
  IPA="$IPA_ARG"
else
  IPA="$IPA_DIR/coolie-$VERSION-ios.ipa"
  [ -f "$IPA" ] || IPA="$IPA_DIR/coolie-$VERSION-ios-unsigned.ipa"
fi
[ -f "$IPA" ] || die "找不到 .ipa: $IPA (先跑: bash scripts/release-ios-build.sh $VERSION release)"
command -v coscli >/dev/null 2>&1 || die "未找到 coscli (https://cloud.tencent.com/document/product/436/63144)"
[ -f "$COSCLI_CONFIG" ] || die "未找到 coscli 配置: $COSCLI_CONFIG"
[ -n "$COS_BUCKET" ] || die "缺少 COS_BUCKET (在 $IOS_ENV_FILE 配置)"
[ -n "$COS_PUBLIC_BASE" ] || die "缺少 COS_PUBLIC_BASE (在 $IOS_ENV_FILE 配置)"

COS_KEY="$COS_PREFIX/$VERSION/coolie-release-ios.ipa"
REMOTE="cos://$COS_BUCKET/$COS_KEY"
IPA_URL="$COS_PUBLIC_BASE/$COS_KEY"
MANIFEST_KEY="$COS_PREFIX/$VERSION/manifest.plist"
MANIFEST_URL="$COS_PUBLIC_BASE/$MANIFEST_KEY"
QR_KEY="$COS_PREFIX/$VERSION/install-qr-ios.png"
QR_URL="$COS_PUBLIC_BASE/$QR_KEY"
INSTALL_URL="itms-services://?action=download-manifest&url=$MANIFEST_URL"

SHA256="$(shasum -a 256 "$IPA" | awk '{print $1}')"
SIZE="$(wc -c < "$IPA" | tr -d '[:space:]')"

echo "========================================================"
echo " Coolie iOS 发布 (COS)"
echo " IPA:      $IPA"
echo " 远端:     $REMOTE"
echo " 直链:     $IPA_URL"
echo " size:     $SIZE bytes"
echo " sha256:   $SHA256"
echo " 模式:     $([ "$DRY" -eq 1 ] && echo 'dry-run' || echo '正式')$([ "$REGISTER" -eq 1 ] && echo ' +register')"
echo "========================================================"

# ── 3. 上传前校验 ────────────────────────────────────────────────────────
if [ "$VERIFY" -eq 1 ]; then
  step "[1/5] 上传前校验 (--verify)"
  info "file: $(file -b "$IPA")"
  # ipa 本质是 zip；顶层须含 Payload/。捕获后再判，避免管道 grep -q 触发 SIGPIPE
  # 让 unzip 退出 141 + pipefail 误判 (实测踩过)。
  IPA_LIST="$(unzip -l "$IPA" 2>/dev/null || true)"
  case "$IPA_LIST" in
    *Payload/*) info "Payload/ 存在 ✓" ;;
    *) die "ipa 内未找到 Payload/ —— 可能不是合法 .ipa" ;;
  esac
  # 签名信息 (未签名时明确说明)
  SIG="$(unzip -p "$IPA" 'Payload/*.app/_CodeSignature/CodeResources' 2>/dev/null | head -c 1 || true)"
  if [ -n "$SIG" ]; then
    info "含 _CodeSignature ✓ (已签名)"
  else
    info "无 _CodeSignature —— 未签名 (需爱思助手重签后才能装真机)"
  fi
  info "sha256: $SHA256"
fi

# ── 4. 直传 COS + 公有读 + 公网校验 ──────────────────────────────────────
step "[2/5] 直传 COS"
run coscli -c "$COSCLI_CONFIG" cp "$IPA" "$REMOTE"
run coscli -c "$COSCLI_CONFIG" object-acl --method put --acl public-read "$REMOTE"
info "直链: $IPA_URL"

if [ "$DRY" -eq 0 ]; then
  PROBE="$(mktemp)"
  CODE="$(curl -sS -r 0-15 -o "$PROBE" -w '%{http_code}' "$IPA_URL" || true)"
  if [ "$CODE" != "206" ] && [ "$CODE" != "200" ]; then
    die "公网校验失败 HTTP $CODE ← $IPA_URL (COS 默认域名禁止分发 ipa，需自定义域名 COS_PUBLIC_BASE)"
  fi
  [ "$(head -c 2 "$PROBE")" = "PK" ] || die "远端首字节非 zip 魔数 (PK)，拿到的是错误页: $IPA_URL"
  info "公网 GET $CODE + PK 魔数 ✓"
fi

# ── 5. manifest.plist + QR (ad-hoc 扫码直装) ──────────────────────────────
if [ "$REGISTER" -eq 1 ]; then
  step "[3/5] 生成 manifest.plist + 安装二维码"
  if [ "$DRY" -eq 1 ]; then
    info "[dry-run] 生成 manifest.plist → $MANIFEST_URL"
    info "[dry-run] 生成安装二维码 (itms-services) → $QR_URL"
    info "[dry-run] 安装深链: $INSTALL_URL"
  else
    mkdir -p "$EVIDENCE_DIR"
    STAGE="$(mktemp -d)"
    cat > "$STAGE/manifest.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>items</key>
  <array>
    <dict>
      <key>assets</key>
      <array>
        <dict>
          <key>kind</key><string>software-package</string>
          <key>url</key><string>$IPA_URL</string>
        </dict>
      </array>
      <key>metadata</key>
      <dict>
        <key>bundle-identifier</key><string>$APPLE_BUNDLE_ID</string>
        <key>bundle-version</key><string>$VERSION</string>
        <key>kind</key><string>software</string>
        <key>title</key><string>Coolie工坊</string>
      </dict>
    </dict>
  </array>
</dict>
</plist>
PLIST
    python3 - "$INSTALL_URL" "$STAGE/install-qr-ios.png" "$EVIDENCE_DIR/install-qr-ios.png" <<'PY'
import sys, qrcode
url, out, evidence = sys.argv[1], sys.argv[2], sys.argv[3]
qrcode.make(url).save(out)
qrcode.make(url).save(evidence)
print(f"   QR (itms-services) -> {evidence}")
PY
    run coscli -c "$COSCLI_CONFIG" cp "$STAGE/manifest.plist" "cos://$COS_BUCKET/$MANIFEST_KEY"
    run coscli -c "$COSCLI_CONFIG" cp "$STAGE/install-qr-ios.png" "cos://$COS_BUCKET/$QR_KEY"
    run coscli -c "$COSCLI_CONFIG" object-acl --method put --acl public-read "cos://$COS_BUCKET/$MANIFEST_KEY"
    run coscli -c "$COSCLI_CONFIG" object-acl --method put --acl public-read "cos://$COS_BUCKET/$QR_KEY"
    info "manifest: $MANIFEST_URL"
    info "安装深链: $INSTALL_URL"
  fi
fi

# ── 6. version.json 回填 (保留 android 字段) ──────────────────────────────
if [ "$REGISTER" -eq 1 ]; then
  step "[4/5] 回填 version.json (加 ios 字段) + 上线"
  if [ "$DRY" -eq 1 ]; then
    info "[dry-run] 拉取 $PUBLIC_ORIGIN/version.json → 合并 ios 字段 → scp $SSH_TARGET:$REMOTE_VERSION_JSON"
  else
    TMP_JSON="$(mktemp)"
    curl -sS -m 15 "$PUBLIC_ORIGIN/version.json" -o "$TMP_JSON" || die "拉取线上 version.json 失败"
    python3 - "$TMP_JSON" "$VERSION" "$IPA_URL" "$MANIFEST_URL" "$QR_URL" "$INSTALL_URL" "$SHA256" "$SIZE" <<'PY'
import json, sys
path, version, ipa, manifest, qr, install, sha, size = sys.argv[1:9]
with open(path, encoding="utf-8") as h:
    data = json.load(h)
data["ios"] = {
    "version": version,
    "downloadUrl": ipa,
    "manifestUrl": manifest,
    "qrUrl": qr,
    "installUrl": install,
    "sha256": sha,
    "sizeBytes": int(size),
}
with open(path, "w", encoding="utf-8") as h:
    json.dump(data, h, indent=2, ensure_ascii=False)
    h.write("\n")
print(json.dumps(data, ensure_ascii=False, indent=2))
PY
    scp "$TMP_JSON" "$SSH_TARGET:$REMOTE_VERSION_JSON"
    ssh "$SSH_TARGET" "chmod 644 '$REMOTE_VERSION_JSON'"
    cp "$TMP_JSON" "$REPO_ROOT/version.json"
    rm -f "$TMP_JSON"
    info "已推送 + 回写仓库 version.json"
  fi
fi

# ── 7. 4 项护栏 ──────────────────────────────────────────────────────────
if [ "$GUARDRAILS" -eq 1 ] || [ "$REGISTER" -eq 1 ]; then
  step "[5/5] 4 项护栏 (均须 200)"
  if [ "$DRY" -eq 1 ]; then
    info "[dry-run] 跳过护栏探测 (未真正上线)"
  else
  FAIL=0
  check() {
    local name="$1" url="$2" code
    code="$(curl -sS -o /dev/null -w '%{http_code}' -m 15 "$url" 2>/dev/null || echo ERR)"
    if [ "$code" = "200" ]; then info "$name 200 ✓  $url"; else info "$name $code ✗  $url"; FAIL=1; fi
  }
  check "version.json" "$PUBLIC_ORIGIN/version.json"
  check "ota/manifest" "$PUBLIC_ORIGIN/ota/manifest"
  check "ios/manifest" "$MANIFEST_URL"
  check "health"       "$PUBLIC_ORIGIN/api/health"
  [ "$FAIL" -eq 0 ] || die "护栏未全绿"
  fi
fi

printf '\n✅ iOS 发布完成\n'
printf '   IPA:      %s\n' "$IPA_URL"
printf '   sha256:   %s\n' "$SHA256"
printf '   manifest: %s\n' "$MANIFEST_URL"
printf '   安装:     %s\n' "$INSTALL_URL"
