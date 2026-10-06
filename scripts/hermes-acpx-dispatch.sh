#!/bin/bash
# Hermes acpx 派工封装 — 用 acpx 替代裸 claude
# 老板 2026-10-06 拍板: "Hermes 把 acpx 用起来"

set -e

ACPX="/opt/homebrew/lib/node_modules/paperclipai/node_modules/@paperclipai/adapter-utils/node_modules/.bin/acpx"
DEFAULT_CWD="/Users/mac/workspace/xaicd/coolie"
DEFAULT_TIMEOUT=300  # 5 分钟
DEFAULT_MODEL="claude-glm"

usage() {
  cat <<'EOF'
用法: bash hermes-acpx-dispatch.sh --agent <name> --prompt <text> [options]

必填:
  --agent <name>        员工名: modou-fda / tiejiang / tiejiang-2 / menshen / duidiyuan / baixiaosheng / hermes
  --prompt <text>       派工指令 (≤ 4000 字)

可选:
  --cwd <dir>           工作目录 (默认: ~/workspace/xaicd/coolie)
  --session <name>      命名 session (默认: cwd 名)
  --engine <name>       引擎: claude / gemini / codex / cursor / copilot (默认 claude)
  --timeout <sec>       超时秒数 (默认 300)
  --approve-all         自动批准所有权限
  --quiet               quiet 格式输出
  --json                json 格式输出

真实调用:
  bash hermes-acpx-dispatch.sh --agent tiejiang --prompt "修 bug" --approve-all
EOF
  exit 1
}

# 默认值
AGENT=""
PROMPT=""
CWD="$DEFAULT_CWD"
SESSION=""
ENGINE="claude"
TIMEOUT="$DEFAULT_TIMEOUT"
APPROVE_ALL=""
FORMAT="text"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --agent) AGENT="$2"; shift 2 ;;
    --prompt|-p) PROMPT="$2"; shift 2 ;;
    --cwd) CWD="$2"; shift 2 ;;
    --session|-s) SESSION="$2"; shift 2 ;;
    --engine) ENGINE="$2"; shift 2 ;;
    --timeout) TIMEOUT="$2"; shift 2 ;;
    --approve-all) APPROVE_ALL="--approve-all"; shift ;;
    --quiet) FORMAT="quiet"; shift ;;
    --json) FORMAT="json"; shift ;;
    -h|--help) usage ;;
    *) echo "未知参数: $1"; usage ;;
  esac
done

if [[ -z "$AGENT" || -z "$PROMPT" ]]; then
  echo "❌ --agent 和 --prompt 必填"
  usage
fi

if [[ -z "$SESSION" ]]; then
  SESSION="$(basename "$CWD")-$AGENT"
fi

echo "===Hermes acpx 派工===" 
echo "  AGENT=$AGENT  ENGINE=$ENGINE  SESSION=$SESSION  CWD=$CWD"
echo "  TIMEOUT=${TIMEOUT}s  APPROVE_ALL=${APPROVE_ALL:-off}  FORMAT=$FORMAT"
echo "  PROMPT=${PROMPT:0:80}..."

cd "$CWD" || exit 1

# 继承 claude 凭据 (智谱 GLM 反向代理)
export ANTHROPIC_BASE_URL="${ANTHROPIC_BASE_URL:-https://open.bigmodel.cn/api/anthropic}"
export ANTHROPIC_AUTH_TOKEN="${ANTHROPIC_AUTH_TOKEN:-$(security find-generic-password -s 'paperclip-zhipu-glm' -w 2>/dev/null || echo '')}"

# 真调 acpx
exec "$ACPX" \
  $APPROVE_ALL \
  --auth-policy skip \
  --format "$FORMAT" \
  --max-turns 9999 \
  --timeout "$TIMEOUT" \
  --append-system-prompt "你是 Coolie 工坊员工「$AGENT」。Hermes 掌柜派工如下。请直接执行, 不调 Agent 工具, 不派 sub-agent。完成后报 commit。" \
  "$ENGINE" \
  -s "$SESSION" \
  prompt "$PROMPT"
