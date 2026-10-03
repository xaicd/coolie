#!/usr/bin/env bash
# scripts/gate-evidence-ledger.sh [--init <wave> | --set <gate> <status> | --print <wave> | --json <wave>]
#
# wave283 / 2026-10-02-g1-g5-evidence-ledger spec
#
# G1-G5 role gate evidence ledger helper.
# Records immutable role evidence under `.coolie-local/evidence-ledger/<wave>.json`.

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
SUMMARY=""
EVIDENCE=""

usage() {
  cat <<'EOF'
usage: scripts/gate-evidence-ledger.sh [options]

G1-G5 Role Gate Evidence Ledger helper.

Options:
  --init <wave>            initialize a ledger for wave (default: wave-local)
  --task <task>            task description
  --receipt <id>           receipt ID
  --set <gate>             set status for gate (G1_FDA | G2_CoreSWE | G3_FDSE | G4_DS | G5_PRE)
  --status <status>        gate status (passed | blocked | failed | not_applicable | pending)
  --summary <text>         gate summary explanation
  --evidence <path>        evidence file path or URL
  --verify [wave]          verify gate closure (exit 0 on pass, non-zero if blocked)
  --strict                 strict mode for verify (requires all 5 gates passed/N.A.)
  --print <wave>           print human-readable gate ledger
  --json <wave>            output ledger JSON
  --help                   show this help

Gates:
  G1_FDA      (墨斗 / FDA)        隔离点、领域边界、权限矩阵
  G2_CoreSWE  (铁匠 / Core SWE)   typecheck 0、契约一致、commit
  G3_FDSE     (门神 / FDSE)       状态机覆盖、E2E 走查、防遮挡
  G4_DS       (百晓生 / DS)       用户业务旅程、一票否决权 (go/no-go)
  G5_PRE      (兑底渊 / PRE-SRE)  7 处版本指纹一致性、发版守卫
EOF
}

STRICT=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --init) ACTION="init"; WAVE="${2:-}"; shift 2 ;;
    --task) TASK_NAME="${2:-}"; shift 2 ;;
    --receipt) RECEIPT_ID="${2:-}"; shift 2 ;;
    --set) ACTION="set"; GATE="${2:-}"; shift 2 ;;
    --status) STATUS="${2:-}"; shift 2 ;;
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
    --print) ACTION="print"; WAVE="${2:-}"; shift 2 ;;
    --json) ACTION="json"; WAVE="${2:-}"; shift 2 ;;
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
  node -e '
const fs = require("fs");
const argv = process.argv;
const file = argv[1];
const wave = argv[2];
const task = argv[3];
const receiptId = argv[4] || null;

const initial = {
  schemaVersion: 1,
  wave: wave,
  task: task,
  receiptId: receiptId,
  createdAt: new Date().toISOString(),
  gates: {
    G1_FDA: {
      status: "pending",
      owner: "墨斗",
      evidence: [],
      summary: "待架构与领域边界确认"
    },
    G2_CoreSWE: {
      status: "pending",
      owner: "铁匠",
      evidence: [],
      summary: "待编译检查与契约一致性确认"
    },
    G3_FDSE: {
      status: "pending",
      owner: "门神",
      evidence: [],
      summary: "待状态机覆盖与界面验证"
    },
    G4_DS: {
      status: "pending",
      owner: "百晓生",
      evidence: [],
      summary: "待业务旅程与可用性一票否决权审查"
    },
    G5_PRE: {
      status: "pending",
      owner: "兑底渊",
      evidence: [],
      summary: "待版本指纹与发版安全确认"
    }
  }
};

fs.writeFileSync(file, JSON.stringify(initial, null, 2), "utf8");
console.log(`[ledger] initialized ${file}`);
' "$ledger_file" "$WAVE" "$TASK_NAME" "$RECEIPT_ID"
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
    "$0" --init "$WAVE" --task "$TASK_NAME" >/dev/null
  fi

  node -e '
const fs = require("fs");
const argv = process.argv;
const file = argv[1];
const gate = argv[2];
const status = argv[3];
const summary = argv[4] || null;
const evidence = argv[5] || null;

const data = JSON.parse(fs.readFileSync(file, "utf8"));
if (!data.gates[gate]) {
  console.error(`Invalid gate: ${gate}`);
  process.exit(1);
}

data.gates[gate].status = status;
if (summary) data.gates[gate].summary = summary;
if (evidence && !data.gates[gate].evidence.includes(evidence)) {
  data.gates[gate].evidence.push(evidence);
}

fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
console.log(`[ledger] updated ${gate} -> ${status} in ${file}`);
' "$ledger_file" "$GATE" "$STATUS" "$SUMMARY" "$EVIDENCE"
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
    printf '【G1-G5 门禁校验失败】未找到 %s 的证据账本文件 (%s)。\n' "$WAVE" "$ledger_file" >&2
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

// In standard mode, G2_CoreSWE must not be pending unless not applicable
const g2 = gates["G2_CoreSWE"];
if (!g2 || (g2.status !== "passed" && g2.status !== "not_applicable")) {
  console.error(`[gate-ledger] 门禁拦截: G2_CoreSWE 核心研发门禁未通过 (当前状态: ${g2 ? g2.status : "missing"})`);
  console.error(`  提示: 必须先完成 typecheck/test/commit 并通过 --set G2_CoreSWE --status passed 记账。`);
  process.exit(1);
}

if (strict && pendingGates.length > 0) {
  console.error(`[gate-ledger] 严格模式拦截: 尚有未决门禁:\n  - ${pendingGates.join("\n  - ")}`);
  process.exit(1);
}

console.log(`[gate-ledger] 验证通过: ${data.wave} 关键交付门禁已闭环 (G2=${g2.status})。`);
process.exit(0);
' "$ledger_file" "$STRICT"
  exit $?
fi

# Print report
if [[ ! -f "$ledger_file" ]]; then
  printf '【G1-G5 门禁证据账本】\n暂无 %s 的证据账本，请先使用 --init 初始化。\n' "$WAVE"
  exit 0
fi

node -e '
const fs = require("fs");
const file = process.argv[1];
const data = JSON.parse(fs.readFileSync(file, "utf8"));

const gateNames = {
  G1_FDA: "G1 FDA (墨斗)",
  G2_CoreSWE: "G2 Core SWE (铁匠)",
  G3_FDSE: "G3 FDSE (门神)",
  G4_DS: "G4 DS (百晓生)",
  G5_PRE: "G5 PRE-SRE (兑底渊)"
};

let passed = 0;
let total = 0;

console.log(`【G1-G5 门禁证据账本 · ${data.wave}】`);
console.log(`任务: ${data.task || "未指定"}`);

for (const [key, label] of Object.entries(gateNames)) {
  const g = data.gates[key] || { status: "missing", summary: "无记录" };
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
  console.log(`${icon} ${label}: ${g.status} (${g.summary || "无说明"})`);
}

console.log(`门禁闭环: ${passed}/${total} ${passed === total ? "✅ 全部达标" : "⚠️ 存在未闭环门禁"}`);
' "$ledger_file"
