#!/usr/bin/env bash
# scripts/coolie-task-runner-bridge.sh
# 
# 启动与管理 Coolie Task Runner Bridge (工单执行桥接器)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

ACTION="${1:---start}"

case "$ACTION" in
  --start|start)
    echo "正在宿主机启动 Coolie Task Runner Bridge..."
    if [[ -x "$SCRIPT_DIR/host-exec.sh" ]]; then
      "$SCRIPT_DIR/host-exec.sh" "nohup node /Users/mac/workspace/xaicd/coolie/scripts/coolie-task-runner-bridge.mjs > /Users/mac/workspace/xaicd/coolie/.coolie-local/logs/runner-bridge.log 2>&1 & echo \$! > /Users/mac/workspace/xaicd/coolie/.coolie-local/runner-bridge.pid"
    else
      nohup node "$SCRIPT_DIR/coolie-task-runner-bridge.mjs" > "$REPO_ROOT/.coolie-local/logs/runner-bridge.log" 2>&1 &
      echo $! > "$REPO_ROOT/.coolie-local/runner-bridge.pid"
    fi
    echo "✅ Coolie Task Runner Bridge 已在宿主机后台常驻启动！"
    ;;

  --check|check)
    if [[ -x "$SCRIPT_DIR/host-exec.sh" ]]; then
      "$SCRIPT_DIR/host-exec.sh" "pgrep -f 'coolie-task-runner-bridge.mjs' >/dev/null 2>&1"
    else
      pgrep -f 'coolie-task-runner-bridge.mjs' >/dev/null 2>&1
    fi
    ;;

  --status|status)
    if [[ -x "$SCRIPT_DIR/host-exec.sh" ]]; then
      "$SCRIPT_DIR/host-exec.sh" "ps aux | grep -E 'coolie-task-runner-bridge' | grep -v grep" || echo "未在运行"
    else
      ps aux | grep -E 'coolie-task-runner-bridge' | grep -v grep || echo "未在运行"
    fi
    ;;

  --stop|stop)
    if [[ -x "$SCRIPT_DIR/host-exec.sh" ]]; then
      "$SCRIPT_DIR/host-exec.sh" "pkill -f 'coolie-task-runner-bridge' || true"
    else
      pkill -f 'coolie-task-runner-bridge' || true
    fi
    echo "✅ 已停止 Runner Bridge"
    ;;

  *)
    echo "用法: scripts/coolie-task-runner-bridge.sh [--start | --status | --stop]"
    exit 1
    ;;
esac
