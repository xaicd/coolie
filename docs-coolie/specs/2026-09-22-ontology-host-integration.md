# Spec: 本体插件与宿主的集成归位（消除平行机制）

- 日期：2026-09-22
- 老板：chenwei（本次会话）
- 老板原话：「迁移的表有些功能和 pageclip 可能冲突了，得集成组合好」
- 优先级：**P0**（含一处明文凭据风险 + 两条写域路径）
- 状态：DRAFT — 待老板回签
- 基线：c0131cfde1bf3d3c6aa3302c3bd5473ee34d09f4

## 1. 背景

`packages/plugins/plugin-ontology/` 是从 DigitalStaff 迁过来的**clean-room 1:1 移植**
（`packages/plugins/plugin-ontology/README.md:30-32` 起，每个迁移一节 scope 说明，
O1.5/O2/O4/O4b/O6/O6b 各自声明"aligned with the DigitalStaff … models"），37 张表落在
插件自己的 namespace（`plugin_ontology_b62f8af3e9`）；宿主 Paperclip 另有 100+ 张表。

对 37 张表做了逐张比对（身份证/审计/审批、对话、数据集成、评估/能力 四路），
结论是**没有一对是真的"重复表"**。冲突是四类，处理方式完全不同——当一类处理就会做错：

| 类 | 性质 | 处置 |
|---|---|---|
| 1 | 双写分工，**已经做对** | 保持，作为其余几类的样板 |
| 2 | 同词不同层 | 不改表，**改词表** |
| 3 | 信息重复且可漂移 | 宿主已有事实的地方，插件**只存引用** |
| 4 | 真绕过宿主 | **归位**到宿主机制 |

**类 1 的样板（现状正确，不得动）**：插件同时写宿主 `activity_log`
（`worker.ts` 21 处 `ctx.activity.log`，含 `logSchemaChange` 包装）**和**自己的
`ontology_audit_logs`（`GraphStore.ts:2929`）。宿主流水只有 company/actor/action/
entity/details；本体表有 `before_state`/`after_state`。AGENTS.md「mutating action
写 activity log」已满足。分工是：宿主流水回答"谁做了什么"（宿主查），本体审计回答
"模型前后变成什么样"（本体查）。**不要因为"去重"合并它们**（AC20）。

**类 4 的三处真问题**：

1. **能力获取整条链是空转的。** `ontology_capability_gaps` → `_resolutions` →
   `ontology_functions`：许可证/体积/冒烟门禁**全靠调用方自报**
   （`worker.ts:2924-2955` 直接透传 `candidate.smokeTestPassed`），没有下载、没有依赖
   安装、没有插件安装、没有工具注册（`GraphStore.ts:5209-5314`）。而真正拥有"获取能力"
   的是宿主：`plugins` 生命周期会真起停 worker 进程、`company_skills.installFromCatalog`
   （`company-skills.ts:5626`）、`built_in_managed_resources`。**两套"平台有哪些能力"
   的答案必然漂。**
2. **`ontology_functions` 有工具的工装，没有工具的行为。** 有 `type`(query/action/webhook)、
   `permissions.rateLimit`、`execution_stats`，但**全仓零执行器**
   （`executeFunction|runFunction|invokeFunction` 零命中），`execution_stats` 从未被写过。
   一个 `status='active'` 的函数**看起来能调，实际不能**——比重复更糟，是误导。
3. **两条写域路径。** cognition 的 `publish-cognition-job`（`worker.ts:2880-2887`）
   自己写 `ontology_domains`/types；宿主 `ontology-provisioner` 走插件
   `import-document`（`build.ts:354`）。同一张表两个生产者。

**类 3 的三处漂移**：`business_systems.repos`/`service_map`(jsonb) vs 宿主
`project_workspaces`/`workspace_runtime_services`（真实的 checkout 和真实进程）；
`ontology_binding` vs 宿主 `tool_profiles`/`tool_policies`（两套风险词表，只有宿主那套
生效）；`aip_logics.model_config.modelId`/`evals.model_id` 是自由文本，与
`ai_provider_defaults`/`ai_connection_defaults` 无 FK 无校验。

