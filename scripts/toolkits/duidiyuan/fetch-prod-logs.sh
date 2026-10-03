#!/usr/bin/env bash
# [兑底渊 PRE-SRE 专属] 生产服务日志即时流式查看
# 用法: ./fetch-prod-logs.sh [coolie|caddy|postgresql] [行数(默认100)]
set -euo pipefail

SERVICE="${1:-coolie}"
LINES="${2:-100}"
SSH_TARGET="tc-coolie-claw"

echo "🔍 正在从 $SSH_TARGET 拉取 [$SERVICE] 最近 $LINES 行生产日志..."
ssh -t "$SSH_TARGET" "journalctl -u $SERVICE -n $LINES --no-pager"
