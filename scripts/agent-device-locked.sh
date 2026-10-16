#!/usr/bin/env bash
# scripts/agent-device-locked.sh
#
# Driver wrapper for `agent-device`: run any command under the shared device
# claim lock so two digital employees never drive emulator-5554 at the same time
# (COOA-232).
#
# It delegates to `scripts/device-claim.sh run`, which acquires the lock before
# the wrapped command starts and releases it when the command exits — including
# non-zero exits and SIGINT/SIGTERM. Because the lock has a TTL (default 15 min),
# a driver that is SIGKILLed cannot wedge the device.
#
# Usage:
#   scripts/agent-device-locked.sh [--device <serial>] [--ttl <sec>] [--wait <sec>] -- <command...>
#
# Typical call from the container (device lives on the Mac host):
#   scripts/agent-device-locked.sh -- host-exec "agent-device open --appId com.x"
#   scripts/agent-device-locked.sh -- host-exec "agent-device screenshot --output /tmp/s.png"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/device-claim.sh" run "$@"
