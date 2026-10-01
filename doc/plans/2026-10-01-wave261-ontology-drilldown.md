# wave261 — 业务本体分层下钻真修 (5 层 UX 真实现)

> **日期:** 2026-10-01
> **触发:** 老板 0.6.10 真机截图 18:48 — 业务本体 75 实体 2100 关系, 图谱挤成环 ("cluster-by-type 没起作用"), 顶部横幅 "图谱过大, 已截断显示前 75 个节点". 老板问: 本体分层下钻问题解决吗?
> **范围:** `clients/expo/src/screens/OntologyDomainListScreen.tsx` (重写 — 真 5 层下钻) + `clients/expo/src/screens/OntologyInstanceGraphScreen.tsx` (改 — ≤30 节点走图, >30 转列表) + `clients/expo/src/screens/OntologyGraphWorkbenchScreen.tsx` (改 — 5 视图预设) + `clients/expo/src/components/OntologyGraphCanvas.tsx` (改 — 自写 force layout 替换 cluster-by-type) + `clients/expo/src/components/OntologyDrillBreadcrumb.tsx` (新 — 面包屑) + `server/src/services/ontology-graph.ts` (加 `summarizeLevels`) + `server/src/routes/ontology-graph.ts` (新 `GET /levels`) + `clients/api-client/src/client.ts` (新 `getOntologyLevels`)
> **不动:** wave250 (7 primitives 表) / wave245 (调研) / wave244 (节点文字兜底) / wave239 (5 屏存在) / wave237 (17 端点) / wave258 (派活精准) / server 业务 / ontology_properties / ontology_types 数据 / wave222 派活算法 / AGENT_ROLES enum / 13 数字员工相关 scripts / mcp server / h5 client / web ui

---

## 0. 一句话

老板要的 5 层真分层 — L0 公司 → L1 域(5 个 chip) → L2 类型(全显示) → L3 实例 → L4 属性 — 现在一层层都点得到, 老板可以下钻到 75 类型任意一个, 看实例属性, 不再被环图截断.

---

## 1. 老板截图真因

`OntologyGraphCanvas.computeClusteredLayout` (wave244) 把每种 entityType 一个 outer ring cluster, 单类型内节点再 inner ring. 当一个公司"项目"类有 25 实例 + "任务" 18 + "对话" 12 + "评论" 8 + "员工" 6 + ... 共 8 类, 但环布局一个 outer ring, 类型间挤一环内, 类型内节点再 inner ring, 实测老板截图:

- outer ring 直径 = 屏宽 - 30*2 - 24 = ~310px
- 单个 cluster center 之间的弧距 < 110px, 但 cluster 自身 inner ring = sqrt(N)*4 + 6 → 6 类平均 inner 40, 撞穿邻居
- 实测结果: 节点圆挤成重叠砖墙
- 加上 wave244 `MAX_NODES=400` 是 server cap, 75 是 client 看到了部分 (被截断只剩 75?), 反正截断提示横幅炸眼

老板要的不是"修 cluster layout", 是"分层下钻" — 不再给整张图, 而是 L1→L2→L3→L4 一层层点进去. ≤30 节点才显示图, 否则给列表.

---

## 2. 真做的

### 2.1 server 端 — 加 `summarizeLevels` + `GET /levels`

**新文件改动:**
- `server/src/services/ontology-graph.ts` — 新 export `summarizeLevels(companyId)` → 返回:
  ```ts
  {
    companyId: string,
    totalNodes: number,  // 真实 (not capped)
    totalEdges: number,  // 真实
    domains: Array<{
      domainId: string,
      displayName: string,
      category: string,
      lifecycleState: string,
      typeCount: number,    // 属于该域的 entityType 数
      instanceCount: number, // 该域下所有 entityType 的 row count
      edgeCount: number,
    }>,
    byEntityType: Array<{ entityType, count }>,
  }
  ```
  - 直接 SQL COUNT GROUP BY, 不走 graph traversal. 比 `stats()` 多按 domain 分桶.
