#!/usr/bin/env bash
# scripts/install-employee-skills.sh [--dry-run | --apply]
#                                    [--cli claude|cmd|agy|copilot|all]
#                                    [--employee tiejiang|menshen|duidiyuan|modou|baixiaosheng|all]
#
# wave232 — Create per-CLI symlinks for every skill that an employee loads.
# The 5 employees × skills matrix is documented in
# docs-coolie/EMPLOYEE-SKILLS.md; this script reads the SAME table the
# check-employee-skills.sh script validates, and for each (employee, skill)
# row whose underlying `.agents/skills/<name>/SKILL.md` actually exists, it
# creates a symlink in:
#
#   ~/.claude/skills/<name>   -> <repo>/.agents/skills/<name>     (claude / claude-glm / claude-mm / claude-ds)
#   ~/.cmd/skills/<name>      -> <repo>/.agents/skills/<name>     (cmd / @commandcode/ai)
#   ~/.agy/skills/<name>      -> <repo>/.agents/skills/<name>     (agy / Gemini CLI)
#   ~/.copilot/skills/<name>  -> <repo>/.agents/skills/<name>     (copilot — placeholder,
#                                                                  no auto-load today)
#
# Skills listed in EMPLOYEE-SKILLS.md as ⚠️ MISSING (e.g. `coding-style`,
# `paperclip-runbook`) have NO `.agents/skills/<name>/SKILL.md` and are
# silently skipped — they belong to future waves (wave233..246) per
# EMPLOYEE-SKILLS.md §3.
#
# Idempotency:
#   - existing symlink with same target   -> "noop", skip
#   - existing symlink with DIFFERENT target -> "relink", replace
#   - existing non-symlink file/dir at path  -> "skip-warn" (refuse to clobber)
#   - missing target (no SKILL.md)        -> "skip-missing" (⚠️ from EMPLOYEE-SKILLS.md)
#
# Flags:
#   --dry-run                Print "would symlink: ..." / "noop" / "relink" lines,
#                            do not touch disk.
#   --apply                  Apply (default when run from a non-TTY context).
#   --cli <name>             Limit to one CLI: claude | cmd | agy | copilot | all
#                            (default: all).
#   --employee <name>        Limit to one employee: tiejiang | menshen |
#                            duidiyuan | modou | baixiaosheng | all (default: all).
#   --repo <path>            Override repo root (default: script's parent dir).
#
# Exit codes: 0 success / 2 usage error.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Re-use the same matrix as check-employee-skills.sh. We embed a copy here so
# this script stays self-contained — no source-from-other-file logic.
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
baixiaosheng|P2|garden-inbox|claude'

DRY_RUN=0
APPLY=0
CLI_FILTER=""
EMP_FILTER=""

usage() {
  cat <<'EOF'
usage: scripts/install-employee-skills.sh [--dry-run | --apply]
                                          [--cli <name>] [--employee <name>]
                                          [--repo <path>]

Create per-CLI symlinks for every employee-skill row in
docs-coolie/EMPLOYEE-SKILLS.md. Only links skills whose
`.agents/skills/<name>/SKILL.md` actually exists in the repo.

  --dry-run                Print planned symlinks without touching disk
  --apply                  Apply (default when not a TTY)
  --cli <name>             claude | cmd | agy | copilot | all (default: all)
  --employee <name>        tiejiang | menshen | duidiyuan | modou |
                           baixiaosheng | all (default: all)
  --repo <path>            override repo root

Exit codes: 0 success / 2 usage error.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --apply) APPLY=1; shift ;;
    --cli) CLI_FILTER="$2"; shift 2 ;;
    --employee) EMP_FILTER="$2"; shift 2 ;;
    --repo) REPO_ROOT="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'unknown arg: %s\n' "$1" >&2; usage; exit 2 ;;
  esac
done

# Default mode: --apply when not TTY (matches wave228 install scripts)
if [ "$DRY_RUN" = "0" ] && [ "$APPLY" = "0" ]; then
  if [ ! -t 0 ]; then APPLY=1; fi
fi

if [ -n "$EMP_FILTER" ]; then
  case "$EMP_FILTER" in
    tiejiang|menshen|duidiyuan|modou|baixiaosheng|all) ;;
    *) printf 'invalid --employee: %s\n' "$EMP_FILTER" >&2; exit 2 ;;
  esac
fi
if [ -n "$CLI_FILTER" ]; then
  case "$CLI_FILTER" in
    claude|cmd|agy|copilot|all) ;;
    *) printf 'invalid --cli: %s\n' "$CLI_FILTER" >&2; exit 2 ;;
  esac
