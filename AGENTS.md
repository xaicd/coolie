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

### 公理一：AI 原生商业软件交付工厂最高生态位与三层物理隔离铁律 (Foundry Ecosystem & Lifecycle Isolation)
1. **最高生态位与全自主交付模型**：
   Coolie 定位为全流程 AI 原生数字员工全自主驱动的**「端到端商业软件交付工厂 (AI-Native Software Delivery Foundry)」**。全体数字员工统一站在**软件交付公司总架构师与合伙人**的顶层商业视角，审视并执行全生命周期设计、编码、交付与验收。
2. **三大物理生命周期职责模型**：
   - **第一层：工厂指挥决策中枢 (Console & Mobile Cockpit)**：专属于掌柜、交付总监与前线 FDE。专注提供全盘态势感知、瓶颈风险预警、一句话意图派单与卡片式审批，维持高信噪比决策视图；
   - **第二层：软件制造工程流水线 (Delivery Foundry Pipeline)**：专属于数字员工（Hermes/墨斗/铁匠/门神/兜底渊）。专注从 0 到 1 建造并交付软件工程真资产（需求规格、架构设计、接口契约、源码仓库、全栈测试集、投产 SOP）；
   - **第三层：业务落地运行系统 (Delivered Application)**：专属于客户生产环境与终端业务（如云南移动企微、九夏智居系统）。生产期产生的所有业务运行数据（图纸、板材利用率、企微画像等）由业务系统自身完整承载与管理。
3. **商业交付终验核销闭环 (UAT Sign-off & Commercial Delivery Done)**：
   商业交付结项以甲方客户在真实生产环境中、依据《软件需求规格说明书 (SRS)》签署的《客户终验核销单 (UAT Acceptance Certificate)》为最终法律与商业闭环准绳，确立交付成果与商务回款的法定基准。

### 公理二：六位一体超级集成体架构与高阶审视视角 (Super-Foundry Architecture & Master Perspectives)
1. **超级集成体 (Integrated Super-Foundry) 六维合一架构**：
   - **控制面中枢 (Paperclip Backbone)**：统一依托单一人负责人原子签出锁、真实预算硬熔断机制、原生协同文档 (`documents`/`issue_documents`)、多版本工件总线 (`issue_work_products`) 与远端不可变证据交付 (`register_deliverable`/`attachments`)；
   - **认知与决策 (Palantir Living Ontology)**：依托现实世界数字孪生，以业务双核 (Object Types + Action Types) 贯通“项目进厂即本体域、会话即提议、任务挂因果血缘”；
   - **过程与质量 (CMMI 5 High Maturity Engineering)**：实施从 0 到 1 商业软件全生命周期质量保障（G1需求SRS → G2架构HLD → G3契约LLD → G4测试报告与快照 → G5投产SOP与回滚），交付成果必须挂载物理工程资产；
   - **底座与工程 (Open-Source Base Adaptiveness)**：自研全栈工程默认采用 PNPM Monorepo；开源基座 (RuoYi/Semantica/Django/Next.js) 100% 保持基座原生目录组织与构建生态，通过 Workspaces 挂载与 `resourceRef` 实现无侵入映射；
   - **人机与交互 (Minimalist Cockpit)**：掌柜与 FDE 极简驾驶舱采用 6 寸屏局部一跳因果卡片流，核心操作收敛为两字按钮，底栏保持黄金 5 槽位绝对对称，顶栏 🔔 统领消息与审批，实体检视就地浮层覆盖；
   - **调度与算力 (Flat Digital Employee Fleet)**：Hermes 统筹协调各数字员工，底层 7 大工具池后台配置免交互自主授权 (`--yolo`/`--dangerously-skip-permissions`)。
