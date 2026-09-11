# P2/P4 规划:native 引擎 adapter + 多 agent 讨论编排 + 流程中心 plugin

> **分支**:`feature/native-engine-plan`(改动只在此分支,`master` 不受影响)
> **阶段**:规划(requirements + design)。**本文件不含产品代码。**
> **依据**:基于对 coolie(paperclip fork)**真实代码**的核实(见文末"核实证据")。
> **原则**:clean-room——从能力规格出发独立实现;旧 DigitalStaff 代码仅作功能参考,不搬实现。

---

## 0. 为什么这三件事一起规划

你在原系统(DigitalStaff)里,这三者本就是**打通的一条链**:

```
流程中心(低代码工作流)里拖一个"群聊专家/agent 节点"
   → 该节点执行时发起多智能体群聊(群策群力)
      → 群聊/编码由 native 引擎驱动
```

迁移到 coolie 后,承载方换成 coolie 的原语,但链路不变:

```
P4 流程中心 plugin(reactflow 画布 + 执行引擎)
   ├─ "agent 节点"    → 调 P2 native adapter(task 执行)
   └─ "群聊专家节点"  → 调 P2+ 讨论编排层(多 agent 围绕 issue 群策群力)
P2  native 引擎 → coolie adapter
P2+ 讨论编排层 → 建在 issue 评论/@唤醒/thread-interactions/子任务 之上
```

因此本规划把三块的**接口边界**一次讲清,避免各做各的、将来接不上。

---

## 1. P2 — native 引擎接成 coolie adapter

### 结论:✅ 契约上可行,coolie 明确支持,无需改核心

### Requirements
- R1 native 引擎作为一个新 adapter type(建议 `coolie_native`)被 coolie 识别与调度。
- R2 一次 task run = 一次 adapter `execute()` 调用;进度/日志/产物实时回写;结果含 token/成本。
- R3 支持取消(AbortSignal)、会话续跑(sessionParams)、环境自检(testEnvironment)。
- R4 通过 plugin/registry 注册,不改 coolie 核心代码。

### Design(映射到真实契约)
- 实现 `ServerAdapterModule`(定义于 `packages/adapter-utils/src/types.ts`):
  - `type: "coolie_native"`
  - `execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult>` — native 引擎主入口
  - `testEnvironment(ctx)` — 健康检查
  - 可选:`getConfigSchema()`(声明式配置表单)、`getRuntimeCommandSpec(config)`、`sessionCodec`、`loginCapability`
- 输入上下文 `AdapterExecutionContext`:`runId / agent / runtime(sessionId) / config / context(任务上下文) / signal / executionContinuation / executionTarget / runtimeTools`。
- 回写通道(引擎 → coolie):`ctx.onLog / onMeta / onEvent / onRuntimeProgress / onSpawn / onDispatch`。
- 返回 `AdapterExecutionResult`:`exitCode / usage(tokens) / costUsd / sessionParams / summary / resultJson / nativeFinalization / question`。
- 注册:通过 `registerServerAdapter()`(`server/src/adapters/registry.ts`)或外部 adapter 插件加载(`plugin-loader.ts`);`server/src/routes/agents.ts` 的 `assertKnownAdapterType` 会认已注册类型。

### 需适配的点(不是阻塞,是设计取舍)
- 契约是"一次 run = 一次 execute + 回调 + AbortSignal",**没有独立 status()/cancel() 方法**。native 引擎的长时/内部多智能体循环要映射为:单 execute 内跑完一轮 → 用回调报进度 → 用 sessionParams 支持下一轮续跑 → 用 signal 响应取消。
- native 引擎的"内部工具/沙箱"与 coolie 的 `executionTarget`/`runtimeTools`/沙箱 provider(见 P3)对齐。

### 成本联动(接上 rtk)
- `AdapterExecutionResult.usage/costUsd` 直接进 coolie 的 `cost_events`。rtk 的省 token 效果在此链路体现(rtk L2 装进沙箱后,execute 内部命令输出被压缩 → token 下降 → usage 下降)。

---

## 2. P2+ — 多 agent 讨论编排(群策群力)

### 结论:🟡 底层原语齐全,缺一个"讨论编排层"需新建(+可选 1 个新交互类型)

