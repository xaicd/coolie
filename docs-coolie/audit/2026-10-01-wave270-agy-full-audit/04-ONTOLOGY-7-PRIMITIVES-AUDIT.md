# Wave270 全量审计 4/4 — Palantir 7 Primitives 真对应

**审计员**: agy (wave270 audit 4/4)
**审计目标**: Coolie / Paperclip fork 在 7 primitives (Object / Type / Property / Link / Action / Function / Branch) 上的真对应 + App 端使用情况
**老板原话**: 「让agy全量审计导航任务, 资产页下所有功能」 + 「让agy全量审计 Palantir 7 primitives 真对应」
**审计时间**: 2026-10-01
**前置条件**: 不改任何代码, 不 git add

---

## 0. TL;DR — 老板这段话最关键的 3 句

1. **PM wave261 的「5 层下钻」(L0 公司 / L1 域 / L2 类型 / L3 实例 / L4 属性) ≠ Palantir 7 primitives**。
   PM 自己造的 5 层 UI 层次是真做的, 但只能勉强对上 Type(3 个 chip) + Object(实例) + Property(属性定义) 这 3 个 primitive。
   Link / Action / Function / Branch 4 个 primitive **完全没有真对应的 UI 入口**, App 端连一个 icon 都没给。

2. **wave250 在数据库里造了 6 张新表 (`ontology_objects / types / links / functions / branches / actions_view`) + 7 张迁移,但 server 端 0 行代码读 / 写它们**。grep 全仓, 唯一出现的引用是 `packages/db/src/schema/index.ts:68-74` 那一行 `export {} from "./ontology_xxx.js"`。`entity_relations` (wave154 旧表) 仍是 link 的 source of truth。

3. **老板问的「Branch 还是没做?」 — 答: 真没做**。`ontology_branches` 表存在, 7 字段定义齐全, 但没有 route, 没有 service, 没有 UI, 没有 migration backfill。Action / Function 同样状态。

---

## 1. 7 Primitives 对应表

| # | Primitive | 表名 | 关键字段 | 数据行数估计 | server route | App 屏 | 真对应? |
|---|-----------|------|---------|------------|-------------|--------|---------|
| 1 | Object | `ontology_objects` | id, typeId, externalId, displayLabel, props | **空 (0) | surrogate only** | ❌ | `OntologyDomainListScreen.tsx:623-665` 间接用「L3 实例」显示 | **假对应** — 用 `issues / projects / agents` 等源表 hydrate, 真对应 Object 这层没东西 |
| 2 | Type | `ontology_types` | id, typeKey, displayName, schemaRef, pluginId | **空 (0) | 插件 DB 持有真值** | ❌ | `OntologyDomainListScreen.tsx:569-619`「L2 类型」chip | **半对应** — 5 个 `entityType` 字符串硬编码 (`ontology-graph.ts:503-511` `ENTITY_TYPES`), 不用 `ontology_types` 表 |
| 3 | Property | `ontology_properties` | id, typeId, properties(jsonb), schemaVersion | **≈ 实际写过的 type 数 (estimate 10-100)** | ✅ `/api/companies/:id/ontology/types/:typeId/properties` (GET/PATCH) | ✅ `OntologySchemaEditorScreen.tsx:63-392` 屏 3 全功能 | **真对应** — 唯一一个有完整 read/write/service/UI 的 primitive |
| 4 | Link | `ontology_links` + `entity_relations` | src_object_id, target_object_id, link_type, props | **≈ 0 (新表空) ; entity_relations 真在跑 (~75 节点 ~2100 边, 见 `ontology-graph.ts:33-37`)** | ✅ `/api/companies/:id/ontology/graph` (走的是 `entity_relations`) | ✅ `OntologyGraphWorkbenchScreen.tsx:51-451` 屏 4 | **假对应** — 新表空, 旧表在跑, owner comment `ontology_links.ts:23-31` 明确说 "deprecated" |
| 5 | Action | `ontology_actions_view` (VIEW) | id, action_type, actor_id, subject_id, status, props | **view 由 3 表 UNION: issues / issue_recovery_actions / tool_action_deliveries (≈ 全表行数)** | ❌ | ❌ | **假对应** — view SQL 写了, server 从不查, App 不消费 |
| 6 | Function | `ontology_functions` | id, name, inputs, outputs, pluginId | **0** | ❌ | ❌ | **没做** — 表在, plugin 字段都有, 0 行写入 |
| 7 | Branch | `ontology_branches` | id, name, parentType, childType, branchingStrategy, parentObjectId, metadata | **0** | ❌ | ❌ | **没做** — 老板问的就是这个, 表在, 真没做 |

**总评**: 7 个里, 1 个真对应 (Property), 1 个真在用旧实现 (Link 用 `entity_relations`), 2 个半对应 (Type 用硬编码 / Object 间接用源表), 3 个完全没做 (Action / Function / Branch)。

---

## 2. 每个 primitive 深挖

### 2.1 Object (ontology_objects)

**Schema 定义** (`packages/db/src/schema/ontology_objects.ts:34-56`):
```
id, companyId, typeId, externalId, displayLabel, props, createdAt, updatedAt
uniqueIndex(companyId, typeId, externalId)
```
**migration**: `9014_add_ontology_objects.sql` 已生成

**Server 侧引用**: grep 全仓, 只有 `schema/index.ts:69` 一行 `export {} from "./ontology_objects.js"`。
**没有 service / 没有 route / 没有 INSERT / 没有 SELECT**。

