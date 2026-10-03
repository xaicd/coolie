#!/usr/bin/env bash
# scripts/hermes-boss-intent-dispatcher.sh
# 
# Hermes (掌柜) 微信/QQ 老板原话直通意图解析与秒级派单引擎
# 遵循 wave276 (5字段) + wave279g (5步专家法) + wave280 (Hermes自己) + wave282 (Receipt状态机)
# 联动 Coolie Dev Server (端口 3100) 自动建立 COOA Issue
#
# 用法:
#   bash scripts/hermes-boss-intent-dispatcher.sh "修一下任务页卡顿"
#   bash scripts/hermes-boss-intent-dispatcher.sh --expert "感觉派活很慢，都没理解我的话"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

INPUT="${*:-}"

if [[ -z "$INPUT" ]]; then
  cat <<'EOF'
用法:
  bash scripts/hermes-boss-intent-dispatcher.sh "<老板一句话需求>"
  bash scripts/hermes-boss-intent-dispatcher.sh --expert "<老板的一句话反思/管理痛点>"

核心能力:
  1. 0.5s 极速语义提取: 动词 + 宾语 + 约束
  2. 自动匹配 CMMI 25 任务表与 6 员工 × 7 工具池
  3. 自动同步在 Coolie Dev Server (本地施工总社) 创建 Issue 任务
  4. 自动补齐 7 要素 Brief 并调用 dispatch-local-employee.sh 生成 Receipt
  5. 秒级输出三元组反馈: 【谁 · 用什么工具 · 做什么】+ Dev Server 任务卡链接
  6. 遇到管理/技术咨询自动走 5 步专家法 (隐含真因/拆解/不够/升级/落地)
EOF
  exit 0
fi

EXPERT_MODE=0
EXECUTE_FLAG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --expert)
      EXPERT_MODE=1
      shift
      ;;
    --execute)
      EXECUTE_FLAG="--execute"
      shift
      ;;
    *)
      break
      ;;
  esac
done

INPUT="${*:-}"

# 0. 待办查询直接直通 Coolie Dev Server 任务大盘
if [[ "$INPUT" =~ (待办|有哪些任务|任务列表|工单列表|未完成|有啥活|还有什么活|看下任务) ]]; then
  exec "$SCRIPT_DIR/coolie-dev-task.mjs" list
fi

# 1. 意图分类与特征提取
AGENT="forge-core-swe"
EMPLOYEE="铁匠"
TOOL="claude-glm"
CATEGORY="dev"
CMMI_PHASE="Phase 4.1 编码"
AGENT_ID="02cab729-c5b7-4a14-9ce9-5a34885c336a"

# 关键词规则扫描
if [[ "$EXPERT_MODE" -eq 1 ]] || [[ "$INPUT" =~ (为什么.*慢|为什么.*乱|为什么这样|怎么回事|感觉.*没理解|你觉得呢|给个建议) ]]; then
  CATEGORY="expert"
elif [[ "$INPUT" =~ (原型|选型|调研|架构|画图|设计|spec|SRS|选.*vs) ]]; then
  AGENT="modou-fda"
  EMPLOYEE="墨斗"
  TOOL="agy-gemini3.8"
  CATEGORY="arch"
  CMMI_PHASE="Phase 1.4 选型研判 / Phase 3.1 系统设计"
  AGENT_ID="09af00a0-f1cd-4a17-8ef5-3a8bcba381d7"
elif [[ "$INPUT" =~ (部署|发版|OTA|上线|运维|manifest|tag|重启) ]]; then
  AGENT="duidiyuan-pre-sre"
  EMPLOYEE="兑底渊"
  TOOL="copilot"
  CATEGORY="ops"
  CMMI_PHASE="Phase 5.1 部署执行"
  AGENT_ID="8a288a46-8598-4c68-b52e-545360e11929"
elif [[ "$INPUT" =~ (审查|review|金标|真机|验收金标|紧急跑) ]]; then
  AGENT="menshen-fdse"
  EMPLOYEE="门神"
  TOOL="cmd"
  CATEGORY="qa-gate"
  CMMI_PHASE="Phase 4.3 代码审查 / 5.3 验收金标"
  AGENT_ID="58dc794d-ae28-47f4-9e6e-5e798ef55df2"
elif [[ "$INPUT" =~ (验收|监控|告警|风控|数据分析|测试|撞机|走查|复盘) ]]; then
  AGENT="baixiaosheng-ds"
  EMPLOYEE="百晓生"
  TOOL="claude-mm"
  CATEGORY="ds"
  CMMI_PHASE="Phase 2.5 风险评估 / 5.3 验收测试 / 5.5 复盘"
  AGENT_ID="58bb5a96-c241-4b35-babb-1cc1771d5dd5"
