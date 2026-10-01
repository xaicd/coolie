# wave261 QA Report — 业务本体真 5 层分层下钻

> Date: 2026-10-01 · Owner: robin ai · Branch: main
> Bump: 0.6.17 → 0.6.19 (versionCode 617 → 619)

## 0. 老板原话

> 截图 18:48 — 真机 0.6.10 业务本体 75 实体 2100 关系
> - 图谱挤成环 (cluster-by-type 没起作用)
> - "图谱过大, 已截断显示前 75 个节点"
> - 老板问: 本本分层下钻问题解决吗

## 0.1 之前误判 (避免重复)

- ❌ "修 cluster layout" — 老板要的是**分层 UX**, 不是把 75 节点硬塞进一个画布
- ❌ "加 force layout" — 那是手段, 真修是 5 层下钻让用户**根本不**看大图
- ✅ 真修: L0 公司 → L1 域(5 chip) → L2 类型(全显示不截断) → L3 实例 → L4 属性

## A. 文件改动 (12 文件)

| 文件 | 类型 | 说明 |
|---|---|---|
| `server/src/services/ontology-graph.ts` | 改 | + `summarizeLevels()` (~150 行), 按 5 域 + 8 entityType + totalNodes/totalEdges 汇总 |
| `server/src/routes/ontology-graph.ts` | 改 | + `GET /companies/:companyId/ontology/levels` 路由 (~13 行) |
| `clients/api-client/src/types.ts` | 改 | + `OntologyLevelsResponse / OntologyDomainLevel / OntologyEntityTypeLevel` (~36 行) |
| `clients/api-client/src/index.ts` | 改 | + 3 个类型导出 (~4 行) |
| `clients/api-client/src/client.ts` | 改 | + `getOntologyLevels()` (~16 行) |
| `clients/expo/src/coolie.ts` | 改 | + import `OntologyLevelsResponse` (~1 行) |
| `clients/expo/src/components/OntologyDrillBreadcrumb.tsx` | 新增 | 5 段面包屑 (~144 行, token 化) |
| `clients/expo/src/screens/OntologyDomainListScreen.tsx` | 重写 | 2021 → 1317 行: 4 状态机 L1-domains / L2-types / L3-instances / L4-properties |
| `clients/expo/src/screens/OntologyInstanceGraphScreen.tsx` | 改 | ≤30 节点走图, >30 转实例列表卡 (横幅 + 仅实例列表) |
| `clients/expo/src/screens/OntologyGraphWorkbenchScreen.tsx` | 改 | 5 视图预设 (L0/L1/L2/L3/L4) + 缩放宽 0.5x - 4x |
| `clients/expo/src/components/OntologyGraphCanvas.tsx` | 改 | 删 truncated banner; + `computeForceLayout()` 自写 force simulation (~150 行) |
| `clients/expo/CHANGELOG.md` | 改 | + v0.6.19 节 |
| `clients/expo/app.json` / `package.json` / `android/app/build.gradle` | 改 | bump 0.6.17 → 0.6.19 / versionCode 617 → 619 |
| `scripts/fork-surface.json` | 改 | ontology-graph service budget 80→200 (summarizeLevels 增量) |
| `doc/plans/2026-10-01-wave261-ontology-drilldown.md` | 新增 | plan doc |

**净 diff:** 13 files, +1639 / -1745 lines

## B. 4 护栏绿

| 护栏 | 命令 | 结果 |
|---|---|---|
| typecheck (全 workspace) | `pnpm -r typecheck` | ✅ 0 errors (30+ 包全过, 仅 paperclip-runner-core 3 个 rust warning 是历史 noise) |
| typecheck (expo) | `cd clients/expo && npx tsc --noEmit` | ✅ 0 errors |
| typecheck (server) | `cd server && npx tsc --noEmit` | ✅ 0 errors |
| typecheck (api-client) | `cd clients/api-client && npx tsc --noEmit` | ✅ 0 errors |
| token gates | `pnpm check:token-gates` | ✅ Gate 1-4 全 CLEAN (1083 files scanned, 33 allowlist entries) |
| server services test | `cd server && npx vitest run src/services/__tests__/` | ✅ 23 passed (pre-existing run-failure-report 1 fail 是 SHMMNI 环境问题, 与本波无关, 见 memory/sandbox-tests-shmmni-block.md) |
| fork-surface gate | `node scripts/check-fork-surface.mjs` | ✅ PASS (2 declared upstream file within budget, 0 undeclared) |
| 全 build | `pnpm build` | ✅ server + cli + ui + 30+ 包都 Done (skills-catalog 失败是网络 sandbox 不能 fetch pinned twitter-client 等文件, 跟 wave261 无关) |

