#!/usr/bin/env bash
# scripts/event-trigger.sh [--check | --watch | --test | --register | --unregister]
#
# wave280 / docs-coolie/briefs/2026-10-02-event-trigger-wave280.md
#
# Event-driven progress notifications for WeChat clawbot with true silence when unchanged.
# Hooks:
#   1. 新 wave 开始 -> 📋日常
#   2. wave 完成 -> ⚡重要 / 🔥金标
#   3. 跑 -> 卡 (ETIME > 4h) -> ⚡重要
#   4. 卡 -> 跑 -> 📋日常
#   5. 卡 -> 完 -> ⚡重要
# Scheduled fallback: 8:00 / 12:00 / 18:00

set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/bin:$PATH"

_resolved="$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || node -e 'console.log(require("fs").realpathSync(process.argv[1]))' "${BASH_SOURCE[0]}")"
REPO_ROOT="$(cd "$(dirname "$_resolved")/.." && pwd)"
STATE_DIR="${COOLIE_LOCAL_DIR:-$REPO_ROOT/.coolie-local}/event-trigger"
[[ -d "$STATE_DIR" || ! -d "$REPO_ROOT/.paperclip-local/event-trigger" ]] || STATE_DIR="$REPO_ROOT/.paperclip-local/event-trigger"
LAST_STATE_FILE="$STATE_DIR/last-state.json"
CRON_TAG="wave280-event-trigger"
NOTIFY_CMD="${TEAM_STATUS_CMD:-$HOME/bin/team-status-notify.sh}"

mkdir -p "$STATE_DIR"

MODE="check"

usage() {
  cat <<'EOF'
usage: scripts/event-trigger.sh [options]

wave280 — Event-driven WeChat notification trigger with true silence rule.

Options:
  --check        check for state changes and trigger if needed (default)
  --watch        run in loop (daemon, every 60s)
  --test         simulate run->stuck event and test notification
  --register     register cron watcher
  --unregister   unregister cron watcher
  --help         show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check) MODE="check"; shift ;;
    --watch) MODE="watch"; shift ;;
    --test) MODE="test"; shift ;;
    --register) MODE="register"; shift ;;
    --unregister) MODE="unregister"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'unknown arg: %s\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ "$MODE" == "register" ]]; then
  cmd="*/5 * * * * bash $REPO_ROOT/scripts/event-trigger.sh --check >/dev/null 2>&1 # $CRON_TAG"
  existing="$(crontab -l 2>/dev/null || true)"
  if printf '%s\n' "$existing" | grep -q "$CRON_TAG"; then
    printf 'cron already registered for %s\n' "$CRON_TAG"
  else
    printf '%s\n%s\n' "$existing" "$cmd" | grep -v '^$' | crontab -
    printf 'registered 5-min watcher cron for event-trigger.\n'
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

send_notification() {
  local msg="$1"
  printf '%s\n' "$msg"
  if [[ -x "$NOTIFY_CMD" ]]; then
    printf '%s\n' "$msg" | "$NOTIFY_CMD" || true
  fi
  printf '%s\n\n' "$msg" >> "/tmp/team-status.log" || true
}

get_current_state() {
  node -e '
const fs = require("fs");
const path = require("path");
const repoRoot = process.argv[1];

let dispatchDir = path.join(repoRoot, ".coolie-local/dispatch");
if (!fs.existsSync(dispatchDir) && fs.existsSync(path.join(repoRoot, ".paperclip-local/dispatch"))) {
  dispatchDir = path.join(repoRoot, ".paperclip-local/dispatch");
}
const running = [];
const blocked = [];
const done = [];

if (fs.existsSync(dispatchDir)) {
  const files = fs.readdirSync(dispatchDir).filter(f => f.endsWith(".json")).map(f => path.join(dispatchDir, f));
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  for (const f of files.slice(0, 10)) {
    try {
      const r = JSON.parse(fs.readFileSync(f, "utf8"));
      if (r.status === "running") running.push(r);
      else if (r.status === "blocked" || r.status === "failed") blocked.push(r);
      else if (r.status === "done") done.push(r);
    } catch (e) {}
  }
}

// Get recent git commits
const execSync = require("child_process").execSync;
let latestCommit = "";
try {
  latestCommit = execSync("git -C " + repoRoot + " log -1 --pretty=format:\"%h %s\"", { encoding: "utf8" }).trim();
} catch (e) {}

const state = {
  timestamp: new Date().toISOString(),
  runningCount: running.length,
  blockedCount: blocked.length,
  doneCount: done.length,
  runningWaves: running.map(r => `${r.employee}:${r.wave}`),
  blockedWaves: blocked.map(b => `${b.employee}:${b.wave}`),
  latestCommit: latestCommit,
  topRunning: running[0] || null,
  topBlocked: blocked[0] || null,
  topDone: done[0] || null,
};

console.log(JSON.stringify(state));
' "$REPO_ROOT"
}

