#!/usr/bin/env bash
# scripts/lib/mcp-install-common.sh
#
# Shared helpers for the wave228 MCP install shims. Source-only — not executable
# on its own. Provides:
#
#   mcp_log <msg>                  – print a [wave228-mcp] prefixed line on stderr
#   mcp_cli_present <cli>          – 0 if CLI is in PATH or Homebrew bin
#   mcp_settings_path              – echoes ~/.claude/settings.json (MCP_HOME override)
#   mcp_read_settings              – read JSON, returns "{}" on miss
#   mcp_write_settings <path> <js> – write JSON (mkdir -p parent)
#   mcp_register_server \
#     <tool> <name> <command> <args-json-array-string>
#                                  – idempotent merge into .mcpServers.<name>;
#                                    honours MCP_DRY_RUN (=1 → no disk write)
#   mcp_for_each_cli <callback>    – iterates MCP_CLI_TOOLS, skipping missing
#
# Every Claude-Code-derived CLI on this Mac reads ~/.claude/settings.json. We
# intentionally do not fork per-tool paths — that would scatter config and
# break wave225 "1 主 + 5 员工" 单一事实源.
#
# Idempotency: re-running with same name+command+args prints "noop"; with
# different args prints "update" / "insert". Other mcpServers keys preserved.

set -euo pipefail

# Canonical CLI list. Order matches the brief's priority list.
MCP_CLI_TOOLS=(claude claude-mm claude-glm claude-ds agy copilot cmd)

mcp_log() {
  printf '[wave228-mcp] %s\n' "$*" >&2
}

mcp_die() {
  printf '[wave228-mcp] 失败: %s\n' "$*" >&2
  exit 1
}

mcp_cli_present() {
  local cli="$1"
  if [[ "${MCP_STRICT_PATH:-0}" == "1" ]]; then
    # Test mode — only honour PATH, do not look in Homebrew bin directly.
    command -v "$cli" >/dev/null 2>&1 && return 0
    return 1
  fi
  command -v "$cli" >/dev/null 2>&1 && return 0
  [[ -x "/opt/homebrew/bin/$cli" ]] && return 0
  [[ -x "/usr/local/bin/$cli" ]] && return 0
  return 1
}

mcp_settings_path() {
  printf '%s/.claude/settings.json\n' "${MCP_HOME:-$HOME}"
}

mcp_read_settings() {
  local path="$1"
  if [[ -f "$path" ]]; then
    python3 -c 'import json,sys; print(json.dumps(json.load(open(sys.argv[1])), ensure_ascii=False))' "$path"
  else
    printf '{}\n'
  fi
}

mcp_write_settings() {
  local path="$1" contents="$2"
  local dir
  dir="$(dirname "$path")"
  [[ -d "$dir" ]] || mkdir -p "$dir"
  printf '%s\n' "$contents" > "$path"
}

# Register one MCP server entry. Usage:
#   mcp_register_server <tool> <name> <command> <args-json-array-string>
#
# <args-json-array-string> is a JSON array literal, e.g. '["mcp"]' or
# '["--stdio"]'. Merges under .mcpServers.<name>; other mcpServers keys
# preserved verbatim.
mcp_register_server() {
  local tool="$1" name="$2" command="$3" args_json="$4"
  local path
  path="$(mcp_settings_path "$tool")"

  local current
  current="$(mcp_read_settings "$path")"

  local result
  result="$(
    CURRENT_JSON="$current" \
    MCP_NAME="$name" \
    MCP_COMMAND="$command" \
    MCP_ARGS="$args_json" \
    python3 - <<'PY'
import json, os
current = json.loads(os.environ["CURRENT_JSON"])
name = os.environ["MCP_NAME"]
entry = {"command": os.environ["MCP_COMMAND"], "args": json.loads(os.environ["MCP_ARGS"])}
servers = current.setdefault("mcpServers", {})
existing = servers.get(name)
if existing == entry:
    print(json.dumps({"action": "noop", "merged": current}, ensure_ascii=False))
elif existing is None:
    servers[name] = entry
    print(json.dumps({"action": "insert", "merged": current}, ensure_ascii=False))
else:
    servers[name] = entry
    print(json.dumps({"action": "update", "merged": current}, ensure_ascii=False))
PY
  )"

  local action merged
  action="$(printf '%s' "$result" | python3 -c 'import json,sys; print(json.loads(sys.stdin.read())["action"])')"
  merged="$(printf '%s' "$result" | python3 -c 'import json,sys; print(json.dumps(json.loads(sys.stdin.read())["merged"], ensure_ascii=False))')"

  case "$action" in
    noop)
      mcp_log "$tool → $name: already registered, no-op"
      ;;
    insert)
      if [[ "${MCP_DRY_RUN:-0}" == "1" ]]; then
        local rendered
        rendered="$(printf '%s' "$merged" | python3 -c 'import json,sys; print(json.dumps(json.loads(sys.stdin.read())["mcpServers"][sys.argv[1]], ensure_ascii=False))' "$name")"
        mcp_log "would write: $path → mcpServers[\"$name\"] = $rendered"
      else
        mcp_write_settings "$path" "$merged"
        mcp_log "$tool → $name: inserted"
      fi
      ;;
    update)
      if [[ "${MCP_DRY_RUN:-0}" == "1" ]]; then
        mcp_log "would update: $path → mcpServers[\"$name\"] (existing entry differs)"
      else
        mcp_write_settings "$path" "$merged"
        mcp_log "$tool → $name: updated"
      fi
      ;;
  esac
}

# Iterate every installed CLI tool and call a callback. Callback receives one
# arg: the CLI tool name. Missing tools print "skipping <cli> — not installed".
mcp_for_each_cli() {
  local cb="$1"
  local cli
  for cli in "${MCP_CLI_TOOLS[@]}"; do
    if mcp_cli_present "$cli"; then
      "$cb" "$cli"
    else
      mcp_log "skipping $cli — not installed"
    fi
  done
}