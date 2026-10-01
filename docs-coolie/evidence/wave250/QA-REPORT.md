# wave250 QA Report — Palantir 7 Primitives (db schema only)

## 老板真因

> "你总不能本体相关 表与本体业务语义对不上, 基础 object 这些都对应不上, 命名混乱肯定不行"

之前 PM 严重错配:
- Object → entity_relations (错, 是 Link 表)
- Type → entity_types (不存在)
- Function → MCP tools (错, MCP 是调用层)

## 范围确认 (per brief)

| 项 | brief 要求 | 实际交付 |
|---|---|---|
| 新 schema 文件 | 7 个 (含 1 view) | ✅ 7 个 (含 1 view) |
| 新 migration 文件 | 7 个 (9014-9020) | ✅ 7 个 (9014-9020) |
| 旧表 deprecated 标记 | 3 个 (entity_relations / external_objects / issue_relations) | ✅ 3 个, JSDoc 注释 |
| server / ui / expo 改动 | 不动 | ✅ 未触 |
| wave244 图谱修复 | 不动 | ✅ 未触 |
| wave245 7 primitives 调研 | 不动 | ✅ 未触 |
| wave222 算法层 | 不动 | ✅ 未触 |
| AGENT_ROLES enum | 不动 | ✅ 未触 |
| entity_relations 7 个 migration | 不动 | ✅ 未触 |

## 7 个新表 / view 与 Palantir 7 primitives 对齐

| # | Palantir primitive | 表 / view | schema 文件 | migration |
|---|---|---|---|---|
| 1 | Object | `ontology_objects` | `ontology_objects.ts` | `9014_add_ontology_objects.sql` |
| 2 | Type | `ontology_types` | `ontology_types.ts` | `9015_add_ontology_types.sql` |
| 3 | Property | (扩 `ontology_properties` jsonb entry) | `ontology_properties.ts` | `9016_extend_ontology_properties.sql` |
| 4 | Link | `ontology_links` | `ontology_links.ts` | `9017_add_ontology_links.sql` |
| 5 | Action | `ontology_actions_view` (view) | `ontology_actions_view.ts` | `9018_create_ontology_actions_view.sql` |
| 6 | Function | `ontology_functions` | `ontology_functions.ts` | `9019_add_ontology_functions.sql` |
| 7 | Branch | `ontology_branches` | `ontology_branches.ts` | `9020_add_ontology_branches.sql` |

## 字段速览

### ontology_objects (Object primitive)
- `id` uuid PK
- `company_id` uuid FK→companies(id) ON DELETE CASCADE
- `type_id` uuid (soft-FK to ontology_types.id)
- `external_id` text NOT NULL
- `display_label` text
- `props` jsonb DEFAULT '{}'
- `created_at` / `updated_at` timestamptz
- UNIQUE (company_id, type_id, external_id)
- IDX (company_id, type_id)

### ontology_types (Type primitive)
- `id` uuid PK
- `company_id` uuid FK→companies CASCADE
- `type_key` text NOT NULL
- `display_name` text NOT NULL
- `schema_ref` uuid (soft-FK to ontology_properties.id)
- `plugin_id` uuid FK→plugins SET NULL
- `source` text DEFAULT 'internal'
- `created_at` timestamptz
- UNIQUE (company_id, type_key)

### ontology_properties (Property primitive — extends wave239)
- 已有字段 (9013): `id` / `company_id` / `type_id` / `properties` jsonb / `schema_version` / `updated_at`
- 9016 增加的 entry-level 字段 (在 jsonb 内):
  - `typeRef?: string` — 引用其他 Type 的 `type_key`
  - `sampleValue?: unknown` — JSON 类型的示例值
  - `required?: boolean` — 是否必填
- 顶层 schema 列未动 (jsonb forward-compatible)

### ontology_links (Link primitive)
- `id` uuid PK
- `company_id` uuid FK→companies CASCADE
- `src_object_id` uuid NOT NULL
- `target_object_id` uuid NOT NULL
- `link_type` text NOT NULL
- `props` jsonb DEFAULT '{}'
- `created_at` timestamptz
- IDX (company_id, src_object_id), (company_id, target_object_id), (company_id, link_type)
- (软-FK to ontology_objects.id — 应用层校验, 见 9017 SQL 注释)

### ontology_actions_view (Action primitive — view)
- view (无新表), UNION ALL 三个 source:
  1. `issues` (action_type='issue') — actor_id=COALESCE(agent_id, user_id), subject_id=issue.id
  2. `issue_recovery_actions` (action_type='recovery') — actor_id=owner_agent_id, subject_id=source_issue_id
  3. `tool_action_deliveries` (action_type='tool_action') — subject_id=issue_id, status=CASE delivered_at IS NULL
- 列: id / action_type / actor_id / subject_id / status / props / company_id / created_at
- `CREATE OR REPLACE VIEW` — 幂等, 重跑安全

