# 用完整平台承接业务：就绪度评估

日期：2026-09-18。基线：`54b811140`。

**前提（已确认）**：一个客户一套独立实例；私有部署；需求来自**公网、且零散**（不是一个客户一个大项目，
而是很多小项目）；操作方自己也部署一套。所以实例会**面向公网**，而且很可能**同机多套**——
这两点把下面的优先级重排了，见第 6 节。

## 0. 一句话结论

控制面的闭环、租户隔离、审批/预算闸门、本地与 sandbox 执行平面、本体的模型层与治理闸门、
以及本体自治迁移——**这些是真的，有机制、有测试**。但三件事会让第一次真实交付失败：

1. **灾难恢复不可操作**：备份能跑，恢复没有任何支持的路径；
2. **语义层没有接到 Agent 平面**：`ontology` 在 `server/src` 和 `ui/src` 里一次都没出现，
   导入的插件也不在默认插件目录里——"agent 读本体、提案、人裁定"这条我们最干净的链路，
   在真实 run 里根本够不着；
3. **本体的治理有闸门、没有门**：提案表在，但 blast radius 从来没算过（我们自己的 migration
   注释还写着"创建时计算"），review 队列没有 UI，而且**一个会 orphan 值的提案会永久卡在
   `approved`，通过 API 无法再裁定**。

另有一条元结论，它决定后面每一条怎么修：**这些缺口大半在 host（上游 Paperclip）的文件里**。
按我们"缩小 fork surface"的规矩，每一条都要先决定是**打补丁（付合并成本）**还是**写运维规程
（零 fork surface，但要求有人按规矩操作）**。能被机械检查的约束不该靠人记住，所以 DR 与认证边界
这类必须落到机制；遥测默认值、健康戳这类可以先用规程加配置。

方法：六条并行审计（交付/部署、认证与治理、本体平面、Agent 平面、运维与可观测、验证闸门的诚实度），
每条要求 file:line 证据，且要求把"实现了并有测试"、"实现了但没验证"、"缺失"分开。本文件只报告，
**未做任何代码修改**。

## 1. 最要命的三件事（客户 1 之前）

### 1.1 灾难恢复不可操作

- `runDatabaseRestore` 实现并在库层面有单测（`packages/db/src/backup-lib.ts:1051-1087`），但
  **产品里没有任何出口**：`cli/src/index.ts:176-188` 只注册了 `db:backup`，没有 `db:restore`；
  服务端只有"触发一次备份"的路由（`server/src/routes/instance-database-backups.ts:25`）；
  `docs/deploy/database.md` 与 `doc/DEPLOY-UPDATE.md` 从不提恢复。
- `paperclipai update --rollback` 只翻 `current` 的符号链接，它自己的输出就写着
  "Database migrations are not reversed; restore the pre-update backup if needed"
  （`cli/src/commands/update.ts:128-140,173-180`）——而按上一条，那个备份没法用。
- 迁移在启动时**静默应用**：`promptApplyMigrations` 在 `!stdin.isTTY` 时直接返回 true
  （`server/src/index.ts:240-254`）。服务化/容器化升级会在任何人能回滚之前先把客户库改掉。
- Coolie 实际跑的那条升级路径是**无保护的手工 `git pull`**
  （`doc/DEPLOY-UPDATE.md:23-48`），没有版本钉、没有备份关卡、没有回滚。
- 备份只覆盖数据库，而恢复还需要 `secrets/master.key`（`doc/DATABASE.md:325-327,355-360`）；
  备份健康只检查 dump（`services/database-backup-health.ts:81-103`），所以 `/api/health`
  可以读作 `ok` 而这个实例根本不可恢复。
- CLI 侧读的是**磁盘上可能过期的** embedded port（`cli/src/commands/db-backup.ts:21-35`），
  服务端端口回退只存在内存里（`server/src/index.ts:536-540,745-747`）——54329 被占时，
  `pnpm db:backup` 会去备份**另一个实例的库**，而且不报错。

**症状**：第一次坏迁移之后，运维手上只有一堆 `.sql.gz` 和一个没有支持路径的恢复；
手写 `gunzip | psql` 打进一个正在运行的单写者嵌入式 PG，就是把事故变成损失。
**归属**：host 文件。最小诚实的做法是 CLI 加 `db:restore` + 一段演练过的 runbook +
迁移前的备份关卡；纯规程方案（零 fork surface）要求必须先停服务，那也必须写下来并演练一次。

