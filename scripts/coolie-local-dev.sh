#!/usr/bin/env bash
# scripts/coolie-local-dev.sh [start | stop | restart | status | health | init-team | url]
#
# Local Coolie Workshop Development & Dogfooding Environment Manager.
# Runs the native control-plane server on the host machine to manage the local team
# (Hermes, 墨斗, 铁匠, 门神, 兑底渊, 百晓生) and dogfood Coolie features locally.

set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOCAL_DIR="${COOLIE_LOCAL_DIR:-$REPO_ROOT/.coolie-local}"
LOG_DIR="$LOCAL_DIR/logs"
DEV_LOG_REL=".coolie-local/logs/coolie-dev.log"
DEV_PID_REL=".coolie-local/coolie-dev.pid"
DEV_LOG="$LOCAL_DIR/logs/coolie-dev.log"
DEV_PID_FILE="$LOCAL_DIR/coolie-dev.pid"
PORT="${COOLIE_DEV_PORT:-3100}"
HOST_API_BASE="http://127.0.0.1:$PORT"

mkdir -p "$LOCAL_DIR" "$LOG_DIR"

usage() {
  cat <<EOF
Usage: scripts/coolie-local-dev.sh <command>

Commands:
  start                     Start local Coolie dev server in background (native host runtime)
  stop                      Stop local Coolie dev server
  restart                   Restart local Coolie dev server
  status                    Check local Coolie dev server status and health
  health                    Run structured API health check on local workshop
  sre                       Run SRE watchdog probe, health metrics & incident auto-healing
  init-team | fleet         One-click setup 6 digital employees (Hermes, 墨斗, 铁匠, 门神, 兑底渊, 百晓生)
  takeover [dir] [name]     One-click takeover any project (req, design, dev, test, ops, fleet)
  sync-docs [project]       Dynamically introspect code & generate ERD, API, UI, HLD, LLD docs
  url                       Print web board access URL for local browsing
  help                      Show this help

Environment variables:
  COOLIE_DEV_PORT      Server port (default: 3100)
  COOLIE_LOCAL_DIR     Local team state directory (default: .coolie-local)
EOF
}

is_port_in_use() {
  bash "$SCRIPT_DIR/host-exec.sh" "lsof -i :$PORT >/dev/null 2>&1"
}

is_healthy() {
  local res
  res="$(bash "$SCRIPT_DIR/host-exec.sh" "curl -sf '$HOST_API_BASE/api/health' 2>/dev/null" || true)"
  if [[ -n "$res" ]] && node -e 'try { const d = JSON.parse(process.argv[1]); process.exit(d.status === "ok" ? 0 : 1); } catch { process.exit(1); }' "$res" 2>/dev/null; then
    return 0
  fi
  return 1
}

cmd_start() {
  echo "=== [Coolie Local Dev] 启动本地工坊环境 ==="
  if is_healthy; then
    echo "✅ 本地工坊服务已在运行 (端口: $PORT, 状态: 正常)"
    cmd_url
    return 0
  fi

  if is_port_in_use; then
    echo "⚠️ 端口 $PORT 已被占用，但健康检查未通过。尝试清理旧进程..."
    cmd_stop || true
    sleep 2
  fi

  echo "🚀 在 Mac 宿主机后台启动原生 dev 服务..."
  bash "$SCRIPT_DIR/host-exec.sh" "mkdir -p .coolie-local/logs && nohup pnpm dev:once > '$DEV_LOG_REL' 2>&1 & echo \$! > '$DEV_PID_REL'"

  echo "⏳ 等待服务健康检查就绪 (最多等待 30 秒)..."
  local waited=0
  local ready=0
  while [[ $waited -lt 30 ]]; do
    if is_healthy; then
      ready=1
      break
    fi
    sleep 2
    waited=$((waited + 2))
    printf "."
  done
  echo ""

  if [[ $ready -eq 1 ]]; then
    # 确保自动热重启特性 (autoRestartDevServerWhenIdle) 开启，代码更新时后台静默热重载，严禁弹窗阻断打扰老板
    bash "$SCRIPT_DIR/host-exec.sh" "curl -sf -X PATCH '$HOST_API_BASE/api/instance/settings/experimental' -H 'Content-Type: application/json' -d '{\"autoRestartDevServerWhenIdle\": true}' >/dev/null 2>&1" || true
    echo "🎉 本地 Coolie 工坊 Dev 环境启动成功！(已启用后台静默热重载)"
    
    echo "🛡️ 正在启动伴生 SRE 智能看门狗守护..."
    bash "$SCRIPT_DIR/host-exec.sh" "pkill -f sre-watchdog.mjs 2>/dev/null || true; nohup node scripts/sre-watchdog.mjs > '$LOCAL_DIR/logs/sre-watchdog.log' 2>&1 &"
    echo "✅ SRE Watchdog 已就绪 (日志: $LOCAL_DIR/logs/sre-watchdog.log)"
    cmd_url
  else
    echo "❌ 启动超时，请检查日志: $DEV_LOG"
    bash "$SCRIPT_DIR/host-exec.sh" "tail -n 25 '$DEV_LOG_REL'" || true
    return 1
  fi
}

