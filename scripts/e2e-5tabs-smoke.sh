#!/usr/bin/env bash
#
# scripts/e2e-5tabs-smoke.sh — Coolie h5 5 tabs Playwright smoke (wave66).
#
# Drives the h5 web shell through:
#   1. Login (better-auth session cookie)
#   2. 5-tab cycle: 工坊 → 任务 → 收件箱 → 看额度 → 本体驱动
#   3. Real API fetch sanity for the 5 tab surface:
#        /api/companies                       → 200
#        /api/companies/:id/issues            → 200
#        /api/companies/:id/inbox             → 200
#        /api/companies/:id/agents            → 200
#        /api/companies/:id/dashboard         → 200
#   4. Each tab visible-text contains its expected keyword.
#
# Failure: prints the failing step + HTTP code / Playwright error, then exits 1.
# Designed to be invoked from PM-CI or a developer's terminal — not from CI in
# the cloud (the dev server must be running on the test host).
#
# Env (optional):
#   E2E_BASE_URL   — defaults to http://localhost:3100/api (dev API)
#   H5_BASE_URL    — defaults to http://localhost:5173 (Vite dev server)
#   COOLIE_EMAIL   — better-auth email (defaults to robinschen1989@gmail.com)
#   COOLIE_PASSWORD — better-auth password (read from secrets if unset)
#   E2E_TIMEOUT_MS — per-tab timeout (defaults to 15000)
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

E2E_BASE_URL="${E2E_BASE_URL:-http://localhost:3100/api}"
H5_BASE_URL="${H5_BASE_URL:-http://localhost:5173}"
COOLIE_EMAIL="${COOLIE_EMAIL:-robinschen1989@gmail.com}"
COOLIE_PASSWORD="${COOLIE_PASSWORD:-${COOLIE_E2E_PASSWORD:-}}"
E2E_TIMEOUT_MS="${E2E_TIMEOUT_MS:-15000}"

fail() {
  printf '\n❌ 5-tabs smoke FAILED: %s\n' "$1" >&2
  exit 1
}
step() { printf '\n=== %s ===\n' "$1"; }

if ! command -v node >/dev/null 2>&1; then
  fail "node is required (wave66 Playwright smoke runs a Node helper)"
fi
if [ ! -d "$REPO_ROOT/node_modules/playwright" ] && [ ! -d "$REPO_ROOT/node_modules/@playwright" ]; then
  echo "[info] playwright not in repo node_modules, using system playwright"
fi
if [ -z "$COOLIE_PASSWORD" ]; then
  if [ -f /etc/coolie/secrets.env ]; then
    COOLIE_PASSWORD="$(grep -E '^COOLIE_E2E_PASSWORD=' /etc/coolie/secrets.env 2>/dev/null | head -1 | cut -d= -f2- || true)"
  fi
fi
if [ -z "$COOLIE_PASSWORD" ]; then
  fail "COOLIE_PASSWORD (or COOLIE_E2E_PASSWORD) is required for the login step"
fi

step "[1/4] Playwright 5-tabs runner (login → 5 tab cycle → 5 fetch sanity)"
node "$SCRIPT_DIR/e2e-5tabs-smoke.mjs" \
  --api-base "$E2E_BASE_URL" \
  --h5-base "$H5_BASE_URL" \
  --email "$COOLIE_EMAIL" \
  --password "$COOLIE_PASSWORD" \
  --timeout-ms "$E2E_TIMEOUT_MS"

step "[2/4] OK"
echo "✅ 5 tabs all visible + 5 fetches 200"
echo "   tab cycle:   工坊 → 任务 → 收件箱 → 看额度 → 本体驱动"
echo "   API sanity:  /companies + /issues + /inbox + /agents + /dashboard"