### 1.2 语义层没有接到 Agent 平面

- `ontology` 这个字符串在 `server/src`、`ui/src` 里**没有任何出现**。
- `packages/ontology-mcp` 是个独立 bin（`package.json:7-10`），**没有任何东西启动它**；
  它需要 `ONTOLOGY_DATABASE_URL` / `ONTOLOGY_API_KEY` / `ONTOLOGY_KEY_PEPPER`（`src/config.ts:23-50`）。
- `plugin-ontology` **不在默认插件目录里**（`server/src/services/bundled-plugins.ts:63-100`
  只有 sandbox provider）。
- run 作用域的 MCP 网关只在 agent 有 assigned MCP connection 时才创建
  （`server/src/services/heartbeat.ts:4476-4484`）；即使用，也只有
  `claude_local`（`packages/adapters/claude-local/src/server/execute.ts:553-565`）和
  `codex_local` 写真正的 MCP 配置，其余适配器只拿到环境变量（`server-utils.ts:27-42`）。
- `PAPERCLIP_API_URL` 未设置时 `paperclipApiBaseUrl()` 抛错，但调用方把它降级成
  **一行日志**（`heartbeat.ts:4329-4337,23646-23655`）——配置错的实例上，每个 agent 都静默地
  没有工具，而不是大声失败。

**症状**：客户问 agent"读一下这个域的模型"或"提一个变更"，没有这个工具。我们讲得最清楚的
治理故事（`create-proposal` 对 agent 开放、`decide-proposal` 对 agent 关闭，且插件与 standalone
共用同一份工具目录）在真实 run 里够不着。
**归属**：主要是**我们自己的树**（把插件纳入默认目录、把本体 MCP 面附加到 run），加一处 host 缝。
这是投入产出比最高的一条。

### 1.3 本体的治理有闸门、没有门

- **blast radius 从来没算过**：`createProposalMutation` 只存调用方传进来的值
  （`worker.ts:1252`），agent 工具传的是常量 `{proposedBy:"agent"}`（`mcp/tools.ts:505,584`）——
  而 `migrations/014_proposals.sql:10` 写着它"computed when the proposal is created"。
  **我们自己的注释是假的。**
- **applier 只覆盖 5 个操作**：`update-node-type`、`create-node-type`、`create-node`、
  `update-node`、`create-edge`；其他一律抛 `Unsupported proposal operation`（`worker.ts:594-671`）。
  关系类型、动作类型、接口、函数、以及任何删除，都不能提案。
- **会 orphan 值的提案永久卡死**：applier 的 `update-node-type` 路径传了 `propertyRenames`
  但**没传 `allowOrphaned`**（`worker.ts:597-603`）；store 抛错，异常逃出
  `decideProposalMutation`（无 try/catch），`markProposalApplied` 不执行，行停在 `approved`，
  而 `reviewProposal` 拒绝再次裁定（`GraphStore.ts:4354`）。**API 层面不可恢复。**
- **review 队列没有 UI**：`list-proposals` 注册了 data 与 route（`worker.ts:2759,4478`），
  但 `src/ui` 里没有任何 `usePluginData("list-proposals")`——人间没有裁定提案的界面。

**症状**：我们讲"review 闸门"的故事，第一个真实提案就可能卡死，而且没有任何界面能看见它。
**归属**：我们自己的树。便宜的部分：接上已有的 `list-proposals`；把 orphan 路径从"抛异常"
改成"可裁定的拒绝"；要么算 blast radius、要么别再声称算了。

## 2. 客户前两周会撞上的（Tier 1）

### 2.1 认证与凭据

- **完全没有密码找回**：`better-auth.ts` 没有 `sendResetPassword`，`routes/auth.ts` 没有重置路由，
  UI 没有"忘记密码"，也没有管理员代改密码；首管理员一旦 claim 过就拒绝再次 claim
  （`first-admin-claim.ts:35-41`）。V1 合同明确写"Single human board operator per deployment"
  （`doc/SPEC-implementation.md:38`）——所以唯一那个操作员丢了密码，实例在应用层不可恢复。
  同时 roadmap 把 "Multiple Human Users" 标成已完成，**文档之间对"有几个人"不一致**。