**App 侧引用**: **0**。`OntologyDomainListScreen.tsx:623-665` 的 L3 实例列表 (`useEffect` at `:181-201`) 用的是 `listOntologyInstances` API, 服务端 `ontology-extras.ts:82-237` 用的是 `projects / issues / agents / ...` 这些源表 hydrate (`ENTITY_TABLE` map at `:46-59`), **完全跳过 `ontology_objects` 表**。

**跟 entity_relations 区别**:
- `entity_relations` 是 source-of-truth 的 link 表, srcType/targetType 用 text 标识, srcId/targetId 是 uuid, 现有所有 service (`ontology-graph.ts` 全文) 都从这张表读
- `ontology_objects` 应该有自己一行表示每个 Object, 但实际上 0 行写入, 只是个空 schema placeholder
- 概念上 `ontology_links.src_object_id` 应该引用 `ontology_objects.id` (`ontology_links.ts:11-21` comment 写得很明确), 但因为 ontology_objects 表空, 这个引用关系**永远失效**

**真对应?**: ❌ 假对应。表在, 0 行, 0 引用。老板截图里的「实例」实际是 issues/projects 等源表的 alias, 不是 Object row。

---

### 2.2 Type (ontology_types)

**Schema 定义** (`packages/db/src/schema/ontology_types.ts:33-51`):
```
id, companyId, typeKey, displayName, schemaRef, pluginId, source, createdAt
uniqueIndex(companyId, typeKey)
```
**migration**: `9015_add_ontology_types.sql` 已生成

**Server 侧引用**: grep 全仓, 只有 `schema/index.ts:70` 一行 export。
**没有 service / 没有 route / 0 INSERT / 0 SELECT**。

**真值在哪**: `ontology_types.ts:13-31` 的 schema docstring 说:
> The ontology plugin (`ontology_node_types`) already keeps type rows in its own database; this table is the control plane's mirror

所以真值在 `paperclipai.plugin-ontology` 插件自己的 DB, `ontology_types` 是镜像。但**这个镜像从来没被同步过** — server 从不调用插件去刷新它, 它就是空的。

**App 侧引用**:
- `OntologyDomainListScreen.tsx:185-201` L3 实例加载: `listOntologyInstances(companyId, { entityType: ctx.entityType.entityType })` — 注意这里 `typeId` 被当成 **entityType 字符串**用, 实际上没有用到 `ontology_types.id`
- `OntologyDomainListScreen.tsx:204-224` L4 schema 加载: `getOntologyTypeProperties(companyId, ctx.entityType.entityType)` — 同样把 entityType 字符串当 typeId 用, server `ontology-extras.ts:256-269` 也只把它当 string 比对 `typeId` 列

**跟 Object 的 typeId 字段区别**:
- Object 的 `typeId` 字段应该指向 `ontology_types.id` (`ontology_objects.ts:24-25` comment), 但 Object 表 0 行, 所以**没有实际数据**
- App / Server 实际用的是 `EntityType` 字符串联合类型 (e.g. `'project' | 'issue' | 'agent' | ...`), 见 `packages/shared/src/ontology/`, `@paperclipai/shared` 里的 `ENTITY_TYPES` 常量 (`ontology-graph.ts:28`), `ontology-graph.ts:848-870` 的 `TYPE_TO_DOMAIN` map, 以及 `ontology-extras.ts:46-71` 的 `ENTITY_TABLE` / `ENTITY_LABEL_COLUMN` map
- 也就是说: **Type 的真值不是 `ontology_types` 表, 而是 TypeScript 编译期常量**

**真对应?**: ⚠️ 半对应。5 个 entityType 字符串硬编码在 server, 跟 Palantir 概念里 Type 是数据驱动可注册的松耦; **PM 嘴里的 L2 类型其实是一组 schema 字符串字面量**。

---

### 2.3 Property (ontology_properties) — 唯一真对应

**Schema 定义** (`packages/db/src/schema/ontology_properties.ts:39-54`):
```
id, companyId, typeId, properties(jsonb), schemaVersion, updatedAt
uniqueIndex(companyId, typeId)
```
**字段细节** (`OntologyPropertyEntry` at `:56-78`):
- key (字段名)
- 类型 (显示类型字符串如 "String"/"Ref"/...)
- typeRef (引用其他 primitive 的 type_key)
- sampleValue (示例值)
- sample (legacy 示例字符串)
- required (是否必填)

**migration**: `9013_add_ontology_properties.sql` (基础) + `9016_extend_ontology_properties.sql` (扩展)

**Server 侧引用**:
- `server/src/services/ontology-extras.ts:247-321` `ontologyPropertiesService` 有完整 read/write 实现 (getProperties / updateProperties)
- `server/src/routes/ontology-extras.ts:52-89` route 完整:
  - GET `/api/companies/:companyId/ontology/types/:typeId/properties`
  - PATCH `/api/companies/:companyId/ontology/types/:typeId/properties` (assertBoard + logActivity)
- **唯一一个有完整 CRUD + activity log + board permission 的 primitive**

**App 侧引用**: `OntologySchemaEditorScreen.tsx:63-392` 屏 3:
- 屏 1 长按域 → 「编辑字段」 → 路由到这个屏 (`OntologyDomainListScreen.tsx:530-536`)
- 全屏字段 CRUD: add / edit / remove / save
- 7 种类型 chip: String / Enum / Ref / DateTime / Array / Number / Boolean (`OntologySchemaEditorScreen.tsx:336`)
- 服务端校验: key regex `/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/`, 64 entries max, 200 chars max sample