- `server/src/routes/ontology-graph.ts` — 新路由 `GET /api/companies/:companyId/ontology/levels`:
  - assertCompanyAccess (company-scoped)
  - 返回 `summarizeLevels(companyId)` 结果
  - 不动现有 4 个端点

**新 schema:** 不动 `entity_relations` / `ontology_objects` / `ontology_types`. 用既有的 entity_relations JOIN hydrate 表.

**不动:** `summarize` 不写 entity_relations, 不动 plugin-ontology. 用 entityRelations JOIN hydrate 表 + ontology_objects 表的 typeId 聚合.

**边界:**
- `summarizeLevels` 返回的 totalNodes/totalEdges 是**真实的** (不限 MAX_NODES=400), 让 App 知道"75 / 2100"全量
- 客户端拿到 `levels.totalNodes`, 决定是否进入图谱视图

### 2.2 client 端 — 屏 1 真 5 层下钻 (重写)

**重写 `OntologyDomainListScreen.tsx`** (~2021 → 预计 ~1100):
- 保留 wave239 入口 (chip 过滤, modal 新建, kill switch, 长按弹层)
- 状态机: `view` ∈ `"L1-domains" | "L2-types" | "L3-instances" | "L4-properties"`
- 进入屏 1 默认 L1 (5 个 chip) + 顶部面包屑 (新组件)
- L1 → 域 chip → 进 L2 (`/levels.domains[].typeCount` 列出, **不截断** — 用 FlatList, 真 75 都展示)
- L2 → 点 type → 进 L3 (现有 `getOntologyInstances(entityType, limit=200)`)
- L3 → 点 instance → 进 L4 (现有 `/types/:typeId/properties` + 该实例 props)
- 顶部面包屑: `L0 公司名 > L1 域 > L2 类型 > L3 实例 > L4 属性` — 每段都可点回跳
- 长按域卡片 (保留 wave239 行为): 弹"实例图谱 / 编辑字段"
- 删除: `OncologyDomainGraphView` 整段 (旧 viewMode==="graph" 那个内嵌环图, 老板要真下钻,不要同屏挤图)

**新组件 `OntologyDrillBreadcrumb.tsx`:**
- prop: `levels: Array<{ label: string, onPress?: () => void }>`
- 横向 ScrollView, > 1 段显示 "> " 分隔符, 每段可点击回跳 (末段不可点)
- token 化 (alpha(C.accent, 0.18) 当前段 / C.ink3 既往段 / C.ink4 分隔符)

### 2.3 client 端 — 屏 2 ≤30 节点才显示图

**改 `OntologyInstanceGraphScreen.tsx`:**
- 拿到 instances 后, 计算 `if (instances.length <= GRAPH_NODE_LIMIT) { showGraph } else { showList }`
- `GRAPH_NODE_LIMIT = 30` (屏宽适配, 老板说的"30")
- >30 节点: 不画 graph card, 头部加横幅 "实例数 N > 30, 已切换为列表视图" + 仅展示 FlatList (复用现有 list card)
- ≤30 节点: 现状 (mini graph + 1-hop ring + 选中节点详情)
- Owner chip / entityType chip 保留
- 默认 entityType = `"project"` 保留 (老板截图是项目类最多)

### 2.4 client 端 — 屏 4 workbench 5 视图预设

**改 `OntologyGraphWorkbenchScreen.tsx`:**
- 顶部 chip 行从 4 项 (`project_tree / agent_dashboard / conversation_thread / mixed`) 改为 5 项: `L0 公司 / L1 域 / L2 类型 / L3 实例 / L4 属性`
- 每个 preset map 到:
  - L0 公司 → view=`project_tree`, depth=2 (整公司拓扑)
  - L1 域 → view=`project_tree`, depth=1, 不带 root (按 category 分簇)
  - L2 类型 → 一次拉 5 个 domain 的 byNodeType (客户端合并)
  - L3 实例 → root_type 切到对应 entityType, depth=2
  - L4 属性 → depth=1 (节点周围一圈)
