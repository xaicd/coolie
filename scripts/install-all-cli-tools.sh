#!/usr/bin/env bash
# ==============================================================================
# scripts/install-all-cli-tools.sh
#
# Coolie 7 工具池全生命周期一键安装与装配法典
# 一键安装与配置: Hermes, claude (claude-glm/claude-mm), cmd, copilot, agy 等 CLI 工具
# 
# 支持平台: macOS (Apple Silicon arm64) / Ubuntu & Debian (x86_64 / arm64)
# 
# 用法:
#   bash scripts/install-all-cli-tools.sh          # 全量安装、配置与健康探测 (默认)
#   bash scripts/install-all-cli-tools.sh --npm    # 仅安装/更新 npm CLI (claude, cmd, copilot)
#   bash scripts/install-all-cli-tools.sh --hermes # 仅安装/配置 Hermes Agent
#   bash scripts/install-all-cli-tools.sh --agy    # 仅部署 agy 容器方案与宿主机快捷命令
#   bash scripts/install-all-cli-tools.sh --mcp    # 仅注册全栈 MCP 扩展 (真机/浏览器/监控)
#   bash scripts/install-all-cli-tools.sh --check  # 仅执行 7 工具池健康探针巡检
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# 确保常用 PATH 在内
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$HOME/bin:$PATH"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
log_succ()    { echo -e "${GREEN}[OK]${NC} $*"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_err()     { echo -e "${RED}[ERROR]${NC} $*"; }
log_section() { echo -e "\n${BOLD}${BLUE}=== $* ===${NC}"; }

DO_NPM=1
DO_HERMES=1
DO_AGY=1
DO_MCP=1
DO_CHECK=1

if [[ $# -gt 0 ]]; then
  case "$1" in
    --npm)
      DO_NPM=1; DO_HERMES=0; DO_AGY=0; DO_MCP=0; DO_CHECK=1
      ;;
    --hermes)
      DO_NPM=0; DO_HERMES=1; DO_AGY=0; DO_MCP=0; DO_CHECK=1
      ;;
    --agy)
      DO_NPM=0; DO_HERMES=0; DO_AGY=1; DO_MCP=0; DO_CHECK=1
      ;;
    --mcp)
      DO_NPM=0; DO_HERMES=0; DO_AGY=0; DO_MCP=1; DO_CHECK=1
      ;;
    --check)
      DO_NPM=0; DO_HERMES=0; DO_AGY=0; DO_MCP=0; DO_CHECK=1
      ;;
    --all)
      DO_NPM=1; DO_HERMES=1; DO_AGY=1; DO_MCP=1; DO_CHECK=1
      ;;
    -h|--help)
      echo "用法: $0 [--all | --npm | --hermes | --agy | --mcp | --check]"
      exit 0
      ;;
    *)
      log_warn "未知参数: $1，默认执行全量安装"
      ;;
  esac
fi

# ------------------------------------------------------------------------------
# 0. 系统与架构底座探针
# ------------------------------------------------------------------------------
log_section "0. 系统与运行底座探针"
OS="$(uname -s)"
ARCH="$(uname -m)"
log_info "检测到操作系统: $OS, 硬件架构: $ARCH"

mkdir -p "$HOME/.local/bin"

# 检查 Node.js / npm
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  log_err "未检测到 Node.js / npm，请先安装 Node 18+ 后重试！"
  exit 1
fi
log_succ "Node.js 环境: $(node -v), npm: $(npm -v)"

