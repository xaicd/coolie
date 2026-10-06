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
probe_agy() {
  local start_ms end_ms latency output
  start_ms="$(node -e 'console.log(Date.now())')"

  # 1. 优先检查当前环境 (容器内) 是否有 agy
  if command -v agy >/dev/null 2>&1; then
    if output="$(agy --help 2>&1)"; then
      end_ms="$(node -e 'console.log(Date.now())')"
      latency=$((end_ms - start_ms))
      first_line="$(printf '%s' "$output" | head -n 1 | cut -c1-40)"
      printf 'ok\t%d\tcontainer: %s' "$latency" "$first_line"
      return 0
    fi
  fi

  # 2. 如果在宿主机运行，检查 docker exec 容器内的 agy
  if command -v docker >/dev/null 2>&1 && docker inspect agy-ubuntu-container >/dev/null 2>&1; then
    if docker exec agy-ubuntu-container bash -c 'command -v /root/.local/bin/agy >/dev/null 2>&1 || command -v agy >/dev/null 2>&1' 2>/dev/null; then
      end_ms="$(node -e 'console.log(Date.now())')"
      latency=$((end_ms - start_ms))
      printf 'ok\t%d\tdocker: agy-ubuntu-container active' "$latency"
      return 0
    fi
  fi

  # 3. 跨桥梁 host-exec 探测宿主机的 docker 容器
  if [[ -x "$REPO_ROOT/scripts/host-exec.sh" ]]; then
    if "$REPO_ROOT/scripts/host-exec.sh" "docker exec agy-ubuntu-container /root/.local/bin/agy --help >/dev/null 2>&1" 2>/dev/null; then
      end_ms="$(node -e 'console.log(Date.now())')"
      latency=$((end_ms - start_ms))
      printf 'ok\t%d\thost-docker: agy active' "$latency"
      return 0
    fi
  fi

  printf 'fail\t999\tagy container or binary unreachable'
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

  # 1. agy probe
  IFS=$'\t' read -r agy_status agy_latency agy_reason <<< "$(smart_probe_artisan_tool agy-gemini3.8)"

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
      expiresAt: null,
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
    "$LATEST_JSON"
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
const failList = [];

for (const [name, info] of Object.entries(data.tools)) {
  if (info.status === "ok") {
    okList.push(name);
  } else if (info.status === "standby") {
    standbyList.push(name);
  } else if (info.status === "warn") {
    warnList.push(`${name} (${info.reason || "注意配额"})`);
  } else {
    failList.push(`${name} (${info.reason || "连接失败"})`);
  }
}

console.log(`【工具健康·${time}】`);
console.log(`可用: ${okList.length > 0 ? okList.join(" / ") : "无"}`);
if (standbyList.length > 0) {
  console.log(`免载: ${standbyList.join(" / ")} (生产免载)`);
}
if (warnList.length > 0) {
  console.log(`注意: ${warnList.join("；")}`);
}
if (failList.length > 0) {
  console.log(`故障: ${failList.join("；")}`);
}
' "$LATEST_JSON"
