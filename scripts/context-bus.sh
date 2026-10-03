#!/usr/bin/env bash
# scripts/context-bus.sh [options]
#
# wave284: Multi-Tool Context Bus helper
# Bridges context across 7 tools, heterogeneous hosts (Mac Host vs Docker Container),
# and CMMI roles (FDA -> Core SWE -> FDSE -> PRE-SRE -> DS).

set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/bin:$PATH"

_resolved="$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || node -e 'console.log(require("fs").realpathSync(process.argv[1]))' "${BASH_SOURCE[0]}")"
REPO_ROOT="$(cd "$(dirname "$_resolved")/.." && pwd)"
BUS_DIR="$REPO_ROOT/.paperclip-local/context-bus"

ACTION="pull"
WAVE=""
TASK_TITLE=""
AGENT=""
TOOL=""
COMMIT=""
FILES=""
ARTIFACTS=""
NOTE=""
GATE=""
TARGET_AGENT=""
JSON_OUTPUT=0

usage() {
  cat <<'EOF'
usage: scripts/context-bus.sh [action] [options]

Multi-Tool Context Bus for chaining context across tools and environments.

Actions:
  --init <wave>            initialize context bus for wave
  --push                   record completion of a tool step and hand over to downstream
  --pull [wave]            display human-readable active context for wave (default action)
  --prompt [wave]          generate handover context block for injection into prompt
  --json [wave]            output full context bus as JSON
  --help                   show this help

Push Options:
  --wave <wave>            wave identifier (e.g. wave284)
  --agent <agent>          current agent completing the step (e.g. modou-fda, forge-core-swe)
  --tool <tool>            tool used (e.g. agy-gemini3.8, claude-glm, copilot)
  --commit <hash>          commit hash produced by this step
  --files <paths>          comma-separated list of changed or key files
  --artifacts <paths>      comma-separated list of generated specs or reports
  --note <text>            handover note / instructions for next employee
  --gate <gate>            CMMI gate satisfied (G1_FDA|G2_CoreSWE|G3_FDSE|G4_DS|G5_PRE)

Prompt Options:
  --target-agent <agent>   downstream agent that will receive the context
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --init) ACTION="init"; WAVE="${2:-}"; shift 2 ;;
    --push) ACTION="push"; shift ;;
    --pull) ACTION="pull"; WAVE="${2:-}"; shift 2 ;;
    --prompt) ACTION="prompt"; WAVE="${2:-}"; shift 2 ;;
    --json) ACTION="json"; WAVE="${2:-}"; shift 2 ;;
    --wave) WAVE="${2:-}"; shift 2 ;;
    --task) TASK_TITLE="${2:-}"; shift 2 ;;
    --agent) AGENT="${2:-}"; shift 2 ;;
    --tool) TOOL="${2:-}"; shift 2 ;;
    --commit) COMMIT="${2:-}"; shift 2 ;;
    --files) FILES="${2:-}"; shift 2 ;;
    --artifacts) ARTIFACTS="${2:-}"; shift 2 ;;
    --note) NOTE="${2:-}"; shift 2 ;;
    --gate) GATE="${2:-}"; shift 2 ;;
    --target-agent) TARGET_AGENT="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *)
      if [[ -z "$WAVE" && ! "$1" =~ ^-- ]]; then
        WAVE="$1"
        shift
      else
        printf 'unknown argument: %s\n' "$1" >&2
        usage >&2
        exit 2
      fi
      ;;
  esac
done

mkdir -p "$BUS_DIR"

# Auto-detect latest wave if omitted
if [[ -z "$WAVE" ]]; then
  latest_file="$(ls -t "$BUS_DIR"/*.json 2>/dev/null | head -n 1 || true)"
  if [[ -n "$latest_file" ]]; then
    WAVE="$(basename "$latest_file" .json)"
  else
    latest_commit="$(git -C "$REPO_ROOT" log -1 --pretty=%B 2>/dev/null || printf '')"
    if [[ "$latest_commit" =~ wave[0-9]+ ]]; then
      WAVE="${BASH_REMATCH[0]}"
    else
      WAVE="wave-local"
    fi
  fi
fi

bus_file="$BUS_DIR/${WAVE}.json"

# Detect host environment (mac host vs container)
detect_host_env() {
  if [[ -f "/.dockerenv" ]] || grep -q 'containerd' /proc/1/cgroup 2>/dev/null; then
    printf 'container'
  else
    printf 'host'
  fi
}

