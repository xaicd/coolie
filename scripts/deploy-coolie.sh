#!/usr/bin/env bash
#
# Deploy this fork to the production host.
#
# One command, and the whole tree — that is the point. An earlier deploy synced
# only `server/src/` after the rest of the checkout had moved on, and the server
# started importing an export that the deployed `@paperclipai/shared` did not
# have yet. The service crash-looped until a full sync and rebuild. So this
# script never syncs a subpath: it syncs the tree, then rebuilds whatever went
# stale, then restarts, then proves the result in a way that fails loudly.
#
# Usage:
#   scripts/deploy-coolie.sh              # deploy the current commit
#   scripts/deploy-coolie.sh --allow-dirty
#
# Configuration (environment):
#   COOLIE_HOST          ssh target             (default: tc-coolie-claw)
#   COOLIE_DIR           deploy directory       (default: /opt/coolie)
#   COOLIE_SERVICE       systemd unit           (default: coolie)
#   COOLIE_PUBLIC_URL    public base URL        (default: https://xrobinai.cn)
#   COOLIE_LEGACY_PATHS  retired paths to assert, space-separated (default: none)

set -euo pipefail

COOLIE_HOST="${COOLIE_HOST:-tc-coolie-claw}"
COOLIE_DIR="${COOLIE_DIR:-/opt/coolie}"
COOLIE_SERVICE="${COOLIE_SERVICE:-coolie}"
COOLIE_PUBLIC_URL="${COOLIE_PUBLIC_URL:-https://xrobinai.cn}"
PUBLIC_HOST="${COOLIE_PUBLIC_URL#*://}"

ALLOW_DIRTY=0
for arg in "$@"; do
  case "$arg" in
    --allow-dirty) ALLOW_DIRTY=1 ;;
    -h|--help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Paths that must never be copied to the host: local installs, build output, and
# history. `dist` is excluded because it is rebuilt there; shipping a stale one
# is worse than shipping none.
RSYNC_EXCLUDES=(
  --exclude='node_modules'
  --exclude='.git'
  --exclude='target'
  --exclude='dist'
  --exclude='test-results'
  --exclude='screenshots'
  --exclude='report'
  --exclude='.commandcode'
  --exclude='*.tsbuildinfo'
)

# Workspace packages the server loads from built output rather than source.
BUILT_PACKAGES=(shared db adapter-utils plugins/sdk skills-catalog teams-catalog)

step() { printf '\n=== %s ===\n' "$1"; }
die() { printf '\nFAIL: %s\n' "$1" >&2; exit 1; }

# Paths this deployment has retired and must never serve again, space-separated.
# Empty by default, because a retired path is a fact about one deployment and
# not about this repo: hard-coding one here would fail a correct deploy on any
# other instance, where the SPA fallback legitimately answers 200 for a path
# nobody ever retired.
COOLIE_LEGACY_PATHS="${COOLIE_LEGACY_PATHS:-}"

step "preflight"
SHA="$(git rev-parse --short HEAD)"
BRANCH="$(git branch --show-current)"
DIRTY="$(git status --porcelain --untracked-files=no)"
if [ -n "$DIRTY" ] && [ "$ALLOW_DIRTY" -eq 0 ]; then
  cat >&2 <<MSG
refusing to deploy: the working tree has uncommitted changes.

This is deliberate. The deploy copies the working tree, so a dirty tree means
what lands on the host matches no commit and cannot be reproduced or rolled
back to. In a repo with more than one writer that is usually not even your
change — check who owns the files below before deciding.

  $DIRTY

Either commit them, or deploy the tree as-is with:

  $0 --allow-dirty

MSG
  exit 1
fi
if [ -n "$DIRTY" ]; then
  echo "WARNING: deploying a dirty tree; what lands on the host matches no commit:"
  echo "$DIRTY" | sed 's/^/  /'
fi
ssh -o BatchMode=yes -o ConnectTimeout=15 "$COOLIE_HOST" true \
  || die "cannot reach $COOLIE_HOST over ssh"
echo "deploying ${BRANCH}@${SHA} to ${COOLIE_HOST}:${COOLIE_DIR}"

step "sync whole tree"
rsync -az --delete "${RSYNC_EXCLUDES[@]}" ./ "${COOLIE_HOST}:${COOLIE_DIR}/" \
  || die "rsync failed"
echo "synced"

