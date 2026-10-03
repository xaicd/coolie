# wave244 QA Report — 本体图谱看的痛苦

> **日期:** 2026-10-01
> **commit:** 2af8fb2b3 (push origin main ok)
> **trigger:** 老板 13:15 真机 0.6.10 截图 — 75 实体 + 2100 关系下节点严重重叠 + 文字截断

## 1. 4 护栏 (CI gate)

| 护栏 | 状态 | 备注 |
|---|---|---|
| typecheck (`pnpm -r typecheck`) | ✅ | server + cli + expo + packages 全部绿 |
| vitest (ontology 相关) | ✅ | ontology-graph-routes 8/8, ontology-extras-routes 6/6, ontology-spec 12/12 全绿 |
| pre-existing 失败 | ⚠️ | `claude-local-execute.test.ts` (3 fail) + `agent-avatars.test.ts` (1 fail) — stash 验证改动前即 fail, 与 wave244 无关 |
| build (`pnpm --filter @paperclipai/server build`) | ✅ | server build 0 错 |
| fork-surface (`scripts/check-fork-surface.mjs`) | ✅ | 0 upstream-owned 文件在预算内 |

## 2. 改动清单 (5 文件 + 3 版本号 + 1 plan)

```
M  clients/expo/app.json                                  (0.6.10 → 0.6.12)
M  clients/expo/package.json                              (0.6.13 → 0.6.12 修回)
M  clients/expo/android/app/build.gradle                  (versionCode 610→612, versionName 0.6.10→0.6.12)
M  clients/expo/src/components/OntologyGraphCanvas.tsx    (deterministic shell → cluster-by-type)
M  clients/expo/src/screens/OntologyDomainListScreen.tsx  (抽 OntologyDomainGraphView 子组件 + 调 OntologyGraphCanvas + pan/zoom)
M  clients/expo/src/screens/OntologyInstanceGraphScreen.tsx (按 ownerId cluster + 节点内序号 + label 移出 + pan/zoom)
M  server/src/services/ontology-graph.ts                 (hydrate 加 safeNodeLabel/safeTitle + UUID_RE 最后兜底)
A  doc/plans/2026-09-30-wave244-ontology-graph-ux.md       (本计划)
```

iOS bundle **不动** (按 brief 要求)。

## 3. 修法 5 屏对应

### 屏 1 — `OntologyDomainListScreen` 关系图谱拓扑视图
- 旧: deterministic layered shell, 节点半径 34, 文字 inline, 重叠严重
- 新: 抽 `OntologyDomainGraphView` 子组件, 调 `OntologyGraphCanvas`
- cluster-by-type (按 `entity_type` 类型分组)
- canvas 340 → 420
- 加 PanResponder 单手指 pan + 两指 zoom (scale [0.5, 2.2])
- `react-hooks/rules-of-hooks` 合规 (子组件隔离)

### 屏 2 — `OntologyInstanceGraphScreen` 实例图谱
- 旧: `computeRingPositions` 单环 + 节点宽 48 + label inline 8 char
- 新: `computeClusteredPositions` 按 ownerId 分簇 + 节点内序号 + label 移出 12 char
- canvas 320 → 420 (与屏 1 视觉一致)
- 加 PanResponder 单手指 pan + 两指 zoom

### 屏 4 — `OntologyGraphWorkbenchScreen` (工作台)
- **不动** — 已有 pan/zoom/legend, 复用 `OntologyGraphCanvas` 自动获得 cluster 改进

### server `ontology-graph.ts` hydrate
- 新增 `safeNodeLabel(value, fallback)`: 空字符串 + UUID 形都走 fallback
- 新增 `safeTitle(value, fallback)`: 仅当整段是 UUID 形才替换 (允许 issue `PC-123 <title>` 嵌入)
- 每个 type 的 put 路径走 safeLabel:
  - `project` / `conversation` / `work_product` / `agent` → safeNodeLabel
  - `issue` / `spec` → safeTitle (允许 identifier 嵌入)
  - `attachment` / `comment` 已 wave163 修过, 不再加固
- result loop 加最后兜底: `existing.label` 仍 UUID → 替换为 `未命名 X`

## 4. 真机验证步骤 (老板)

1. 装 0.6.12 APK (重 build 见 release skill)
2. 进 OrgAssets → 本体域 → 任一域 → 关系图谱
3. 期望:
   - 节点之间有空隙, 不再 9 个圆叠在一起
   - 节点内显示 1..N 序号, 不再显示截断的中文名
   - 节点下方是中文真名 (truncate 12 char)
   - 双指缩放, 单指拖动
4. 退出回详情, 长按域 → 实例图谱
5. 期望: 同一组改进 + 1 跳邻居连线仍正常高亮

## 5. 风险

| 风险 | 概率 | 缓解 |
|---|---|---|
| cluster 算法画到画布外 (远离中心的 cluster + 较大 inner ring) | 中 | `effectiveInnerR` clamp 到 `Math.min(cx, cy) - PAD - distFromCanvasCenter + Math.min(cx, cy)`, 极端 case 半径自动收缩 |
| 子组件命名冲突 (`OntologyDomainGraphView`) | 0 | 文件内私有, 无 export |
| pan/zoom 与 ScrollView 手势冲突 | 中 | 屏 1/2 的图谱不在 ScrollView 内 (屏 2 的列表是分开的 ScrollView); PanResponder 优先级覆盖子级 |
| ontology 测试 fixture 漏改 | 低 | 跑过 3 个测试全绿 |

## 6. 不动 (按 brief)

- wave237 (17 端点修)
- wave242 (chip 修)
- wave243 (OTA 升级提示)
- wave239 其他屏 (3+5)
- wave230
- `OntologyGraphWorkbenchScreen` 屏 4
- `OntologyDomainListScreen` 屏 1 之外的代码 (列表/详情/熔断/新建)
- `OntologyInstanceGraphScreen` 屏 2 之外的代码 (owner chip / entity chip / 列表 / detail 卡)
- ScreenContainer / AGENT_ROLES / wave222 算法层