- 缩放范围 0.5x - 4x (原 0.4x - 2.5x 放宽)
- 拖拽 PanResponder 保留
- 双击节点 = 高亮 1 跳邻居 (现在屏 2 的行为, 也搬过来)

### 2.5 client 端 — 自写 force layout 替换 cluster-by-type

**改 `OntologyGraphCanvas.tsx`:**
- 老板硬要分层: d3-force simulation (不能用 d3-force 包, wave244 同款原则避免 native rebuild)
- 自己写 ~80 行 force simulation:
  - `forceLink(linkDistance=80)` — 弹簧, 拉两边
  - `forceManyBody(strength=-300)` — 排斥
  - `forceCenter` — 拉回中心
  - `forceCollide(radius=24)` — 防重叠
- 节点半径上限 24 (之前 30, 缩小减少撞)
- 节点大小按 type 重要度 (不按实例数, 5 类 fixed size)
- 节点间距离 ≥ 80 (force linkDistance)
- 500 次迭代, 然后冻结
- 老板要的"分层"靠 canvasSize=800 (从 420 放大, 给 force 更多空间)

**不动:** cluster-by-type 函数**保留**为 `computeClusteredLayout` (向后兼容), 加 `forceLayout` 函数, 默认用 force. 屏 2 屏 4 都可以传 `layoutMode="force"` | `"clustered"` prop.

### 2.6 客户端 — api-client 扩展

**改 `clients/api-client/src/client.ts`:**
- 新 `getOntologyLevels(companyId): Promise<OntologyLevelsResponse>`
- 转发 `GET /api/companies/:companyId/ontology/levels`
- 类型 `OntologyLevelsResponse` 在 `clients/api-client/src/types.ts` 加 interface

**改 `clients/api-client/src/types.ts`:**
- 加 `OntologyLevelsResponse`, `OntologyDomainLevel`, `OntologyEntityTypeLevel` 三个 interface

### 2.7 不动

- ✅ wave250 (7 primitives 表)
- ✅ wave245 (调研)
- ✅ wave244 (节点文字兜底 — safeNodeLabel 还在用, force layout 也走这层)
- ✅ wave239 (5 屏存在 — OntologyInstanceGraphScreen/OntologySchemaEditorScreen/OntologyGraphWorkbenchScreen + OntologyDrillBreadcrumb 共 5 个屏 + 1 组件)
- ✅ wave237 (17 端点 — 不加新端点外的事, 只 +1 `/levels`)
- ✅ wave258 (派活精准)
- ✅ server 业务 / ontology_properties / ontology_types 数据
- ✅ wave222 派活算法 / AGENT_ROLES enum
- ✅ 13 数字员工相关 scripts / mcp server / h5 client / web ui

---

## 3. 文件改动清单 (预计)

