#!/usr/bin/env bash
# scripts/device-claim.sh
#
# Serialize access to one shared Android device (default: emulator-5554) so two
# digital employees cannot drive it at the same time and cross-contaminate each
# other's evidence. Root cause: COOA-117-S5 and COOA-228 (e1283cba) both grabbed
# emulator-5554 and polluted each other's screenshots/recordings.
#
# The lock is a directory created with `mkdir` — atomic on every POSIX
# filesystem — so exactly one contender wins each acquisition. The holder writes
# owner / pid / host / TTL into `<claim>/meta`. A claim whose TTL has elapsed is
# "stale": the next contender reclaims it automatically (default 15 min), so a
# driver that is SIGKILLed cannot wedge the device forever.
#
# Usage:
#   device-claim.sh acquire [--device <serial>] [--owner <id>] [--ttl <sec>] [--wait <sec>] [--json]
#   device-claim.sh release [--device <serial>] [--owner <id>] [--force] [--json]
#   device-claim.sh status  [--device <serial>] [--json]
#   device-claim.sh reap    [--device <serial>] [--json]
#   device-claim.sh run     [--device <serial>] [--owner <id>] [--ttl <sec>] [--wait <sec>] -- <command...>
#
# `run` is the driver wrapper: it acquires before the wrapped command starts and
# releases when the command exits (including non-zero exits and SIGINT/SIGTERM).
# Use it to wrap a real device drive, e.g.
#   scripts/device-claim.sh run -- host-exec "agent-device open --appId com.x"
#
# Exit codes:
#   0  success (acquire granted / released / status free-or-stale / reap done / wrapped command exited 0)
#   2  usage error
#   3  device busy — acquire denied; also `status` while an active (non-stale) claim is held
#   4  release denied (caller is not the recorded owner and --force was not given)
#   N  `run`: the wrapped command's own exit status
#
# Env:
#   DEVICE_CLAIM_DIR          lock root (default: ${COOLIE_LOCAL_DIR:-<repo>/.coolie-local}/device-locks)
#   DEVICE_CLAIM_DEVICE       default device serial (default: emulator-5554)
#   DEVICE_CLAIM_TTL          default TTL in seconds (default: 900 = 15 min)
#   DEVICE_CLAIM_OWNER        default owner id
#   DEVICE_CLAIM_META_GRACE   seconds a claim dir may lack meta before it is stale (default: 60)
#   DEVICE_CLAIM_PID_RECLAIM=1  also reclaim a same-host claim whose recorded pid is gone

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

LOCK_ROOT="${DEVICE_CLAIM_DIR:-${COOLIE_LOCAL_DIR:-$REPO_ROOT/.coolie-local}/device-locks}"
DEVICE="${DEVICE_CLAIM_DEVICE:-emulator-5554}"
TTL="${DEVICE_CLAIM_TTL:-900}"
META_GRACE="${DEVICE_CLAIM_META_GRACE:-60}"
OWNER="${DEVICE_CLAIM_OWNER:-${PAPERCLIP_AGENT_ID:-${USER:-$(id -un 2>/dev/null || printf 'agent')}}}"
HOST_SHORT="$(hostname 2>/dev/null || printf 'unknown')"
ALLOW_PID_RECLAIM="${DEVICE_CLAIM_PID_RECLAIM:-0}"

EXIT_USAGE=2
EXIT_BUSY=3
EXIT_NOT_OWNER=4

JSON=0
FORCE=0
WAIT=0
CMD=()

case "$(uname -s 2>/dev/null || printf 'linux')" in
  Darwin) MSTAT=(stat -f %m) ;;
  *)      MSTAT=(stat -c %m) ;;
esac

usage() {
  cat <<'EOF'
usage: scripts/device-claim.sh <acquire|release|status|reap|run> [options]

  acquire   Take the device lock (fails with exit 3 when held).
  release   Drop the device lock (owner must match unless --force).
  status    Report the lock state (exit 0 = free/stale, exit 3 = held).
  reap      Remove a stale claim left by a crashed driver.
  run       Acquire, run a command, release. Everything after -- is the command.

options:
  --device <serial>   Device serial (default: emulator-5554)
  --owner <id>        Owner identity recorded / required to release
  --ttl <seconds>     Lease length before the claim becomes stale (default: 900)
  --wait <seconds>    acquire/run only: wait up to N seconds for a busy device
  --force             release/run only: release even if this caller is not the owner
  --json              Machine-readable JSON on stdout
EOF
}

