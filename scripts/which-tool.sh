#!/usr/bin/env bash
# which-tool.sh — PM 选工具 CLI (wave272 + wave280 修正)
# 帮助 PM 速查 7 工具池 + 6 老板团队 × 7 工具池 真配
# 不动 server, 不动 MCP, 纯本地脚本
#
#   $ scripts/which-tool.sh                # 列出 7 工具 + 真配表
#   $ scripts/which-tool.sh agy-gemini3.8  # 单工具状态 + 默认谁用
#   $ scripts/which-tool.sh 墨斗          # 单员工 → 工具 (默认 + 兜底)
#   $ scripts/which-tool.sh check         # 7 工具 CLI 可执行性 (which)
#   $ scripts/which-tool.sh --help        # 帮助
#
# wave280 修正 (老板原话 "Hermes 肯定用 Hermes 自己啊, 为啥 kiro-cli"):
#   - Hermes 默认工具: kiro-cli → Hermes 自己
#   - kiro-cli 留 7 工具池 (老板备用), 不再绑 Hermes
#   - 与 docs-coolie/TOOLS.md / CMMI-EMPLOYEE-MAPPING.md / PM-REPORTING-FORMAT.md 同步

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS_DOC="${REPO_ROOT}/docs-coolie/TOOLS.md"

# 7 工具池 (wave272 拍板 + wave280 修正 Hermes 行): name|cli-binary|employee-default|status
TOOLS=(
  "agy-gemini3.8|agy-gemini3.8|墨斗 (FDA)|✅ 主线"
  "claude-mm|claude-mm|铁匠贰号 (Core SWE 副)|✅ 主线"
  "claude-glm|claude-glm|铁匠 (Core SWE)|✅ 主线"
  "cmd|cmd|门神 (FDSE)|✅ 主线"
  "copilot|copilot|兑底渊 (PRE-SRE)|⚠️ 限制"
  "Hermes|hermes|Hermes (PM, 人即工具, wave280)|✅ 主线"
  "kiro-cli|kiro-cli|老板备用 (wave280 解除 Hermes 绑定)|✅ 主线"
)

# 6 老板团队 → 工具 (默认 + 兜底), wave272 真配 + wave280 修正 Hermes 行
MAPPING=(
  "Hermes|Hermes 自己 (wave280, 不再是 kiro-cli)|-"
  "墨斗|agy-gemini3.8|cmd"
  "铁匠|claude-glm|claude-mm"
  "铁匠贰号|claude-mm|-"
  "门神|cmd|-"
  "兑底渊|copilot|claude-mm"
  "百晓生|claude-mm|claude-glm"
)

print_help() {
  cat <<'EOF'
which-tool.sh — PM 选工具 CLI (wave272 + wave276 + wave280)

用法:
  scripts/which-tool.sh                 列出 7 工具池 + 6 老板团队真配
  scripts/which-tool.sh <tool>          单工具状态 + 默认员工
  scripts/which-tool.sh <员工>           单员工 → 工具 (默认 + 兜底)
  scripts/which-tool.sh check           7 工具 CLI 可执行性 (which)
  scripts/which-tool.sh status          5 字段团队状态 (PM 问"什么进展"用, wave276)
  scripts/which-tool.sh --help           帮助

7 工具池 (老板原话 wave272, wave280 修正 Hermes):
  1. agy-gemini3.8 — 墨斗 (画原型 / 选型 / 研判)
  2. claude-mm      — 铁匠贰号 / 百晓生 (代码 / DS 备用)
  3. claude-glm     — 铁匠 (代码开发主力, wave272 拍板)
  4. cmd            — 门神 (命令 / 派活 / 自动化)
  5. copilot        — 兑底渊 (部署 / 运维 / 监控)
  6. Hermes         — PM (人即工具, 拍板 / 派活; wave280 确认不配 kiro-cli)
  7. kiro-cli       — 老板备用 (wave280 起解除与 Hermes 绑定)

出处: docs-coolie/TOOLS.md (wave272 + wave280) + docs-coolie/PM-REPORTING-FORMAT.md (wave276 + wave280)
EOF
}

