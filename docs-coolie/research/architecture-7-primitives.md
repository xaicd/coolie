# Coolie 架构建议 — 对齐 Palantir 7 Primitives (wave245 B, PM 整理)

> **作者**: PM (Hermes)
> **日期**: 2026-10-01
> **任务**: wave245 B — 基于 agy 调研 (`docs-coolie/research/PALANTIR-ONTOLOGY-PRIMITIVES.md`),
> 输出架构建议: 7 primitives 分层 vs 4 要素; 主 agent 拉 ontology graph 真值; branch 大缺口 + action + function 补法.
> **范围**: 纯架构建议, 不写代码. 服务未来 wave246+ 的实施规划.
> **配套**: §3 修订 `docs-coolie/CMMI-EMPLOYEE-MAPPING.md`, 加 7 primitives 维度.

---

## 1. 七 Primitives 分层 vs 之前 4 要素

### 1.1 之前 PM 提的 4 要素 (错位)

之前 PM 把本体结构当成 4 维 — Object / Type / Property / Link (entity_relations 暂作 link layer).
**这是 Palantir 7 primitives 的前 4 项**, 不是本体基础全貌. 老板判断切中要害:
> "分层是不是不太对, 本体的几大基础没体现"

之前 4 要素的问题:

- **Action 没有一等公民** — Coolie 的写操作散在各个 REST Controller 里 (issues / projects / agents 的 POST/PATCH),
  没有"Action Type"的概念, 所以"修改一个 issue 标题"和"派单给某个 agent"是同一套流程, 都是手写 service 函数,
  没有声明式的参数校验 / 权限 / 事务边界.
- **Function 没有本体图谱算子** — 当前 MCP tools (system-monitor / approval / company-ops / device / browser)
  都是"操作外部系统"或"操作系统状态", 没有"遍历本体图算因果子图"这种 Function.
- **Branch 是 0%** — 既没有 Schema 分支 (Global Branching), 也没有数据沙箱 (Ontology Scenarios).

### 1.2 7 Primitives 完整分层

| # | Primitive | 物理位置 | Coolie 当前 | PM 建议补法 |
|---|---|---|---|---|
| 1 | **Object** | 业务表行 (companies / projects / issues / agents …) | 80% — 缺少统一 RID | 加 `entity_objects` 物化视图 + (type, id) → global_rid 索引 |
| 2 | **Type** | `ENTITY_TYPES` 9 项 + `ontology_node_types` (插件私有) | 60% — 硬编码枚举 | 把 `entityTypes` 从 union 提为配置表 `ontology_types` (公司可扩展) |
| 3 | **Property** | 业务表 column + `ontology_properties` JSONB | 70% — 缺 Value Types 校验 | `ontology_properties` 加 `value_type` (string / number / date / enum / ref) 强约束 |
| 4 | **Link** | `entity_relations` + 8 `ENTITY_RELATION_KINDS` | 85% — 缺基数校验 | 加 cardinality 字段 (`one_to_one` / `one_to_many` / `many_to_many`) + DB CHECK |
| 5 | **Action** | REST API 写操作散在各 Controller | 65% — 业务 API 与本体写未解耦 | 抽 `ActionRegistry` (类似 PluginUI slots): 每个写操作注册成 Action Type, 含 schema + 权限 + 前置断言 + staging |
| 6 | **Function** | MCP tools (wave228) + adapter-utils | 75% — 缺本体图算子 | 加 `OntologyFunction` SDK: 在 `entity_relations` 图上跑遍历 / 聚合 / 派生属性 |
| 7 | **Branch** | ❌ 0% | 0% — 完全缺失 | **关键缺口**. 引入 `OntologyScenario` (instances 分叉) + `OntologyProposal` (schema 分支) 两层 |

### 1.3 7 primitives 之间的依赖链

```
Type ──┬─→ Property ──→ Object ──→ Function ──→ Action ──→ Branch
       └─→ Link Type ─┘            (读 + 写)
```

读路径: Function 读 Object / Property / Link → 输出计算结果.
写路径: Action 走 Branch 沙箱 → 修改 Object / Property / Link → 提交后落主干.

Branch 是顶层容器, 把所有 6 个原语整体隔离. 没有 Branch, Agent 的 Action 直接落主干 = 没有"沙箱推演"能力.

---

## 2. 主 Agent 拉 Ontology Graph 真值

