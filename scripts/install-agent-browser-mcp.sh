#!/usr/bin/env bash
# scripts/install-agent-browser-mcp.sh [--dry-run | --apply]
#
# wave228 — Register `agent-browser` as an MCP server in every installed
# Claude-Code-derived CLI on this Mac. Reads ~/.claude/settings.json, merges
# an mcpServers["agent-browser"] block, writes back. Idempotent.
#
# What it registers (per CLI tool that has agent-browser on PATH):
#   mcpServers["agent-browser"] = { "command": "agent-browser", "args": ["mcp"] }
#
# `agent-browser mcp` is the official stdio MCP server exposed by the
# agent-browser CLI (see `agent-browser mcp --help`, protocol 2025-11-25).
# Surfaces click / fill / snapshot / verify / dashboard / etc. as MCP tools.
#
# Used by: 门神 (cmd, 老板亲自跑撞机 / E2E) / 铁匠 (集成测试) / 百晓生 (验收
# 测试 + 撞机器 + 监控). See docs-coolie/TOOL-USAGE.md §3.
#
# Flags:
#   --dry-run   Print "would write:" lines without touching disk
#   --apply     Apply (default when run from a non-TTY context)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/mcp-install-common.sh
source "$HERE/lib/mcp-install-common.sh"

usage() {
  cat <<'EOF'
usage: scripts/install-agent-browser-mcp.sh [--dry-run | --apply]

Registers the agent-browser stdio MCP server into ~/.claude/settings.json
under mcpServers["agent-browser"] for every installed CLI tool that has the
agent-browser binary on PATH (or in /opt/homebrew/bin / /usr/local/bin).

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

AGENT_BROWSER_BIN=""
if command -v agent-browser >/dev/null 2>&1; then
  AGENT_BROWSER_BIN="$(command -v agent-browser)"
elif [[ -x /opt/homebrew/bin/agent-browser ]]; then
  AGENT_BROWSER_BIN="/opt/homebrew/bin/agent-browser"
elif [[ -x /usr/local/bin/agent-browser ]]; then
  AGENT_BROWSER_BIN="/usr/local/bin/agent-browser"
fi

if [[ -z "$AGENT_BROWSER_BIN" ]]; then
  mcp_die "agent-browser binary not found on PATH or in /opt/homebrew/bin / /usr/local/bin; install Homebrew's agent-browser before re-running"
fi

register_for_tool() {
  local tool="$1"
  mcp_register_server "$tool" "agent-browser" "$AGENT_BROWSER_BIN" '["mcp"]'
}

mcp_log "安装 agent-browser MCP server → ~/.claude/settings.json"
mcp_log "binary: $AGENT_BROWSER_BIN (args: [\"mcp\"])"
mcp_for_each_cli register_for_tool

if [[ "${MCP_DRY_RUN:-0}" == "1" ]]; then
  mcp_log "dry-run 完成 — 未写入任何文件"
else
  mcp_log "✅ 完成: agent-browser MCP 已注册"
fi