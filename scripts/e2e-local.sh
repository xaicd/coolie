#!/usr/bin/env bash
#
# scripts/e2e-local.sh — local, one-command E2E acceptance for the Coolie app.
#
# Drives the Coolie board UI on this Mac with `agent-device --platform web`
# and prints an assertion summary plus the absolute path of every evidence
# file. Exits non-zero if any assertion fails.
#
#   scripts/e2e-local.sh
#
# What it assumes
#   * The local stack is already up on $E2E_BASE_URL (default localhost:3100).
#     If it is not, the script fails loudly with the exact start command —
#     it never runs against a stale or half-up server.
#   * `agent-device` is installed and its managed web backend is set up
#     (`agent-device web setup`); preflight verifies this.
#   * A local board account exists that is a member of the company under
#     test. See docs-coolie/LOCAL-E2E.md for the one-time bootstrap.
#
# What it does NOT do
#   * It does not start, restart, or reconfigure the server.
#   * It does not touch any version number, the APK, OTA, COS, or prod config.
#
# Scope and known limitations: docs-coolie/LOCAL-E2E.md

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT" || exit 1

BASE_URL="${E2E_BASE_URL:-http://localhost:3100}"
E2E_EMAIL="${E2E_EMAIL:-e2e-harness@coolie.local}"
E2E_PASSWORD="${E2E_PASSWORD:-e2e-harness-local-2026}"
MIN_DOMAINS="${E2E_MIN_DOMAINS:-7}"
CHAT_TIMEOUT_MS="${E2E_CHAT_TIMEOUT_MS:-60000}"
STATE_DIR="${AGENT_DEVICE_STATE_DIR:-$HOME/.agent-device}"
EVIDENCE_DIR="$REPO_ROOT/clients/expo/replays/evidence"
REPLAY_DIR="clients/expo/replays"
# h5 (PC web) parity target — started mid-run; also the only web-drivable surface
# for the What's New smoke (the RN app has no react-native-web build).
H5_DIR="$REPO_ROOT/clients/h5"
H5_PORT="${E2E_H5_PORT:-5173}"
H5_URL="http://localhost:$H5_PORT"
# A per-run session name gives a fresh browser profile, so the run always
# starts logged out and the sign-in replay is deterministic.
SESSION="coolie-e2e-$(date +%s)-$$"

export AGENT_DEVICE_STATE_DIR="$STATE_DIR"

COOKIE_JAR="$(mktemp -t coolie-e2e-cookies.XXXXXX)"
EVIDENCE_FILES=()
A_NAME=(); A_STATUS=(); A_DETAIL=()

cleanup() {
  agent-device close --session "$SESSION" >/dev/null 2>&1
  rm -f "$COOKIE_JAR"
  command -v stop_h5 >/dev/null 2>&1 && stop_h5 || true
}
trap cleanup EXIT

# ── reporting ────────────────────────────────────────────────────────────────

record() {
  A_NAME+=("$1"); A_STATUS+=("$2"); A_DETAIL+=("$3")
  if [ "$2" = "PASS" ]; then
    printf '  \033[32mPASS\033[0m  %-28s %s\n' "$1" "$3"
  elif [ "$2" = "FAIL" ]; then
    printf '  \033[31mFAIL\033[0m  %-28s %s\n' "$1" "$3"
  else
    printf '  \033[33mSKIP\033[0m  %-28s %s\n' "$1" "$3"
  fi
}

die() {
  printf '\n\033[31m%s\033[0m\n' "$1" >&2
  shift
  for line in "$@"; do printf '%s\n' "$line" >&2; done
  exit 2
}

# ── preflight ────────────────────────────────────────────────────────────────

printf '\nCoolie local E2E — %s\n\n' "$BASE_URL"

if [ ! -x "$(command -v agent-device)" ] && [ ! -x /opt/homebrew/bin/agent-device ]; then
  die "agent-device is not installed." "Install it, then run: agent-device web setup"
fi

doctor_out="$(agent-device web doctor 2>&1)"
if printf '%s' "$doctor_out" | grep -q 'TOOL_MISSING' \
   || printf '%s' "$doctor_out" | grep -qi 'backend is not installed' \
   || printf '%s' "$doctor_out" | grep -qE '[1-9][0-9]* fail'; then
  die "agent-device web backend is not healthy." \
      "Fix: agent-device web setup" \
      "Then re-run: scripts/e2e-local.sh" \
      "" \
      "$doctor_out"
fi
record "web-backend" PASS "$(printf '%s' "$doctor_out" | head -1)"