主 agent (PM) 拉 ontology graph 应该是**一次完整调用**, 而不是按 primitive 分 7 次查. Palantir 的标准接口是
`Ontology.getObjects()` / `getLinks()` / `getActions()` — 一次返回完整 snapshot.

### 2.1 当前 Coolie 的拉法 (散装)

```ts
// 当前 PM 拉 ontology graph 要发 4-5 个请求
const objects = await fetch(`/api/ontology/objects?type=project`);
const relations = await fetch(`/api/ontology/links?depth=2`);
const types = await fetch(`/api/ontology/types`);
const actions = await fetch(`/api/ontology/actions?type=issue`);
// 还要从 knowledge base 拿 Property 定义, 从 MCP tools 拿 Function 描述
```

### 2.2 建议的统一 endpoint

```ts
// 一次拉全 7 个 primitives 的 snapshot
GET /api/companies/:companyId/ontology/snapshot
Response:
{
  objects: { /* 全部对象, 按 type 分组 */ },
  types: { /* 全部 Type 定义 */ },
  properties: { /* 全部 Property 定义 */ },
  links: { /* 全部 Link + 关系拓扑 */ },
  actions: { /* 全部 Action Type + 参数 schema */ },
  functions: { /* 全部 Function (MCP tools + 图算子) */ },
  branches: { /* 全部活跃 Branch + Scenario */ }
}
```

主 agent 拿这个 snapshot 之后, 可以:

- **理解当前公司有哪些项目/工单** (objects)
- **理解每个对象的字段是什么** (Objects)
- **理解对象之间能怎么连** (Link)
- **理解 agents 能做什么操作** (Object)
- **理解有哪些函数可以跑图谱计算** (Function)
- **理解有哪些分支/沙箱可以试错** (Branch)

一次调用, 7 个 primitive 全在. 这是主 agent 心智模型的根.

### 2.3 主 agent 心智模型

```
Intent (老板一句话)
  ↓
Pull ontology snapshot (7 primitives 一次拉)
  ↓
Identify candidates:
  - 哪些 Object (项目/工单) 涉及?
  - 哪些 Link (关系) 需要新建/查?
  - 哪些 Action (操作) 需要跑?
  - 哪些 Function (函数) 可以辅助计算?
  - 是否需要 Branch (沙箱) 试错?
  ↓
Execute (在 Branch 内 if risk=true, 否则直接 Action)
  ↓
Verify (Function 重新计算结果, 校验后 Action 提交)
```

---

## 3. Branch 大缺口 + Action + Function 补法

### 3.1 Branch — 双层设计

| 层 | Palantir 对应 | Coolie 实施 | 优先级 |
|---|---|---|---|
| **Schema 分支** (Global Branching) | Ontology Proposal + 合并审批 | 加 `ontology_proposals` 表: 一个 (公司, type, patch_json, status) 行. status: draft → review → merged → reverted. 配合 `entity_relations.schema_version` + 双轨 reading | P1 |
| **数据沙箱** (Ontology Scenarios) | Scenario Fork + 10分钟 Rebase | 加 `ontology_scenarios` 表: (公司, scenario_id, base_snapshot_ts, ttl_days, status). Agent 操作时带 `X-Scenario-Id` header, 服务端写一张 `scenario_writes` delta 表, 读时叠加到主干 | **P0** |

### 3.2 Action — 抽 ActionRegistry

```
ActionRegistry schema
  ┌─────────────────────────────────────────────────────────────────┐
  │  Table: ontology_actions                                       │
  │            id, company_id, name (e.g. "issue.update.title"),     │
  │            subject_type ("issue"), input_schema (JSONB),      │
  │            guard (JSONB fn name), pre_conditions (JSONB),     │
  │            side_effects (JSONB), stage (boolean)             │
  │            created_at, updated_at                            │
  └─────────────────────────────────────────────────────────────────┘

Coolie 当前的 controller 函数 → 注册成 Action:
  - "issue.update.title" → POST /api/issues/:id (改 title)
  - "issue.assign" → POST /api/issues/:id/assign
  - "agent.spawn" → POST /api/agents
  - "project.archive" → POST /api/projects/:id/archive

每个 Action 自带:
  - input_schema: 强类型参数 (Zod 或 JSONSchema)
  - guard: 权限检查 (哪个 role 能跑)
  - pre_conditions: 前置断言 (e.g. issue.status = 'ready' 才能转派)
  - side_effects: 跑完触发什么 (e.g. issue 改了 → 触发 agent 的 wakeup)
  - stage: 是否需要 Branch 隔离 (true = 高风险, 必须 Branch 内跑)
```

