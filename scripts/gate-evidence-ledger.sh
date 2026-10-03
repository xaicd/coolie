#!/usr/bin/env bash
# scripts/gate-evidence-ledger.sh [--init <wave> | --set <gate> --status <status> | --verify [wave] | --print [wave] | --json [wave]]
#
# CMMI G0-G7 Lifecycle Evidence Ledger.
# Records immutable phase evidence under `.coolie-local/evidence-ledger/<wave>.json`.
# Decouples gates (quality criteria) from roles/employees (signoff actors).
# Supports R&D (G0-G5) + Operations & Biz (G6-G7) closed-loop delivery.

set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/bin:$PATH"

_resolved="$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || node -e 'console.log(require("fs").realpathSync(process.argv[1]))' "${BASH_SOURCE[0]}")"
REPO_ROOT="$(cd "$(dirname "$_resolved")/.." && pwd)"
LEDGER_DIR="${COOLIE_LOCAL_DIR:-$REPO_ROOT/.coolie-local}/evidence-ledger"
[[ -d "$LEDGER_DIR" || ! -d "$REPO_ROOT/.paperclip-local/evidence-ledger" ]] || LEDGER_DIR="$REPO_ROOT/.paperclip-local/evidence-ledger"

WAVE=""
TASK_NAME="任务交付"
RECEIPT_ID=""
ACTION="print"
GATE=""
STATUS=""
ROLE=""
OWNER=""
SUMMARY=""
EVIDENCE=""
TEMPLATE="rd"
STRICT=0