2. **五大合一顶层审视视角矩阵与全局高阶反向思维**：
   - 接收到新需求、架构演进或缺陷修复指令时，统一启动五大合一专业审视：
     - **新型软件交付公司负责人视角 (CEO / 商业交付总控)**：立足交付商业本质与投入产出比，以甲方现场真实使用、零培训上手与最终签署《客户终验单》核销回款为唯一法定成败标准；
     - **Paperclip 总产品架构师视角**：优先继承控制面主线能力与原生实体 (Documents/Work Products/Attachments)，确保单人签出锁、不可变证据总线与系统全局一致性；
     - **Palantir 活体本体架构师视角**：精准定位现实世界业务实体 (Object) 与动词契约 (Action)，保障业务规则与状态机严格吻合，消灭死报表与伪孪生；
     - **极简人机产品总监视角 (CPO / 竞品穿透与全面产品思路)**：深研商业标杆与全球顶级开源解决方案，深度竞品分析得出全面产品思路（借力成熟开源、规避重复造轮子、提炼杀手级特性），并在移动端 6 寸屏上以最凝练的代码达成两字按钮、黄金 5 槽位绝对对称、就地浮层防遮挡与单手可达；
     - **CMMI 5 质量与交付总监视角**：保障编译 0 报错，固化端到端四态真机快照凭证，落实从 0 到 1 全生命周期工程真资产 (No Artifact, No Done)，实现缺陷预防与持久抗退化。
   - **全生命周期变更风控管理 (Strict Change Management & Anti-Scope Creep)**：基线确立后的所有演进统一执行 CMMI 规范变更请求 (RFC / Change Request)，完成跨实体/接口影响面分析并经审批后纳入新基线。
   - 详见白皮书 `docs-coolie/research/2026-10-08-coolie-integrated-foundry-master-synthesis.md` 与 `.agents/rules/HIGH-ORDER-INVERSE-THINKING.md`。

### 公理三：活体业务本体即中枢与真业务物理并轨铁律 (Living Ontology as Nervous System)
1. **核心北极星目标**：以「活体业务本体」为全平台唯一控制与决策中枢，实现现实业务与技术实现的高保真物理并轨。
2. **业务双核基石**：以业务实体 (Object Types，现实世界活体孪生) 与业务动词 (Action Types，闭环业务行动) 为核心模型，以业务语义驱动技术管网。
3. **三大物理并轨标准**：
   - **项目即本体域 (Project as Domain)**：创建 Project 时原子初始化绑定专属 Domain，确保每个项目具备明确的本体资产边界；
   - **工坊会话即本体演进 (Conversation as Proposal)**：Hermes 自动将用户诉求转译为结构化 Proposal 卡片，经由两字确认即原子落盘生效；
   - **任务施工即动词血缘 (Task as Action Execution & Provenance)**：WBS 任务明确绑定 ActionType，代码 Commit 与真机测试快照作为不可变 Evidence 沉淀于履约账本。
4. **全盘资产 263 表高内聚复用**：深度复用全盘 263 张物理表管网与成熟模型，保持系统的高内聚、低熵演进与极简交互。
5. **六大数字员工本体靶心**：FDA 架构建模、Core SWE 契约编码、FDSE 真机四态快照、DS 因果闭环验收、PRE-SRE 影响面发布。
6. 详见白皮书 `docs-coolie/research/2026-10-05-coolie-core-mission-and-real-ontology-master-plan.md`。

### 公理四：CMMI 0-1 软件工程交付资产与 Spec-First 实体产物铁律 (CMMI 5 Engineering Assets)
1. **CMMI 交付物范畴标准**：CMMI 专注于管理商业软件从 0 到 1 建设交付全生命周期过程，交付成果聚焦于工程资产（需求规格 SRS、架构设计 HLD、OpenAPI 契约 LLD、源码 Repo、全栈测试集、部署/回滚 SOP、SLO/SLI 韧性保障、多租户运营 SOP、机器证据库、客户终验单），业务生产期数据由系统自身管理。
2. **Doc as Code 与 Spec-First CMMI**：全面吸收 Spec 驱动的极度凝练与代码直接映射，将 G1-G7 全生命周期规格与不可篡改机器证据库全面工程化、实体化与度量化。
3. **可验证结项准则 (Verifiable Completion Protocol)**：
   - 任务更新为 `done` 时，后端服务强制校验是否挂载了实质性工程资产（代码 PR、在线预览、真机快照、规格文档或机器证据）；
   - 完工状态由控制面工件总线提供的实质性资产凭证作为唯一认证依据 (No Artifact, No Done)。
