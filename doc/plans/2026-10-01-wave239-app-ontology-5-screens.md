# wave239: 原生 App 本体插件 5 屏一起抄 (按 agy 草图 wave238)

> **波次**: wave239
> **日期**: 2026-10-01
> **触发**: 老板 "原生本体功能仿 web 本体插件, 做得如何了, 是否要先 agy 画原型"
>          → PM 反讲 c 选项 (先 agy 画原型 wave238, 再派大活抄)
> **优先级**: 5 屏 P1+P2+P3 一起抄
> **版本**: APK 0.6.8 → 0.6.10

## 1. 真因

老板原话 "原生本体功能仿 web 本体插件, 做得如何了, 是否要先 agy 画原型".
PM 反讲 c: 先 agy 画原型 (wave238 已画完 5 屏 ASCII 草图, 见
[`docs-coolie/prototypes/2026-10-01-app-ontology-5-screens.md`](../../docs-coolie/prototypes/2026-10-01-app-ontology-5-screens.md)),
再派大活抄. 本波 5 屏一起抄.

5 屏清单 (按 agy 草图):

| 屏 | 名称 | 优先级 | wave235 已有? |
|---|---|---|---|
| 1 | OntologyDomainListScreen (类型级图谱) | P1 | ✅ 已重写 |
| 2 | OntologyInstanceGraphScreen (实例级图谱) | P2 | ❌ 新建 |
| 3 | OntologySchemaEditorScreen (属性编辑) | P1 | ❌ 新建 |
| 4 | OntologyGraphWorkbenchScreen (图谱工作台) | P3 | ❌ 新建 |
| 5 | PluginManagerScreen (插件管理) | P2 | ✅ 已抄 |

## 2. 范围

### 2.1 server 新端点 (3 个, wave237 已修 1 个)

1. **GET /api/companies/:id/ontology/graph** — wave237 已修 (返 flat snapshot)
2. **GET /api/companies/:id/ontology/instances** — 新建, 单类型实例列表
   - 入参: `?entityType=project&ownerId=...&limit=...&offset=...`
   - 出参: `{ instances: EntityRef[], totalCount: number }`
   - 直接查 `entity_relations` + 各类型主表 (projects/issues/agents/etc.), 走公司隔离
3. **PATCH /api/companies/:id/ontology/types/:typeId/properties** — 新建, 属性编辑
   - 入参: `{ properties: Array<{ key: string; type: string; sample?: string }> }`
   - 出参: `{ properties: Array<...> }` (回写后的)
   - 存哪里? 本波先暂存到 `ontology_properties` 新表 (迁移 + schema)

### 2.2 clients/api-client 加 3 方法

- `getOntologyGraph(companyId, opts)` — 包 wave237 端点
- `listOntologyInstances(companyId, opts)` — 包新端点
- `updateOntologyTypeProperties(companyId, typeId, properties)` — 包 PATCH 端点

### 2.3 clients/expo 新增/改 5 屏 + 2 组件

- 屏 1 `OntologyDomainListScreen.tsx` (改): 加顶部 4 chip (业务/项目/数字员工/交付) + 详情卡长按
- 屏 2 `OntologyInstanceGraphScreen.tsx` (新): 实例图谱 + 负责人筛选
- 屏 3 `OntologySchemaEditorScreen.tsx` (新): 属性增删改 + 保存
- 屏 4 `OntologyGraphWorkbenchScreen.tsx` (新): 沉浸式大画布
- 屏 5 `PluginManagerScreen.tsx` (改): 顶部搜索 + 已启用/已停用分组
- 组件 `OntologyGraphCanvas.tsx` (新): Dagre/SVG 确定性分层布局 (无 react-native-svg, 沿用 View 绝对定位)
- 组件 `SchemaPropertyRow.tsx` (新): 单行属性编辑卡

### 2.4 App.tsx 加 4 个 screen state

- `ontologySchemaEditorTypeId: string | null` — 屏 3
- `ontologyInstanceGraphTypeKey: string | null` — 屏 2 (从屏 1 长按进)
- `ontologyWorkbenchOpen: boolean` — 屏 4 (从屏 2 浮钮进)
- (屏 5 已经在 wave235 有了)

### 2.5 不动 / 推迟

| 项目 | 原因 |
|---|---|
| ❌ `react-native-force-graph` | 需 native rebuild ~30min 阻塞发版 (沿用 wave216 纯 RN) |
| ❌ iOS TestFlight bump | 老板原话 "不动 iOS" |
| ❌ wave235 已抄的 5 屏其他部分 | 边界清楚 |
| ❌ wave237 修的 3 端点 | 不重写 |
| ❌ wave230 chip / wave213 Kanban | 不重写 |
| ❌ wave222 算法层 / wave226 quota 锁 | 不重写 |
| ❌ wave235-OrgSwitcher 实现 | 推到下一波 |

