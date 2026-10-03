#!/usr/bin/env bash
# scripts/lib/team-roster.sh — 团队名册共享查找层 (wave285)
#
# 目的: 员工身份/工具/门禁归属从脚本硬编码改为名册驱动, 让同一套治理脚本
# 可以搬到别的机器 (cwall / aja-pc …) 而不改动对方团队的员工名。
#
# 覆盖顺序 (先命中先用):
#   1. $TEAM_ROSTER          显式指定的名册文件
#   2. <repo>/.coolie-local/team-roster.json   本机运行态覆盖 (不入 git)
#   3. <repo>/scripts/lib/default-roster.json  仓库默认名册 (本仓 = coolie-mac 六人组)
#
# 用法 (source 后):
#   roster_file            打印生效的名册文件路径
#   roster_json            打印名册 JSON 全文
#   roster_lookup <agentId|name> <field>   打印单个字段 (name|defaultTool|fallbackTools|role|env|agentId)
#   roster_gate_owners     打印 gateOwners JSON (无则 {})
#   roster_agent_ids       打印全部 agentId (每行一个)

# source 时一次性解析本文件所在目录 (函数调用期 BASH_SOURCE 为空, 且 $() 子 shell 里取不到, 先直赋再展开)
_roster_src="${BASH_SOURCE[0]}"
_TEAM_ROSTER_LIB_DIR="$(cd "$(dirname "$_roster_src")" && pwd)"
# 兜底: 奇异 source 上下文 (stdin/eval) 里 BASH_SOURCE 解析失真时, 按 cwd 定位
[[ -f "$_TEAM_ROSTER_LIB_DIR/team-roster.sh" ]] || _TEAM_ROSTER_LIB_DIR="$PWD/scripts/lib"

_roster_lib_repo_root() {
  printf '%s' "$(cd "$_TEAM_ROSTER_LIB_DIR/../.." && pwd)"
}

roster_file() {
  local root
  root="$(_roster_lib_repo_root)"
  if [[ -n "${TEAM_ROSTER:-}" && -f "$TEAM_ROSTER" ]]; then
    printf '%s' "$TEAM_ROSTER"
  elif [[ -f "${COOLIE_LOCAL_DIR:-$root/.coolie-local}/team-roster.json" ]]; then
    printf '%s' "${COOLIE_LOCAL_DIR:-$root/.coolie-local}/team-roster.json"
  else
    printf '%s' "$root/scripts/lib/default-roster.json"
  fi
}

roster_json() {
  cat "$(roster_file)"
}

# roster_lookup <agentId-or-name> <field>
roster_lookup() {
  local key="$1" field="$2"
  [[ -z "$key" || -z "$field" ]] && return 0
  local rf
  rf="$(roster_file)"
  KEY="$key" FIELD="$field" ROSTER_FILE="$rf" node -e '
const fs = require("fs");
const env = process.env;
let roster = {};
try { roster = JSON.parse(fs.readFileSync(env.ROSTER_FILE, "utf8")); } catch (e) { process.exit(0); }
const list = roster.employees || [];
const emp = list.find(x => x.agentId === env.KEY || x.name === env.KEY);
if (!emp) process.exit(0);
const v = emp[env.FIELD];
if (v === undefined) process.exit(0);
console.log(typeof v === "string" ? v : JSON.stringify(v));
'
}

roster_gate_owners() {
  local rf
  rf="$(roster_file)"
  ROSTER_FILE="$rf" node -e '
const fs = require("fs");
try { const r = JSON.parse(fs.readFileSync(process.env.ROSTER_FILE, "utf8")); console.log(JSON.stringify(r.gateOwners || {})); }
catch (e) { console.log("{}"); }
'
}

roster_agent_ids() {
  local rf
  rf="$(roster_file)"
  ROSTER_FILE="$rf" node -e '
const fs = require("fs");
try { const r = JSON.parse(fs.readFileSync(process.env.ROSTER_FILE, "utf8")); (r.employees || []).forEach(x => console.log(x.agentId)); }
catch (e) {}
'
}