- **`local_trusted` 是无认证的 instance-admin 后门**：中间件把每个请求无条件盖成 board +
  instance-admin（`middleware/auth.ts:220-230`；`services/authorization.ts:1644-1650` 短路所有判定）。
  只有 bind 检查挡着（`config.ts:295-304`），而 `PAPERCLIP_ALLOWED_HOSTNAMES`
  （`config.ts:228-253`）或一个改写 Host 的反代就能绕过；文档里"never forward it"
  （`docs/deploy/environment-variables.md:48`）**不是机制**。
- **全新私有部署的 first-admin 竞态**：`authenticated` 下注册默认开放且不验证邮箱
  （`better-auth.ts:273-277`），而 `POST /api/bootstrap/claim` 只要 `authenticated`+`private`
  就可用（`routes/access.ts:2742-2765`）——先能访问的人就是 instance_admin。
  CLI invite 路径（`auth bootstrap-ceo`）没有这个问题。
- **board API key 无 scope、跨公司、可永不过期**：schema 没有 scope/company 列
  （`packages/db/src/schema/board_api_keys.ts`），key 携带该用户的全部 company 成员身份
  （`services/board-auth.ts:69-108`），`expiresAt: null` 合法
  （`packages/shared/src/validators/access.ts:88-92`）。
- **审计既不完整、可被删除、还可伪造**：删除 agent 会删掉它的 activity_log 行
  （`services/agents.ts:1003-1008`），删公司默认删掉全部 activity（`services/companies.ts:539`）——
  出事之后最需要的历史正好被抹掉；`POST /companies/:id/activity` 允许伪造 actor
  （`routes/activity.ts:329-339`）；**instance-admin 的升降级没有任何日志**
  （`routes/access.ts:4655-4737`）；而"每个变更都有记录"的文档说法是**过强的**
  （`docs/guides/board-operator/activity-log.md:6`）。
- **没有任何读审计**：`AUDIT_EVENT_TYPES` 只有 create/update/delete/state（`enums.ts:58-95`）。
  "谁读过这个类型"无法回答。
- **本体的 key/member 在插件模式里是惰性的**：只有 standalone MCP 校验它们
  （`ontology-mcp/src/stdio.ts:36-50`）；插件 worker 从不校验，身份完全来自 host actor
  （`worker.ts:803-805`）。运维吊销一个本体 key 或停用一个 member，**在 Paperclip 里什么都不改变**。
- 本体侧角色粒度比模型粗：任何 operator/admin/owner 都能过所有 board-only 路由；
  `modeler | reviewer | viewer` 只影响 view 可见性（`worker.ts:818-821`），不参与授权。

### 2.2 本体交付面（客户会拿它判断产品）

- **DDL 那个 tab 把刚解析出来的列注释丢了**：`parseSqlDdl` 抽了 `COMMENT`/`--`/
  `COMMENT ON`（`AstExtractor.ts:178-241`），wizard 只留 `{ type }`
  （`LegacyImportWizardModal.tsx:1116-1125`）。第一句抱怨会是"字段没有说明"。
- **导入的 endpoint 从来不变成 action type**：wizard 把 parser 的动作塞进
  `metadata.bridgeActions`（`LegacyImportWizardModal.tsx:896-918,971-976`），**从不调用
  `create-action-type`**；只有 cognition 发布路径会建 action type（`worker.ts:387-403`）。
  导完 Actions 页是空的。
- OpenAPI 导入有损：`relationTypes` 恒为 `[]`（`legacy/openapiParser.ts:106`），
  `$ref/oneOf/allOf` 塌成 string（`:120-132`），而且对象类型的 `displayName` 被设成 schema 的
  `description`（`:77`）。
- **历史是两条半截的 trail**：`ontology_domain_snapshots` 有表**没有 restore、没有 diff**
  （`GraphStore.ts:2766`）；cockpit 的 restore 只循环 `nodeTypes`
  （`SnapshotDrawer.tsx:111-148`）——关系类型/动作类型丢了、`propertyOrder` 丢了，
  而且不带 `propertyRenames`/`allowOrphaned`，所以一个删除已填字段的 restore 会被闸门挡住。
  `ontology_audit_logs` 记了变更，但 `listAuditLogs` **故意不返回 before/after**
  （`GraphStore.ts:2966-2970`），也没有 UI 消费它。
- 视图的 focus 不往返：`saveView` 永远发 `config: {}`（`graph-view.tsx:1395`），
  打开时也只 `setChoice(picked.kind)`（`:1289`）。
