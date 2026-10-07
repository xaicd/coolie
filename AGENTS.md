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

## 12. 平台核心公理体系与最高工程法典 (Coolie Engineering Axioms)

### 公理一：活体本体即中枢 (Living Ontology as Nervous System)
1. **唯一核心北极星目标**：以「活体业务本体」为唯一控制与决策中枢，消灭“本体孤岛空转、工坊离散聊天、看板盲目派单”的两张皮割裂。
2. **业务双核**：Object Types（现实世界活体孪生/态势感知）+ Action Types（合法业务动词/闭环灵魂）。
3. **三大物理并轨契约**：
   - **项目进厂即本体域 (Project as Domain)**：创建 Project 原子初始化 Domain，杜绝无本体的孤立项目；
   - **工坊会话即本体演进 (Conversation as Proposal)**：Hermes 将诉求转译为结构化 Proposal 卡片，两字确认即落盘；
   - **任务施工挂契约血缘 (Task as Action Execution & Provenance)**：WBS 任务强绑 ActionType，Commit/真机快照即不可变 Evidence。
4. **全盘资产 263 表硬约束**：严禁因碎片功能随意扩表或增加复杂菜单，100% 榨干现有管网与 263 张物理表。
5. **六大数字员工本体靶心**：FDA 架构建模、Core SWE 契约编码、FDSE 真机四态快照、DS 因果闭环验收、PRE-SRE 影响面发布。

### 公理二：极简主义与人机工程学 (Minimalist Ergonomics)
1. **移动端去拓扑化**：6 寸手机屏坚决不画全景网状图，只提供以业务对象为中心的“局部一跳因果卡片流 (Local 1-Hop Chain)”。
2. **两字按钮铁律**：核心操作按钮收敛为纯 2 汉字（【创建】、【查看】、【沙箱】、【确认】、【放弃】、【发布】），严禁口语化长文案。
3. **5 槽位绝对对称底栏**：严格保持 `[汇览] [任务] [+] [工坊] [资产]` 黄金对称，零重复入口，收件箱统一由顶栏 🔔 统领。
4. **Agent-Native 契约**：Web 元素必带 `data-agent-target`，移动端必带 `testID=[Screen]__[Component]__[Action]`，弹窗独占加 `accessibilityViewIsModal`/`inert`，输入组件包裹防键盘遮挡。
5. **大胆做减法**：现有能力是错的直接真全删（由老板审批即可），杜绝打补丁式功能膨胀。

### 公理三：不可变证据与硬门禁管局 (Immutable Evidence & G1-G5)
1. **编译器与自动化守卫硬拦截**：制度严禁口头化，交付前必须 100% 通过 `bash scripts/check-governance-audit.sh`。
2. **CMMI 六阶段门禁物理落盘**：G0 需求、G1 架构、G2 详细设计、G3 构建、G4 验收证据、G5 投产基线严格归档对应目录。
3. **发版 7 处版本一致性**：每次发版必打 tag 并指向发版 commit，7 处版本号源（app.json, package.json, build.gradle, CHANGELOG, version.json, manifest, git tag）必须一致（`bash scripts/VERSION-CONSISTENCY-CHECK.sh`）。

## 13. 扁平化 Worker 拓扑与免交互调度法则 (Operating Disciplines)
1. **Hermes 唯一总指挥**：Hermes 是唯一 PM 总调度，6 大数字员工是一级下属，底层 CLI (`claude`, `cmd`, `agy`, `copilot`, `kiro-cli`) 仅作为工作引擎，严禁内部套娃配置 subagent。
2. **后台免交互最大自主授权**：`cmd` 必带 `--yolo --tools-all -t`，`claude` 必带 `--dangerously-skip-permissions`，管道执行必带 `< /dev/null` 重定向防 stdin 悬空死锁。
3. **异步控制面并轨与跨机一键复刻**：微信指令秒级入库 Dev Server 工单（COOA-XX），由后台 Runner Bridge 异步消费；跨机复刻统一执行 `bash scripts/bootstrap-coolie-dev-host.sh`。

## 18. Coolie 工坊唯一核心北极星目标与真业务本体物理并轨铁律
详见本法典「公理一：活体本体即中枢」及白皮书 `docs-coolie/research/2026-10-05-coolie-core-mission-and-real-ontology-master-plan.md`。

## 19. 全局高阶反向思维与老板意图升维响应铁律 (wave356)
老板原话: 「每次打开一个新IDE新会话，感觉都是从零开始，能否写个东西让 AI 对话时候，自动反向站在更高的角度去响应我的输入，比如我说修bug」

1. **四大合一最高审视视角**：
   - **新型软件交付公司负责人**：算交付人效比、客户零培训上手、拒绝系统空转两张皮；
   - **Palantir 体系**：业务双核驱动 (Object + Action)，消灭死报表与死图谱；
   - **OpenAI/Palantir FDE**：深入一线现场、真机模拟器四态验证、敢于彻底删除错误功能；
   - **顶级产品总监**：极简使用主义、两字操作铁律、5 槽位底栏、零重复入口。

