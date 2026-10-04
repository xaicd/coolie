#!/usr/bin/env bash
# scripts/run-persona-automation.sh [--persona=<name>] [--scenario=<id>] [--kind=testing|operations] [--all]
#
# Coolie 自动化测试与自动化运营 Persona 执行器
# 基于 agent-browser / agent-device 驱动数字员工执行业务验收与常态化巡检。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PERSONA="all"
SCENARIO=""
KIND=""
DRY_RUN="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --persona=*)
      PERSONA="${1#*=}"
      shift
      ;;
    --scenario=*)
      SCENARIO="${1#*=}"
      shift
      ;;
    --kind=*)
      KIND="${1#*=}"
      shift
      ;;
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    --all)
      PERSONA="all"
      SCENARIO="all"
      shift
      ;;
    *)
      echo "未知参数: $1"
      echo "用法: scripts/run-persona-automation.sh [--persona=ds|fdse|pre-sre|fda|ops-web|ops-mobile] [--scenario=<id>] [--all]"
      exit 1
      ;;
  esac
done

echo "=== [Coolie Persona Automation] 数字员工自动化测试与运营调度器 ==="
echo "Persona:   $PERSONA"
echo "Scenario:  ${SCENARIO:-"(自动匹配)"}"
echo "Kind:      ${KIND:-"(全量)"}"
echo "--------------------------------------------------------"

# 运行 Vitest 测试套件
cd "$REPO_ROOT"
bash "$SCRIPT_DIR/host-exec.sh" "node_modules/.bin/vitest run --config packages/agent-automation/vitest.config.ts"

echo ""
echo "🎉 [Coolie Persona Automation] 数字员工自动化用例全部验证通过！"
