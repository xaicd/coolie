#!/bin/bash
# ==============================================================================
# Hermes acpx 派工封装 — 全双工 Agent Client Protocol (ACPX) 协议驱动器
# 老板拍板: "Hermes 把 acpx 用起来，殊途同归"
# 
# 职责:
# 1. 跨宿主机自适应 (Mac / Linux aja-pc / cwall / Docker 容器) 自动探测 acpx
# 2. 自动探寻 Node 22+ 运行时与 GLM / Claude 凭据
# 3. 驱动 5+1 角色数字员工 (墨斗/铁匠/门神/兜底渊/百晓生/Hermes)
# 4. 支持可选的 --issue 参数，自动与 Coolie 控制面工单双向并轨
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 1. 自动寻找与优选 Node.js (优先支持 Node 22+)
NODE_BIN=""
for n in "$HOME/.hermes/node/bin/node" "$HOME/.local/bin/node" "/opt/homebrew/bin/node" "$HOME/.nvm/versions/node/v24.18.1/bin/node" "$(which node 2>/dev/null || echo "")"; do
  if [ -n "$n" ] && [ -x "$n" ]; then
    ver="$("$n" -v 2>/dev/null || echo "")"
    major="$(echo "$ver" | sed -E 's/v([0-9]+).*/\1/' || echo "0")"
    if [ "$major" -ge 22 ]; then
      NODE_BIN="$n"
      break
    fi
  fi
done
if [ -n "$NODE_BIN" ]; then
  export PATH="$(dirname "$NODE_BIN"):$HOME/.local/bin:$HOME/.npm-global/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"
else
  export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"
fi

# 2. 跨平台自适应探测 acpx 可执行文件
ACPX=""
for candidate in \
  "$COOLIE_DEV_ACPX" \
  "$(command -v acpx 2>/dev/null || echo '')" \
  "$HOME/.coolie-dev/lib/server/node_modules/.bin/acpx" \
  "$SCRIPT_DIR/../packages/adapter-utils/node_modules/.bin/acpx" \
  "$SCRIPT_DIR/../server/node_modules/.bin/acpx" \
  "/opt/homebrew/lib/node_modules/paperclipai/node_modules/@paperclipai/adapter-utils/node_modules/.bin/acpx"; do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then
    ACPX="$candidate"
    break
  fi
done

if [ -z "$ACPX" ]; then
  echo "❌ 未找到 acpx 可执行文件，请检查当前环境是否已安装 @agentclientprotocol/acpx" >&2
  exit 1
fi

DEFAULT_CWD="$(pwd)"
DEFAULT_TIMEOUT=300  # 5 分钟
DEFAULT_MODEL="claude-glm"

usage() {
  cat <<'EOF'
用法: bash hermes-acpx-dispatch.sh --agent <name> --prompt <text> [options]

必填:
  --agent <name>        员工名: modou-fda / tiejiang / tiejiang-2 / menshen / duidiyuan / baixiaosheng / hermes
  --prompt <text>       派工指令 (≤ 4000 字)

可选:
  --cwd <dir>           工作目录 (默认: 当前目录)
  --session <name>      命名 session (默认: cwd名-agent名)
  --engine <name>       引擎: claude / gemini / codex / cursor / copilot (默认 claude)
  --timeout <sec>       超时秒数 (默认 300)
  --approve-all         自动批准所有权限 (默认开启，保障无感自主闭环)
  --issue <id|key>      关联 Coolie 工单编号 (如 WEN-5，用于自动写回进展与凭证)
  --quiet               quiet 格式输出
  --json                json 格式输出

真实调用示例:
  bash hermes-acpx-dispatch.sh --agent tiejiang --prompt "修复文旅 live 详情页 400 报错" --approve-all
  bash hermes-acpx-dispatch.sh --agent menshen --prompt "执行四态真机快照测试" --issue WEN-5
EOF
  exit "${1:-1}"
}

