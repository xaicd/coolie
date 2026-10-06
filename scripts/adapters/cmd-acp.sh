#!/usr/bin/env bash
# scripts/adapters/cmd-acp.sh
# Executable launcher for Command Code ACP adapter
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "${DIR}/cmd-acp.mjs" "$@"
