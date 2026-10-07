#!/usr/bin/env bash
# scripts/tool-health-monitor.sh [--check | --print | --json | --register | --unregister]
#
# wave281 / 2026-10-02-tool-health-monitor spec
#
# 2-hour tool health monitor for Hermes local construction tools.
# Probes tool liveliness and writes `.coolie-local/tool-health/latest.json`.

set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/bin:$PATH"

_resolved="$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || node -e 'console.log(require("fs").realpathSync(process.argv[1]))' "${BASH_SOURCE[0]}")"
REPO_ROOT="$(cd "$(dirname "$_resolved")/.." && pwd)"
STATE_DIR="${COOLIE_LOCAL_DIR:-$REPO_ROOT/.coolie-local}/tool-health"
[[ -d "$STATE_DIR" || ! -d "$REPO_ROOT/.paperclip-local/tool-health" ]] || STATE_DIR="$REPO_ROOT/.paperclip-local/tool-health"
LATEST_JSON="$STATE_DIR/latest.json"
CRON_TAG="wave281-tool-health-monitor"

MODE="print"

usage() {
  cat <<'EOF'
usage: scripts/tool-health-monitor.sh [--print | --check | --json | --register | --unregister]

2026-10-02 tool health monitor (2-hour interval).

Options:
  --print         print concise 3-line status for WeChat/terminal (default)
  --check         run live probes and update latest.json
  --force         force real live probe ignoring 15-minute TTL cache
  --json          output latest health JSON
  --register      register crontab (every 2 hours: 0 */2 * * *)
  --unregister    unregister crontab
  --help          show this help
EOF
}

FORCE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --print) MODE="print"; shift ;;
    --check) MODE="check"; shift ;;
    --force) FORCE=1; shift ;;
    --json) MODE="json"; shift ;;
    --register) MODE="register"; shift ;;
    --unregister) MODE="unregister"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'unknown arg: %s\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
done

mkdir -p "$STATE_DIR"

if [[ "$MODE" == "register" ]]; then
  cmd="0 */2 * * * bash $REPO_ROOT/scripts/tool-health-monitor.sh --check >/dev/null 2>&1 # $CRON_TAG"
  existing="$(crontab -l 2>/dev/null || true)"
  if printf '%s\n' "$existing" | grep -q "$CRON_TAG"; then
    printf 'cron already registered for %s\n' "$CRON_TAG"
  else
    printf '%s\n%s\n' "$existing" "$cmd" | grep -v '^$' | crontab -
    printf 'registered 2-hour cron for tool health monitor.\n'
  fi
  exit 0
fi

if [[ "$MODE" == "unregister" ]]; then
  existing="$(crontab -l 2>/dev/null || true)"
  if printf '%s\n' "$existing" | grep -q "$CRON_TAG"; then
    printf '%s\n' "$existing" | grep -v "$CRON_TAG" | crontab -
    printf 'unregistered %s\n' "$CRON_TAG"
  else
    printf 'no cron entry found for %s\n' "$CRON_TAG"
  fi
  exit 0
fi