- **交换文档完整但没接出口**：`OntologyDocument.ts` 有规范化、指纹、租户解耦校验、
  显式属性顺序、一等端点，但 `src/` 里对它**零引用**——没有 export/import 路由、没有 viewer。
  "模型能不能离开实例"目前不能。
- 缺：as-of 查询（`schema_version` 只是计数器，没有按版本读模型）、per-asset 信任/权威等级、
  下游引用清单（`ontology_resource_links` 指向 domain 而不是 type）、可重复的 connector 同步
  （connector 只是 CRUD 行，transform 是一次性 SELECT）、跨域 path/impact 的显式出口
  （存储层支持跨域边，但每个 route/tool 都在单域内解析）。

### 2.3 Agent 执行平面

- **plugin 环境会静默在本地跑**：`resolveEnvironmentExecutionTarget` 没有 `plugin` 分支
  （`services/environment-execution-target.ts:630-635` 返回 `null`），而
  `instance_settings.defaultEnvironmentId` 接受任何 driver
  （`routes/instance-settings.ts:131-137` 没传 allowedDrivers）——运维把它设成默认，
  插件被叫去拿租约，然后 agent 在 Paperclip 主机上跑，**不报错**。
- **per-issue 环境选择是假的**：`IssueExecutionWorkspaceSettings.environmentId` 在 API 层被校验
  （`routes/issues.ts:4472-4483`）、被存库，但 `resolveExecutionWorkspaceEnvironmentId`
  从不读它（`services/execution-workspace-policy.ts:257-297`），UI 自己也总写 `null`
  （`ui/src/lib/issue-workspace-selection.ts:79`）。
- **SSH 只有"凭据即连"这一半**：连接/工作区往返/RPC 有真 sshd fixture 测过
  （`server/src/__tests__/environment-runtime-driver-contract.test.ts`），但远端 CLI
  **没有预检也没有安装**——`ensureCommandResolvable` 只检查控制台上有没有 `ssh`
  （`server-utils.ts:4529-4553`）。第一次会先上传整个 workspace，再在远端 shell 里以难懂的错失败。
- `coolie_native` 是**没有引擎的 stub**（`packages/adapters/coolie-native/src/server/index.ts:15,106`）。
- 远端目标中途断线只被"判失败"，不会恢复（sandbox 有 duplex 语义，SSH 没有）。

### 2.4 运维与可观测

- **一方遥测默认开启**（opt-out）：`resolveTelemetryConfig` 只在 `PAPERCLIP_TELEMETRY_DISABLED=1` /
  `DO_NOT_TRACK=1` / CI 时关闭（`packages/shared/src/telemetry/config.ts:66-86`），
  默认发往 `telemetry.paperclip.ing` 与一个 AWS 端点（`client.ts:14-17`）。
  私有客户必须**知道**去设那个变量，而 health 里没有任何字段提示它开着。
- **`/api/health` 不能证明在跑的是什么**：`commit` 是**运行时读的 git HEAD**
  （`routes/health.ts:253-258` → `server-info.ts:175-197`），来自启动进程那个 checkout；
  `dist/build-info.json` 只喂 OTel 的 `service.version`。dist 与 checkout 不一致也会 `ok`。
- **所有后台正确性都是一个进程里的 `setInterval`**，没有调度器、没有跨进程锁
  （`index.ts:1154-1219,1816-1840`）：备份、执行终态清扫、租约清理、孤儿 sandbox 回收
  都会静默停（或多副本双跑）。
- plugin log retention 是**死代码**（`plugin-log-retention.ts:69` 无调用点）→ 表无界增长。
- 静默吞异常在租约/工作区/恢复路径上：`agents.ts:568,571`（租约释放失败无声泄漏）、
  `native-finalization-reconciler.ts:885+`（恢复路径的 workspace 清理）、
  `workspace-runtime.ts:3813,3939-3940,4006`、`heartbeat.ts:19475`（wakeup fire-and-forget）、
  `heartbeat.ts:21591`（run-log 行写失败被吞，run log 少报 duplex 事件）。

### 2.5 交付与安装

- **文档的安装路径装的是上游 `paperclipai`，不是这个 fork**：`README.md:303-337`、
  `doc/INSTALLING.md` 指向 `paperclip.ing/install.sh` → `npx paperclipai`（其 repository 是
  `github.com/paperclipai/paperclip`）。我们的插件、i18n、branding 都不在那个产物里，
  而唯一描述 Coolie 运行方式的 `ecosystem.config.cjs` **没有任何文档引用**。