else
  # 默认代码实现、性能优化、修bug -> 铁匠
  AGENT="forge-core-swe"
  EMPLOYEE="铁匠"
  TOOL="claude-glm"
  CATEGORY="dev"
  CMMI_PHASE="Phase 4.1 编码"
  AGENT_ID="02cab729-c5b7-4a14-9ce9-5a34885c336a"
fi

# 1.1 梯次分流与 Token 控制判定 (L1 / L2 / L3)
TASK_LEVEL="L2-标准"
TOKEN_ESTIMATE="中等 (~2-5万 Tokens)"
DISCIPLINE_RULES=""

if [[ "$INPUT" =~ (文案|改下字|单点|错别字|微调|查日志|看下状态) ]]; then
  TASK_LEVEL="L1-快车道(轻量)"
  TOKEN_ESTIMATE="极低 (~3k-8k Tokens, 单兵直出)"
  DISCIPLINE_RULES="【L1 轻量铁律】单兵直出，先跑 scripts/toolkits/fast-precheck.sh 自检，严禁冗长上下文。"
elif [[ "$INPUT" =~ (重构|新系统|多租户|架构重写|商业闭环) ]]; then
  TASK_LEVEL="L3-重大架构(全量CMMI)"
  TOKEN_ESTIMATE="高 (严格阶段门禁 G1-G5)"
  DISCIPLINE_RULES="【L3 架构铁律】严格遵从 Next.js/React 官方工业级标准与多企业隔离防线，产出完整 SRS 与 LLD。"
else
  TASK_LEVEL="L2-标准功能"
  TOKEN_ESTIMATE="中等 (~2-5万 Tokens)"
fi

# 如果是测试验收类任务，强制附加真机/真浏览器铁律
if [[ "$CATEGORY" =~ (qa-gate|ds) ]]; then
  DISCIPLINE_RULES="$DISCIPLINE_RULES\n【CMMI G4 强制军规】必须使用 agent-device 或 agent-browser 真实启动设备/浏览器，严禁 Mock 假数据，必须附带真机截图或控制台真实日志，否则验收直接退单！"
elif [[ "$CATEGORY" == "dev" ]]; then
  DISCIPLINE_RULES="$DISCIPLINE_RULES\n【CMMI G3 强制军规】使用底座框架时严格遵从现有 shared 契约与 Drizzle schema，提交前先跑 fast-precheck.sh 确保 0 报错！"
elif [[ "$CATEGORY" == "ops" ]]; then
  DISCIPLINE_RULES="$DISCIPLINE_RULES\n【CMMI G5 强制军规】必须基于 Caddy/Node/Postgres 全拓扑探测，排查线上首附 journalctl 真实日志片段与 DB 真值！"
fi

# 2. 如果是专家解读类诉求
if [[ "$CATEGORY" == "expert" ]]; then
  cat <<EOF
【Hermes 顶级专家解读 · 微信直通】
## 老板原话
"$INPUT"

## 1. 隐含真因
- 痛点表象: 微信里发话响应迟钝、大模型废话多或答非所问。
- 深层真因: 现有链路缺少“老板原话 → 领域实体与动作”的极速分流器，模型常陷入通用助理式客套与被动等待，没有以“资深项目掌柜”身份主动承接并闭环。老板要的是：发出一句话，0.5秒得到三元组接单凭证，背后自动转成规范工单。

## 2. 专家拆解 (4 维度)
- 本质: 把非结构化老板微信原话，0 延迟解析为结构化派单指令 (谁/工具/任务/Wave)。
- 边界: 聚焦 Mac 宿主机调度分发层，同步联动 Coolie Dev Server。
- 取舍: 绝不让老板在微信里填复杂参数；由 Hermes 自动推断并补齐 7 要素。
- 可落地: 固化 intent-dispatcher，老板一句话直通 dev server 建任务 + 本地派单。

## 3. 升级行动
- ✅ 秒级响应: 立即回传标准卡片 【谁 · 用什么工具 · 做什么】。
- ✅ 自动建任务: Coolie Dev Server (本地施工总社) 实时建 Issue 并指派员工。
- ✅ 自动入账: 直接落地 .coolie-local/dispatch/ Receipt 与状态机。
EOF
  exit 0
fi