**跟 object 的 props jsonb 区别**:
- `ontology_objects.props` 是 **per-instance 字段值** (e.g. issue 显示名为 "订单 #123" 时的实际字符串)
- `ontology_properties.properties` 是 **per-type 字段定义** (e.g. 「订单」类型有一个 `displayName` 字段, 类型 String, 示例 "订单 #N")
- 两者是 schema / instance 的对应关系, **但 server 没真正串联它们** — `ontology_objects` 表空, `ontology_objects.props` 字段虽然定义了, 0 行写入

**真对应?**: ✅ 真对应。**这是 wave250 唯一做完的 primitive**。

---

### 2.4 Link (ontology_links) — 新表空, 旧表在跑

**Schema 定义 (新表)** (`ontology-links.ts:24-42`):
```
id, companyId, srcObjectId, targetObjectId, linkType, props, createdAt
3 个 index: company+src, company+target, company+linkType
```
**migration**: `9017_add_ontology_links.sql` 已生成

**Schema 定义 (旧表)** (`entity_relations.ts:33-67`):
```
id, companyId, srcType(text), srcId, relation(text), targetType(text), targetId, metadata, weight, createdByUserId, createdByAgentId, createdAt
uniqueIndex(companyId, srcType, srcId, relation, targetType, targetId)
```
**migration**: `9010_add_entity_relations.sql`

**Service 引用**:
- `ontology-graph.ts:225-243` `loadEdges` — **从 `entityRelations` 表读** (`from(entityRelations)`)
- `ontology-graph.ts:141-157` `recordEntityRelation` — **写入 `entityRelations` 表**
- `ontology-graph.ts:699-751` `stats` — group by `entityRelations.relation`
- `ontology-graph.ts:818-836` `summarizeLevels` — count `entityRelations` 行

**新表 `ontology_links`**: grep 全仓, **0 SELECT / 0 INSERT / 0 service / 0 route 引用**。

**Route 引用**:
- `GET /api/companies/:companyId/ontology/graph` → `ontology-graph.ts:39-55` (从 `entity_relations` 读)
- `GET /api/companies/:companyId/ontology/paths` → `ontology-graph.ts:57-64`
- `GET /api/companies/:companyId/ontology/stats` → `ontology-graph.ts:66-70`
- `GET /api/companies/:companyId/ontology/levels` → `ontology-graph.ts:78-82` (wave261)
- `POST /api/companies/:companyId/ontology/backfill` → `ontology-graph.ts:92-115` (写 `entity_relations`)
- **所有 5 个 route 全走 `entity_relations`**

**App 侧引用**:
- `OntologyGraphWorkbenchScreen.tsx:106-110` → `coolie.getOntologyGraph` (`clients/api-client/src/client.ts:1016-1034`) → server `/ontology/graph`
- `OntologyInstanceGraphScreen.tsx:127-131` → `coolie.getOntologyGraph` → server `/ontology/graph`
- `OntologyDomainListScreen.tsx:153` → `coolie.getOntologyLevels` → server `/ontology/levels`
- 全部走 entity_relations

**schema docstring 自承** (`ontology_links.ts:23-31`):
```
DEPRECATED (wave250)
Palantir 7-primitive alignment renamed this to ontology_links...
This row remains read-only: writers must go to ontology_links and the graph API reads from both, with the new table winning.
```
**注释说「new table winning」, 实际上代码完全没动, new table 是空表。**

**真对应?**: ❌ 假对应。真值在 `entity_relations` (wave154), `ontology_links` 是空表。**两个表并存**, 但**只有旧表被读写**, 新表是 wave250 commit 的"占位符"。

---

### 2.5 Action (ontology_actions_view) — 是 view 不是 table

**Schema 定义** (`ontology_actions_view.ts:1-46`):
```ts
export const ontologyActionsView = pgView("ontology_actions_view", {
  id, actionType, actorId, subjectId, status, props, companyId, createdAt
}).existing();
```

**为什么叫 view 不是 table** (`ontology_actions_view.ts:1-25` 注释):
> An `Action` is anything the system did, is doing, or has been asked to do. There is no single table — actions are scattered across the schema based on which subsystem owns the lifecycle. This view unions them into the one shape the ontology expects

**migration** (`9018_create_ontology_actions_view.sql:35-82`): `CREATE OR REPLACE VIEW` UNION 3 张表:
1. `issues` (action_type = 'issue') — props = `{title, projectId, kind=spec_kind}`
2. `issue_recovery_actions` (action_type = 'recovery') — props = `{kind, cause, fingerprint, nextAction, attemptCount}`
3. `tool_action_deliveries` (action_type = 'tool_action') — props = `{interactionId, actionRequestId, deliveredAt, createdAt}`

**Server 侧引用**: grep 全仓, **0 SELECT / 0 route / 0 service 引用**。

**App 侧引用**: **0**。

**跟 issues 表的关系**:
- 注释 (`ontology_actions_view.ts:5-25`) 明确说 "Action is the audit-layer projection, not a destination table" — view 是**只读**的, 写仍然去 source tables
- 这意味着 Action 不是独立的 entity, 是 3 个源表的 UNION projection
- **wave250 commit 给了它一个 schema 文件, 给了 migration, 但没给 service 没给 route 没给 UI**

**真对应?**: ❌ 假对应。SQL view 写好, 但 server 从不查它, App 从不消费它。

---

### 2.6 Function (ontology_functions) — 没做