- `ecosystem.config.cjs:33-35` 带着 `BETTER_AUTH_SECRET: "dev-secret"` 与
  `PAPERCLIP_TOOL_ACTION_SIGNING_SECRET: "dev-tool-secret"`（带 TODO）——这就是实际在跑的那份配置。
- 同机多实例靠约定：embedded PG 默认端口 54329 对每个实例硬编码相同
  （`onboard.ts:259`、`db-backup.ts:30`），没有多实例测试，而按 §1.1 的 CLI 端口问题，
  备份可能备份错库。
- **没有离线/气隙流程**：install.sh 拉 NodeSource/Homebrew/npm，Dockerfile 拉 rustup 与
  五个 CLI，模型 provider 是 onboarding 的硬依赖。客户环境常是受限出口。
- 文档与代码不一致若干处：`docs/deploy/aws-ecs.md:413` 说"第一个注册的用户会获得 admin 角色"
  （**假**，admin 只来自显式 claim）；`doc/DOCKER.md:97` 说 quickstart 是 "embedded SQLite"
  （是 PG）；`doc/INSTALLING.md:227-244` 把 `update --rollback` 呈现为回滚（只回代码）。

### 2.6 验证闸门的诚实度（决定"绿色"值多少）

- **repo 自己的诚实机器没有接进 CI**：`scripts/check-testing-defenses.mjs` 的判定逻辑是对的
  （verified / not-verified / not-run / failed 分得很清，`:190-222`），但
  **`.github/` 里没有任何引用**——默认跑只有 2/4 行 verified，第 3/4 行永不自动启用。
- **fork-surface gate 可能打印 PASS 而什么都没量**：`--cumulative` 只遍历 manifest 的 entries
  （`check-fork-surface.mjs:122`），所以**新增的上游文件不可见**；它只数带我们 trailer 的 commit
  （`:203`），缺 trailer → total 0 → 仍然 PASS（`:218-222`）。
- **~215 个真实 Postgres 套件在 PG runtime 缺失时静默 skip 成绿**
  （`db/src/test-embedded-postgres.ts:252-258` 吞掉失败返回 `{supported:false}`）——
  正是 SKILL.md §0 警告的"假库通过"，从 skip 口子又回来了。
- **多用户 e2e 永远不跑**：`tests/e2e/multi-user*.spec.ts` 与 `in-feed-native/*` 被 config 和
  shard 脚本同时排除（`playwright.config.ts:38`、`e2e-shard.mjs:15`），
  `test:e2e:multiuser-authenticated` 没有任何 workflow 调用。
- `expect(true).toBe(true)` 站在编译期 `@ts-expect-error` 断言的位置
  （`run-contracts.test.ts:73`、`execute-identity.test.ts:103`），而那条 typecheck
  （`pnpm -r typecheck`）只在 `release-verify.yml` 跑、`adapter-utils` 又被 PR CI 排除。
- 默认 e2e 用 `PAPERCLIP_E2E_SKIP_LLM=true` 跑（`pr-trusted.yml:977`）。
- 结构上无法失败或只断言形状的：`expect(x).toEqual(expect.any(String/Number))` 一族约 40 处
  （如 `http-log-redaction.test.ts:103`、`agent-skills-routes.test.ts:72`）。

## 3. 我们真正已经有的（不要过度纠正）

- **控制面闭环**：公司/目标/组织树/任务单一 assignee + 原子 checkout/心跳/成本与硬停/审批
  （hire 审批、tool-action 人类专属裁定 `tool-action-review.ts:33-34`、issue review policy）。
- **租户隔离是被机制强制的**：agent key 哈希存在、绑公司、跨公司硬拒
  （`middleware/auth.ts:439`、`authorization.ts:1858-1863`）、可吊销、吊销后不参与查找。
- **本地与 sandbox 执行平面成熟**（驱动契约、能力快照、同步语义、duplex 桥、调度都有测试）；
  SSH 的凭据即连契约有真 sshd fixture 测过。
- **本体**：目录扫描是真正端到端的最强导入路径（Java/Kotlin/MyBatis/proto/SQL/服务识别/来源戳，
  且**报告**读不了的扩展名而不是丢掉）；模型可手建（node/relation/action/function/interface/layer）；
  破坏性变更闸门真的在 store 层生效（orphan 拒绝、rename 带着实例数据走）；快照有 version 序列。