# 3. 极速自动生成 Wave 与本地派单
LATEST_WAVE="$(git -C "$REPO_ROOT" log -1 --pretty=%B 2>/dev/null | grep -oE "wave[0-9]+" | head -1 || echo "wave286")"
SAFE_TASK="$INPUT"

echo "【Hermes 微信秒级接单】"
echo "────────────────────────────────────────"
echo "👤 责任员工: $EMPLOYEE ($AGENT)"
echo "🛠️ 推荐工具: $TOOL"
echo "🚦 梯次分流: $TASK_LEVEL"
echo "💰 算力预估: $TOKEN_ESTIMATE"
echo "📌 CMMI 映射: $CMMI_PHASE"
echo "⚡ 任务目标: $SAFE_TASK"
echo "🏷️ 当前波次: $LATEST_WAVE"
echo "────────────────────────────────────────"

# 4. 同步联动 Coolie Dev Server 建立 Issue
DEV_COMPANY_ID="da2e705c-c80a-411b-b2ae-e39372b1251f" # Coolie 本地施工总社
ISSUE_IDENTIFIER=""
ISSUE_URL=""

create_issue_on_dev() {
  local title="[$LATEST_WAVE] $SAFE_TASK"
  local desc="由 Hermes 从老板微信/终端直通派发\n- 责任员工: $EMPLOYEE\n- 工具: $TOOL\n- 梯次分流: $TASK_LEVEL\n- 算力预估: $TOKEN_ESTIMATE\n- CMMI 门禁: $CMMI_PHASE\n- 守卫军规:\n$DISCIPLINE_RULES"
  
  local json_payload
  json_payload="$(node -e '
    console.log(JSON.stringify({
      title: process.argv[1],
      description: process.argv[2],
      priority: "high",
      status: "todo",
      assigneeAgentId: process.argv[3]
    }));
  ' "$title" "$desc" "$AGENT_ID")"

  local res=""
  if [[ -x "$SCRIPT_DIR/host-exec.sh" ]]; then
    res="$("$SCRIPT_DIR/host-exec.sh" "curl -fsS -X POST http://localhost:3100/api/companies/$DEV_COMPANY_ID/issues -H 'Content-Type: application/json' -d '$json_payload'" 2>/dev/null || true)"
  elif command -v curl >/dev/null 2>&1; then
    res="$(curl -fsS -X POST "http://localhost:3100/api/companies/$DEV_COMPANY_ID/issues" -H 'Content-Type: application/json' -d "$json_payload" 2>/dev/null || true)"
  fi

  if [[ -n "$res" ]]; then
    ISSUE_IDENTIFIER="$(node -e 'try { console.log(JSON.parse(process.argv[1]).identifier || ""); } catch(e){}' "$res")"
    if [[ -n "$ISSUE_IDENTIFIER" ]]; then
      ISSUE_URL="http://localhost:3100/issues/$ISSUE_IDENTIFIER"
    fi
  fi
}

create_issue_on_dev || true

if [[ -n "$ISSUE_IDENTIFIER" ]]; then
  echo "📋 Dev Server 已建任务: $ISSUE_IDENTIFIER (分配给: $EMPLOYEE)"
  echo "🔗 任务卡片链接: $ISSUE_URL"
else
  echo "⚠️ Dev Server (3100) 任务同步未完成 (仅落本地 Receipt)"
fi

# 5. 调用本地派单脚本，生成 Receipt (若带 --execute 或 AUTO_EXECUTE=1 则直通执行)
DISPATCH_ARGS=(
  --agent "$AGENT"
  --task "$SAFE_TASK"
  --wave "$LATEST_WAVE"
  --tool "$TOOL"
)
if [[ -n "$EXECUTE_FLAG" || "${AUTO_EXECUTE:-0}" == "1" ]]; then
  DISPATCH_ARGS+=(--execute)
fi

"$SCRIPT_DIR/dispatch-local-employee.sh" "${DISPATCH_ARGS[@]}"

echo ""
if [[ -n "$EXECUTE_FLAG" || "${AUTO_EXECUTE:-0}" == "1" ]]; then
  echo "✅ 任务已直通执行并生成执行凭据！"
  echo "微信 5 字段实时状态:"
  echo "$EMPLOYEE: $LATEST_WAVE / 0m / $TOOL / 跑 (running -> done)"
else
  echo "✅ 已生成结构化派单收据 (Receipt)，已加入本地执行队列！"
  echo "微信 5 字段实时状态:"
  echo "$EMPLOYEE: $LATEST_WAVE / 0m / $TOOL / 跑 (queued -> running)"
fi
