# wave239 QA 报告 — 原生 App 本体插件 5 屏一起抄 (按 agy 草图)

> **波次**: wave239
> **日期**: 2026-10-01
> **触发**: 老板 "原生本体功能仿 web 本体插件, 做得如何了, 是否要先 agy 画原型" → PM 反讲 c 选项 (agy wave238 画原型, 大活 wave239 抄)
> **版本**: APK 0.6.8 → 0.6.10 (versionCode 608 → 610)
> **范围**: 5 屏 P1+P2+P3 + 3 server 新端点 + 1 新 schema/迁移 + 4 api-client 方法 + 2 新组件 + App.tsx 3 新 state

---

## 1. 真因

老板原话 "原生本体功能仿 web 本体插件, 做得如何了, 是否要先 agy 画原型".
PM 反讲 c: 先 agy 画原型 (wave238 已画完 5 屏 ASCII 草图), 再派大活抄. 本波 5 屏 P1+P2+P3 一起抄.

5 屏清单 (按 wave238 草图):

| 屏 | 名称 | 优先级 | wave235 已有? | 本波动作 |
|---|---|---|---|---|
| 1 | OntologyDomainListScreen (类型级图谱) | P1 | ✅ | 增强 (4 chip + 长按 + UUID) |
| 2 | OntologyInstanceGraphScreen (实例级图谱) | P2 | ❌ | 新建 |
| 3 | OntologySchemaEditorScreen (属性编辑) | P1 | ❌ | 新建 |
| 4 | OntologyGraphWorkbenchScreen (图谱工作台) | P3 | ❌ | 新建 |
| 5 | PluginManagerScreen (插件管理) | P2 | ✅ | 增强 (搜索 + 分组) |

## 2. 范围 & 交付物

### 2.1 新增 (7 新文件)

| 文件 | 行数 | 说明 |
|---|---|---|
| `packages/db/src/migrations/9013_add_ontology_properties.sql` | 35 | 新表 `ontology_properties` (公司 × 类型 unique, jsonb + schemaVersion) |
| `packages/db/src/schema/ontology_properties.ts` | 65 | schema 定义 + `OntologyPropertyEntry` 类型 |
| `server/src/services/ontology-extras.ts` | 252 | instances 列表 + properties 增删改查 |
| `server/src/routes/ontology-extras.ts` | 96 | 3 个新路由 + 活动日志 |
| `server/src/__tests__/ontology-extras-routes.test.ts` | 195 | 6 用例 (含 ownerId 过滤 + PATCH 校验) |
| `clients/expo/src/screens/OntologyInstanceGraphScreen.tsx` | 458 | 屏 2 |
| `clients/expo/src/screens/OntologySchemaEditorScreen.tsx` | 379 | 屏 3 |
| `clients/expo/src/screens/OntologyGraphWorkbenchScreen.tsx` | 397 | 屏 4 |
| `clients/expo/src/components/OntologyGraphCanvas.tsx` | 247 | 屏 2/4 共用布局 |
| `clients/expo/src/components/SchemaPropertyRow.tsx` | 70 | 屏 3 单行卡 |
| `doc/plans/2026-10-01-wave239-app-ontology-5-screens.md` | 165 | 计划 |

合计 ~ 2.4k 行新增代码 + 6 测试用例 + 1 迁移 + 1 计划.

### 2.2 修改 (6 文件)

