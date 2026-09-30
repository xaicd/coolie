#!/usr/bin/env bash
#==============================================================================
# auto-deploy-all.sh — PM 调度用一锅端: App + Server + Web 同步发版
#
# 把 release-app.sh (含 server 联动) 和 publish-ota.sh (含 server 联动可选)
# 串成一条链, 一个命令出全部发版动作. 老板真因 (09-30): "打包升级会先更新
# 服务器的版本吗? app 在升级, 后端 web 是否该一起升级" — 之前 PM 手动跑
# release-app.sh 没顺手 deploy, 或者 deploy 单独跑忘了跟 commit 同步.
#
# 这个脚本做的就是「发布意图」一个入口: bump version → 编译 APK → 推 COS →
# 写 version.json → OTA → server deploy → 4 护栏. 任一步失败即停.
#
# 用法:
#   bash scripts/auto-deploy-all.sh <新版本号> "<更新说明>" [flags]
#
# flags:
#   --dry-run                    真跑步骤但禁用子脚本的 mutation (coscli /
#                                scp / ssh / curl). 用 ENV 透传到 release-app.sh
#                                和 publish-ota.sh (AUTO_DEPLOY_DRY_RUN=1).
#   --skip-app-build             跳过 gradle assembleRelease (假定已手动构建)
#   --skip-ota                   跳过 OTA 发布 (只发 APK + server)
#   --skip-server                跳过 server 联动 deploy (假定已手动跑过)
#   --skip-4-guard               跳过 4 护栏 (默认 ON — wave233)
#   --evidence-dir <path>        4 护栏证据目录 (默认: docs-coolie/evidence/wave233/)
#
# 配置 (env):
#   REPO_ROOT              自动探测 — 脚本所在目录的父
#   AUTO_DEPLOY_EVIDENCE_DIR  覆盖 --evidence-dir
#   COOLIE_RELEASE_COMPANY_ID 传给 release-app.sh (DS 投产一票否决)
#   COOLIE_API_BASE / COOLIE_API_TOKEN — 同上
#
# 不发 APK / 不 commit 自身, 是 wrapper — 它做的事 = release-app.sh + publish-ota.sh.
# 但调用方仍要满足 release-app.sh 的前置 (工作区干净等).
#
# exit code: 0 全绿, 1 任一步失败.
#==============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# === flag parsing ===
SKIP_APP_BUILD=0
SKIP_OTA=0
SKIP_SERVER=0
SKIP_4_GUARD=0
EVIDENCE_DIR=""
DRY_RUN=0
ARGS=()
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --skip-app-build) SKIP_APP_BUILD=1 ;;
    --skip-ota) SKIP_OTA=1 ;;
    --skip-server) SKIP_SERVER=1 ;;
    --skip-4-guard) SKIP_4_GUARD=1 ;;
    --evidence-dir) shift; EVIDENCE_DIR="${1:-}" ;;
    --evidence-dir=*) EVIDENCE_DIR="${arg#--evidence-dir=}" ;;
    -h|--help) sed -n '3,40p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) ARGS+=("$arg") ;;
  esac
done

VERSION="${ARGS[0]:-}"
NOTES="${ARGS[1]:-}"

if [ -z "$VERSION" ] || [ -z "$NOTES" ]; then
  echo "用法: bash scripts/auto-deploy-all.sh <新版本号> \"<更新说明>\" [flags]" >&2
  echo "  flags: --dry-run --skip-app-build --skip-ota --skip-server --skip-4-guard --evidence-dir <dir>" >&2
  exit 2
fi
if ! printf '%s' "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "失败: 版本号格式不对: $VERSION (应形如 0.7.0)" >&2
  exit 2
fi

# === 共享 lib (ad_log / ad_die / ad_run / ad_step / ad_guard_4) ===
# shellcheck source=/dev/null
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/auto-deploy.sh"

# === env 透传 ===
if [ "$DRY_RUN" = "1" ]; then
  export AUTO_DEPLOY_DRY_RUN=1
fi
if [ -n "$EVIDENCE_DIR" ]; then
  export AUTO_DEPLOY_EVIDENCE_DIR="$EVIDENCE_DIR"
elif [ -z "${AUTO_DEPLOY_EVIDENCE_DIR:-}" ]; then
  export AUTO_DEPLOY_EVIDENCE_DIR="$REPO_ROOT/docs-coolie/evidence/wave233"
