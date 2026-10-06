#!/usr/bin/env bash
# scripts/adapters/claude-glm-acp.sh
# Standardized ACP adapter launcher for Claude Code with GLM-5.3 profile
set -e

# Switch or ensure GLM profile
if [[ -f "${HOME}/.claude/settings.jsonglm" ]]; then
  ln -sf "${HOME}/.claude/settings.jsonglm" "${HOME}/.claude/settings.json" 2>/dev/null || true
fi

# Export BigModel GLM API endpoint defaults if not set
export ANTHROPIC_BASE_URL="${ANTHROPIC_BASE_URL:-https://open.bigmodel.cn/api/anthropic}"
export ANTHROPIC_MODEL="${ANTHROPIC_MODEL:-glm-5.3}"

# Execute Claude ACP server
if command -v claude-agent-acp >/dev/null 2>&1; then
  exec claude-agent-acp "$@"
else
  exec npx -y @agentclientprotocol/claude-agent-acp@^0.37.0 "$@"
fi