| 文件 | 改动 |
|---|---|
| `packages/shared/src/validators/entity-relation.ts` | +75 行: 4 新 zod schema (property entry / properties query+update / instances query) |
| `packages/shared/src/types/entity-relation.ts` | +50 行: OntologyInstanceRow / OntologyInstancesResponse / OntologyPropertiesResponse / OntologyPropertyEntry |
| `packages/shared/src/index.ts` | +5 行: 导出新类型 |
| `packages/db/src/migrations/meta/_journal.json` | +7 行: 9013 entry |
| `packages/db/src/schema/index.ts` | +1 行: 导出 ontologyProperties |
| `server/src/app.ts` | +3 行: import + mount |
| `server/src/routes/index.ts` | +1 行: 导出 |
| `clients/api-client/src/types.ts` | +60 行: 4 新响应类型 + OntologyGraphResponse 重塑 (因为 plugin/shared 边形态不一致) |
| `clients/api-client/src/client.ts` | +85 行: 4 新方法 (getOntologyGraph / listOntologyInstances / getOntologyTypeProperties / updateOntologyTypeProperties) |
| `clients/api-client/src/index.ts` | +4 行: 导出新类型 |
| `clients/expo/src/screens/OntologyDomainListScreen.tsx` | 改: 加 4 chip + 长按 → Alert + UUID 行 + 2 callback props |
| `clients/expo/src/screens/PluginManagerScreen.tsx` | 改: 顶部搜索栏 + SectionList 分组 (已启用 / 已停用) |
| `clients/expo/src/screens/OrgAssetsScreen.tsx` | 改: 加 2 callback props + 透传 |
| `clients/expo/App.tsx` | 改: 加 3 screen state (schemaEditorType / instanceGraphType / ontologyWorkbenchOpen) + 倒序退栈 + hasSubHeader + render 3 个新分支 |
| `clients/expo/android/app/build.gradle` | 改: versionCode 608 → 610, versionName 0.6.8 → 0.6.10 |
| `clients/expo/CHANGELOG.md` | 改: 加 v0.6.10 段 |

合计 ~ 400 行修改.

### 2.3 不动 / 推迟

| 项目 | 原因 |
|---|---|
| ❌ `react-native-force-graph` | 需 native rebuild ~30min 阻塞发版 (沿用 wave216 纯 RN + PanResponder) |
| ❌ iOS TestFlight bump | 老板原话 "不动 iOS" |
| ❌ wave235 已抄 5 屏其他部分 | 边界清楚 (OrgAssetsScreen 入口 / wave184 toast 都不动) |
| ❌ wave237 修的 3 端点 | 不重写 (`/ontology/graph` 倒过来被本波复用) |
| ❌ wave230 chip / wave213 Kanban | 不重写 |
| ❌ wave222 算法层 / wave226 quota 锁 | 不重写 |
| ❌ react-native-svg / dagre | 沿用 View 绝对定位 + atan2 (屏 4 缩放用 PanResponder, 不引新 native) |
| ❌ 字段拖拽排序 | react-native-draggable-flatlist 需要 native; 老板要的话单开 wave |
| ❌ 屏 5 的 "从市场安装新插件" 按钮 | App 端 install 流程依赖 npm/git, 仅老板 web 端操作 |

## 3. 关键变更 (wave235 → wave239)

| 维度 | wave235 (前) | wave239 (本波) |
|---|---|---|
| 屏 1 (类型图谱) | 单一列表 + 详情卡 + graph 子页 | 加 4 chip 类别过滤 + 长按 Alert + UUID 行 + 屏 2/3 入口 |
| 屏 2 (实例图谱) | 不存在 | 单类型实例列表 + 负责人过滤 + 1 跳邻居环 + 工作台 FAB |
| 屏 3 (属性编辑) | 不存在 | 字段 CRUD + 类型徽标 + 顶部保存 (dirty) + 校验 |
| 屏 4 (工作台) | 不存在 | 全图沉浸 + PanResponder 缩放 + 4 视图预设 + 浮动工具盘 + 图例 |
| 屏 5 (插件管理) | 列表 + 4 状态过滤 | + 顶部搜索 + SectionList 分组 (已启用 / 已停用) |
| server | 1 个 ontology graph 端点 (wave154/237) | +3 (instances / properties GET+PATCH), activity log `ontology.properties.update` |
| schema | (无字段定义持久化) | 新表 ontology_properties (公司 × 类型 unique, jsonb) |
| api-client | listOntologyDomains / getOntologySnapshot | +4 (getOntologyGraph / listOntologyInstances / getOntologyTypeProperties / updateOntologyTypeProperties) |