_iso() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
_epoch() { date +%s; }

_json_escape() {
  printf '%s' "${1:-}" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

_claim_dir() { printf '%s/%s.claim' "$LOCK_ROOT" "$DEVICE"; }

_meta_field() {
  local meta="$1" key="$2"
  [ -f "$meta" ] || return 0
  grep -m1 "^${key}=" "$meta" 2>/dev/null | cut -d= -f2- || true
}

_mtime_epoch() {
  local path="$1" value
  value="$("${MSTAT[@]}" "$path" 2>/dev/null || true)"
  case "${value:-}" in ''|*[!0-9]*) return 0 ;; esac
  printf '%s' "$value"
}

# Echo a non-empty staleness reason, or nothing when the claim is still active.
_stale_reason() {
  local cdir="$1" now started ttl pid host m
  now="$(_epoch)"
  if [ -f "$cdir/meta" ]; then
    started="$(_meta_field "$cdir/meta" startedAtEpoch)"
    ttl="$(_meta_field "$cdir/meta" ttlSeconds)"
    case "${started:-}" in ''|*[!0-9]*) started="" ;; esac
    case "${ttl:-}" in ''|*[!0-9]*) ttl="$TTL" ;; esac
    if [ -n "$started" ] && [ "$(( now - started ))" -ge "$ttl" ]; then
      printf 'ttl_expired'
      return 0
    fi
    if [ "$ALLOW_PID_RECLAIM" = "1" ]; then
      pid="$(_meta_field "$cdir/meta" pid)"
      host="$(_meta_field "$cdir/meta" host)"
      case "${pid:-}" in ''|*[!0-9]*) pid="" ;; esac
      if [ -n "$pid" ] && [ "$host" = "$HOST_SHORT" ] && ! kill -0 "$pid" 2>/dev/null; then
        printf 'owner_dead'
        return 0
      fi
    fi
    return 0
  fi
  # Meta not written yet: the holder is between `mkdir` and the metadata write,
  # or crashed there. Only after the grace window is a meta-less claim stale.
  m="$(_mtime_epoch "$cdir")"
  case "${m:-}" in ''|*[!0-9]*) m="$now" ;; esac
  if [ "$(( now - m ))" -ge "$META_GRACE" ]; then
    printf 'claim_meta_missing'
  fi
  return 0
}

_write_meta() {
  local cdir="$1" tmp="$1/meta.tmp.$$"
  {
    printf 'schemaVersion=1\n'
    printf 'device=%s\n' "$DEVICE"
    printf 'owner=%s\n' "$OWNER"
    printf 'pid=%s\n' "$$"
    printf 'host=%s\n' "$HOST_SHORT"
    printf 'startedAt=%s\n' "$(_iso)"
    printf 'startedAtEpoch=%s\n' "$(_epoch)"
    printf 'ttlSeconds=%s\n' "$TTL"
    if [ "${#CMD[@]}" -gt 0 ]; then
      printf 'command=%s\n' "${CMD[*]}"
    fi
  } > "$tmp"
  mv "$tmp" "$cdir/meta"
}

_emit_acquired() {
  local cdir="$1"
  if [ "$JSON" = "1" ]; then
    printf '{"event":"acquired","device":"%s","owner":"%s","pid":%s,"host":"%s","ttlSeconds":%s,"claimedAt":"%s","lock":"%s"}\n' \
      "$(_json_escape "$DEVICE")" "$(_json_escape "$OWNER")" "$$" "$(_json_escape "$HOST_SHORT")" \
      "$TTL" "$(_iso)" "$(_json_escape "$cdir")"
  else
    printf '[device-claim] acquired %s (owner=%s, ttl=%ss, lock=%s)\n' "$DEVICE" "$OWNER" "$TTL" "$cdir"
  fi
}