# Real probe helper
# wave358: agy 健康度判定升级 — 同时检查 (1) 容器可达 (2) OAuth 凭据状态
# (3) 真跑运行时错误. 凭据过期 → cooldown, 容器不可达 → fail. 不再"binary
# 在 PATH 即 OK" 假阳性.
# 输出 4 字段 (TAB 分隔): status<TAB>latency_ms<TAB>reason<TAB>expires_at_iso
probe_agy() {
  local start_ms end_ms latency
  local token_state token_remaining token_expiry token_source
  local probe_state probe_latency probe_snippet probe_err

  start_ms="$(node -e 'console.log(Date.now())')"

  # 0. 阶段 1: 凭据状态 (基于 OAuth token 文件的 expiry 字段)
  local lib_token="$REPO_ROOT/scripts/lib/agy-token-state.sh"
  if [[ -f "$lib_token" ]]; then
    # shellcheck source=scripts/lib/agy-token-state.sh
    source "$lib_token"
    local token_line
    token_line="$(agy_token_status 2 2>/dev/null || true)"
    if [[ -n "$token_line" ]]; then
      IFS=$'\t' read -r token_state token_remaining token_expiry token_source <<<"$token_line"
    fi
  fi

  # 1. 阶段 2: 容器 / binary 可达性 + 真跑探测 (捕获 401 / Session expired / Unauthorized)
  local reachable=0 runtime_output=""
  if command -v agy >/dev/null 2>&1; then
    runtime_output="$(set +o pipefail; set +e; agy --print 'ping' 2>&1; echo "exit=$?")" || true
    set -o pipefail
    set -e
    reachable=1
  elif command -v docker >/dev/null 2>&1 && docker inspect agy-ubuntu-container >/dev/null 2>&1; then
    if command -v timeout >/dev/null 2>&1; then
      runtime_output="$(set +o pipefail; set +e; timeout 10 docker exec agy-ubuntu-container /root/.local/bin/agy --print 'ping' 2>&1; echo "exit=$?")" || true
    else
      runtime_output="$(set +o pipefail; set +e; perl -e 'alarm shift; exec @ARGV' 10 docker exec agy-ubuntu-container /root/.local/bin/agy --print 'ping' 2>&1; echo "exit=$?")" || true
    fi
    set -o pipefail
    set -e
    reachable=1
  elif [[ -x "$REPO_ROOT/scripts/host-exec.sh" ]]; then
    if "$REPO_ROOT/scripts/host-exec.sh" "docker exec agy-ubuntu-container /root/.local/bin/agy --print 'ping' >/dev/null 2>&1" 2>/dev/null; then
      runtime_output="$("$REPO_ROOT/scripts/host-exec.sh" "docker exec agy-ubuntu-container /root/.local/bin/agy --print 'ping' 2>&1")" || true
      reachable=1
    fi
  fi

  end_ms="$(node -e 'console.log(Date.now())')"
  latency=$((end_ms - start_ms))

  # 2. 阶段 3: 综合判定
  if [[ "$reachable" -eq 0 ]]; then
    printf 'fail\t%d\tagy 容器或 binary 不可达 (token=%s)\t%s' "$latency" "${token_state:-n/a}" "${token_expiry:-—}"
    return 0
  fi

  # 2a. 凭据过期优先 (老板硬规矩: 401/Session expired 立即冷却, 派单自动降级)
  if [[ "$token_state" == "expired" ]]; then
    local snippet="${runtime_output%exit=*}"
    snippet="$(printf '%s' "$snippet" | tr '\n' ' ' | cut -c1-60)"
    [[ -z "$snippet" ]] && snippet="OAuth token 已过期"
    printf 'cooldown\t%d\tOAuth 过期 (剩余 %s 分钟, expiry=%s) → 派单将自动降级\t%s' \
      "$latency" "$token_remaining" "$token_expiry" "$token_expiry"
    return 0
  fi

  # 2b. 凭据即将过期 (预警, 仍可派但 PM 知晓)
  if [[ "$token_state" == "expiring" ]]; then
    local snippet="${runtime_output%exit=*}"
    snippet="$(printf '%s' "$snippet" | tr '\n' ' ' | cut -c1-60)"
    [[ -z "$snippet" ]] && snippet="OAuth 即将过期"
    printf 'warn\t%d\tOAuth 即将过期 (剩余 %s 分钟, expiry=%s) — 趁早续期\t%s' \
      "$latency" "$token_remaining" "$token_expiry" "$token_expiry"
    return 0
  fi

  # 2c. 凭据正常, 检查真跑是否返回 401 / Session expired
  if [[ -n "$runtime_output" ]]; then
    local err_class
    err_class="$(agy_extract_oauth_error "${runtime_output%exit=*}")"
    case "$err_class" in
      expired|unauthorized)
        printf 'cooldown\t%d\t真跑返回 %s (token=%s, expiry=%s) → 派单将自动降级\t%s' \
          "$latency" "$err_class" "${token_state:-n/a}" "$token_expiry" "$token_expiry"
        return 0
        ;;
    esac
  fi

  # 2d. 一切正常 (生产环境 agy binary 直接可达, 不走 docker)
  if command -v agy >/dev/null 2>&1 && [[ "${AGY_DOCKER_CONTAINER:-agy-ubuntu-container}" == "agy-ubuntu-container" ]] && ! command -v docker >/dev/null 2>&1; then
    printf 'ok\t%d\tlocal-cli: agy binary (无 docker 容器, token=%s)\t%s' "$latency" "${token_state:-n/a}" "${token_expiry:-—}"
  elif [[ "${token_source:-}" == docker:* ]]; then
    printf 'ok\t%d\tdocker: agy-ubuntu-container (token=%s, 剩余 %sm)\t%s' \
      "$latency" "${token_state:-ok}" "$token_remaining" "$token_expiry"
  else
    printf 'ok\t%d\t%s (token=%s, 剩余 %sm)\t%s' \
      "$latency" "local: agy" "${token_state:-ok}" "$token_remaining" "${token_expiry:-—}"
  fi
}

