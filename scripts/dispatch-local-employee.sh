#!/usr/bin/env bash
# scripts/dispatch-local-employee.sh --agent <subagent> --task <task> [--execute | --print]
#
# wave282 + 2026-10-02-local-dispatch-receipt spec
# wave290: agy-gemini3.8 --execute 走 docker exec 容器内 agy + base64 包装 prompt (修中文 argv 替换坑)
#
# This script gives Hermes one stable command shape for every local employee.
# By default it records a structured JSON receipt under `.coolie-local/dispatch/`
# alongside a prompt file, and prints the exact Hermes/Agent instruction.
# When `--execute` is passed, it executes the tool and records started/done status.

set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

AGENT=""
TASK=""
WAVE=""
TOOL=""
SPEC_PATH=""
BRIEF_PATH=""
EXECUTE=0
PRINT_ONLY=0
STATUS="queued"
COMMIT=""
BLOCKED_REASON=""
SHOW_RECEIPT=""
LIST_RECEIPTS=0
LIST_QUEUED_ONLY=0
FORCE=0

UPDATE_RECEIPT=""
UPDATE_STATUS=""
UPDATE_COMMIT=""
UPDATE_EVIDENCE=""
UPDATE_VERIFICATION=""
UPDATE_BLOCKED_REASON=""
UPDATE_LEDGER=""
NO_CONTEXT=0
HANDOVER_NOTE=""

usage() {
  cat <<'EOF'
usage: scripts/dispatch-local-employee.sh [options]

Fixed dispatch entrypoint for Hermes local employees with structured receipt.

Options:
  --agent <name>       sub-agent type to dispatch
  --task <task>        short task key or human task sentence
  --wave <wave>        wave identifier (e.g. wave283)
  --tool <tool>        override default tool for employee
  --spec <path>        path to spec document
  --brief <path>       path to brief document
  --execute            run command after recording receipt
  --print              print prompt only; do not record
  --no-context         do not inject upstream context bus into prompt
  --note <text>        handover note for context bus
  --list               list recent receipts in .coolie-local/dispatch/
  --queued             list only queued (pending) receipts
  --show <id>          show details of a specific receipt
  --update <id>        update an existing receipt
  --status <status>    update status (queued|running|done|blocked|failed|cancelled)
  --force              force update status to done even if gate ledger is not verified
  --commit <hash>      attach completed commit hash
  --evidence <path>    attach verification evidence or artifact path
  --verification <cmd> record verification command that passed
  --blocked-reason <r> set reason for blocked/failed status
  --ledger <path>      link G1-G5 evidence ledger path
  --help               show this help

Agents:
  hermes-pm            Hermes (PM / 掌柜)
  modou-fda            墨斗 (FDA)
  forge-core-swe       铁匠 (Core SWE)
  forge-ii-core-swe    铁匠贰号 (Core SWE 兜底)
  menshen-fdse         门神 (FDSE)
  duidiyuan-pre-sre    兑底渊 (PRE-SRE)
  baixiaosheng-ds      百晓生 (DS)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --agent) AGENT="${2:-}"; shift 2 ;;
    --task) TASK="${2:-}"; shift 2 ;;
    --wave) WAVE="${2:-}"; shift 2 ;;
    --tool) TOOL="${2:-}"; shift 2 ;;
    --spec) SPEC_PATH="${2:-}"; shift 2 ;;
    --brief) BRIEF_PATH="${2:-}"; shift 2 ;;
    --execute) EXECUTE=1; shift ;;
    --print) PRINT_ONLY=1; shift ;;
    --list) LIST_RECEIPTS=1; shift ;;
    --queued) LIST_RECEIPTS=1; LIST_QUEUED_ONLY=1; shift ;;
    --force) FORCE=1; shift ;;
    --show) SHOW_RECEIPT="${2:-}"; shift 2 ;;
    --update) UPDATE_RECEIPT="${2:-}"; shift 2 ;;
    --status) UPDATE_STATUS="${2:-}"; shift 2 ;;
    --commit) UPDATE_COMMIT="${2:-}"; shift 2 ;;
    --evidence) UPDATE_EVIDENCE="${2:-}"; shift 2 ;;
    --verification) UPDATE_VERIFICATION="${2:-}"; shift 2 ;;
    --blocked-reason) UPDATE_BLOCKED_REASON="${2:-}"; shift 2 ;;
    --ledger) UPDATE_LEDGER="${2:-}"; shift 2 ;;
    --no-context) NO_CONTEXT=1; shift ;;
    --note) HANDOVER_NOTE="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'unknown arg: %s\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
