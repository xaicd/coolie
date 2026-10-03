#!/usr/bin/env bash
# scripts/install-agent-device-mcp.sh [--dry-run | --apply]
#
# wave228 — Register `agent-device` as an MCP server in every installed
# Claude-Code-derived CLI on this Mac. Reads ~/.claude/settings.json, merges
# an mcpServers["agent-device"] block, writes back. Idempotent.
#
# What it registers (per CLI tool that has agent-device on PATH):
#   mcpServers["agent-device"] = { "command": "agent-device", "args": ["mcp"] }
#
# `agent-device mcp` is the official stdio MCP server exposed by the
# agent-device CLI (see `agent-device mcp --help`). It surfaces every
# agent-device command (open / press / fill / snapshot / ...) as an MCP tool.
#
# Used by: 铁匠 (claude-glm / claude-mm) / 兑底渊 (claude-ds) / 百晓生
# (claude-glm / claude-mm / claude-ds) — i.e. anyone driving a device. See
# docs-coolie/TOOL-USAGE.md §3.
#
# Flags:
#   --dry-run   Print "would write:" lines without touching disk
#   --apply     Apply (default when run from a non-TTY context)
#
# Exit codes: 0 success / 2 usage error.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/mcp-install-common.sh
source "$HERE/lib/mcp-install-common.sh"

usage() {
  cat <<'EOF'
usage: scripts/install-agent-device-mcp.sh [--dry-run | --apply]

Registers the agent-device stdio MCP server into ~/.claude/settings.json
under mcpServers["agent-device"] for every installed CLI tool that has the
agent-device binary on PATH (or in /opt/homebrew/bin / /usr/local/bin).

  --dry-run   Print planned writes, do not touch disk
  --apply     Apply changes (default when run from a non-TTY context)

Env overrides (testing):
  MCP_DRY_RUN=1       force dry-run (overrides --apply)
  MCP_HOME=/tmp/x     redirect ~/.claude to MCP_HOME/.claude for the run
EOF
}

case "${1:-}" in
  --dry-run)
    export MCP_DRY_RUN=1
    ;;
  --apply|"")
    if [[ -t 0 && -t 1 ]]; then
      export MCP_DRY_RUN=1
      mcp_log "no flag given + TTY → defaulting to --dry-run (use --apply to write)"
    else
      export MCP_DRY_RUN=0
    fi
    ;;
  -h|--help)
    usage; exit 0
    ;;
  *)
    usage >&2; exit 2
    ;;
esac

# Resolve the binary once. Prefer `command -v` so we pick up whichever path the
# user installed under; fall back to /opt/homebrew/bin (Apple Silicon Macs) and
# /usr/local/bin (Intel Macs). If none exist we abort — registering a broken
# entry would silently fail at MCP-launch time.
AGENT_DEVICE_BIN=""
if command -v agent-device >/dev/null 2>&1; then
  AGENT_DEVICE_BIN="$(command -v agent-device)"
elif [[ -x /opt/homebrew/bin/agent-device ]]; then
  AGENT_DEVICE_BIN="/opt/homebrew/bin/agent-device"
elif [[ -x /usr/local/bin/agent-device ]]; then
  AGENT_DEVICE_BIN="/usr/local/bin/agent-device"
fi

if [[ -z "$AGENT_DEVICE_BIN" ]]; then
  mcp_die "agent-device binary not found on PATH or in /opt/homebrew/bin / /usr/local/bin; install Homebrew's agent-device before re-running"
fi

# Only register into CLI tools that themselves are present AND that load
# ~/.claude/settings.json. We mirror MCP_CLI_TOOLS — every Claude-Code-derived
# CLI does — so the union of mcp_cli_present is the right filter.
register_for_tool() {
  local tool="$1"
  mcp_register_server "$tool" "agent-device" "$AGENT_DEVICE_BIN" '["mcp"]'
}

mcp_log "安装 agent-device MCP server → ~/.claude/settings.json"
mcp_log "binary: $AGENT_DEVICE_BIN (args: [\"mcp\"])"
mcp_for_each_cli register_for_tool

if [[ "${MCP_DRY_RUN:-0}" == "1" ]]; then
  mcp_log "dry-run 完成 — 未写入任何文件"
else
  mcp_log "✅ 完成: agent-device MCP 已注册"
fi