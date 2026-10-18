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

# Dev Server 基址 (可被 COOLIE_DEV_SERVER_URL 覆盖, 供单测指向 mock 服务器, 不碰真实 3100).
DEV_SERVER_BASE="${COOLIE_DEV_SERVER_URL:-http://127.0.0.1:3100}"
# COOA-486 幂等去重窗口 (分钟): 命中近 N 分钟内同题 open 工单即复用, 不新建.
DEDUP_WINDOW_MIN="${COOLIE_DISPATCH_DEDUP_WINDOW_MIN:-10}"

INPUT="${*:-}"

# 0. 帮助指令与空输入直接拦截退出 (COOA-312): 严禁 --help / -h / help 进入 dispatcher 派单全链路起假 Issue
if [[ -z "$INPUT" || "$INPUT" == "--help" || "$INPUT" == "-h" || "$INPUT" == "help" ]]; then
  cat <<'EOF'
用法:
  bash scripts/hermes-boss-intent-dispatcher.sh "<老板一句话需求>"
  bash scripts/hermes-boss-intent-dispatcher.sh --expert "<老板的一句话反思/管理痛点>"
  bash scripts/hermes-boss-intent-dispatcher.sh --help

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
REVIEW_PROBE=0
POSITIONAL_ARGS=()

for arg in "$@"; do
  case "$arg" in
    --expert)
      EXPERT_MODE=1
      ;;
    --execute)
      EXECUTE_FLAG="--execute"
      ;;
    --review-probe)
      # COOA-486: 巡检/缺陷查询的**专用旗标**; 显式走探活拦截, 杜绝把巡检当派单.
      REVIEW_PROBE=1
      ;;
    --help|-h|help)
      cat <<'EOF'
用法:
  bash scripts/hermes-boss-intent-dispatcher.sh "<老板一句话需求>"
  bash scripts/hermes-boss-intent-dispatcher.sh --expert "<老板的一句话反思/管理痛点>"
  bash scripts/hermes-boss-intent-dispatcher.sh --help

核心能力:
  1. 0.5s 极速语义提取: 动词 + 宾语 + 约束
  2. 自动匹配 CMMI 25 任务表与 6 员工 × 7 工具池
  3. 自动同步在 Coolie Dev Server (本地施工总社) 创建 Issue 任务
  4. 自动补齐 7 要素 Brief 并调用 dispatch-local-employee.sh 生成 Receipt
  5. 秒级输出三元组反馈: 【谁 · 用什么工具 · 做什么】+ Dev Server 任务卡链接
  6. 遇到管理/技术咨询自动走 5 步专家法 (隐含真因/拆解/不够/升级/落地)
EOF
      exit 0
      ;;
    *)
      POSITIONAL_ARGS+=("$arg")
      ;;
  esac
done

INPUT="${POSITIONAL_ARGS[*]:-}"

# 0. 待办查询直接直通 Coolie Dev Server 任务大盘
if [[ "${INPUT:-}" =~ (待办|有哪些任务|任务列表|工单列表|未完成|有啥活|还有什么活|看下任务) ]]; then
  exec node "$SCRIPT_DIR/coolie-dev-task.mjs" list
fi

# 0.05 工具状态探测直通 (wave286 · 老板原话 "--probe-tool-status")
# 老板微信直发该标志位 = 真跑工具池健康探针并回传一屏状态, 直通 cron-team-status.sh,
# 严禁再误判为默认编码任务派给铁匠.
if [[ "${INPUT:-}" == "--probe-tool-status" || "$INPUT" == "--probe-tool" || "$INPUT" == "--probe-tools" || "$INPUT" == "--tool-status" ]]; then
  echo "【Hermes 微信直通 · 工具池状态探测 (--probe-tool-status)】"
  exec bash "$SCRIPT_DIR/cron-team-status.sh" --probe-tool-status
fi

# 0.01 干跑门禁 (COOA-485): 供自动化测试与预演使用, 严禁触碰 Dev Server 建单与本地派单两条写路径.
# 缺少它时 §0.06 回归用例会真在 3100 上建出假 Issue (巡检单风暴的二级来源).
DRY_RUN="${COOLIE_DISPATCH_DRY_RUN:-0}"

