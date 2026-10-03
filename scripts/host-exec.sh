#!/usr/bin/env bash
# scripts/host-exec.sh [command...]
#
# Transparent SSH execution proxy from container sandbox to macOS host.
# Automatically resolves host IP, loads credentials from /root/.ssh, and invokes tools.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SSH_KEY="/root/.ssh/id_ed25519"
if [[ ! -f "$SSH_KEY" && -f "/root/.ssh-host/id_ed25519" ]]; then
  mkdir -p /root/.ssh
  cp /root/.ssh-host/id_ed25519 "$SSH_KEY"
  chmod 600 "$SSH_KEY"
fi

# Detect if we are already on host
if [[ ! -f "/.dockerenv" ]] && ! grep -q 'containerd' /proc/1/cgroup 2>/dev/null; then
  # We are on the host directly
  exec "$@"
fi

# We are in container; resolve Mac host IP
TARGET_HOST=""
CANDIDATE_HOSTS=("host.docker.internal" "192.168.5.2" "172.19.0.1")

for h in "${CANDIDATE_HOSTS[@]}"; do
  if node -e "
const net = require('net');
const s = new net.Socket();
s.setTimeout(800);
s.on('connect', () => { process.exit(0); });
s.on('timeout', () => { process.exit(1); });
s.on('error', () => { process.exit(1); });
s.connect(22, '$h');
" 2>/dev/null; then
    TARGET_HOST="$h"
    break
  fi
done

if [[ -z "$TARGET_HOST" ]]; then
  TARGET_HOST="host.docker.internal"
fi

HOST_USER="${HOST_USER:-mac}"

# Ensure Homebrew and path exports are set when running on macOS host
CMD_STR="$*"
REMOTE_CMD="export PATH=\"/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:\$PATH\"; cd /Users/mac/workspace/xaicd/coolie 2>/dev/null || true; $CMD_STR"

exec ssh -o StrictHostKeyChecking=no \
  -o UserKnownHostsFile=/dev/null \
  -o LogLevel=ERROR \
  -o ConnectTimeout=5 \
  -i "$SSH_KEY" \
  "$HOST_USER@$TARGET_HOST" \
  "$REMOTE_CMD"