# 默认值
AGENT=""
PROMPT=""
CWD="$DEFAULT_CWD"
SESSION=""
ENGINE="claude"
TIMEOUT="$DEFAULT_TIMEOUT"
APPROVE_ALL="--approve-all"
ISSUE_REF=""
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
    --issue) ISSUE_REF="$2"; shift 2 ;;
    --quiet) FORMAT="quiet"; shift ;;
    --json) FORMAT="json"; shift ;;
    -h|--help) usage 0 ;;
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

# 3. 动态继承与解析凭据 (智谱 GLM 反向代理及本地 Claude 配置)
export ANTHROPIC_BASE_URL="${ANTHROPIC_BASE_URL:-https://open.bigmodel.cn/api/anthropic}"
if [ -z "$ANTHROPIC_AUTH_TOKEN" ]; then
  if [ -n "$ANTHROPIC_API_KEY" ]; then
    export ANTHROPIC_AUTH_TOKEN="$ANTHROPIC_API_KEY"
  elif [ -n "$GLM_API_KEY" ]; then
    export ANTHROPIC_AUTH_TOKEN="$GLM_API_KEY"
  elif [ -f "$HOME/.hermes/.env" ]; then
    token="$(grep -E "^(ANTHROPIC_API_KEY|GLM_API_KEY)=" "$HOME/.hermes/.env" 2>/dev/null | head -n 1 | cut -d '=' -f2- | tr -d ' "\r')"
    [ -n "$token" ] && export ANTHROPIC_AUTH_TOKEN="$token"
  elif [ -f "$HOME/.coolie-dev/env" ]; then
    token="$(grep -E "^(ANTHROPIC_AUTH_TOKEN|ANTHROPIC_API_KEY|GLM_API_KEY)=" "$HOME/.coolie-dev/env" 2>/dev/null | head -n 1 | cut -d '=' -f2- | tr -d ' "\r')"
    [ -n "$token" ] && export ANTHROPIC_AUTH_TOKEN="$token"
  elif [ -f "$HOME/.claude/settings.jsonglm" ]; then
    token="$(grep -E '"ANTHROPIC_AUTH_TOKEN":' "$HOME/.claude/settings.jsonglm" 2>/dev/null | head -n 1 | cut -d ':' -f2- | tr -d ' ",\r')"
    [ -n "$token" ] && export ANTHROPIC_AUTH_TOKEN="$token"
  elif [ -f "$HOME/.claude/settings.json" ]; then
    token="$(grep -E '"ANTHROPIC_AUTH_TOKEN":' "$HOME/.claude/settings.json" 2>/dev/null | head -n 1 | cut -d ':' -f2- | tr -d ' ",\r')"
    [ -n "$token" ] && export ANTHROPIC_AUTH_TOKEN="$token"
  elif command -v security >/dev/null 2>&1; then
    token="$(security find-generic-password -s 'paperclip-zhipu-glm' -w 2>/dev/null || echo '')"
    [ -n "$token" ] && export ANTHROPIC_AUTH_TOKEN="$token"
  fi
fi

# 4. 角色与引擎自适应路由 (自动对齐 7 工具池中的 ACP 支持)
CUSTOM_AGENT_CMD=""
if [[ "$ENGINE" == "auto" || "$ENGINE" == "claude" ]]; then
  if [[ "$AGENT" =~ (modou|fda) ]]; then
    # 墨斗默认走 agy (Antigravity)
    ADAPTER_SH="$SCRIPT_DIR/adapters/docker-agy-acp.sh"
    [ ! -f "$ADAPTER_SH" ] && ADAPTER_SH="$(dirname "$SCRIPT_DIR")/scripts/adapters/docker-agy-acp.sh"
    if [ -x "$ADAPTER_SH" ]; then
      CUSTOM_AGENT_CMD="$ADAPTER_SH"
      ENGINE="agy"
    fi
  elif command -v cmd >/dev/null 2>&1; then
    # 宿主机存在 cmd 且支持原生 ACP (cmd acp)，优先走 cmd 免去 Anthropic model catalog 校验死锁
    CUSTOM_AGENT_CMD="cmd acp"
    ENGINE="cmd"
  fi