# 0.06 Hermes 探活前缀拦截门禁 (wave286 经验 · COOA-480 误触沉淀 · COOA-485/486 补缺)
# 掌柜自己用 dispatcher 探活时容易把探活文本当真指令派出去 (心法 #190)。
# 凡含「探活 / probe-only / dry-probe / 巡检hourly / hourly routine / routine test / 探针」关键词,
# 或「主线巡检 / 缺陷…巡检 / 巡检…缺陷 / 本轮…缺陷 / 这轮…缺陷 / 看看…缺陷」这类裸巡检缺陷查询语,
# 或显式 --review-probe 旗标, dispatcher 均不予派单, 提示走专用探针/巡检旗标或直读巡检单,
# 严禁再误判为默认 forge-core-swe 派单 (COOA-486: 一句探活原话曾裂变 5 张工单)。
# 说明: 只拦「巡检…缺陷 / 看看…缺陷」查询语, 保留 `业务巡检` 等真实 DS 派单路由 (§1 分流) 不被误伤。
if [[ "${REVIEW_PROBE:-0}" == "1" || "${INPUT:-}" =~ (探活|probe-only|dry-probe|巡检hourly|hourly[[:space:]]?routine|routine[[:space:]]?test|探针|主线巡检|缺陷[^[:space:]]*巡检|巡检[^[:space:]]*缺陷|本轮[^[:space:]]*缺陷|这轮[^[:space:]]*缺陷|看看[^[:space:]]*缺陷) ]]; then
  cat <<EOF