done

dispatch_dir="${COOLIE_LOCAL_DIR:-$REPO_ROOT/.coolie-local}/dispatch"
[[ -d "$dispatch_dir" || ! -d "$REPO_ROOT/.paperclip-local/dispatch" ]] || dispatch_dir="$REPO_ROOT/.paperclip-local/dispatch"
mkdir -p "$dispatch_dir"

if [[ "$LIST_RECEIPTS" -eq 1 ]]; then
  node -e '
const fs = require("fs");
const path = require("path");
const dir = process.argv[1];
const queuedOnly = process.argv[2] === "1";

const files = fs.readdirSync(dir)
  .filter(f => f.endsWith(".json"))
  .map(f => path.join(dir, f))
  .map(f => {
    try {
      const stat = fs.statSync(f);
      const data = JSON.parse(fs.readFileSync(f, "utf8"));
      return { file: f, mtime: stat.mtimeMs, data };
    } catch (e) {
      return null;
    }
  })
  .filter(Boolean)
  .sort((a, b) => b.mtime - a.mtime);

const filtered = queuedOnly ? files.filter(x => x.data.status === "queued") : files.slice(0, 15);

console.log(queuedOnly ? "【待处理工单队列 (QUEUED)】" : "【最近派单记录 (Dispatch Receipts)】");
if (filtered.length === 0) {
  console.log("暂无匹配的派单记录。");
  process.exit(0);
}

let queuedCount = 0;
files.forEach(x => { if (x.data.status === "queued") queuedCount++; });

filtered.forEach(x => {
  const d = x.data;
  let tag = `[${d.status.toUpperCase()}]`;
  if (d.status === "done") tag = "[✅ DONE]";
  else if (d.status === "queued") tag = "[⏳ QUEUED]";
  else if (d.status === "running") tag = "[🚀 RUNNING]";
  else if (d.status === "failed") tag = "[❌ FAILED]";
  else if (d.status === "blocked") tag = "[⛔ BLOCKED]";

  const time = d.createdAt ? d.createdAt.substring(11, 19) : "";
  console.log(`${tag} ${d.id} | ${d.employee || d.subagentType} (${d.tool}) | ${d.task}`);
  if (d.status === "queued") {
    console.log(`   └─ 执行命令: scripts/dispatch-local-employee.sh --agent ${d.subagentType} --task "${d.task}" --execute`);
  }
});

console.log(`\n统计: 待执行(queued)=${queuedCount} | 显示数=${filtered.length} | 目录=${dir}`);
' "$dispatch_dir" "$LIST_QUEUED_ONLY"
  exit 0
fi

if [[ -n "$SHOW_RECEIPT" ]]; then
  target_file="$dispatch_dir/$SHOW_RECEIPT"
  [[ -f "$target_file" ]] || target_file="$dispatch_dir/${SHOW_RECEIPT}.json"
  if [[ -f "$target_file" ]]; then
    cat "$target_file"
    exit 0
  else
    printf 'receipt not found: %s\n' "$SHOW_RECEIPT" >&2
    exit 1
  fi
fi

if [[ -n "$UPDATE_RECEIPT" ]]; then
  target_file="$dispatch_dir/$UPDATE_RECEIPT"
  [[ -f "$target_file" ]] || target_file="$dispatch_dir/${UPDATE_RECEIPT}.json"
  if [[ ! -f "$target_file" ]]; then
    printf 'receipt to update not found: %s\n' "$UPDATE_RECEIPT" >&2
    exit 1
  fi

  # Gate blocking guard: when marking done, verify gate evidence ledger unless --force is specified
  if [[ "$UPDATE_STATUS" == "done" && "$FORCE" -eq 0 ]]; then
    receipt_wave="$(node -e 'try { console.log(JSON.parse(require("fs").readFileSync(process.argv[1])).wave || ""); } catch(e){}' "$target_file")"
    if [[ -z "$receipt_wave" && "$UPDATE_RECEIPT" =~ wave[0-9]+ ]]; then
      receipt_wave="${BASH_REMATCH[0]}"
    fi
    if [[ -n "$receipt_wave" && -x "$SCRIPT_DIR/gate-evidence-ledger.sh" ]]; then
      local_base="${COOLIE_LOCAL_DIR:-$REPO_ROOT/.coolie-local}"
      [[ -d "$local_base/evidence-ledger" || ! -d "$REPO_ROOT/.paperclip-local/evidence-ledger" ]] || local_base="$REPO_ROOT/.paperclip-local"
      ledger_file="$local_base/evidence-ledger/${receipt_wave}.json"
      if [[ -f "$ledger_file" ]]; then
        printf '[dispatch] 正在验证 %s 的 G1-G5 门禁证据账本...\n' "$receipt_wave"
        if ! bash "$SCRIPT_DIR/gate-evidence-ledger.sh" --verify "$receipt_wave"; then
          printf '\n[dispatch] ⛔ 门禁阻断: 当前任务关联的门禁尚未闭环，禁止将工单标记为 done！\n' >&2
          printf '提示: 请先使用 scripts/gate-evidence-ledger.sh 闭环门禁，或使用 --force 强制覆盖。\n' >&2
          exit 1
        fi
      fi
    fi
  fi

  now_iso="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  node -e '
