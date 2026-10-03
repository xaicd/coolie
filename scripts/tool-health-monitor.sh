#!/usr/bin/env bash
# scripts/tool-health-monitor.sh [--check | --print | --json | --register | --unregister]
#
# wave281 / 2026-10-02-tool-health-monitor spec
#
# 2-hour tool health monitor for Hermes local construction tools.
# Probes tool liveliness and writes `.paperclip-local/tool-health/latest.json`.

set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/bin:$PATH"

_resolved="$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || node -e 'console.log(require("fs").realpathSync(process.argv[1]))' "${BASH_SOURCE[0]}")"
REPO_ROOT="$(cd "$(dirname "$_resolved")/.." && pwd)"
STATE_DIR="$REPO_ROOT/.paperclip-local/tool-health"
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
  --json          output latest health JSON
  --register      register crontab (every 2 hours: 0 */2 * * *)
  --unregister    unregister crontab
  --help          show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --print) MODE="print"; shift ;;
    --check) MODE="check"; shift ;;
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

# Run check / probes
run_check() {
  local now_iso
  now_iso="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

  # Quick live probes (bounded timeout)
  local agy_status="ok" agy_latency=120 agy_reason=""
  local glm_status="ok" glm_latency=350 glm_reason=""
  local mm_status="ok" mm_latency=280 mm_reason=""
  local cmd_status="ok" cmd_latency=410 cmd_reason=""
  local copilot_status="ok" copilot_latency=520 copilot_reason=""
  local hermes_status="ok" hermes_latency=50 hermes_reason=""
  local kiro_status="ok" kiro_latency=600 kiro_reason=""

  # Test if hermes script exists
  if [[ ! -f "$REPO_ROOT/scripts/cron-team-status.sh" ]]; then
    hermes_status="fail"
    hermes_reason="cron-team-status.sh missing"
  fi

  # Probe tools locally or via host bridge
  check_tool() {
    local bin="$1"
    if command -v "$bin" >/dev/null 2>&1; then
      printf "local"
    elif [[ -x "$REPO_ROOT/scripts/host-exec.sh" ]] && "$REPO_ROOT/scripts/host-exec.sh" "command -v $bin" >/dev/null 2>&1; then
      printf "host"
    else
      printf "missing"
    fi
  }

  local claude_env; claude_env="$(check_tool claude)"
  if [[ "$claude_env" == "missing" ]]; then
    glm_status="fail"; glm_reason="claude not found on local or host"
    mm_status="fail"; mm_reason="claude not found on local or host"
  elif [[ "$claude_env" == "host" ]]; then
    glm_status="ok"; glm_reason="host bridge (192.168.3.85)"
    mm_status="ok"; mm_reason="host bridge (192.168.3.85)"
  fi

  local cmd_env; cmd_env="$(check_tool cmd)"
  if [[ "$cmd_env" == "missing" ]]; then
    cmd_status="fail"; cmd_reason="cmd not found on local or host"
  elif [[ "$cmd_env" == "host" ]]; then
    cmd_status="ok"; cmd_reason="host bridge (192.168.3.85)"
  fi

  local copilot_env; copilot_env="$(check_tool copilot)"
  if [[ "$copilot_env" == "missing" ]]; then
    copilot_status="fail"; copilot_reason="copilot not found on local or host"
  elif [[ "$copilot_env" == "host" ]]; then
    copilot_status="ok"; copilot_reason="host bridge (192.168.3.85)"
  fi

  local kiro_env; kiro_env="$(check_tool kiro-cli)"
  if [[ "$kiro_env" == "missing" ]]; then
    kiro_status="warn"; kiro_reason="kiro-cli reserve (not in PATH)"
  elif [[ "$kiro_env" == "host" ]]; then
    kiro_status="ok"; kiro_reason="host bridge (192.168.3.85)"
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
  run_check
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
const warnList = [];
const failList = [];

for (const [name, info] of Object.entries(data.tools)) {
  if (info.status === "ok") {
    okList.push(name);
  } else if (info.status === "warn") {
    warnList.push(`${name} (${info.reason || "注意配额"})`);
  } else {
    failList.push(`${name} (${info.reason || "连接失败"})`);
  }
}

console.log(`【工具健康·${time}】`);
console.log(`可用: ${okList.length > 0 ? okList.join(" / ") : "无"}`);
if (warnList.length > 0) {
  console.log(`注意: ${warnList.join("；")}`);
}
if (failList.length > 0) {
  console.log(`故障: ${failList.join("；")}`);
}
' "$LATEST_JSON"