## 4. 设计取舍 (关键的几个)

### 4.1 沿用 View 绝对定位画图 (不引 react-native-svg / force-graph)

- wave216 已用纯 View 绝对定位画图, 视觉可用
- react-native-svg 需要 native rebuild (>=10min)
- react-native-force-graph 同理 (wave235 不引理由)
- 屏 4 加了 PanResponder 单指拖 + 双指捏合, scale ∈ [0.4, 2.5]
- OntologyGraphCanvas: deterministic 层级布局 (中心 = 最高度节点, 各类型分层)

### 4.2 属性存哪里? (schema 设计)

**决策**: 新加 `ontology_properties` 物理表, 不写到 ontology_domain 的 metadata json 字段.

理由:
- ontology_node_types 表在 plugin 数据库, 不便跨 schema FK
- jsonb 数组 + schemaVersion 元数据, 单 row upsert
- 公司 × 类型唯一约束 (UNIQUE company_id, type_id)
- PATCH 整 list 替换 (idempotent), 不写 diff (避免客户端 / 服务端 diff 算法不一致)

### 4.3 wave237 端点复用

- `GET /api/companies/:id/ontology/graph` (无 root) 已被 wave237 修成返 flat snapshot
- 本波 屏 4 直接用它做"全图"视图 (mixed preset)
- 屏 2 用 `?depth=2&view=project_tree` 拿 1 跳邻居
- 客户端拿到 `truncated: true` 时顶部 banner 提示

### 4.4 PATCH 只允许 board

- `PATCH /ontology/types/:id/properties` 走 `assertBoard` (沿用 wave156 ontology.backfill 的审计姿态)
- 每次保存写一条 `ontology.properties.update` 活动日志 (含 beforeCount / afterCount / schemaVersion)

### 4.5 字段 key 校验

- 严格正则 `/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/` (服务端正则 + 客户端正则 + TextInput maxLength 三层防线)
- 防止旧 web 端用 `type:uuid` 这类 key 混进显示

### 4.6 屏 5 不引 install 流程

- 服务端 `POST /plugins/install` 需要 npm path / git url
- App 端仅显示 + 启停 + 配置入口
- 装机仍走 web 端, 跟 wave235 设计一致

## 5. QA / 验收对账

### 5.1 typecheck

```
pnpm -r typecheck
→ 51/52 workspace projects (无 expo test workspace) 全部 Done
→ 0 error
```

### 5.2 server tests (本波新增)

```
pnpm exec vitest run server/src/__tests__/ontology-extras-routes.test.ts
→ 6 passed (6)  ✓
   - GET /ontology/instances 列表
   - GET /ontology/instances ownerId 过滤
   - GET /ontology/instances 未知 entityType 400
   - GET /ontology/types/:id/properties 未编辑返空
   - PATCH /ontology/types/:id/properties upsert + schemaVersion 自增
   - PATCH 拒绝非法 key (1-bad-key)

pnpm exec vitest run server/src/__tests__/ontology-graph-routes.test.ts
→ 8 passed (8)  ✓ (wave237 既有)
```

### 5.3 wave239 新增的 5 屏 + 2 组件都有真名/UUID 处理

| 屏 | 处理方式 |
|---|---|
| 屏 1 | UUID 单独行 (长按弹完整 UUID Alert), 复用 wave216 `UUID_RE` / `KEY_UUID_TAIL_RE` / `safeDisplay` |
| 屏 2 | 节点 label 来自 server (server `labelFromRow` 兜底 `(未命名)`, 长度截断), 详情卡 UUID 单行 |
| 屏 3 | typeId UUID 单行 (truncate 36) |
| 屏 4 | 节点 label 来自 server, 颜色按 type 哈希, UUID 在 detail (屏 4 不展示 — 重型屏只看拓扑) |
| 屏 5 | displayName + pluginKey 双行 (沿用 wave235) |

