#!/usr/bin/env bash
# scripts/adapters/codex-acp.sh
# Standardized ACP adapter launcher for OpenAI Codex CLI
set -e

if command -v codex-acp >/dev/null 2>&1; then
  exec codex-acp "$@"
else
  exec npx -y @agentclientprotocol/codex-acp@^0.0.44 "$@"
fi
