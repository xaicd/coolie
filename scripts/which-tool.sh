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
  scripts/which-tool.sh acp             6 大工具 ACP (Agent Client Protocol) 适配矩阵
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
  local lib_env="$REPO_ROOT/scripts/lib/env-detector.sh"
  if [[ -f "$lib_env" ]]; then
    # shellcheck source=scripts/lib/env-detector.sh
    source "$lib_env"
  fi

  echo "═══ 7 工具池 (wave272 拍板) ═══"
  printf "%-3s %-15s %-30s %-12s %s\n" "#" "工具" "默认员工" "状态" "物理宿主 / 驱动模式"
  echo "----------------------------------------------------------------------------------------"
  local i=1
  for row in "${TOOLS[@]}"; do
    IFS='|' read -r name cli emp status <<<"$row"
    local bin=""
    if [[ "$name" =~ agy ]]; then
      IFS=$'\t' read -r s lat d <<< "$(smart_probe_artisan_tool agy-gemini3.8)"
      bin="$d"
    elif [[ "$name" =~ claude-glm ]]; then
      IFS=$'\t' read -r s lat d <<< "$(smart_probe_claude glm)"
      bin="$d"
    elif [[ "$name" =~ claude-mm ]]; then
      IFS=$'\t' read -r s lat d <<< "$(smart_probe_claude mm)"
      bin="$d"
    elif [[ "$name" == "Hermes" ]]; then
      IFS=$'\t' read -r s lat d <<< "$(smart_probe_hermes)"
      bin="$d"
    elif [[ "$name" == "kiro-cli" ]]; then
      bin="老板专属保留 (未放入全局 PATH)"
    elif command -v "$cli" >/dev/null 2>&1; then
      bin="$(command -v "$cli")"
    elif [[ -x "$REPO_ROOT/scripts/host-exec.sh" ]] && res="$("$REPO_ROOT/scripts/host-exec.sh" "command -v $cli" 2>/dev/null)" && [[ -n "$res" ]]; then
      bin="$res"
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
      if [[ "$name" == "claude-glm" ]]; then
        echo "  物理本质: Mac 宿主机 /opt/homebrew/bin/claude (Anthropic 官方 CLI)"
        echo "  配置文件: ~/.claude/settings.jsonglm"
        echo "  模型与端点: 智谱 BigModel glm-5.3[1m] (https://open.bigmodel.cn/api/anthropic)"
        echo "  切换机制: ln -sf ~/.claude/settings.jsonglm ~/.claude/settings.json"
        echo "  CLI 调用: ln -sf ~/.claude/settings.jsonglm ~/.claude/settings.json && claude -p \"\$PROMPT\" --dangerously-skip-permissions < /dev/null"
        echo "  ACP 驱动: scripts/adapters/claude-glm-acp.sh -> acpx claude \"\$PROMPT\""
      elif [[ "$name" == "claude-mm" ]]; then
        echo "  物理本质: Mac 宿主机 /opt/homebrew/bin/claude (Anthropic 官方 CLI)"
        echo "  配置文件: ~/.claude/settings.jsonmm"
        echo "  模型与端点: MiniMax MiniMax-M3 (https://api.minimaxi.com/anthropic)"
        echo "  切换机制: ln -sf ~/.claude/settings.jsonmm ~/.claude/settings.json"
        echo "  CLI 调用: ln -sf ~/.claude/settings.jsonmm ~/.claude/settings.json && claude -p \"\$PROMPT\" --dangerously-skip-permissions < /dev/null"
        echo "  ACP 驱动: scripts/adapters/claude-mm-acp.sh -> acpx claude \"\$PROMPT\""
      elif [[ "$name" == "agy-gemini3.8" ]]; then
        echo "  物理本质: Mac 宿主机 Docker 容器 agy-ubuntu-container 内 /root/.local/bin/agy"
        echo "  编码管道: 宿主 base64 包装 -> docker cp -> 容器内 LANG=C.UTF-8 + base64 -d"
        echo "  CLI 调用: docker exec agy-ubuntu-container agy --dangerously-skip-permissions -p \"\$PROMPT\""
        echo "  ACP 驱动: scripts/adapters/docker-agy-acp.sh -> acpx --agent scripts/adapters/docker-agy-acp.sh \"\$PROMPT\""
      elif [[ "$name" == "cmd" ]]; then
        echo "  物理本质: Mac 宿主机 /opt/homebrew/bin/cmd (@commandcode/ai CLI)"
        echo "  CLI 调用: cmd -p \"\$PROMPT\" --yolo --tools-all -t < /dev/null"
        echo "  ACP 驱动: scripts/adapters/cmd-acp.sh -> acpx --agent scripts/adapters/cmd-acp.sh \"\$PROMPT\""
      elif [[ "$name" == "copilot" ]]; then
        echo "  物理本质: Mac 宿主机 /opt/homebrew/bin/copilot (GitHub Copilot CLI)"
        echo "  CLI 调用: copilot -p \"\$PROMPT\" --yolo < /dev/null"
        echo "  ACP 驱动: scripts/adapters/copilot-acp.sh -> acpx copilot \"\$PROMPT\""
      elif [[ "$name" == "Hermes" ]]; then
        echo "  物理本质: PM 唯一调度会话中枢 (人即工具)"
        echo "  派单模板: scripts/dispatch-local-employee.sh --agent <agent> --task <task> --execute"
      elif [[ "$name" == "kiro-cli" ]]; then
        echo "  物理本质: Mac 宿主机 AWS Kiro CLI (老板架构大重构专属保留)"
        echo "  CLI 调用: kiro-cli -p \"\$PROMPT\" < /dev/null"
      fi
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
  local lib_env="$REPO_ROOT/scripts/lib/env-detector.sh"
  if [[ -f "$lib_env" ]]; then
    # shellcheck source=scripts/lib/env-detector.sh
    source "$lib_env"
  fi

  local env_desc=""
  if command -v describe_coolie_env >/dev/null 2>&1; then
    env_desc="$(describe_coolie_env)"
  else
    env_desc="$(uname -s) $(uname -m)"
  fi

  echo "== Coolie 智能环境感知与工具健康探测 =="
  echo "当前运行宿主: $env_desc"
  echo "----------------------------------------------------------------"
  local ok=0
  local total=7

  # 1. Hermes (PM调度总指挥 / 原生实体)
  IFS=$'\t' read -r h_status h_lat h_detail <<< "$(smart_probe_hermes)"
  if [[ "$h_status" == "ok" ]]; then
    printf "  ✅ %-15s %s\n" "Hermes" "$h_detail"
    ok=$((ok+1))
  else
    printf "  ❌ %-15s %s\n" "Hermes" "$h_detail"
  fi

  # 2. claude-glm (智谱 GLM-5.3 1M)
  IFS=$'\t' read -r glm_status glm_lat glm_detail <<< "$(smart_probe_claude glm)"
  if [[ "$glm_status" == "ok" ]]; then
    printf "  ✅ %-15s %s\n" "claude-glm" "$glm_detail"
    ok=$((ok+1))
  elif [[ "$glm_status" == "warn" ]]; then
    printf "  ⚠️  %-15s %s\n" "claude-glm" "$glm_detail"
    ok=$((ok+1))
  else
    printf "  ❌ %-15s %s\n" "claude-glm" "$glm_detail"
  fi

  # 3. claude-mm (MiniMax-M3)
  IFS=$'\t' read -r mm_status mm_lat mm_detail <<< "$(smart_probe_claude mm)"
  if [[ "$mm_status" == "ok" ]]; then
    printf "  ✅ %-15s %s\n" "claude-mm" "$mm_detail"
    ok=$((ok+1))
  elif [[ "$mm_status" == "warn" ]]; then
    printf "  ⚠️  %-15s %s\n" "claude-mm" "$mm_detail"
    ok=$((ok+1))
  else
    printf "  ❌ %-15s %s\n" "claude-mm" "$mm_detail"
  fi

  # 4. cmd (@commandcode/ai)
  IFS=$'\t' read -r cmd_status cmd_lat cmd_detail <<< "$(smart_probe_artisan_tool cmd)"
  if [[ "$cmd_status" == "ok" ]]; then
    printf "  ✅ %-15s %s\n" "cmd" "$cmd_detail"
    ok=$((ok+1))
  elif [[ "$cmd_status" == "standby" ]]; then
    printf "  ⏸️  %-15s %s\n" "cmd" "$cmd_detail"
    ok=$((ok+1))
  else
    printf "  ❌ %-15s %s\n" "cmd" "$cmd_detail"
  fi

  # 5. copilot (GitHub Copilot CLI)
  IFS=$'\t' read -r cp_status cp_lat cp_detail <<< "$(smart_probe_artisan_tool copilot)"
  if [[ "$cp_status" == "ok" ]]; then
    printf "  ✅ %-15s %s\n" "copilot" "$cp_detail"
    ok=$((ok+1))
  elif [[ "$cp_status" == "standby" ]]; then
    printf "  ⏸️  %-15s %s\n" "copilot" "$cp_detail"
    ok=$((ok+1))
  else
    printf "  ❌ %-15s %s\n" "copilot" "$cp_detail"
  fi

  # 6. agy-gemini3.8 (Antigravity CLI / Docker)
  IFS=$'\t' read -r agy_status agy_lat agy_detail <<< "$(smart_probe_artisan_tool agy-gemini3.8)"
  if [[ "$agy_status" == "ok" ]]; then
    printf "  ✅ %-15s %s\n" "agy-gemini3.8" "$agy_detail"
    ok=$((ok+1))
  elif [[ "$agy_status" == "standby" ]]; then
    printf "  ⏸️  %-15s %s\n" "agy-gemini3.8" "$agy_detail"
    ok=$((ok+1))
  else
    printf "  ❌ %-15s %s\n" "agy-gemini3.8" "$agy_detail"
  fi

  # 7. kiro-cli (老板专属保留)
  IFS=$'\t' read -r kiro_status kiro_lat kiro_detail <<< "$(smart_probe_artisan_tool kiro-cli)"
  if [[ "$kiro_status" == "ok" ]]; then
    printf "  ✅ %-15s %s\n" "kiro-cli" "$kiro_detail"
    ok=$((ok+1))
  else
    printf "  ⚠️  %-15s %s\n" "kiro-cli" "$kiro_detail"
    ok=$((ok+1))
  fi

  echo "----------------------------------------------------------------"
  echo "物理探针健康率: $ok / ${total}"
  if [[ -f "$TOOLS_DOC" ]]; then
    echo "详细使用说明与物理调用手册: $TOOLS_DOC"
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

