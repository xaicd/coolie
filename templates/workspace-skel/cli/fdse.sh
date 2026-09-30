#!/usr/bin/env bash
# cli/fdse.sh — FDSE（前线部署全栈 / 交付第一责任人）派单入口 —— 开发基座骨架
#
# 基座不含业务，本脚本只有骨架：空函数 + TODO。派单实现按项目落地时补全。
# 职责与门禁见 docs/ARCHITECTURE.md；角色细化 skill 见主仓 .agents/skills/fdse/。
set -euo pipefail

# dispatch <任务描述> — 把一条任务派给本角色的员工。
# TODO: 接平台派单入口（ai-workshop-dispatch），组装本角色上下文后调用。
dispatch() {
  local task="${1:-}"
  : # TODO: implement
}

main() {
  # TODO: 解析参数并调用 dispatch。
  echo "role fdse: skeleton (TODO: implement dispatch — see docs/ARCHITECTURE.md)" >&2
}

main "$@"
