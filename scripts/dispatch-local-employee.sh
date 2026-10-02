#!/usr/bin/env bash
# scripts/dispatch-local-employee.sh --agent <subagent> --task <task> [--execute | --print]
#
# wave282 + 2026-10-02-local-dispatch-receipt spec
#
# This script gives Hermes one stable command shape for every local employee.
# By default it records a structured JSON receipt under `.paperclip-local/dispatch/`
# alongside a prompt file, and prints the exact Hermes/Agent instruction.
# When `--execute` is passed, it executes the tool and records started/done status.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

AGENT=""
TASK=""
WAVE=""
TOOL=""
SPEC_PATH=""
BRIEF_PATH=""
EXECUTE=0
PRINT_ONLY=0
STATUS="queued"
COMMIT=""
BLOCKED_REASON=""
SHOW_RECEIPT=""
LIST_RECEIPTS=0

usage() {
  cat <<'EOF'
usage: scripts/dispatch-local-employee.sh [options]

Fixed dispatch entrypoint for Hermes local employees with structured receipt.

Options:
  --agent <name>       sub-agent type to dispatch
  --task <task>        short task key or human task sentence
  --wave <wave>        wave identifier (e.g. wave283)
  --tool <tool>        override default tool for employee
  --spec <path>        path to spec document
  --brief <path>       path to brief document
  --execute            run command after recording receipt
  --print              print prompt only; do not record
  --list               list recent receipts in .paperclip-local/dispatch/
  --show <id>          show details of a specific receipt
  --help               show this help

Agents:
  hermes-pm            Hermes (PM / 掌柜)
  modou-fda            墨斗 (FDA)
  forge-core-swe       铁匠 (Core SWE)
  forge-ii-core-swe    铁匠贰号 (Core SWE 兜底)
  menshen-fdse         门神 (FDSE)
  duidiyuan-pre-sre    兑底渊 (PRE-SRE)
  baixiaosheng-ds      百晓生 (DS)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --agent) AGENT="${2:-}"; shift 2 ;;
    --task) TASK="${2:-}"; shift 2 ;;
    --wave) WAVE="${2:-}"; shift 2 ;;
    --tool) TOOL="${2:-}"; shift 2 ;;
    --spec) SPEC_PATH="${2:-}"; shift 2 ;;
    --brief) BRIEF_PATH="${2:-}"; shift 2 ;;
    --execute) EXECUTE=1; shift ;;
    --print) PRINT_ONLY=1; shift ;;
    --list) LIST_RECEIPTS=1; shift ;;
    --show) SHOW_RECEIPT="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'unknown arg: %s\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
done

dispatch_dir="$REPO_ROOT/.paperclip-local/dispatch"
mkdir -p "$dispatch_dir"