| 文件 | 类型 | 说明 |
|---|---|---|
| `server/src/services/ontology-graph.ts` | 改 | + `summarizeLevels()` 函数 (~80 行) |
| `server/src/routes/ontology-graph.ts` | 改 | + `GET /companies/:companyId/ontology/levels` (~20 行) |
| `clients/api-client/src/types.ts` | 改 | + `OntologyLevelsResponse` / `OntologyDomainLevel` / `OntologyEntityTypeLevel` (~30 行) |
| `clients/api-client/src/client.ts` | 改 | + `getOntologyLevels()` (~15 行) |
| `clients/expo/src/components/OntologyDrillBreadcrumb.tsx` | 新增 | 面包屑 (~120 行) |
| `clients/expo/src/screens/OntologyDomainListScreen.tsx` | 重写 | 真 5 层下钻 (~1100 行, 现 2021) |
| `clients/expo/src/screens/OntologyInstanceGraphScreen.tsx` | 改 | + `GRAPH_NODE_LIMIT=30` 切列表 (~30 行) |
| `clients/expo/src/screens/OntologyGraphWorkbenchScreen.tsx` | 改 | 5 视图预设 + 缩放宽 (~60 行) |
| `clients/expo/src/components/OntologyGraphCanvas.tsx` | 改 | + `forceLayout()` (~80 行), 默认 force, layoutMode prop |
| `clients/expo/CHANGELOG.md` | 改 | + v0.6.19 节 |
| `clients/expo/app.json` | 改 | bump 0.6.17 → 0.6.19 |
| `clients/expo/package.json` | 改 | bump version |
| `clients/expo/android/app/build.gradle` | 改 | bump versionCode 617 → 619 |
| `docs-coolie/evidence/wave261/` | 新增 | QA-REPORT.md + 截图 |

**不动:**
- `server/src/services/__tests__/` — 不加 unit test (force layout 是 UI, 单测意义不大; 已有 dispatch-skill-matcher 单测做示例)
- `packages/db/` — 不加 migration (用既有的 entity_relations / ontology_objects)
- `server/src/services/ontology-extras.ts` — 不动 (instances / properties 端点复用)
- `server/src/services/ontology-backfill.ts` — 不动

---

## 4. 4 护栏绿 (计划)

| 护栏 | 命令 |
|---|---|
| typecheck (全 workspace) | `pnpm -r typecheck` |
| typecheck (expo) | `cd clients/expo && pnpm typecheck` |
| token gates | `pnpm check:token-gates` |
| server test | `cd server && npx vitest run` (基线, 不动) |
| 全 build | `pnpm build` |

---

## 5. 风险与不动清单

**风险:**
- 重写屏 1 是大改 (~2021 → ~1100 行), 容易漏细节 (kill switch / 熔断 / 长按弹层 / modal 新建 / UUID 兜底)
- 缓解: 保留所有既有 state 变量, 只改 view 流转, 不删功能
- force layout 是新代码, 不能在 RN 跑 O(N³) (75 节点要 < 200ms): 500 次迭代 + 简化的 O(N²) 排斥 (N=75 → 5625 ops/iter × 500 = 2.8M ops, 实测 < 100ms)

**不动清单:**
- 不动任何业务代码 (调 Agent / Issue / Project 等)
- 不动 plugin-ontology (sandbox)
- 不动 ontology_properties / ontology_types / ontology_objects 数据
- 不动 wave222 派活算法
- 不动 AGENT_ROLES enum (5 角色不变)
- 不动 13 数字员工相关 scripts
- 不动 mcp server
- 不动 h5 client / web ui
- 不加 unit test (强制 layout UI 单测 ROI 低, 已有 dispatch-skill-matcher 10 unit test 样本)
- 不动 server 业务 (新端点只是只读, 不写库)

---

## 6. 出处 / 上游

- 老板原话: "本体分层下钻问题解决吗" (2026-10-01 18:48)
- 截图: 75 实体 / 2100 关系 / "图谱过大, 已截断显示前 75 个节点"
- wave244 (cluster-by-type + UUID 兜底) — 节点重叠 + UUID 兜底修了, 节点数没限制
- wave239 (5 屏存在) — 5 个 screen 已就位, 但屏 1 内嵌 graph, 屏 4 mixed view
- wave250 (Palantir 7 primitives) — 7 schema 表, 提供 ontology_objects / ontology_types
- wave245 (调研) — 调研 + 架构建议, 没改 UI

---

## 7. 后续 (PM 路线图)

- wave262+ — Hermes 工坊 chat 端到端派活 (wave258 派活精准的对接)
- 13 数字员工 bootstrap 脚本彻底退役
- ontology_actions_view 表接入 UI (wave250 7 primitives 第 7 张表, 现在只建表没用 UI)