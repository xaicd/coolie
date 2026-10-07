#!/usr/bin/env bash
# scripts/adapters/claude-mm-acp.sh
# Standardized ACP adapter launcher for Claude Code with MiniMax profile
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_SETTINGS="${HOME}/.claude/settings.jsonmm"
SETTINGS_PATH="${CLAUDE_SETTINGS_PATH:-$DEFAULT_SETTINGS}"

# Ensure MiniMax profile symlink as fallback
if [[ -f "$DEFAULT_SETTINGS" ]]; then
  ln -sf "$DEFAULT_SETTINGS" "${HOME}/.claude/settings.json" 2>/dev/null || true
fi

# Export MiniMax API endpoint defaults if not set
export ANTHROPIC_BASE_URL="${ANTHROPIC_BASE_URL:-https://api.minimaxi.com/anthropic}"
export ANTHROPIC_MODEL="${ANTHROPIC_MODEL:-MiniMax-M3}"

exec node "${DIR}/claude-profile-acp.mjs" --settings "$SETTINGS_PATH" --model "$ANTHROPIC_MODEL" "$@"