list_all() {
  echo "═══ 7 工具池 (wave272 拍板) ═══"
  printf "%-3s %-15s %-30s %-12s %s\n" "#" "工具" "默认员工" "状态" "可执行 (which)"
  echo "----------------------------------------------------------------"
  local i=1
  for row in "${TOOLS[@]}"; do
    IFS='|' read -r name cli emp status <<<"$row"
    local bin=""
    if command -v "$cli" >/dev/null 2>&1; then
      bin="$(command -v "$cli")"
    else
      bin="(未安装)"
    fi
    printf "%-3s %-15s %-30s %-12s %s\n" "$i." "$name" "$emp" "$status" "$bin"
    i=$((i + 1))
  done

  echo ""
  echo "═══ 6 老板团队 × 7 工具池 真配矩阵 (wave272) ═══"
  printf "%-12s %-15s %s\n" "员工" "默认工具" "兜底工具"
  echo "----------------------------------------"
  for row in "${MAPPING[@]}"; do
    IFS='|' read -r emp tool fallback <<<"$row"
    printf "%-12s %-15s %s\n" "$emp" "$tool" "$fallback"
  done

  echo ""
  echo "出处: docs-coolie/TOOLS.md (wave272)"
}

lookup_tool() {
  local query="$1"
  local found=0
  for row in "${TOOLS[@]}"; do
    IFS='|' read -r name cli emp status <<<"$row"
    if [[ "$name" == "$query" ]]; then
      echo "工具: $name"
      echo "  默认员工: $emp"
      echo "  状态: $status"
      found=1
    fi
  done
  if [[ $found -eq 0 ]]; then
    echo "未找到工具: $query"
    echo "可用工具: agy-gemini3.8 / claude-mm / claude-glm / cmd / copilot / Hermes / kiro-cli"
    return 1
  fi
}

lookup_employee() {
  local query="$1"
  local found=0
  for row in "${MAPPING[@]}"; do
    IFS='|' read -r emp tool fallback <<<"$row"
    if [[ "$emp" == "$query" ]]; then
      echo "员工: $emp"
      echo "  默认工具: $tool"
      if [[ "$fallback" == "-" ]]; then
        echo "  兜底工具: (无, 同员工换工具见铁匠贰号)"
      else
        echo "  兜底工具: $fallback"
      fi
      found=1
    fi
  done
  if [[ $found -eq 0 ]]; then
    echo "未找到员工: $query"
    echo "可用员工: Hermes / 墨斗 / 铁匠 / 铁匠贰号 / 门神 / 兑底渊 / 百晓生"
    return 1
  fi
}

check_tools() {
  echo "== 7 工具 CLI 可执行性 (which) =="
  local ok=0
  local total=0
  for row in "${TOOLS[@]}"; do
    IFS='|' read -r name _ _ status <<<"$row"
    total=$((total+1))
    if command -v "$name" >/dev/null 2>&1; then
      printf "  ✅ %-15s %s\n" "$name" "$(command -v "$name")"
      ok=$((ok+1))
    else
      printf "  ❌ %-15s (未安装)\n" "$name"
    fi
  done
  echo ""
  echo "通过: $ok / ${total} (Hermes / kairo-cli 装 = 老板本地有, 不一定需要 PATH)"
  if [[ -f "$TOOLS_DOC" ]]; then
    echo "完整出处: $TOOLS_DOC"
  fi
}

# wave276 — 跑 cron-team-status.sh 把团队状态 (5 字段) 转给 PM. 仅当
# scripts/cron-team-status.sh 存在时才显示; 否则提示用户跑 wave276.
team_status() {
  local team_script="${REPO_ROOT}/scripts/cron-team-status.sh"
  if [[ ! -x "$team_script" ]]; then
    echo "未找到: $team_script"
    echo "提示: 这是 wave276 新增脚本. 若 wave276 未跑, 请先跑 wave276 装本脚本."
    return 1
  fi
  bash "$team_script" --print
}

# 主入口
case "${1:-}" in
  "")
    list_all
    ;;
  --help|-h|help)
    print_help
    ;;
  check)
    check_tools
    ;;
  status)
    # wave276: 5 字段团队状态, 转发到 cron-team-status.sh
    team_status
    ;;
  *)
    # 员工名优先 (用户说 "Hermes" 通常指人), 工具名次之
    case "$1" in
      "Hermes"|"墨斗"|"铁匠"|"铁匠贰号"|"门神"|"兑底渊"|"百晓生")
        lookup_employee "$1"
        ;;
      "agy-gemini3.8"|"claude-mm"|"claude-glm"|"cmd"|"copilot"|"kiro-cli")
        lookup_tool "$1"
        ;;
      *)
        echo "未识别参数: $1"
        echo "用法: scripts/which-tool.sh <tool|员工|check|status|--help>"
        exit 1
        ;;
    esac
    ;;
esac