elif [[ "$ENGINE" == "cmd" ]]; then
  CUSTOM_AGENT_CMD="cmd acp"
elif [[ "$ENGINE" == "agy" ]]; then
  ADAPTER_SH="$SCRIPT_DIR/adapters/docker-agy-acp.sh"
  [ ! -f "$ADAPTER_SH" ] && ADAPTER_SH="$(dirname "$SCRIPT_DIR")/scripts/adapters/docker-agy-acp.sh"
  CUSTOM_AGENT_CMD="$ADAPTER_SH"
fi

echo "=== Hermes ACPX 全双工协议派工 ===" 
echo "  AGENT       = $AGENT"
echo "  ENGINE      = $ENGINE ${CUSTOM_AGENT_CMD:+(via: $CUSTOM_AGENT_CMD)}"
echo "  SESSION     = $SESSION"
echo "  ACPX_BIN    = $ACPX"
echo "  CWD         = $CWD"
echo "  TIMEOUT     = ${TIMEOUT}s"
echo "  APPROVE_ALL = ${APPROVE_ALL:-off}"
echo "  ISSUE       = ${ISSUE_REF:-无}"
echo "  PROMPT      = ${PROMPT:0:80}..."

cd "$CWD" || exit 1

# 若指定了工单，通过 local Coolie API 登记开工事件
COOLIE_API="${COOLIE_API_URL:-http://127.0.0.1:3100/api}"
log_issue_comment() {
  local comment="$1"
  if [ -n "$ISSUE_REF" ]; then
    curl -s -X POST "$COOLIE_API/issues/$ISSUE_REF/comments" \
      -H "Content-Type: application/json" \
      -d "{\"body\": \"$comment\"}" >/dev/null 2>&1 || true
  fi
}

log_issue_comment "🚀 [Hermes ACPX 派工] 员工「$AGENT」已就绪，正在通过全双工 ACPX 引擎 ($ENGINE) 执行指令：$PROMPT"

# 5. 执行 ACPX
set +e
if [ -n "$CUSTOM_AGENT_CMD" ]; then
  "$ACPX" \
    $APPROVE_ALL \
    --auth-policy skip \
    --format "$FORMAT" \
    --timeout "$TIMEOUT" \
    --agent "$CUSTOM_AGENT_CMD" \
    exec "$PROMPT"
  EXIT_CODE=$?
else
  # 确保 ACPX 会话存在 (自动创建或复用)
  "$ACPX" "$ENGINE" sessions ensure --name "$SESSION" >/dev/null 2>&1 || true

  "$ACPX" \
    $APPROVE_ALL \
    --auth-policy skip \
    --format "$FORMAT" \
    --max-turns 9999 \
    --timeout "$TIMEOUT" \
    --append-system-prompt "你是 Coolie 工坊全自主数字员工「$AGENT」。Hermes 掌柜派工如下。请遵循 CMMI 0-1 软件工程资产规范直接执行，不调外部 Agent 工具，不派 sub-agent。完成后报送 commit 与改动摘要。" \
    "$ENGINE" \
    -s "$SESSION" \
    prompt "$PROMPT"
  EXIT_CODE=$?
fi
set -e

if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ ACPX 派工执行成功"
  log_issue_comment "✅ [Hermes ACPX 派工完成] 员工「$AGENT」已顺利完成任务指令，详情请查验工作区物理资产与 Git 提交。"
else
  echo "⚠️ ACPX 派工执行退出异常 (exit $EXIT_CODE)"
  log_issue_comment "⚠️ [Hermes ACPX 派工警告] 员工「$AGENT」执行中遇到异常退出 (exit code: $EXIT_CODE)。"
fi

exit $EXIT_CODE