# ------------------------------------------------------------------------------
# 1. npm 全局 CLI 工具池安装 (claude, cmd, copilot)
# ------------------------------------------------------------------------------
if [[ "$DO_NPM" -eq 1 ]]; then
  log_section "1. 安装/更新 npm 全局 CLI 工具池 (@anthropic-ai/claude-code, command-code, @github/copilot)"

  install_npm_global() {
    local pkg="$1"
    local bin_name="$2"
    log_info "检查 $bin_name ($pkg)..."
    if command -v "$bin_name" >/dev/null 2>&1; then
      log_succ "$bin_name 已就绪: $(command -v "$bin_name")"
    else
      log_info "正在全局安装 $pkg..."
      if npm install -g "$pkg"; then
        log_succ "$pkg 安装成功"
      elif command -v sudo >/dev/null 2>&1; then
        log_warn "普通权限安装受限，尝试 sudo npm install -g $pkg..."
        sudo npm install -g "$pkg" || log_err "$pkg 安装失败，请手动执行: sudo npm install -g $pkg"
      else
        log_err "$pkg 安装失败，请检查 npm 全局安装权限！"
      fi
    fi
  }

  install_npm_global "@anthropic-ai/claude-code" "claude"
  install_npm_global "command-code" "cmd"
  install_npm_global "@github/copilot" "copilot"

  # 初始化 Claude 宿主机配置模版 (settings.jsonglm, settings.jsonmm, settings.jsonds)
  CLAUDE_DIR="$HOME/.claude"
  mkdir -p "$CLAUDE_DIR"

  # GLM 配置
  if [[ ! -f "$CLAUDE_DIR/settings.jsonglm" ]]; then
    log_info "生成 $CLAUDE_DIR/settings.jsonglm 模版..."
    cat > "$CLAUDE_DIR/settings.jsonglm" << 'EOF'
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "f111499a79a6407eb9ebe2a89bfab50d.tzbjj1u9u3PF4BIi",
    "ANTHROPIC_BASE_URL": "https://open.bigmodel.cn/api/anthropic",
    "API_TIMEOUT_MS": "3000000",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": 1,
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "glm-5-turbo",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "glm-5",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "glm-5",
    "CLAUDE_CODE_AUTO_COMPACT_WINDOW": "1048576",
    "CLAUDE_CODE_SUBAGENT_MODEL": "glm-5",
    "CLAUDE_CODE_MAX_OUTPUT_TOKENS": "32000"
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "rtk hook claude"
          }
        ]
      }
    ]
  }
}
EOF
    log_succ "已创建 settings.jsonglm"
  fi

  # MiniMax 配置 (测试/百晓生首选)
  if [[ ! -f "$CLAUDE_DIR/settings.jsonmm" ]]; then
    log_info "生成 $CLAUDE_DIR/settings.jsonmm 模版..."
    cat > "$CLAUDE_DIR/settings.jsonmm" << 'EOF'
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "sk-cp-Cj_FyeuMZ-Xpc2O4-minimax-token-placeholder",
    "ANTHROPIC_BASE_URL": "https://api.minimaxi.com/anthropic",
    "ANTHROPIC_MODEL": "MiniMax-M3",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "MiniMax-M3",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "MiniMax-M3",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "MiniMax-M2.7",
    "CLAUDE_CODE_SUBAGENT_MODEL": "MiniMax-M3",
    "CLAUDE_CODE_MAX_OUTPUT_TOKENS": "32000",
    "CLAUDE_CODE_AUTO_COMPACT_WINDOW": "1048576",
    "API_TIMEOUT_MS": "3000000"
  },
  "permissions": {
    "allow": [],
    "deny": []
  },
  "alwaysThinkingEnabled": false,
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "rtk hook claude"
          }
        ]
      }
    ]
  }
}
EOF
    log_succ "已创建 settings.jsonmm"
  fi

  # 建立默认软链接
  if [[ ! -L "$CLAUDE_DIR/settings.json" && ! -f "$CLAUDE_DIR/settings.json" ]]; then
    log_info "建立 $CLAUDE_DIR/settings.json 软链接指向 settings.jsonmm..."
    ln -sf "$CLAUDE_DIR/settings.jsonmm" "$CLAUDE_DIR/settings.json"
    log_succ "Claude 默认配置软链接建立成功"
  fi
fi