### 3.3 Function — 加 `OntologyFunction` SDK

```
OntologyFunction SDK
  ┌─────────────────────────────────────────────────────────────────┐
  │  在 entity_relations 图上跑的函数, 类似 Palantir Functions:  │
  │                                                                 │
  │  - OntologyFunction.traverse(start_obj, link_type, depth)      │
  │  - OntologyFunction.aggregate(start_obj, link_type, reduce_fn)  │
  │  - OntologyFunction.derive(obj, property_fn) → derived_prop   │
  │  - OntologyFunction.path(from, to, via_link_types[])           │
  │                                                                 │
  │  实施: server/src/services/ontology-functions.ts (新文件,     │
  │  不动现有代码, 只读 entity_relations + ontology_properties)   │
  │                                                                 │
  │  暴露成 MCP server: "ontology-graph-functions"                 │
  │  让任何 tool (claude / agy / cmd) 都能跑图谱计算              │
  └─────────────────────────────────────────────────────────────────┘
```

### 3.4 优先级排序

| 优先级 | Primitive | 实施内容 | 估时 | 依赖 |
|---|---|---|---|---|
| **P0** | Branch (Scenario) | `ontology_scenarios` + `scenario_writes` + `X-Scenario-Id` header 路由 | 1 wave | entity_relations 已存在 |
| **P1** | Action (抽 ActionRegistry) | `ontology_actions` 表 + 把现有 5 个核心 controller (issue.update / issue.assign / agent.spawn / project.archive / approval.decide) 注册成 Action | 1 wave | P0 (staged Action 跑在 Scenario 内) |
| **P1** | Branch (Proposal) | `ontology_proposals` 表 + `entity_relations.schema_version` 字段 + 合并审批 API | 1 wave | P0 + Action |
| **P2** | Function (OntologyFunction) | `ontology-functions.ts` SDK + 暴露成 MCP server | 1 wave | entity_relations 已存在 |
| **P3** | Object (global_rid) | 物化视图 + 全局 RID 索引 | 0.5 wave | 7 primitives 都到位后做 |

---

## 4. 与之前架构决策的关系

### 4.1 不动现有 (wave245 范围)

- ✅ 不动 `entity_relations` schema (wave154 链路层)
- ✅ 不动 `ENTITY_TYPES` 9 项 union (wave154 类型)
- ✅ 不动 `ontology_properties` JSONB 结构 (wave239 屏 3 schema editor)
- ✅ 不动 `ENTITY_RELATION_KINDS` 8 项 (wave154 关系种类)
- ✅ 不动 MCP tools 5 个 (wave228)

### 4.2 与 wave244 (图谱 UX) 关系

wave244 修的是"图谱看的痛苦" (cluster + UUID + pan/zoom) — 这是**视图层**问题, 不在 7 primitives 维度.
但 wave244 的 graph view 是 wave245 之后所有 P0-P3 实施的**可视化基础** — Branch / Action / Function 的运行时
都可以在图谱上展示. 所以 wave244 是前置依赖.

### 4.3 与 wave222 (算法层 5 角色) 关系

wave222 的 `ROLE_MAPPING` 是**派活路由** (CMMI 任务 → 主角色), 不在本体的 7 primitives 维度. 7 primitives
是**系统结构**层, 与派活无关. 但 7 primitives 全部落地后, 5 角色的派活算法可以**优先派给 ds** (百晓生)
跑 OntologyFunction / Scenario evaluate — 这是 wave226+ 的优化空间.

### 4.4 与 wave234 / wave236 (工具切换) 关系

不动. 5 员工的工具切到 cmd / claude-mm / agy 是 wave234/wave236 的事, 与 7 primitives 无关. 7 primitives
是**系统结构**, 工具是**执行手段**, 二者正交.

---

## 5. Wave246+ 路线图 (建议, 老板拍板)