**Schema 定义** (`ontology_functions.ts:31-49`):
```
id, companyId, name, description, inputs(jsonb), outputs(jsonb), pluginId, createdAt
uniqueIndex(companyId, name)
```
**migration**: `9019_add_ontology_functions.sql`

**schema docstring 期望作用** (`ontology-functions.ts:13-23`):
> A `Function` is a side-effecting verb an agent can invoke against the ontology (the classic example is "create issue" / "transition status" / "send approval"). Until now, MCP tools lived only as metadata JSON on the tool catalog; this table gives them a first-class row so the ontology's Function layer is real, and MCP gateways read their callable surface from here instead of from a metadata blob.

**Server 侧引用**: grep 全仓, **0 SELECT / 0 INSERT / 0 service / 0 route 引用**。

**App 侧引用**: **0**。

**跟 MCP tools / skills metadata 关系**:
- comment 说 "MCP gateways read their callable surface from here instead of from a metadata blob"
- 但实际 MCP tooling 在 `packages/db/src/schema/tool_access.ts` 那 28 张 `tool_*` 表 (`schema/index.ts:165-191`) — 这是真在跑的 source of truth
- `ontology_functions` 应该是 tool 系统的镜像, 但**镜像从来没被填充过**
- skill metadata 在 `packages/db/src/schema/company_skills.ts` + `packages/skills-catalog/`, 也独立于 `ontology_functions`

**真对应?**: ❌ **没做**。表在, schema 在, 但是 0 行、0 route、0 service。

---

### 2.7 Branch (ontology_branches) — 老板问的就是这个, 真没做

**Schema 定义** (`ontology_branches.ts:32-54`):
```
id, companyId, name, parentType, childType, branchingStrategy, parentObjectId, metadata, createdAt
2 个 index: company+parentType, company+branchingStrategy
```
**migration**: `9020_add_ontology_branches.sql`

**schema docstring 期望作用** (`ontology_branches.ts:13-31`):
> A `Branch` is a fork of one Type into a child Type under a named strategy (think "Issue → SandboxIssue (strategy=sandbox)"). The primary agent picks a Branch when dispatching work so a request lands on the right sibling type — `dev` runs on the live issue, `sandbox` runs on a copy, `prod` runs the promotion.

**老板原话** (审计任务发过来):
> 老板原话: "还是没做?"

**答**: **真没做**。

**证据**:
- grep `ontologyBranches` / `ontology_branches` 全仓, server 完全引用 0 行, App 完全引用 0 行
- 只有 `schema/index.ts:73` 一行 `export {} from "./ontology_branches.js"`
- `packages/db/src/migrations/meta/_journal.json:2123` 记录了 `9020_add_ontology_branches` 这个 migration tag (迁移已经跑过, 表已经在 DB 里)
- 但**没有 backfill migration** — `9020` 只 CREATE, 没数据 → 表是空的
- 没有任何 route (`/api/.../ontology/branches` 都不存在)
- 没有任何 service
- 没有任何 UI

**真对应?**: ❌ **没做**。schema + migration 在, table 在, 没数据没服务没 UI。**老板截图的 5 域 5 层下钻 (L0-L4) 完全没触及 Branch 这个 primitive**。

---

## 3. 跨表重复 / Source of Truth 审计

### 3.1 ontology_links vs entity_relations

**现状**:
- 两表并存
- `entity_relations` (wave154): 有数据, 有 service (`ontology-graph.ts` 全 220 行 `recordEntityRelation` / `loadEdges` / `buildView` / `findPaths` / `stats`), 有 route (`/ontology/graph` / `/paths` / `/stats` / `/levels` / `/backfill`), 有 App (屏 4 + 屏 2 + 屏 1)
- `ontology_links` (wave250): 空表, 0 service 引用, 0 route 引用, 0 App 引用

**哪份在写**: `entityRelations` 表 (`ontology-graph.ts:142-156` `recordEntityRelation`), `ontology_links` 0 行。
**哪份在读**: `entityRelations` 表 (5 个 service function 全用), `ontology_links` 0 行。

**Source of truth**: 100% `entity_relations`。

**问题**:
- `ontology_links` 的存在是 wave250 commit 给 Palantir 7-primitive 对齐**做了一个空表 placeholder**
- `ontology_objects` 表空, 所以 `ontology_links.src_object_id` 没有可引用的对象, **整个 link 新表生态是死链**
- backfill migration 在 `ontology_links.ts:21-22` comment 说 "The backfill of pre-wave250 edges lives in a follow-up migration once both Object sides exist" — 也就是说 wave250 commit 时就知道自己没做完, 等 Object 那边补 backfill, 再补 Link 的 backfill
- 现实是 Object 的 backfill **也没做**, 所以 Link 的 backfill **也做不出来**

### 3.2 ontology_actions_view vs issues

**现状**:
- `ontology_actions_view` 是 VIEW (只读)
- UNION 3 张表: `issues` + `issue_recovery_actions` + `tool_action_deliveries`
- 0 service 引用, 0 route 引用, 0 App 引用

**哪份在写**: 3 张源表 (`issues` / `issue_recovery_actions` / `tool_action_deliveries`) — 都是正常 CRUD
**哪份在读**: 没人读

**问题**:
- view 存在但 server 不查它
- 如果要做 Action log UI, 应该用这个 view 而不是再 UNION 一遍 server 端代码
- 现在的 audit log 在 `packages/db/src/schema/audit_log.ts` + `activity_log.ts` + `heartbeat_run_events.ts`, 三套独立日志系统, **跟 ontology Action 是同一概念的 3 套并行实现**

