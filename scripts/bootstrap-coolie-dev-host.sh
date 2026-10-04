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

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/bin:$PATH"

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

# 2. 状态目录与凭据初始化
echo "📁 [2/6] 创建本地运行状态与日志目录..."
mkdir -p "$REPO_ROOT/.coolie-local/logs" \
         "$REPO_ROOT/.coolie-local/locks" \
         "$REPO_ROOT/.coolie-local/dispatch" \
         "$REPO_ROOT/.coolie-local/context-bus" \
         "$REPO_ROOT/.coolie-local/evidence-ledger" \
         "$REPO_ROOT/.coolie-local/tool-health"
echo "✅ 目录创建完成: .coolie-local/*"

# 3. 注册员工 Sub-agent 模板到本机 ~/.claude/agents/
echo "👤 [3/6] 同步数字员工模板与技能到本地..."
if [[ -d "$REPO_ROOT/.agents/agents" ]]; then
  mkdir -p "$HOME/.claude/agents"
  cp "$REPO_ROOT/.agents/agents/"*.md "$HOME/.claude/agents/" 2>/dev/null || true
  echo "✅ 已同步 6 大员工模板至 ~/.claude/agents/"
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

# 6. 启动 Runner Bridge 并注册看门狗
echo "⚡ [6/6] 启动 Runner Bridge 异步消费守护进程与保活看门狗..."
bash "$SCRIPT_DIR/coolie-task-runner-bridge.sh" --stop >/dev/null 2>&1 || true
bash "$SCRIPT_DIR/coolie-task-runner-bridge.sh" --start

# 注册看门狗到 crontab
CRON_TAG="wave297-runner-bridge"
WATCHDOG_CMD="*/5 * * * * bash $REPO_ROOT/scripts/coolie-task-runner-bridge.sh --check >/dev/null 2>&1 || bash $REPO_ROOT/scripts/coolie-task-runner-bridge.sh --start >/dev/null 2>&1 # $CRON_TAG"
EXISTING_CRON="$(crontab -l 2>/dev/null || true)"
if ! printf '%s\n' "$EXISTING_CRON" | grep -q "$CRON_TAG"; then
  printf '%s\n%s\n' "$EXISTING_CRON" "$WATCHDOG_CMD" | grep -v '^$' | crontab -
  echo "✅ 已向 crontab 注册 5 分钟 Runner Bridge 看门狗保活"
fi

echo ""
echo "=================================================================="
echo "🎉 [部署成功] Coolie 本地工坊与派单调度体系已就绪！"
echo "=================================================================="
echo "📊 控制面板 URL:   $HOST_API_BASE"
echo "📋 工单查询命令:   node scripts/coolie-dev-task.mjs list"
echo "⚡ 模拟派单命令:   bash scripts/hermes-boss-intent-dispatcher.sh '<需求一句话>'"
echo "🔍 团队状态监控:   bash scripts/cron-team-status.sh --print"
echo "🛠️ Runner 状态:    bash scripts/coolie-task-runner-bridge.sh --status"
echo "=================================================================="
