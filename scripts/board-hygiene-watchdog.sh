#!/usr/bin/env bash
# scripts/board-hygiene-watchdog.sh
# 
# 看板任务质量审计守护看门狗封装
# 支持手动单次检查 (--audit)、注册到系统 cron (--register)、以及守护监控

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

ACTION="${1:---audit}"

case "$ACTION" in
  --audit|audit)
    if [[ -x "$SCRIPT_DIR/host-exec.sh" ]]; then
      exec "$SCRIPT_DIR/host-exec.sh" "node /Users/mac/workspace/xaicd/coolie/scripts/board-hygiene-watchdog.mjs"
    else
      exec node "$SCRIPT_DIR/board-hygiene-watchdog.mjs"
    fi
    ;;

  --register|register)
    CRON_LINE="*/30 * * * * bash /Users/mac/workspace/xaicd/coolie/scripts/board-hygiene-watchdog.sh --audit >/dev/null 2>&1 # wave286-board-watchdog"
    echo "正在将看板审计看门狗注册到 Mac 宿主机 crontab..."
    if [[ -x "$SCRIPT_DIR/host-exec.sh" ]]; then
      "$SCRIPT_DIR/host-exec.sh" "(crontab -l 2>/dev/null | grep -v 'wave286-board-watchdog' ; echo '$CRON_LINE') | crontab -"
    else
      (crontab -l 2>/dev/null | grep -v 'wave286-board-watchdog' ; echo "$CRON_LINE") | crontab -
    fi
    echo "✅ 注册成功！看板看门狗将每 30 分钟常驻巡检，自动拦截空壳假任务！"
    ;;

  *)
    echo "用法: scripts/board-hygiene-watchdog.sh [--audit | --register]"
    exit 1
    ;;
esac