### 3.3 ontology_functions vs skills/mcp_tools

**现状**:
- `ontology_functions` (wave250) — 0 行
- MCP tools 真值在 `packages/db/src/schema/tool_access.ts` 28 张 `tool_*` 表 (e.g. `toolApplications`, `toolConnections`, `toolCatalogEntries`, `toolActionRequests`, `toolInvocations` 等)
- skills metadata 在 `packages/db/src/schema/company_skills.ts` + `packages/skills-catalog/`

**哪份在写**: `tool_*` 28 张表 + `company_skills` — 真在跑
**哪份在读**: 同上

**问题**:
- `ontology_functions` 应该是 MCP 工具的"本体层化"——一行表示一个 callable verb
- 但 `tool_*` 系统已经有一套完整的 schema / metadata / invocation / rate limit 路径, **`ontology_functions` 是重复且无规范化的数据**
- skills catalog 又是一套独立 system — **3 套并行实现, ontology_functions 是空的**

### 3.4 Source of Truth 总结表

| 概念 | 真值在 | 影子表 (wave250) | 影子表行数 | 影子表被读? | 影子表被写? |
|------|--------|-----------------|-----------|------------|------------|
| Object | issues / projects / agents 等源表 | ontology_objects | 0 | ❌ | ❌ |
| Type | TS 编译期 `EntityType` 联合类型 + 插件 DB | ontology_types | 0 | ❌ | ❌ |
| Property | ontology_properties | (无影子) | (自有) | ✅ (唯一真对应) | ✅ |
| Link | entity_relations | ontology_links | 0 | ❌ | ❌ |
| Action | issues + issue_recovery_actions + tool_action_deliveries (view) | ontology_actions_view (view) | 0 (view 没查询) | ❌ | (view 只读) |
| Function | tool_* (28 张) + company_skills | ontology_functions | 0 | ❌ | ❌ |
| Branch | (无真值) | ontology_branches | 0 | ❌ | ❌ |

**结论**: 7 个 primitive 里, **1 个真对应 (Property)**, **1 个真在用旧实现 (Link)**, **5 个完全没接通**。

---

## 4. App 端使用率

### 4.1 7 primitives 在 App 端有几条对应 UI?

| Primitive | 入口数 | 入口列表 |
|-----------|--------|---------|
| Object | 1 (间接) | `OntologyDomainListScreen.tsx:623-665` L3 实例 (但走源表, 不走 ontology_objects) |
| Type | 1 (间接) | `OntologyDomainListScreen.tsx:569-619` L2 类型 chip (但用 entityType 字面量, 不走 ontology_types) |
| Property | 2 | `OntologyDomainListScreen.tsx:204-224` L4 字段定义; `OntologySchemaEditorScreen.tsx:63-392` 屏 3 全屏编辑 |
| Link | 2 | `OntologyDomainListScreen.tsx:624-665` L3 实例列表 + `InstanceDetailCard` 1 跳邻居; `OntologyGraphWorkbenchScreen.tsx:51-451` 屏 4 graph canvas |
| Action | 0 | 无 |
| Function | 0 | 无 |
| Branch | 0 | 无 |

**总评**: App 端覆盖 4/7, 缺 3 个: **Action / Function / Branch**。

### 4.2 wave261 的 5 层下钻真映射到哪几个 primitive?

PM wave261 的 L0-L4 (摘自 `OntologyDomainListScreen.tsx:45-69` 注释):
```
L0 公司 — top of the breadcrumb
L1 域   — 5 chip-style domain buckets (业务 / 项目 / 员工 / 资产 / 模板)
L2 类型 — project / issue / spec / conversation / work_product / attachment / comment / agent
L3 实例 — drilldown into the rows of one entityType
L4 属性 — single instance's property bag + type's schema
```

**真对应 Palantir primitives**:
- L0 公司 — ❌ 跟 primitives 无关, 只是 company row
- L1 域 — ❌ "5 域" 是 hardcoded map (`ontology-graph.ts:848-858` `TYPE_TO_DOMAIN`), 不是 Type / IsAdmin
- L2 类型 — ⚠️ **勉强算 Type** — 8 个 entityType 字符串, 但这是 TS 联合类型字面量不是 ontology_types 行
- L3 实例 — ⚠️ **勉强算 Object** — 走源表 hydrate, 不走 ontology_objects
- L4 属性 — ✅ **真对应 Property** — 走 ontology_properties, 屏 3 可编辑

**PM 嘴里的 L0-L4 vs Palantir 真 primitives**:
- L0/L1/L4 → 跟 Palantir 概念不直接对应 (UI 层次 ≠ Ontology primitive)
- L2 → 半对应 Type (硬编码 8 个 entityType)
- L3 → 半对应 Object (走源表, 影子 Object 表空)
- 老板的 5 层 **只能勉强压上 3 个 primitive**, 缺的 4 个 Link/Action/Function/Branch 在 wave261 完全没提

### 4.3 PM 嘴里的 L0-L4 是 UI 导航层次, Palantir 真 primitives 是数据/操作层次

**概念混淆**:
- L0-L4 是 **导航路径的 5 个 step**, 屏幕间 push/pop
- 7 primitives 是 **7 类独立的可寻址 entity** (data model layer)
- wave261 做的事是把 5 个屏幕连起来, 但**没有创造任何新的 primitive**, 只是把现有的 Type/Object/Property UI 重新切成了 5 层

