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

## 13. 多工具协同与跨环境上下文接力规范 (wave282-wave284)

1. **宿主机 (Host) 与容器沙箱工具池物理分布**
   - **宿主机环境 (`/opt/homebrew/bin`)**：Claude (`claude-glm`, `claude-mm`)、`cmd` (`@commandcode/ai`)、`copilot`、`kiro-cli` 真实部署在老板的 Mac 宿主机上，依赖 Homebrew 环境。
   - **容器沙箱环境**：`agy-gemini3.8` (Antigravity CLI + Gemini 3.8) 运行于 Docker 容器中。
   - 宿主机与容器沙箱挂载共享代码仓库（`/host-workspace/xaicd/coolie`），工具探测或执行脚本时**严禁把宿主机 CLI 误判为全局缺失**。

2. **多工具上下文接力总线 (Context Bus)**
   - 跨工具/跨工种接力（如 墨斗 FDA -> 铁匠 Core SWE -> 门神 FDSE -> 兑底渊 PRE-SRE -> 百晓生 DS）严禁口头传话与手动复制；
   - 统一由 `scripts/context-bus.sh` 在 `.coolie-local/context-bus/<wave>.json` 记录不可变流转轨迹；
   - 派单 `scripts/dispatch-local-employee.sh` 默认开启上下文继承，自动将上游最新 Commit、修改文件、交付 Spec 与交接嘱托注入给下游工具的 Prompt，实现零摩擦交接。

3. **派单 Receipt 规范与状态机**
   - 每次派单必在 `.coolie-local/dispatch/<id>.json` 生成结构化 Receipt；
   - 严格遵循状态机跃迁：`queued -> running -> done | blocked | failed`；
   - 任务完成后必须回写 commit hash、验证命令与交付物证据。

4. **CMMI G1-G5 角色证据隔离账本**
   - 每一波交付必须通过 `scripts/gate-evidence-ledger.sh` 在 `.coolie-local/evidence-ledger/<wave>.json` 落盘；
   - FDA (G1) / Core SWE (G2) / FDSE (G3) / DS (G4) / PRE-SRE (G5) 五角色各自提交独立证据，严禁跨角色借用。

## 14. Agent-Native UI 开发框架与交互规范 (wave296)

老板原话: 「所有 UI 组件必须强制具备 Agent-Native 属性：Web 交互元素必带 `data-agent-target='模块:动作'`、作用域 `data-agent-scope` 与状态 `data-agent-state`；移动端必带 `[Screen]__[Component]__[Action]` 命名空间的 `testID`；多层弹窗打开时底层容器必须打上 `inert`/`accessibilityViewIsModal` 实现节点剪枝隔离；页面顶层必须暴露 `data-agent-page-ready` 就绪信号，严禁纯依靠无文本 CSS/坐标让 Agent 盲猜。」

1. **Web 端 (agent-browser) 契约协议**：
   - **交互目标**：交互按钮、链接与输入框必须带 `data-agent-target="<module>:<action>"`（如 `governance:approve-btn`），严禁使用易碎 CSS class 或纯 XPath；
   - **作用域隔离**：复杂表单与弹窗内部必须带 `data-agent-scope="<scope-id>"`，杜绝多层级嵌套下的识别迷航；
   - **状态信号灯**：可点击控件提供 `data-agent-state="ready|loading|disabled|completed"`，页面根节点暴露 `data-agent-page-ready="true"`，防止异步竞态无脑狂点；
   - **遮挡剪枝**：二级/多级 Modal、Drawer 打开时，底层失焦容器必须挂载 `inert` 属性，强制将底层无关 DOM 树剪枝。

2. **移动原生端 (agent-device) 契约协议**：
   - **命名空间 testID**：所有可点击原生组件强制提供结构化 `testID`，格式统一为 `[Screen]__[Component]__[Action]`（如 `SpecEditor__RequirementTab__SubmitBtn`）；
   - **弹窗独占**：所有 Modal 必须显式声明 `accessibilityViewIsModal={true}`，杜绝穿透点击；
   - **键盘防遮挡**：表单组件必须包裹 `KeyboardAvoidingView` 与输入自动聚焦滚屏，防止按钮被虚拟键盘顶出物理盲区。

3. **合规度量与自动化检查**：
   - 运行 `bash scripts/check-agent-native-ui.sh` 实时检查 Web 与移动端组件的 Agent-Native 符合度；
   - CMMI G3 门禁前必须检查新增交互组件的属性合规。