const fs = require("fs");
const file = process.argv[1];
const status = process.argv[2];
const commit = process.argv[3];
const evidence = process.argv[4];
const verification = process.argv[5];
const blockedReason = process.argv[6];
const ledger = process.argv[7];
const nowIso = process.argv[8];

const r = JSON.parse(fs.readFileSync(file, "utf8"));
if (status) {
  r.status = status;
  if ((status === "done" || status === "failed" || status === "cancelled") && !r.completedAt) {
    r.completedAt = nowIso;
  }
  if (status === "running" && !r.startedAt) {
    r.startedAt = nowIso;
  }
}
if (commit) {
  r.commit = commit;
}
if (blockedReason) {
  r.blockedReason = blockedReason;
} else if (status === "done" || status === "running") {
  r.blockedReason = null;
}
if (ledger) {
  r.ledgerPath = ledger;
}
if (evidence) {
  r.evidence = Array.isArray(r.evidence) ? r.evidence : [];
  if (!r.evidence.includes(evidence)) {
    r.evidence.push(evidence);
  }
}
if (verification) {
  r.verification = Array.isArray(r.verification) ? r.verification : [];
  if (!r.verification.includes(verification)) {
    r.verification.push(verification);
  }
}
fs.writeFileSync(file, JSON.stringify(r, null, 2) + "\n", "utf8");
console.log(`[dispatch] updated receipt: ${file} (status=${r.status || "unchanged"})`);
' "$target_file" "$UPDATE_STATUS" "$UPDATE_COMMIT" "$UPDATE_EVIDENCE" "$UPDATE_VERIFICATION" "$UPDATE_BLOCKED_REASON" "$UPDATE_LEDGER" "$now_iso"
  exit 0
fi

case "$AGENT" in
  "") printf 'missing --agent\n' >&2; usage >&2; exit 2 ;;
esac
# wave285: 合法 agentId 不再枚举硬编码, 由名册 (team-roster.sh) 判定, 见下方 roster_lookup 块。

if [[ -z "$TASK" ]]; then
  printf 'missing --task\n' >&2
  usage >&2
  exit 2
fi

agent_template="$REPO_ROOT/.agents/agents/$AGENT.md"
if [[ ! -f "$agent_template" ]]; then
  printf 'missing agent template: %s\n' "$agent_template" >&2
  exit 1
fi

# Map agent to employee and default tool via team roster (wave285 名册驱动).
# 换团队不改脚本: 名册覆盖顺序 $TEAM_ROSTER > .coolie-local/team-roster.json
# > scripts/lib/default-roster.json (本仓默认 = coolie-mac 六人组)。
# shellcheck source=scripts/lib/team-roster.sh
source "$REPO_ROOT/scripts/lib/team-roster.sh"
EMPLOYEE="$(roster_lookup "$AGENT" name)"
DEFAULT_TOOL="$(roster_lookup "$AGENT" defaultTool)"
FALLBACK_TOOLS="$(roster_lookup "$AGENT" fallbackTools)"
if [[ -z "$EMPLOYEE" ]]; then
  printf 'unknown agent: %s\n已登记的 agentId (名册可换, 见 scripts/lib/team-roster.sh):\n' "$AGENT" >&2
  roster_agent_ids >&2
  exit 1
fi

TOOL="${TOOL:-$DEFAULT_TOOL}"