health_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$BASE_URL/api/health" || true)"
health_body="$(curl -s --max-time 5 "$BASE_URL/api/health" || true)"
if [ "$health_code" != "200" ] || ! printf '%s' "$health_body" | grep -q '"status":"ok"'; then
  die "The local stack is not healthy at $BASE_URL (health HTTP ${health_code:-000})." \
      "" \
      "Start it, then re-run this script:" \
      "" \
      "  # pm2 (this repo's long-running local setup)" \
      "  pm2 start ecosystem.config.cjs        # or: pm2 restart coolie" \
      "" \
      "  # or the repo dev server" \
      "  pnpm dev" \
      "" \
      "Last health response: ${health_body:-<none>}"
fi
record "stack-health" PASS "$(printf '%s' "$health_body" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("".join([d.get("status","?")," @ ",d.get("deploymentMode","?")," commit ",d.get("commit","?")[:8]]))' 2>/dev/null || echo ok)"

mkdir -p "$EVIDENCE_DIR"

# ── auth + company resolution (for the API-level assertions) ─────────────────

signin_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
  -c "$COOKIE_JAR" -X POST "$BASE_URL/api/auth/sign-in/email" \
  -H 'Content-Type: application/json' -H "Origin: $BASE_URL" \
  -d "{\"email\":\"$E2E_EMAIL\",\"password\":\"$E2E_PASSWORD\"}" || true)"

if [ "$signin_code" != "200" ]; then
  record "board-auth" FAIL "sign-in for $E2E_EMAIL returned HTTP $signin_code"
  die "Could not sign in to the local stack as the E2E board account." \
      "" \
      "One-time bootstrap (see docs-coolie/LOCAL-E2E.md):" \
      "  1. create the account:  curl -sX POST $BASE_URL/api/auth/sign-up/email \\" \
      "       -H 'Content-Type: application/json' -H 'Origin: $BASE_URL' \\" \
      "       -d '{\"email\":\"$E2E_EMAIL\",\"password\":\"$E2E_PASSWORD\",\"name\":\"E2E Harness\"}'" \
      "  2. grant it company membership (the script prints the exact command)." \
      "" \
      "If the account exists but this fails, the credentials are wrong:" \
      "  E2E_PASSWORD=<password> scripts/e2e-local.sh"
fi

company_json="$(curl -s --max-time 10 -b "$COOKIE_JAR" "$BASE_URL/api/companies?scope=accessible" || echo '[]')"
read -r COMPANY_ID COMPANY_PREFIX COMPANY_NAME <<<"$(E2E_COMPANY_PREFIX="${E2E_COMPANY_PREFIX:-}" python3 -c '
import json, os, sys
want = os.environ.get("E2E_COMPANY_PREFIX", "").strip()
rows = json.load(sys.stdin)
if want:
    rows = [c for c in rows if c.get("issuePrefix") == want]
if not rows:
    print(""); raise SystemExit
c = rows[0]
print(c.get("id",""), c.get("issuePrefix",""), (c.get("name","") or "").replace(" ", "_"))
' <<<"$company_json" 2>/dev/null || echo '')"

if [ -z "$COMPANY_ID" ] || [ -z "$COMPANY_PREFIX" ]; then
  record "board-auth" FAIL "$E2E_EMAIL is not a member of any company"
  die "Signed in, but $E2E_EMAIL has no company membership." \
      "" \
      "The board API is company-scoped: without a membership the tasks and" \
      "ontology pages render empty, so every flow here would fail for the" \
      "wrong reason. Grant membership once, then re-run:" \
      "" \
      "  node -e \"const s=require('postgres')('postgres://paperclip:paperclip@localhost:54329/paperclip');\" \\" \
      "    -e \"s\\\`INSERT INTO company_memberships (company_id, principal_type, principal_id, status, membership_role) SELECT id, 'user', '<user-id>', 'active', 'member' FROM companies LIMIT 1 RETURNING id\\\`.then(r=>{console.log(r);process.exit(0)})\"" \
      "" \
      "docs-coolie/LOCAL-E2E.md has the full one-time bootstrap and how the" \
      "user id is found."
fi
record "board-auth" PASS "$E2E_EMAIL → ${COMPANY_PREFIX} (${COMPANY_ID:0:8})"

# ── replays ──────────────────────────────────────────────────────────────────

