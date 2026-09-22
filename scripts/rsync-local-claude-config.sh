#!/usr/bin/env bash
# scripts/rsync-local-claude-config.sh [remote-host]
#
# 把本机 ~/.claude/ 的**配置**同步到生产，让生产上的 Claude Code（claude_local
# adapter）能用本机同一套 provider 配置 —— 关键是 settings.json 里的
# ANTHROPIC_BASE_URL / ANTHROPIC_MODEL / ANTHROPIC_AUTH_TOKEN（本机走 MiniMax-M3）。
#
# 同步：settings*.json / CLAUDE.md / plugins / skills / agents 等配置与扩展。
# 不同步（私密 + 大）：cache / history.jsonl / projects / paste-cache / plans。
# 不加 --delete：远端已有的文件不被本机删掉。
#
# 环境变量：
#   COOLIE_CLAW_HOST   目标主机        (默认: tc-coolie-claw)
#   LOCAL_CLAUDE_DIR   本机源目录      (默认: $HOME/.claude)
set -euo pipefail

LOCAL_CLAUDE="${LOCAL_CLAUDE_DIR:-$HOME/.claude}"
REMOTE="${1:-${COOLIE_CLAW_HOST:-tc-coolie-claw}}"

command -v rsync >/dev/null || { echo "失败: 需要 rsync" >&2; exit 1; }

if [[ ! -d "$LOCAL_CLAUDE" ]]; then
  echo "[rsync] 本机没有 $LOCAL_CLAUDE，跳过"
  exit 0
fi

echo "========================================================"
echo " 本机 Claude 配置 → 生产"
echo " 源:   $LOCAL_CLAUDE/"
echo " 目标: $REMOTE:~/.claude/"
echo " 排除: cache / history.jsonl / projects / paste-cache / plans"
echo "========================================================"

# 尾部斜杠很重要：同步目录内容到远端 ~/.claude/，而不是把 .claude 塞进去。
rsync -avz \
  --exclude='cache' \
  --exclude='history.jsonl' \
  --exclude='projects' \
  --exclude='paste-cache' \
  --exclude='plans' \
  "$LOCAL_CLAUDE/" \
  "$REMOTE:.claude/"

echo ""
echo "=== 验证：远端 settings.json 前三行 ==="
ssh "$REMOTE" 'cat ~/.claude/settings.json 2>&1 | head -3'

echo ""
echo "✅ DONE: ~/.claude/ 已同步到 $REMOTE"
