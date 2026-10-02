# AGENTS.md

Guidance for human and AI contributors working in this repository.

## 1. Purpose

Paperclip is a control plane for AI-agent companies.
The current implementation target is V1 and is defined in `doc/SPEC-implementation.md`.

## 2. Read This First

Before making changes, read in this order:

1. `doc/GOAL.md`
2. `doc/PRODUCT.md`
3. `doc/SPEC-implementation.md`
4. `doc/DEVELOPING.md`
5. `doc/DATABASE.md`

`doc/SPEC.md` is long-horizon product context.
`doc/SPEC-implementation.md` is the concrete V1 build contract.

When adding or changing an Apps catalog connection, also follow
`doc/connections/CONNECTOR-PLAYBOOK.md`. It is the canonical connection
authoring runbook for provider research, supported transport/auth patterns,
credential handling, branding, implementation, testing, live proof, and PR
submission.

## 3. Repo Map

- `server/`: Express REST API and orchestration services
- `ui/`: React + Vite board UI
- `packages/db/`: Drizzle schema, migrations, DB clients
- `packages/shared/`: shared types, constants, validators, API path constants
- `packages/adapters/`: agent adapter implementations (Claude, Codex, Cursor, etc.)
- `packages/adapter-utils/`: shared adapter utilities
- `packages/plugins/`: plugin system packages
- `packages/skills-catalog/`: app-shipped skills catalog (`@paperclipai/skills-catalog`)
- `packages/teams-catalog/`: app-shipped teams catalog (`@paperclipai/teams-catalog`)
- `cli/`: `paperclipai` CLI package (published bin, agent-facing commands)
- `skills/`: Paperclip runtime/operational skills (not part of the app catalog)
- `doc/`: operational and product docs

## 4. Dev Setup (Auto DB)

Use embedded PGlite in dev by leaving `DATABASE_URL` unset.

```sh
pnpm install
pnpm dev
```

This starts:

- API: `http://localhost:3100`
- UI: `http://localhost:3100` (served by API server in dev middleware mode)

Quick checks:

```sh
curl http://localhost:3100/api/health
curl http://localhost:3100/api/companies
```

Reset local dev DB:

```sh
rm -rf data/pglite
pnpm dev
```

## 5. Core Engineering Rules

1. Keep changes company-scoped.
Every domain entity should be scoped to a company and company boundaries must be enforced in routes/services.

Explicit exception: announcement dismissals are instance-wide user preferences,
keyed by user and announcement so they persist across companies. Their audit
context must still validate company membership. The announcement publication-ID
registry is instance-level feed metadata; it contains no company or user data.

2. Keep contracts synchronized.
If you change schema/API behavior, update all impacted layers:
- `packages/db` schema and exports
- `packages/shared` types/constants/validators
- `server` routes/services
- `ui` API clients and pages

3. Preserve control-plane invariants.
- Single-assignee task model
- Atomic issue checkout semantics
- Approval gates for governed actions
- Budget hard-stop auto-pause behavior
- Activity logging for mutating actions

4. Do not replace strategic docs wholesale unless asked.
Prefer additive updates. Keep `doc/SPEC.md` and `doc/SPEC-implementation.md` aligned.

5. Keep repo plan docs dated and centralized.
When you are creating a plan file in the repository itself, new plan documents belong in `doc/plans/` and should use `YYYY-MM-DD-slug.md` filenames. This does not replace Paperclip issue planning: if a Paperclip issue asks for a plan, update the issue `plan` document per the `paperclip` skill instead of creating a repo markdown file.

6. Attach inspectable generated artifacts.
When your task produces a user-inspectable deliverable file, follow the Paperclip skill's "Generated Artifacts and Work Products" workflow before final disposition. In this repo, prefer the self-contained skill helper at `skills/paperclip/scripts/paperclip-upload-artifact.sh` so the file is available through the Paperclip API, create/update an artifact work product when the file is the deliverable, link the uploaded artifact in the final issue comment, and then set status. Do not rely on local filesystem paths as the only access path. If an important file intentionally remains workspace-only, create/update a work product with `metadata.resourceRef.kind: "workspace_file"` and a workspace-relative path, then name that work product and path in the final comment. Treat browse/search as a fallback for recovering workspace files, not the preferred deliverable path. See `doc/AGENT-ARTIFACTS.md` for details and `.mp4`/`.webm` examples.