**类 2 的六个撞名词**：connector（`ontology_connectors` 数据摄取 vs 宿主
`tool_connections` 带凭据/目录/profile/policy 的对外动作层，后者语义由
`doc/connections/CONNECTOR-PLAYBOOK.md` 定死）、business system（vs `projects`）、
eval/prompt template（vs `evals/` + agent bootstrap prompt）、package install
（vs `plugins`）、view（vs `user_sidebar_preferences`）。`docs-coolie/TERMINOLOGY.md`
已经在处理 coolie/tenant 撞名，同一手法可以扩展。

**一处更正**：早前判断"connectors 没有密钥间接层"不完整。机制**已经存在**：
`secrets.resolve` 已实现且**强制带 companyId**（`host-client-factory.ts:779-780`
`resolveRequiredCompanyId`），插件 config 路由已按公司校验 secret ref
（`server/src/routes/plugins.ts:2349-2350`、`:2484-2485`）。真正的原因是本体插件
**没声明 `secrets.read-ref` 能力**——manifest 里 "secrets" 出现 **0 次**
（`manifest.ts:23-40`），却声明了 `http.outbound`。**在此之前，任何真实凭据写进
`ontology_connectors.config` 就是插件库里的明文**，违反 CONNECTOR-PLAYBOOK
（"Do not add durable vendor credentials to … plugin config"）与 `doc/connections/GLOSSARY.md:79`。

**aide 对话是架构纪律问题，不是表冲突。** 它把宿主已有的对话机制在插件命名空间重实现了
一遍（消息存储 / session 恢复 / SSE 流 / 历史回放 / abort / 快照），并绕过了全部宿主
约定：**无 company 外键（`company_id text`）、无 issue 关联、无 activity log、无作者身份**
（`migrations/010_aide.sql`、`011_aide_snapshots.sql`）。而 `docs-coolie/CHATHOME-DEFAULT.md`
废弃 `plugin-chat` 的理由正是"平行对话系统"。但它的 delta 是真的（域作用域对话、图检索
工具循环、实体引用、会话内改 schema、schema 快照/恢复），**不删，归位**。

## 2. 集成规则（本 spec 的判定标准）

| 规则 | 内容 |
|---|---|
| R1 只存引用 | 凡宿主已有事实（真实 workspace、模型连接、凭据），插件只准存引用，不得存副本 |
| R2 单一写入路径 | 每个本体实体只有一个受管写入路径；域与类型统一走 `import-document` |
| R3 能力归口宿主 | "获取一个新能力"由宿主安装机制执行；本体侧只记录结果引用 |
| R4 不制造第二身份 | 不在 company 之外引入第二个隔离/身份单元（`TERMINOLOGY.md:19`） |
| R5 双写按用途分工 | 宿主流水 = 谁做了什么；本体审计 = 模型前后状态。不合并 |
| R6 术语隔离 | 同一词在两侧含义不同时，必须写进词表 |

## 3. User Stories

- **作为门神（架构）**：拿到「同名不同物」词表，不再把 `ontology_connectors` 和宿主
  Apps 连接当同一件事，派单时不会走错层。
- **作为本体使用者**：给 connector 配凭据时，凭据进 `company_secrets`，插件库里
  **没有**明文；且我知道插件现在有权限去取。
- **作为平台运维**：能力获取只有宿主一条路，不会出现"本体说 `active` 但平台上没有任何
  东西能执行"。
- **作为老板**：域与类型只有一条受管写入路径，不会两处写同一个域。
- **作为审计者**：本体 chat 的每一轮问答都有 actor 和 activity log，而不是一个
  `role ∈ {user, assistant}` 的匿名行。

## 4. Acceptance Criteria (EARS)

### 4.1 术语隔离（零代码，先做）

- **AC1** WHEN 完成，THEN `docs-coolie/TERMINOLOGY.md` SHALL 含「同名不同物」一节，
  覆盖 connector / business system / eval / prompt template / package install / view
  六个词，每词各写**宿主侧语义**与**本体侧语义**两行。
- **AC2** IF 某词在某一侧没有对应（如 `ontology_interfaces`、`ontology_action_types`
  无宿主对应），THEN 词表 SHALL 显式写「无对应」，SHALL NOT 留空。

### 4.2 写域路径收敛

- **AC3** WHEN 一个 cognition job 被 publish，THEN 其写域/写类型的动作 SHALL 经由
  `import-document`（或与之等价的单一受管路径），SHALL NOT 直接调
  `createDomain`/`createNodeType`。
- **AC4** WHEN publish 完成，THEN SHALL 产生与该域其它写入路径一致的审计条目
  （`event_type` + before/after），使 `list-audit-logs` 能统一追溯。
