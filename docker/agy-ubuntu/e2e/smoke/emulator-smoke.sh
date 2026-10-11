#!/usr/bin/env bash
# emulator-smoke.sh — 调 adb-status.sh 验证 emulator 状态,失败则 exit 1
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

adb-status.sh

EMU="$(adb devices 2>/dev/null | awk '/emulator-/{print $1; exit}')"
if [ -z "$EMU" ]; then
    echo "[smoke.emu] ❌ 无 emulator,跑 start-emulator.sh"
    exit 1
fi

BOOTED="$(adb -s "$EMU" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r\n' || echo '')"
if [ "$BOOTED" != "1" ]; then
    echo "[smoke.emu] ❌ boot_completed=${BOOTED:-?}(应为 1)"
    exit 1
fi

echo "[smoke.emu] ✅ emulator ${EMU} boot 完成"