# ------------------------------------------------------------------------------
# 2. Hermes 调度中枢安装与就绪
# ------------------------------------------------------------------------------
if [[ "$DO_HERMES" -eq 1 ]]; then
  log_section "2. 检查与配置 Hermes Agent 调度中枢"
  if command -v hermes >/dev/null 2>&1; then
    log_succ "Hermes CLI 已就绪: $(command -v hermes)"
  else
    log_info "未检测到全局 hermes 命令，准备环境..."
    HERMES_HOME="$HOME/.hermes/hermes-agent"
    mkdir -p "$HERMES_HOME"
    
    # 检查是否有 python3
    if command -v python3 >/dev/null 2>&1; then
      if [[ ! -f "$HERMES_HOME/venv/bin/python" ]]; then
        log_info "创建 Hermes Python 虚拟环境: $HERMES_HOME/venv..."
        python3 -m venv "$HERMES_HOME/venv" || log_warn "python3 -m venv 失败，请确保安装了 python3-venv"
      fi
      
      if [[ -f "$HERMES_HOME/venv/bin/python" ]]; then
        log_info "尝试安装 hermes-agent..."
        "$HERMES_HOME/venv/bin/pip" install --upgrade pip setuptools wheel >/dev/null 2>&1 || true
        "$HERMES_HOME/venv/bin/pip" install hermes-agent >/dev/null 2>&1 || true
      fi
    fi

    # 包装启动器脚本
    HERMES_BIN="$HOME/.local/bin/hermes"
    if [[ ! -f "$HERMES_BIN" ]]; then
      log_info "创建快捷启动器: $HERMES_BIN..."
      cat > "$HERMES_BIN" << 'EOF'
#!/usr/bin/env bash
unset PYTHONPATH
unset PYTHONHOME
if [ -f "$HOME/.hermes/hermes-agent/venv/bin/python" ] && [ -f "$HOME/.hermes/hermes-agent/hermes" ]; then
    exec "$HOME/.hermes/hermes-agent/venv/bin/python" "$HOME/.hermes/hermes-agent/hermes" "$@"
elif [ -f "$HOME/.hermes/hermes-agent/venv/bin/hermes" ]; then
    exec "$HOME/.hermes/hermes-agent/venv/bin/hermes" "$@"
else
    echo "[Hermes] Hermes agent 执行器已启动 (PID: $$), 参数: $@"
    if command -v claude >/dev/null 2>&1; then
        exec claude "$@"
    else
        echo "[Hermes 错误] 未找到可用 Hermes 运行时或 Claude 兜底" >&2
        exit 1
    fi
fi
EOF
      chmod +x "$HERMES_BIN"
      log_succ "Hermes 快捷启动器创建成功"
    fi

    # 尝试软链接到 /usr/local/bin
    if command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
      sudo cp "$HERMES_BIN" /usr/local/bin/hermes 2>/dev/null || true
    fi
  fi
fi

# ------------------------------------------------------------------------------
# 3. 一键部署与装配 agy 容器方案
# ------------------------------------------------------------------------------
if [[ "$DO_AGY" -eq 1 ]]; then
  log_section "3. 一键部署与装配 agy 容器方案 (Antigravity + Mihomo TUN 隔离沙盒)"
  AGY_TOOLCHAIN_DIR="$REPO_ROOT/docker/agy-ubuntu"
  
  if [[ ! -d "$AGY_TOOLCHAIN_DIR" ]]; then
    log_err "未找到 $AGY_TOOLCHAIN_DIR 目录！请检查代码仓库完整性。"
  else
    if command -v docker >/dev/null 2>&1; then
      log_info "调用 $AGY_TOOLCHAIN_DIR/scripts/setup-host-agy.sh 执行自动部署..."
      bash "$AGY_TOOLCHAIN_DIR/scripts/setup-host-agy.sh" || log_warn "setup-host-agy.sh 执行过程中有警告，请核对 Docker 状态"
    else
      log_warn "当前主机未检测到 Docker，跳过容器启动。已安装 agy 宿主机客户端代理模版。"
      mkdir -p "$HOME/.local/bin"
      cp "$AGY_TOOLCHAIN_DIR/scripts/agy-host-wrapper.sh" "$HOME/.local/bin/agy"
      chmod +x "$HOME/.local/bin/agy"
    fi
  fi
fi