【Hermes · 探活/巡检查询拦截 (wave286 · COOA-485/486)】
掌柜, 检测到您的指令「${INPUT:-}」属探活或巡检缺陷查询, dispatcher 不予派单, 避免重复误建假 Issue (心法 #190 已踩 2 次)。
要看本轮主线巡检缺陷: 直接看小时级「交付主线」routine 最近一张巡检单的评论 (含本轮真缺陷清单), 无需再派单。
要显式标记巡检查询: --review-probe "<巡检/缺陷查询语>"  (等效于本拦截, 不派单)
要真跑探针:      --probe-tool-status
要走反思解读:    --expert "<反思/痛点>"
要看待办大盘:    bash scripts/coolie-dev-task.mjs list
要派真业务活:    直接发含明确动词+宾语的具体指令 (例如“修一下工单审批流卡死”)。
EOF
  exit 0
fi

# 0.1 模糊意图检测与 Echo 澄清追问门禁 (Palantir Echo Clarification Gate)
if [[ "${INPUT:-}" =~ ^(修一下|改改|改一下|看下|弄下|加个|处理下|搞一下|修|改|看)$ ]]; then
  cat <<EOF
【Hermes · Echo 意图澄清追问】
掌柜，您的指令「${INPUT:-}」范围较模糊，请直接回复序号或补充上下文：
  [1] 移动端原生体验修复（两字按钮/底栏/布局塌陷）
  [2] 后台服务与控制面逻辑修复（审批流/多租户/数据库）
  [3] 生产发布与 OTA 增量同步问题（版本号/Caddy/缓存）
或直接在微信回复更具体的业务目标（例如：“修一下工单审批流卡死”）。
EOF
  exit 0
fi

# 0.2 长任务 18-20 分钟断点续接门禁 (Long-Running Task Continuation & Baton Relay)
if [[ "${INPUT:-}" =~ ^(继续|接着干|继续做|继续跑|接着跑|继续干|未完继续|断点续跑)$ ]]; then
  DISPATCH_DIR="${COOLIE_LOCAL_DIR:-$REPO_ROOT/.coolie-local}/dispatch"
  LATEST_RECEIPT="$(ls -t "$DISPATCH_DIR"/*.json 2>/dev/null | head -1 || true)"
  
  if [[ -z "$LATEST_RECEIPT" || ! -f "$LATEST_RECEIPT" ]]; then
    echo "【Hermes 微信播报】未检测到历史未结单任务，当前队列全员空闲，请直接下达新需求！"
    exit 0
  fi

  # 提取上一棒任务元数据
  PREV_TASK="$(node -e 'try { const r = JSON.parse(require("fs").readFileSync(process.argv[1])); console.log(r.task || ""); } catch(e){}' "$LATEST_RECEIPT")"
  PREV_AGENT="$(node -e 'try { const r = JSON.parse(require("fs").readFileSync(process.argv[1])); console.log(r.agent || "forge-core-swe"); } catch(e){}' "$LATEST_RECEIPT")"
  PREV_EMPLOYEE="$(node -e 'try { const r = JSON.parse(require("fs").readFileSync(process.argv[1])); console.log(r.employee || "铁匠"); } catch(e){}' "$LATEST_RECEIPT")"
  PREV_TOOL="$(node -e 'try { const r = JSON.parse(require("fs").readFileSync(process.argv[1])); console.log(r.tool || "claude-glm"); } catch(e){}' "$LATEST_RECEIPT")"
  PREV_WAVE="$(node -e 'try { const r = JSON.parse(require("fs").readFileSync(process.argv[1])); console.log(r.wave || "wave302"); } catch(e){}' "$LATEST_RECEIPT")"

  # 清理可能存在的前置 "【断点接力】" 前缀，避免层层嵌套
  CLEAN_TASK="${PREV_TASK#【断点接力续跑】}"
  CLEAN_TASK="${CLEAN_TASK#【断点续跑】}"

  echo "【Hermes 微信秒级断点续跑接力】"
  echo "────────────────────────────────────────"
  echo "🔄 触发模式: 18-20 分钟长任务断点接力 (Pass-the-Baton)"
  echo "👤 责任员工: $PREV_EMPLOYEE ($PREV_AGENT)"
  echo "🛠️ 执行工具: $PREV_TOOL"
  echo "🏷️ 当前波次: $PREV_WAVE"
  echo "⚡ 延续任务: $CLEAN_TASK"
  echo "📦 工作区状态: 100% 继承当前 Git 工作区半成品，坚决不推倒重来！"
  echo "────────────────────────────────────────"

  RELAY_TASK="【断点接力续跑】这是上游 18-20 分钟长耗时任务的延续。上游已产生部分代码修改，请在现有工作区基础上直接继续完成剩余逻辑、执行 pnpm check:governance 并收尾结单！原任务: $CLEAN_TASK"

  DISPATCH_ARGS=(
    --agent "$PREV_AGENT"
    --task "$RELAY_TASK"
    --wave "$PREV_WAVE"
    --tool "$PREV_TOOL"
  )
  if [[ -n "$EXECUTE_FLAG" || "${AUTO_EXECUTE:-0}" == "1" ]]; then
    DISPATCH_ARGS+=(--execute)
  fi

  "$SCRIPT_DIR/dispatch-local-employee.sh" "${DISPATCH_ARGS[@]}"

  echo ""
  echo "✅ 已成功唤醒第 2 棒续跑！工作区上下文已无缝注入，上游成果 100% 保留！"
  echo "微信 5 字段实时状态:"
  echo "$PREV_EMPLOYEE: $PREV_WAVE / 0m / $PREV_TOOL / 跑 (接力续跑中)"
  exit 0
fi

# 0.07 派单幂等去重门禁 (COOA-486 · 源自 wave286 D1: 一句原话裂变 5 张工单)
# 同一掌柜原话在窗口期 (默认 1800s) 内重复进入 dispatcher 时, 命中最近一次凭据即拒绝重复建单/派单.
# 与 dispatch-local-employee.sh §wave358 的区别: 那里只在已有 done 凭据时去重, 且在建单之后;
# 这里在建单之前按「规范化原话」跨凭据去重, 从源头掐断巡检/探活原话的裂变风暴.
# 窗口可用 COOLIE_DISPATCH_DEDUP_WINDOW_SEC 覆盖 (0 = 关闭去重, 供测试与强制复跑).
DEDUP_WINDOW_SEC="${COOLIE_DISPATCH_DEDUP_WINDOW_SEC:-1800}"
if [[ "$DEDUP_WINDOW_SEC" != "0" ]]; then
  DISPATCH_DIR_FOR_DEDUP="${COOLIE_LOCAL_DIR:-$REPO_ROOT/.coolie-local}/dispatch"
  DEDUP_HIT="$(node -e '
    const fs = require("fs"), path = require("path");
    const dir = process.argv[1], input = process.argv[2], win = Number(process.argv[3]) * 1000;
    const norm = (s) => String(s || "").replace(/[\s\u3000]+/g, "").toLowerCase();
    const key = norm(input);
    if (!key || !fs.existsSync(dir)) process.exit(0);
    const now = Date.now();
    let best = null;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".json")) continue;
      const p = path.join(dir, f);
      let d; try { d = JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { continue; }
      const ts = Date.parse(d.createdAt || "") || fs.statSync(p).mtimeMs;
      if (now - ts > win) continue;
      if (norm(d.bossInput) === key || norm(d.task) === key) {
        if (!best || ts > best.ts) best = { id: d.id || f, ts: new Date(ts).toISOString(), status: d.status, employee: d.employee };
      }
    }
    if (best) console.log(JSON.stringify(best));
  ' "$DISPATCH_DIR_FOR_DEDUP" "$INPUT" "$DEDUP_WINDOW_SEC" 2>/dev/null || true)"

  if [[ -n "$DEDUP_HIT" ]]; then
    cat <<EOF