- **迁移自治完整**：ledger + 每文件 checksum + 改动过就拒绝静默重跑 + schema 名参数化替换 +
  preflight + tenant anchor（`migrate/runner.ts`）。
- **Agent 面最干净的一条**：`create-proposal` 对 agent 开放、`decide-proposal` 关闭，
  且插件与 standalone 共用同一份工具目录（`mcp/tools.ts` 由 contract 派生并有测试）——
  **设计是对的，只是没接上（§1.2）**。
- 三条数据路径（telemetry / observability / run log）各自存在，run log 留在实例库内。

## 4. 只有你能拍的板

1. **交付形态**：一客户一实例 + 私有部署？若是"我们代管一套多客户"，§2.1 的结论要重写。
2. **host 缺口怎么修**：打补丁（付 fork surface）还是运维规程（零 surface，靠人按规矩）？
   我的建议是分档——DR 与认证边界必须落到机制；遥测默认、健康戳可以先用规程 + 配置。
3. **第一个客户是谁、什么形态**：决定 Tier 1 先修"本体交付面"还是"Agent 平面"那一半。
4. **是否接受最小试点**：先做一个命题、跑完影子运行（含一次真实回滚演练），而不是全域铺开。

## 5. 我建议的顺序

1. Tier 0 三项（DR 可操作 / 语义层接上 Agent 平面 / 治理的前门与卡死修复）。
2. 本体交付面里最便宜的四个：DDL 注释别再丢、导入的 endpoint 建 action type、
   接上 review 队列 UI、orphan 提案改成可裁定。
3. Agent 平面接通：插件进默认目录 + 把本体 MCP 面附加到 run（并让缺配置大声失败）。
4. 做一次真实的备份→恢复演练并留记录；把 `db:restore` 或等效规程写下来。
5. 运维交代：遥测关闭方式、健康戳的**真实**含义、后台作业依赖单进程这件事、
   以及把"四行闸门"接进 CI（它现在是一条没插电的诚实机器）。

## 6. 形态确认后的重排（2026-09-18 追加）

形态：一客户一实例 + 需求零散来自公网 + 自己也有一套 ⇒ **实例面向公网，且很可能同机多套**。
重排如下。

### 6.1 新增第一条：同机多套会串库（比第 1 节任何一条都危险）

已核实，不是推测：

- 备份的**目的地**按实例解析：`resolveDefaultBackupDir(resolvePaperclipInstanceId())`
  （`cli/src/commands/db-backup.ts:56-58`）。
- 备份的**连接**按配置端口解析：`config?.database.embeddedPostgresPort ?? 54329`
  （`db-backup.ts:30-34`）——而服务端在 54329 被占时是**内存里**回退端口的
  （`server/src/index.ts:536-540,745-747`），盘上的配置不变。
- `update` 的"升级前备份"**就是同一个函数**：`overrides.backup ?? (() => dbBackupCommand({}))`
  （`cli/src/commands/update.ts:195,251`）。

**后果**：A 实例的服务回退到 54330 之后，对 A 执行 `db:backup`（或 `update`）会连到
**54329 = B 实例的数据库**，把 dump 写进 **A 实例的备份目录**，且不报错。两重伤害：
① A 自己的库其实没有备份；② **B 客户的数据进了 A 客户的备份文件夹**——同机多客户时，
这就是跨客户泄露，而且是"我们省钱放在一台机器上"这个决定直接触发的。
自动化那路（服务端 `runServerDatabaseBackup`，`server/src/index.ts:814,1836`）用的是活连接，
没问题；**危险的是 CLI 与 update 这条路**。

修法（二选一，都不大）：给每个实例在配置里**显式钉 port + `DATABASE_URL` + 独立 `backup.dir`**，
并把 `54329` 这个默认值从 onboard 里去掉；或者让 CLI 先读**服务端活着的端口**
（服务端把实际端口持久化，而不是只在内存里）。前者是配置/脚本层面，零 fork surface。

### 6.2 第二条：公网面向让认证边界从"理论"变"立即"

- 正解是官方的 `authenticated + public`（`doc/DEPLOYMENT-MODES.md`：Internet-facing/cloud，
  要求显式 public URL、doctor 更严、限流默认开、建议 loopback + 反代），**绝不能** `local_trusted`。
  好消息：`local_trusted` 非 loopback bind 会**拒绝启动**（`config.ts:295-304`）；
  坏消息：文档里"never forward it"不是机制，allow-list 或改写 Host 的反代就能绕过。