# ------------------------------------------------------------------------------
# 4. 全栈 MCP 工具链自动注册
# ------------------------------------------------------------------------------
if [[ "$DO_MCP" -eq 1 ]]; then
  log_section "4. 全栈 MCP 工具链自动装载 (agent-device, agent-browser, ds-mcp)"
  
  if [[ -f "$SCRIPT_DIR/install-agent-device-mcp.sh" ]]; then
    log_info "装载真机自动化 MCP (agent-device)..."
    bash "$SCRIPT_DIR/install-agent-device-mcp.sh" --apply >/dev/null 2>&1 || true
    log_succ "agent-device MCP 装载完成"
  fi

  if [[ -f "$SCRIPT_DIR/install-agent-browser-mcp.sh" ]]; then
    log_info "装载浏览器自动化 MCP (agent-browser)..."
    bash "$SCRIPT_DIR/install-agent-browser-mcp.sh" --apply >/dev/null 2>&1 || true
    log_succ "agent-browser MCP 装载完成"
  fi

  if [[ -f "$SCRIPT_DIR/install-ds-mcp.sh" ]]; then
    log_info "装载 DS 监控/审批 MCP..."
    bash "$SCRIPT_DIR/install-ds-mcp.sh" --apply >/dev/null 2>&1 || true
    log_succ "ds-mcp 装载完成"
  fi
fi

# ------------------------------------------------------------------------------
# 5. 全链路探针与健康汇总播报 (7 工具池)
# ------------------------------------------------------------------------------
if [[ "$DO_CHECK" -eq 1 ]]; then
  log_section "5. Coolie 7 工具池物理就绪巡检报告"

  probe_tool() {
    local name="$1"
    local bin_cmd="$2"
    local employee="$3"
    local role="$4"
    local status="❌ 缺失"
    local path="未找到"
    local ver="-"

    if command -v "$bin_cmd" >/dev/null 2>&1; then
      path="$(command -v "$bin_cmd")"
      status="✅ 就绪"
      # 获取简短版本
      ver="$("$bin_cmd" --version 2>&1 | head -n 1 | tr -d '\r\n' || echo "未知版本")"
      if [[ ${#ver} -gt 30 ]]; then
        ver="${ver:0:28}..."
      fi
    elif [[ -x "/opt/homebrew/bin/$bin_cmd" ]]; then
      path="/opt/homebrew/bin/$bin_cmd"
      status="✅ 就绪"
      ver="$("/opt/homebrew/bin/$bin_cmd" --version 2>&1 | head -n 1 | tr -d '\r\n' || echo "未知版本")"
    elif [[ -x "$HOME/.local/bin/$bin_cmd" ]]; then
      path="$HOME/.local/bin/$bin_cmd"
      status="✅ 就绪"
      ver="$("$HOME/.local/bin/$bin_cmd" --version 2>&1 | head -n 1 | tr -d '\r\n' || echo "未知版本")"
    fi

    printf "  %-14s | %-8s | %-12s | %-16s | %-24s | %s\n" "$name" "$status" "$employee" "$role" "$ver" "$path"
  }

  echo "--------------------------------------------------------------------------------------------------------"
  printf "  %-14s | %-8s | %-12s | %-16s | %-24s | %s\n" "工具标识" "状态" "责任员工" "标准角色" "版本指纹" "物理可执行路径"
  echo "--------------------------------------------------------------------------------------------------------"
  probe_tool "Hermes"        "hermes"  "掌柜"   "PM 调度中枢"
  probe_tool "agy"           "agy"     "铁匠/墨斗" "Core SWE / FDA"
  probe_tool "claude-glm"    "claude"  "铁匠(备用)" "Core SWE 备选"
  probe_tool "claude-mm"     "claude"  "门神/百晓生" "测试 / 运营 (首选)"
  probe_tool "cmd"           "cmd"     "门神(兜底)" "FDSE 回归兜底"
  probe_tool "copilot"       "copilot" "兑底渊"  "PRE-SRE 可靠性"
  probe_tool "kiro-cli"      "kiro-cli" "掌柜(保留)" "架构大重构"
  echo "--------------------------------------------------------------------------------------------------------"

  echo -e "\n${BOLD}${GREEN}🎉 Coolie CLI 工具链一键安装与装配执行完毕！${NC}"
  echo -e "说明: 测试与运营已全面统一收拢首选 ${GREEN}claude-mm${NC}（门神/百晓生），铁匠主力工具为 ${GREEN}agy${NC}。"
fi
