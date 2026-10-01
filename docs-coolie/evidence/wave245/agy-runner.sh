#!/usr/bin/env bash
# wave245 runner: decode base64 prompt, run agy with safe UTF-8
set -euo pipefail
export LANG=C.UTF-8
export LC_ALL=C.UTF-8
cd /workspace
PROMPT="$(base64 -d /tmp/wave245-prompt.b64)"
exec agy --dangerously-skip-permissions --output-format text --print-timeout 1800s -p "$PROMPT"