**老板要的「Palantir 真对应」意味着**:
- App 端需要新增 3 个独立 UI 入口: Action log (Action), Function catalog (Function), Branch picker (Branch)
- 或者承认 fork 没做完, 暂时不假装

---

## 5. P0/P1/P2 缺陷总结表

| ID | 严重 | 缺陷描述 | 文件:行 |
|----|------|---------|---------|
| P0-1 | 🔴 | `ontology_objects / ontology_types / ontology_links / ontology_functions / ontology_branches / ontology_actions_view` 6 张表 + migration 跑过, **但 server 端 0 SELECT/INSERT, App 端 0 调用** | `packages/db/src/schema/index.ts:68-74`; migrations `9014/9015/9017/9018/9019/9020` |
| P0-2 | 🔴 | **Branch 没做 (老板问的就是这个)** — 表在 DB, 没 service/route/UI/backfill | `packages/db/src/schema/ontology_branches.ts:32-54`; migration `9020` |
| P0-3 | 🔴 | **Function 没做** — schema comment 说"MCP tools 镜像到这", 但镜像从来不同步, `tool_*` 28 张表才是真的跑 | `packages/db/src/schema/ontology_functions.ts:31-49`; migration `9019` |
| P0-4 | 🔴 | **Action view 没人用** — view SQL 写好, server 0 query, App 0 consume | `packages/db/src/schema/ontology_actions_view.ts:26-35`; migration `9018`; 真 log 在 `audit_log` / `activity_log` / `heartbeat_run_events` 三套独立系统 |
| P1-1 | 🟡 | **Link 新表与旧表并存, 旧表是 source of truth, 新表是死表** — wave250 commit 给了空表 placeholder, 但 backfill 没做 (ocean_objects 表空导致 ontology_links.src_object_id 无法引用) | `ontology_links.ts:23-31` deprecation 注释; `entity_relations.ts:33-67` 真在写 |
| P1-2 | 🟡 | **Type 真值在 TS 编译期常量**, 不在 DB — `ENTITY_TYPES` 联合类型 + `TYPE_TO_DOMAIN` map (`ontology-graph.ts:848-858`) + `ENTITY_TABLE` map (`ontology-extras.ts:46-59`) 全是 hardcoded 字面量, `ontology_types` 表空, 插件 DB 不被同步 | `packages/shared/src/ontology/`; `ontology-types.ts:13-31` schema docstring 自承"镜像" |
| P1-3 | 🟡 | **PM wave261 的 5 层下钻 ≠ Palantir 7 primitives**, 概念混淆: L0/L1 跟 primitives 无关, L2 半对应, L4 真对应, L3 走源表 | `OntologyDomainListScreen.tsx:45-69` L0-L4 注释; 对照 `ontology_objects.ts` / `ontology_types.ts` / `ontology_properties.ts` 真定义 |
| P2-1 | 🟢 | `ontology-properties` 表的 jsonb 字段 schema 在 `OntologyPropertyEntry` interface, **typeRef/sampleValue/required 是 wave250 加的, 但 service 端的 `dedupeProperties` 只 dedupe key, 不规范化 typeRef/sampleValue/required** | `ontology_properties.ts:56-78`; `ontology-extras.ts:323-331` `dedupeProperties` |
| P2-2 | 🟢 | App 端 L3 实例加载用 `ctx.entityType.entityType` 当 typeId (`OntologyDomainListScreen.tsx:208-211`), 但 server `getProperties` 把 typeId 当 UUID 比对 (`ontology-extras.ts:256-269`), **类型系统上 typeId 是 string union, 但 DB 是 uuid** — 工作因为 typeId 字段没硬 FK, 但概念不一致 | `OntologyDomainListScreen.tsx:204-224`; `ontology-extras.ts:249-258` |
| P2-3 | 🟢 | `OntologyDomainListScreen.tsx:775-783` 的 `filterEntityTypesForDomain` 硬编码 5 域 → entityType 映射, **跟 server 的 `TYPE_TO_DOMAIN` (`ontology-graph.ts:848-858`) 重复定义, 容易 desync** | `OntologyDomainListScreen.tsx:775-789`; `ontology-graph.ts:848-858` |

---

## 6. 推荐改造方案

### 6.1 短期(本次 wave 不动, 下次 wave 接): 真接 Property 之外的 6 个

按 P0-2 → P0-3 → P0-4 顺序:

**P0-2 (Branch) 改造方案**:
- 决策: **先撤表 + 撤 migration**, 还是 **真做**
- 如果真做: 需要 5 步
     1. 写 backfill migration (从 issue 行派生 Branch 行, e.g. 每个 spec_kind=task 的 issue 都派生一个 strategy='task-fork' Branch)
     2. 写 `server/src/services/ontology-branches.ts` (listBranches / createBranch / pickBranch for dispatch)
     3. 写 `server/src/routes/ontology-branches.ts` (GET/POST)
     4. 写 `clients/expo/src/screens/OntologyBranchPickerScreen.tsx` (在 dispatch 任务时选 dev/sandbox/prod)
     5. 接到 dispatcher 上 (`packages/adapters/` 或 `server/src/services/heartbeat.ts`)
- 估计工作量: 2-3 个 wave

**P0-3 (Function) 改造方案**:
- 决策: **做 backfill from `tool_*` 表 + `company_skills`**, 还是 **撤表**
- 如果做: 需要写 backfill migration 从 `toolCatalogEntries` 派生 Function 行
- 同时给 MCP gateway 加 "从 ontology_functions 读 callable surface" 的实现
- App 端需要 Function catalog 屏 (`OntologyFunctionCatalogScreen.tsx`)
- 估计工作量: 3-4 个 wave