4. **双轨交付映射模型**：控制面第一方真资产（`documents`/`issue_work_products`/`attachments`）与工作区本地代码文件（`metadata.resourceRef.kind: "workspace_file"`）协同归属。详见 `.agents/rules/CMMI-SPEC-FIRST-ARTIFACTS.md`。
5. **发版 7 处版本一致性**：发版打 tag 统一指向发版 commit，7 处版本号源（app.json, package.json, build.gradle, CHANGELOG, version.json, manifest, git tag）保持严格一致（`bash scripts/VERSION-CONSISTENCY-CHECK.sh`）。

### 公理五：项目目录结构规范与开源基座自适应物理归宿铁律 (Directory Structure & Monorepo)
1. **Paperclip 平台本体仓库目录标准 (Platform Repo Standard)**：
   - Coolie 平台本体仓库 100% 严格遵循 Paperclip 原生根目录结构（`server/`, `ui/`, `packages/`, `cli/`, `skills/`, `doc/`）；
   - **设计与规划集中收拢**：平台自身的所有长周期架构方案与演进规划，**100% 收拢在 `doc/plans/YYYY-MM-DD-slug.md`**（严格执行 upstream Rule 5）；工单执行中的 plan 优先更新工单绑定的原生 `plan` 文档（`issue_documents`）。
2. **商业交付项目工作区自适应规范 (Client Project Workspaces)**：
   - **自研默认架构 (Default Monorepo)**：自研及全栈商业项目默认采用 **PNPM workspace monorepo** 架构（根目录配置 `pnpm-workspace.yaml`，子包划分 `packages/`、`apps/` 或 `server/`、`ui/`、`clients/`）；
   - **开源基座自适应与极速骨架派生 (Zero-Git-History Hatching)**：若项目立项选择了**开源基座**（如 `ruoyi-all-next` 微服务中台底座、`yudao-cloud` 四位一体多端基座、`semantica`、Django、Spring Boot、Next.js 官方脚手架等），**100% 保持开源基座原生目录结构**；通过 `degit xaicd/ruoyi-all-next#main` 或 `bash scripts/hatch-client-project.sh <path> --profile quad-terminal` 极速派生，按需选用 `base` (~50MB 纯白板)、`minimal` (低代码+AI)、`standard` (全量 17 域) 与 `quad-terminal` (Java 微服务 + Vue3 管理端 + Uni-App 小程序 + Expo 原生 App) 规范阶梯，秒级完成工程初始化并建立独立 git 首提交。