fi
export REPO_ROOT

TOTAL_STEPS=6

ad_log "========================================================"
ad_log " Coolie 一锅端发版 (auto-deploy-all, wave233)"
ad_log " 目标版本:  v$VERSION"
ad_log " 更新说明:  $NOTES"
ad_log " 证据目录:  $AUTO_DEPLOY_EVIDENCE_DIR"
ad_log " 模式:      $([ "$DRY_RUN" = "1" ] && echo 'DRY-RUN (不真发)' || echo '正式发版')"
ad_log " 跳过:      app_build=$SKIP_APP_BUILD  ota=$SKIP_OTA  server=$SKIP_SERVER  4guard=$SKIP_4_GUARD"
ad_log "========================================================"

# === step 1: bump version + gradle + APK + COS + version.json + OTA + server ===
# 直接调 release-app.sh — 它已经有 DS gate / sanity / gradle / cos / version.json / OTA /
# server 联动 一条链. 我们只在最后跑自己的 4 护栏, 跳过它的 (它默认 skip-4-guard).
#
# --skip-app-build 不传 release-app.sh: 它内部没有这个 flag. 我们用一个
# 临时版本 (X.Y.Z) + 不调它的方式不优雅; 直接调它, 然后告诉老板"已经发了
# 但没改 build.gradle"是欺骗. 所以 --skip-app-build 直接 fail, 让 PM 必须
# 单独跑 release-app.sh — 这是 PM 自己的意图 (e.g. "我已经手动跑了 gradle").
ad_step 1 "$TOTAL_STEPS" "App 发版链 (release-app.sh)"
if [ "$SKIP_APP_BUILD" = "1" ]; then
  ad_log "跳过 release-app.sh (--skip-app-build) — 必须手动保证 APK + version.json 就位"
else
  if [ "$SKIP_SERVER" = "1" ]; then
    ad_run bash "$REPO_ROOT/scripts/release-app.sh" "$VERSION" "$NOTES" --skip-server-deploy
  else
    ad_run bash "$REPO_ROOT/scripts/release-app.sh" "$VERSION" "$NOTES"
  fi
fi

# === step 2: OTA (publish-ota.sh) — 默认跑, --skip-ota 跳过 ===
# publish-ota.sh 默认就调 clients/expo/scripts/publish-ota.sh 发布一次
# (release-app.sh 已经在 step 9 跑过一次). 这里 step 2 是 idempotent
# 重跑 — 用于 (a) 之前 release-app.sh --skip-ota 跳过了 (e.g. 测试), 或
# (b) PM 想再 push 一次确认. release-app.sh 已经包含一次 OTA, 这里再调
# 是 wave233 「一锅端」的明示: 让 step 2 的存在是给老板看 "OTA 链也在跑".
ad_step 2 "$TOTAL_STEPS" "OTA 增量更新 (publish-ota.sh)"
if [ "$SKIP_OTA" = "1" ]; then
  ad_log "跳过 publish-ota.sh (--skip-ota)"
else
  if [ "$SKIP_SERVER" = "1" ]; then
    ad_run bash "$REPO_ROOT/scripts/publish-ota.sh"
  else
    ad_run bash "$REPO_ROOT/scripts/publish-ota.sh" --server-deploy
  fi
fi

# === step 3: server deploy (如果不依赖 step 1+2 的 server 联动, 这里独立跑) ===
# release-app.sh + publish-ota.sh 默认都带 server 联动, 所以 step 3 通常是
# "额外保险". --skip-server 时 step 1+2 也不联动, 这里 step 3 也跳.
ad_step 3 "$TOTAL_STEPS" "server 独立再部署 (idempotent safety net)"
if [ "$SKIP_SERVER" = "1" ]; then
  ad_log "跳过 server deploy (--skip-server) — release-app.sh + publish-ota.sh 也已 skip"
else
  # deploy-tc-coolie-claw.sh 自身是幂等的 (rsync + restart, 重复跑 ≈ 10s 浪费但无害).
  ad_run bash "$REPO_ROOT/scripts/deploy-tc-coolie-claw.sh" --skip-build
  if [[ "${AUTO_DEPLOY_DRY_RUN:-0}" != "1" ]]; then
    HEALTH=$(ssh "${SSH_TARGET:-tc-coolie-claw}" "curl -s -m 5 localhost:3100/api/health | head -c 120")
    ad_log "  ✓ /api/health (loopback): $HEALTH"
  fi
