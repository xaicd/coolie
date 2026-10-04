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
TARGET_ENV=""
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
    --env=*)
      TARGET_ENV="${1#*=}"
      shift
      ;;
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    --list)
      echo "=== [Coolie Persona Automation] 可用 Playbook 清单 ==="
      echo "【阶段一：本地测试与生产上线初期测试介入】"
      echo "  1. test-governance-waiver      [testing]           [门神 FDSE]   [local]      engine: browser (特批会签)"
      echo "  2. test-inbox-approvals        [testing]           [百晓生 DS]   [local]      engine: browser (收件箱审批)"
      echo "  3. test-ontology-domains       [testing]           [墨斗 FDA]    [local]      engine: browser (本体多域)"
      echo "  4. test-mobile-app             [testing]           [Mobile Ops]  [local]      engine: device  (移动端无白屏)"
      echo "  5. prod-go-live-verification   [prod-verification] [百晓生 DS]   [production] engine: hybrid  (生产上线冒烟签收)"
      echo ""
      echo "【阶段二：长效常态化运营与监控】"
      echo "  6. ops-governance-patrol       [operations]        [兑底渊 SRE]  [production] engine: browser (门禁越界巡查)"
      echo "  7. ops-inbox-triage            [operations]        [Web Ops]     [production] engine: browser (待办督办与打理)"
      echo "  8. ops-ontology-patrol         [operations]        [百晓生 DS]   [production] engine: browser (孤立实体审查)"
      echo "  9. ops-mobile-ota-check        [operations]        [兑底渊 SRE]  [production] engine: device  (OTA 版本一致性)"
      echo " 10. prod-continuous-patrol      [operations]        [Web Ops]     [production] engine: hybrid  (生产长效巡检)"
      exit 0
      ;;
    --all)
      PERSONA="all"
      SCENARIO="all"
      shift
      ;;
    *)
      echo "未知参数: $1"
      echo "用法: scripts/run-persona-automation.sh [--list] [--env=local|production] [--persona=ds|fdse|pre-sre|fda|ops-web|ops-mobile] [--kind=testing|operations|prod-verification] [--scenario=<id>] [--all]"
      exit 1
      ;;
  esac
done

if [[ -z "$TARGET_ENV" ]]; then
  if [[ "$KIND" == "testing" ]]; then
    TARGET_ENV="local (本地靶场 http://localhost:3100)"
  elif [[ "$KIND" == "prod-verification" ]]; then
    TARGET_ENV="production (生产上线初期冒烟验收 https://xrobinai.cn)"
  elif [[ "$KIND" == "operations" ]]; then
    TARGET_ENV="production (生产长效运营巡检 https://xrobinai.cn)"
  else
    TARGET_ENV="auto (测试->本地，生产验收->生产冒烟，运营->生产巡查)"
  fi
fi

echo "=== [Coolie Persona Automation] 数字员工自动化测试与运营调度器 ==="
echo "Environment: $TARGET_ENV"
echo "Persona:     $PERSONA"
echo "Scenario:    ${SCENARIO:-"(自动匹配)"}"
echo "Kind:        ${KIND:-"(全量)"}"
echo "--------------------------------------------------------"

# 运行 Vitest 测试套件
cd "$REPO_ROOT"
bash "$SCRIPT_DIR/host-exec.sh" "node_modules/.bin/vitest run --config packages/agent-automation/vitest.config.ts"

echo ""
echo "🎉 [Coolie Persona Automation] 数字员工自动化用例全部验证通过！"
