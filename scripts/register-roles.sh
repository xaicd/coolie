#!/usr/bin/env bash
# scripts/register-roles.sh <company_id> [角色...]
#
# 给一个已存在的 Coolie 公司注册 Palantir 5 角色 agent。
# 不传角色时注册全部 5 个；传了则只注册指定的那些。
#
#   POST /api/companies/<company_id>/agents/bulk { roles:[...] }
#
# 接口按角色幂等：角色已有在职 agent 会返回在 skipped 里，不重复建人，
# 所以本脚本可以安全地重复执行。
#
# 环境变量：
#   COOLIE_API_BASE   Coolie 平台地址  (默认: http://localhost:3100)
#   COOLIE_API_TOKEN  看板 bearer token；local_trusted 本地模式可留空
set -euo pipefail

COMPANY_ID="${1:-}"
if [[ -z "$COMPANY_ID" ]]; then
  echo "usage: scripts/register-roles.sh <company_id> [role ...]" >&2
  echo "roles: fda | core-swe | pre-sre | fdse | ds (默认: 全部 5 个)" >&2
  exit 2
fi
shift

ROLES=("$@")
if [[ ${#ROLES[@]} -eq 0 ]]; then
  ROLES=(fda core-swe pre-sre fdse ds)
fi

API_BASE="${COOLIE_API_BASE:-http://localhost:3100}"
API_TOKEN="${COOLIE_API_TOKEN:-}"

command -v curl >/dev/null || { echo "失败: 需要 curl" >&2; exit 1; }
command -v python3 >/dev/null || { echo "失败: 需要 python3 (用于解析 API JSON)" >&2; exit 1; }

ARGS=(-sS --fail-with-body -X POST "$API_BASE/api/companies/$COMPANY_ID/agents/bulk" \
  -H 'content-type: application/json')
[[ -n "$API_TOKEN" ]] && ARGS+=(-H "authorization: Bearer $API_TOKEN")
ARGS+=(-d "$(python3 -c 'import json,sys; print(json.dumps({"roles":sys.argv[1:]}))' "${ROLES[@]}")")

echo "register-roles: company_id=$COMPANY_ID roles=${ROLES[*]}"
RESPONSE="$(curl "${ARGS[@]}")" \
  || { echo "失败: 注册 agent 请求被拒绝（company_id=$COMPANY_ID, API=$API_BASE）" >&2; exit 1; }

printf '%s' "$RESPONSE" | python3 -c '
import json, sys

payload = json.load(sys.stdin)
created = payload.get("created", [])
skipped = payload.get("skipped", [])
for agent in created:
    print(f"created  {agent[\"id\"]}  {agent[\"role\"]:<9} {agent[\"name\"]}")
for entry in skipped:
    print(f"skipped  {entry[\"agentId\"]}  {entry[\"role\"]:<9} (已存在)")
if not created and not skipped:
    sys.exit("失败: 响应里既没有 created 也没有 skipped")
print(f"共 {len(created)} 个新建 / {len(skipped)} 个已存在", file=sys.stderr)
'