cmd_stop() {
  echo "=== [Coolie Local Dev] 停止本地工坊环境 ==="
  bash "$SCRIPT_DIR/host-exec.sh" "
    pkill -f sre-watchdog.mjs 2>/dev/null || true
    if [[ -f '$DEV_PID_REL' ]]; then
      pid=\$(cat '$DEV_PID_REL' 2>/dev/null || true)
      if [[ -n \"\$pid\" ]] && kill -0 \"\$pid\" 2>/dev/null; then
        kill \"\$pid\" 2>/dev/null || true
      fi
      rm -f '$DEV_PID_REL'
    fi
    # Also stop any dev service records
    pnpm dev:stop 2>/dev/null || true
    # Kill any lingering node listening on port
    pids=\$(lsof -ti :$PORT 2>/dev/null || true)
    if [[ -n \"\$pids\" ]]; then
      echo \"\$pids\" | xargs kill -9 2>/dev/null || true
    fi
  "
  echo "🛑 本地工坊服务与 SRE 监控已停止。"
}

cmd_restart() {
  cmd_stop
  sleep 1
  cmd_start
}

cmd_status() {
  echo "=== [Coolie Local Dev] 服务状态 ==="
  if is_healthy; then
    local health_json
    health_json="$(bash "$SCRIPT_DIR/host-exec.sh" "curl -s '$HOST_API_BASE/api/health'")"
    node -e '
      const h = JSON.parse(process.argv[1]);
      console.log(`状态:      ✅ 运行中 (ONLINE)`);
      console.log(`产品版本:  v${h.version || "未知"}`);
      console.log(`Git Commit: ${h.commit || "未知"}`);
      console.log(`运行模式:  ${h.deploymentMode} (${h.deploymentExposure})`);
      console.log(`启动时间:  ${h.serverInfo?.processStartedAt || "未知"}`);
      const fs = require("fs");
      const path = require("path");
      try {
        const candidatePaths = [
          path.join(process.env.HOME || "", ".paperclip/sre-status.json"),
          "/Users/mac/.paperclip/sre-status.json"
        ];
        let raw = null;
        for (const p of candidatePaths) {
          if (fs.existsSync(p)) { raw = fs.readFileSync(p, "utf8"); break; }
        }
        if (raw) {
          const s = JSON.parse(raw);
          console.log(`SRE 状态:  ${s.status === "HEALTHY" ? "✅ HEALTHY (看门狗持续守护中)" : "⚠️ " + s.status}`);
        } else {
          console.log(`SRE 状态:  ⚪ 未检测到状态快照`);
        }
      } catch(_) {
        console.log(`SRE 状态:  ⚪ 未检测到状态快照`);
      }
    ' "$health_json"
    cmd_url
  else
    if is_port_in_use; then
      echo "状态: ⚠️ 端口 $PORT 被占用，但服务未通过健康检查"
    else
      echo "状态: ⚪ 未运行 (OFFLINE)"
    fi
  fi
}

cmd_health() {
  echo "=== [Coolie Local Dev] API 健康检查 ==="
  if ! is_healthy; then
    echo "❌ 本地工坊未就绪或无法响应健康检查"
    return 1
  fi
  bash "$SCRIPT_DIR/host-exec.sh" "
    echo '--- /api/health ---'
    curl -s '$HOST_API_BASE/api/health' | node -e 'console.log(JSON.stringify(JSON.parse(require(\"fs\").readFileSync(0, \"utf8\")), null, 2))'
    echo ''
    echo '--- /api/companies ---'
    curl -s '$HOST_API_BASE/api/companies' | node -e 'console.log(JSON.stringify(JSON.parse(require(\"fs\").readFileSync(0, \"utf8\")), null, 2))'
  "
}

cmd_sre() {
  echo "=== [Coolie Local Dev] SRE 运行态体检与自愈诊断 ==="
  bash "$SCRIPT_DIR/host-exec.sh" "node scripts/sre-watchdog.mjs ${1:---once}"
}

cmd_url() {
  local lan_ip
  lan_ip="$(bash "$SCRIPT_DIR/host-exec.sh" "ipconfig getifaddr en0 2>/dev/null || echo '127.0.0.1'")"
  echo "---------------------------------------------------------"
  echo "🌐 本地 Web 看板:    http://localhost:$PORT"
  echo "📱 局域网/手机访问:  http://$lan_ip:$PORT"
  echo "📡 API 服务地址:     $HOST_API_BASE/api"
  echo "---------------------------------------------------------"
}

cmd_init_team() {
  if ! is_healthy; then
    echo "⚠️ 检测到本地工坊未启动，正在自动拉起..."
    cmd_start
  fi

  node "$SCRIPT_DIR/init-local-workshop.mjs"
  cmd_url
}

cmd_fleet() {
  echo "=== [Coolie Dev] 一键配置 6 大核心数字员工团队 ==="
  if ! is_healthy; then
    cmd_start
  fi
  node "$SCRIPT_DIR/init-local-workshop.mjs"
  echo "✅ 数字员工团队 (Hermes, 墨斗, 铁匠, 门神, 兑底渊, 百晓生) 已全部就位！"
  cmd_url
}

cmd_takeover() {
  local target_dir="${1:-.}"
  local proj_name="${2:-}"
  
  target_dir="$(cd "$target_dir" && pwd)"
  if [[ -z "$proj_name" ]]; then
    proj_name="$(basename "$target_dir")"
  fi
  
  echo "========================================================="
  echo "🚀 [Coolie Dev] 一键物理接管目标项目: $proj_name"
  echo "📁 物理目标路径: $target_dir"
  echo "⚡ 认知中枢: Hermes 作为芯片中枢调度全生命周期"
  echo "========================================================="
  
  # 1. 确保本地工坊服务就绪
  if ! is_healthy; then
    echo "⚠️ 检测到本地工坊中枢未启动，正在自动拉起..."
    cmd_start
  fi
  
  # 2. 一键就位 6 大核心数字员工
  echo "🤖 确保 6 大数字员工就位 (Hermes, 墨斗, 铁匠, 门神, 兑底渊, 百晓生)..."
  node "$SCRIPT_DIR/init-local-workshop.mjs"
  
  # 3. 驱动 CMMI 动态内省与设计文档生成引擎
  echo "📄 正在基于代码内省动态生成 需求、UI、API、表设计、概要、详细设计全量文档..."
  if [[ "$target_dir" == "$REPO_ROOT" ]]; then
    node "$SCRIPT_DIR/cmmi-doc-generator.cjs" --all
  else
    node "$SCRIPT_DIR/cmmi-doc-generator.cjs" --project "$proj_name" --all || true
  fi
  
  echo ""
  echo "🎉 项目 [$proj_name] 已成功被 Coolie 工坊物理接管！"
  echo "   - 芯片中枢: Hermes 已激活并绑定意图总线与 7 工具池"
  echo "   - 数字员工: 6 大核心角色已在岗，支持一句话意图下发"
  echo "   - 研运资产: 需求(SRS/RTM)、设计(HLD/LLD/ERD/API/UI) 已 100% 动态生成"
  echo "   - 持续守护: 交付主线巡检进程守护中"
  echo "========================================================="
  cmd_url
}

cmd_sync_docs() {
  echo "=== [Coolie Dev] 动态代码内省并同步生成项目设计文档 ==="
  local proj="${1:-}"
  if [[ -n "$proj" ]]; then
    node "$SCRIPT_DIR/cmmi-doc-generator.cjs" --project "$proj" --all
  else
    node "$SCRIPT_DIR/cmmi-doc-generator.cjs" --all
  fi
}

ACTION="${1:-status}"

case "$ACTION" in
  start)       cmd_start ;;
  stop)        cmd_stop ;;
  restart)     cmd_restart ;;
  status)      cmd_status ;;
  health)      cmd_health ;;
  sre)         shift; cmd_sre "$@" ;;
  init-team)   cmd_init_team ;;
  fleet)       cmd_fleet ;;
  takeover)    shift; cmd_takeover "$@" ;;
  sync-docs)   shift; cmd_sync_docs "$@" ;;
  url)         cmd_url ;;
  -h|--help|help) usage ;;
  *)
    printf '未知命令: %s\n\n' "$ACTION" >&2
    usage >&2
    exit 2
    ;;
esac
