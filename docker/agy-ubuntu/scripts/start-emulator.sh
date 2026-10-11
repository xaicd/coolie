#!/usr/bin/env bash
#==============================================================================
# start-emulator.sh — 创建 AVD(若不存在)+ 启动 + 轮询 sys.boot_completed
#
#   用法: start-emulator.sh                   # 用默认 AVD_NAME / API 级别
#         start-emulator.sh --no-window       # 已经在前台时再加参数
#         start-emulator.sh --wipe            # 重建 AVD(清除用户数据)
#
#   环境变量:
#     ANDROID_HOME    默认 /opt/android/sdk
#     AVD_NAME        默认 test30
#     ANDROID_API_LEVEL 默认 30
#     E2E_NO_ACCEL    1 = -accel off(WSL2 无 /dev/kvm 时降级)
#     E2E_SKIP_EMULATOR 1 = 直接退出(测试/CI 用)
#==============================================================================
set -euo pipefail

ANDROID_HOME="${ANDROID_HOME:-/opt/android/sdk}"
AVD_NAME="${AVD_NAME:-test30}"
ANDROID_API_LEVEL="${ANDROID_API_LEVEL:-30}"
E2E_SKIP_EMULATOR="${E2E_SKIP_EMULATOR:-0}"
E2E_NO_ACCEL="${E2E_NO_ACCEL:-0}"

if [ "$E2E_SKIP_EMULATOR" = "1" ]; then
    echo "[emulator] E2E_SKIP_EMULATOR=1,跳过启动"
    exit 0
fi

WIPE=0
NO_WINDOW=1
for arg in "$@"; do
    case "$arg" in
        --wipe) WIPE=1 ;;
        --no-window) NO_WINDOW=1 ;;
        --window)  NO_WINDOW=0 ;;
        *) echo "[emulator] unknown arg: $arg" >&2 ;;
    esac
done

export ANDROID_HOME
export PATH="${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools:${ANDROID_HOME}/emulator:${PATH}"

# 1. 若 AVD 不存在则创建(需要 system-image 已装)
if ! avdmanager list avd 2>/dev/null | grep -q "Name: ${AVD_NAME}"; then
    echo "[emulator] 创建 AVD '${AVD_NAME}' (API ${ANDROID_API_LEVEL})..."
    echo "no" | avdmanager create avd \
        --name "${AVD_NAME}" \
        --package "system-images;android-${ANDROID_API_LEVEL};google_apis;x86_64" \
        --device "pixel_5" \
        --force
fi

# 2. 检测 KVM
ACCEL_FLAG="-accel auto"
if [ "$E2E_NO_ACCEL" = "1" ] || [ ! -e /dev/kvm ]; then
    if [ ! -e /dev/kvm ]; then
        echo "[emulator] ⚠ /dev/kvm 不可用 → 强制软件模式(emulator 会非常慢)"
    fi
    ACCEL_FLAG="-accel off"
fi

# 3. 启动参数
EMU_FLAGS=(
    -avd "${AVD_NAME}"
    -no-boot-anim
    -no-snapshot
    -no-audio
    -gpu swiftshader_indirect
    -read-only
    ${ACCEL_FLAG}
)
[ "$NO_WINDOW" = "1" ] && EMU_FLAGS+=(-no-window)

# 4. wipe 模式:删数据
if [ "$WIPE" = "1" ]; then
    EMU_FLAGS+=(-wipe-data)
fi

# 5. 检查是否已有 emulator 在跑
if adb devices 2>/dev/null | grep -q "emulator-"; then
    echo "[emulator] 已有 emulator 在运行:"
    adb devices
    exit 0
fi

# 6. 后台启动 emulator
echo "[emulator] 启动 ${AVD_NAME} (flags: ${EMU_FLAGS[*]})..."
nohup emulator "${EMU_FLAGS[@]}" > /root/emulator.log 2>&1 &
EMU_PID=$!
echo "[emulator] PID=${EMU_PID},日志 /root/emulator.log"

# 7. 轮询 adb devices + sys.boot_completed
echo "[emulator] 等待 emulator 出现在 adb..."
for i in $(seq 1 60); do
    if adb devices 2>/dev/null | grep -q "emulator-.*device$"; then
        break
    fi
    sleep 2
done

echo "[emulator] 等待 sys.boot_completed=1(首次冷启动可能要 3-10 分钟)..."
DEADLINE=$((SECONDS + 900))  # 15 分钟硬超时
while [ $SECONDS -lt $DEADLINE ]; do
    BOOTED="$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r\n' || true)"
    if [ "$BOOTED" = "1" ]; then
        echo "[emulator] ✅ boot 完成"
        adb shell input keyevent KEYCODE_HOME >/dev/null 2>&1 || true
        exit 0
    fi
    sleep 5
done

echo "[emulator] ❌ 15 分钟内未完成 boot;查看 /root/emulator.log 诊断" >&2
exit 1