# 标准化 ACP (Agent Client Protocol) 调度矩阵
acp_tools() {
  echo "═══ Coolie 标准化 ACP (Agent Client Protocol) 调度矩阵 ═══"
  printf "%-15s %-36s %s\n" "工具" "ACP 启动脚本" "acpx 驱动命令"
  echo "-------------------------------------------------------------------------------------------------"
  printf "%-15s %-36s %s\n" "docker agy" "scripts/adapters/docker-agy-acp.sh" "acpx --agent scripts/adapters/docker-agy-acp.sh \"...\""
  printf "%-15s %-36s %s\n" "cmd" "scripts/adapters/cmd-acp.sh" "acpx --agent scripts/adapters/cmd-acp.sh \"...\""
  printf "%-15s %-36s %s\n" "copilot" "scripts/adapters/copilot-acp.sh" "acpx copilot \"...\""
  printf "%-15s %-36s %s\n" "codex" "scripts/adapters/codex-acp.sh" "acpx codex \"...\""
  printf "%-15s %-36s %s\n" "claude-mm" "scripts/adapters/claude-mm-acp.sh" "acpx claude \"...\" (MiniMax Profile)"
  printf "%-15s %-36s %s\n" "claude-glm" "scripts/adapters/claude-glm-acp.sh" "acpx claude \"...\" (GLM Profile)"
  echo "-------------------------------------------------------------------------------------------------"
  echo "技术基石: 基于 JSON-RPC 2.0 stdio 结构化流式传输，彻底消灭 PTY 终端刮取与挂死"
  echo "出处与完整手册: docs-coolie/TOOLS.md §8"
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
  acp)
    acp_tools
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