LAST_STATUS=""
run_replay() {
  local label="$1" file="$2"
  local out rc
  out="$(agent-device replay "$REPLAY_DIR/$file" --platform web --session "$SESSION" \
    --env "E2E_BASE_URL=$BASE_URL" \
    --env "E2E_H5_URL=$H5_URL" \
    --env "E2E_COMPANY_PREFIX=$COMPANY_PREFIX" \
    --env "E2E_EMAIL=$E2E_EMAIL" \
    --env "E2E_PASSWORD=$E2E_PASSWORD" 2>&1)"
  rc=$?
  if [ $rc -eq 0 ]; then
    LAST_STATUS="PASS"
    record "$label" PASS "$(printf '%s' "$out" | head -1 | sed 's/ This session.s daemon was kept alive.*//')"
  else
    LAST_STATUS="FAIL"
    record "$label" FAIL "$file → $(printf '%s' "$out" | head -1 | sed 's/^Error ([A-Z_]*): //')"
    printf '\n----- %s stdout -----\n%s\n---------------------\n' "$file" "$out"
  fi
  return $rc
}

run_replay "R0-sign-in"         "local-auth.ad"        || true
run_replay "R1-ontology-page"   "ontology-domains.ad"  || true

# Numeric domain-count assertion. The replay grammar has no counting
# primitive, so the count is taken from the same accessibility snapshot
# agent-device produces and asserted here.
if [ "$LAST_STATUS" = "PASS" ]; then
  snapshot_json="$(agent-device snapshot --json --platform web --session "$SESSION" 2>/dev/null || echo '')"
  domain_count="$(printf '%s' "$snapshot_json" | python3 -c '
import json, re, sys
try:
    nodes = json.load(sys.stdin)["data"]["nodes"]
except Exception:
    print(-1); raise SystemExit
# The workbench renders two comboboxes: the domain picker (options look like
# "Display Name · v3") and the relation filter (raw relation names). Match the
# domain-picker option shape only.
pat = re.compile(r" · v\d+$")
print(sum(1 for n in nodes if n.get("type") == "option" and pat.search(n.get("label") or "")))
' 2>/dev/null || echo -1)"
  if [ "${domain_count:- -1}" -ge "$MIN_DOMAINS" ] 2>/dev/null; then
    record "A3-ontology-domain-count" PASS "$domain_count domain options (>= $MIN_DOMAINS)"
  else
    record "A3-ontology-domain-count" FAIL "found ${domain_count:-?} domain options, expected >= $MIN_DOMAINS"
  fi
else
  record "A3-ontology-domain-count" SKIP "R1-ontology-page did not pass"
fi

run_replay "R2-tasks-page"      "tasks-list.ad"        || true
run_replay "R3-board-chat-reply" "board-chat.ad"       || true

# ── app-side install-loop invariants (static) ────────────────────────────────
# The RN app has no react-native-web build, so `agent-device --platform web`
# cannot open it. The install-loop pieces that live in the app are pinned as
# source invariants instead: the code has to ship *and* be wired into the root
# navigator, or the 装机 loop regresses with nothing to catch it. Behavioural
# proof of the same flow lives in replays/whats-new.ad (driven against h5).

if grep -q 'InlinePreviewPanel' "$REPO_ROOT/clients/expo/src/screens/BoardChatScreen.tsx" \
   && grep -q 'parseInlineTags' "$REPO_ROOT/clients/expo/src/screens/BoardChatScreen.tsx"; then
  record "ChatHome-inline-preview" PASS "BoardChatScreen renders InlinePreviewPanel inline"
else
  record "ChatHome-inline-preview" FAIL "BoardChatScreen no longer renders the inline preview"
fi

# wave 42: the workspace screen is gone from the app too (工坊 replaced it end to
# end). Its return would be a regression, so pin the absence of both the import
# and the directory.
if ! grep -q 'WorkspaceScreen' "$REPO_ROOT/clients/expo/App.tsx" \
   && [ ! -d "$REPO_ROOT/clients/expo/src/screens/workspace" ]; then
  record "expo-workspace-removed" PASS "no WorkspaceScreen import / directory"
else
  record "expo-workspace-removed" FAIL "WorkspaceScreen still wired into the app"
fi

if [ -f "$REPO_ROOT/clients/expo/src/releaseNotes.ts" ] \
   && grep -q 'WhatsNewScreen' "$REPO_ROOT/clients/expo/App.tsx" \
   && grep -q 'shouldShowWhatsNew' "$REPO_ROOT/clients/expo/App.tsx"; then
  record "expo-whats-new" PASS "WhatsNewScreen ships + wired into App.tsx"
else
  record "expo-whats-new" FAIL "WhatsNewScreen missing or not wired into App.tsx"
fi

# ── h5 (PC web) parity — ChatHome preview + What's New ───────────────────────

