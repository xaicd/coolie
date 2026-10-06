#!/usr/bin/env bash
# scripts/adapters/copilot-acp.sh
# Standardized ACP adapter launcher for GitHub Copilot CLI
set -e

if command -v copilot >/dev/null 2>&1; then
  exec copilot --acp --stdio "$@"
elif command -v github-copilot-cli >/dev/null 2>&1; then
  exec github-copilot-cli --acp --stdio "$@"
elif [[ -f "/opt/homebrew/bin/copilot" ]]; then
  exec /opt/homebrew/bin/copilot --acp --stdio "$@"
elif [[ -f "scripts/host-exec.sh" ]]; then
  exec bash scripts/host-exec.sh "copilot --acp --stdio $*"
else
  echo "[copilot-acp] Error: copilot binary not found" >&2
  exit 1
fi