if [[ "$LIST_RECEIPTS" -eq 1 ]]; then
  printf 'Recent dispatch receipts under %s:\n' "$dispatch_dir"
  ls -lt "$dispatch_dir"/*.json 2>/dev/null | head -n 15 || printf 'No receipts found.\n'
  exit 0
fi

if [[ -n "$SHOW_RECEIPT" ]]; then
  target_file="$dispatch_dir/$SHOW_RECEIPT"
  [[ -f "$target_file" ]] || target_file="$dispatch_dir/${SHOW_RECEIPT}.json"
  if [[ -f "$target_file" ]]; then
    cat "$target_file"
    exit 0
  else
    printf 'receipt not found: %s\n' "$SHOW_RECEIPT" >&2
    exit 1
  fi
fi

case "$AGENT" in
  hermes-pm|modou-fda|forge-core-swe|forge-ii-core-swe|menshen-fdse|duidiyuan-pre-sre|baixiaosheng-ds) ;;
  "") printf 'missing --agent\n' >&2; usage >&2; exit 2 ;;
  *) printf 'invalid --agent: %s\n' "$AGENT" >&2; usage >&2; exit 2 ;;
esac

if [[ -z "$TASK" ]]; then
  printf 'missing --task\n' >&2
  usage >&2
  exit 2
fi

agent_template="$REPO_ROOT/.agents/agents/$AGENT.md"
if [[ ! -f "$agent_template" ]]; then
  printf 'missing agent template: %s\n' "$agent_template" >&2
  exit 1
fi

# Map agent to employee and default tool per docs-coolie/TOOLS.md
case "$AGENT" in
  hermes-pm)
    EMPLOYEE="Hermes"
    DEFAULT_TOOL="hermes"
    FALLBACK_TOOLS='["kiro-cli"]'
    ;;
  modou-fda)
    EMPLOYEE="墨斗"
    DEFAULT_TOOL="agy-gemini3.8"
    FALLBACK_TOOLS='["claude-glm", "cmd"]'
    ;;
  forge-core-swe)
    EMPLOYEE="铁匠"
    DEFAULT_TOOL="claude-glm"
    FALLBACK_TOOLS='["claude-mm", "cmd"]'
    ;;
  forge-ii-core-swe)
    EMPLOYEE="铁匠贰号"
    DEFAULT_TOOL="cmd"
    FALLBACK_TOOLS='["claude-mm"]'
    ;;
  menshen-fdse)
    EMPLOYEE="门神"
    DEFAULT_TOOL="cmd"
    FALLBACK_TOOLS='["claude-mm", "copilot"]'
    ;;
  duidiyuan-pre-sre)
    EMPLOYEE="兑底渊"
    DEFAULT_TOOL="copilot"
    FALLBACK_TOOLS='["claude-glm", "cmd"]'
    ;;
  baixiaosheng-ds)
    EMPLOYEE="百晓生"
    DEFAULT_TOOL="claude-glm"
    FALLBACK_TOOLS='["claude-mm", "agy-gemini3.8"]'
    ;;
esac

TOOL="${TOOL:-$DEFAULT_TOOL}"

# Auto-detect wave if not explicitly passed
if [[ -z "$WAVE" ]]; then
  if [[ "$TASK" =~ wave[0-9]+ ]]; then
    WAVE="${BASH_REMATCH[0]}"
  else
    latest_commit_msg="$(git -C "$REPO_ROOT" log -1 --pretty=%B 2>/dev/null || printf '')"
    if [[ "$latest_commit_msg" =~ wave[0-9]+ ]]; then
      WAVE="${BASH_REMATCH[0]}"
    else
      WAVE="wave-local"
    fi
  fi
fi

now_iso="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
safe_task="$(printf '%s' "$TASK" | tr -cs '[:alnum:]_.-' '-' | sed -E 's/^-+|-+$//g' | cut -c1-60)"
[[ -n "$safe_task" ]] || safe_task="task"

receipt_id="${timestamp}-${WAVE}-${AGENT}"
json_file="$dispatch_dir/${receipt_id}.json"
prompt_file="$dispatch_dir/${receipt_id}.md"

make_prompt() {
  cat <<EOF
【wave282 fixed dispatch】

Sub-agent type: ${AGENT}
Employee: ${EMPLOYEE}
Task: ${TASK}
Wave: ${WAVE}
Tool: ${TOOL}
Repository: ${REPO_ROOT}
Branch: $(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || printf 'unknown')

Use the Claude Code Agent tool with:
  subagent_type="${AGENT}"

Seven-part brief requirements:
1. Background: boss requested fixed local employee dispatch.
2. Target: run the task above using the named employee semantics.
3. Branch: current branch shown above unless PM overrides it.
4. File allowlist: keep changes to the task brief; do not touch unrelated dirty files.
5. Steps: inspect relevant docs, implement only requested scope, validate narrowly.
6. Acceptance: produce a concise report with changed files and verification.
7. Rules: single writer, no secret output, no mock business data, report stuck after 4h.

Agent template:
$(sed 's/^/> /' "$agent_template")
EOF
}

write_receipt() {
  local p_status="$1"
  local p_pid="$2"
  local p_started_at="$3"
  local p_completed_at="$4"
  local p_commit="$5"
  local p_reason="$6"

  node -e '
const fs = require("fs");
const argv = process.argv;
const data = {
  schemaVersion: 1,
  id: argv[1],
  wave: argv[2],
  createdAt: argv[3],
  bossInput: argv[4],
  pm: "Hermes",
  employee: argv[5],
  subagentType: argv[6],
  task: argv[7],
  tool: argv[8],
  fallbackTools: JSON.parse(argv[9] || "[]"),
  branch: argv[10],
  specPath: argv[11] || null,
  briefPath: argv[12] || null,
  allowlist: [],
  status: argv[13],
  pid: argv[14] && !isNaN(Number(argv[14])) ? Number(argv[14]) : null,
  startedAt: argv[15] || null,
  completedAt: argv[16] || null,
  commit: argv[17] || null,
  verification: [],
  evidence: [],
  blockedReason: argv[18] || null,
};
fs.writeFileSync(argv[19], JSON.stringify(data, null, 2), "utf8");
' \
    "$receipt_id" \
    "$WAVE" \
    "$now_iso" \
    "$TASK" \
    "$EMPLOYEE" \
    "$AGENT" \
    "$TASK" \
    "$TOOL" \
    "$FALLBACK_TOOLS" \
    "$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || printf 'unknown')" \
    "$SPEC_PATH" \
    "$BRIEF_PATH" \
    "$p_status" \
    "$p_pid" \
    "$p_started_at" \
    "$p_completed_at" \
    "$p_commit" \
    "$p_reason" \
    "$json_file"
}

if [[ "$PRINT_ONLY" -eq 1 ]]; then
  make_prompt
  exit 0
fi

# Write prompt file and initial receipt (queued)
make_prompt > "$prompt_file"
write_receipt "queued" "" "" "" "" ""

printf '[dispatch] recorded receipt: %s\n' "$json_file"
printf '[dispatch] recorded prompt:  %s\n' "$prompt_file"
printf '[dispatch] employee=%s agent=%s tool=%s task=%s\n' "$EMPLOYEE" "$AGENT" "$TOOL" "$TASK"

if [[ "$EXECUTE" -eq 0 ]]; then
  printf '[dispatch] status=queued. To execute: %s --agent %s --task %q --execute\n' "$0" "$AGENT" "$TASK"
  exit 0
fi

CLAUDE_BIN="${CLAUDE_BIN:-claude}"
command -v "$CLAUDE_BIN" >/dev/null 2>&1 || {
  printf 'cannot execute: %s not found\n' "$CLAUDE_BIN" >&2
  write_receipt "failed" "" "" "$now_iso" "" "command not found: $CLAUDE_BIN"
  exit 1
}

# Update receipt to running
started_iso="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
write_receipt "running" "$$" "$started_iso" "" "" ""

printf '[dispatch] running with pid=%s tool=%s...\n' "$$" "$CLAUDE_BIN"
if "$CLAUDE_BIN" -p "$(cat "$prompt_file")"; then
  completed_iso="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  latest_hash="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || printf '')"
  write_receipt "done" "$$" "$started_iso" "$completed_iso" "$latest_hash" ""
  printf '[dispatch] execution completed: status=done commit=%s\n' "$latest_hash"
else
  failed_iso="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  write_receipt "failed" "$$" "$started_iso" "$failed_iso" "" "execution exited with non-zero status"
  printf '[dispatch] execution failed: status=failed\n' >&2
  exit 1
fi