3. **控制面第一公民与全生命周期工程文档物理归宿 (`docs/01_management` ~ `09_operations` & `docs/specs/`)**：
   - **控制面第一真理源 (Paperclip Control-Plane Primacy)**：软件交付的过程规格、测试凭证与结项资产，第一法定宿主统一为 Paperclip 控制面原生实体（`issue_documents`、`issue_work_products`、`attachments`），支持富文本在线批注、版本流转与审批门禁；
   - **彻底弃用 `.coolie/cmmi` 隐藏目录与单文件方案**：单文件 `01-srs.md` 无法支持多会话、多特性的增量敏捷迭代。全面对齐 `ruoyi-all-next`，工程级资产必须严格落盘于标准 CMMI 01~09 目录：
     - `docs/01_management/`：项目范围、立项章程、WBS 字典与风险台账 (RSKM)；
     - `docs/02_requirements/`：EARS 语法软件需求规格说明书 (SRS: software-requirements.md)、用户需求 (URS) 与双向需求跟踪矩阵 (RTM)；
     - `docs/03_design/`：概要架构设计 (HLD: architecture-design-hld.md)、DAR 选型矩阵、接口契约 (interface-contracts/) 与数据模型 (ERD)；
     - `docs/04_implementation/`：研发编码规范、防假 Mock 守卫与变异测试指南；
     - `docs/05_verification/`：四态真机测试验收报告 (test-summary-report.md) 与客户终验核销单 (UAT)；
     - `docs/06_cmmi_audit/`：CMMI 5 统计过程控制 (SPC: spc-control-chart.md) 与缺陷预防 (CAR: car-5whys-rca.md)；
     - `docs/07_release/`：不可变制品指纹、部署拓扑与生产秒级回滚 SOP (system-deployment-sop.md)；
     - `docs/08_sre/`：G6 SRE 稳定性保障、SLO/SLI 度量矩阵与 5-Whys 故障复盘；
     - `docs/09_operations/`：G7 商业化持续运营、多租户开通治理与日终平账台账；
     - `docs/specs/<domain>/<feature-slug>/`：敏捷特性的全息内聚包（brief.json, requirements.md, design.md, tasks.md, spec.json, runbook.json），由 Kiro SDD 引擎 (`npm run spec:ops`) 驱动；
     - `docs/artifacts/*.json`：机器证据库 (`security-scan-result.json`, `load-test-result.json`, `env-fingerprint.json`, `harness-trace-latest.json`)。
   - **双向血缘指针绑定准则 (Dual-Track Provenance)**：工作区本地文档统一通过 `POST /api/issues/:id/work-products` 登记为工件总线实体：
     `metadata: { resourceRef: { kind: "workspace_file", relativePath: "docs/02_requirements/software-requirements.md" } }`；
   - **结项门禁依据**：后端与门禁脚本以控制面 `work_products`、`documents`、`attachments` 为唯一校验依据（`No Artifact, No Done`）。
4. **CMMI 00~09 阶段化 Skills 装配与 OpenWiki (LLM-Wiki) 动态自愈知识大脑铁律 (OpenWiki First)**：
   - **CMMI 00~09 阶段化专属 Skills 装配**：全面吸纳 `ruoyi-all-next` 模式，在项目工程中为 00~09 全生命周期各阶段（00规范元编程、01管理立项、02需求工程、03架构设计、04编码实现、05变异测试打假、06质量门禁、07容器交付、08 SRE可靠性、09商业运营）配置精准绑定的专属 Skills，严禁跨阶段盲目乱调；
   - **OpenWiki (LLM-Wiki / RFC 8615) 知识大脑自愈同步**：每个交付项目统一建立 `wiki/` 目录与 `openwiki -> wiki` 软链接；由 `scripts/sync-openwiki.mjs` 从底层数据、元数据与契约自动化编译生成 `wiki/index.md`（AI 首屏检索大纲）、`wiki/stages/`（各截断交付规范与 Skills 路由）、`wiki/domains/`（领域维基词条）、`wiki/architecture/` 与 `wiki/gotchas/`；
   - **OpenWiki First 铁律**：数字员工进场接单必须优先阅读 `wiki/index.md`，基于机器可读契约与架构词条开展工作，Token 消耗直降 80%，杜绝全盘盲搜代码与文档漂移；
   - **CI 门禁守卫**：全仓与项目配置 `openwiki:sync` 与 `openwiki:check`，发现文档滞后或漂移立即阻断门禁。