## 15. Coolie Dev 本地工坊异步调度与一键跨机复刻规范 (wave297)

老板原话: 「微信派单绝不能在终端前台同步阻塞等，必须并轨控制面工单池；后台由 Runner Bridge 异步接单消费；死进程必须自动探活自愈，杜绝幽灵虚报；这套体系部署到别的主机必须一键复制，零卡点复刻。」

1. **异步控制面并轨铁律**：
   - **禁止前台阻塞**：严禁在 Hermes 会话或终端中同步阻塞执行长耗时代码（必受 180s 超时截杀）；
   - **控制面入库**：所有微信/IM 指令统一调用 `scripts/hermes-boss-intent-dispatcher.sh`，0.8 秒内建立 Dev Server 工单（COOA-XX）并返回回执；
   - **后台异步认领**：宿主机后台常驻守护 `scripts/coolie-task-runner-bridge.mjs`，每 5 秒轮询并认领工单执行，独立日志流落盘 `.coolie-local/logs/${task}.log`。

2. **活体探活与自愈铁律**：
   - 团队状态与监控脚本（`scripts/cron-team-status.sh`）强制执行 `kill -0 $PID` 存活检测；
   - 进程一旦异常退出，状态机必须自动修正为 `failed` 并落盘自愈，严禁向微信播报虚假运行时长。

3. **跨主机一键复刻 (One-Click Bootstrap)**：
   - 任何新主机（Mac / Linux / 云主机）克隆仓库后，运行 `bash scripts/bootstrap-coolie-dev-host.sh` 即可在 30 秒内全自动拉起 PGlite Dev Server (3100)、初始化「Coolie 本地施工总社」、注入 6 大数字员工并注册 crontab 看门狗保活。
   - 详见 `docs-coolie/playbooks/coolie-dev-host-replication.md`。

## 16. 极简两字交互、CMMI 资产与高管治理全面审计守卫规范 (wave298)

老板原话: 「按理说 那些 要求 都是 审计过程 要 全面 管局的」

1. **制度必须由编译器与自动化守卫硬拦截**：
   - 任何涉及移动端与 Web 交互改动，严禁停留在口头规范或 PR 人肉 Review；
   - 运行 `pnpm check:governance`（或 `bash scripts/check-governance-audit.sh`），必须 100% 全绿（Exit 0）才允许放行交付。

2. **四大硬性管局维度**：
   - **两字按钮铁律**：核心操作按钮严禁口语化长文案（如【创建任务】、【查看详情】、【原型沙箱】），必须收敛为【创建】、【查看】、【沙箱】等标准 2 汉字；
   - **移动端 5 槽位绝对对称底栏**：严格保持左2 + 中1 + 右2（汇览 · 任务 · [+] · 工坊 · 资产）对称布局，严禁底栏包含收件箱造成重复入口；
   - **高管审批三大快道直通**：顶栏 🔔 铃铛直达全功能 `InboxScreen`（含审批/阻塞Tab），工坊会话常驻悬浮审批横幅，大盘具备红灯指标直达；
   - **CMMI 六大阶段门禁产物物理落盘 (Phase-Gate Baselines)**：G0 需求、G1 架构、G2 详细设计、G3 构建、G4 验收证据、G5 投产基线必须严格落在对应规范目录，严禁产物游离。

3. **双轨映射调度原则**：
   - 物理项目工作区 (`project_workspaces.cwd`) 是代码与 WBS 任务树基底；工坊会话 (`board_conversations`) 是高管时序意图流；通过意图分发器转译并在物理目录中调度数字员工。

## 17. Hermes 唯一总指挥与扁平化 Worker 铁律 (wave302)

老板原话: 「Claude 经常停止，kill 这些问题 如何彻底解决，是不是 授权太小了，claude 自己就别 再配置agents ,subagent了， 按照本系统的 规范来的话，就是 claude,cmd,agy,copilot 这些都是 Hermes的 子agent 成员才对」