# Auto-detect wave if not explicitly passed
if [[ -z "$WAVE" ]]; then
  if [[ "$TASK" =~ wave[0-9]+ ]]; then
    WAVE="${BASH_REMATCH[0]}"
  else
    latest_commit_msg="$(git -C "$REPO_ROOT" log -1 --pretty=%B 2>/dev/null || printf '')"
    if [[ "$latest_commit_msg" =~ wave[0-9]+ ]]; then
      WAVE="${BASH_REMATCH[0]}"
    else
      WAVE="wave-local"
    fi
  fi
fi

now_iso="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
safe_task="$(printf '%s' "$TASK" | tr -cs '[:alnum:]_.-' '-' | sed -E 's/^-+|-+$//g' | cut -c1-60)"
[[ -n "$safe_task" ]] || safe_task="task"

receipt_id="${timestamp}-${WAVE}-${AGENT}"
json_file="$dispatch_dir/${receipt_id}.json"
prompt_file="$dispatch_dir/${receipt_id}.md"

make_prompt() {
  cat <<EOF
【Hermes 扁平化数字员工调度令 · Role System Prompt 注入】

你是当前执行任务的直属员工：【${EMPLOYEE}】（角色代码: ${AGENT}）
你直接受命于项目总指挥 Hermes，以最高专业度独立完成本项任务。
所属团队：Coolie 平台研发工程组
当前任务：${TASK}
波次编号：${WAVE}
底层引擎：${TOOL}
工作仓库：${REPO_ROOT}
当前分支：$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || printf 'unknown')

================================================================================
👑【老板亲自定调的最高交付与使用主义总则（Boss Delivery & UX Commandments）】
================================================================================
1. 极简使用主义：系统界面与交互必须直观，绝对不能有重复功能入口；傻瓜式使用最好，用户零培训即可快速上手。
2. 零功能膨胀（杜绝乱加功能）：严禁随意新增冗余功能，必须充分将系统本就具备的功能 100% 用起来、打通打透。
3. 聚焦核心与质量：聚焦产品核心业务主线，聚焦 AI 高效交付，聚焦代码与交付全栈质量。
4. 全维度严肃审计：站在新型软件交付公司负责人、Palantir FDE 体系与产品总监的严肃视角，全方位验证业务功能、排查功能缺陷，同时深度审视界面设计、空间布局与产品架构缺陷。
================================================================================
EOF

  if [[ "$TASK" =~ (断点接力|断点续跑) ]]; then
    cat <<'RELAY_EOF'
================================================================================
🔄【18-20 分钟长耗时任务断点接力指令（Checkpointed Relay Mode）】
================================================================================
⚠️ 铁律：当前任务是上游长耗时任务（已运行 18-20 分钟）的续跑接力！
1. 继承既有成果：当前 Git 工作区中已存在上游编写的部分代码，严禁通过 git reset / checkout 丢弃！
2. 迅速定向推进：请先运行 git status 检查当前已改动文件，直接承接并编写剩余未完成的逻辑。
3. 门禁回归结单：补齐剩余业务代码后，运行 bash scripts/check-governance-audit.sh，确保 0 报错并收口！
================================================================================
RELAY_EOF
  fi

  cat <<EOF

【你必须严格遵守的员工角色档案与行为准则 (Role System Prompt)】:
$(cat "$agent_template")

EOF

  if [[ "$NO_CONTEXT" -eq 0 && -f "$SCRIPT_DIR/context-bus.sh" ]]; then
    bash "$SCRIPT_DIR/context-bus.sh" --prompt "$WAVE" --target-agent "$AGENT" 2>/dev/null || true
    printf '\n'
  fi

  cat <<EOF
Seven-part brief requirements:
1. Background: boss requested fixed local employee dispatch.
2. Target: run the task above using the named employee semantics.
3. Branch: current branch shown above unless PM overrides it.
4. File allowlist: keep changes to the task brief; do not touch unrelated dirty files.
5. Steps: inspect relevant docs, implement only requested scope, validate narrowly.
6. Acceptance: produce a concise report with changed files and verification.
7. Rules: single writer, no secret output, no mock business data, report stuck after 4h.
EOF
}