step "rebuild whatever went stale"
# A package only needs rebuilding when its source is newer than its build output.
# Checking beats rebuilding unconditionally: the UI build is the slow part, and
# skipping it when nothing changed keeps a routine deploy to about a minute.
STALE="$(ssh -o BatchMode=yes "$COOLIE_HOST" "cd '$COOLIE_DIR' && for p in ${BUILT_PACKAGES[*]}; do
  if [ -n \"\$(find \"packages/\$p/src\" -newer \"packages/\$p/dist\" -name '*.ts' 2>/dev/null | head -1)\" ]; then echo \"pkg:\$p\"; fi
done; if [ -n \"\$(find ui/src -newer ui/dist/index.html \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' \) 2>/dev/null | head -1)\" ]; then echo 'ui'; fi")"

if [ -z "$STALE" ]; then
  echo "nothing stale; skipping build"
else
  echo "stale: $(echo "$STALE" | tr '\n' ' ')"
  ssh -o BatchMode=yes "$COOLIE_HOST" "cd '$COOLIE_DIR' && export CI=1 && pnpm install --frozen-lockfile >/dev/null 2>&1 || true" \
    || die "pnpm install failed"
  for target in $STALE; do
    case "$target" in
      ui)
        ssh -o BatchMode=yes "$COOLIE_HOST" "cd '$COOLIE_DIR' && export CI=1 && pnpm --filter @paperclipai/ui build" >/dev/null \
          || die "ui build failed"
        echo "  built ui" ;;
      pkg:*)
        name="${target#pkg:}"
        ssh -o BatchMode=yes "$COOLIE_HOST" "cd '$COOLIE_DIR' && export CI=1 && pnpm --filter @paperclipai/${name#plugins\/} build" >/dev/null \
          || die "build failed for $name"
        echo "  built $name" ;;
    esac
  done
fi

# The UI must exist: the server runs in static mode, and without dist it silently
# falls back to API-only and the site serves nothing.
ssh -o BatchMode=yes "$COOLIE_HOST" "test -f '$COOLIE_DIR/ui/dist/index.html'" \
  || die "ui/dist/index.html is missing on the host — the site would serve no UI"

step "restart and wait for health"
ssh -o BatchMode=yes "$COOLIE_HOST" "sudo -n systemctl restart '$COOLIE_SERVICE'" || die "restart failed"
for _ in $(seq 1 30); do
  if ssh -o BatchMode=yes "$COOLIE_HOST" "curl -fsS -m 5 http://127.0.0.1:3100/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
ssh -o BatchMode=yes "$COOLIE_HOST" "curl -fsS -m 5 http://127.0.0.1:3100/api/health" >/dev/null 2>&1 \
  || die "$COOLIE_SERVICE did not become healthy; check: ssh $COOLIE_HOST journalctl -u $COOLIE_SERVICE -n 50"
echo "health ok"

step "verify from outside"
verify_contains() {
  local url="$1" needle="$2" label="$3"
  local body
  body="$(curl -fsS -m 20 "$url" 2>/dev/null)" || die "$label: $url did not respond"
  case "$body" in
    *"$needle"*) echo "  ok   $label" ;;
    *) die "$label: $url is reachable but does not contain '$needle'" ;;
  esac
}

verify_contains "${COOLIE_PUBLIC_URL}/api/health" '"status":"ok"' "api health"

# The filing number is a legal requirement on every page a reviewer can reach,
# so a deploy that drops it fails here rather than being noticed by a regulator.
FILING="$(ssh -o BatchMode=yes "$COOLIE_HOST" "sudo -n sed -n 's/^PAPERCLIP_ICP_LICENSE=//p' /etc/coolie/icp.env" | tr -d '\r')"
if [ -n "$FILING" ]; then
  verify_contains "${COOLIE_PUBLIC_URL}/" "$FILING" "filing number on the landing page"
  verify_contains "${COOLIE_PUBLIC_URL}/auth" "$FILING" "filing number in the app shell"
else
  echo "  WARN no ICP filing number configured on the host; skipping that check"
fi

# Retired paths, when this deployment has declared any. Probed over the public
# scheme on purpose: over plain HTTP every path answers 308, because Caddy's
# redirect to HTTPS runs before the site's own routes, so an HTTP probe would
# assert nothing about the route it names.
if [ -n "$COOLIE_LEGACY_PATHS" ]; then
  for retired in $COOLIE_LEGACY_PATHS; do
    code="$(curl -sS -m 20 -o /dev/null -w '%{http_code}' "${COOLIE_PUBLIC_URL}${retired}" || true)"
    case "$code" in
      410|404) echo "  ok   retired ${retired} returns ${code}" ;;
      *) die "retired ${retired} returned ${code}; it must be 404 or 410, not the app shell" ;;
    esac
  done
else
  echo "  skip no retired paths declared (set COOLIE_LEGACY_PATHS to assert some)"
fi

# www is a separate certificate and a separate site block; a regression there is
# invisible unless something asks for it explicitly.
verify_contains "https://www.${PUBLIC_HOST}/" "<html" "www host"

printf '\nDEPLOYED %s@%s to %s\n' "$BRANCH" "$SHA" "$COOLIE_PUBLIC_URL"
