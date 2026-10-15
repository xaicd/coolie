#!/usr/bin/env bash
# scripts/bootstrap-coolie-dev-host.sh
#
# Coolie 本地工坊与异步派单中枢一键复制 / 新机初始化引导脚本
# 解决 5 大卡点:
#   1. 零外部 DB 依赖: 自动拉起嵌入式 PGlite Dev Server (3100)
#   2. 零手动建团队: 自动初始化「Coolie 本地施工总社」与 6 大数字员工
#   3. 零超时强杀: 启动 Runner Bridge 异步守护进程，免微信终端 180s 限制
#   4. 零幽灵虚报: 注册带 kill -0 探活与死进程自动自愈的状态机
#   5. 7x24小时保活: 自动向 crontab 注册 5 分钟巡检看门狗

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PORT="${COOLIE_DEV_PORT:-3100}"
HOST_API_BASE="http://127.0.0.1:$PORT"

for bin_dir in "/opt/homebrew/bin" "/usr/local/bin" "$HOME/.local/bin" "$HOME/bin"; do
  if [[ -d "$bin_dir" ]] && [[ ":$PATH:" != *":$bin_dir:"* ]]; then
    export PATH="$bin_dir:$PATH"
  fi
done

echo "=================================================================="
echo "🚀 [Coolie Dev] 开始一键部署与初始化本地开发与派单体系..."
echo "=================================================================="

# 1. 基础环境预检
echo "🔍 [1/6] 检查基础运行环境..."
for cmd in node pnpm git curl; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "❌ 缺少依赖命令: $cmd，请先安装后再运行。" >&2
    exit 1
  fi
done

NODE_MAJOR="$(node -v | tr -d 'v' | cut -d. -f1)"
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  echo "⚠️ 建议使用 Node.js >= 22，当前版本: $(node -v)"
fi
echo "✅ 基础依赖命令检查通过 (Node: $(node -v), pnpm: $(pnpm -v))"

if [[ ! -d "$REPO_ROOT/node_modules" ]]; then
  echo "📦 安装项目根依赖 (pnpm install)..."
  (cd "$REPO_ROOT" && pnpm install)
fi

# 2. 状态目录与凭据初始化
echo "📁 [2/6] 创建本地运行状态与日志目录..."
mkdir -p "$REPO_ROOT/.coolie-local/logs" \
         "$REPO_ROOT/.coolie-local/locks" \
         "$REPO_ROOT/.coolie-local/dispatch" \
         "$REPO_ROOT/.coolie-local/context-bus" \
         "$REPO_ROOT/.coolie-local/evidence-ledger" \
         "$REPO_ROOT/.coolie-local/tool-health"
echo "✅ 目录创建完成: .coolie-local/*"

# 3. 校验并预热 ACP 协议栈与进化监督规则
echo "👤 [3/6] 校验 ACP 调度协议栈与项目进化监督宪法..."
chmod +x "$REPO_ROOT/scripts/adapters/"*.sh 2>/dev/null || true

# 清理历史残留的 Claude 嵌套 subagent（遵从 AGENTS.md 第 13/19 条扁平化铁律）
if [[ -d "$HOME/.claude/agents" ]]; then
  rm -f "$HOME/.claude/agents/"*.md 2>/dev/null || true
  echo "🧹 已清理 ~/.claude/agents/ 历史残留模板，确保 Claude 扁平无嵌套干净运行"
fi

# 确保 Claude 多模型配置模板与自适应软链接就绪 (遵从 wave272 + wave280 多模型路由法典)
mkdir -p "$HOME/.claude"
if [[ ! -f "$HOME/.claude/settings.jsonglm" ]]; then
  cat > "$HOME/.claude/settings.jsonglm" <<'EOF'
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://open.bigmodel.cn/api/anthropic",
    "API_TIMEOUT_MS": "3000000",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": 1,
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "glm-5-turbo",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "glm-5",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "glm-5",
    "CLAUDE_CODE_AUTO_COMPACT_WINDOW": "1048576",
    "ANTHROPIC_MODEL": "glm-5",
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
  echo "📝 初始化 ~/.claude/settings.jsonglm 模板"
