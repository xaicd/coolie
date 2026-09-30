#!/usr/bin/env bash
#==============================================================================
# scripts/lib/auto-deploy.sh — wave233 shared helpers for the auto-deploy chain
#
# Source-only (`. "$(dirname "$0")/lib/auto-deploy.sh"`); not executable on its
# own. Provides:
#
#   ad_log <msg>                       – print a [auto-deploy] prefixed line
#   ad_die <msg>                       – print + exit 1
#   ad_run <cmd...>                    – exec a command, or print in dry-run
#   ad_step <n/total> <label>          – print a "=== [n/total] label ===" header
#   ad_guard_4 [evidence_dir]          – run the 4 guardrails (version.json,
#                                        ota/manifest, APK HEAD, /api/health)
#                                        and write per-guard evidence files
#                                        into <evidence_dir> (default: cwd).
#                                        Returns 0 only when all 4 are green.
#
# Why a lib and not inlined: release-app.sh, publish-ota.sh and the new
# auto-deploy-all.sh all need the same 4-guard chain at different points
# (post-version.json / post-OTA / post-server-deploy), and duplicating the
# curl + jq + http_code parsing across three scripts lets any one of them
# drift out of sync with the others — wave218 already burned a wave on
# "version.json Caddy mode 600". One source of truth, one place to fix.
#
# Wave: 233 (boss 09-30 "打包升级会先更新服务器的版本吗" — App 0.6.8 发版后
# server 还跑老代码, 之前的 release-app.sh 只在 step 10 顺手 deploy, 没有
# 一个明确的发布后四联验收). PM 不撞 server, 但脚本要留好入口给老板手动跑.
#==============================================================================
set -euo pipefail

# Defaults are anchored on the production deployment (wave105 之后全栈固定):
#   APK 直链        : COS 对象 (腾讯云 dls.xrobinai.cn)
#   version.json    : tc-coolie-claw /opt/coolie/ui/dist/version.json → Caddy 直出
#   ota/manifest    : tc-coolie-claw /opt/coolie/ui/ota/manifest → Caddy 直出
#   api/health      : tc-coolie-claw systemd coolie → 3100
# These defaults match scripts/deploy-tc-coolie-claw.sh, scripts/release-app.sh,
# and scripts/publish-ota.sh; overriding via env is for tests, not prod.
ad_log() {
  printf '[auto-deploy] %s\n' "$*" >&2
}

ad_die() {
  printf '[auto-deploy] 失败: %s\n' "$*" >&2
  exit 1
}

# Run a command, or just print it under --dry-run. Used by the orchestrator
# scripts so the same path can be exercised end-to-end without touching prod.
# `ad_run` is intentionally unquoted args — same shape as `run` in
# release-app.sh, so callers can pass pipes / redirects without quoting hell.
ad_run() {
  if [[ "${AUTO_DEPLOY_DRY_RUN:-0}" == "1" ]]; then
    printf '   [dry-run] %s\n' "$*"
  else
    "$@"
  fi
}

ad_step() {
  local n="${1:-?}"
  local total="${2:-?}"
  local label="${3:-}"
  printf '\n=== [%s/%s] %s ===\n' "$n" "$total" "$label"
}

