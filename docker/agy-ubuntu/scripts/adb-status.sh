#!/usr/bin/env bash
#==============================================================================
# adb-status.sh — 一次性显示 emulator 状态
#
#   输出:devices / android version / ABI / boot_completed / launcher-ready
#==============================================================================
set -euo pipefail

export PATH="${ANDROID_HOME:-/opt/android/sdk}/platform-tools:${PATH}"

echo "===== adb devices ====="
adb devices -l

EMU="$(adb devices 2>/dev/null | awk '/emulator-/{print $1; exit}')"
if [ -z "$EMU" ]; then
    echo "(无 emulator)"
    exit 0
fi

echo ""
echo "===== ${EMU} props ====="
for prop in ro.build.version.release ro.build.version.sdk ro.product.cpu.abi \
            sys.boot_completed init.svc.bootanim ro.product.model; do
    val="$(adb -s "$EMU" shell getprop "$prop" 2>/dev/null | tr -d '\r\n' || echo '?')"
    printf '  %-30s = %s\n' "$prop" "$val"
done

echo ""
echo "===== ${EMU} pm ready ====="
PKG_MGR="$(adb -s "$EMU" shell getprop init.svc.pm_service-ready 2>/dev/null | tr -d '\r\n' || echo '?')"
echo "  pm_service-ready = ${PKG_MGR}"