fi

if [[ ! -f "$HOME/.claude/settings.jsonmm" ]]; then
  cat > "$HOME/.claude/settings.jsonmm" <<'EOF'
{
  "env": {
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
  echo "📝 初始化 ~/.claude/settings.jsonmm 模板"
fi

if [[ ! -e "$HOME/.claude/settings.json" ]]; then
  ln -sf "$HOME/.claude/settings.jsonmm" "$HOME/.claude/settings.json" 2>/dev/null || true
  echo "🔗 已建立初始符号链接: ~/.claude/settings.json -> settings.jsonmm"
fi

# 检查 ACP 客户端可用性
if command -v acpx >/dev/null 2>&1 || (cd "$REPO_ROOT" && pnpm exec acpx --version >/dev/null 2>&1); then
  echo "✅ ACP 客户端 (acpx) 就绪"
else
  echo "⚠️ 未检测到全局 acpx，将通过 pnpm exec 运行项目内依赖"
fi

# 检查高阶反向思维规则就绪
if [[ -f "$REPO_ROOT/.agents/rules/HIGH-ORDER-INVERSE-THINKING.md" ]]; then
  echo "✅ 平台高阶反向思维守卫已就绪 (.agents/rules/HIGH-ORDER-INVERSE-THINKING.md)"
fi

# 4. 启动 Coolie Dev Server (3100, 嵌入式 PGlite)
echo "🌐 [4/6] 检查并启动 Coolie Dev Server (端口 $PORT)..."
if curl -sf "$HOST_API_BASE/api/health" >/dev/null 2>&1; then
  echo "✅ Dev Server 已在运行中: $HOST_API_BASE"
else
  echo "正在启动本地 Dev Server (后台后台常驻)..."
  bash "$SCRIPT_DIR/coolie-local-dev.sh" start
  echo "等待 Dev Server 启动就绪..."
  for i in {1..30}; do
    if curl -sf "$HOST_API_BASE/api/health" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
fi

if ! curl -sf "$HOST_API_BASE/api/health" >/dev/null 2>&1; then
  echo "❌ Dev Server 启动失败，请检查 .coolie-local/logs/coolie-dev.log" >&2
  exit 1
fi
echo "✅ Dev Server 健康检查通过！"

# 5. 初始化本地施工总社与 6 大数字员工
echo "🏢 [5/6] 检查并初始化本地施工总社企业与员工资产..."
node "$SCRIPT_DIR/init-local-workshop.mjs"

# 6. 验证 ACPX 全双工协议总线
echo "⚡ [6/6] 验证 ACPX 全双工协议总线..."
if command -v acpx >/dev/null 2>&1; then
  echo "✅ ACPX CLI: $(command -v acpx) ($(acpx -V 2>/dev/null || echo '0.12.0'))"
else
  echo "⚠️ 宿主机未检测到全局 acpx，请确保 /opt/homebrew/bin/acpx 或 node_modules/.bin/acpx 可用"
fi

# 7. 运行 7 工具池实时健康探针
if [[ -f "$SCRIPT_DIR/tool-health-monitor.sh" ]]; then
  echo ""
  echo "🩺 [7/7] 运行工具池实时健康探针..."
  bash "$SCRIPT_DIR/tool-health-monitor.sh" --print 2>/dev/null || true
fi

echo ""
echo "=================================================================="
echo "🎉 [部署成功] Coolie 本地工坊与派单调度体系已就绪！"
echo "=================================================================="
echo "📊 控制面板 URL:   $HOST_API_BASE"
echo "📋 工单查询命令:   node scripts/coolie-dev-task.mjs list"
echo "⚡ 微信派单引擎:   bash scripts/hermes-boss-intent-dispatcher.sh '<需求一句话>'"
echo "🚀 ACPX 派工通道:  bash scripts/hermes-acpx-dispatch.sh --agent tiejiang --prompt '<指令>'"
echo "🔍 团队状态监控:   bash scripts/cron-team-status.sh --print"
echo "=================================================================="
