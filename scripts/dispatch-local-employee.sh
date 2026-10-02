#!/usr/bin/env bash
# scripts/dispatch-local-employee.sh --agent <subagent> --task <task> [--execute]
#
# wave282 — fixed local employee dispatch entrypoint.
#
# This script gives Hermes one stable command shape for every local employee.
# By default it records a dispatch request under `.paperclip-local/dispatch/`
# and prints the exact Hermes/Agent instruction. It only invokes Claude when
# `--execute` is passed, so cron registration is safe to dry-run and inspect.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
AGENT=""
TASK=""
EXECUTE=0
PRINT_ONLY=0

usage() {
  cat <<'EOF'
usage: scripts/dispatch-local-employee.sh --agent <name> --task <task> [--execute | --print]

Fixed wave282 dispatch entrypoint for Hermes local employees.

Agents:
  hermes-pm
  modou-fda
  forge-core-swe
  forge-ii-core-swe
  menshen-fdse
  duidiyuan-pre-sre
  baixiaosheng-ds

Options:
  --agent <name>     sub-agent type to dispatch
  --task <task>      short task key or human task sentence
  --execute          run `claude -p <prompt>` after recording the request
  --print            print prompt only; do not record
  --help             show this help

Env:
  CLAUDE_BIN         Claude CLI path (default: claude)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --agent) AGENT="${2:-}"; shift 2 ;;
    --task) TASK="${2:-}"; shift 2 ;;
    --execute) EXECUTE=1; shift ;;
    --print) PRINT_ONLY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'unknown arg: %s\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
done

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

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
safe_task="$(printf '%s' "$TASK" | tr -cs '[:alnum:]_.-' '-' | sed -E 's/^-+|-+$//g' | cut -c1-60)"
[[ -n "$safe_task" ]] || safe_task="task"
dispatch_dir="$REPO_ROOT/.paperclip-local/dispatch"
prompt_file="$dispatch_dir/${timestamp}-${AGENT}-${safe_task}.md"

make_prompt() {
  cat <<EOF
【wave282 fixed dispatch】

Sub-agent type: ${AGENT}
Task: ${TASK}
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

if [[ "$PRINT_ONLY" -eq 1 ]]; then
  make_prompt
  exit 0
fi

mkdir -p "$dispatch_dir"
make_prompt > "$prompt_file"
printf '[wave282-dispatch] recorded %s\n' "$prompt_file"
printf '[wave282-dispatch] agent=%s task=%s\n' "$AGENT" "$TASK"

if [[ "$EXECUTE" -eq 0 ]]; then
  printf '[wave282-dispatch] not executing. To run: %s --agent %s --task %q --execute\n' "$0" "$AGENT" "$TASK"
  exit 0
fi

CLAUDE_BIN="${CLAUDE_BIN:-claude}"
command -v "$CLAUDE_BIN" >/dev/null 2>&1 || {
  printf 'cannot execute: %s not found\n' "$CLAUDE_BIN" >&2
  exit 1
}

"$CLAUDE_BIN" -p "$(cat "$prompt_file")"