5. **Kiro SDD 原生多智能体工作流引擎与配方铁律 (Kiro Native Workflows & Recipes)**：
   - **配方单一真源与软链接无缝桥接**：所有多智能体工作流配方统一物理收归 `.agents/workflows/*.workflow.json`（根目录通过 `.kiro/workflows` 软链接桥接），确保 Kiro IDE 原生识别与 Antigravity / 跨 Agent 平台统一标准；
   - **4 大内置 SDD 工作流配方**：
     - `feature-delivery.workflow.json`（全生命周期新特性交付：scaffold ➔ requirements ➔ design ➔ plan-waves ➔ implement ➔ verify）
     - `bugfix.workflow.json`（缺陷排查与红绿验证：scaffold ➔ diagnose ➔ red-test ➔ patch ➔ verify-gate）
     - `architecture-refactor.workflow.json`（架构债务消除：scaffold ➔ debt-analysis ➔ parity-tests ➔ refactor-execution ➔ regression-audit）
     - `security-patch.workflow.json`（安全加固与 PoC 拦截：scaffold ➔ threat-model ➔ poc-red-test ➔ hardening ➔ strix-audit）
   - **统一工作流 CLI 引擎 (`scripts/workflow-engine.cjs` / `scripts/workflow-engine.ts`)**：
     - `pnpm run workflow:list`：检视全量配方与参数；
     - `pnpm run workflow:check`：DAG 有向无环图深度扫描、语法合法性与 Agent 角色校验；
     - `pnpm run workflow:dry-run -- --recipe <recipe> --name <spec> --domain <domain> --title "<title>"`：模拟展开输出 Mermaid DAG 与角色执行指令；
     - `pnpm run workflow:run -- --recipe <recipe> --name <spec> --domain <domain> --title "<title>"`：驱动执行并落盘运行状态；
     - `pnpm run workflow:new`：脚手架快速生成新配方模板；
     - `pnpm run spec:workflows`：在 Spec-Ops 控制台全览配方。
   - **CMMI 01~09 全生命周期标准化作业（SOP）与 26 大资产矩阵**：
     - `pnpm run cmmi:asset new -- --phase <01~09> --type <type> [--project <代码>]`：脚手架标准化展开 26 类资产骨架；
     - `pnpm run cmmi:asset check`：校验全生命周期资产拓扑完整性与目录规范；
     - 坚守 `--real` 防假门禁与实事求是铁律。

### 公理六：极简主义人机工程与移动端无感就地导航铁律 (Minimalist Ergonomics & In-Place Navigation)
1. **移动端局部一跳卡片流**：6 寸手机屏专注提供以业务对象为中心的“局部一跳因果卡片流 (Local 1-Hop Chain)”，呈现清晰的业务关联。
2. **两字按钮标准**：核心操作按钮收敛为纯 2 汉字（【创建】、【查看】、【沙箱】、【确认】、【放弃】、【发布】、【审批】、【返回】）。
3. **5 槽位绝对对称底栏**：严格保持 `[汇览] [任务] [+] [工坊] [资产]` 黄金对称，消息与审批统一由顶栏 🔔 统领。
4. **实体检视就地浮层覆盖 (Inspect In-Place)**：在收件箱、搜索、工坊、产物、计划等任何页面点击工单或业务实体，统一作为全局顶层抽屉就地浮层展示，保持调用方上下文、筛选条件与滚动位置完整无损；
5. **受控状态记忆与平滑复原 (Controlled Sub-Tabs)**：复合屏（如资产页、收件箱）统一通过受控 `activeTab` 记忆状态，子模态（代码对比/沙箱）关闭后精准停留于当前视图；
6. **先进后出 LIFO 调用栈 (Strict LIFO Stack)**：返回处理器严格按渲染层级逆序出栈，根页面执行双击退出保护，路由分发严格与当前活动路由表保持一致；
7. **大盘指标语义精确穿透 (Exact Semantic Deep-Link)**：大盘待审批指标直达收件箱审批 Tab 并支持一键原路返回；
8. **Agent-Native 规范契约**：Web 元素统一配置 `data-agent-target`，移动端统一配置 `testID=[Screen]__[Component]__[Action]`，弹窗独占配置 `accessibilityViewIsModal`/`inert`，输入组件包裹防键盘遮挡。
9. **极简演进原则**：优先精简过剩逻辑，保持架构轻盈与高可用。详见 `.agents/rules/MOBILE-NAVIGATION-STACK-INTEGRITY.md`。

### 公理七：Dev 与 Prod 环境职责红线与项目绝对物理隔离铁律 (Dev vs Prod & Data Isolation)
1. **Dev 环境专属定位（工坊自身建设面）**：
   - 专属于「Coolie 本地施工总社」（`localhost:3100` / 内嵌 PGlite）；
   - 专属负责 Coolie 平台本体迭代、数字员工能力自举、COOA-XX 工单消费与代码构建；
   - 承载 `coolie工坊` 自身研发项目。
