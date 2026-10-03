#!/usr/bin/env bash
# scripts/coolie-dev-task.sh — 代理调用 coolie-dev-task.mjs
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ -x "$SCRIPT_DIR/host-exec.sh" ]]; then
  exec "$SCRIPT_DIR/host-exec.sh" "node /Users/mac/workspace/xaicd/coolie/scripts/coolie-dev-task.mjs $*"
else
  exec node "$SCRIPT_DIR/coolie-dev-task.mjs" "$@"
fi
