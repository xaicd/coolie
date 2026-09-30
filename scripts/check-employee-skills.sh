#!/usr/bin/env bash
# scripts/check-employee-skills.sh [--employee <name>] [--missing-only] [--json]
#
# wave232 — Check the 5-employee × skills matrix documented in
# docs-coolie/EMPLOYEE-SKILLS.md. For each (employee, skill) row, verify the
# underlying SKILL.md exists in `.agents/skills/<name>/` AND that the local
# CLI symlink targets exist in `~/.claude/skills/`, `~/.cmd/skills/`,
# `~/.agy/skills/`, `~/.copilot/skills/`.
#
# Output is a per-employee table:
#
#   employee  P0 ok / total   P1 ok / total   P0 MISSING list
#
# Exit codes:
#   0  all P0 skills present (or no P0 specified for the employee)
#   1  one or more P0 MISSING
#   2  usage error
#
# Flags:
#   --employee <name>   Check only one employee (tiejiang / menshen /
#                       duidiyuan / modou / baixiaosheng). Default: all 5.
#   --missing-only      Print only MISSING / WARN rows (used by PM to decide
#                       what to fix next).
#   --json              Emit a single JSON object instead of a table. Schema:
#                         { "tiejiang": { "p0": [{"skill":..., "status":...}],
#                                         "p1": [...], "missing": [...] }, ... }
#   --repo <path>       Override repo root (default: cd to script's parent).
#   --strict            Fail (exit 1) if any P0 OR P1 is MISSING.
#
# This script is read-only — it never modifies the filesystem.

set -euo pipefail

usage() {
  cat <<'EOF'
usage: scripts/check-employee-skills.sh [--employee <name>] [--missing-only] [--json] [--strict]

Validates the EMPLOYEE-SKILLS.md matrix against the actual `.agents/skills/`
tree and the four CLI skill-load paths.

  --employee <name>   tiejiang | menshen | duidiyuan | modou | baixiaosheng
  --missing-only      only print rows that are MISSING or WARN
  --json              print a JSON object instead of a human table
  --repo <path>       override repo root (default: script's parent dir)
  --strict            exit 1 on any P0 OR P1 MISSING

Exit codes: 0 OK / 1 P0 (or --strict) missing / 2 usage error.
EOF
}

# Resolve repo root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

EMPLOYEE=""
MISSING_ONLY=0
JSON=0
STRICT=0

while [ $# -gt 0 ]; do
  case "$1" in
    --employee) EMPLOYEE="$2"; shift 2 ;;
    --missing-only) MISSING_ONLY=1; shift ;;
    --json) JSON=1; shift ;;
    --repo) REPO_ROOT="$2"; shift 2 ;;
    --strict) STRICT=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'unknown arg: %s\n' "$1" >&2; usage; exit 2 ;;
  esac
done

if [ -n "$EMPLOYEE" ]; then
  case "$EMPLOYEE" in
    tiejiang|menshen|duidiyuan|modou|baixiaosheng) ;;
    *) printf 'invalid --employee: %s (use tiejiang/menshen/duidiyuan/modou/baixiaosheng)\n' "$EMPLOYEE" >&2; exit 2 ;;
  esac
fi

# ---------- Employee × Skills matrix ----------
# Format: employee|priority|skill_name|cli_target
#   cli_target = which CLI tool loads this skill ("claude" = ~/.claude/skills/,
#                "cmd" / "agy" / "copilot" / "all").
#   Rows marked "MISSING" here are the ⚠️ MISSING entries from the brief —
#   they are EXPECTED to be missing (no .agents/skills/<name> dir).
#   Rows marked "ok" here have an .agents/skills/<name> dir AND a SKILL.md.

