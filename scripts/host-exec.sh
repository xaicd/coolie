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
TARGET_HOST="${MAC_HOST_IP:-}"
if [[ -z "$TARGET_HOST" ]]; then
  # Try candidates in order: static LAN IP, container gateway
  default_gateway="$(ip route show default 2>/dev/null | awk '/default/ {print $3}' | head -n 1 || printf '')"
  for candidate in "192.168.3.85" "$default_gateway" "host.docker.internal"; do
    [[ -n "$candidate" ]] || continue
    # Ensure route to candidate bypasses clash TUN if using 192.168.x
    if command -v ip >/dev/null 2>&1 && [[ "$candidate" =~ ^192\.168\. ]]; then
      ip route replace "$candidate" via 172.19.0.1 dev eth0 2>/dev/null || true
    fi
    # Quick probe port 22 with nc or bash /dev/tcp with 1s timeout
    if (timeout 1 bash -c "cat < /dev/null > /dev/tcp/$candidate/22" 2>/dev/null); then
      TARGET_HOST="$candidate"
      break
    fi
  done
  # Fallback to default
  [[ -n "$TARGET_HOST" ]] || TARGET_HOST="192.168.3.85"
fi

# Ensure route to selected host bypasses clash TUN
if command -v ip >/dev/null 2>&1 && [[ "$TARGET_HOST" =~ ^192\.168\. ]]; then
  ip route replace "$TARGET_HOST" via 172.19.0.1 dev eth0 2>/dev/null || true
fi

HOST_USER="${HOST_USER:-mac}"

# Encode full remote script in base64 to avoid shell quoting and injection traps
RAW_SCRIPT="export PATH=\"/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:\$PATH\"; cd /Users/mac/workspace/xaicd/coolie 2>/dev/null || true; $*"
B64_SCRIPT="$(printf '%s' "$RAW_SCRIPT" | base64 | tr -d '\r\n')"

exec ssh -o StrictHostKeyChecking=no \
  -o UserKnownHostsFile=/dev/null \
  -o LogLevel=ERROR \
  -o BatchMode=yes \
  -o ConnectTimeout=5 \
  -o ServerAliveInterval=15 \
  -o ServerAliveCountMax=2 \
  -i "$SSH_KEY" \
  "$HOST_USER@$TARGET_HOST" \
  "echo $B64_SCRIPT | base64 -d | bash"