write_receipt() {
  local p_status="$1"
  local p_pid="$2"
  local p_started_at="$3"
  local p_completed_at="$4"
  local p_commit="$5"
  local p_reason="$6"

  node -e '
const fs = require("fs");
const argv = process.argv;
const data = {
  schemaVersion: 1,
  id: argv[1],
  wave: argv[2],
  createdAt: argv[3],
  bossInput: argv[4],
  pm: "Hermes",
  employee: argv[5],
  subagentType: argv[6],
  task: argv[7],
  tool: argv[8],
  fallbackTools: JSON.parse(argv[9] || "[]"),
  branch: argv[10],
  specPath: argv[11] || null,
  briefPath: argv[12] || null,
  allowlist: [],
  status: argv[13],
  pid: argv[14] && !isNaN(Number(argv[14])) ? Number(argv[14]) : null,
  startedAt: argv[15] || null,
  completedAt: argv[16] || null,
  commit: argv[17] || null,
  verification: [],
  evidence: [],
  blockedReason: argv[18] || null,
};
fs.writeFileSync(argv[19], JSON.stringify(data, null, 2), "utf8");
' \
    "$receipt_id" \
    "$WAVE" \
    "$now_iso" \
    "$TASK" \
    "$EMPLOYEE" \
    "$AGENT" \
    "$TASK" \
    "$TOOL" \
    "$FALLBACK_TOOLS" \
    "$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || printf 'unknown')" \
    "$SPEC_PATH" \
    "$BRIEF_PATH" \
    "$p_status" \
    "$p_pid" \
    "$p_started_at" \
    "$p_completed_at" \
    "$p_commit" \
    "$p_reason" \
    "$json_file"
}

if [[ "$PRINT_ONLY" -eq 1 ]]; then
  make_prompt
  exit 0
fi

# Write prompt file and initial receipt (queued)
make_prompt > "$prompt_file"
write_receipt "queued" "" "" "" "" ""

printf '[dispatch] recorded receipt: %s\n' "$json_file"
printf '[dispatch] recorded prompt:  %s\n' "$prompt_file"
printf '[dispatch] employee=%s agent=%s tool=%s task=%s\n' "$EMPLOYEE" "$AGENT" "$TOOL" "$TASK"

if [[ "$EXECUTE" -eq 0 ]]; then
  printf '[dispatch] status=queued. To execute: %s --agent %s --task %q --execute\n' "$0" "$AGENT" "$TASK"
  exit 0
fi

# wave290: agy-gemini3.8 / agy 专用 docker exec 执行路径 (墨斗 modou-fda 的默认工具, 高频路径)。
# 本机没有 agy binary — agy 跑在 docker 容器里 (见 .agents/skills/agy-gemini-cli/SKILL.md):
# 中文 prompt 直接进 docker exec bash argv 会被替换成 '?', 必须宿主机 base64 包装 →
# docker cp → 容器内 LANG=C.UTF-8 + base64 -d 还原后再调 agy (SKILL.md 三步流程)。
# agy 永不落入下方通用 local/host 探测 (agy 绝不在宿主机上, host-exec.sh 探测对 agy 无意义)。
# 容器名 / 容器内可执行名 / print 超时可用环境变量覆盖: AGY_CONTAINER / AGY_BIN /
# AGY_PRINT_TIMEOUT (默认 agy-ubuntu-container / agy / 1800s, 便于 stub 测试)。
if [[ "$TOOL" == "agy-gemini3.8" || "$TOOL" == "agy" ]]; then
  AGY_CONTAINER="${AGY_CONTAINER:-agy-ubuntu-container}"
  AGY_BIN="${AGY_BIN:-agy}"
  AGY_PRINT_TIMEOUT="${AGY_PRINT_TIMEOUT:-1800s}"

  agy_probe_fail() {
    printf 'cannot execute agy: %s\n' "$1" >&2
    write_receipt "failed" "" "" "$now_iso" "" "agy probe failed: $1 (tool=$TOOL container=$AGY_CONTAINER bin=$AGY_BIN)"
    exit 1
  }

  # 探测顺序: 宿主机 docker → 容器在跑 → 容器内 agy 存在; 任一失败按通用路径的
  # 既有模式写 failed receipt 并退出 1 (blockedReason 写清楚缺哪一环)。
  command -v docker >/dev/null 2>&1 || agy_probe_fail "docker CLI not found on host"
  docker inspect "$AGY_CONTAINER" >/dev/null 2>&1 || agy_probe_fail "container $AGY_CONTAINER is not running"
  docker exec "$AGY_CONTAINER" true >/dev/null 2>&1 || agy_probe_fail "container $AGY_CONTAINER is not accepting docker exec"
  docker exec "$AGY_CONTAINER" bash -c 'command -v "$1" >/dev/null 2>&1' _ "$AGY_BIN" \
    || agy_probe_fail "agy binary '$AGY_BIN' not found inside container $AGY_CONTAINER"

  # Step a+b: 宿主机 base64 包装 prompt (macOS base64), docker cp 进容器。
  # 容器内文件名带 receipt_id, 防并行 agy 抢同一个 tmp 文件 (SKILL.md 坑 3)。
  TMP_MK="$(mktemp -t agy-prompt.XXXXXX)"
  TMP_B64="${TMP_MK}.b64"
  TMP_RUNNER="$(mktemp -t agy-runner.XXXXXX)"
  CT_PROMPT="/tmp/agy-prompt-${receipt_id}.b64"
  CT_RUNNER="/tmp/agy-runner-${receipt_id}.sh"
  CT_LOG="/tmp/${receipt_id}-agy.log"
  base64 -i "$prompt_file" -o "$TMP_B64"
  docker cp "$TMP_B64" "$AGY_CONTAINER:$CT_PROMPT"

  # Step c: 容器内 runner 脚本 — LANG/LC_ALL 必须在容器内 export
  # 增加网络瞬时抖动 (如 profile picture EOF) 自动重试自愈机制
  cat > "$TMP_RUNNER" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export LANG=C.UTF-8