- **完全没有密码找回**（无 `sendResetPassword`，无重置路由，无管理员代改；
  且各命令/路由里**没有 SMTP/nodemailer 的痕迹**，所以不存在"发一封重置邮件"这个可选路径）。
  对一个交给客户的公网实例，客户忘密码 = 你在应用层无法修复的支持事故。
  对零散客户这种量级，这会变成反复发生的人力成本——所以它从 Tier 1 **升到 Tier 0**。
- **全新公网实例的 first-admin 竞态**：`authenticated+public` 下 `POST /api/bootstrap/claim`
  可用（`routes/access.ts:2742-2765`），而注册默认开放——暴露之后、你 claim 之前能访问的人
  就是 `instance_admin`。
- **可操作的做法**（都不需要改代码）：每个客户实例**先用 CLI 邀请建管理员**
  （`paperclipai auth bootstrap-ceo`，这条路没有竞态），**先关注册**，再暴露；
  给客户的访问走**邀请链接**（`inviteUrl` 由 baseUrl 拼出来，`routes/access.ts:1132,3364`——
  **不需要邮件服务**）；把"先建管理员、再开公网"写进一次性的开通清单。

### 6.3 第三条：公网模式和我们接本体的方式冲突

`DEPLOYMENT-MODES.md`：`authenticated + public` 下**本地 stdio MCP 运行时默认 fail-closed**
（要 `PAPERCLIP_TRUSTED_MCP_RUNTIME_HOST` 才放行），并写着"Remote HTTP MCP remains the preferred
public-hosted path"。而 `packages/ontology-mcp` **是个 stdio 服务器**。
所以第 1.2 节"把本体接给 agent"这一条，在公网实例上必须走**插件/工具网关那条路**（或 HTTP MCP），
**不能走 stdio**——否则它会在最需要的那些实例上恰好关掉。

### 6.4 第四条：零散 ⇒ 复用就是毛利，交换文档从加分项变核心

小项目多，单项目毛利低，**跨项目的资产复用就是利润来源**——这正好是文章那句
"本体是资产、应用是租客"在我们这个形态下的读法。而跨实例复用的通道就是
`OntologyDocument`（导出/导入），它**设计完整、有测试、完全没有出口**（§2.2）。
于是它从"Tier 2 加分项"升为**继串库之后的最高 ROI 项**：一个客户实例里建好的对象/关系/动作，
能不能带到下一个客户实例里当起点。
配套的最小度量：新项目里直接复用既有资产的比例（文章的两个数字之一），
这个数字得靠读审计（§2.1）才能算出来。

### 6.5 第五条：该做的是"开通清单"，不该做的是"驻场仪式"

零散小项目不需要 RACI、季度资产盘点、影子运行四要素那一整套。
保留三样即可：**每个实例一张开通/交付清单**（模式=authenticated+public、管理员已用 CLI 建立、
注册已关闭、端口与 backup.dir 已钉、遥测已关、`PAPERCLIP_API_URL` 已设）、
**一份交付记录**（这个项目依赖哪一版本体）、**一个复用率数字**。
第 2.4 节那些运维项（遥测默认开、health 戳不能证明在跑什么、后台作业单进程）
在这个形态下的处理办法就是写进那张清单，而不是去改上游。

### 6.6 降下去 / 升上去

**降**：企业治理仪式（RACI、季度盘点、影子运行全套四要素）、跨域查询、
可重复 connector 同步（小项目一次性导入通常够用）、多用户 e2e 之外的多用户高级权限。
**升**：同机多实例的隔离与备份正确性（6.1）、公网认证边界与密码找回（6.2）、
跨实例资产复用（6.4）、开通清单化（6.5）；第 1 节三项仍然在最前（DR 仍不可操作，
而多实例让它更容易触发）。

### 6.7 需要你定

1. **客户实例放哪**：都放你一台机器（成本低、但 6.1 必须先修），还是一客户一台小机器/容器
   （隔离更干净，成本换安全）？
2. **要不要"模板实例"**：一个装好插件、关好注册、钉好端口的母版，按客户克隆——这是零散形态下
   唯一能摊薄开通成本的办法。
3. **本体对客户是"可见交付物"还是"我们内部的资产"**：决定交换文档是外部交付面（要 viewer）
   还是内部导入导出（先要 route）。

**未做**：本文件只评估，没有修改任何代码。
