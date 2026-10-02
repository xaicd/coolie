# wave282 QA Report — local employee sub-agents + fixed schedule

Date: 2026-10-02

## Scope

Boss requirement:

- Create fixed local employee sub-agent definitions.
- Provide one stable way for Hermes to dispatch each local employee.
- Provide a repeatable registration path for fixed schedules.
- Keep the PM five-field progress report while showing sub-agent type.

## Files delivered

| Path | Purpose |
|---|---|
| `.agents/agents/hermes-pm.md` | Hermes PM sub-agent template |
| `.agents/agents/modou-fda.md` | 墨斗 / FDA sub-agent template |
| `.agents/agents/forge-core-swe.md` | 铁匠 / Core SWE sub-agent template |
| `.agents/agents/forge-ii-core-swe.md` | 铁匠贰号 / Core SWE fallback template |
| `.agents/agents/menshen-fdse.md` | 门神 / FDSE sub-agent template |
| `.agents/agents/duidiyuan-pre-sre.md` | 兑底渊 / PRE-SRE sub-agent template |
| `.agents/agents/baixiaosheng-ds.md` | 百晓生 / DS sub-agent template |
| `scripts/dispatch-local-employee.sh` | Stable dispatch prompt/record/optional execute entrypoint |
| `scripts/register-employees-cron.sh` | Idempotent install + cron registration helper |
| `scripts/cron-team-status.sh` | Adds wave282 mapping and shows `tool + subagent_type` in the existing tool field |

## Local install result

Installed templates into Claude Code's local agent directory:

```text
/Users/mac/.claude/agents/hermes-pm.md
/Users/mac/.claude/agents/modou-fda.md
/Users/mac/.claude/agents/forge-core-swe.md
/Users/mac/.claude/agents/forge-ii-core-swe.md
/Users/mac/.claude/agents/menshen-fdse.md
/Users/mac/.claude/agents/duidiyuan-pre-sre.md
/Users/mac/.claude/agents/baixiaosheng-ds.md
```

Cron was intentionally **not** registered during QA because it creates recurring local scheduled tasks. Register receipt-only cron explicitly with:

```sh
bash scripts/register-employees-cron.sh --register
```

Register unattended execution only when the boss explicitly wants scheduled auto-dispatch:

```sh
bash scripts/register-employees-cron.sh --register-execute
```

## Validation

| Command | Result |
|---|---|
| `bash -n scripts/dispatch-local-employee.sh scripts/register-employees-cron.sh scripts/cron-team-status.sh` | PASS |
| `bash scripts/register-employees-cron.sh --dry-run` | PASS — prints 7 agent installs and 6 fixed receipt-only cron lines |
| `bash scripts/dispatch-local-employee.sh --agent forge-core-swe --task wave282-self-check --print` | PASS — prints Hermes Agent prompt with `subagent_type="forge-core-swe"` |
| `bash scripts/cron-team-status.sh --print` | PASS — status table renders tool plus sub-agent type |
| `bash scripts/register-employees-cron.sh --install-agents` | PASS — installed 7 files under `/Users/mac/.claude/agents/` |

## Notes

- `scripts/register-employees-cron.sh` defaults to `--dry-run`; home/crontab writes require explicit flags.
- Existing local agent files are backed up before replacement as `*.bak-wave282-<timestamp>`.
- `scripts/dispatch-local-employee.sh` records dispatch requests by default and only calls Claude when `--execute` is passed; registered cron defaults to receipt-only mode, with `--register-execute` reserved for explicit unattended execution.
- Hermes remains its own PM tool. The implementation does not map Hermes to kiro-cli.