**P0-4 (Action view) 改造方案**:
- 决策: **接 view 到 Action log UI**, 还是 **撤 view**
- 如果接: 需要写 `GET /api/companies/:id/ontology/actions` route 走 `ontology_actions_view`
- App 端需要 Action log 屏 (跟 activity log UI 共享或新建)
- 注意 audit_log / activity_log / heartbeat_run_events 三套并行系统的关系
- 估计工作量: 1-2 个 wave

### 6.2 中期: 把 wave261 的 5 层下钻 + Palantir 7 primitives 概念对齐

**问题**: PM 嘴里的 L0-L4 跟老板要的 7 primitives 不对齐
**方案**:
- 保留 L0-L4 作为 UI 导航层次
- 但每个 L 层标注它对应哪个 primitive
  - L0 公司 — meta / company row (不是 primitive)
  - L1 域 — meta / derived bucket (不是 primitive)
  - L2 类型 — Type (对应 ontology_types 行, 暂时还是 entityType 字面量)
  - L3 实例 — Object (对应 ontology_objects 行, 暂时走源表)
  - L4 属性 — Property (对应 ontology_properties 行, 已真接)
- 加 3 个新屏: Action log / Function catalog / Branch manager
- 总数从 4 个屏扩到 7 个屏, 对齐 Palantir 7 primitives

### 6.3 长期: Source of Truth 收敛

**问题**: 7 primitives 在 fork 里至少有 3 套并行实现
| 真相 | 旧实现 | 新实现 (空) |
|------|--------|------------|
| Object | issues / projects / agents 等源表 | ontology_objects (空) |
| Link | entity_relations | ontology_links (空) |
| Type | TS 联合类型 + hardcoded map | ontology_types (空) |
| Function | tool_* 28 张 | ontology_functions (空) |
| Action | issues + issues + heartbeat_run_events | ontology_actions_view (空) |

**方案**: 选一个方案
- 方案 A: **保留旧实现, 撤 wave250 新表** (省事, 但回滚 7 个 migration)
- 方案 B: **真接新表, 迁旧实现** (慢, 但概念干净)
- 方案 C: **混合**: Property 留真表 (已接通), Link/Object/Type 走旧表 (entity_relations + 源表), Branch/Action/Function 暂时不上 (待评估)

**建议选 C**, 理由: Property 已接通, Link/Object/Type 走旧实现 (entity_relations + 源表) 工作正常, Branch/Action/Function 需要单独评估 ROI

### 6.4 关于 PM wave261 的诚实结论

PM wave261 的 5 层下钻 (L0-L4) 在 PM 视角是 "导航友好度" 工作, 工作了的: L1 5 chip、L2 8 entityType、L3 1 跳邻居、L4 schema 列表, 屏 1-4 接通

但 PM **没做 Palantir 7 primitives 对齐** — 这是另一件事:
- 真做完的: Property (1/7)
- 走旧实现的: Link / Type / Object (3/7, 旧表还在跑)
- 完全没做的: Branch / Action / Function (3/7)

**给老板的话**: 「L0-L4 是 PM 给您看的导航路径, 不是 Palantir 7 primitives。Property 是唯一真做完的 (屏 3 全功能)。Link/Type/Object 走旧实现 (entity_relations + 源表 + TS 联合类型), 新表是死表。Branch / Action / Function 真没做。」

---

## 附录 A: 文件清单

### A.1 Schema (`packages/db/src/schema/`)
- `ontology_objects.ts` (59 lines) — Object primitive
- `ontology_types.ts` (54 lines) — Type primitive
- `ontology_properties.ts` (82 lines) — Property primitive (唯一真对应)
- `ontology_links.ts` (46 lines) — Link primitive (空表)
- `ontology_actions_view.ts` (47 lines) — Action primitive (view, 0 query)
- `ontology_functions.ts` (52 lines) — Function primitive (空表)
- `ontology_branches.ts` (58 lines) — Branch primitive (空表)
- `entity_relations.ts` (68 lines) — 旧 Link 真值 (wave154)
- `issues.ts` (220 lines) — Action source table #1
- `tool_access.ts` (28 张 `tool_*` 表) — Function source

### A.2 Routes (`server/src/routes/`)
- `ontology-graph.ts` (118 lines) — Link 旧实现的 route (5 endpoint, 全走 entity_relations)
- `ontology-extras.ts` (92 lines) — Property + Object (走源表) 的 route

### A.3 Services (`server/src/services/`)
- `ontology-graph.ts` (901 lines) — Link service (全走 entity_relations)
- `ontology-extras.ts` (361 lines) — Object (走源表) + Property 的 service
- `ontology-backfill.ts` — 旧表 backfill
- `ontology-provisioner.ts` — 插件集成
- `ontology-spec-decomposition.ts` / `ontology-spec-planner.ts` / `ontology-spec-store.ts` / `ontology-spec.ts` — Spec 子系统

### A.4 Migrations (`packages/db/src/migrations/`)
- `9013_add_ontology_properties.sql` — Property 表
- `9014_add_ontology_objects.sql` — Object 表
- `9015_add_ontology_types.sql` — Type 表
- `9016_extend_ontology_properties.sql` — Property 扩展
- `9017_add_ontology_links.sql` — Link 新表
- `9018_create_ontology_actions_view.sql` — Action view
- `9019_add_ontology_functions.sql` — Function 表
- `9020_add_ontology_branches.sql` — Branch 表