usage() {
  cat <<'EOF'
usage: scripts/gate-evidence-ledger.sh [options]

CMMI G0-G7 Lifecycle Evidence Ledger helper (R&D + Operations & Biz).
Decouples gates from roles/employees; records immutable evidence under .coolie-local/evidence-ledger/.

Options:
  --init <wave>            initialize a ledger for wave (default: wave-local)
  --template <name>        gate template: rd (G0-G5, default) | full (G0-G7) | hotfix (G3-G5) | ops (G6-G7)
  --task <task>            task description
  --receipt <id>           receipt ID
  --set <gate>             set status for gate (G0_Req ~ G7_Biz, or legacy aliases G1_FDA ~ G5_PRE)
  --status <status>        gate status (passed | blocked | failed | not_applicable | pending)
  --role <role>            signoff role (e.g. FDA | Core SWE | FDSE | DS | PRE-SRE | PM | BizOps)
  --owner <name>           signoff employee name (e.g. 墨斗 | 铁匠 | 门神 | 兑底渊 | 百晓生 | Hermes)
  --summary <text>         gate summary explanation
  --evidence <path>        evidence file path or URL
  --verify [wave]          verify gate closure (exit 0 on pass, non-zero if blocked)
  --strict                 strict mode for verify (requires all active gates passed/N.A.)
  --print [wave]           print human-readable gate ledger
  --json [wave]            output ledger JSON
  --help                   show this help

Lifecycle Gates:
  R&D Loop (研发闭环):
    G0_Req      (需求与立项 / RD & REQM)    EARS 规范需求捕捉、双向追踪矩阵 (RTM)、可行性评估
    G1_Arch     (架构与选型 / TS & DAR)     隔离边界、多企业数据隔离方案、DAR 决策分析、RBAC
    G2_Design   (详细设计 / TS & VER)       LLD 说明书、API 契约协议规范、DB Schema 迁移单向依赖
    G3_Build    (构建实现 / TS & PI)        编码完成、编译器 0 报错拦截、Token/静态守卫、单测覆盖
    G4_Val      (验证体验 / VER & VAL)      端到端旅程穿透、页面四态走查、防假按钮一票否决权
    G5_Release  (发版投产 / CM & RSKM)      7 处版本指纹一致性、不可变构建制品 (APK/OTA/Docker)
  Ops & Biz Loop (运营闭环):
    G6_Ops      (服务运营 / SLM & CAM)      服务 SLA 履约监控、数字员工资源与容量调度、异常事件处置
    G7_Biz      (价值持续 / STSM & CAR)     客户交付验收闭环、ROI 成本损益核算、持续过程改进防退化
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --init) ACTION="init"; WAVE="${2:-}"; shift 2 ;;
    --template) TEMPLATE="${2:-rd}"; shift 2 ;;
    --task) TASK_NAME="${2:-}"; shift 2 ;;
    --receipt) RECEIPT_ID="${2:-}"; shift 2 ;;
    --set) ACTION="set"; GATE="${2:-}"; shift 2 ;;
    --status) STATUS="${2:-}"; shift 2 ;;
    --role) ROLE="${2:-}"; shift 2 ;;
    --owner|--employee) OWNER="${2:-}"; shift 2 ;;
    --summary) SUMMARY="${2:-}"; shift 2 ;;
    --evidence) EVIDENCE="${2:-}"; shift 2 ;;
    --verify)
      ACTION="verify"
      if [[ $# -ge 2 && ! "$2" =~ ^-- ]]; then
        WAVE="$2"
        shift 2
      else
        shift
      fi
      ;;
    --strict) STRICT=1; shift ;;
    --print)
      ACTION="print"
      if [[ $# -ge 2 && ! "$2" =~ ^-- ]]; then
        WAVE="$2"
        shift 2
      else
        shift
      fi
      ;;
    --json)
      ACTION="json"
      if [[ $# -ge 2 && ! "$2" =~ ^-- ]]; then
        WAVE="$2"
        shift 2
      else
        shift
      fi
      ;;
    -h|--help) usage; exit 0 ;;
    *)
      if [[ -z "$WAVE" ]]; then
        WAVE="$1"
        shift
      else
        printf 'unknown arg: %s\n' "$1" >&2; usage >&2; exit 2
      fi
      ;;
  esac
done

mkdir -p "$LEDGER_DIR"

# Auto-detect wave if omitted
if [[ -z "$WAVE" ]]; then
  latest_json="$(ls -t "$LEDGER_DIR"/*.json 2>/dev/null | head -n 1 || true)"
  if [[ -n "$latest_json" ]]; then
    WAVE="$(basename "$latest_json" .json)"
  else
    WAVE="wave-local"
  fi
fi

ledger_file="$LEDGER_DIR/${WAVE}.json"

if [[ "$ACTION" == "init" ]]; then
  # wave285 名册驱动: 门禁归属 (signoffEmployee) 可由名册 gateOwners 覆盖。
  gate_owners_json="$(bash -c 'source "$1/lib/team-roster.sh" >/dev/null 2>&1 && roster_gate_owners' _ "$REPO_ROOT" 2>/dev/null || printf '{}')"
  node -e '
const fs = require("fs");
const [file, wave, task, receiptId, template, ownersRaw] = process.argv.slice(1);
let rosterOwners = {};
try { rosterOwners = JSON.parse(ownersRaw || "{}"); } catch (e) {}

const GATE_TEMPLATES = {
  rd: ["G0_Req", "G1_Arch", "G2_Design", "G3_Build", "G4_Val", "G5_Release"],
  full: ["G0_Req", "G1_Arch", "G2_Design", "G3_Build", "G4_Val", "G5_Release", "G6_Ops", "G7_Biz"],
  hotfix: ["G3_Build", "G4_Val", "G5_Release"],
  ops: ["G6_Ops", "G7_Biz"]
};

const GATE_META = {
  G0_Req:     { name: "需求与立项评估", defaultRole: "PM", defaultOwner: "Hermes", summary: "待 EARS 需求捕捉与 RTM 追踪" },
  G1_Arch:    { name: "架构与技术选型", defaultRole: "FDA", defaultOwner: rosterOwners.G1_Arch || "墨斗", summary: "待隔离边界、技术决策分析与权限矩阵" },
  G2_Design:  { name: "详细设计与契约", defaultRole: "Core SWE", defaultOwner: rosterOwners.G2_Design || "铁匠", summary: "待 LLD 详细设计与接口契约守卫" },
  G3_Build:   { name: "编码构建与实现", defaultRole: "Core SWE", defaultOwner: rosterOwners.G3_Build || "铁匠", summary: "待编译 0 报错与单测/静态守卫拦截" },
  G4_Val:     { name: "全栈验证与体验", defaultRole: "DS / FDSE", defaultOwner: rosterOwners.G4_Val || "百晓生", summary: "待业务旅程穿透与无假按钮走查" },
  G5_Release: { name: "发版投产与交付", defaultRole: "PRE-SRE", defaultOwner: rosterOwners.G5_Release || "兑底渊", summary: "待 7 处版本指纹一致性与不可变发版" },
  G6_Ops:     { name: "服务运营与调度", defaultRole: "BizOps", defaultOwner: rosterOwners.G6_Ops || "Hermes", summary: "待服务 SLA 履约与数字员工容量监控" },
  G7_Biz:     { name: "业务价值与改进", defaultRole: "PM / DS", defaultOwner: rosterOwners.G7_Biz || "百晓生", summary: "待客户验收闭环、ROI 核算与防退化" }
};

const keys = GATE_TEMPLATES[template] || GATE_TEMPLATES.rd;
const gates = {};

for (const k of keys) {
  const meta = GATE_META[k];
  gates[k] = {
    name: meta.name,
    status: "pending",
    signoffRole: meta.defaultRole,
    signoffEmployee: meta.defaultOwner,
    summary: meta.summary,
    evidence: [],
    updatedAt: new Date().toISOString()
  };
}

const initial = {
  schemaVersion: 2,
  wave: wave,
  task: task,
  receiptId: receiptId || null,
  template: template,
  createdAt: new Date().toISOString(),
  gates: gates
};

fs.writeFileSync(file, JSON.stringify(initial, null, 2), "utf8");
console.log(`[ledger] initialized ${file} (template: ${template}, gates: ${keys.join(", ")})`);
' "$ledger_file" "$WAVE" "$TASK_NAME" "$RECEIPT_ID" "$TEMPLATE" "$gate_owners_json"
  exit 0
fi

if [[ "$ACTION" == "set" ]]; then
  if [[ -z "$GATE" || -z "$STATUS" ]]; then
    printf 'error: --set requires <gate> and --status <status>\n' >&2
    usage >&2
    exit 2
  fi

  if [[ ! -f "$ledger_file" ]]; then
    # Auto-init if not exists
    "$0" --init "$WAVE" --task "$TASK_NAME" --template "$TEMPLATE" >/dev/null
  fi

  node -e '
const fs = require("fs");
const [file, rawGate, status, summary, evidence, role, owner] = process.argv.slice(1);

// Legacy key aliases mapping
const ALIAS_MAP = {
  G1_FDA: "G1_Arch",
  G2_CoreSWE: "G3_Build",
  G3_FDSE: "G4_Val",
  G4_DS: "G4_Val",
  G5_PRE: "G5_Release"
};

const data = JSON.parse(fs.readFileSync(file, "utf8"));
data.gates = data.gates || {};

let gate = rawGate;
// If the key is not in data.gates, check if alias matches an existing gate
if (!data.gates[gate] && ALIAS_MAP[gate] && data.gates[ALIAS_MAP[gate]]) {
  gate = ALIAS_MAP[gate];
} else if (!data.gates[gate] && Object.keys(data.gates).some(k => ALIAS_MAP[k] === gate)) {
  // If data has legacy keys and input is new key
  const legacyKey = Object.keys(data.gates).find(k => ALIAS_MAP[k] === gate);
  if (legacyKey) gate = legacyKey;
}

if (!data.gates[gate]) {
  // Allow dynamic addition if valid gate format
  data.gates[gate] = {
    status: "pending",
    evidence: []
  };
}

data.gates[gate].status = status;
data.gates[gate].updatedAt = new Date().toISOString();
if (summary) data.gates[gate].summary = summary;
if (role) data.gates[gate].signoffRole = role;
if (owner) data.gates[gate].signoffEmployee = owner;
if (evidence) {
  data.gates[gate].evidence = data.gates[gate].evidence || [];
  if (!data.gates[gate].evidence.includes(evidence)) {
    data.gates[gate].evidence.push(evidence);
  }
}

fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
console.log(`[ledger] updated ${gate} -> ${status} in ${file}`);
' "$ledger_file" "$GATE" "$STATUS" "$SUMMARY" "$EVIDENCE" "$ROLE" "$OWNER"
  exit 0
fi

if [[ "$ACTION" == "json" ]]; then
  if [[ -f "$ledger_file" ]]; then
    cat "$ledger_file"
  else
    printf 'ledger not found: %s\n' "$ledger_file" >&2
    exit 1
  fi
  exit 0
fi

if [[ "$ACTION" == "verify" ]]; then
  if [[ ! -f "$ledger_file" ]]; then
    printf '【CMMI 门禁校验失败】未找到 %s 的证据账本文件 (%s)。\n' "$WAVE" "$ledger_file" >&2
    printf '提示: 请先使用 scripts/gate-evidence-ledger.sh --init %s 初始化并记录门禁证据。\n' "$WAVE" >&2
    exit 1
  fi

  node -e '
const fs = require("fs");
const file = process.argv[1];
const strict = process.argv[2] === "1";
const data = JSON.parse(fs.readFileSync(file, "utf8"));

const gates = data.gates || {};
const blockedOrFailed = [];
const pendingGates = [];

for (const [key, g] of Object.entries(gates)) {
  if (g.status === "blocked" || g.status === "failed") {
    blockedOrFailed.push(`${key} (${g.status}): ${g.summary || "无说明"}`);
  } else if (g.status === "pending") {
    pendingGates.push(key);
  }
}

if (blockedOrFailed.length > 0) {
  console.error(`[gate-ledger] 门禁拦截: 存在失败或阻断门禁:\n  - ${blockedOrFailed.join("\n  - ")}`);
  process.exit(1);
}

// In standard mode, check that at least build/implementation is resolved
const buildGate = gates["G3_Build"] || gates["G2_CoreSWE"];
if (buildGate && buildGate.status !== "passed" && buildGate.status !== "not_applicable") {
  console.error(`[gate-ledger] 门禁拦截: 构建实现门禁未通过 (当前状态: ${buildGate.status})`);
  console.error(`  提示: 必须先完成编译/静态守卫拦截并由研发签核通过。`);
  process.exit(1);
}

if (strict && pendingGates.length > 0) {
  console.error(`[gate-ledger] 严格模式拦截: 尚有未决门禁:\n  - ${pendingGates.join("\n  - ")}`);
  process.exit(1);
}

console.log(`[gate-ledger] 验证通过: ${data.wave} 关键交付门禁已闭环。`);
process.exit(0);
' "$ledger_file" "$STRICT"
  exit $?
fi

# Print report
if [[ ! -f "$ledger_file" ]]; then
  printf '【CMMI 门禁证据账本】\n暂无 %s 的证据账本，请先使用 --init 初始化。\n' "$WAVE"
  exit 0
fi

node -e '
const fs = require("fs");
const file = process.argv[1];
const data = JSON.parse(fs.readFileSync(file, "utf8"));

const GATE_NAMES = {
  G0_Req:      "G0 需求与立项 (RD/REQM)",
  G1_Arch:     "G1 架构与选型 (TS/DAR)",
  G2_Design:   "G2 详细设计与契约 (TS/VER)",
  G3_Build:    "G3 编码构建实现 (TS/PI)",
  G4_Val:      "G4 全栈验证体验 (VER/VAL)",
  G5_Release:  "G5 发版投产交付 (CM/RSKM)",
  G6_Ops:      "G6 服务运营调度 (CMMI-SVC SLM)",
  G7_Biz:      "G7 业务价值改进 (CMMI-SVC CAR)",
  // Legacy aliases
  G1_FDA:      "G1 FDA架构 (墨斗)",
  G2_CoreSWE:  "G2 研发构建 (铁匠)",
  G3_FDSE:     "G3 部署验证 (门神)",
  G4_DS:       "G4 业务旅程 (百晓生)",
  G5_PRE:      "G5 发版安全 (兑底渊)"
};

let passed = 0;
let total = 0;

console.log(`【CMMI 门禁证据账本 · ${data.wave}】`);
console.log(`任务: ${data.task || "未指定"}`);
if (data.receiptId) console.log(`关联派单: ${data.receiptId}`);

for (const [key, g] of Object.entries(data.gates || {})) {
  total++;
  let icon = "⚪";
  if (g.status === "passed") {
    icon = "✅";
    passed++;
  } else if (g.status === "not_applicable") {
    icon = "➖";
    passed++;
  } else if (g.status === "blocked") {
    icon = "⛔";
  } else if (g.status === "failed") {
    icon = "❌";
  }

  const label = GATE_NAMES[key] || key;
  const actor = (g.signoffRole || g.owner) ? ` [${g.signoffRole || ""}${g.signoffRole && g.signoffEmployee ? " · " : ""}${g.signoffEmployee || g.owner || ""}]` : "";
  console.log(`${icon} ${label}${actor}: ${g.status} (${g.summary || "无说明"})`);
}

console.log(`门禁闭环: ${passed}/${total} ${passed === total ? "✅ 全部达标" : "⚠️ 存在未闭环门禁"}`);
' "$ledger_file"