【Hermes · 派单幂等去重 (COOA-486)】
掌柜, 同一句指令在 ${DEDUP_WINDOW_SEC}s 内重复派单, 已命中最近一次凭据, 不再重复建单/派单 (杜绝一句原话裂变多张工单):
  $(printf '%s' "$DEDUP_HIT")
如需强制复跑: 设 COOLIE_DISPATCH_DEDUP_WINDOW_SEC=0, 或改用含明确新动作的具体指令。
EOF
    exit 0
  fi
fi

# 1. 意图分类与特征提取
AGENT="forge-core-swe"
EMPLOYEE="铁匠"
TOOL="agy"
CATEGORY="dev"
CMMI_PHASE="Phase 4.1 编码"
AGENT_ID="02cab729-c5b7-4a14-9ce9-5a34885c336a"
SPEC_TYPE="feature"

# 关键词规则扫描
if [[ "$EXPERT_MODE" -eq 1 ]] || [[ "${INPUT:-}" =~ (为什么.*慢|为什么.*乱|为什么这样|怎么回事|感觉.*没理解|你觉得呢|给个建议) ]]; then
  CATEGORY="expert"
elif [[ "${INPUT:-}" =~ (原型|选型|调研|架构|画图|设计|spec|SRS|选.*vs) ]]; then
  AGENT="modou-fda"
  EMPLOYEE="墨斗"
  TOOL="agy-gemini3.8"
  CATEGORY="arch"
  CMMI_PHASE="Phase 1.4 选型研判 / Phase 3.1 系统设计"
  AGENT_ID="09af00a0-f1cd-4a17-8ef5-3a8bcba381d7"
elif [[ "${INPUT:-}" =~ (部署|发版|OTA|上线|运维|manifest|tag|重启) ]]; then
  AGENT="duidiyuan-pre-sre"
  EMPLOYEE="兑底渊"
  TOOL="copilot"
  CATEGORY="ops"
  CMMI_PHASE="Phase 5.1 部署执行"
  AGENT_ID="8a288a46-8598-4c68-b52e-545360e11929"
elif [[ "${INPUT:-}" =~ (审查|review|金标|真机|验收金标|紧急跑|单测|端到端|测试用例|压测) ]]; then
  AGENT="menshen-fdse"
  EMPLOYEE="门神"
  TOOL="claude-mm"
  CATEGORY="qa-gate"
  CMMI_PHASE="Phase 4.3 代码审查 / 5.3 验收金标"
  AGENT_ID="58dc794d-ae28-47f4-9e6e-5e798ef55df2"
elif [[ "${INPUT:-}" =~ (验收|监控|告警|风控|数据分析|测试|撞机|走查|复盘|回归|运营|对账|平账|多租户开通|业务巡检) ]]; then
  AGENT="baixiaosheng-ds"
  EMPLOYEE="百晓生"
  TOOL="claude-mm"
  CATEGORY="ds"
  CMMI_PHASE="Phase 2.5 风险评估 / 5.3 验收测试 / Phase 9 商业运营"
  AGENT_ID="58bb5a96-c241-4b35-babb-1cc1771d5dd5"
else
  # 默认代码实现、性能优化、修bug -> 铁匠 (老板拍板统一默认使用 agy)
  AGENT="forge-core-swe"
  EMPLOYEE="铁匠"
  TOOL="agy"
  CATEGORY="dev"
  CMMI_PHASE="Phase 4.1 编码"
  AGENT_ID="02cab729-c5b7-4a14-9ce9-5a34885c336a"
fi

if [[ "${INPUT:-}" =~ (bug|修复|崩溃|报错|异常|死循环|缺陷) ]]; then
  SPEC_TYPE="bugfix"
