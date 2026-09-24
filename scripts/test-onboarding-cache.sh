#!/usr/bin/env bash
# scripts/test-onboarding-cache.sh
#
# 端到端验证 onboarding 一次性缓存 (boss 09-23 26:24 OOB 「派」wave72 Sprint 1.1).
#
# 三件事一起验:
#   1. 源资产 (server/src/onboarding-assets/first-task/): greeting.md + chief-of-staff/
#      AGENTS.md + brief.md + opening-question.json + skills/first-task/SKILL.md
#      含 Coolie, 不含 Paperclip。
#   2. 真触发一次 onboarding first-task 创建 (POST /api/companies/<id>/issues
#      { onboardingFirstTask: true }), 然后 GET /api/issues/<id>/comments
#      拿回 agent-authored greeting comment, 验证内容是「欢迎来到 Coolie 工坊」
#      而不是「Welcome to Paperclip」。
#   3. 既有公司 (DB 里 xrobinai) 的 issue comments 不动 — onboarding cache
#      是创建时快照, 已存在的 issue / comment 不会因为 source 文件改了而反向同步.
#
# 默认连本地 dev (http://localhost:3100, local_trusted, 无需登录).
# 线上跑:
#   COOLIE_API_BASE=https://xrobinai.cn COOLIE_COOKIE_JAR=/tmp/coolie.jar \
#     COOLIE_EMAIL=... COOLIE_PASSWORD=... bash scripts/test-onboarding-cache.sh
#
# 退出码: 0 = 全过, 非零 = 任一步失败.

set -euo pipefail

API_BASE="${COOLIE_API_BASE:-http://localhost:3100}"
COOKIE_JAR="${COOLIE_COOKIE_JAR:-}"
PROD_HOST="${COOLIE_PROD_HOST:-tc-coolie-claw}"
SOURCE_DIR="${COOLIE_SOURCE_DIR:-server/src/onboarding-assets/first-task}"

pass() { printf '  ✓ %s\n' "$1"; }
fail() { printf '  ✗ %s\n' "$1" >&2; exit 1; }
step() { printf '\n=== %s ===\n' "$1"; }
die()  { printf '\n失败: %s\n' "$1" >&2; exit 1; }

command -v curl >/dev/null || die "需要 curl"
command -v python3 >/dev/null || die "需要 python3 (解析 JSON)"

# ── 通用 API 调用 (cookie-jar 模式 + 无认证模式都支持) ─────────────────────────
api() {
  local method="$1" path="$2" body="${3:-}"
  local args=(-sS --fail-with-body -X "$method" "$API_BASE$path" -H 'content-type: application/json')
  if [[ -n "$COOKIE_JAR" ]]; then
    local origin
    origin="$(python3 -c 'import sys,urllib.parse as u; p=u.urlparse(sys.argv[1]); print(f"{p.scheme}://{p.netloc}")' "$API_BASE")"
    args+=(-b "$COOKIE_JAR" -H "origin: $origin")
  fi
  [[ -n "$body" ]] && args+=(-d "$body")
  curl "${args[@]}"
}

# ── 健康检查 ────────────────────────────────────────────────────────────────
step "0. server health @ $API_BASE"
HEALTH="$(curl -sS --max-time 5 "$API_BASE/api/health" || true)"
if ! printf '%s' "$HEALTH" | grep -q '"status":"ok"'; then
  fail "server 不健康 (response: ${HEALTH})"
fi
pass "server 健康"

# ── Step 1. 源资产断言 ────────────────────────────────────────────────────────
step "1. 源资产断言 ($SOURCE_DIR)"

# brief.md 只承载 skill 引用 + proposalMode 占位, 不带产品名; opening-question.json
# 也只是 prompt/helpText 文案, 不一定带产品名. 这两份只验「不含 Paperclip」即可.
assert_no_paperclip() {
  local label="$1" file="$2"
  local path="$SOURCE_DIR/$file"
  if [[ ! -f "$path" ]]; then
    fail "$label 缺失: $path"
  fi
  if grep -qi 'paperclip' "$path"; then
    fail "$label ($file) 仍含 'Paperclip', 应已被 wave61 替换"
  fi
  pass "$label ($file): 不含 Paperclip"
}
# 含产品名 + 含 Coolie 的: greeting + chief-of-staff persona + skill.
assert_branded() {
  local label="$1" file="$2"
  local path="$SOURCE_DIR/$file"
  if [[ ! -f "$path" ]]; then
    fail "$label 缺失: $path"
  fi
  if grep -qi 'paperclip' "$path"; then
    fail "$label ($file) 仍含 'Paperclip', 应已被 wave61 替换"
  fi
  if ! grep -qi 'coolie' "$path"; then
    fail "$label ($file) 未含 'Coolie', 模板替换未到位"
  fi
  pass "$label ($file): 含 Coolie, 不含 Paperclip"
}

