#!/usr/bin/env bash
# ==============================================================================
# agy - 宿主机透明代理执行器 (通过 agy-ubuntu-container 容器无缝运行 Antigravity)
# 
# 智能动态识别宿主机当前路径与容器 Mounts 挂载映射，绝不篡改容器挂载结构。
# 支持平台: Linux (aja-pc, cwall) / macOS (mac)
# ==============================================================================
set -euo pipefail

CONTAINER_NAME="agy-ubuntu-container"

# 1. 检查容器是否存在
if ! docker inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
    echo "[错误] 容器 $CONTAINER_NAME 未找到，请确认容器名称正确且已创建。" >&2
    exit 1
fi

# 2. 如果容器停止了，自动拉起
STATUS=$(docker inspect -f '{{.State.Status}}' "$CONTAINER_NAME" 2>/dev/null || true)
if [ "$STATUS" != "running" ]; then
    echo "[提示] 正在启动 $CONTAINER_NAME 容器..." >&2
    docker start "$CONTAINER_NAME" >/dev/null
    sleep 2
fi

# 3. 智能计算当前工作目录在容器内的对应路径
HOST_CWD="$(pwd)"
CONTAINER_CWD="/root/workspace"

# 3.1 优先快速匹配标准的 agy-ubuntu/workspace 挂载 (aja-pc, cwall 等主机标准目录)
if [[ "$HOST_CWD" =~ /agy-ubuntu/workspace(/.*)?$ ]]; then
    CONTAINER_CWD="/root/workspace${BASH_REMATCH[1]:-}"
# 3.2 匹配 Mac 宿主机直挂目录 (若存在 /host-workspace)
elif [[ "$HOST_CWD" =~ ^$HOME/workspace(/.*)?$ ]] && docker exec "$CONTAINER_NAME" test -d /host-workspace 2>/dev/null; then
    CONTAINER_CWD="/host-workspace${BASH_REMATCH[1]:-}"
# 3.3 动态解析容器自身的实际挂载列表 (完全自适应宿主机自定义挂载)
else
    MATCHED=$(docker inspect "$CONTAINER_NAME" --format '{{range .Mounts}}{{if eq .Type "bind"}}{{.Source}}|{{.Destination}}{{"\n"}}{{end}}{{end}}' 2>/dev/null | while IFS='|' read -r src dst; do
        if [[ -n "$src" && ( "$HOST_CWD" == "$src" || "$HOST_CWD" == "$src"/* ) ]]; then
            REL="${HOST_CWD#$src}"
            echo "${dst}${REL}"
            break
        fi
    done)
    if [ -n "$MATCHED" ]; then
        CONTAINER_CWD="$MATCHED"
    fi
fi

# 4. 判断终端交互性 (TTY)
EXEC_FLAGS="-i"
if [ -t 0 ] && [ -t 1 ]; then
    EXEC_FLAGS="-it"
fi

# 5. 执行容器内 agy (显式保持 UTF-8 环境)
exec docker exec $EXEC_FLAGS \
    -e LANG=C.UTF-8 \
    -e LC_ALL=C.UTF-8 \
    -w "$CONTAINER_CWD" \
    "$CONTAINER_NAME" \
    agy "$@"
