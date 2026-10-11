#!/usr/bin/env bash
set -euo pipefail

COMPANY_ID="da2e705c-c80a-411b-b2ae-e39372b1251f"
PROJECT_ID="a3b763bb-f751-4cdb-ac60-0c58a0c907cf"
API="http://localhost:3100/api"

create_task() {
  local title="$1"
  local desc="$2"
  local agent="$3"
  local wbs="$4"
  local priority="$5"
  local status="$6"

  local payload
  payload="$(node -e '
    console.log(JSON.stringify({
      title: process.argv[1],
      description: process.argv[2],
      projectId: process.argv[3],
      assigneeAgentId: process.argv[4],
      wbsCode: process.argv[5],
      priority: process.argv[6],
      status: process.argv[7],
      isMilestone: true
    }));
  ' "$title" "$desc" "$PROJECT_ID" "$agent" "$wbs" "$priority" "$status")"

  local res
  res="$(curl -s -X POST "$API/companies/$COMPANY_ID/issues" \
    -H "Content-Type: application/json" \
    -d "$payload")"

  echo "$res" | node -e '
    const d = JSON.parse(require("fs").readFileSync(0, "utf-8"));
    console.log("Created:", d.identifier, "|", d.title, "| Assignee:", d.assigneeAgentId);
  '
}

echo "=== Seeding Coolie Foundry CMMI WBS Milestones ==="

# G1 需求门禁 (RD/REQM) -> 墨斗 (FDA)
create_task \
  "[G1·需求] Coolie 工坊双端全生命周期意图流转规格说明书 (SRS + RTM)" \
  "CMMI G1 需求门禁：定义工坊 Web/Native 双端核心交互、意图转译提案卡片、数字员工任务流水线、两字按钮与全生命周期交付的 EARS 规格与双向追踪矩阵。" \
  "09af00a0-f1cd-4a17-8ef5-3a8bcba381d7" \
  "G1" \
  "critical" \
  "in_progress"

# G2 架构门禁 (TS/DAR) -> 墨斗 (FDA)
create_task \
  "[G2·架构] 工坊双核驱动与六大数字员工流水线概要设计 (HLD + DAR)" \
  "CMMI G2 架构门禁：定义活体业务本体与工坊总线通信架构、SSE 流式打字机协议、多员工状态同步模型与技术选型 DAR 加权决策分析。" \
  "09af00a0-f1cd-4a17-8ef5-3a8bcba381d7" \
  "G2" \
  "critical" \
  "todo"

# G3 契约与实现 (TS/LLD/VER) -> 铁匠 (Core SWE)
create_task \
  "[G3·契约与实现] 工坊双端组件对齐、提案卡片落地与 0 编译报错守卫 (LLD)" \
  "CMMI G3 详细设计与静态契约守卫：实现 FleetPipelineStrip、FoundryProposalCard 组件的双端像素级对齐，打通 /api/board/chat/stream 真实 LLM 流式输出，保证全仓 0 编译报错。" \
  "02cab729-c5b7-4a14-9ce9-5a34885c336a" \
  "G3" \
  "critical" \
  "todo"

# G4 验证与确认 (VER/VAL) -> 门神 (FDSE)
create_task \
  "[G4·真机走查] 宿主机 Android 真实模拟器全链路走查与四态快照验收 (Test Report)" \
  "CMMI G4 验证与确认全栈验收：依托宿主机 coolie-test 真实 Android 模拟器与 adb 隧道，执行工坊会话发送、流式响应、卡片渲染与动作执行的端到端四态真机走查与截图存证。" \
  "58dc794d-ae28-47f4-9e6e-5e798ef55df2" \
  "G4" \
  "critical" \
  "todo"

# G5 投产与基线 (CM/RSKM/PMC) -> 兑底渊 (PRE-SRE)
create_task \
  "[G5·投产SOP] 工坊发版制品指纹、OTA 增量发布与秒级回滚 SOP (Deploy SOP)" \
  "CMMI G5 配置管理与不可变生产投产：出具全栈发版制品指纹、7 处版本一致性守卫、OTA 增量推送与秒级回滚应急 SOP。" \
  "8a288a46-8598-4c68-b52e-545360e11929" \
  "G5" \
  "high" \
  "todo"

echo "=== All 5 CMMI WBS Milestones Seeded Successfully ==="