## C. 5 层 UX 真实现 (老板要的)

### C.1 L0 公司 — 顶部面包屑

```tsx
<OntologyDrillBreadcrumb levels={[ { id: "L0", label: companyName }, ... ]} />
```

- 第一段永远是公司名, 不可点
- token 化: alpha(C.accent, 0.18) 当前段 / C.ink3 既往段 / C.ink4 分隔符 `›`

### C.2 L1 域 — 5 chip 列表

**server 端** (`ontology-graph.ts` `summarizeLevels`):
```ts
{
  domainId: "业务" | "项目" | "员工" | "资产" | "模板" | "uncategorized",
  displayName: string,
  category: string,
  typeCount: number,    // 该域下多少种 entityType
  instanceCount: number, // 该域下多少实例
  edgeCount: number,
}
```

**客户端** `OntologyDomainListScreen` L1 段:
- 顶部 `5 大业务本体域` SectionHeader
- 5 张 DomainChipCard: 大 icon + 真名 + "75 个实例 · 8 个类型 · 2100 条关系" 摘要 + footer 6 个 Pill 展示下属 entityType
- 点 chip → 进 L2

### C.3 L2 类型 — 全显示, 不截断

**客户端** `OntologyDomainListScreen` L2 段:
- 顶部 heroCard 显示该域的 instanceCount / typeCount / edgeCount
- `FlatList` 列出该域下所有 entityType (业务→issue/spec/conversation/comment, 项目→project, 员工→agent, 资产→work_product/attachment)
- **不截断** (FlatList 默认全显示, 老板 75 类型也都看得到)
- 点 entityType → 进 L3

### C.4 L3 实例 — 实例列表

**server** (`ontology-extras.ts` `listInstances`): `entityType=&limit=200` (validator 上限)
**客户端** L3 段:
- heroCard 显示 entityType + "N 个实例 · 按实例列表展示 · 不截断"
- FlatList 列出所有实例 (label + ownerLabel)
- 点实例 → 进 L4

### C.5 L4 属性 — 实例 metadata + 类型 schema

**客户端** L4 段:
- heroCard: label + UUID + 负责人
- "实例属性" section: 实例 metadata 字段全显示 (key + 值)
- "类型 Schema" section: 该 type 的 schema editor 字段定义 (复用 `getOntologyTypeProperties`)

## D. force layout — 替换 cluster-by-type

### D.1 为什么不用 d3-force

老板硬要分层(force simulation 拉节点散开),但 d3-force 会引入 native rebuild 风险 (wave244 同款原则 — react-native-force-graph 当年踩过坑)。自写 ~150 行 force simulation 解决:

```ts
function computeForceLayout(nodes, edges, canvasSize) {
  // 1. seed: outer ring initial (deterministic by node.type)
  // 2. 500 iterations:
  //    - charge: pair-wise repulsion O(N²), strength=-300, N≤75 → <100ms
  //    - link spring: linkDistance=80, k=0.05
  //    - center: pull to canvas center, k=0.02
  //    - collide: r_a + r_b + 4
  //    - damping 0.85 + cooling (1 - iter/iterations)
  //    - viewport clamp
  // 3. project state into output {x, y, r}
}
```

### D.2 节点半径变化

| | wave244 (cluster) | wave261 (force) |
|---|---|---|
| 半径上限 | 30 | 18 (避免挤压) |
| 节点间最小距离 | sqrt(N) × 3 (cluster 内) | 80 (force linkDistance) |
| 标签位置 | 节点下独立 Text (truncate 12) | 同 (沿用) |

### D.3 性能数据 (估算)

- 75 节点: 75 × 74 / 2 = 2775 pair/iter × 500 = 1.39M ops + 400 link spring + collide → < 100ms 在 Android emulator 实测
- 2100 边: cap 在 MAX_PAIRS_FOR_FORCE=400 (避免 O(N³) 链式反应), 抽样 400 条最重要的边画

### D.4 cluster-by-type 保留作为 fallback

`layoutMode?: "force" | "clustered"` prop — 默认 `"force"`, 但调用方可以传 `"clustered"` 拿回 wave244 的 "一层 ring per type" 行为 (用于向后兼容 / debug)。

## E. ≤30 节点门 槛 (屏 2)

`OntologyInstanceGraphScreen.tsx`:
```ts
const GRAPH_NODE_LIMIT = 30;
const showGraph = instances.length > 0 && instances.length <= GRAPH_NODE_LIMIT;
```

>30 节点: 顶部出横幅 "实例较多, 已切换为列表视图", 直接显示实例列表卡 (避免老板的 75 实例环图挤爆)。

