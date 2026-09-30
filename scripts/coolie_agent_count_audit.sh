#!/usr/bin/env bash
#
# wave226 — Coolie 工坊 agent 数自检.
#
# Boss: "coolie工坊中, 也要固定员工数量, 不能扩". This script pulls every
# company + its live agent count + the metadata.maxAgents quota from the local
# Paperclip instance and surfaces anyone over the line. Designed to run from a
# daily cron or by hand:
#
#     API_BASE=http://127.0.0.1:3100 ./scripts/coolie_agent_count_audit.sh
#
# Exit code:
#   0  — every company is at or under quota (or has no live agents)
#   1  — one or more companies are over quota (boss decision required)
#   2  — API unreachable / Paperclip not running

set -u

API_BASE="${API_BASE:-http://127.0.0.1:3100}"
TOKEN="${PAPERCLIP_API_KEY:-${PAPERCLIP_BOARD_API_KEY:-}}"

ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

call_api() {
  local method="$1" path="$2"
  local headers=(-H "Accept: application/json")
  if [[ -n "$TOKEN" ]]; then
    headers+=(-H "x-paperclip-api-key: $TOKEN")
  fi
  curl --silent --show-error --fail --max-time 10 \
    -X "$method" "${headers[@]}" "${API_BASE}${path}"
}

health_ok=$(call_api GET /api/health 2>/dev/null || echo "")
if [[ -z "$health_ok" ]]; then
  echo "[$(ts)] ERR api.unreachable apiBase=$API_BASE" >&2
  exit 2
fi

companies_json=$(call_api GET /api/companies 2>/dev/null || echo "[]")

declare -a over_rows
declare -a near_rows
declare -a ok_rows
total_companies=0
total_agents=0

while IFS= read -r row; do
  cid=$(printf '%s' "$row" | jq -r '.id')
  cname=$(printf '%s' "$row" | jq -r '.name')
  max=$(printf '%s' "$row" | jq -r '.metadata.maxAgents // 6')
  agents_json=$(call_api GET "/api/companies/${cid}/agents" 2>/dev/null || echo "[]")
  current=$(printf '%s' "$agents_json" | jq 'length')
  total_companies=$((total_companies + 1))
  total_agents=$((total_agents + current))

  if [[ "$current" -gt "$max" ]]; then
    over_rows+=("$cid	$cname	$current	$max	OVER")
  elif [[ "$current" -ge "$max" ]] && [[ "$current" -gt 0 ]]; then
    near_rows+=("$cid	$cname	$current	$max	AT")
  else
    ok_rows+=("$cid	$cname	$current	$max	OK")
  fi
done < <(printf '%s' "$companies_json" | jq -c '.[]')

report="Coolie 工坊 agent 数自检 — $(ts)
api: $API_BASE
companies: $total_companies   live agents: $total_agents

"
if [[ "${#over_rows[@]}" -gt 0 ]]; then
  report+="OVER QUOTA (boss decision required):
"
  for r in "${over_rows[@]}"; do
    IFS=$'\t' read -r cid cname cur max status <<<"$r"
    report+="  - $cname ($cid): $cur/$max  [$status]
"
  done
  report+="
"
fi
if [[ "${#near_rows[@]}" -gt 0 ]]; then
  report+="AT QUOTA (no more agents without raise):
"
  for r in "${near_rows[@]}"; do
    IFS=$'\t' read -r cid cname cur max status <<<"$r"
    report+="  - $cname ($cid): $cur/$max  [$status]
"
  done
  report+="
"
fi
report+="OK:
"
for r in "${ok_rows[@]}"; do
  IFS=$'\t' read -r cid cname cur max status <<<"$r"
  report+="  - $cname ($cid): $cur/$max
"
done

printf '%s\n' "$report"

if [[ "${#over_rows[@]}" -gt 0 ]]; then
  exit 1
fi
exit 0
