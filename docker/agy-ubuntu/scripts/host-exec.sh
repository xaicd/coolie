#!/usr/bin/env bash
# scripts/host-exec.sh [command...]
#
# Transparent SSH execution proxy from container sandbox to host machine.
# Supports macOS and Linux hosts (cwall, aja-pc, mac) with automatic resolution
# of host IP, user, and bidirectional workspace paths.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." 2>/dev/null && pwd || echo "")"

SSH_KEY="/root/.ssh/id_ed25519"
if [[ ! -f "$SSH_KEY" && -f "/root/.ssh-host/id_ed25519" ]]; then
  mkdir -p /root/.ssh
  cp /root/.ssh-host/id_ed25519 "$SSH_KEY"
  chmod 600 "$SSH_KEY"
elif [[ ! -f "$SSH_KEY" && -f "/root/.ssh/id_rsa" ]]; then
  SSH_KEY="/root/.ssh/id_rsa"
elif [[ ! -f "$SSH_KEY" && -f "/root/.ssh-host/id_rsa" ]]; then
  mkdir -p /root/.ssh
  cp /root/.ssh-host/id_rsa "$SSH_KEY"
  chmod 600 "$SSH_KEY"
fi

# Detect if we are already on host
if [[ ! -f "/.dockerenv" ]] && ! grep -q 'containerd' /proc/1/cgroup 2>/dev/null; then
  exec bash -c "$*"
fi

# Ensure route to LAN bypasses clash TUN before probing
if command -v ip >/dev/null 2>&1; then
  ip rule add to 192.168.0.0/16 lookup main prio 8000 2>/dev/null || true
  ip rule add to 172.16.0.0/12 lookup main prio 8000 2>/dev/null || true
  ip rule add to 100.64.0.0/10 lookup main prio 8000 2>/dev/null || true
fi

# 1. Resolve Host IP and User
TARGET_HOST="${HOST_IP:-${MAC_HOST_IP:-}}"
HOST_USER="${HOST_USER:-}"

# Get Docker default gateway (on Linux, gateway is the host itself)
GATEWAY_IP="$(ip route show default 2>/dev/null | awk '/default/ {print $3}' | head -n 1 || true)"

# Probe candidates if not explicitly set
if [[ -z "$TARGET_HOST" || -z "$HOST_USER" ]]; then
  # Candidates pool
  CANDIDATE_USERS=()
  [[ -n "$HOST_USER" ]] && CANDIDATE_USERS+=("$HOST_USER")
  CANDIDATE_USERS+=("mac" "cw" "beye" "ubuntu")

  CANDIDATE_IPS=()
  [[ -n "$TARGET_HOST" ]] && CANDIDATE_IPS+=("$TARGET_HOST")
  [[ -n "$GATEWAY_IP" ]] && CANDIDATE_IPS+=("$GATEWAY_IP")
  CANDIDATE_IPS+=("192.168.3.90" "192.168.3.85" "100.84.124.71" "100.118.232.61" "100.101.22.109")

  FOUND=0
  for u in "${CANDIDATE_USERS[@]}"; do
    for ip in "${CANDIDATE_IPS[@]}"; do
      if ssh -o StrictHostKeyChecking=no -o ConnectTimeout=1 -o BatchMode=yes -i "$SSH_KEY" "$u@$ip" "true" 2>/dev/null; then
        HOST_USER="$u"
        TARGET_HOST="$ip"
        FOUND=1
        break 2
      fi
    done
  done

  if [[ $FOUND -eq 0 ]]; then
    # Fallback default
    HOST_USER="${HOST_USER:-mac}"
    TARGET_HOST="${TARGET_HOST:-192.168.3.90}"
  fi
fi

# 2. Check host OS type
HOST_OS="linux"
if [[ "$HOST_USER" == "mac" ]] || [[ "$TARGET_HOST" == "192.168.3.90" ]] || [[ "$TARGET_HOST" == "192.168.3.85" ]]; then
  HOST_OS="darwin"
fi

# 3. Map working directory
CONTAINER_CWD="$(pwd)"
if [[ "$CONTAINER_CWD" =~ ^/host-workspace(/.*)?$ ]]; then
  SUB_PATH="${BASH_REMATCH[1]:-}"
  if [[ "$HOST_OS" == "darwin" ]]; then
    HOST_CWD="/Users/${HOST_USER}/workspace${SUB_PATH}"
  else
    HOST_CWD="/home/${HOST_USER}/workspace${SUB_PATH}"
  fi
else
  if [[ "$HOST_OS" == "darwin" ]]; then
    HOST_CWD="${HOST_WORKSPACE:-/Users/${HOST_USER}/workspace}"
  else
    HOST_CWD="${HOST_WORKSPACE:-/home/${HOST_USER}/workspace}"
  fi
fi

# 4. Prepare host environment PATH
if [[ "$HOST_OS" == "darwin" ]]; then
  RAW_SCRIPT="export ANDROID_HOME=/Users/mac/android-sdk; export PATH=\"/Users/mac/android-sdk/platform-tools:/Users/mac/android-sdk/emulator:/opt/homebrew/Cellar/node@24/24.20.0/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:\$PATH\"; cd \"$HOST_CWD\" 2>/dev/null || true; $*"
else
  RAW_SCRIPT="export PATH=\"/usr/local/cuda/bin:/usr/local/bin:/usr/bin:/bin:\$HOME/.local/bin:\$PATH\"; cd \"$HOST_CWD\" 2>/dev/null || true; $*"
fi

B64_SCRIPT="$(printf '%s' "$RAW_SCRIPT" | base64 | tr -d '\r\n')"

exec ssh -o StrictHostKeyChecking=no \
  -o UserKnownHostsFile=/dev/null \
  -o LogLevel=ERROR \
  -o BatchMode=yes \
  -o ConnectTimeout=5 \
  -o ServerAliveInterval=15 \
  -o ServerAliveCountMax=2 \
  -o ControlMaster=auto \
  -o ControlPath=/tmp/ssh-cm-%r@%h:%p \
  -o ControlPersist=10m \
  -i "$SSH_KEY" \
  "$HOST_USER@$TARGET_HOST" \
  "echo $B64_SCRIPT | base64 -d | bash"
