#!/usr/bin/env bash
# scripts/adapters/claude-glm-acp.sh
# Standardized ACP adapter launcher for Claude Code with GLM (智谱) profile
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_SETTINGS="${HOME}/.claude/settings.jsonglm"
SETTINGS_PATH="${CLAUDE_SETTINGS_PATH:-$DEFAULT_SETTINGS}"

# Ensure GLM profile symlink as fallback
if [[ -f "$DEFAULT_SETTINGS" ]]; then
  ln -sf "$DEFAULT_SETTINGS" "${HOME}/.claude/settings.json" 2>/dev/null || true
fi

# Export BigModel GLM API endpoint defaults if not set
export ANTHROPIC_BASE_URL="${ANTHROPIC_BASE_URL:-https://open.bigmodel.cn/api/anthropic}"
export ANTHROPIC_MODEL="${ANTHROPIC_MODEL:-glm-5}"

exec node "${DIR}/claude-profile-acp.mjs" --settings "$SETTINGS_PATH" --model "$ANTHROPIC_MODEL" "$@"
