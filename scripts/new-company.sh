#!/usr/bin/env bash
# scripts/new-company.sh <公司名> [模板名]
#
# 一键立项：建 Coolie 平台公司 + 注册 5 角色 agent + 铺 workspace 骨架。
#
#   1. POST /api/companies { name, templateId }   → company_id
#   2. POST /api/companies/<id>/agents/bulk { roles:[5] } → 5 个 agent id
#   3. mkdir ~/workspace/xaicd/<公司名>/ + 拷贝 templates/workspace-skel/
#   4. git init + ruoyi-all-next 子模块注册
#   5. 打印报告：company_id / workspace 路径 / 5 个 agent id
#
# 环境变量：
#   COOLIE_API_BASE         Coolie 平台地址           (默认: http://localhost:3100)
#   COOLIE_API_TOKEN        看板 bearer token；local_trusted 本地模式可留空
#   COOLIE_COOKIE_JAR       看板会话 cookie 文件 (curl -c 产物)；authenticated
#                           模式 (生产) 用会话 cookie 认证，无 bearer 时用这个
#   COOLIE_WORKSPACE_HOME   workspace 父目录          (默认: $HOME/workspace/xaicd)
#   COOLIE_SKIP_WORKSPACE   设为 1 只建平台公司 + agent，不铺本地目录
set -euo pipefail

NAME="${1:-}"
TEMPLATE="${2:-template-palantir-5-role}"
if [[ -z "$NAME" ]]; then
  echo "usage: scripts/new-company.sh <company-name> [template-id]" >&2
  echo "templates: template-palantir-5-role (default) | template-paperclip-default | template-empty" >&2
  exit 2
fi

API_BASE="${COOLIE_API_BASE:-http://localhost:3100}"
API_TOKEN="${COOLIE_API_TOKEN:-}"
COOKIE_JAR="${COOLIE_COOKIE_JAR:-}"
WORKSPACE_HOME="${COOLIE_WORKSPACE_HOME:-$HOME/workspace/xaicd}"
SKIP_WORKSPACE="${COOLIE_SKIP_WORKSPACE:-0}"

# 5 角色（Palantir Foundry）——与 packages/agents/role-templates 同源。
ROLES=(fda core-swe pre-sre fdse ds)

step() { printf '\n=== %s ===\n' "$1"; }
die() { printf '\n失败: %s\n' "$1" >&2; exit 1; }

command -v curl >/dev/null || die "需要 curl"
command -v python3 >/dev/null || die "需要 python3 (用于解析 API JSON)"

# ---- API 调用（带可选 bearer 认证）----------------------------------------
# --fail-with-body: HTTP 4xx/5xx 直接非零退出，同时把错误体打出来。
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

json_get() { python3 -c "import json,sys; print(json.load(sys.stdin)$1)"; }

echo "========================================================"
echo " Coolie 一键立项"
echo " 公司名:   $NAME"
echo " 模板:     $TEMPLATE"
echo " API:      $API_BASE$([[ -n "$API_TOKEN" ]] && echo ' (bearer)' || { [[ -n "$COOKIE_JAR" ]] && echo ' (cookie)' || echo ' (no token)'; })"
echo "========================================================"

step "[1/4] 建平台公司 (POST /api/companies)"
COMPANY_BODY="$(python3 -c 'import json,sys; print(json.dumps({"name":sys.argv[1],"templateId":sys.argv[2]}))' "$NAME" "$TEMPLATE")"
COMPANY_JSON="$(api POST /api/companies "$COMPANY_BODY")" \
  || die "建公司失败：Coolie API 不可达或拒绝（${API_BASE}）。检查服务是否在跑、COOLIE_API_TOKEN 是否正确。"
COMPANY_ID="$(printf '%s' "$COMPANY_JSON" | json_get '["id"]')"
[[ -n "$COMPANY_ID" ]] || die "建公司响应里没有 id: $COMPANY_JSON"
echo "   ✓ company_id = $COMPANY_ID"
echo "   ✓ template   = $(printf '%s' "$COMPANY_JSON" | json_get '.get("templateId")')"

step "[2/4] 注册 5 角色 agent (POST /api/companies/$COMPANY_ID/agents/bulk)"
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
[[ -n "$AGENT_LINES" ]] || die "没有创建任何 agent: $AGENTS_JSON"
printf '%s\n' "$AGENT_LINES"

step "[3/5] 初始化企业基座本体域 (POST /api/plugins/ontology/actions/seed-enterprise-context)"
ONTOLOGY_BODY="$(python3 -c 'import json,sys; print(json.dumps({"companyId":sys.argv[1]}))' "$COMPANY_ID")"
api POST "/api/plugins/ontology/actions/seed-enterprise-context" "$ONTOLOGY_BODY" >/dev/null 2>&1 \
  && echo "   ✓ enterprise-core 企业基座本体域已初始化" \
  || echo "   · ontology 插件将在首次访问控制台时自动补齐企业基座"

if [[ "$SKIP_WORKSPACE" == "1" ]]; then
  step "[4/5] 跳过 workspace（COOLIE_SKIP_WORKSPACE=1）"
  ROOT="(skipped)"
else
  step "[4/5] 铺 workspace 骨架"
  REPO_ROOT="$(git rev-parse --show-toplevel)"
  SKEL="$REPO_ROOT/templates/workspace-skel"
  [[ -d "$SKEL" ]] || die "workspace 骨架不存在: $SKEL"
  ROOT="$WORKSPACE_HOME/$NAME"

  mkdir -p "$ROOT"
  cp -R "$SKEL"/. "$ROOT"/
  if [[ ! -d "$ROOT/.git" ]]; then
    git -C "$ROOT" init -b main >/dev/null
  fi
  echo "   ✓ $ROOT"

  step "[5/5] ruoyi-all-next 子模块"
  cd "$ROOT"
  # 子模块为可选项：网络不可达 / 已声明时不阻断立项。
  git submodule add https://github.com/xaicd/ruoyi-all-next.git 2>&1 | head -3 \
    || echo "   · submodule placeholder (稍后用 scripts/import-ruoyi.sh 重试)"
fi

printf '\n========================================================\n'
printf ' 立项完成\n'
printf ' company_id:  %s\n' "$COMPANY_ID"
printf ' template:    %s\n' "$TEMPLATE"
printf ' workspace:   %s\n' "$ROOT"
printf ' agents:\n%s\n' "$AGENT_LINES"
printf '========================================================\n'