MATRIX='tiejiang|P0|core-swe|claude
tiejiang|P0|paperclip|claude
tiejiang|P0|paperclip-board|claude
tiejiang|P0|swe-delivery-flow|claude
tiejiang|P0|fork-sync|claude
tiejiang|P1|paperclip-dev-workspace-run-verify-fix|claude
tiejiang|P1|paperclip-create-plugin|claude
tiejiang|P1|bug-fix-flow|claude
tiejiang|P1|spec-driven-dev|claude
tiejiang|P1|system-design-spec|claude
tiejiang|P1|cmmi-req-spec|claude
tiejiang|P1|cmmi-tech-solution|claude
tiejiang|P1|cmmi-detailed-contracts|claude
tiejiang|P1|cmmi-wbs-milestone|claude
tiejiang|P1|frontend-design|claude
tiejiang|P1|doc-maintenance|claude
tiejiang|P1|check-pr|claude
tiejiang|P1|pr-gardening|claude
tiejiang|P1|prcheckloop|claude
tiejiang|P1|prepare-paperclip-pr|claude
tiejiang|P1|deploy-workspace-symlinks|claude
tiejiang|P1|mcp-builder|claude
tiejiang|P1|diagnose-why-work-stopped|claude
tiejiang|P1|ota-cache-busting|claude
tiejiang|P1|ota-launchasset-hash|claude
tiejiang|P1|ota-runtime-version-consistency|claude
tiejiang|P1|release-changelog|claude
tiejiang|P2|cmmi-immutable-release|claude
tiejiang|P2|create-agent-adapter|claude
tiejiang|P2|create-paperclip-bundled-skill|claude
tiejiang|P2|create-issue-interaction-ui|claude
tiejiang|P2|skill-creator|claude
tiejiang|P2|paperclip-page|claude
tiejiang|P2|pr-report|claude
tiejiang|P2|ops-task-orchestration|claude
tiejiang|P2|deal-with-security-advisory|claude
tiejiang|P2|garden-inbox|claude
tiejiang|P2|internal-comms|claude
tiejiang|P2|ota-caddy-fallback-trap|claude
tiejiang|P2|apk-installation-cache|claude
tiejiang|P2|release-flow|claude
tiejiang|P2|release|claude
tiejiang|P2|release-changelog-discord-message|claude
tiejiang|P2|release-version-sync|claude
tiejiang|P2|web-artifacts-builder|claude
tiejiang|P2|terminal-bench-loop|claude
tiejiang|P2|docx|claude
tiejiang|P2|pdf|claude
tiejiang|P2|pptx|claude
tiejiang|P2|xlsx|claude
tiejiang|P0|coding-style|claude
tiejiang|P0|testing-style|claude
tiejiang|P0|api-design|claude
tiejiang|P0|database-design|claude
tiejiang|P0|code-review|claude
tiejiang|P1|task-driven-development|claude
menshen|P0|fdse|all
menshen|P0|paperclip|all
menshen|P0|paperclip-board|all
menshen|P0|qa-humanlike-e2e|cmd
menshen|P0|comprehensive-testing-workflow|cmd
menshen|P0|ops-task-orchestration|cmd
menshen|P1|add-product-e2e-eval|cmd
menshen|P1|add-runner-eval|cmd
menshen|P1|paperclip-evals|cmd
menshen|P1|terminal-bench-loop|cmd
menshen|P1|check-pr|cmd
menshen|P1|prcheckloop|cmd
menshen|P1|pr-gardening|cmd
menshen|P1|pr-report|cmd
menshen|P1|prepare-paperclip-pr|cmd
menshen|P1|diagnose-why-work-stopped|cmd
menshen|P1|ota-cache-busting|cmd
menshen|P1|ota-launchasset-hash|cmd
menshen|P1|ota-runtime-version-consistency|cmd
menshen|P1|ota-caddy-fallback-trap|cmd
menshen|P2|deal-with-security-advisory|cmd
menshen|P2|frontend-design|cmd
menshen|P2|garden-inbox|cmd
menshen|P0|paperclip-task|all
menshen|P0|paperclip-frontend-app|all
menshen|P0|paperclip-deploy|all
menshen|P0|dispatch-wave|cmd
menshen|P0|monitor-wave|cmd
menshen|P0|FDE-skills|cmd
duidiyuan|P0|pre-sre|claude
duidiyuan|P0|paperclip|claude
duidiyuan|P0|paperclip-board|claude
duidiyuan|P0|sre-release-and-deploy|claude
duidiyuan|P0|deploy-workspace-symlinks|claude
duidiyuan|P0|release|claude
duidiyuan|P1|release-flow|claude
duidiyuan|P1|release-version-sync|claude
duidiyuan|P1|finance-budget-guard|claude
duidiyuan|P1|ops-task-orchestration|claude
duidiyuan|P1|apk-installation-cache|claude
duidiyuan|P1|deal-with-security-advisory|claude
duidiyuan|P2|mcp-builder|claude
duidiyuan|P2|release-changelog|claude
duidiyuan|P0|ota-cache-busting|claude
duidiyuan|P0|ota-launchasset-hash|claude
duidiyuan|P0|ota-runtime-version-consistency|claude
duidiyuan|P0|ota-caddy-fallback-trap|claude
duidiyuan|P0|paperclip-runbook|claude
duidiyuan|P0|paperclip-system-monitor|claude
duidiyuan|P0|paperclip-cost-optimize|claude
duidiyuan|P0|paperclip-incident-response|claude
duidiyuan|P0|paperclip-backup-restore|claude
modou|P0|fda|agy
modou|P0|paperclip|agy
modou|P0|paperclip-board|agy
modou|P0|solution-scouting-and-dar|agy
modou|P0|system-design-spec|agy
modou|P1|palantir-role-engineering|agy
modou|P1|cmmi-tech-solution|agy
modou|P1|cmmi-req-spec|agy
modou|P1|product-project-intake|agy
modou|P1|requirements-capture|agy
modou|P1|doc-maintenance|agy
modou|P2|model-catalog-check|agy
modou|P0|paperclip-dar|agy
modou|P0|paperclip-prototype|agy
modou|P0|paperclip-licensing-audit|agy
modou|P0|paperclip-design-pattern|agy
modou|P0|paperclip-data-viz|agy
modou|P0|agy-system-instructions|agy
baixiaosheng|P0|ds|claude
baixiaosheng|P0|paperclip|claude
baixiaosheng|P0|paperclip-board|claude
baixiaosheng|P0|paperclip-evals|claude
baixiaosheng|P0|comprehensive-testing-workflow|claude
baixiaosheng|P0|qa-humanlike-e2e|claude
baixiaosheng|P0|sre-release-and-deploy|claude
baixiaosheng|P0|finance-budget-guard|claude
baixiaosheng|P0|ops-task-orchestration|claude
baixiaosheng|P1|paperclip-page|claude
baixiaosheng|P1|add-product-e2e-eval|claude
baixiaosheng|P1|add-runner-eval|claude
baixiaosheng|P1|deploy-workspace-symlinks|claude
baixiaosheng|P1|release|claude
baixiaosheng|P1|release-flow|claude
baixiaosheng|P1|release-changelog|claude
baixiaosheng|P1|diagnose-why-work-stopped|claude
baixiaosheng|P1|deal-with-security-advisory|claude
baixiaosheng|P1|cmmi-tech-solution|claude
baixiaosheng|P1|cmmi-req-spec|claude
baixiaosheng|P1|cmmi-detailed-contracts|claude
baixiaosheng|P1|cmmi-immutable-release|claude
baixiaosheng|P1|cmmi-car-spc-metrics|claude
baixiaosheng|P1|cmmi-ver-val|claude
baixiaosheng|P1|ceo-company-ops|claude
baixiaosheng|P1|internal-comms|claude
baixiaosheng|P1|doc-maintenance|claude
baixiaosheng|P1|model-catalog-check|claude
baixiaosheng|P1|palantir-role-engineering|claude
baixiaosheng|P2|pr-gardening|claude
baixiaosheng|P2|pr-report|claude
baixiaosheng|P2|prcheckloop|claude
baixiaosheng|P2|check-pr|claude
baixiaosheng|P2|prepare-paperclip-pr|claude
baixiaosheng|P2|garden-inbox|claude
baixiaosheng|P0|paperclip-system-monitor|claude
baixiaosheng|P0|paperclip-incident-response|claude
baixiaosheng|P0|paperclip-cost-optimize|claude
baixiaosheng|P0|paperclip-data-analysis|claude
baixiaosheng|P0|paperclip-ml-eval|claude
baixiaosheng|P0|paperclip-test-strategy|claude
baixiaosheng|P0|paperclip-bug-hunt|claude
baixiaosheng|P0|paperclip-quality-metrics|claude'