2. **面对“修 bug / 加功能”的四步反向穿透协议**：
   - **Step 1 业务本体溯源**：查明破坏了哪个「业务实体 (Object)」或「动作契约 (Action)」？根因是不是业务规则与实体状态机错位？
   - **Step 2 极简减法原则**：能删代码修绝不加补丁，能收敛逻辑绝不外挂新配置，严禁由于修 bug 产生代码膨胀；
   - **Step 3 真实人机场景复原**：审视修法在移动端 6 寸屏上是否符合极简两字、防遮挡与单手盲操；
   - **Step 4 不可变交付证据闭环**：必须完成 0 编译报错，并固化真机端到端证据，杜绝历史 bug 在新会话中反复复活。
   - 详见规范文档 `.agents/rules/HIGH-ORDER-INVERSE-THINKING.md`。

## 20. Dev 与 Prod 环境职责红线与项目绝对物理隔离铁律
老板原话: 「生产环境 就不要 有 coolie项目了，dev 专门 建设 coolie工坊的」

1. **Dev 环境定位（工坊自身建设面）**：
   - 专属于「Coolie 本地施工总社」（`localhost:3100` / 内嵌 PGlite）；
   - 专属负责 Coolie 平台本体迭代、数字员工能力自举、COOA-XX 工单消费与代码构建；
   - 承载 `coolie工坊` 自身造物项目。

2. **Prod 环境定位（真实业务交付面）**：
   - 专属于企业客户与外部商业项目（`tc-coolie-claw` / `https://xrobinai.cn`）；
   - 仅承载真实客户商业交付项目（如产融智能体平台等）；
   - **绝对物理禁令**：生产环境严禁创建、存在或同步 `coolie工坊` 自身开发项目，严禁将 Dev 施工工单与本地测试数据泄露至生产环境，确保客户与高管交付大盘 100% 纯粹真实！

## 21. 移动端无感就地导航与调用栈完整性铁律 (wave363)
老板原话: 「我看很多 按钮都 乱跳功能页」

1. **实体检视就地覆盖，绝不横跳底栏 (Inspect In-Place)**：在收件箱、搜索、工坊、产物、计划等任何页面点击工单或业务实体，必须作为全局顶层抽屉就地浮层覆盖，严禁调用 `navigateTab("tasks")` 篡改底栏 Tab；
2. **父级上下文不可变与状态提升 (Immutable Context & Controlled Sub-Tabs)**：关闭实体详情必须精确退回原父级页面，保持搜索词、过滤项与滚动位置完好无损；复合屏（如资产页、收件箱）必须通过受控 `activeTab` 记忆状态，子模态（代码对比/沙箱）关闭后绝不跌落回默认 Tab；
3. **严格先进后出 LIFO 调用栈 (Strict LIFO Stack)**：返回处理器严格按渲染层级逆序出栈，根页面执行双击退出保护，代码中彻底消灭已删除的孤儿死路由（如 `navigateTab("artifacts")`）；
4. **大盘指标 100% 语义精确穿透 (Exact Semantic Deep-Link)**：大盘待审批必须直达收件箱审批 Tab 并支持返回，严禁“图省事”近似跳转到普通任务看板；
详见规范文档 `.agents/rules/MOBILE-NAVIGATION-STACK-INTEGRITY.md` 与技能 `.agents/skills/mobile-navigation-and-stack-audit/SKILL.md`，交付前必须 100% 通过 `bash scripts/check-governance-audit.sh` 第 12 项硬门禁。

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
- `docs-coolie/playbooks/coolie-dev-host-replication.md` — Coolie Dev 跨主机一键复刻与异步派单守护 SOP。
- `doc/plans/*.md` — dated plan and design records.
- `docs-coolie/specs/*.md` — Kiro-style specs (requirements + EARS acceptance
  criteria, with the technical section appended). Read one before building its feature.
  - `docs-coolie/specs/2026-10-02-local-dispatch-receipt.md` — 派单 Receipt 规范
  - `docs-coolie/specs/2026-10-02-tool-health-monitor.md` — 工具健康监控规范
  - `docs-coolie/specs/2026-10-02-g1-g5-evidence-ledger.md` — G1-G5 证据账本规范
  - `docs-coolie/specs/2026-10-03-multi-tool-context-bus.md` — 多工具上下文接力总线规范
- `.agents/skills/` — our skill library (`fork-sync` is the upstream-sync playbook).
- `docs-coolie/EMPLOYEE-OBJECTS.md` — source of truth for the local Coolie-building
  team, its employee objects, tools, skills, and operating constraints.
- `docs-coolie/PM-DISPATCH-QUICKCARD.md` — source of truth for Hermes PM dispatch:
  who to send work to, the seven-part brief shape, pacing, and acceptance discipline.
- `docs-coolie/TOOLS.md` — source of truth for the seven local tool pool, package
  availability, and recommended tool strengths for each kind of work.
- `.agents/agents/` — versioned templates for Coolie local employee role objects.
  Hermes is the sole PM orchestrator; digital employees are first-tier workers reporting
  to Hermes. Claude, cmd, agy, copilot, and kiro-cli are underlying worker tools.
  NEVER install subagents into `~/.claude/agents/` — Claude must run clean without nesting.

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