map_agent_to_employee() {
  case "$1" in
    hermes-pm) printf 'Hermes' ;;
    modou-fda) printf '墨斗' ;;
    forge-core-swe) printf '铁匠' ;;
    forge-ii-core-swe) printf '铁匠贰号' ;;
    menshen-fdse) printf '门神' ;;
    duidiyuan-pre-sre) printf '兑底渊' ;;
    baixiaosheng-ds) printf '百晓生' ;;
    *) printf '%s' "$1" ;;
  esac
}

map_agent_to_role() {
  case "$1" in
    hermes-pm) printf 'PM' ;;
    modou-fda) printf 'FDA' ;;
    forge-core-swe|forge-ii-core-swe) printf 'Core SWE' ;;
    menshen-fdse) printf 'FDSE' ;;
    duidiyuan-pre-sre) printf 'PRE-SRE' ;;
    baixiaosheng-ds) printf 'DS' ;;
    *) printf 'SWE' ;;
  esac
}

now_iso="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
host_env="$(detect_host_env)"

case "$ACTION" in
  init)
    [[ -n "$TASK_TITLE" ]] || TASK_TITLE="任务协同交付"
    node -e '
const fs = require("fs");
const file = process.argv[1];
const wave = process.argv[2];
const taskTitle = process.argv[3];
const nowIso = process.argv[4];

const initial = {
  schemaVersion: 1,
  wave: wave,
  taskTitle: taskTitle,
  currentStep: 0,
  createdAt: nowIso,
  updatedAt: nowIso,
  pipeline: [],
  activeContext: {
    latestCommit: null,
    changedFiles: [],
    keyArtifacts: [],
    nextAction: "等待初次工序派发",
    handoverSummary: null,
    gatesPassed: []
  }
};
fs.writeFileSync(file, JSON.stringify(initial, null, 2) + "\n", "utf8");
console.log(`[context-bus] initialized wave ${wave} at ${file}`);
' "$bus_file" "$WAVE" "$TASK_TITLE" "$now_iso"
    ;;

  push)
    [[ -n "$AGENT" ]] || { printf 'error: --agent is required for push\n' >&2; exit 2; }
    employee="$(map_agent_to_employee "$AGENT")"
    role="$(map_agent_to_role "$AGENT")"
    [[ -n "$TOOL" ]] || TOOL="unknown"
    [[ -n "$COMMIT" ]] || COMMIT="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || printf '')"

    node -e '
const fs = require("fs");
const file = process.argv[1];
const wave = process.argv[2];
const agent = process.argv[3];
const employee = process.argv[4];
const role = process.argv[5];
const tool = process.argv[6];
const hostEnv = process.argv[7];
const commit = process.argv[8] || null;
const filesRaw = process.argv[9] || "";
const artifactsRaw = process.argv[10] || "";
const note = process.argv[11] || "";
const gate = process.argv[12] || null;
const nowIso = process.argv[13];

let data;
if (fs.existsSync(file)) {
  data = JSON.parse(fs.readFileSync(file, "utf8"));
} else {
  data = {
    schemaVersion: 1,
    wave: wave,
    taskTitle: "跨工具任务协同",
    currentStep: 0,
    createdAt: nowIso,
    updatedAt: nowIso,
    pipeline: [],
    activeContext: {
      latestCommit: null,
      changedFiles: [],
      keyArtifacts: [],
      nextAction: null,
      handoverSummary: null,
      gatesPassed: []
    }
  };
}

const files = filesRaw ? filesRaw.split(",").map(s => s.trim()).filter(Boolean) : [];
const artifacts = artifactsRaw ? artifactsRaw.split(",").map(s => s.trim()).filter(Boolean) : [];

data.currentStep = (data.currentStep || 0) + 1;
data.updatedAt = nowIso;

const stepRecord = {
  step: data.currentStep,
  timestamp: nowIso,
  agent: agent,
  employee: employee,
  role: role,
  tool: tool,
  hostEnv: hostEnv,
  commit: commit,
  changedFiles: files,
  artifacts: artifacts,
  gateSatisfied: gate,
  handoverNote: note
};
data.pipeline.push(stepRecord);