7. Name the three data paths correctly.
This repo has three separate data paths. Do not confuse them. Match a change to a path by its file path, not by the word "observability" or "telemetry" alone.

- **Telemetry** is the Paperclip first-party event system. It is opt-out and it sends data to a Paperclip endpoint by default. Its paths are:
  - `packages/shared/src/telemetry/`
  - the generated contract `packages/shared/src/telemetry/generated/paperclip-telemetry.ts`
  - each caller of `packages/shared/src/telemetry/events.ts` or `packages/shared/src/telemetry/client.ts`
- **Observability** is the OpenTelemetry trace path. An operator must set an OTLP endpoint. Until an operator sets the endpoint, the tracer is a no-operation. Its paths are:
  - `server/src/instrumentation.ts`
  - `doc/observability.md`
  - `packages/adapter-utils/src/duplex-observability.ts`
  - `server/src/services/duplex-observability-recorder.ts`
  - the span attributes in `packages/adapter-utils/src/acpx-engine/startup-timing.ts`
- **The run log** holds rows in the local `heartbeat_run_events` table. The data stays in the instance database. Its paths are:
  - `doc/run-log-events.md`
  - `packages/db/src/schema/heartbeat_run_events.ts`
  - the append path `appendRunEvent` in `server/src/services/heartbeat.ts`

Apply a review level that matches the path:

- **Telemetry change (strict review).** The author updates the generated contract first. The author updates `packages/shared/src/telemetry/README.md` in the same pull request. The author requests a privacy review. Reason: a Telemetry event goes to a Paperclip endpoint by default, so a mistake sends data immediately.
- **Observability change (lighter review).** The operator endpoint gate stays in place. The no-operation behaviour stays when no endpoint is set. A privacy review is not necessary while the change stays inside the closed span-attribute allowlist.
- **Run-log change (no extra review).** A run-log change needs neither review level above, because the data stays in the instance database.

**Exclusion.** The word "observability" in a file such as `server/src/services/recovery-observability.ts` names a different concept. Apply this rule by path, not by word match.

## 6. Database Change Workflow

When changing data model:

1. Edit `packages/db/src/schema/*.ts`
2. Ensure new tables are exported from `packages/db/src/schema/index.ts`
3. Generate migration:

```sh
pnpm db:generate
```

4. Validate compile:

```sh
pnpm -r typecheck
```

Notes:
- `packages/db/drizzle.config.ts` reads compiled schema from `dist/schema/*.js`
- `pnpm db:generate` compiles `packages/db` first

## 7. Verification Before Hand-off

Default local/agent test path:

```sh
pnpm test
```

This is the cheap default and only runs the Vitest suite. Browser suites stay opt-in:

```sh
pnpm test:e2e
pnpm test:release-smoke
```

Run the browser suites only when your change touches them or when you are explicitly verifying CI/release flows.

For normal issue work, run the smallest relevant verification first. Do not default to repo-wide typecheck/build/test on every heartbeat when a narrower check is enough to prove the change.

Run this full check before claiming repo work done in a PR-ready hand-off, or when the change scope is broad enough that targeted checks are not sufficient:

```sh
pnpm -r typecheck
pnpm test:run
pnpm build
```

If anything cannot be run, explicitly report what was not run and why.

## 8. API and Auth Expectations

- Base path: `/api`
- Board access is treated as full-control operator context
- Agent access uses bearer API keys (`agent_api_keys`), hashed at rest
- Agent keys must not access other companies

When adding endpoints:

- apply company access checks
- enforce actor permissions (board vs agent)
- write activity log entries for mutations
- return consistent HTTP errors (`400/401/403/404/409/422/500`)