2. **Prod 环境专属定位（真实业务交付面）**：
   - 专属于企业客户与外部商业项目（`tc-coolie-claw` / `https://xrobinai.cn`）；
   - 仅承载真实客户商业交付项目（如产融智能体平台等）；
   - 确保交付大盘与生产指标呈现 100% 纯粹真实的高管交付视界。
3. **企业多租户数据严格隔离 (Company-Scoped Isolation & Least Privilege)**：全平台所有领域实体、本体域与工单 100% 强绑定 `company_id`，路由与服务层强校验组织边界，客户私域生产数据完全保持在专属企业域内。

### 公理八：扁平化 Worker 拓扑与 ACP 免交互调度法则 (Operating Disciplines & ACP)
1. **单一调度指挥拓扑**：Hermes 作为唯一 PM 总调度，6 大数字员工作为一级执行者，底层 CLI (`claude`, `cmd`, `agy`, `copilot`, `kiro-cli`) 作为工作引擎，保持执行链路扁平清晰。
2. **后台免交互自主授权**：`cmd` 统一配置 `--yolo --tools-all -t`，`claude` 统一配置 `--dangerously-skip-permissions`，管道执行配置 `< /dev/null` 重定向确保进程顺畅流转。
3. **标准 ACP (Agent Client Protocol) 调度协议栈**：全面通过标准 ACP 适配器统一管理会话、握手与流式消费。
4. **异步控制面并轨与跨机一键复刻**：微信指令秒级入库 Dev Server 工单（COOA-XX），由后台 Runner Bridge 异步消费；跨机复刻统一执行 `bash scripts/bootstrap-coolie-dev-host.sh`。

### 公理九：AI Agent 检索防污染与代码/文档分离铁律 (Grep Anti-Pollution Grid)
1. **智能检索分流防污染管网 (4 层分流体系)**：
   - **工具层智能屏蔽 (`.ignore` / `.rgignore`)**：根目录配置 `.ignore` 和 `.rgignore`，代码检索工具底层自动聚焦于工程代码目录，保持检索环境纯净；
   - **纯代码检索专用通道 (`scripts/toolkits/grep-code.sh`)**：检索函数、接口与数据模型时，运行 `bash scripts/toolkits/grep-code.sh <pattern> [subpath]` 或 `pnpm grep:code <pattern>`，限定在 `server/`, `packages/`, `ui/`, `clients/`, `cli/` 并自动过滤文档；
   - **纯文档规范检索专用通道 (`scripts/toolkits/grep-doc.sh`)**：检索方案、白皮书与工程规范时，运行 `bash scripts/toolkits/grep-doc.sh <pattern>` 或 `pnpm grep:doc <pattern>`，实现精准定位；
### 公理十：全能力 AI Agent 闭环驱动与实事求是 0 假 Demo 铁律 (All Capabilities AI Agent Driven & Zero Fake Demo)
1. **全能力 AI Agent 闭环驱动 (All Capabilities Autonomous Delivery)**：
   - 汲取 `ruoyi-all-next` 终极不变性准则（Invariant Rule 13），数字员工不再仅仅是“代码辅助生成器”，而是全能力商业软件全栈交付的闭环执行者；
   - 涵盖从：G0 立项章程与 WBS、G1 EARS 需求收敛与 RTM、G2 HLD 拓扑与 DAR 选型、G3 静态契约与编译 0 报错、G4 变异测试打假与四态真机快照、G5 生产不可变 Checksum 制品与秒级回滚 SOP、G6 SRE 真实压测与 SLO/SLI 矩阵，到 G7 商业化持续运营平账；
   - 统一由 AI Agent 调度 Spec-Kit 引擎（`npm run speckit`）以 Spec-First 闭环驱动，消灭一切脱离规格的野蛮硬编码。