elif [[ "${INPUT:-}" =~ (重构|解耦|清理|优化|抽取|refactor) ]]; then
  SPEC_TYPE="refactor"
elif [[ "${INPUT:-}" =~ (安全|权限|防线|红队|渗透|漏洞|security) ]]; then
  SPEC_TYPE="security"
fi

# 1.1 梯次分流与 Token 控制判定 (L1 / L2 / L3)
TASK_LEVEL="L2-标准"
TOKEN_ESTIMATE="中等 (~2-5万 Tokens)"
DISCIPLINE_RULES=""

# 自动生成 Palantir Echo-Delta-Dev 三元工程指导
ECHO_OUTCOME="明确解决的核心业务阻碍与高管交付 Outcome"
DELTA_VERIFY="必须在真实模拟器/Web 或生产接口跑通，提供真机快照或命令结果存证"
DEV_BACKPROP="完工前必须通过 pnpm check:governance 并固化防退化自动化守卫"

if [[ "${INPUT:-}" =~ (文案|改下字|单点|错别字|微调|查日志|看下状态) ]]; then
  TASK_LEVEL="L1-快车道(轻量)"
  TOKEN_ESTIMATE="极低 (~3k-8k Tokens, 单兵直出)"
  DISCIPLINE_RULES="【L1 轻量铁律】单兵直出，先跑 scripts/check-governance-audit.sh 自检，严禁冗长上下文。"
elif [[ "${INPUT:-}" =~ (重构|新系统|多租户|架构重写|商业闭环) ]]; then
  TASK_LEVEL="L3-重大架构(全量CMMI)"
  TOKEN_ESTIMATE="高 (严格阶段门禁 G1-G5)"
  DISCIPLINE_RULES="【L3 架构铁律】严格遵从工业级标准与多租户隔离防线，产出完整 SRS 与 LLD。"
else
  TASK_LEVEL="L2-标准功能"
  TOKEN_ESTIMATE="中等 (~2-5万 Tokens)"
fi

# 如果是测试验收类任务，强制附加真机/真浏览器铁律
if [[ "$CATEGORY" =~ (qa-gate|ds) ]]; then
  DISCIPLINE_RULES="$DISCIPLINE_RULES\n【CMMI G4 强制军规】必须使用 agent-device 或 agent-browser 真实启动设备/浏览器，严禁 Mock 假数据，必须附带真机截图或控制台真实日志，否则验收直接退单！"
elif [[ "$CATEGORY" == "dev" ]]; then
  DISCIPLINE_RULES="$DISCIPLINE_RULES\n【CMMI G3 强制军规】使用底座框架时严格遵从两字按钮与 shared 契约，完工前必须运行 pnpm check:governance 确保 0 报错！"
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

# 3. 极速自动生成 Wave 与本地派单(set -e + pipefail 下管道异常会致该赋值失败,需整体回退)
LATEST_WAVE_RAW="$(git -C "$REPO_ROOT" log -1 --pretty=%B 2>/dev/null | grep -oE 'wave[0-9]+' | head -1 || true)"
LATEST_WAVE="${LATEST_WAVE_RAW:-wave286}"
SAFE_TASK="$INPUT"

echo "【Hermes 微信秒级接单】"
echo "────────────────────────────────────────"
echo "👤 责任员工: $EMPLOYEE ($AGENT)"
echo "🛠️ 推荐工具: $TOOL"
echo "📐 规格类型: Spec-Kit ($SPEC_TYPE)"
echo "🚦 梯次分流: $TASK_LEVEL"
echo "💰 算力预估: $TOKEN_ESTIMATE"
echo "📌 CMMI 映射: $CMMI_PHASE"
echo "⚡ 任务目标: $SAFE_TASK"
echo "🏷️ 当前波次: $LATEST_WAVE"
echo "🎯 Echo 价值: $ECHO_OUTCOME"
echo "🧪 Delta 验证: $DELTA_VERIFY"
echo "🛡️ Dev 守卫: $DEV_BACKPROP"
echo "────────────────────────────────────────"

# 4. 同步联动 Coolie Dev Server 建立 Issue
DEV_COMPANY_ID="da2e705c-c80a-411b-b2ae-e39372b1251f" # Coolie 本地施工总社
ISSUE_IDENTIFIER=""
ISSUE_URL=""
ISSUE_REUSED=0