## 9. UI Expectations

- Keep routes and nav aligned with available API surface
- Use company selection context for company-scoped pages
- Surface failures clearly; do not silently ignore API errors
- Form and wizard footers: keep Save & exit (or Cancel/Back) left and the primary action right in the same vertically aligned row. Each step owns the entire footer; never append Save & exit as a separate row. See `DESIGN.md`.

## 10. Pull Request Requirements

When creating a pull request (via `gh pr create` or any other method), you **must** read and fill in every section of [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md). Do not craft ad-hoc PR bodies — use the template as the structure for your PR description. Required sections:

- **Thinking Path** — trace reasoning from project context to this change (see `CONTRIBUTING.md` for examples)
- **What Changed** — bullet list of concrete changes
- **Verification** — how a reviewer can confirm it works
- **Risks** — what could go wrong
- **Model Used** — the AI model that produced or assisted with the change (provider, exact model ID, context window, capabilities). Write "None — human-authored" if no AI was used.
- **Checklist** — all items checked

## 11. Definition of Done

A change is done when all are true:

1. Behavior matches `doc/SPEC-implementation.md`
2. Typecheck, tests, and build pass
3. Contracts are synced across db/shared/server/ui
4. Docs updated when behavior or commands change
5. PR description follows the [PR template](.github/PULL_REQUEST_TEMPLATE.md) with all sections filled in (including Model Used)

## 12. PM commit + 发版 tag 规范 (wave265)

老板原话: 「代码要完成任务就提交, 每次发版版本号同时推一个 git tag」「版本号码要一致」.

1. **每次发版必打 tag** — `bash scripts/release-app.sh <version> "<notes>"`
   自 `[12/12]` 起自动 `git tag -a v<version> -m "v<version> release"
   <release-commit>` + `git push origin v<version>`. 失败仅警告不阻断
   (APK / OTA 已发, 回滚代价 >> 补打 tag). 补打方式:
   `git tag -a v<version> -m "..." <release-commit> && git push origin v<version>`.

2. **tag 指向「发版完成」的 commit** — 即 `release: v<version> — ...`
   这一笔 (含 version.json bump + CHANGELOG + 其它发版产物), 不是后续
   docs commit. 例: v0.6.19 → `37e6b3d77` (wave258 feat), 不是 `92796a123`
   (docs(wave262)).

3. **不发版不 bump 版本号** — 例: wave152 / wave245 / wave261 中只有 wave261
   顺手 bump 了 0.6.14 → 0.6.19 (老板没发现). 重构 PR 不动 `app.json.version`.

4. **7 处版本号源必须一致** — 见 `docs-coolie/VERSION-CONSISTENCY.md`:
   - `clients/expo/app.json` (expo.version + expo.android.versionCode)
   - `clients/expo/package.json` (version)
   - `clients/expo/android/app/build.gradle` (versionName + versionCode)
   - `clients/expo/CHANGELOG.md` (顶部 `## v...`)
   - 远端 `https://xrobinai.cn/version.json` (version + versionCode)
   - 远端 `https://xrobinai.cn/ota/manifest` (runtimeVersion)
   - git tag (v<version>)
   `bash scripts/VERSION-CONSISTENCY-CHECK.sh` 一键校验, 退出码 0 = 通过.

## This fork's own conventions

This repository is a fork of Paperclip. The rules above are upstream's; these are ours.
They are **pointers, not copies** — open the file when it matters, so nothing here has to
be kept in sync twice.

- `docs-coolie/BRANCHING.md` — which branch is ours (`main`), what `master` is for
  (syncing upstream), push discipline, and how to resolve merge conflicts.
- `docs-coolie/TERMINOLOGY.md` — the names we use. In particular: the platform's only
  isolation unit is a **company**; "tenant" is not a concept here, and the ontology's
  own `ontology_tenants` is an inert leftover of the cancelled standalone deployment.
- `docs-coolie/FORK-SURFACE-AUDIT.md` — how far this fork actually diverges from
  upstream, and which resolution each part needs.