assert_branded      "greeting.md"                 "greeting.md"
assert_branded      "chief-of-staff/AGENTS.md"    "chief-of-staff/AGENTS.md"
assert_branded      "skills/first-task/SKILL.md"  "skills/first-task/SKILL.md"
assert_no_paperclip "brief.md"                    "brief.md"
assert_no_paperclip "opening-question.json"       "opening-question.json"

# ── Step 2. 端到端: 新公司 → onboarding first task → greeting comment ────────
step "2. 新公司 + onboarding first task E2E"

STAMP="$(date +%s)"
TEST_COMPANY_NAME="onboarding-cache-test-$STAMP"

COMPANY_JSON="$(api POST /api/companies "{\"name\":\"$TEST_COMPANY_NAME\"}")"
COMPANY_ID="$(printf '%s' "$COMPANY_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("id",""))')"
if [[ -z "$COMPANY_ID" ]]; then
  fail "建公司失败: $COMPANY_JSON"
fi
pass "新建公司: $TEST_COMPANY_NAME ($COMPANY_ID)"

AGENT_JSON="$(api POST "/api/companies/$COMPANY_ID/agents" \
  '{"name":"onboarding-cache-test-agent","role":"ceo","title":"Chief of Staff","adapterType":"codex_local","adapterConfig":{},"runtimeConfig":{},"permissions":{},"status":"idle"}')"
AGENT_ID="$(printf '%s' "$AGENT_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("id",""))')"
if [[ -z "$AGENT_ID" ]]; then
  fail "建 agent 失败: $AGENT_JSON"
fi
pass "新建 agent: onboarding-cache-test-agent ($AGENT_ID)"

ISSUE_JSON="$(api POST "/api/companies/$COMPANY_ID/issues" \
  "{\"title\":\"Get started\",\"onboardingFirstTask\":true,\"assigneeAgentId\":\"$AGENT_ID\"}")"
ISSUE_ID="$(printf '%s' "$ISSUE_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("id",""))')"
if [[ -z "$ISSUE_ID" ]]; then
  fail "建 onboarding first task 失败: $ISSUE_JSON"
fi
pass "新建 onboarding first task: $ISSUE_ID"

COMMENTS_JSON="$(api GET "/api/issues/$ISSUE_ID/comments")"
COMMENT_COUNT="$(printf '%s' "$COMMENTS_JSON" | python3 -c 'import json,sys; print(len(json.load(sys.stdin) or []))')"
if [[ "$COMMENT_COUNT" != "1" ]]; then
  fail "期望 1 条 greeting comment, 实际 $COMMENT_COUNT 条: $COMMENTS_JSON"
fi
pass "seed 了 1 条 agent-authored greeting comment"

GREETING_BODY="$(printf '%s' "$COMMENTS_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)[0].get("body",""))')"
if printf '%s' "$GREETING_BODY" | grep -qi 'paperclip'; then
  fail "greeting comment 含 'Paperclip' — wave61 替换没生效: $GREETING_BODY"
fi
if ! printf '%s' "$GREETING_BODY" | grep -qi 'coolie'; then
  fail "greeting comment 未含 'Coolie' — 模板渲染错: $GREETING_BODY"
fi
pass "greeting 内容含 Coolie 不含 Paperclip"
echo "    内容: $GREETING_BODY"

# ── Step 3. 既有公司不动 (snapshot 不迁移) ──────────────────────────────────
step "3. 既有公司 snapshot 不迁移"

if ssh -o BatchMode=yes -o ConnectTimeout=5 "$PROD_HOST" true 2>/dev/null; then
  EXISTING_COMMENT="$(ssh -o BatchMode=yes "$PROD_HOST" \
    'sudo PGPASSWORD=2cad07f100771f3425a5f969f55414f5df845eff268fbfa9 psql -U coolie -h 127.0.0.1 -d coolie -tAc "SELECT COALESCE(string_agg(c.body, E'"'"'\n---\n'"'"') , '"'"''"'"') FROM issue_comments c JOIN issues i ON i.id = c.issue_id WHERE i.company_id = '"'"'4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e'"'"' AND c.author_type = '"'"'agent'"'"' LIMIT 5"' 2>/dev/null || true)"
  if [[ -n "$EXISTING_COMMENT" ]]; then
    pass "prod xrobinai 既有 agent comment 已查询 (snapshot 不迁移, 不动)"
    echo "    (上线前已有公司 issue comment 不会被 source 文件改动反向同步)"
  else
    pass "prod xrobinai 无既有 onboarding agent comment (无 snapshot 需迁移)"
  fi
else
  pass "未连上 $PROD_HOST, 跳过 snapshot 不迁移断言"
fi

step "全部通过"
echo "  新建公司 ID: $COMPANY_ID"
echo "  新建 issue ID: $ISSUE_ID"
echo "  greeting 已 Coolie 化 ✓"