create_issue_on_dev() {
  set +u  # 函数体内嵌 local + 全局变量访问,关闭 -u 防止 unbound-variable 误报
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    echo "🧪 DRY_RUN (COOLIE_DISPATCH_DRY_RUN=1): 跳过 Dev Server 建单, 仅回显解析结果。"
    ISSUE_IDENTIFIER=""
    set -u
    return 0
  fi
  local _wave="${LATEST_WAVE:-wave286}"
  local _task="${SAFE_TASK:-未命名任务}"
  local _employee="${EMPLOYEE:-未指派}"
  local _tool="${TOOL:-shell}"
  local _level="${TASK_LEVEL:-L2-标准功能}"
  local _tokens="${TOKEN_ESTIMATE:-中等 (~2-5万 Tokens)}"
  local _phase="${CMMI_PHASE:-Phase 4.1 编码}"
  local _echo="${ECHO_OUTCOME:-明确的业务解决路径与高管交付 Outcome}"
  local _delta="${DELTA_VERIFY:-必须在真实模拟器/Web 或生产接口跑通,提供真机快照或命令结果存证}"
  local _devprop="${DEV_BACKPROP:-完工前必须通过 pnpm check:governance 并固化防退化自动化守卫}"
  local _rules="${DISCIPLINE_RULES:-无额外军规}"

  local title="【微信·老板·${_wave}】${_task}"
  local desc="由 Hermes 从老板微信/终端直通派发
- 来源渠道: 📱 微信 (老板直接发话)
- 责任员工: ${_employee}
- 工具: ${_tool}
- 梯次分流: ${_level}
- 算力预估: ${_tokens}
- CMMI 门禁: ${_phase}
- 【Echo 价值定义】: ${_echo}
- 【Delta 真实验证】: ${_delta}
- 【Dev 反向传播】: ${_devprop}
- 守卫军规:
${_rules}"

  # ═══ COOA-486 幂等门禁: POST 建单前先查「近 N 分钟内同题 open 工单」, 命中即复用 ═══
  # 掌柜一句原话在 §3 每次无条件 POST 下裂变成多张重单 (COOA-481~485).
  # 复用路径 MUST NOT 建新 Issue, 外层亦 MUST NOT 再写新 Receipt.
  local _issues_json="" _dedup_json="" _hit_ident=""
  _issues_json="$(curl -fsS "$DEV_SERVER_BASE/api/companies/$DEV_COMPANY_ID/issues?limit=50" 2>/dev/null || true)"
  _dedup_json="$(printf '%s' "$_issues_json" | node "$SCRIPT_DIR/lib/dispatcher-intent-dedup.mjs" --input "$_task" --wave "$_wave" --window "$DEDUP_WINDOW_MIN" 2>/dev/null || true)"
  _hit_ident="$(printf '%s' "$_dedup_json" | node -e 'try{const o=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write((o.hit&&o.hit.identifier)||"")}catch(e){}' 2>/dev/null || true)"
  if [[ -n "$_hit_ident" ]]; then
    ISSUE_IDENTIFIER="$_hit_ident"
    ISSUE_URL="$DEV_SERVER_BASE/issues/$_hit_ident"
    ISSUE_REUSED=1
    set -u
    return 0
  fi

  local json_payload
  json_payload="$(node -e '
    console.log(JSON.stringify({
      title: process.argv[1],
      description: process.argv[2],
      priority: "high",
      status: "todo",
      assigneeAgentId: process.argv[3],
      specKit: {
        enabled: true,
        type: process.argv[4] || "feature",
        domain: "governance",
        brief: process.argv[5]
      }
    }));
  ' "$title" "$desc" "$AGENT_ID" "${SPEC_TYPE:-feature}" "$_task")"

  local res=""
  if curl -fsS "$DEV_SERVER_BASE/api/health" >/dev/null 2>&1; then
    res="$(printf '%s' "$json_payload" | curl -fsS -X POST "$DEV_SERVER_BASE/api/companies/$DEV_COMPANY_ID/issues" -H 'Content-Type: application/json' -d @- 2>/dev/null || true)"
  elif [[ -x "$SCRIPT_DIR/host-exec.sh" ]]; then
    local b64_payload
    b64_payload="$(printf '%s' "$json_payload" | base64 | tr -d '\r\n')"
    res="$("$SCRIPT_DIR/host-exec.sh" "echo '$b64_payload' | base64 -d | curl -fsS -X POST $DEV_SERVER_BASE/api/companies/$DEV_COMPANY_ID/issues -H 'Content-Type: application/json' -d @-" 2>/dev/null || true)"
  fi

  if [[ -n "$res" ]]; then
    ISSUE_IDENTIFIER="$(node -e 'try { console.log(JSON.parse(process.argv[1]).identifier || ""); } catch(e){}' "$res")"
    if [[ -n "$ISSUE_IDENTIFIER" ]]; then
      ISSUE_URL="$DEV_SERVER_BASE/issues/$ISSUE_IDENTIFIER"
    fi
  fi

  set -u  # 恢复 nounset 防线
}