- **AC5** WHEN 全仓搜索 `ontology_domains` 的 INSERT，THEN 结果 SHALL 只有三处且各自
  用途明确：种子（`system-seed`）、建域 spec（`import-document`，`bootstrap_source='build_spec'`）、
  人工建域（`manual`）。SHALL NOT 出现第四条路径。

### 4.3 connectors 凭据走宿主密钥

- **AC6** WHEN 创建或更新 connector，THEN 插件 manifest SHALL 声明 `secrets.read-ref`
  能力（`manifest.ts` capabilities）。
- **AC7** WHEN connector 需要凭据出网，THEN SHALL 通过
  `ctx.secrets.resolve(ref, { companyId, configPath })` 取值，SHALL NOT 从
  `ontology_connectors.config` 读明文。
- **AC8** IF `config` 中出现疑似凭据字段（`password` / `secret` / `token` / `apiKey` /
  `passwd`），THEN SHALL 以 422 拒绝并提示改用 `company_secrets` 引用。
- **AC9** WHEN 一个 connector 的凭据被解析，THEN 取值 SHALL 走宿主 secrets 服务
  （由宿主记录访问事件），插件 SHALL NOT 自行存储或缓存明文。

### 4.4 只存引用（类 3）

- **AC10** WHEN 一个 business system 引用 repo 或运行中服务，THEN SHALL 存宿主
  `project_workspaces`/`workspace_runtime_services` 的引用，SHALL NOT 在
  `repos`/`service_map` 里复制可变事实（URL 之外的运行态）。
- **AC11** WHEN 保存 `aip_logics.model_config.modelId` 或 `evals.model_id`，THEN
  SHALL 校验其在宿主 `ai_provider_defaults`/`ai_connection_defaults` 中存在，否则 422。
- **AC12** WHEN `ontology_binding` 的风险等级被消费，THEN SHALL 先映射到宿主词表
  （`low|medium|high|critical` → `read|write|destructive|critical`），映射表 SHALL 落在
  代码里并有测试，SHALL NOT 按名字直接对映。

### 4.5 决策项（老板签字后才开工）

- **AC13** identity 三表（`ontology_tenants`/`_members`/`_api_keys`）SHALL 有明确处置，
  二选一并记录进本 spec：**(a) 删除**（它们服务的是已叫停的独立部署，
  `doc/plans/2026-09-17`「别搞独立了」）；或 **(b) 标注 standalone-only 并从插件模式
  可达面移除**（7 条无人调用的路由 + 3 张表）。
- **AC14** `ontology_functions` SHALL 或接通宿主 tool 层（使 `status='active'` 有真实
  可调用支撑），或移除 `execution_stats` / `permissions.rateLimit` / `implementation`
  等"可执行性"字段；SHALL NOT 保持"看起来可调用但无执行器"的中间状态。
- **AC15** WHEN 检测到 capability gap，THEN 执行安装的 SHALL 是宿主机制
  （`plugins` / `company_skills` / `built_in_managed_resources`）；本体侧 SHALL 只记录
  结果引用与审计，`candidate.smokeTestPassed` SHALL NOT 作为唯一验证依据。

### 4.6 aide 存储归位

- **AC16** `ontology_aide_sessions` / `_messages` / `_snapshots` SHALL 具备 company 与
  domain 外键（`uuid` + `REFERENCES … ON DELETE CASCADE`），SHALL NOT 继续用无边界的
  `company_id text`。
- **AC17** WHEN 一轮 aide 问答产生，THEN SHALL 写 activity log（含 actor 与 domain）。
- **AC18** 消息 SHALL 记录作者身份（用户/agent），SHALL NOT 只有 `role ∈ {user, assistant}`。
- **AC19** 本体特有的能力 SHALL 保留：per-message `citations`、会话内 edit 提案
  （`editOps`/`EditCard`）、schema 快照与恢复。

### 4.7 不动项

- **AC20** 宿主 `activity_log` 与 `ontology_audit_logs` 的双写 SHALL 保持（现状正确）。
- **AC21** SHALL NOT 修改 `ui/`、`packages/db/` 的 schema、宿主 `approvals` 机制。
- **AC22** `ontology_proposals` 与宿主 `approvals` 的并存 SHALL 保持（两者独立且已被
  分别验证）——本 spec 不合并它们。