probe_tool() {
  local bin="$1"
  local test_cmd="$2"
  local start_ms end_ms latency output code=0

  start_ms="$(node -e 'console.log(Date.now())')"
  if command -v "$bin" >/dev/null 2>&1; then
    if output="$(eval "$bin $test_cmd" 2>&1)"; then
      end_ms="$(node -e 'console.log(Date.now())')"
      latency=$((end_ms - start_ms))
      first_line="$(printf '%s' "$output" | head -n 1 | cut -c1-40)"
      printf 'ok\t%d\tlocal: %s' "$latency" "$first_line"
    else
      printf 'fail\t999\tlocal execution failed'
    fi
  elif [[ -x "$REPO_ROOT/scripts/host-exec.sh" ]]; then
    if output="$("$REPO_ROOT/scripts/host-exec.sh" "$bin $test_cmd" 2>&1)"; then
      end_ms="$(node -e 'console.log(Date.now())')"
      latency=$((end_ms - start_ms))
      first_line="$(printf '%s' "$output" | head -n 1 | cut -c1-40)"
      printf 'ok\t%d\thost: %s' "$latency" "$first_line"
    else
      printf 'fail\t999\thost bridge probe failed'
    fi
  else
    printf 'fail\t999\tnot found on local or host'
  fi
}

# Run check / probes
run_check() {
  local force="${1:-0}"
  local now_iso
  now_iso="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

  # Check 15-minute cache unless force is specified
  if [[ "$force" -eq 0 && -f "$LATEST_JSON" ]]; then
    local cache_valid
    cache_valid="$(node -e '
const fs = require("fs");
try {
  const data = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const checkedAt = new Date(data.checkedAt).getTime();
  const now = Date.now();
  // Valid if checked within 15 minutes (900000 ms)
  console.log(now - checkedAt < 900000 ? "1" : "0");
} catch (e) {
  console.log("0");
}
' "$LATEST_JSON")"
    if [[ "$cache_valid" == "1" ]]; then
      return 0
    fi
  fi

  # 1. Source smart env-detector
  local lib_env="$REPO_ROOT/scripts/lib/env-detector.sh"
  if [[ -f "$lib_env" ]]; then
    # shellcheck source=scripts/lib/env-detector.sh
    source "$lib_env"
  fi

  # 0. Source agy-token-state (wave358: 凭据状态 + 真跑错误双探测)
  local lib_token="$REPO_ROOT/scripts/lib/agy-token-state.sh"
  if [[ -f "$lib_token" ]]; then
    # shellcheck source=scripts/lib/agy-token-state.sh
    source "$lib_token"
  fi

  # 1. agy probe (wave358: 替换 smart_probe_artisan_tool agy-gemini3.8,
  #    新探针内置凭据状态 + 真跑错误捕获, 输出可能含 cooldown / warn / ok / fail)
  IFS=$'\t' read -r agy_status agy_latency agy_reason agy_expires_at agy_token_state <<< "$(probe_agy 2>&1 || true)"

  # 2. claude-glm probe
  IFS=$'\t' read -r glm_status glm_latency glm_reason <<< "$(smart_probe_claude glm)"

  # 3. claude-mm probe
  IFS=$'\t' read -r mm_status mm_latency mm_reason <<< "$(smart_probe_claude mm)"

  # 4. cmd probe
  IFS=$'\t' read -r cmd_status cmd_latency cmd_reason <<< "$(smart_probe_artisan_tool cmd)"

  # 5. copilot probe
  IFS=$'\t' read -r copilot_status copilot_latency copilot_reason <<< "$(smart_probe_artisan_tool copilot)"

  # 6. hermes probe
  IFS=$'\t' read -r hermes_status hermes_latency hermes_reason <<< "$(smart_probe_hermes)"

  # 7. kiro-cli probe
  IFS=$'\t' read -r kiro_status kiro_latency kiro_reason <<< "$(smart_probe_artisan_tool kiro-cli)"

  # 取 expiry 字段 (来自 agy-token-state 的 token_expiry)
  if [[ "${agy_token_state:-}" == "ok" || "${agy_token_state:-}" == "expiring" ]]; then
    agy_expires_at="$(agy_token_status 2 2>/dev/null | awk -F'\t' '{print $3}' || true)"
  fi

  node -e '
const fs = require("fs");
const argv = process.argv;
const now = argv[1];

const data = {
  schemaVersion: 1,
  checkedAt: now,
  tools: {
    "agy-gemini3.8": {
      status: argv[2],
      bestFor: ["原型", "选型", "架构研判", "中文长篇分析"],
      recommendedEmployees: ["墨斗"],
      quota: null,
      resetAt: null,
      expiresAt: argv[24] && argv[24] !== "-" ? argv[24] : null,
      latencyMs: Number(argv[3]) || null,
      reason: argv[4] || null
    },
    "claude-glm": {
      status: argv[5],
      bestFor: ["代码", "契约", "架构落地"],
      recommendedEmployees: ["铁匠", "百晓生"],
      quota: "良好",
      resetAt: null,
      expiresAt: null,
      latencyMs: Number(argv[6]) || null,
      reason: argv[7] || null
    },
    "claude-mm": {
      status: argv[8],
      bestFor: ["代码", "长文本", "备用"],
      recommendedEmployees: ["铁匠", "百晓生"],
      quota: "良好",
      resetAt: null,
      expiresAt: null,
      latencyMs: Number(argv[9]) || null,
      reason: argv[10] || null
    },
    "cmd": {
      status: argv[11],
      bestFor: ["命令", "E2E", "单测", "自动化"],
      recommendedEmployees: ["门神", "铁匠贰号"],
      quota: null,
      resetAt: null,
      expiresAt: null,
      latencyMs: Number(argv[12]) || null,
      reason: argv[13] || null
    },
    "copilot": {
      status: argv[14],
      bestFor: ["发布", "OTA", "SRE", "监控"],
      recommendedEmployees: ["兑底渊"],
      quota: "可用",
      resetAt: null,
      expiresAt: null,
      latencyMs: Number(argv[15]) || null,
      reason: argv[16] || null
    },
    "Hermes": {
      status: argv[17],
      bestFor: ["PM", "派工", "验收", "统筹"],
      recommendedEmployees: ["Hermes"],
      quota: null,
      resetAt: null,
      expiresAt: null,
      latencyMs: Number(argv[18]) || null,
      reason: argv[19] || null
    },
    "kiro-cli": {
      status: argv[20],
      bestFor: ["架构设计", "Spec驱动", "重构"],
      recommendedEmployees: ["Hermes", "墨斗"],
      quota: null,
      resetAt: null,
      expiresAt: null,
      latencyMs: Number(argv[21]) || null,
      reason: argv[22] || null
    }
  }
};

fs.writeFileSync(argv[23], JSON.stringify(data, null, 2), "utf8");
' \
    "$now_iso" \
    "$agy_status" "$agy_latency" "$agy_reason" \
    "$glm_status" "$glm_latency" "$glm_reason" \
    "$mm_status" "$mm_latency" "$mm_reason" \
    "$cmd_status" "$cmd_latency" "$cmd_reason" \
    "$copilot_status" "$copilot_latency" "$copilot_reason" \
    "$hermes_status" "$hermes_latency" "$hermes_reason" \
    "$kiro_status" "$kiro_latency" "$kiro_reason" \
    "$LATEST_JSON" \
    "${agy_expires_at:-}"
}