2. **实事求是 0 假 Demo 铁律 (Zero Fake Demos & Real Evidence Baseline)**：
   - 生产未发生的运行期事件（未发生生产故障事故、未发生真实外部资金交易对账差异），一律在对应目录（`docs/08_sre/02_postmortem/`、`docs/09_operations/02_financial_reconciliation/`）保留 `.gitkeep` 干净留空；
   - 生产事件记录必须基于真实事件（真实 SQLite / PostgreSQL，使用真实 SQL 完成端到端断言，真实性是平台最高信用基石）。

### 公理十一：Sentinel 零信任看门狗自主安全防御铁律 (Sentinel Sovereign Guardrail & Taint-Aware Egress)
1. **看门狗三权分立仲裁模型 (Taint-Aware Sovereign Watchdog)**：
   - 吸收 Meta Muse / OpenMuse Sentinel 看门狗设计思想，建立控制面与工作区跨边界自主安全防御；
   - 对任何数字员工发起的工程变更、网络外联、敏感凭据读取、生产配置调整执行三权分立判定：
     - `ALLOW`：纯本地只读分析、单测运行与非敏感文件生成，静默快速放行；
     - `BLOCK`：检测到硬编码弱口令、未加密敏感凭据、越界破坏性删除等违规行为，立即刚性阻断并记录审计日志；
     - `ESCALATE`：针对生产部署、高危权限变更、重大架构 RFC、高额预算提额等高危动词，自动上提至掌柜/高管移动端顶栏 🔔 待办收件箱，以结构化卡片呈现因果血缘，由人类高管一键两字审批。
2. **污点感知与防数据外泄 (Taint-Aware Egress Prevention)**：
   - 全链路追踪凭据与敏感字段的流动；保障企业私域业务数据、高熵管理员凭据或内部密钥在安全沙箱内流通，杜绝非授信网络泄露；
   - 发现污点扩散立即熔断外联通道，保障交付工厂主权安全。

### 公理十二：正向建设性工程契约与反否定盲区铁律 (Prescriptive Engineering Contracts & Positive Agency)
1. **反否定盲区与契约规范 (Anti-Negation Blindness)**：
   - 全平台系统提示词、规则文件、任务简报与代码注释，停用情绪化“严禁/绝对禁止”，克服 Transformer 自注意力机制的“粉色大象效应（Negation Blindness）”与过度防御导致的行动瘫痪；
   - 全面转向 **IETF RFC 2119 规范**（`MUST` / `SHALL` / `REQUIRED`），用清晰正向契约明确权利与义务。
2. **正向建设性行动脚手架 (Prescriptive Action & Skeletons)**：
   - 凡提约束，必紧随正向推荐路径与标准代码参考骨架；
   - 明确告知数字员工“应该调用哪个函数、传入什么参数、生成何种结构”，以正向动作替代口号式负向禁令。
3. **编译器与静态门禁硬拦截 (Compiler-First & Machine Verification)**：
   - 所有工程红线全面下沉至 TypeScript 类型系统、AST 依赖扫描器与 CI 门禁（`check-governance-audit.mjs`）；
   - 出现偏差由编译器报错（Exit Code 1 + Error Stack）驱动 AI 精准自愈。详见 `.agents/rules/PRESCRIPTIVE-ENGINEERING-CONTRACTS.md`。

### 公理十三：Paperclip 控制面与 ruoyi-all-next 商业交付工程法典正交并轨铁律 (Orthogonal Integration & Conflict Defense Matrix)
1. **正交双引擎定位 (Orthogonal Dual Engines)**：
   - **Paperclip 控制面中枢 (Control-Plane OS)**：负责企业租户物理隔离 (`company_id`)、单一人原子签出排他锁 (`issue_checkout_runs`)、真实预算硬熔断、原生工件总线 (`issue_work_products`) 与 ACP 智能体调度协议；
   - **ruoyi-all-next 商业交付工程法典 (Foundry Delivery Standards)**：负责 CMMI 01~09 全生命周期工程真资产 (`docs/01_management` ~ `09_operations`)、OpenWiki 动态知识大脑 (RFC 8615)、EARS 5 态需求收敛、四态真机快照与变异测试打假 (SpaceX 航天级标准)、生产不可变 Checksum 制品与日终对账平账；
   - 二者在物理拓扑与业务逻辑上高度正交、各司其职、互不冲突、双向赋能。