// Update active context
if (commit) data.activeContext.latestCommit = commit;
if (files.length > 0) {
  const fileSet = new Set([...(data.activeContext.changedFiles || []), ...files]);
  data.activeContext.changedFiles = Array.from(fileSet);
}
if (artifacts.length > 0) {
  const artSet = new Set([...(data.activeContext.keyArtifacts || []), ...artifacts]);
  data.activeContext.keyArtifacts = Array.from(artSet);
}
if (gate && !data.activeContext.gatesPassed.includes(gate)) {
  data.activeContext.gatesPassed.push(gate);
}
data.activeContext.handoverSummary = `${employee} (${role}·${tool}) 完成工序 #${data.currentStep}: ${note || "提交交付物"}`;

fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
console.log(`[context-bus] pushed step #${data.currentStep} for ${employee} (${tool}) -> ${file}`);
' "$bus_file" "$WAVE" "$AGENT" "$employee" "$role" "$TOOL" "$host_env" "$COMMIT" "$FILES" "$ARTIFACTS" "$NOTE" "$GATE" "$now_iso"
    ;;

  prompt)
    if [[ ! -f "$bus_file" ]]; then
      printf '<!-- no previous context bus for %s -->\n' "$WAVE"
      exit 0
    fi

    node -e '
const fs = require("fs");
const file = process.argv[1];
const targetAgent = process.argv[2] || "";

const data = JSON.parse(fs.readFileSync(file, "utf8"));
const p = data.pipeline || [];
const last = p.length > 0 ? p[p.length - 1] : null;

console.log("================================================================================");
console.log(`【前序跨工具交接上下文 · Handover Context (${data.wave})】`);
console.log(`任务标题: ${data.taskTitle}`);
console.log(`已流经工序: ${p.map(x => `${x.employee}(${x.tool})`).join(" -> ") || "初次派单"}`);
if (last) {
  console.log(`上一工序交付者: ${last.employee} (角色: ${last.role} | 工具: ${last.tool} | 环境: ${last.hostEnv})`);
  console.log(`最新 Commit: ${last.commit || "(无代码变更)"}`);
  if (last.artifacts && last.artifacts.length > 0) {
    console.log(`上游关键产物:`);
    last.artifacts.forEach(a => console.log(`  - ${a}`));
  }
  if (last.changedFiles && last.changedFiles.length > 0) {
    console.log(`上游修改文件:`);
    last.changedFiles.forEach(f => console.log(`  - ${f}`));
  }
  if (last.gateSatisfied) {
    console.log(`已满足门禁: ${last.gateSatisfied}`);
  }
  if (last.handoverNote) {
    console.log(`\n【上游交接嘱托 / 下游待办要求】:`);
    console.log(`>>> ${last.handoverNote}`);
  }
}
if (data.activeContext && data.activeContext.gatesPassed) {
  console.log(`\n当前累积通过门禁: ${data.activeContext.gatesPassed.join(", ") || "无"}`);
}
console.log("================================================================================");
' "$bus_file" "$TARGET_AGENT"
    ;;

  pull)
    if [[ ! -f "$bus_file" ]]; then
      printf '[context-bus] no context file found for %s (%s)\n' "$WAVE" "$bus_file"
      exit 0
    fi

    node -e '
const fs = require("fs");
const file = process.argv[1];
const data = JSON.parse(fs.readFileSync(file, "utf8"));

console.log(`\n=== Context Bus: ${data.wave} (${data.taskTitle}) ===`);
console.log(`更新时间: ${data.updatedAt} | 步骤数: ${data.currentStep}`);
console.log(`流转流水线:`);
data.pipeline.forEach(p => {
  console.log(`  Step #${p.step} [${p.timestamp.substring(11,19)}] ${p.employee} (${p.role} · ${p.tool} · ${p.hostEnv})`);
  if (p.commit) console.log(`    Commit: ${p.commit}`);
  if (p.artifacts && p.artifacts.length > 0) console.log(`    产物: ${p.artifacts.join(", ")}`);
  if (p.handoverNote) console.log(`    交接: ${p.handoverNote}`);
});
console.log(`\n当前聚合状态 (Active Context):`);
console.log(`  最新 Commit: ${data.activeContext.latestCommit || "无"}`);
console.log(`  修改文件库: ${data.activeContext.changedFiles.join(", ") || "无"}`);
console.log(`  累积门禁: ${data.activeContext.gatesPassed.join(", ") || "无"}`);
console.log(`  最新交接摘要: ${data.activeContext.handoverSummary || "无"}\n`);
' "$bus_file"
    ;;

  json)
    if [[ ! -f "$bus_file" ]]; then
      printf '{ "error": "not found", "wave": "%s" }\n' "$WAVE"
      exit 1
    fi
    cat "$bus_file"
    ;;
esac