### A.5 App screens (`clients/expo/src/screens/`)
- `OntologyDomainListScreen.tsx` (1318 lines) — 屏 1 (L0/L1/L2/L3/L4 整合)
- `OntologyInstanceGraphScreen.tsx` (810 lines) — 屏 2 (实例图谱)
- `OntologyGraphWorkbenchScreen.tsx` (451 lines) — 屏 4 (工作台 canvas)
- `OntologySchemaEditorScreen.tsx` (479 lines) — 屏 3 (字段编辑, Property 唯一全屏)

### A.6 App client (`clients/expo/src/`)
- `coolie.ts:642-654` `createOntologyDomain` — 唯一 ontology client method (走插件路径, 跟主 ontology service 无关)

### A.7 api-client (`clients/api-client/src/client.ts`)
- `:1016-1034` `getOntologyGraph` → `/api/companies/:id/ontology/graph`
- `:1043-1049` `getOntologyLevels` → `/api/companies/:id/ontology/levels`
- `:1055-1072` `listOntologyInstances` → `/api/companies/:id/ontology/instances`
- `:1081-1089` `getOntologyTypeProperties` → `/api/companies/:id/ontology/types/:typeId/properties`
- `:1091-1101` `updateOntologyTypeProperties` → `/api/companies/:id/ontology/types/:typeId/properties` (PATCH)

---

## 附录 B: 引用行号汇总

老板可以 grep 验证的关键行号:

**Schema 定义**:
- Object: `packages/db/src/schema/ontology_objects.ts:34-56`
- Type: `packages/db/src/schema/ontology_types.ts:33-51`
- Property: `packages/db/src/schema/ontology_properties.ts:39-54`
- Link 新表: `packages/db/src/schema/ontology_links.ts:24-42`
- Link 旧表: `packages/db/src/schema/entity_relations.ts:33-67`
- Action view: `packages/db/src/schema/ontology_actions_view.ts:26-35`
- Function: `packages/db/src/schema/ontology_functions.ts:31-49`
- Branch: `packages/db/src/schema/ontology_branches.ts:32-54`

**Routes**:
- Link/Object/Type 旧实现: `server/src/routes/ontology-graph.ts:39-115`
- Property + Instance (走源表): `server/src/routes/ontology-extras.ts:35-89`

**Services**:
- Link (旧): `server/src/services/ontology-graph.ts:225-243` loadEdges / `:141-157` recordEntityRelation
- Property + Instance (走源表): `server/src/services/ontology-extras.ts:82-237` listInstances / `:247-321` propertiesService

**Migrations**:
- `_journal.json:2081-2123` 记录 9014 / 9015 / 9017 / 9018 / 9019 / 9020 6 个 wave250 migration tag

**App screens**:
- 屏 1 L0/L1/L2/L3/L4 整合: `clients/expo/src/screens/OntologyDomainListScreen.tsx:387-767`
- 屏 2 实例图谱: `clients/expo/src/screens/OntologyInstanceGraphScreen.tsx:73-486`
- 屏 3 字段编辑: `clients/expo/src/screens/OntologySchemaEditorScreen.tsx:63-392`
- 屏 4 工作台: `clients/expo/src/screens/OntologyGraphWorkbenchScreen.tsx:51-451`

**客户端入口**:
- `clients/expo/src/coolie.ts:642-654` createOntologyDomain
- `clients/api-client/src/client.ts:1016-1101` 5 个 ontology API method

**唯一 export 链**:
- `packages/db/src/schema/index.ts:68-74` 7 行 export, 是 6 张 ontology 表的唯一存在证据

---

## 附录 C: 数据行数估计方法

老板不用进 DB 查, 以下是基于 schema / migration 顺序的估计:

| 表 | 估计 | 推理 |
|---|------|------|
| ontology_objects | 0 | wave250 migration 只 CREATE TABLE, 没 INSERT, 没 backfill, service 0 引用 |
| ontology_types | 0 | 同上 |
| ontology_links | 0 | 同上, 而且 ontology_objects 空所以继承不了 |
| ontology_actions_view | (view) | view 表达式 UNION 3 表全表, 所以理论上是 issues + issue_recovery_actions + tool_action_deliveries 行数, 但 view SQL 跑了 0 次 query |
| ontology_functions | 0 | schema + migration 跑过, 0 引用 |
| ontology_branches | 0 | schema + migration 跑过, 0 引用 |
| ontology_properties | 10-100 | schema + migration 跑过, **唯一被写的 ontology 表, 但服务层写到这里的只有 schema editor 用户手工保存的; 每台 cell 估计 0-10 个 typeId, 保类型化字段; 假设 10 个 cell × 10 个 type × 平均 1 行 = 0-100** |
| entity_relations | ~2100 | 老板截图 "75 entities 2100 relations" (`ontology-graph.ts:53-62` 注释), 真在跑 |

---

**审计结束. 报告人: agy (wave270 audit 4/4)**
**报告路径**: `$REPO_ROOT/docs-coolie/audit/2026-10-01-wave270-agy-full-audit/04-ONTOLOGY-7-PRIMITIVES-AUDIT.md`
**审计范围**: 只读, 0 改动
**给老板的话**: 「Property 真做完 (1/7), Link/Type/Object 走旧实现 (3/7), Branch/Action/Function 没做 (3/7)。L0-L4 是导航路径不是 Palantir primitives。」