check_and_trigger() {
  local is_test="${1:-0}"
  local curr_state_json
  curr_state_json="$(get_current_state)"

  local result
  result="$(node -e '
const fs = require("fs");
const curr = JSON.parse(process.argv[1]);
const lastFile = process.argv[2];
const isTest = process.argv[3] === "1";

let last = null;
if (fs.existsSync(lastFile)) {
  try {
    last = JSON.parse(fs.readFileSync(lastFile, "utf8"));
  } catch (e) {}
}

const now = new Date();
const timeStr = now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
const hours = now.getHours();
const minutes = now.getMinutes();
const isScheduledTime = (hours === 8 || hours === 12 || hours === 18) && minutes < 6;

let triggerType = null;
let msg = "";

if (isTest) {
  triggerType = "⚡重要";
  msg = `【⚡重要·${timeStr}】\n卡: 兑底渊 wave280 (4h+, copilot · 测试模拟卡死)\n建议: 检查进程或接力切换备用工具`;
} else if (!last) {
  triggerType = "📋日常";
  msg = `【📋日常·${timeStr}】\n`;
  if (curr.topRunning) {
    msg += `跑: ${curr.topRunning.employee} ${curr.topRunning.wave} (${curr.topRunning.tool})\n`;
  } else {
    msg += "跑: 无 (全员等派活)\n";
  }
  if (curr.latestCommit) {
    msg += `完: 落仓 ${curr.latestCommit.slice(0, 30)}`;
  }
} else {
  // Check for events
  const newStuck = curr.blockedCount > (last.blockedCount || 0);
  const newDone = curr.doneCount > (last.doneCount || 0) || (curr.latestCommit !== last.latestCommit);
  const newRun = JSON.stringify(curr.runningWaves) !== JSON.stringify(last.runningWaves);

  if (newStuck) {
    triggerType = "⚡重要";
    const b = curr.topBlocked || { employee: "员工", wave: "wave", tool: "tool", blockedReason: "阻塞" };
    msg = `【⚡重要·${timeStr}】\n卡: ${b.employee} ${b.wave} (${b.tool} · ${b.blockedReason || "超阈值"})\n建议: 请检查是否死锁`;
  } else if (newDone) {
    triggerType = "🔥金标";
    msg = `【🔥金标·${timeStr}】\n完: 任务完成并落仓 ${curr.latestCommit.slice(0, 40)}`;
  } else if (newRun) {
    triggerType = "📋日常";
    const r = curr.topRunning;
    msg = `【📋日常·${timeStr}】\n` + (r ? `跑: ${r.employee} ${r.wave} (${r.tool})` : "跑: 无 (全员等派活)");
  } else if (isScheduledTime) {
    triggerType = "📋日常";
    msg = `【📋日常·${timeStr}】\n` + (curr.topRunning ? `跑: ${curr.topRunning.employee} ${curr.topRunning.wave} (${curr.topRunning.tool})` : "跑: 无 (全员等派活)");
  }
}

if (triggerType) {
  fs.writeFileSync(lastFile, JSON.stringify(curr, null, 2), "utf8");
  console.log(JSON.stringify({ trigger: true, message: msg.trim() }));
} else {
  console.log(JSON.stringify({ trigger: false, message: "[SILENT] 状态无变化，静默不推" }));
}
' "$curr_state_json" "$LAST_STATE_FILE" "$is_test")"

  local should_trigger
  should_trigger="$(printf '%s' "$result" | node -e 'console.log(JSON.parse(require("fs").readFileSync(0, "utf8")).trigger)')"
  local message
  message="$(printf '%s' "$result" | node -e 'console.log(JSON.parse(require("fs").readFileSync(0, "utf8")).message)')"

  if [[ "$should_trigger" == "true" ]]; then
    send_notification "$message"
  else
    printf '%s\n' "$message"
  fi
}

if [[ "$MODE" == "test" ]]; then
  check_and_trigger 1
  exit 0
fi

if [[ "$MODE" == "check" ]]; then
  check_and_trigger 0
  exit 0
fi

if [[ "$MODE" == "watch" ]]; then
  printf '[event-trigger] starting watcher loop (interval: 60s)...\n'
  while true; do
    check_and_trigger 0 || true
    sleep 60
  done
fi