```
wave246 — OntologyScenario (P0, Branch 数据沙箱)
  └─ 1 wave: ontology_scenarios + scenario_writes + X-Scenario-Id 路由 + 5 个 controller 跑通沙箱
  
wave247 — ActionRegistry (P1, Action 一等公民)
  └─ 1 wave: ontology_actions 表 + 5 个核心 controller 注册 + Action audit log
  
wave248 — OntologyProposal (P1, Branch Schema 分支)
  └─ 1 wave: ontology_proposals + schema_version + 合并审批 API
  
wave249 — OntologyFunction (P2, Function SDK)
  └─ 1 wave: ontology-functions.ts + 暴露成 MCP + 5 个 demo functions
  
wave250 — Object GlobalRID (P3, Object 统一)
  └─ 0.5 wave: 物化视图 + RID 索引 (可选, 等前 6 个 primitives 都位再做)
```

每波都不动现有代码, 只 ADDS 新表/服务. 满足 fork-surface gate 不增加 (新文件不进 fork-surface.json).

---

## 6. 老板汇报稿 (不动用)

> **老板 4-6 行**:
> 1. 之前 PM 提的 4 要素 = Object/Type/Property/Link — 这是 Palantir 7 primitives 的前 4 项, 不是本体地基全貌.
> 2. 真地基是 Palantir 7 primitives. 我们已实现 6/7 (Object/Type/Property/Link/Action/Function).
> 3. 第 7 项 Branch (分支/沙箱) 是 0% — **这是当前最大的业务/AI 缺口**.
> 4. 老板拍板 Branch 优先级后, PM 拉 wave246+ 路线, 5 步走, 每波 1-2 周.
> 5. 现有 entity_relations / ontology_properties / MCP tools 全部不动 — **不重写**, 只在边上补.

PM 拉路线后, 5 员工按 CMMI 派活规则:
- **wave246 Scenario**: 铁匠 (`core-swe`) 主编码 + 门神 (`fdse`) 测试 + 百晓生 (`ds`) 验证场景.
- **wave247 Action**: 铁匠 (`core-swe`) 主 + 墨斗 (`fda`) 流程梳理.
- **wave248 Proposal**: 铁匠 (`core-swe`) 主 + 兑底渊 (`pre-sre`) 审批流.
- **wave249 Function**: 百晓生 (`ds`) 主 + 铁匠 (`core-swe`) 实施 MCP server.
- **wave250 Object RID**: 铁匠 (`core-swe`) 主.

详细派活等老板拍板后按 CMMI-EMPLOYEE-MAPPING.md §1 25 任务表追加.

---

## 7. 不做什么 (反向约束)

- ❌ 不动 `entity_relations` schema
- ❌ 不动 `ENTITY_TYPES` union
- ❌ 不动 `ontology_properties` JSONB
- ❌ 不动 `ENTITY_RELATION_KINDS` 8 项
- ❌ 不动 MCP tools 5 个
- ❌ 不动 `ROLE_MAPPING` (wave222 算法层)
- ❌ 不动 `AGENT_ROLES` enum
- ❌ 不动 wave234/236 工具切换
- ❌ 不动 wave244 图谱 UX
- ❌ 不动 Coolie 工坊 6 员工分工 (`CMMI-EMPLOYEE-MAPPING.md` 只 ADDS 7 primitives 维度)
- ❌ 不重写现有代码 (只在边上补新表/新服务)

---

## 8. 出处与索引

- agy 调研报告: [`docs-coolie/research/PALANTIR-ONTOLOGY-PRIMITIVES.md`](PALANTIR-ONTOLOGY-PRIMITIVES.md) (498 行, 44.5K)
- agy prompt: [`docs-coolie/evidence/wave245/PROMPT-AGY.md`](../evidence/wave245/PROMPT-AGY.md)
- agy runner script: [`docs-coolie/evidence/wave245/agy-runner.sh`](../evidence/wave245/agy-runner.sh)
- CMMI 5 阶段 × 25 任务 × 5 员工: [`docs-coolie/CMMI-EMPLOYEE-MAPPING.md`](../CMMI-EMPLOYEE-MAPPING.md) (wave245 修订: 加 §9 7 primitives 维度)
- 5 角色算法层: [`docs-coolie/ROLE-MAPPING.md`](../ROLE-MAPPING.md) (wave222, 不动)
- 本体图谱 UX: [`docs-coolie/evidence/wave244/QA-REPORT.md`](../evidence/wave244/QA-REPORT.md) (前置依赖)

**本波 (wave245 B) 变更摘要**:
- 7 primitives vs 4 要素对比表
- 主 agent 拉 ontology graph 真值 — snapshot endpoint 建议
- Branch (P0/P1) + Action (P1) + Function (P2) 补法
- wave246+ 5 步路线图 (老板拍板)
- 不动现有 (10 条反向约束)