# spec docs-coolie/specs/2026-09-21-h5-web-parity.md §4.5. The PC web client
# (clients/h5, Vite + React 19) has no browser replay under clients/expo/replays,
# so its parity is proven by cheap, deterministic checks instead: the dev
# server answers, it builds to dist/, and the workspace screen is gone (wave 42).

H5_LOG="$(mktemp -t coolie-h5-dev.XXXXXX)"
H5_PID=""

stop_h5() {
  [ -n "$H5_PID" ] || return 0
  kill "$H5_PID" >/dev/null 2>&1 || true
  wait "$H5_PID" >/dev/null 2>&1 || true
  H5_PID=""
  rm -f "$H5_LOG"
}

wait_for_url() {
  local url="$1" tries="${2:-40}" i
  for ((i = 0; i < tries; i++)); do
    curl -s -o /dev/null --max-time 2 "$url" && return 0
    sleep 0.5
  done
  return 1
}

# Assertion 1: the h5 dev server comes up on its fixed port (5173) and returns 200.
( cd "$H5_DIR" && exec pnpm dev --port "$H5_PORT" --strictPort ) >"$H5_LOG" 2>&1 &
H5_PID=$!

if wait_for_url "$H5_URL"; then
  h5_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$H5_URL" || true)"
  if [ "$h5_code" = "200" ]; then
    record "H5-dev-server" PASS "http://localhost:$H5_PORT → 200"
  else
    record "H5-dev-server" FAIL "HTTP ${h5_code:-000}"
  fi

  # Assertion 3: wave 42 removed the workspace screen end to end (工坊 replaced
  # it), so the h5 mirror must not wire it back in: no import, no leftover dir.
  if ! grep -q 'WorkspaceScreen' "$H5_DIR/src/App.tsx" \
     && [ ! -d "$H5_DIR/src/screens/workspace" ]; then
    record "H5-workspace-removed" PASS "no WorkspaceScreen import / directory"
  else
    record "H5-workspace-removed" FAIL "WorkspaceScreen still wired into h5"
  fi

  # Assertion 4: What's New → 工坊 (ChatHome), as a real browser replay.
  # This is the install loop from the boss's seat; h5 mirrors the RN screens, so
  # a green run here is behavioural proof the flow still works end to end.
  run_replay "R4-whats-new" "whats-new.ad" || true
else
  record "H5-dev-server" FAIL "dev server did not come up (see log below)"
  record "H5-workspace-removed" SKIP "dev server down"
  printf '\n----- h5 dev log -----\n%s\n----------------------\n' "$(tail -20 "$H5_LOG" 2>/dev/null)"
fi

# Assertion 2: h5 builds and emits dist/index.html. Stop the dev server first so
# the build is not fighting it for the watched output directory.
stop_h5
if ( cd "$H5_DIR" && pnpm build ) >"$H5_LOG" 2>&1 && [ -f "$H5_DIR/dist/index.html" ]; then
  record "H5-build" PASS "clients/h5/dist/index.html ($(du -h "$H5_DIR/dist/index.html" | cut -f1))"
else
  record "H5-build" FAIL "clients/h5 build did not emit dist/index.html"
  printf '\n----- h5 build log -----\n%s\n------------------------\n' "$(tail -30 "$H5_LOG" 2>/dev/null)"
fi
rm -f "$H5_LOG"

# ── evidence + summary ───────────────────────────────────────────────────────

cleanup
trap - EXIT

while IFS= read -r f; do EVIDENCE_FILES+=("$f"); done < <(find "$EVIDENCE_DIR" -maxdepth 1 -type f -name '*.png' | sort)

passed=0; failed=0; skipped=0
for i in "${!A_NAME[@]}"; do
  case "${A_STATUS[$i]}" in
    PASS) passed=$((passed + 1)) ;;
    FAIL) failed=$((failed + 1)) ;;
    *)    skipped=$((skipped + 1)) ;;
  esac
done

printf '\nEvidence (absolute paths):\n'
if [ "${#EVIDENCE_FILES[@]}" -eq 0 ]; then
  printf '  (none)\n'
else
  for f in "${EVIDENCE_FILES[@]}"; do printf '  %s\n' "$f"; done
fi

printf '\nAssertions: %d passed, %d failed, %d skipped (of %d)\n' \
  "$passed" "$failed" "$skipped" "${#A_NAME[@]}"
if [ "$failed" -gt 0 ]; then
  printf 'Failing:\n'
  for i in "${!A_NAME[@]}"; do
    [ "${A_STATUS[$i]}" = "FAIL" ] && printf '  - %s: %s\n' "${A_NAME[$i]}" "${A_DETAIL[$i]}"
  done
fi
printf '\n'

[ "$failed" -eq 0 ] || exit 1
exit 0