export LC_ALL=C.UTF-8
cd /workspace
PROMPT="\$(base64 -d "$CT_PROMPT")"

run_agy() {
  "$AGY_BIN" --dangerously-skip-permissions --output-format text --print-timeout "$AGY_PRINT_TIMEOUT" -p "\$PROMPT"
}

if ! run_agy 2>&1 | tee "$CT_LOG"; then
  if grep -q "Eligibility check failed.*EOF" "$CT_LOG" 2>/dev/null; then
    echo "⚠️ 检测到 Google 头像拉取瞬时 EOF 抖动，等待 2 秒自动重试..." >&2
    sleep 2
    run_agy 2>&1 | tee "$CT_LOG"
  else
    exit 1
  fi
fi
EOF
  docker cp "$TMP_RUNNER" "$AGY_CONTAINER:$CT_RUNNER"
  rm -f "$TMP_B64" "$TMP_RUNNER" "$TMP_MK"

  started_iso="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  write_receipt "running" "$$" "$started_iso" "" "" ""
  printf '[dispatch] running with pid=%s tool=%s (agy via docker exec %s; container log=%s:%s)...\n' \
    "$$" "$TOOL" "$AGY_CONTAINER" "$AGY_CONTAINER" "$CT_LOG"

  # Step e: 同步执行, stdout 直接回宿主机, 容器内 tee 留日志; runner 里 pipefail
  # 让 agy 真实退出码穿透 docker exec 回宿主机, 据此写 done/failed receipt。
  if docker exec "$AGY_CONTAINER" bash "$CT_RUNNER"; then
    docker exec "$AGY_CONTAINER" rm -f "$CT_PROMPT" "$CT_RUNNER" >/dev/null 2>&1 || true
    completed_iso="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    latest_hash="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || printf '')"
    write_receipt "done" "$$" "$started_iso" "$completed_iso" "$latest_hash" ""
    printf '[dispatch] execution completed: status=done commit=%s (container log=%s:%s)\n' \
      "$latest_hash" "$AGY_CONTAINER" "$CT_LOG"
  else
    agy_rc=$?
    docker exec "$AGY_CONTAINER" rm -f "$CT_PROMPT" "$CT_RUNNER" >/dev/null 2>&1 || true
    failed_iso="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    write_receipt "failed" "$$" "$started_iso" "$failed_iso" "" "agy exited with status $agy_rc (container log: $AGY_CONTAINER:$CT_LOG)"
    printf '[dispatch] execution failed: status=failed (container log: %s:%s)\n' "$AGY_CONTAINER" "$CT_LOG" >&2
    exit 1
  fi
  exit 0
fi

# Tool-aware execution router
TOOL_BIN=""
TOOL_ARGS=()
PRE_CMD=""