1. **扁平化拓扑与杜绝嵌套套娃**：
   - **Hermes 是唯一 PM 总调度**：负责意图澄清追问、WBS 任务派发与工序收口；
   - **一级子 Agent 成员**：6 大数字员工（墨斗 FDA、铁匠 Core SWE、门神 FDSE、兑底渊 PRE-SRE、百晓生 DS）是 Hermes 的下属子 Agent；
   - **底层工具引擎 (Worker Engines)**：`claude` (claude-glm / claude-mm)、`cmd`、`agy`、`copilot`、`kiro-cli` 仅作为数字员工执行任务的底层 CLI 工具；
   - **严禁 Claude 内部再配置 agents/subagent**：宿主机 `~/.claude/agents/` 必须保持清空，严禁将员工模板拷贝给 Claude 作为 subagent 造成架构倒挂与无 TTY 递归死锁。

2. **后台免交互最大自主授权 (Permissions)**：
   - 非交互调度执行后台任务必须赋予最大自主权限，消灭等待终端确认引起的死锁：
     - `cmd`：必须显式传递 `--yolo --tools-all -t`，全面放开文件写入、命令执行与项目信任；
     - `claude`：必须显式传递 `--dangerously-skip-permissions`；
     - 管道执行强制添加 `< /dev/null` 重定向，杜绝因无 TTY stdin 悬空而等待 3 秒或 hang 死。

## 18. Coolie 工坊唯一核心北极星目标与真业务本体物理并轨铁律 (wave304)

老板原话: 「还是 重新看看 建设这个 coolie系统的 核心目标吧， 总感觉 搞着搞着 就 乱了，到现在为止，本体功能 系统本身 没有用上， 新项目/会话/任务 建设 更没有用上， 感觉建设了 假东西，请 认真复盘，并且 重新给出一个 coolie工坊建设的 全面目标，然后让AI AGENT 持续为了同一个目标 做深做透」

详尽复盘白皮书见 `docs-coolie/research/2026-10-05-coolie-core-mission-and-real-ontology-master-plan.md`。

1. **唯一核心北极星目标**：
   - **战略定义**：建设以「活体业务本体 (Living Ontology)」为唯一控制与决策中枢、由「高管自然语言工坊」直通驱动、全流程调度「数字员工团队」、实现「零培训、免代码、不可变真机证据交付」的企业级 AI 软件工程控制面！
   - **消灭两张皮**：彻底终结“本体在底层孤岛空转、工坊在上层打字闲聊、看板在离散派单”的割裂假象，本体必须成为系统的神经脊梁。

2. **三大物理并轨铁律 (三大契约)**：
   - **项目进厂即本体域 (Project as Domain)**：创建 Project 必须原子初始化同名 `ontology_domains`；上传需求文档/SQL 必须自动触发 `RepoCognitionJob` 提取核心实体与动作草案，严禁无本体的孤立项目；
   - **工坊会话即本体演进 (Conversation as Proposal)**：工坊 (Board Chat) 是本体演进的飞行摇杆。高管自然语言诉求通过 Hermes 实时澄清 (Echo) 并物化为结构化 Proposal 卡片 (Delta)，老板两字确认即落盘快照并自动派单；
   - **任务施工即动作跃迁与不可变血缘 (Task as Action Execution & Provenance)**：WBS 任务必须挂靠本体 ActionType / ObjectType；代码 Commit、接口契约与真机测试快照（四态）直接作为本体节点的不可变 WorkProduct 证据链。

3. **六大数字员工的“本体靶心”工作法**：
   - **Hermes**：专职将高管意图转译为本体 Proposal，并反向编排 WBS 任务树；
   - **墨斗 (FDA)**：专职负责 `ontology_domains` 架构设计、租户物理隔离与实体定义（G1 门禁）；
   - **铁匠 (Core SWE)**：专职按 ActionType 契约编写代码与静态测试，保持 0 编译报错（G2/G3 门禁）；
   - **门神 (FDSE)**：专职通过 `agent-device` 捕获真机模拟器快照，作为本体节点的交互证据（G4 门禁）；
   - **百晓生 (DS)**：专职沿着 `ontology_find_path` 业务因果链进行全流程端到端业务验收；
   - **兑底渊 (PRE-SRE)**：专职基于 `ontology_find_impact` 扫描变更影响面，实施零风险不可变投产（G5 门禁）。

4. **极简主义与防乱加功能守卫**：
   - 坚决贯彻“极简两字交互”与“对称 5 槽位底栏”，消灭同屏重复创建入口；
   - 100% 榨干系统已有 50+ 张物理表与本体引擎，严禁因碎片功能随意扩表或增加复杂菜单，持续做深做透核心闭环。

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