## 5. 边界 / Out of Scope

- ❌ **表设计加固**（CHECK 约束、索引增删、死列清理）—— 属
  `docs-coolie/specs/2026-09-22-ontology-schema-hardening.md`，纯迁移，验证路径不同。
- ❌ **结构收敛**（umodel 归属、两套快照合一、版本语义统一、jsonb 数组→关联表）——
  属第三份 spec，需要决策且动存量数据。
- ❌ 重写 aide UI 或换模型客户端。
- ❌ 给平台再加一层 tenant（`TERMINOLOGY.md:19` 明令禁止）。
- ❌ 删除 `ontology_aide_*` 或 `ontology_proposals`（有真实 delta/用途）。
- ❌ 改动 `packages/adapters/`、`cli/paperclipai`、上游 `ui/`。

## 6. 文件范围（白名单）

```
docs-coolie/
└── TERMINOLOGY.md                          (扩「同名不同物」一节)

packages/plugins/plugin-ontology/
├── src/manifest.ts                         (声明 secrets.read-ref)
├── src/worker.ts                           (connector 凭据校验; publish 走 import-document;
│                                             aide activity log)
├── src/ui/ConnectorsTab.tsx                (config 表单改密钥引用选择器)
├── migrations/019_*.sql                    (aide 三表补 FK; 见 §4.6)
└── tests/                                  (新增用例,见 §7)

packages/ontology-core/src/
├── graph/GraphStore.ts                     (connector config 存引用; cognition 收敛;
│                                             functions 字段处置)
└── graph/*.test.ts 或既有 tests/            (映射表用例)

docs-coolie/specs/
└── 2026-09-22-ontology-host-integration.md (本文件)
```

**不动：** `ui/**`、`packages/db/src/schema/**`、`server/src/routes/build.ts`
（既有 spec 审批流保持）、`packages/adapters/**`、`clients/**`。

## 7. 验收 gate

- [ ] `TERMINOLOGY.md` 含六个撞名词的双侧语义，且每个都有「无对应」或宿主对应
- [ ] 全仓搜索 `INSERT INTO … ontology_domains` 只有三条路径，且各有明确用途
- [ ] `ontology_functions` 不再处于"有工装无执行器"的中间态（接通或脱工装，二选一并记录）
- [ ] connector 表单无法提交明文凭据；含凭据字段的 config 返回 422
- [ ] `manifest.ts` 声明 `secrets.read-ref`；凭据取值走 `ctx.secrets.resolve`
- [ ] aide 三表有 company/domain 外键（`ON DELETE CASCADE`），删域级联
- [ ] aide 一轮问答写入 activity log，消息含作者身份
- [ ] AC13 / AC14 / AC15 三项决策**已由老板签字**并写入本 spec
- [ ] `pnpm -r typecheck` 0 错误
- [ ] `pnpm --filter @paperclipai/plugin-ontology test` 绿
- [ ] `scripts/e2e-local.sh` 仍能跑（不破坏既有本地验收）
- [ ] 老板回签

## 8. 派单策略

- **第一波（PM 自己，零代码）**：`TERMINOLOGY.md` 扩「同名不同物」一节 —— 立刻止血。
- **第二波（门神 cmd）**：两条写域路径收敛 + connector 凭据校验 + `secrets.read-ref`
  声明。范围小、风险低、堵真漏洞。
- **第三波（铁匠 claude）**：aide 三表补 FK（migration 019）+ activity log + 作者身份。
  需注意 019 号段已被"schema 加固" spec 预定，**两波不能并行改迁移号**。
- **第四波（老板签字后）**：AC13/14/15 三项决策的实施。

## 9. 不回签就停在哪

- 三项决策（AC13 identity 表留删 / AC14 functions 接通或脱工装 / AC15 能力获取归口）
  **没有老板签字不开工**——它们涉及删表和改归属。
- 第一、二波可以并行开工，不与决策耦合。

## 10. 阻塞

| 阻塞 | 解决 |
|---|---|
| migration 019 号段与「schema 加固」spec 冲突 | 串行；先落地的一份占 019，后一份取 020 |
| `secrets.read-ref` 需宿主 SDK 侧确认可用签名 | 已验证：`host-client-factory.ts:779-780` + `types.ts:2150` |
| host `tool_profiles` 与 `ontology_binding` 的映射表归属 | 落 `ontology-core`，附单测（AC12） |