## 3. 子任务拆分 (A-F, 6 个并行子任务)

老板原话 "你可拆 6 子任务, 但要 1 个 commit + 1 个发版":

- **A. 屏 1 增强** (类型级图谱) ~1h
  - 改 OntologyDomainListScreen.tsx
  - 顶部加 4 chip (业务本体 / 项目中心 / 数字员工 / 交付产物)
  - 类型详情卡: 真名 + UUID 双显示
  - 长按节点 → 触发屏 3 (SchemaEditor) 入口

- **B. 屏 2 + 新端点** (实例级图谱) ~1h
  - 新 OntologyInstanceGraphScreen.tsx
  - server 新 GET /ontology/instances 端点
  - api-client 加 listOntologyInstances()
  - 5 tab 底部常驻

- **C. 屏 3 + 新端点** (属性编辑) ~1h
  - 新 OntologySchemaEditorScreen.tsx
  - server 新 PATCH /ontology/types/:typeId/properties 端点
  - 新 ontology_properties schema + 迁移
  - api-client 加 updateOntologyTypeProperties()
  - 5 tab 无 (子页)

- **D. 屏 4** (图谱工作台) ~1h
  - 新 OntologyGraphWorkbenchScreen.tsx
  - 复用 OntologyGraphCanvas 组件 + 双指捏合 (PanResponder)
  - 5 tab 无 (沉浸屏)

- **E. 屏 5 增强** (插件管理) ~30min
  - 改 PluginManagerScreen.tsx
  - 加顶部搜索框 + 已启用/已停用分组

- **F. 集成 + 发版** ~30min
  - App.tsx 加 3 state (屏 2 / 3 / 4)
  - bump 0.6.8 → 0.6.10
  - 重 build APK + OTA
  - typecheck + 测试

## 4. 设计取舍

### 4.1 不引入 react-native-svg / dagre

- wave216 已用纯 View 绝对定位画图, 视觉可用
- react-native-svg 需要 native rebuild (>=10min)
- react-native-force-graph 同理 (wave235 不引理由)
- 沿用 View 绝对定位 + atan2 算边线角度 (与现有 `graphEdgeLine` 一致)

### 4.2 server 新端点 (PATCH properties) 存哪里?

**决策**: 加 `ontology_properties` 物理表, 不写到 domain 的 metadata json 字段 (避免大对象碎片化写).

新表 schema:
```sql
CREATE TABLE ontology_properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  type_id uuid NOT NULL,
  properties jsonb NOT NULL DEFAULT '[]',
  schema_version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, type_id)
);
```

迁移: `packages/db/src/migrations/9011_ontology_properties.sql`

### 4.3 屏 4 工作台 vs 屏 2 实例图谱

- 屏 2: 单类型实例拓扑 + 责任人筛选 (BFS 子图)
- 屏 4: 全图工作台, 多类型混合 + 视图切换 (复用 wave155 视图预设)
- 复用 OntologyGraphCanvas 组件, 屏 4 多传 view 参数 + scale 参数

## 5. QA / 护栏

- typecheck 全过 (`pnpm -r typecheck`)
- 单元测试全过 (`pnpm test:run`)
- 5 屏都有真名/UUID 处理 (用 wave216 的 UUID_RE)
- 模拟器装 0.6.10 → 跑 5 屏 → 截图 → docs-coolie/evidence/wave239/screenshots/
- 4 护栏绿: `bash scripts/qa-gates.sh` 或人工跑 4 个

## 6. 报告

- `docs-coolie/evidence/wave239/QA-REPORT.md`
- `docs-coolie/evidence/wave239/screenshots/01-domain-list.png` ... `05-plugin-manager.png`

## 7. 发版

- `clients/expo/android/app/build.gradle` versionCode 608 → 610, versionName 0.6.8 → 0.6.10
- `clients/expo/CHANGELOG.md` 增 wave239 段
- 重 build APK + publish-ota
- 老板真机装 0.6.10

## 8. 并发协调

- 并发 session: coolie-53 (wave185 KAV)、coolie-c5 (scripts/check-fork-surface.mjs)
- 我 wave239 边界: clients/expo/src/screens + clients/expo/src/components + clients/api-client/src + server/src/routes + server/src/services/ontology-graph.ts + packages/db/src/migrations/
- 不动: clients/expo/src/ui/toast.ts、clients/expo/src/components/{ErrorBoundary,ToastHost}.tsx、clients/expo/src/stores/toast.ts、clients/expo/App.tsx 的 toast 相关 hunks
- 不动: scripts/check-fork-surface.mjs、pnpm-lock.yaml
- App.tsx 协调: 我只加 3 个新 state (ontologySchemaEditorTypeId / ontologyInstanceGraphTypeKey / ontologyWorkbenchOpen), 不改 wave235 已加的 pluginManagerOpen / pluginSettingsId, 也不改 wave184 toast