### coolie 已有原语(直接复用)
- **评论**:`issue_comments`(`authorAgentId` / `createdByRunId`);service `issueService.addComment`。
- **@唤醒**:评论体 `[@名字](agent://<agentId>)` → 触发 `issue_comment_mentioned` 唤醒被点名 agent,**且不转移 issue 所有权**(wake-queue 机制)。
- **结构化交互**:`issue_thread_interactions`,6 种 kind(`suggest_tasks / ask_user_questions / request_confirmation / request_checkbox_confirmation / request_item_verdicts / connection_intent`),带 `createdByAgentId` / `addresseeAgentId`,resolver policy(`anyone / not_creator / human_only`)、continuation policy(`wake_assignee` 等)。
- **子任务委派**:child issue + `assigneeAgentId` + `parentId` + 完成回唤父任务。
- **单一 assignee 不冲突**:assignee 锁的是"谁执行/改工作区",不是"谁参与讨论"。讨论并行、执行串行(checkout/`sharedWorkspaceConcurrency`)。

### 需新开发
1. **讨论编排层(核心)**:一个协调器,负责
   - 选定参与讨论的 agents(议题 + 参与者列表 + 模式)
   - 按顺序/并发唤醒他们在同一 issue 上发言(经评论 + @唤醒)
   - 判定讨论收敛(轮次上限 / 共识达成 / 主持人裁决)
   - 把结论落成 assignee 的执行动作或子任务
   > 建在 comments + mention-wake + thread-interactions 之上,逻辑自研。
2. **(可选)新交互类型**:若需"辩论/投票/共识"语义,现有 6 种不够,新增 `kind`(如 `agent_deliberation` / `request_agent_opinions`)+ payload/result schema + resolver。
3. **(可选)定向 resolver**:现有 policy 无"指定某 agent 才能 resolve";靠 `addresseeAgentId` + wake 可定向唤醒,若要授权层强约束需扩展 policy。

### 与原系统的对应
- DigitalStaff 的 `TeamConversationDriver`(群聊内核)→ 迁移为"讨论编排层"的实现(clean-room 重写,不搬代码);对外表现为一次多 agent 围绕 issue 的收敛讨论。

---

## 3. P4 — 流程中心(低代码工作流)= 大型 plugin

### 结论:❌ 不能扩展 coolie 的 pipelines/routines;✅ 应作为全新大型 plugin,plugin SDK 完整支持

### 为什么不扩展 pipelines(真实代码核实)
- coolie `pipelines` = **看板式案件流转**:`pipeline_stages.kind` 仅 `working/review/done/cancelled`(状态,非计算节点);`pipeline_transitions` 是"允许的状态迁移",不是数据流边;阶段唯一自动化动作是 `run_routine`(`pipelineStageOnEnterSchema.type = "run_routine"`)。
- `routines` = **触发式重复任务调度**(triggers: `schedule/webhook/api`),快照无 steps/nodes,是单任务而非多步编排。
- 前端**无任何 DAG/画布库**(无 reactflow/xyflow/dagre;Pipelines.tsx 用 `@dnd-kit` 看板拖拽,`mermaid` 只渲染静态图)。
- → 领域模型根本不同(状态机 vs 计算 DAG);强扩会污染已成熟功能(有 CLI/迁移 0113~0115/测试固化)。

### Design:流程中心 plugin(plugin SDK 支持,已核实)
一个声明了以下能力的大型 plugin(`packages/plugins/sdk`):
- **前端画布整页**:`ui.page.register`(官方点名支持 "multi-step workflows"),页内自带 **reactflow** 画布 + 节点库 + AI 编排面板。
- **自己的数据表**:`database.namespace.*` — 独立 Postgres schema 命名空间 + 迁移账本(`plugin_database_namespaces` / `plugin_migrations`),存 `workflow / nodes / edges / runs` 等表。
- **后端执行/触发**:
  - `api.routes.register`(`/api/plugins/:id/api/*`)— 保存/运行工作流接口,供画布页调用
  - `jobs.schedule`(cron 定时触发)、`webhooks.receive`(外部触发)
  - 节点执行能力:`agents.invoke`(LLM/agent 节点、群聊专家节点)、`http.outbound`(HTTP 节点)、`issues.*`(编排子任务)、`state.*`、`secrets`
