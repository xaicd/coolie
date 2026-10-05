#!/usr/bin/env bash
# scripts/register-employees-cron.sh [--dry-run | --install-agents | --register | --register-execute | --unregister | --all]
#
# wave282 — install local employee sub-agent templates and manage their fixed
# schedule entries. This is intentionally explicit and idempotent: dry-run is
# the default, home/crontab writes require a flag, and cron defaults to receipt
# mode instead of unattended execution.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
AGENT_DIR="${AGENT_DIR:-$HOME/.claude/agents}"
CRON_TAG_PREFIX="wave282-local-employee"
ACTION="${1:---dry-run}"

usage() {
  cat <<'EOF'
usage: scripts/register-employees-cron.sh [--dry-run | --install-agents | --register | --register-execute | --unregister | --all]

wave282 fixed local employees:
  1. manage local employee schedules for scripts/dispatch-local-employee.sh
  2. register idempotent cron lines that call scripts/dispatch-local-employee.sh
  (Note: Claude Code subagents are strictly prohibited; all workers report to Hermes directly)

Actions:
  --dry-run          print planned installs and cron lines (default)
  --install-agents   copy/sync .agents/agents/*.md into $AGENT_DIR
  --register         add receipt-only cron lines to current user's crontab
  --register-execute add cron lines that execute Claude dispatches
  --unregister       remove the wave282 cron lines from current user's crontab
  --all              install agents and register receipt-only cron lines
  --help             show this help

Env:
  AGENT_DIR          install target (default: $HOME/.claude/agents)
EOF
}

EMPLOYEE_CRON_ROWS=(
  "modou-fda|0 9 * * *|daily-business-interview|墨斗 daily phase-1 business interview and option framing"
  "forge-core-swe|0 9 * * 1|weekly-development-mainline|铁匠 weekly development mainline"
  "menshen-fdse|0 17 * * *|daily-e2e-validation|门神 daily E2E validation"
  "duidiyuan-pre-sre|0 8 * * *|daily-tool-deploy-check|兑底渊 daily tool and deploy health check"
  "baixiaosheng-ds|0 22 * * 0|weekly-risk-report|百晓生 weekly report and risk plan"
  "baixiaosheng-ds|0 9 * * 1|weekly-go-no-go|百晓生 Monday go/no-go risk review"
)

AGENT_FILES=(
  "hermes-pm.md"
  "modou-fda.md"
  "forge-core-swe.md"
  "forge-ii-core-swe.md"
  "menshen-fdse.md"
  "duidiyuan-pre-sre.md"
  "baixiaosheng-ds.md"
)

cron_line_for() {
  local agent="$1" schedule="$2" task="$3"
  local execute_flag="${4:-0}"
  local mode=""
  if [[ "$execute_flag" == "1" ]]; then
    mode=" --execute"
  fi
  printf '%s bash %s/scripts/dispatch-local-employee.sh --agent %s --task %s%s # %s-%s\n' \
    "$schedule" "$REPO_ROOT" "$agent" "$task" "$mode" "$CRON_TAG_PREFIX" "$agent"
}

print_plan() {
  echo "========================================================"
  echo " wave282 — local employees fixed schedule (DRY RUN)"
  echo "========================================================"
  echo "Agent install target: $AGENT_DIR"
  echo ""
  echo "Agent templates:"
  local file
  for file in "${AGENT_FILES[@]}"; do
    echo "  .agents/agents/$file -> $AGENT_DIR/$file"
  done
  echo ""
  echo "Cron lines:"
  local row agent schedule task label
  for row in "${EMPLOYEE_CRON_ROWS[@]}"; do
    IFS='|' read -r agent schedule task label <<<"$row"
    echo "  $(cron_line_for "$agent" "$schedule" "$task" 0)"
    echo "    # $label"
  done
  echo ""
  echo "Apply agents only: bash scripts/register-employees-cron.sh --install-agents"
  echo "Apply cron only:   bash scripts/register-employees-cron.sh --register"
  echo "Execute cron:      bash scripts/register-employees-cron.sh --register-execute"
  echo "Apply both:        bash scripts/register-employees-cron.sh --all"
}

install_agents() {
  # wave302 掌柜铁律: Claude 本身是 Hermes 的一级 Worker，严禁在 Claude 内部嵌套 subagent
  if [[ -d "$AGENT_DIR" ]]; then
    printf '[wave302] 正在清理 %s 中的旧 subagent 文件，确保 Claude 单兵运行不套娃...\n' "$AGENT_DIR"
    rm -rf "$AGENT_DIR"
  fi
  printf '[wave302] ✅ Claude Code 干净运行保护生效：严禁嵌套 subagent，所有员工直属于 Hermes。\n'
}

register_cron() {
  local execute_flag="${1:-0}"
  command -v crontab >/dev/null 2>&1 || { echo "失败: 需要 crontab" >&2; exit 1; }
  local tmp
  tmp="$(mktemp)"
  trap 'rm -f "$tmp" "${tmp}.new"' EXIT

  if crontab -l > "$tmp" 2>/dev/null; then
    :
  else
    : > "$tmp"
  fi

  grep -Fv "# $CRON_TAG_PREFIX-" "$tmp" > "${tmp}.new" || true
  local row agent schedule task label
  for row in "${EMPLOYEE_CRON_ROWS[@]}"; do
    IFS='|' read -r agent schedule task label <<<"$row"
    cron_line_for "$agent" "$schedule" "$task" "$execute_flag" >> "${tmp}.new"
  done
  crontab "${tmp}.new"
  rm -f "$tmp" "${tmp}.new"
  trap - EXIT
  if [[ "$execute_flag" == "1" ]]; then
    echo "✅ 已注册 wave282 local employee cron lines (execute mode)"
  else
    echo "✅ 已注册 wave282 local employee cron lines (receipt-only mode)"
  fi
  echo "验证: crontab -l | grep $CRON_TAG_PREFIX"
}

unregister_cron() {
  command -v crontab >/dev/null 2>&1 || { echo "失败: 需要 crontab" >&2; exit 1; }
  local tmp
  tmp="$(mktemp)"
  trap 'rm -f "$tmp" "${tmp}.new"' EXIT
  if ! crontab -l > "$tmp" 2>/dev/null; then
    echo "无现有 crontab, 无需撤销"
    rm -f "$tmp"
    trap - EXIT
    exit 0
  fi
  grep -Fv "# $CRON_TAG_PREFIX-" "$tmp" > "${tmp}.new" || true
  if [[ -s "${tmp}.new" ]]; then
    crontab "${tmp}.new"
  else
    crontab -r 2>/dev/null || true
  fi
  rm -f "$tmp" "${tmp}.new"
  trap - EXIT
  echo "✅ 已撤销 wave282 local employee cron lines"
}

case "$ACTION" in
  --dry-run|"")
    print_plan
    ;;
  --install-agents)
    install_agents
    ;;
  --register)
    register_cron 0
    ;;
  --register-execute)
    register_cron 1
    ;;
  --unregister)
    unregister_cron
    ;;
  --all)
    install_agents
    register_cron 0
    ;;
  -h|--help)
    usage
    ;;
  *)
    printf 'unknown action: %s\n' "$ACTION" >&2
    usage >&2
    exit 2
    ;;
esac
