#!/usr/bin/env bash
# scripts/init-agent-providers.sh <company-id>
#
# 给一个已存在的 Coolie 公司装上 5 角色 agent 的默认 provider（Claude + Hermes）：
#
#   1. GET   /api/adapters           → 确认 claude_local / hermes_gateway 已注册
#      PATCH /api/adapters/<type>    → 万一被禁用就重新启用
#   2. POST  /api/companies/<id>/agents/bulk { roles:[5] }
#                                    → 5 角色 agent 在岗（默认 Claude，另装 Hermes，降级 cmd）
#   3. GET   /api/companies/<id>/agents → 复核 5 个角色真的都在
#
# 注：adapter 是**实例级**注册表（内核 built-in + 外装 npm 插件），并不存在
# `/api/companies/<id>/adapters` 这种「给某个公司装 adapter」的端点。所以
# 「给公司装 provider」落地就是上面两步 —— 实例侧确认 provider 可用 + 公司侧
# 确认 5 角色在岗；角色绑定哪几个 provider 由 packages/agents/role-templates 定义。
#
# 幂等：角色已有在职 agent 会进 skipped 不重复建人；adapter 已启用则不动。
# 可以安全重复执行。
#
# 环境变量：
#   COOLIE_API_BASE     Coolie 平台地址               (默认: http://localhost:3100)
#   COOLIE_API_TOKEN    看板 bearer token；local_trusted 本地模式可留空
#   COOLIE_COOKIE_JAR   看板会话 cookie 文件 (curl -c 产物)；authenticated
#                       模式 (生产) 用会话 cookie 认证，无 bearer 时用这个
#   COOLIE_PROVIDERS    需要确认启用的 adapter 类型    (默认: claude_local hermes_gateway)
#
# 用法：
#   # 本地
#   scripts/init-agent-providers.sh <company-id>
#   # 生产 (会话 cookie 认证 + 同源 Origin，脚本自动推导)
#   COOLIE_API_BASE=https://xrobinai.cn \
#   COOLIE_COOKIE_JAR=/tmp/board-cookie.txt \
#   bash scripts/init-agent-providers.sh <company-id>
set -euo pipefail

COMPANY_ID="${1:-}"
if [[ -z "$COMPANY_ID" ]]; then
  echo "usage: scripts/init-agent-providers.sh <company-id>" >&2
  exit 2
fi

API_BASE="${COOLIE_API_BASE:-http://localhost:3100}"
API_TOKEN="${COOLIE_API_TOKEN:-}"
COOKIE_JAR="${COOLIE_COOKIE_JAR:-}"
# 5 角色（Palantir Foundry）——与 packages/agents/role-templates 同源。
ROLES=(fda core-swe pre-sre fdse ds)
# 角色默认 provider 对应的 adapter 类型。
PROVIDERS=(${COOLIE_PROVIDERS:-claude_local hermes_local hermes_gateway})

step() { printf '\n=== %s ===\n' "$1"; }
die() { printf '\n失败: %s\n' "$1" >&2; exit 1; }

command -v curl >/dev/null || die "需要 curl"
command -v python3 >/dev/null || die "需要 python3 (用于解析 API JSON)"

# 会话 cookie 认证时，服务端 CSRF 守卫要求同源 Origin；从 API_BASE 推导。
ORIGIN=""
if [[ -n "$COOKIE_JAR" ]]; then
  ORIGIN="$(python3 -c 'import sys,urllib.parse as u; p=u.urlparse(sys.argv[1]); print(f"{p.scheme}://{p.netloc}")' "$API_BASE")"
fi

api() {
  local method="$1" path="$2" body="${3:-}"
  local args=(-sS --fail-with-body -X "$method" "$API_BASE$path" -H 'content-type: application/json')
  [[ -n "$API_TOKEN" ]] && args+=(-H "authorization: Bearer $API_TOKEN")
  [[ -n "$COOKIE_JAR" ]] && args+=(-b "$COOKIE_JAR")
  [[ -n "$ORIGIN" ]] && args+=(-H "origin: $ORIGIN")
  [[ -n "$body" ]] && args+=(-d "$body")
  curl "${args[@]}"
}

echo "========================================================"
echo " Coolie 角色 provider 初始化"
echo " company_id: $COMPANY_ID"
echo " API:        $API_BASE$([[ -n "$API_TOKEN" ]] && echo ' (bearer)' || { [[ -n "$COOKIE_JAR" ]] && echo ' (cookie)' || echo ' (no token)'; })"
echo " providers:  ${PROVIDERS[*]}"
echo "========================================================"

step "[1/3] 确认 provider adapter 已注册且启用 (GET $API_BASE/api/adapters)"
ADAPTERS_JSON="$(api GET /api/adapters)" || die "读 adapter 列表失败（${API_BASE}）"

adapter_state() {
  printf '%s' "$ADAPTERS_JSON" | python3 -c '
import json, sys
row = {r["type"]: r for r in json.load(sys.stdin)}.get(sys.argv[1])
if row is None:
    print("missing")
elif row.get("disabled"):
    print("disabled")
else:
    print("ok")
' "$1"
}

for provider in "${PROVIDERS[@]}"; do
  case "$(adapter_state "$provider")" in
    ok)
      echo "   ✓ $provider (loaded)"
      ;;
    missing)
      die "adapter 未注册: $provider —— 不在本实例的内核 adapter 列表里，检查服务版本"
      ;;
    disabled)
      echo "   · $provider 被禁用，重新启用"
      api PATCH "/api/adapters/$provider" '{"disabled":false}' >/dev/null \
        || die "启用 $provider 失败"
      echo "   ✓ $provider 已启用"
      ;;
  esac
done

step "[2/3] 注册 5 角色 agent (POST /api/companies/$COMPANY_ID/agents/bulk)"
ROLES_BODY="$(python3 -c 'import json,sys; print(json.dumps({"roles":sys.argv[1:]}))' "${ROLES[@]}")"
AGENTS_JSON="$(api POST "/api/companies/$COMPANY_ID/agents/bulk" "$ROLES_BODY")" \
  || die "注册 agent 失败（company_id=${COMPANY_ID}）"

AGENT_LINES="$(printf '%s' "$AGENTS_JSON" | python3 -c '
import json, sys
payload = json.load(sys.stdin)
for agent in payload.get("created", []):
    print("   ✓ %s  %-9s %s" % (agent["id"], agent["role"], agent["name"]))
for entry in payload.get("skipped", []):
    print("   · %s  %-9s (已存在，跳过)" % (entry["agentId"], entry["role"]))
')"
printf '%s\n' "$AGENT_LINES"

step "[3/3] 复核 5 角色在岗 (GET /api/companies/$COMPANY_ID/agents)"
api GET "/api/companies/$COMPANY_ID/agents" | python3 -c '
import json, sys
expected = sys.argv[1:]
payload = json.load(sys.stdin)
rows = payload if isinstance(payload, list) else payload.get("agents", payload.get("data", []))
onsite = {r.get("role"): r for r in rows}
missing = [role for role in expected if role not in onsite]
for role in expected:
    row = onsite.get(role)
    if row:
        print("   ✓ %-9s %s  (%s)" % (role, row.get("name"), row.get("id")))
    else:
        print("   ✗ %-9s 缺失" % role)
if missing:
    sys.exit("失败: 角色缺失 " + " ".join(missing))
' "${ROLES[@]}" || die "复核失败：5 角色未全部在岗"

echo ""
echo "✅ provider 初始化完成: company_id=$COMPANY_ID (claude + hermes 已装, 5 角色在岗)"