- **执行引擎**:plugin 内自研节点解释器(输入→节点→输出→连边),节点类型库(userInput / llm / agent / 群聊专家 / http / code / condition / output…),复用 coolie 的 agent/issue 基座作为"重节点"的执行后端。

### 节点 ↔ 下层能力的接线(这条链的关键)
| 流程中心节点 | 落到 coolie |
|---|---|
| agent 节点 / LLM 节点 | `ctx.agents.invoke` → 最终可路由到 P2 的 `coolie_native` adapter |
| **群聊专家节点** | 调 **P2+ 讨论编排层**(多 agent 围绕一个 issue 群策群力),取 `finalAnswer/transcript` 作节点输出 |
| HTTP 节点 | `ctx.http.outbound` |
| 子任务/编排节点 | `ctx.issues.*`(建 child issue、blocker、subtree) |
| 定时/webhook 触发 | plugin `jobs` / `webhooks` |

### plugin 现状注意(SDK README 声明的 caveat)
- 当前 plugin worker/UI 被当作**受信任代码**(非沙箱边界);动态安装更适合单节点持久化部署,多节点云部署需共享构件分发;`ctx.assets` 暂不支持。→ 对"内部受信任的流程中心 plugin"可接受。

---

## 4. 分期与依赖

```
P2  native adapter        ← 先做,独立可验证(接一个 agent 用 native 引擎完成一个真实 task)
     │
P3  沙箱预览 provider      ← 让 P2 真正跑起来 + rtk L2 在此落地
     │
P2+ 讨论编排层            ← 依赖 P2(参与讨论的 agent 用 native adapter 执行)
     │
P4  流程中心 plugin        ← 依赖 P2/P2+(agent 节点、群聊专家节点接下层)
```

建议顺序:**P2 → P3 → P2+ → P4**。每阶段"真实可用"验收(真实 DB/API/跑通,不做假 Mock)。

## 5. 需新开发清单(汇总)
- P2:`coolie_native` adapter(ServerAdapterModule 实现)+ 注册
- P2+:讨论编排层(协调器);可选新 interaction kind;可选定向 resolver policy
- P3:native 沙箱作为 sandbox-provider 插件(+ rtk 内置)
- P4:流程中心 plugin(reactflow 画布页 + 自有数据表 + 执行引擎 + 节点库 + AI 生成)

## 6. 风险
- native 引擎"长时多智能体循环"映射到"单 execute + 回调 + 续跑"需仔细设计,避免把复杂状态全塞进黑盒 execute。
- 讨论编排的"收敛判定"要有硬上限(轮次/预算),防止多 agent 无限对话烧 token。
- P4 是重资产,建议独立立项、分子阶段(先画布+存取,再执行引擎,再 AI 生成)。
- 全程保 `master` 不动,改动走 feature 分支;不搬旧代码实现。

---

## 核实证据(真实文件路径)
- adapter 契约:`packages/adapter-utils/src/types.ts`(ServerAdapterModule / AdapterExecutionContext / AdapterExecutionResult)
- adapter 注册:`server/src/adapters/registry.ts`、`server/src/adapters/index.ts`、`server/src/adapters/plugin-loader.ts`;类型校验 `server/src/routes/agents.ts`(assertKnownAdapterType)、`packages/shared/src/adapter-type.ts`
- 讨论原语:`packages/db/src/schema/issue_comments.ts`、`packages/db/src/schema/issue_thread_interactions.ts`、`packages/shared/src/constants.ts`(ISSUE_THREAD_INTERACTION_KINDS)、`server/src/services/issues.ts`(addComment / findMentionedAgents)、`server/src/modules/wake-queue/`
- pipelines/routines(证明不能直接当流程中心):`packages/db/src/schema/pipelines.ts`(stage kind = working/review/done/cancelled)、`packages/shared/src/validators/pipeline.ts`(onEnter = run_routine)、`packages/db/src/schema/pipeline_cases.ts`、`packages/db/src/schema/routines.ts`(triggers = schedule/webhook/api)
- plugin SDK 能力:`packages/plugins/sdk/README.md`、`packages/db/src/schema/plugin_database.ts`(命名空间+迁移账本)

*本文件为规划阶段产物,不含产品代码,不含旧系统实现来源。*