if [[ "$MODE" == "check" || ! -f "$LATEST_JSON" ]]; then
  run_check "$FORCE"
  if [[ "$MODE" == "check" ]]; then
    printf 'updated %s\n' "$LATEST_JSON"
    exit 0
  fi
fi

if [[ "$MODE" == "json" ]]; then
  cat "$LATEST_JSON"
  exit 0
fi

# Print 3-line concise report per Spec
node -e '
const fs = require("fs");
const file = process.argv[1];
if (!fs.existsSync(file)) {
  console.log("【工具健康】\n数据未初始化，请先执行 --check");
  process.exit(0);
}
const data = JSON.parse(fs.readFileSync(file, "utf8"));
const time = new Date(data.checkedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });

const okList = [];
const standbyList = [];
const warnList = [];
const cooldownList = [];
const failList = [];

for (const [name, info] of Object.entries(data.tools)) {
  if (info.status === "ok") {
    okList.push(name);
  } else if (info.status === "standby") {
    standbyList.push(name);
  } else if (info.status === "warn") {
    warnList.push(`${name} (${info.reason || "注意配额"})`);
  } else if (info.status === "cooldown") {
    // wave358: 凭据过期 → 派单自动降级, PM 需在 WeChat 看到冷却原因
    cooldownList.push(`${name} (${info.reason || "凭据过期"})`);
  } else {
    failList.push(`${name} (${info.reason || "连接失败"})`);
  }
}

console.log(`【工具健康·${time}】`);
console.log(`可用: ${okList.length > 0 ? okList.join(" / ") : "无"}`);
if (standbyList.length > 0) {
  console.log(`免载: ${standbyList.join(" / ")} (生产免载)`);
}
if (cooldownList.length > 0) {
  console.log(`冷却: ${cooldownList.join("；")}`);
}
if (warnList.length > 0) {
  console.log(`注意: ${warnList.join("；")}`);
}
if (failList.length > 0) {
  console.log(`故障: ${failList.join("；")}`);
}
' "$LATEST_JSON"
