#!/usr/bin/env bash
# scripts/adapters/docker-agy-acp.sh
# Executable launcher for Antigravity ACP adapter
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "${DIR}/docker-agy-acp.mjs" "$@"
