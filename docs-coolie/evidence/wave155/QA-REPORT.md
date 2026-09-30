# wave155 QA 报告 — 落地 wave154 + PM 优化（诚实版）

日期: 2026-09-30 · 负责人: agent · 依据: boss 2026-09-30 拍板「2.3」

## 0. 先说真话：wave154 比 brief 里写的完整得多

开工前先核了 wave154 的实际代码，与 brief 的「只骨架」描述不一致：

| brief 说 wave154 没做 | 实际代码 | 结论 |
| --- | --- | --- |
| `traverse`/`findPaths` 只骨架 | `ontology-graph.ts` 已有真 BFS `buildView`(=traverse) / `findPaths` / `stats` / `hydrate`，且 `server/src/__tests__/ontology-graph-routes.test.ts` 已存在并存根 | **已做** |
| 节点显示 UUID 截断 | `hydrate` 已按类型取真名（project.name / issue.identifier+title / spec kind / work_product.title / attachment.original_filename / conversation.title） | **已做** |
| 自动反推历史关系没做 | 迁移 `9010_add_entity_relations.sql` 尾部已含一次性 backfill（issue→project、spec→project、spec→spec、wp→issue、attachment→issue、conversation→project、issue→conversation） | **已做（迁移时一次性）** |

所以本波只补「真正缺的」，不重复开发（遵 boss「不重复开发」纪律）：

- **缺**：可重复调用的 backfill 端点（迁移只跑一次，之后新数据不会再建关系）
- **缺**：preset 视图（project_tree / agent_dashboard / conversation_thread）
- **缺**：agent 节点 hydrate（`EntityType` 里有 `agent`，但 `hydrate` 没处理，agent 显示成 UUID 截断）
- **缺**：onboarding 状态层（`companies.metadata` / `onboarding_state`、服务、路由、3 步页、强制跳转）

## 1. 本波改动

### 1.1 Ontology graph 补全
- `server/src/services/ontology-backfill.ts`（新）：`ontologyBackfillService(db).backfill(companyId)`，8 条 `INSERT ... SELECT ... ON CONFLICT DO NOTHING RETURNING id`，返回 `{ buckets, totalInserted, totalRelations }`。每条 SQL 都按 `company_id = ${companyId}` 过滤 → 不会跨公司复制。
- `server/src/routes/ontology-graph.ts`：新增 `POST /api/companies/:cid/ontology/backfill`；`GET .../graph` 支持 `view` 参数。
- `server/src/services/ontology-graph.ts`：新增 `agent` 节点 hydrate（真名 + href `/agents/:id`）；新增 preset 表 `VIEW_PRESETS`，`buildView` 支持 `view`（显式 depth/relations 仍可覆盖预设）。
- `packages/shared`：新增 `ONTOLOGY_GRAPH_VIEWS`、`view` 字段、`assigned_to` 关系动词、`OntologyBackfill*` 类型。

### 1.2 Onboarding 3 步（wave155 新增，不与 onboarding-seed 重叠）
- 迁移 `9012_add_company_metadata.sql`：`companies.metadata jsonb` + `companies.onboarding_state jsonb`（均 `IF NOT EXISTS`）。
- `server/src/services/onboarding.ts`：`getOnboardingState` / `updateOnboardingStep`（步数单调不回退）/ `completeOnboarding`（建 1 示范项目 + 5 任务，幂等复用）。
- `server/src/routes/onboarding.ts`：`GET .../onboarding/state`、`POST .../onboarding/step`、`POST .../onboarding/complete`。
- UI：`ui/src/pages/CompanyOnboardingPage.tsx`（3 步：选行业 8 选 1 / 选员工 6 默认+自定义 / 跑示范）、`ui/src/api/onboarding.ts`、`App.tsx` 加 `/{prefix}/getting-started` 路由、`CompanyRootRedirect` 加 NULL 强制跳转门。

### 1.3 UI 视图预设
- `OntologyGraphPage`：预设下拉 + 默认 `project_tree`；根类型加「智能体」。
- `OntologyGraphView`：接收 `view`；hover tooltip 增加 `ID {uuid}`。
- `ProjectDetail` graph tab 显式 `view="project_tree"`（原本已接好，仅补显式值）。

## 2. 真实证据（curl / 真值）

**实例说明（诚实标注）**：brief 里的 prod 公司 `4cafeb9a` / 项目 `939ff822` **在本机实例不存在**。`GET /api/companies` 只有 `b1d6850c`（onboarding-cache-test-1790227862, prefix ONB）与 `32f4d79d`。以下用真实存在的 `b1d6850c`，走真 curl。

**live 服务器**：`http://localhost:3100`，`deploymentMode=local_trusted`（curl 无需鉴权）。base commit `946c9fd7f`，dev 监听已热载本波代码（新端点实测 200）。