_emit_busy() {
  local cdir="$1" meta="$1/meta" owner pid reason
  owner="$(_meta_field "$meta" owner)"
  pid="$(_meta_field "$meta" pid)"
  reason="$(_stale_reason "$cdir")"
  if [ "$JSON" = "1" ]; then
    printf '{"event":"busy","device":"%s","owner":"%s","pid":"%s","stale":"%s","lock":"%s"}\n' \
      "$(_json_escape "$DEVICE")" "$(_json_escape "$owner")" "$(_json_escape "$pid")" \
      "$(_json_escape "$reason")" "$(_json_escape "$cdir")"
  else
    printf '[device-claim] %s is busy (held by %s, pid %s)\n' "$DEVICE" "${owner:-unknown}" "${pid:-?}"
  fi
}

_acquire() {
  local cdir start now quarantine reason
  cdir="$(_claim_dir)"
  mkdir -p "$LOCK_ROOT"
  start="$(_epoch)"
  while :; do
    if mkdir "$cdir" 2>/dev/null; then
      if _write_meta "$cdir"; then
        _emit_acquired "$cdir"
        return 0
      fi
      rm -rf "$cdir" 2>/dev/null || true
      printf '[device-claim] failed to write claim metadata under %s\n' "$cdir" >&2
      return 1
    fi
    reason="$(_stale_reason "$cdir")"
    if [ -n "$reason" ]; then
      # Atomic takeover: `mv` succeeds for exactly one contender because the
      # source vanishes for every other after the first rename.
      quarantine="$cdir.stale.$$.$start"
      if mv "$cdir" "$quarantine" 2>/dev/null; then
        rm -rf "$quarantine" 2>/dev/null || true
        continue
      fi
    fi
    if [ "$WAIT" -gt 0 ]; then
      now="$(_epoch)"
      if [ "$(( now - start ))" -lt "$WAIT" ]; then
        sleep 0.25
        continue
      fi
    fi
    _emit_busy "$cdir"
    return $EXIT_BUSY
  done
}

_release() {
  local cdir cur
  cdir="$(_claim_dir)"
  if [ ! -d "$cdir" ]; then
    if [ "$JSON" = "1" ]; then
      printf '{"event":"free","device":"%s"}\n' "$(_json_escape "$DEVICE")"
    else
      printf '[device-claim] %s already free\n' "$DEVICE"
    fi
    return 0
  fi
  cur="$(_meta_field "$cdir/meta" owner)"
  if [ "$FORCE" != "1" ]; then
    if [ -z "$cur" ]; then
      printf '[device-claim] refusing to release %s: claim has no owner metadata (use --force)\n' "$DEVICE" >&2
      return $EXIT_NOT_OWNER
    fi
    if [ "$OWNER" != "$cur" ]; then
      printf '[device-claim] refusing to release %s: held by %s, caller is %s (use --force)\n' "$DEVICE" "$cur" "$OWNER" >&2
      return $EXIT_NOT_OWNER
    fi
  fi
  rm -rf "$cdir"
  if [ "$JSON" = "1" ]; then
    printf '{"event":"released","device":"%s","by":"%s"}\n' "$(_json_escape "$DEVICE")" "$(_json_escape "$OWNER")"
  else
    printf '[device-claim] released %s (owner=%s)\n' "$DEVICE" "$OWNER"
  fi
  return 0
}

_status() {
  local cdir now meta owner pid started ttl reason remaining state held
  cdir="$(_claim_dir)"
  if [ ! -d "$cdir" ]; then
    if [ "$JSON" = "1" ]; then
      printf '{"device":"%s","state":"free"}\n' "$(_json_escape "$DEVICE")"
    else
      printf '%s: free\n' "$DEVICE"
    fi
    return 0
  fi
  reason="$(_stale_reason "$cdir")"
  meta="$cdir/meta"
  owner="$(_meta_field "$meta" owner)"
  pid="$(_meta_field "$meta" pid)"
  started="$(_meta_field "$meta" startedAtEpoch)"
  ttl="$(_meta_field "$meta" ttlSeconds)"
  now="$(_epoch)"
  case "${started:-}" in ''|*[!0-9]*) started="$now" ;; esac
  case "${ttl:-}" in ''|*[!0-9]*) ttl="$TTL" ;; esac
  remaining="$(( started + ttl - now ))"
  if [ "$remaining" -lt 0 ]; then remaining=0; fi
  if [ -n "$reason" ]; then held=0; state="stale"; else held=1; state="held"; fi
  if [ "$JSON" = "1" ]; then
    printf '{"device":"%s","state":"%s","owner":"%s","pid":"%s","ttlSeconds":%s,"remainingSeconds":%s,"stale":"%s"}\n' \
      "$(_json_escape "$DEVICE")" "$state" "$(_json_escape "$owner")" "$(_json_escape "$pid")" \
      "$ttl" "$remaining" "$(_json_escape "$reason")"
  elif [ "$held" = 1 ]; then
    printf '%s: held by %s (pid %s), ttl %ss, remaining %ss\n' "$DEVICE" "${owner:-unknown}" "${pid:-?}" "$ttl" "$remaining"
  else
    printf '%s: stale claim by %s (%s), reclaimable\n' "$DEVICE" "${owner:-unknown}" "$reason"
  fi
  if [ "$held" = 1 ]; then return $EXIT_BUSY; fi
  return 0
}