### 5.4 4 护栏

按 [coolie-c5 docs](../../fork-surface-audit.md) 4 护栏:

| 护栏 | 检查方式 | 结果 |
|---|---|---|
| 1. fork-surface gate | `pnpm check:fork-surface` | 通过 — 未改 fork-surface.json 列外文件 |
| 2. token-gate | `pnpm check:token-gates` | 通过 — 本波新组件全部用 ui/tokens.ts (SPACING / RADIUS / FONT_SIZE / TONE / ELEVATION) |
| 3. test gates | `pnpm test:run --group=general-server` | 通过 (14/14 ontology tests) |
| 4. migration safety | `pnpm --filter @paperclipai/db typecheck` | 通过 (9013 已加 journal entry) |

### 5.5 设计系统合规

新组件 `OntologyGraphCanvas` + `SchemaPropertyRow` 全部:
- 用 `ui/tokens.ts` 的 SPACING / RADIUS / FONT_SIZE
- 用 `C.*` 颜色令牌 (ink / accent / line / panel)
- 0 裸 hex / 0 裸 px / 0 Tailwind bracket
- 通过 `pnpm check:token-gates` 脚本

## 6. 范围守住的证据

```bash
git diff --stat HEAD -- clients/expo/src/screens/OntologyDomainListScreen.tsx \
                              clients/expo/src/screens/PluginManagerScreen.tsx \
                              clients/expo/App.tsx
# 仅加 callback props + state + render 分支 + 长按 Alert, 不动 5 屏其他屏
# 的核心逻辑

git diff --stat HEAD -- server/src/routes/ontology-graph.ts
# 0 行 (wave237 端点不动)

git diff --stat HEAD -- packages/db/src/migrations/
# 仅 + 9013_add_ontology_properties.sql + journal entry

git diff --stat HEAD -- clients/expo/src/ui/toast.ts \
                       clients/expo/src/components/ErrorBoundary.tsx \
                       clients/expo/src/components/ToastHost.tsx \
                       clients/expo/src/stores/toast.ts
# 0 行 (wave184 toast 不动)
```

## 7. 4 护栏 / 上线前置

- [x] typecheck 全过
- [x] server 新测试 6/6 pass
- [x] wave237 ontology-graph 测试 8/8 pass
- [x] token-gate 通过
- [x] fork-surface gate 通过
- [x] migration safety 通过
- [x] 不动 wave235/wave237/wave230/wave213/wave222/wave226/wave184
- [x] iOS TestFlight 不 bump (老板原话)
- [x] APK versionCode 608 → 610, versionName 0.6.8 → 0.6.10
- [x] CHANGELOG 加 v0.6.10 段

## 8. 报告给老板

老板, wave239 5 屏一起抄完了 (P1+P2+P3 全), 见 [doc/plans/2026-10-01-wave239-app-ontology-5-screens.md](../../doc/plans/2026-10-01-wave239-app-ontology-5-screens.md).

**5 屏对照 agy 草图**:
- 屏 1: 顶部 4 chip + 长按域卡 → 屏 2/3 入口
- 屏 2: 单类型实例 + 负责人过滤 + 1 跳邻居环
- 屏 3: 字段 CRUD + 类型徽标 + 校验
- 屏 4: 全图沉浸 + 双指缩放 + 视图切换
- 屏 5: 搜索 + 分组

**新加 3 server 端点**: instances 列表 + properties 增删改查 (Board-only 写, 活动日志 `ontology.properties.update`)

**版本**: 0.6.10 (APK versionCode 610, 老板真机安装即可)

**接下来**: 等老板真机装 0.6.10, 跑 5 屏验收. 任何字段拖拽 / react-native-force-graph / iOS 同步等大活单开 wave.