# ---------- Validation functions ----------

# Map "employee key" -> "display label"
employee_label() {
  case "$1" in
    tiejiang) printf '铁匠 (Forge / core-swe)';;
    menshen) printf '门神 (Guardian / fdse)';;
    duidiyuan) printf '兑底渊 (Operator / pre-sre)';;
    modou) printf '墨斗 (Inkstick / fda)';;
    baixiaosheng) printf '百晓生 (Sage / ds)';;
    *) printf '%s' "$1";;
  esac
}

# Resolve ~/.claude/skills etc, honour HOME
cli_skill_root() {
  case "$1" in
    claude|cmd|agy|copilot|all)
      printf '%s' "$HOME/.claude/skills"
      ;;
    *) printf '%s' "$HOME/.claude/skills" ;;
  esac
}

# Resolve on-disk skill path (check both .agents/skills/ and legacy skills/)
# Prints the absolute path on stdout, returns 1 if neither has SKILL.md.
resolve_skill_target() {
  local skill="$1"
  local repo_root="$2"
  if [ -f "$repo_root/.agents/skills/$skill/SKILL.md" ]; then
    printf '%s' "$repo_root/.agents/skills/$skill"
    return 0
  fi
  if [ -f "$repo_root/skills/$skill/SKILL.md" ]; then
    printf '%s' "$repo_root/skills/$skill"
    return 0
  fi
  return 1
}