case "$TOOL" in
  claude-mm)
    TOOL_BIN="claude"
    TOOL_ARGS=("-p" "$(cat "$prompt_file")" "--dangerously-skip-permissions")
    PRE_CMD="ln -sf ~/.claude/settings.jsonmm ~/.claude/settings.json 2>/dev/null || true"
    ;;
  claude-glm)
    TOOL_BIN="claude"
    TOOL_ARGS=("-p" "$(cat "$prompt_file")" "--dangerously-skip-permissions")
    PRE_CMD="ln -sf ~/.claude/settings.jsonglm ~/.claude/settings.json 2>/dev/null || true"
    ;;
  claude-ds)
    TOOL_BIN="claude"
    TOOL_ARGS=("-p" "$(cat "$prompt_file")" "--dangerously-skip-permissions")
    PRE_CMD="ln -sf ~/.claude/settings.jsonds ~/.claude/settings.json 2>/dev/null || true"
    ;;
  claude)
    TOOL_BIN="claude"
    TOOL_ARGS=("-p" "$(cat "$prompt_file")" "--dangerously-skip-permissions")
    ;;
  cmd)
    TOOL_BIN="cmd"
    TOOL_ARGS=("-p" "$(cat "$prompt_file")" "--yolo" "--tools-all" "-t")
    ;;
  copilot)
    TOOL_BIN="copilot"
    TOOL_ARGS=("-p" "$(cat "$prompt_file")" "--yolo")
    ;;
  kiro-cli)
    TOOL_BIN="kiro-cli"
    TOOL_ARGS=("-p" "$(cat "$prompt_file")")
    ;;
  hermes)
    TOOL_BIN="bash"
    TOOL_ARGS=("$REPO_ROOT/scripts/cron-team-status.sh" "--dispatch-check")
    ;;
  *)
    TOOL_BIN="$TOOL"
    TOOL_ARGS=("-p" "$(cat "$prompt_file")")
    ;;
esac

EXEC_CMD=()
EXEC_ENV="local"

if command -v "$TOOL_BIN" >/dev/null 2>&1; then
  [[ -n "$PRE_CMD" ]] && eval "$PRE_CMD"
  EXEC_CMD=("$TOOL_BIN")
  EXEC_ENV="local"
elif [[ -x "$SCRIPT_DIR/host-exec.sh" ]]; then
  # Probe if tool exists on macOS host
  if "$SCRIPT_DIR/host-exec.sh" "command -v $TOOL_BIN" >/dev/null 2>&1; then
    if [[ -n "$PRE_CMD" ]]; then
      EXEC_CMD=("$SCRIPT_DIR/host-exec.sh" "$PRE_CMD && $TOOL_BIN")
    else
      EXEC_CMD=("$SCRIPT_DIR/host-exec.sh" "$TOOL_BIN")
    fi
    EXEC_ENV="host"
  fi
fi

if [[ ${#EXEC_CMD[@]} -eq 0 ]]; then
  printf 'cannot execute: tool %s (%s) not found on local or host\n' "$TOOL" "$TOOL_BIN" >&2
  write_receipt "failed" "" "" "$now_iso" "" "command not found: $TOOL_BIN ($TOOL)"
  exit 1
fi

# Update receipt to running
started_iso="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
write_receipt "running" "$$" "$started_iso" "" "" ""

printf '[dispatch] running with pid=%s tool=%s (%s via %s)...\n' "$$" "$TOOL" "$TOOL_BIN" "$EXEC_ENV"
if "${EXEC_CMD[@]}" "${TOOL_ARGS[@]}" < /dev/null; then
  completed_iso="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  latest_hash="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || printf '')"
  
  # wave298 掌柜铁律: 全面管局审计门禁硬拦截
  if ! node "$REPO_ROOT/scripts/check-governance-audit.mjs" >/dev/null 2>&1; then
    printf '[dispatch] 🚫 任务虽然退出但未通过全面管局审计 (两字按钮/对称底栏/CMMI产物违规)！标记为 blocked\n' >&2
    write_receipt "blocked" "$$" "$started_iso" "$completed_iso" "$latest_hash" "governance audit failed: pnpm check:governance"
    exit 2
  fi

  write_receipt "done" "$$" "$started_iso" "$completed_iso" "$latest_hash" ""
  printf '[dispatch] execution completed & governance verified: status=done commit=%s\n' "$latest_hash"
else
  failed_iso="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  write_receipt "failed" "$$" "$started_iso" "$failed_iso" "" "execution exited with non-zero status"
  printf '[dispatch] execution failed: status=failed\n' >&2
  exit 1
fi