- `doc/plans/*.md` — dated plan and design records.
- `docs-coolie/specs/*.md` — Kiro-style specs (requirements + EARS acceptance
  criteria, with the technical section appended). Read one before building its feature.
- `.agents/skills/` — our skill library (`fork-sync` is the upstream-sync playbook).
- `docs-coolie/EMPLOYEE-OBJECTS.md` — source of truth for the local Coolie-building
  team, its employee objects, tools, skills, and operating constraints.
- `docs-coolie/PM-DISPATCH-QUICKCARD.md` — source of truth for Hermes PM dispatch:
  who to send work to, the seven-part brief shape, pacing, and acceptance discipline.
- `docs-coolie/TOOLS.md` — source of truth for the seven local tool pool, package
  availability, and recommended tool strengths for each kind of work.
- `.agents/agents/` — versioned templates for local employee Claude Code sub-agents.
  Install them to `~/.claude/agents/` with `scripts/register-employees-cron.sh`.

Before changing a file upstream also owns, read the fork-surface audit: every
intentional change to one needs an entry with a reason in `scripts/fork-surface.json`,
because the gate it feeds only checks the files listed there.

## Coolie local team vs product runtime team

Do not confuse these two layers:

1. **Local Coolie-building team.** Hermes plus the local employees (墨斗, 铁匠,
   铁匠贰号, 门神, 兑底渊, 百晓生) are the construction team for building this
   Coolie product/fork. They run on the boss's local machine and related local
   toolchains (`claude-*`, `agy-gemini3.8`, `cmd`, `copilot`, `Hermes`, and
   `kiro-cli`). Their receipts, dispatch helpers, cron jobs, and WeChat progress
   reports are development/operations workflow for this repository.
2. **Coolie product company/team system.** The product itself contains its own
   company, team, agent, task, budget, approval, and run-log management model.
   This is runtime product behavior implemented in `server/`, `packages/`,
   `ui/`, and the database schema. Do not hard-code the local construction
   team's names, CLI tools, quotas, or WeChat workflow into product runtime logic
   unless a feature explicitly models that distinction.

The two layers may share role concepts (FDA, Core SWE, PRE-SRE, FDSE, DS), but
they are not the same system. Local-team automation should stay in `docs-coolie/`,
`.agents/`, `scripts/`, and local machine configuration unless the task explicitly
asks to productize it.

Local tools are not hard-bound to employees. If a tool has package/quota and is
available, any local employee may use it when it is the best fit for the work.
The documented pairings are preferred defaults based on tool strengths, not
identity rules: for example, product prototyping and visual/architecture
exploration often go to 墨斗 with `agy-gemini3.8` because Gemini 3.8 is strong
for that work. Before dispatch, check the task type, tool health/quota, and the
employee's skill needs; then choose the best available tool.

Coolie's primary users are Chinese users. User-facing pages, skills, employee
descriptions, and PM/dispatch copy must align with the Chinese short names and
terminology in `docs-coolie/EMPLOYEE-OBJECTS.md` and `docs-coolie/TERMINOLOGY.md`.
Use English enum/role identifiers only where the implementation or API requires
them; otherwise keep the Chinese name visible and primary.

Hermes is the PM and also its own local tool. Do not map Hermes to `kiro-cli`.
`kiro-cli` is a separate seventh local tool and is boss-reserve unless a task
explicitly says otherwise.

## Design system

`DESIGN.md` at the repo root is the source of truth for UI design decisions. The token-only rule applies to all `ui/` changes: every color, spacing, radius, type, shadow, and motion value in `ui/src/components/**` and `ui/src/pages/**` comes from the token layer in `ui/src/index.css` — no hex, raw px, arbitrary Tailwind bracket values, or raw `font-size`/`fontSize` declarations in components, outside the documented allowlist in `ui/src/index.css`. Run `pnpm check:token-gates` (`scripts/check-token-gates.mjs`) before committing UI changes — it fails on any violation not covered by that allowlist.
