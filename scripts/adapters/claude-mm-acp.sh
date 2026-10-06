#!/usr/bin/env bash
# scripts/adapters/claude-mm-acp.sh
# Standardized ACP adapter launcher for Claude Code with MiniMax-M3 profile
set -e

# Switch or ensure MiniMax profile
if [[ -f "${HOME}/.claude/settings.jsonmm" ]]; then
  ln -sf "${HOME}/.claude/settings.jsonmm" "${HOME}/.claude/settings.json" 2>/dev/null || true
fi

# Export MiniMax API endpoint defaults if not set
export ANTHROPIC_BASE_URL="${ANTHROPIC_BASE_URL:-https://api.minimaxi.com/anthropic}"
export ANTHROPIC_MODEL="${ANTHROPIC_MODEL:-MiniMax-M3}"

# Execute Claude ACP server
if command -v claude-agent-acp >/dev/null 2>&1; then
  exec claude-agent-acp "$@"
else
  exec npx -y @agentclientprotocol/claude-agent-acp@^0.37.0 "$@"
fi