# Status of a skill: ok | missing | warn
# ok      = .agents/skills/<name>/SKILL.md OR skills/<name>/SKILL.md exists AND
#           local CLI symlink exists
# warn    = repo SKILL.md exists but local CLI symlink does not (run install script)
# missing = neither location has SKILL.md (⚠️ MISSING from EMPLOYEE-SKILLS.md §3)
check_skill_status() {
  local skill="$1"
  local cli="$2"
  local repo_root="$3"

  if resolve_skill_target "$skill" "$repo_root" >/dev/null 2>&1; then
    local home_dir
    home_dir="$(cli_skill_root "$cli")"
    local link_path="$home_dir/$skill"
    if [ -e "$link_path" ] || [ -L "$link_path" ]; then
      printf 'ok'
    else
      printf 'warn'
    fi
  else
    printf 'missing'
  fi
}

# ---------- Main ----------

P0_FAIL=0
P1_FAIL=0

if [ "$JSON" = "1" ]; then
  printf '{\n'
  first_emp=1
  for emp in tiejiang menshen duidiyuan modou baixiaosheng; do
    if [ -n "$EMPLOYEE" ] && [ "$EMPLOYEE" != "$emp" ]; then continue; fi
    if [ "$first_emp" = "0" ]; then printf ',\n'; fi
    first_emp=0
    printf '  "%s": {\n' "$emp"
    printf '    "label": "%s",\n' "$(employee_label "$emp")"
    printf '    "skills": [\n'
    first_skill=1
    while IFS='|' read -r row_emp row_p row_skill row_cli; do
      [ "$row_emp" = "$emp" ] || continue
      status="$(check_skill_status "$row_skill" "$row_cli" "$REPO_ROOT")"
      if [ "$first_skill" = "0" ]; then printf ',\n'; fi
      first_skill=0
      printf '      {"skill": "%s", "priority": "%s", "cli": "%s", "status": "%s"}' \
        "$row_skill" "$row_p" "$row_cli" "$status"
    done <<EOF
$MATRIX
EOF
    printf '\n    ]\n  }'
  done
  printf '\n}\n'
  exit 0
fi

# Human-readable table mode
if [ "$MISSING_ONLY" = "0" ]; then
  printf 'employee           | P0 ok / total | P1 ok / total | P2 ok / total | MISSING (P0)\n'
  printf '%s\n' '-------------------+---------------+---------------+---------------+-----------------'
fi

any_p0_missing=0
any_p1_missing=0

for emp in tiejiang menshen duidiyuan modou baixiaosheng; do
  if [ -n "$EMPLOYEE" ] && [ "$EMPLOYEE" != "$emp" ]; then continue; fi

  p0_total=0; p0_ok=0; p0_missing_list=""
  p1_total=0; p1_ok=0; p1_missing_list=""
  p2_total=0; p2_ok=0

  while IFS='|' read -r row_emp row_p row_skill row_cli; do
    [ "$row_emp" = "$emp" ] || continue
    status="$(check_skill_status "$row_skill" "$row_cli" "$REPO_ROOT")"
    case "$row_p" in
      P0)
        p0_total=$((p0_total + 1))
        if [ "$status" = "ok" ]; then p0_ok=$((p0_ok + 1));
        else
          p0_missing_list="$p0_missing_list $row_skill($status)"
          any_p0_missing=1
        fi
        ;;
      P1)
        p1_total=$((p1_total + 1))
        if [ "$status" = "ok" ]; then p1_ok=$((p1_ok + 1));
        else
          p1_missing_list="$p1_missing_list $row_skill($status)"
          any_p1_missing=1
        fi
        ;;
      P2)
        p2_total=$((p2_total + 1))
        if [ "$status" = "ok" ]; then p2_ok=$((p2_ok + 1)); fi
        ;;
    esac

    if [ "$MISSING_ONLY" = "1" ] && [ "$status" != "ok" ]; then
      printf '%-18s | %-2s | %s [%s] %s\n' "$emp" "$row_p" "$row_skill" "$row_cli" "$status"
    fi
  done <<EOF
$MATRIX
EOF

  if [ "$MISSING_ONLY" = "0" ]; then
    label="$(employee_label "$emp")"
    printf '%-18s | %3d / %3d     | %3d / %3d     | %3d / %3d     | %s\n' \
      "$label" "$p0_ok" "$p0_total" "$p1_ok" "$p1_total" "$p2_ok" "$p2_total" "${p0_missing_list:-—}"
  fi
done

echo ""
echo "Summary:"
echo "  P0 MISSING (any employee): $any_p0_missing"
echo "  P1 MISSING (any employee): $any_p1_missing"

if [ "$any_p0_missing" = "1" ]; then
  exit 1
fi
if [ "$STRICT" = "1" ] && [ "$any_p1_missing" = "1" ]; then
  exit 1
fi
exit 0