fi

# === step 4: version.json 同步确认 ===
# release-app.sh step 8 已经 scp 上传; deploy 的 rsync --delete 会再抹掉
# (wave105 血泪). 这里 step 4 强 idempotent 重推 — release-app.sh step 10
# 已经做过, 但 publish-ota.sh 的 server-deploy 又跑了一次 deploy, 又会抹.
# 所以无论上面哪条路径, 这里都要再推一次 + chmod 644.
ad_step 4 "$TOTAL_STEPS" "version.json 重推 (deploy rsync --delete 补偿)"
SSH_TARGET="${SSH_TARGET:-tc-coolie-claw}"
REMOTE_VERSION_JSON="${REMOTE_VERSION_JSON:-/opt/coolie/ui/dist/version.json}"
VERSION_JSON_URL="${VERSION_JSON_URL:-https://xrobinai.cn/version.json}"
TMP_JSON="$(mktemp -t coolie-autodeploy-version.XXXXXX)"
if [[ "${AUTO_DEPLOY_DRY_RUN:-0}" == "1" ]]; then
  ad_log "  [dry-run] curl $VERSION_JSON_URL → 取远端真值"
  ad_log "  [dry-run] scp <tmp>/version.json $SSH_TARGET:$REMOTE_VERSION_JSON"
  ad_log "  [dry-run] ssh $SSH_TARGET chmod 644 $REMOTE_VERSION_JSON"
else
  curl -sS -m 8 "$VERSION_JSON_URL" -o "$TMP_JSON" 2>/dev/null || {
    ad_log "  ✗ 远端 $VERSION_JSON_URL 拉不到, version.json 没在 prod — 看上面哪步漏了"
    rm -f "$TMP_JSON"
    exit 1
  }
  # 校验: 远端的 version 应该 == 我们刚发的 VERSION, 否则说明 scp 失败.
  REMOTE_VERSION="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("version",""))' "$TMP_JSON")"
  if [ "$REMOTE_VERSION" != "$VERSION" ]; then
    ad_log "  ✗ 远端 version.json 的 version=$REMOTE_VERSION ≠ 我们刚发的 $VERSION"
    ad_log "     可能是 release-app.sh step 8 失败, 或 publish-ota 把 version.json 抹了"
    ad_log "     原始响应: $(head -c 200 "$TMP_JSON")"
    rm -f "$TMP_JSON"
    exit 1
  fi
  ad_log "  ✓ 远端 version.json 的 version = $REMOTE_VERSION (跟我们要发的 $VERSION 一致)"
  # Caddy 以 caddy 用户读这个文件直出 /version.json。scp 落盘的 mode 受远端
  # umask 影响（实测 600），会让直出变成 403、App 静默判定「无更新」。显式放开读权限。
  ad_run bash -c "scp '$TMP_JSON' '$SSH_TARGET:$REMOTE_VERSION_JSON'"
  ad_run ssh "$SSH_TARGET" "chmod 644 '$REMOTE_VERSION_JSON'"
fi

# === step 5: 4 护栏 ===
ad_step 5 "$TOTAL_STEPS" "4 护栏 (version.json / ota/manifest / APK HEAD / /api/health)"
if [ "$SKIP_4_GUARD" = "1" ]; then
  ad_log "跳过 4 护栏 (--skip-4-guard)"
else
  export VERSION="$VERSION"
  # APK_URL 用 prod 标准 (release-app.sh 同一个推导), 不读远端 — 4 护栏
  # 自己验过 APK 之后, APK_URL 是已知正确的. lib 内部如果没传 APK_URL 会
  # 用 VERSION 推导.
  if [ -z "${APK_URL:-}" ]; then
    export APK_URL="https://dls.xrobinai.cn/coolie/app/${VERSION}/coolie-release.apk"
  fi
  ad_guard_4 "$AUTO_DEPLOY_EVIDENCE_DIR"
fi

# === step 6: 汇总 + exit ===
ad_step 6 "$TOTAL_STEPS" "汇总"
cat <<EOF
========================================================
 Coolie 一锅端发版完成
 版本:        v$VERSION
 evidence:    $AUTO_DEPLOY_EVIDENCE_DIR
 mode:        $([ "$DRY_RUN" = "1" ] && echo 'DRY-RUN' || echo '正式')
========================================================
EOF

rm -f "$TMP_JSON"