#==============================================================================
# ad_guard_4 — the four post-deploy smoke checks
#
# 1. version.json    : 200 + JSON.parse OK + has "version" key
# 2. ota/manifest    : 200 + JSON.parse OK + has "runtimeVersion" key
# 3. APK HEAD 直链    : 200 (or 206) — confirms COS APK 真存在, version.json
#                       不会指向 404
# 4. api/health      : 200 + status==ok
#
# Each guard writes its evidence to <evidence_dir>/<guard>.{json,txt}, so
# QA-REPORT.md can cite concrete files instead of pasting curl output. The
# function returns 0 only when all 4 are green; on first failure it prints
# which guard failed and exits non-zero (set -e in caller handles the rest).
#
# Args:
#   $1 (optional)  evidence_dir  – where to write the 4 evidence files
#                                  (default: $AUTO_DEPLOY_EVIDENCE_DIR or
#                                  ./docs-coolie/evidence/wave<current>/)
# Env:
#   APK_URL                  – APK 直链 (default: https://dls.xrobinai.cn/coolie/app/<VERSION>/coolie-release.apk)
#   VERSION_JSON_URL         – version.json URL (default: https://xrobinai.cn/version.json)
#   OTA_MANIFEST_URL         – OTA manifest URL (default: https://xrobinai.cn/ota/manifest)
#   HEALTH_URL               – /api/health URL (default: https://xrobinai.cn/api/health)
#   VERSION                  – version string, used to default APK_URL when not set
#   AUTO_DEPLOY_DRY_RUN      – 1 means print checks, skip real curl
#==============================================================================
ad_guard_4() {
  local evidence_dir="${1:-${AUTO_DEPLOY_EVIDENCE_DIR:-}}"
  local apk_url="${APK_URL:-}"
  local version_json_url="${VERSION_JSON_URL:-https://xrobinai.cn/version.json}"
  local ota_manifest_url="${OTA_MANIFEST_URL:-https://xrobinai.cn/ota/manifest}"
  local health_url="${HEALTH_URL:-https://xrobinai.cn/api/health}"

  # APK URL default: build from VERSION (mirrors release-app.sh §6/§7 pairing).
  if [ -z "$apk_url" ] && [ -n "${VERSION:-}" ]; then
    apk_url="https://dls.xrobinai.cn/coolie/app/${VERSION}/coolie-release.apk"
  fi
  if [ -z "$apk_url" ]; then
    ad_die "APK_URL unset and no VERSION — cannot run APK guard"
  fi

  # Default evidence dir: scripts/auto-deploy-all.sh normally pre-sets this via
  # AUTO_DEPLOY_EVIDENCE_DIR; when called interactively from a release flow, fall
  # back to a cwd-relative docs-coolie/evidence dir so QA can still cite files.
  if [ -z "$evidence_dir" ]; then
    evidence_dir="${REPO_ROOT:-.}/docs-coolie/evidence/wave233"
  fi
  if [[ "${AUTO_DEPLOY_DRY_RUN:-0}" != "1" ]]; then
    mkdir -p "$evidence_dir"
  fi

  local guard_failed=0
  local guard_results=()

  # ── 护栏 1: version.json ─────────────────────────────────────────────
  # 期望 HTTP 200 + body 是 JSON + 顶层有 "version" 键。
  # Caddy 600 mode bug 见 release-app.sh §8 — 必须在 server deploy 后再确认。
  if [[ "${AUTO_DEPLOY_DRY_RUN:-0}" == "1" ]]; then
    printf '   [dry-run] GET %s → expect 200 + JSON { version: %s }\n' "$version_json_url" "${VERSION:-<unset>}"
    guard_results+=("PASS  version.json     $version_json_url")
  else
    local vjson_code vjson_body vjson_file="$evidence_dir/version.json"
    vjson_code="$(curl -sS -m 8 -o "$vjson_file" -w '%{http_code}' "$version_json_url" || echo '000')"
    if [ "$vjson_code" = "200" ] && python3 -c '
import json, sys
try:
    with open(sys.argv[1], encoding="utf-8") as handle:
        data = json.load(handle)
    sys.exit(0 if isinstance(data, dict) and data.get("version") else 2)
except Exception as exc:
    print(f"   parse error: {exc}", file=sys.stderr)
    sys.exit(3)
' "$vjson_file"; then
      guard_results+=("PASS  version.json     $version_json_url")
    else
      ad_log "护栏 1 失败: version.json HTTP=$vjson_code (期望 200 + JSON with version key)"
      ad_log "  证据: $vjson_file"
      guard_failed=1
      guard_results+=("FAIL  version.json     HTTP=$vjson_code")
    fi
  fi

  # ── 护栏 2: ota/manifest ──────────────────────────────────────────────
  # 期望 HTTP 200 + JSON + 顶层有 "runtimeVersion"。
  # per-IP manifest: 本机测 ≠ 真机所见 (sre-release-and-deploy §C), 所以这里
  # 只验证存在, 不强校验 runtimeVersion 数值。
  if [[ "${AUTO_DEPLOY_DRY_RUN:-0}" == "1" ]]; then
    printf '   [dry-run] GET %s → expect 200 + JSON { runtimeVersion: ... }\n' "$ota_manifest_url"
    guard_results+=("PASS  ota/manifest     $ota_manifest_url")
  else
    local ota_code ota_file="$evidence_dir/ota-manifest.json"
    ota_code="$(curl -sS -m 8 -o "$ota_file" -w '%{http_code}' "$ota_manifest_url" || echo '000')"
    if [ "$ota_code" = "200" ] && python3 -c '
import json, sys
try:
    with open(sys.argv[1], encoding="utf-8") as handle:
        data = json.load(handle)
    sys.exit(0 if isinstance(data, dict) and data.get("runtimeVersion") else 2)
except Exception as exc:
    print(f"   parse error: {exc}", file=sys.stderr)
    sys.exit(3)
' "$ota_file"; then
      guard_results+=("PASS  ota/manifest     $ota_manifest_url")
    else
      ad_log "护栏 2 失败: ota/manifest HTTP=$ota_code (期望 200 + JSON with runtimeVersion key)"
      ad_log "  证据: $ota_file"
      guard_failed=1
      guard_results+=("FAIL  ota/manifest     HTTP=$ota_code")
    fi
  fi

  # ── 护栏 3: APK HEAD 直链 ─────────────────────────────────────────────
  # 期望 200 或 206 (Caddy + COS 都可能回 206 if Range). 404 / 403 视为失败.
  if [[ "${AUTO_DEPLOY_DRY_RUN:-0}" == "1" ]]; then
    printf '   [dry-run] HEAD %s → expect 200 or 206\n' "$apk_url"
    guard_results+=("PASS  apk-head         $apk_url")
  else
    local apk_code apk_hdr_file="$evidence_dir/apk-headers.txt"
    apk_code="$(curl -sS -m 8 -I -D "$apk_hdr_file" -o /dev/null -w '%{http_code}' "$apk_url" || echo '000')"
    if [ "$apk_code" = "200" ] || [ "$apk_code" = "206" ]; then
      guard_results+=("PASS  apk-head         $apk_url  ($apk_code)")
    else
      ad_log "护栏 3 失败: APK HEAD HTTP=$apk_code (期望 200/206) — COS 对象可能没上传成功"
      ad_log "  证据: $apk_hdr_file"
      guard_failed=1
      guard_results+=("FAIL  apk-head         HTTP=$apk_code")
    fi
  fi

  # ── 护栏 4: api/health ────────────────────────────────────────────────
  # 期望 HTTP 200 + status==ok. systemd coolie 启动后 ~6s 内会 listen (deploy
  # 脚本 §6 等 6s), 但偶尔慢; 用 5s timeout 太短, 这里给 8s.
  if [[ "${AUTO_DEPLOY_DRY_RUN:-0}" == "1" ]]; then
    printf '   [dry-run] GET %s → expect 200 + status==ok\n' "$health_url"
    guard_results+=("PASS  api/health       $health_url")
  else
    local h_code h_body h_file="$evidence_dir/api-health.json"
    h_code="$(curl -sS -m 8 -o "$h_file" -w '%{http_code}' "$health_url" || echo '000')"
    if [ "$h_code" = "200" ] && python3 -c '
import json, sys
try:
    with open(sys.argv[1], encoding="utf-8") as handle:
        data = json.load(handle)
    sys.exit(0 if isinstance(data, dict) and data.get("status") == "ok" else 2)
except Exception as exc:
    print(f"   parse error: {exc}", file=sys.stderr)
    sys.exit(3)
' "$h_file"; then
      guard_results+=("PASS  api/health       $health_url")
    else
      ad_log "护栏 4 失败: /api/health HTTP=$h_code (期望 200 + status==ok) — server 没起来或路由没挂上"
      ad_log "  证据: $h_file"
      guard_failed=1
      guard_results+=("FAIL  api/health       HTTP=$h_code")
    fi
  fi

  # 打印汇总. dry-run 下不再做 OK 标记 — dry-run 本身不算"全绿", 它是排练.
  echo
  echo "─── 4 护栏汇总 ─────────────────────────────────"
  for line in "${guard_results[@]}"; do
    echo "  $line"
  done
  echo "─────────────────────────────────────────────────"

  if [ "$guard_failed" -ne 0 ]; then
    ad_die "4 护栏未全绿 — 拒绝确认发版成功. 见上方 FAIL 行 + 证据目录 $evidence_dir"
  fi

  return 0
}