fi

# Map CLI key -> home skills dir
cli_home_dir() {
  case "$1" in
    claude) printf '%s' "$HOME/.claude/skills" ;;
    cmd)    printf '%s' "$HOME/.cmd/skills" ;;
    agy)    printf '%s' "$HOME/.agy/skills" ;;
    copilot) printf '%s' "$HOME/.copilot/skills" ;;
    *) printf '%s' "$HOME/.claude/skills" ;;
  esac
}

# Resolve the on-disk skill location. Some skills live under `skills/`
# (the legacy repo path) rather than `.agents/skills/` (the wave228 forward
# path); we check both and prefer whichever has SKILL.md.
#   prints the absolute path on stdout, or empty if neither exists.
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

# Should we install for this CLI? "all" means install in every CLI.
should_install_for_cli() {
  local row_cli="$1"
  local filter="$2"
  if [ -z "$filter" ] || [ "$filter" = "all" ]; then return 0; fi
  if [ "$row_cli" = "$filter" ] || [ "$row_cli" = "all" ]; then return 0; fi
  return 1
}

# Counters
linked=0
noop=0
relinked=0
warn_clobber=0
skipped_missing=0

log() {
  printf '[wave232-skills] %s\n' "$*" >&2
}

while IFS='|' read -r row_emp row_p row_skill row_cli; do
  [ -z "$row_emp" ] && continue

  # Apply employee filter
  if [ -n "$EMP_FILTER" ] && [ "$EMP_FILTER" != "all" ] && [ "$EMP_FILTER" != "$row_emp" ]; then
    continue
  fi

  # Apply CLI filter
  if ! should_install_for_cli "$row_cli" "$CLI_FILTER"; then
    continue
  fi

  # Resolve CLI home
  if [ "$row_cli" = "all" ]; then
    # Row is for all 4 CLIs — install in each
    clis=(claude cmd agy copilot)
  else
    clis=("$row_cli")
  fi

  for cli in "${clis[@]}"; do
    home_dir="$(cli_home_dir "$cli")"
    link_path="$home_dir/$row_skill"

    # Resolve target path (.agents/skills/ OR legacy skills/)
    if ! target_path="$(resolve_skill_target "$row_skill" "$REPO_ROOT")"; then
      skipped_missing=$((skipped_missing + 1))
      log "skip-missing $row_emp $row_skill -> $link_path (no SKILL.md in .agents/skills/ or skills/)"
      continue
    fi

    # Create home dir if missing
    if [ ! -d "$home_dir" ]; then
      if [ "$DRY_RUN" = "1" ]; then
        log "would mkdir -p $home_dir"
      else
        mkdir -p "$home_dir"
      fi
    fi

    # Existing symlink?
    if [ -L "$link_path" ]; then
      existing_target="$(readlink "$link_path")"
      if [ "$existing_target" = "$target_path" ]; then
        noop=$((noop + 1))
        log "noop $row_emp $row_skill (already links $target_path)"
        continue
      fi
      if [ "$DRY_RUN" = "1" ]; then
        log "would relink $row_emp $row_skill: $existing_target -> $target_path"
      else
        rm "$link_path"
        ln -s "$target_path" "$link_path"
      fi
      relinked=$((relinked + 1))
      continue
    fi

    # Existing non-symlink file/dir? Don't clobber.
    if [ -e "$link_path" ]; then
      warn_clobber=$((warn_clobber + 1))
      log "skip-warn $row_emp $row_skill -> $link_path (exists, not a symlink; refusing to clobber)"
      continue
    fi

    # Create
    if [ "$DRY_RUN" = "1" ]; then
      log "would symlink $row_emp $row_skill -> $link_path"
    else
      ln -s "$target_path" "$link_path"
    fi
    linked=$((linked + 1))
  done
done <<EOF
$MATRIX
EOF

# Summary
echo ""
echo "Summary:"
echo "  linked (new symlinks):    $linked"
echo "  noop (already correct):   $noop"
echo "  relinked (target changed): $relinked"
echo "  skip-warn (clobber guard): $warn_clobber"
echo "  skip-missing (no SKILL.md in repo): $skipped_missing"
echo ""
echo "  dry-run: $DRY_RUN"
echo "  cli filter: ${CLI_FILTER:-all}"
echo "  employee filter: ${EMP_FILTER:-all}"

# Exit nonzero if anything weird happened but the script's main job succeeded.
if [ "$warn_clobber" -gt 0 ]; then
  exit 1
fi
exit 0