create_issue_on_dev || true

if [[ "${ISSUE_REUSED:-0}" == "1" ]]; then
  echo "♻️ Dev Server 幂等复用既有工单: $ISSUE_IDENTIFIER (未新建 Issue · COOA-486)"
  echo "🔗 任务卡片链接: $ISSUE_URL"
elif [[ -n "$ISSUE_IDENTIFIER" ]]; then
  echo "📋 Dev Server 已建任务: $ISSUE_IDENTIFIER (分配给: $EMPLOYEE)"
  echo "📐 Spec-Kit 规格: SDD 脚手架已启动 (${SPEC_TYPE:-feature} · docs/specs/)"
  echo "🔗 任务卡片链接: $ISSUE_URL"
else
  echo "⚠️ Dev Server (${DEV_SERVER_BASE}) 任务同步未完成 (仅落本地 Receipt)"
fi

# 4.9 干跑收尾 (COOA-485): 解析结果已回显, 严禁再落本地 Receipt 与派单, 保证预演/测试零写副作用.
if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "🧪 DRY_RUN 结束: 未建 Dev Server 任务, 未生成 Receipt, 未派单。"
  exit 0
fi

# 4.95 幂等复用收尾 (COOA-486): 命中既有 open 工单 → 不新建 Issue, 不再写新 Receipt.
if [[ "${ISSUE_REUSED:-0}" == "1" ]]; then
  echo "⏭️ 幂等收尾: 复用既有工单 $ISSUE_IDENTIFIER, 未新建 Issue / 未写新 Receipt。"
  echo "微信 5 字段实时状态:"
  echo "$EMPLOYEE: $LATEST_WAVE / 0m / $TOOL / 跑 (复用既有工单)"
  exit 0
fi

# 5. 调用本地派单脚本，生成 Receipt
# 🛡️ 单写者防重门禁 (Single-Writer Anti-Double-Execution Guard):
# 若 Dev Server (3100) 已经成功建单接管，除非显式传入 --execute，否则不自动抢跑本地执行，
# 统一交由控制面心跳 Runner 推进，彻底杜绝「本地进程跑一次 + Dev Server 跑一次」的双重执行隐患！
DISPATCH_ARGS=(
  --agent "$AGENT"
  --task "$SAFE_TASK"
  --wave "$LATEST_WAVE"
  --tool "$TOOL"
)

# COOA-486: Receipt 带去重键 (掌柜原话归一化哈希), 重复调用 dispatch 时同键未终结 receipt 跳过新增.
DEDUP_KEY="$(node "$SCRIPT_DIR/lib/dispatcher-intent-dedup.mjs" --input "$SAFE_TASK" --print-key 2>/dev/null || true)"
if [[ -n "$DEDUP_KEY" ]]; then
  DISPATCH_ARGS+=(--dedup-key "$DEDUP_KEY")
fi

if [[ -n "$EXECUTE_FLAG" ]]; then
  # 显式传参 --execute: 人工强制本地直跑
  DISPATCH_ARGS+=(--execute)
elif [[ -n "$ISSUE_IDENTIFIER" ]]; then
  # Dev Server 已成功接单: 默认只生成本地 Receipt 留存证据，由 Dev Server 控制面负责单写者执行
  echo "🛡️ 单写者防重机制已激活: 任务由 Dev Server 控制面统一调度，本地生成 Receipt，避免双重执行冲突。"
elif [[ "${AUTO_EXECUTE:-0}" == "1" ]]; then
  # 仅在 Dev Server 离线且开启了自动执行时回退本地直跑
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