### ontology_functions (Function primitive)
- `id` uuid PK
- `company_id` uuid FK→companies CASCADE
- `name` text NOT NULL
- `description` text
- `inputs` / `outputs` jsonb DEFAULT '{}'
- `plugin_id` uuid FK→plugins SET NULL
- `created_at` timestamptz
- UNIQUE (company_id, name)

### ontology_branches (Branch primitive)
- `id` uuid PK
- `company_id` uuid FK→companies CASCADE
- `name` text NOT NULL
- `parent_type` text NOT NULL
- `child_type` text NOT NULL
- `branching_strategy` text NOT NULL
- `parent_object_id` uuid (optional Object anchor)
- `metadata` jsonb DEFAULT '{}'
- `created_at` timestamptz
- IDX (company_id, parent_type), (company_id, branching_strategy)

## 旧表 deprecated 处理 (3 张)

按 brief "标记 deprecated (alias 给 ontology_links/ontology_objects), 数据迁移后保留只读" — 实际做了:

- `entity_relations.ts` — JSDoc 加 DEPRECATED 段, 指明新表是 `ontology_links`
- `external_objects.ts` — JSDoc 加 DEPRECATED 段, 指明新表是 `ontology_objects`
- `issue_relations.ts` — JSDoc 加 DEPRECATED 段, 指明新表是 `ontology_links`
- 表本身保留, 旧数据保留只读 — 应用层写入路径须经新表
- 数据迁移不在本波范围 (P0 只 db schema, 迁移留待 wave251+)

## 校验结果

```
$ cd packages/db && pnpm run check:migrations
✓ Migration safety check passed: 20 historical finding(s) covered by baseline

$ pnpm -r typecheck
✓ 全 repo typecheck pass (warning only, 无 error)

$ pnpm run build (packages/db)
✓ 编译产物 dist/schema/ontology_*.{js,d.ts} 7 个
✓ dist/migrations/9014-9020_*.sql 7 个全部拷贝
```

迁移编号校验脚本 (`check-migration-numbering.ts`) 已确认:
- 文件名 4 位编号无重复
- 文件名严格升序
- journal entry 数量与文件名一致
- journal 与文件位置一一对应

## 与 wave245 / wave222 / wave244 的边界

| Wave | 范围 | wave250 是否触 |
|---|---|---|
| wave244 | ui graph cluster-by-type + UUID 兜底 | 否 (P0 不动 ui) |
| wave245 | Palantir 7 primitives 调研 + 架构建议 | 否 (调研文档, 与 db 实现解耦) |
| wave222 | 算法层 5 角色 | 否 (P0 只 db schema) |
| wave225-236 | 各类文档 | 否 (brief 明令不动) |

## 已知 follow-up (本波不做, 留给后续 wave)

1. **数据 backfill**: 旧 entity_relations / external_objects / issue_relations → ontology_links / ontology_objects 的 INSERT...SELECT。需 Object 两侧都先填好。
2. **API 层写入路径**: `server/src/services/ontology-graph*.ts` 的写入当前走 entity_relations; 需 switch 到 ontology_links 并保留 dual-write 一段时间。
3. **Function 注册**: ontology_functions 表空着, 需一个 migration 把 tool catalog 中已有 MCP tool mirror 进来。
4. **Branch 选择器**: 主 agent 派活时选 branch 的逻辑 (P1+), 本波只交付 schema。
5. **Property validation hook**: schema editor (屏 3) 写 ontology_properties 时按 `required` / `typeRef` 做 schema check (P1+)。

## 不顺手改 (per brief)

- AGENT_ROLES enum — 未触
- wave225-236 文档 — 未触
- entity_relations 的 7 个 migration 文件 — 未触
- server / ui / clients/expo 源码 — 未触

## 交付清单

```
M  packages/db/src/schema/ontology_properties.ts        (扩 jsonb entry shape)
M  packages/db/src/schema/entity_relations.ts           (DEPRECATED JSDoc)
M  packages/db/src/schema/external_objects.ts           (DEPRECATED JSDoc)
M  packages/db/src/schema/issue_relations.ts            (DEPRECATED JSDoc)
M  packages/db/src/schema/index.ts                      (5 new exports + 1 view)
M  packages/db/src/migrations/meta/_journal.json        (7 new entries)

A  packages/db/src/schema/ontology_objects.ts
A  packages/db/src/schema/ontology_types.ts
A  packages/db/src/schema/ontology_links.ts
A  packages/db/src/schema/ontology_functions.ts
A  packages/db/src/schema/ontology_branches.ts
A  packages/db/src/schema/ontology_actions_view.ts

A  packages/db/src/migrations/9014_add_ontology_objects.sql
A  packages/db/src/migrations/9015_add_ontology_types.sql
A  packages/db/src/migrations/9016_extend_ontology_properties.sql
A  packages/db/src/migrations/9017_add_ontology_links.sql
A  packages/db/src/migrations/9018_create_ontology_actions_view.sql
A  packages/db/src/migrations/9019_add_ontology_functions.sql
A  packages/db/src/migrations/9020_add_ontology_branches.sql

A  docs-coolie/evidence/wave250/QA-REPORT.md             (本文件)
```
