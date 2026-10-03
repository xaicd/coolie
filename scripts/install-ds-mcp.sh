#!/usr/bin/env bash
# scripts/install-ds-mcp.sh [--dry-run | --apply]
#
# wave228 — Register 百晓生 (Sage / DS) toolchain-only MCP servers. Per the
# brief's "DS 责任范围扩展": DS 跑测试 / 验收 / 运营 / 审批 / 监控, 需要 3 个
# 额外 MCP:
#
#   system-monitor  → 监控系统运行状态 (CPU / mem / disk / paperclip health)
#   approval        → 任何变更走 approval gate (PM 自动审批 / 老板拍板)
#   company-ops     → 运营 Coolie 工坊 (日报 / 配额 / release driver)
#
# DS 工具链 = claude-glm / claude-mm / claude-ds. NOT agy / NOT cmd / NOT
# copilot — DS 不跑那些员工的活. (This is the wave225 "5 员工 = 5 岗位, 工具
# 可换" 原则 — DS 的岗位有自己专属的 MCP, 跨员工不复用.)
#
# 每个 MCP 的 command / args 是 placeholder — 真正发布后 PM (Hermes) 替换
# `command` 字段为对应 npm 包 / 本地二进制. 现状 (2026-09-30):
#
#   system-monitor → 暂无公开包, 占位 = "mcp-server-system-monitor" --stdio
#   approval       → 暂无公开包, 占位 = "mcp-server-approval" --stdio
#   company-ops    → 暂无公开包, 占位 = "mcp-server-company-ops" --stdio
#
# 占位让脚本在所有 DS 工具链下都能 idempotent 注册成功; 真包上线后改
# MCP_DS_SERVER_SPEC 行即可一行改完.
#
# Flags:
#   --dry-run   Print "would write:" lines without touching disk
#   --apply     Apply (default when run from a non-TTY context)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/mcp-install-common.sh
source "$HERE/lib/mcp-install-common.sh"

usage() {
  cat <<'EOF'
usage: scripts/install-ds-mcp.sh [--dry-run | --apply]

Registers three DS-only MCP servers (system-monitor / approval / company-ops)
into ~/.claude/settings.json under mcpServers for each DS-toolchain CLI
(claude-glm / claude-mm / claude-ds).

  --dry-run   Print planned writes, do not touch disk
  --apply     Apply changes (default when run from a non-TTY context)

Env overrides (testing):
  MCP_DRY_RUN=1       force dry-run (overrides --apply)
  MCP_HOME=/tmp/x     redirect ~/.claude to MCP_HOME/.claude for the run
EOF
}

case "${1:-}" in
  --dry-run)
    export MCP_DRY_RUN=1
    ;;
  --apply|"")
    if [[ -t 0 && -t 1 ]]; then
      export MCP_DRY_RUN=1
      mcp_log "no flag given + TTY → defaulting to --dry-run (use --apply to write)"
    else
      export MCP_DRY_RUN=0
    fi
    ;;
  -h|--help)
    usage; exit 0
    ;;
  *)
    usage >&2; exit 2
    ;;
esac

# DS toolchain — only register into these CLIs (skip agy / cmd / copilot).
DS_TOOLCHAIN=(claude-glm claude-mm claude-ds)

# Spec table — name : command : args-json-array-string. Edit here when the
# upstream MCP packages ship. Three rows are the wave228 baseline.
MCP_DS_SERVER_SPEC=(
  "system-monitor|mcp-server-system-monitor|[\"--stdio\"]"
  "approval|mcp-server-approval|[\"--stdio\"]"
  "company-ops|mcp-server-company-ops|[\"--stdio\"]"
)

register_for_tool() {
  local tool="$1"
  local spec name command args_json
  for spec in "${MCP_DS_SERVER_SPEC[@]}"; do
    IFS='|' read -r name command args_json <<<"$spec"
    mcp_register_server "$tool" "$name" "$command" "$args_json"
  done
}

mcp_log "安装 百晓生 (DS) MCP servers → ~/.claude/settings.json (限 DS 工具链)"
mcp_log "  targets: ${DS_TOOLCHAIN[*]}"
mcp_log "  servers: 3 (system-monitor, approval, company-ops — 占位符, 待真包替换)"

for cli in "${DS_TOOLCHAIN[@]}"; do
  if mcp_cli_present "$cli"; then
    register_for_tool "$cli"
  else
    mcp_log "skipping $cli — not installed (DS 工具链, 不影响其他员工)"
  fi
done

if [[ "${MCP_DRY_RUN:-0}" == "1" ]]; then
  mcp_log "dry-run 完成 — 未写入任何文件"
else
  mcp_log "✅ 完成: 3 个 DS MCP 已注册到 DS 工具链"
fi