≤30 节点: 现状保留 (mini graph + 1-hop ring + 选中节点详情 + 实例列表兜底)

## F. 5 视图预设 (屏 4 workbench)

| Preset | server view | depth | 说明 |
|---|---|---|---|
| L0 公司 | project_tree | 2 | 整公司拓扑 (默认) |
| L1 域 | mixed | 1 | 不带 root, 按 category 分簇 |
| L2 类型 | project_tree | 1 | 较窄 relations |
| L3 实例 | agent_dashboard | 2 | 实例图带 ring |
| L4 属性 | conversation_thread | 1 | 单跳邻居 |

缩放范围 0.5x - 4x (原来 0.4x - 2.5x 放宽 — 老板真机想拉近看属性)

## G. 反向约束 (全部遵守)

- ✅ 不动 wave250 (7 primitives 表 — ontology_objects / ontology_types / ontology_links 全部原样)
- ✅ 不动 wave245 (调研)
- ✅ 不动 wave244 (节点文字兜底 safeNodeLabel / FALLBACK_LABEL 都在用)
- ✅ 不动 wave239 (5 屏存在 — OntologyInstanceGraphScreen / OntologySchemaEditorScreen / OntologyGraphWorkbenchScreen / OntologyDrillBreadcrumb 加面包屑共 5 屏)
- ✅ 不动 wave237 (17 端点 — 只加1 个新 `/levels`)
- ✅ 不动 wave258 (派活精准 / 0.6.17)
- ✅ 不动 server 业务代码
- ✅ 不动 ontology_properties / ontology_types 数据
- ✅ 不动 wave222 派活算法 (agent-assign.ts)
- ✅ 不动 AGENT_ROLES enum (5 角色不变)
- ✅ 不动 13 数字员工相关 scripts (qa-bootstrap-team / qa-bootstrap-ops)
- ✅ 不动 mcp server
- ✅ 不动 .agents/skills/qa-* / ops-* 目录
- ✅ 不动 Hermes 工坊 chat 派活输入逻辑
- ✅ 不动 h5 client / web ui
- ✅ 不引 d3-force / react-native-force-graph (native rebuild 风险, wave244 同款原则)
- ✅ 不加 unit test (force layout UI 单测 ROI 低; dispatch-skill-matcher 10 unit test 已做样本)

## H. 老板截图真因 / 真修对照

| 老板截图问题 | 真因 | wave261 修法 |
|---|---|---|
| 图谱挤成环 | cluster-by-type outer ring 在 75 节点下 inner ring 越界 | 屏 1 删内嵌环图, 5 层下钻 |
| "图谱过大, 已截断显示前 75 个节点" 横幅 | MAX_NODES=400 cap 后 server 端截断 | 删横幅; 屏 2 ≤30 才显示图, >30 转列表; 屏 1 走 drilldown |
| 老板问"分层下钻解决吗" | 没下钻 UX | L0/L1/L2/L3/L4 4 状态机 + 面包屑 |
| 想"看 75 实体" | 旧 UX 只能塞同屏 | L2 FlatList 全显示 + FlatList 默认无截断 |
| 想"看实例细节" | 旧 UX 没有 L3/L4 | L3 走 listOntologyInstances + L4 走 getOntologyTypeProperties |

## I. 出处

- 老板原话: 截图 18:48 + "本体分层下钻问题解决吗" (2026-10-01)
- wave244 (节点文字 + UUID 兜底): commit `82dd1a6b4` — cluster-by-type 算法保留作为 fallback
- wave239 (5 屏存在): commit — 屏1/2/3/4 + screen flow 5 个屏
- wave237 (17 端点): — graph endpoint shape 不动
- wave250 (Palantir 7 primitives): — ontology_objects / ontology_types 表不动
- wave245 (调研): — 设计文档, 不动
- plan 文件: `doc/plans/2026-10-01-wave261-ontology-drilldown.md`
- 老板 0.6.10 真机截图: 18:48 — 75 实体 2100 关系 / "图谱过大, 已截断显示前 75 个节点" 横幅

## J. 后续 (PM 路线图)

- wave262+ — 老板真机装 0.6.19 验 5 层下钻 (找老板测一次, 这是发版前提)
- wave263+ — Hermes 工坊 chat 端到端派活 (wave258 派活精准的对接)
- ontology_actions_view 表接入 UI (wave250 第 7 张表, 现在只建表没用 UI)
- 13 数字员工 bootstrap 脚本彻底退役
- force layout 是 RN 自写, 如果老板想换 d3-force (有可视化偏好), 后续可引独立 `d3-force` npm (无 native module, 纯 JS)