### 2.1 backfill（真跑，且证明幂等）
用服务直连 live 实例的 embedded Postgres（`127.0.0.1:54329`，即 `~/.paperclip/instances/default/db`）：

```
== before ==  totalNodes 75  totalRelations 55
   belongs_to 29 · attached_to 23 · discussed_in 3
== backfill ==
   belongs_to 0 · derived_from 0 · attached_to 0 · discussed_in 0 · assigned_to 2
   totalInserted 2 · totalRelations 57
== after ==   totalRelations 57 · averageDegree 1.52
```
- 迁移 9010 已建的老关系 → backfill 插入 0（幂等，不重复）。
- 只有 wave154 没建的 `assigned_to`（issue→agent）新增 2 条。

随后对 live 端点再跑一次证明幂等：
```
POST /api/companies/b1d6850c.../ontology/backfill  → HTTP 200
{"buckets":[{"relation":"belongs_to","inserted":0},...,{"relation":"assigned_to","inserted":0}],
 "totalInserted":0,"totalRelations":57}
```

### 2.2 graph / stats（live curl）
```
GET /ontology/stats
  totalNodes 75 · totalRelations 57
  belongs_to 29 · attached_to 23 · discussed_in 3 · assigned_to 2

GET /ontology/graph?root_type=project&root_id=509405bc...&depth=2
  view project_tree · nodes 26 · edges 25 · truncated false
  byType {project:1, issue:25}
  labels: 产融智能体应用系统集成服务项目 1790652625 / ONB-15 架构/设计收口里程碑 / ONB-3 ...
```
> 真值：该项目深度 2 是 26 节点 / 25 边。brief 期望的 ≥30 / ≥100 对应它写的另一家公司（本机不存在），此处按真实数字报告，不造假。

### 2.3 preset + agent 节点真名（live curl）
```
GET /ontology/graph?root_type=agent&root_id=bb5f95b6-...&view=agent_dashboard
  view agent_dashboard · depth 2 · nodes 2 · edges 1
  byType {agent:1, issue:1}
  agent node label: "onboarding-cache-test-agent"   ← 真名，非 UUID 截断
```

### 2.4 onboarding 门（live curl）
```
GET /api/companies/b1d6850c.../onboarding/state
  {"companyId":"b1d6850c...","state":null,"onboardedStep":null,"completed":false}
```
`onboardedStep=null` 即强制跳转门的触发条件（见 `CompanyRootRedirect`）。

### 2.5 集成测试（embedded Postgres，真 schema）
```
pnpm vitest run server/src/__tests__/ontology-graph-routes.test.ts   → 5 passed
pnpm vitest run server/src/__tests__/onboarding-routes.test.ts       → 2 passed
```
覆盖：项目子图、issue↔spec 路径、stats 真值、跨公司不泄露、非法参数 400、**backfill 后关系数 +N 且二次幂等**、**preset agent_dashboard + agent 真名**、**onboarding 步数单调 + 示范项目 5 任务 + 重跑不翻倍 + 跨公司隔离**。

### 2.6 静态检查
```
pnpm --filter @paperclipai/shared typecheck  → 0
pnpm --filter @paperclipai/ui typecheck      → 0
server: pnpm run typecheck                   → 0
pnpm check:token-gates                       → Gate1-4 CLEAN
```

## 3. 诚实标注（未做 / 未验）

- **未截图**：本轮未做浏览器截图，UI 由 typecheck + token gate + live API 断言覆盖；如需截图可后续补。
- **D6 App 端（Exwave3 跳 webview）**：未动。Task 要求 App 端跳 onboarding webview，属 iOS/Expo 改动，本波未改（避免与 wave149 冲突）。
- **`4cafeb9a` 数据**：本机不存在，已用真实公司替代并说明。
- **强制跳转影响面**：`onboarding_state` 为新列，**所有存量公司初始为 NULL**，因此从公司根进入会跳一次 3 步引导（完成或走一步后不再跳）。这是 brief「NULL 即强制跳」的字面实现，已在此显式标注副作用。
- **onboarding 未写 activity log**：与 onboarding-seed 路径不同，本波 onboarding state 变更未写审计（`onboarding-seed.apply` 仍照旧写）。如治理需要，可后续补。
- **未新增表**：`entity_relations` / `audit_log` / `defect_kb` 均未重建；只在 shared 加了 `assigned_to` 动词（文本列，无需迁移）。

## 4. 未触碰（遵纪律）
- 未动 CMMI(wave140) / spec-driven(wave147) / wave149 iOS / wave152 / wave153 / wave154 已做部分。
- 未改 `PAPERCLIP_API_KEY` / `DEPLOYMENT_MODE`。
- 未启停 dev 进程（live 为热载；backfill 走独立脚本连接同一 DB）。