2. **四层冲突防御仲裁矩阵 (Conflict Defense & Precedence)**：
   - **仓库与目录管辖**：平台根目录 100% 遵从 Paperclip 官方 6 大主目录与白名单守卫，严禁在平台根目录嵌套 `projects/`；客户交付项目作为独立平级 Git 仓库 (`../<slug>`) 落地；
   - **任务签出管辖**：任务派发与状态流转 100% 服从 Paperclip 单人原子签出锁与租约心跳，严禁绕过控制面机制并发多写代码；
   - **工件总线与结项守卫**：客户独立仓库落盘物理资产，通过 Paperclip 原生工件总线 API (`POST /api/issues/:id/work-products`) 以 `resourceRef.kind: "workspace_file"` 登记并挂载；后端执行 `No Artifact, No Done` 强校验；
   - **AI 检索与 Token 优化**：客户项目统一建立 OpenWiki (`wiki/index.md`)，数字员工进场先读索引，Token 消耗直降 80%，杜绝全盘盲搜代码与文档漂移。
   - 详见规则手册 `.agents/rules/RUOYI-PAPERCLIP-ORTHOGONAL-INTEGRATION.md`。

## 13. 平台分支规范与协同契约 (This Fork's Own Conventions)

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

## 14. 本地研发工队与产品运行边界 (Local Team vs Product Runtime)

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

## 15. 视觉与设计系统规范 (Design System)

`DESIGN.md` at the repo root is the source of truth for UI design decisions. The token-only rule applies to all `ui/` changes: every color, spacing, radius, type, shadow, and motion value in `ui/src/components/**` and `ui/src/pages/**` comes from the token layer in `ui/src/index.css` — no hex, raw px, arbitrary Tailwind bracket values, or raw `font-size`/`fontSize` declarations in components, outside the documented allowlist in `ui/src/index.css`. Run `pnpm check:token-gates` (`scripts/check-token-gates.mjs`) before committing UI changes — it fails on any violation not covered by that allowlist.

## 16. 容器环境与 Mac 宿主机协同公理 (Container vs Mac Host Environment Axiom)

1. **执行拓扑与工作区映射**：
   - 当前 Agent 运行在 Docker 容器（Ubuntu）中，工作区根路径为 `/host-workspace/...`；
   - `/host-workspace/*` 物理映射至 Mac 宿主机 `/Users/mac/workspace/*`；
   - 容器内负责源码读写、类型检查、代码分析与通用 Linux 构建命令。
2. **宿主机独占资源穿透**：
   - 凡涉及 Android 模拟器（`emulator-5554`）、`adb` 交互与真机截图、macOS 工具链（Homebrew、node@24、Xcode）、或直连生产服务器（`tc-coolie-claw` / `ubuntu@xrobinai.cn`）的操作，**必须统一穿透至 Mac 宿主机执行**；
   - 严禁在容器内尝试启动无头 Android 模拟器或找不到的 Mac 独占工具。
3. **全局穿透工具：`host-exec`**：
   - 工具已全局部署于 `/usr/local/bin/host-exec`、`/root/.local/bin/host-exec` 及 `/root/.gemini/antigravity-cli/bin/host-exec`（源码位于 `scripts/host-exec.sh`）；
   - 支持动态自动转换当前容器工作目录为 Mac 宿主机对应路径，内置环境变量注入与 SSH ControlMaster 会话复用；
   - 调用范式：
     ```bash
     host-exec "<command>"
     host-exec "adb devices"
     host-exec "adb exec-out screencap -p" > /path/to/screenshot.png
     host-exec "ssh tc-coolie-claw '<cmd>'"
     ```