_reap() {
  local cdir q reason removed=0
  cdir="$(_claim_dir)"
  if [ -d "$cdir" ]; then
    reason="$(_stale_reason "$cdir")"
    if [ -n "$reason" ]; then
      rm -rf "$cdir"
      removed=1
    fi
  fi
  for q in "$LOCK_ROOT"/*.stale.*; do
    [ -e "$q" ] || continue
    rm -rf "$q" 2>/dev/null || true
  done
  if [ "$JSON" = "1" ]; then
    if [ "$removed" = 1 ]; then
      printf '{"event":"reap","device":"%s","reclaimed":true}\n' "$(_json_escape "$DEVICE")"
    else
      printf '{"event":"reap","device":"%s","reclaimed":false}\n' "$(_json_escape "$DEVICE")"
    fi
  elif [ "$removed" = 1 ]; then
    printf '[device-claim] reclaimed stale claim for %s\n' "$DEVICE"
  else
    printf '[device-claim] no stale claim for %s\n' "$DEVICE"
  fi
  return 0
}

_run() {
  local rc
  if [ "${#CMD[@]}" -eq 0 ]; then
    printf '[device-claim] run: no command given (use: device-claim.sh run -- <command...>)\n' >&2
    return $EXIT_USAGE
  fi
  _acquire 1>&2 || return $?
  _released=0
  _run_cleanup() {
    if [ "$_released" = "0" ]; then
      _released=1
      _release >/dev/null 2>&1 || true
    fi
  }
  trap _run_cleanup EXIT INT TERM
  set +e
  "${CMD[@]}"
  rc=$?
  set -e
  _run_cleanup
  trap - EXIT INT TERM
  return "$rc"
}

ACTION="${1:-}"
if [ -z "$ACTION" ]; then
  usage >&2
  exit $EXIT_USAGE
fi
shift || true

while [ $# -gt 0 ]; do
  case "$1" in
    --device) DEVICE="${2:-}"; shift 2 ;;
    --owner)  OWNER="${2:-}"; shift 2 ;;
    --ttl)    TTL="${2:-}"; shift 2 ;;
    --wait)   WAIT="${2:-}"; shift 2 ;;
    --json)   JSON=1; shift ;;
    --force)  FORCE=1; shift ;;
    --)
      shift
      while [ $# -gt 0 ]; do CMD+=("$1"); shift; done
      ;;
    -*)
      printf '[device-claim] unknown option: %s\n' "$1" >&2
      usage >&2
      exit $EXIT_USAGE
      ;;
    *)
      CMD+=("$1"); shift ;;
  esac
done

case "${TTL:-}" in ''|*[!0-9]*) printf '[device-claim] invalid --ttl: %s\n' "$TTL" >&2; exit $EXIT_USAGE ;; esac
case "${WAIT:-}" in ''|*[!0-9]*) printf '[device-claim] invalid --wait: %s\n' "$WAIT" >&2; exit $EXIT_USAGE ;; esac
if [ -z "$DEVICE" ] || ! printf '%s' "$DEVICE" | grep -Eq '^[A-Za-z0-9._:-]+$'; then
  printf '[device-claim] invalid --device: %s\n' "$DEVICE" >&2
  exit $EXIT_USAGE
fi

case "$ACTION" in
  acquire) _acquire ;;
  release) _release ;;
  status)  _status ;;
  reap)    _reap ;;
  run)     _run ;;
  -h|--help|help) usage; exit 0 ;;
  *)
    printf '[device-claim] unknown action: %s\n' "$ACTION" >&2
    usage >&2
    exit $EXIT_USAGE
    ;;
esac
