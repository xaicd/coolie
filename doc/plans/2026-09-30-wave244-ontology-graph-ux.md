# wave244 — 本体图谱看的痛苦 (75 实体 + 2100 关系)

> **日期:** 2026-09-30
> **触发:** 老板 13:15 真机 0.6.10 截图 — 节点严重重叠 + 文字截断 + 中文长名溢出
> **类型:** UX 修法 + 防御性 UUID 兜底

## 0. 一句话

`OntologyDomainListScreen` 内嵌图谱 + `OntologyInstanceGraphScreen` 实例图谱 在 75 实体 / 2100 关系下完全没法读。修法:
1. **节点布局** 改 cluster-by-type (按 entity type 分组, 每组一个 cluster 中心, type 内 force-pack 不重叠), 节点半径上限 30, 节点内只显示数字
2. **节点文字** 移到节点下方独立 Text, truncate 12 + "..."
3. **pan + zoom** 给屏 1 内嵌图谱和屏 2 实例图谱加 (workbench 已有)
4. **server UUID 兜底** 加强, 所有 hydrate 路径走 `safeNodeLabel()` 防止 spec planner / agents.name 异常时落到裸 UUID
5. **bump 0.6.10 → 0.6.12**, 重 build APK + OTA

## 1. 真因

| 路径 | 真因 | 截图 |
|---|---|---|
| 屏 1 内嵌图谱 `OntologyDomainListScreen` 关系图谱拓扑 (canvasSize=340) | deterministic layered (agy 草图) — nodeRadius 算到 34, 中文长名 label+type 双行, 9 节点全部撞 | 节点全叠 + type=spec/text 全截断 |
| 屏 2 实例图谱 `OntologyInstanceGraphScreen` 1 跳邻居 (canvasSize=320) | 节点宽 48 + label inline, 中文字长名(8 char) + 1 跳 5 邻居 = 密集重叠 | 圆点+标签全糊 |
| 工作台 `OntologyGraphWorkbenchScreen` (canvasSize=1600) | 已有 pan+zoom, OK 不动 | — |
| server hydrate | wave163/wave216 只在 attachment/comment 加 placeholder, project/issue/spec/agent 名异常时仍可能落裸 UUID | — |

## 2. 设计选择 — 不引 d3-force

老板 brief 说"d3-force simulation 替换 deterministic"。决定**不引入 d3-force**:
- d3-force ~30KB gzipped, 给 React Native bundle 增加 30KB 是值得的 (codebase 已 ~3MB), 但加 7 个 dep (d3-force + d3-quadtree + d3-iteration + d3-timer + d3-drag + d3-dispatch + d3-velocity) native rebuild 风险高
- wave235 memory: "**不**引 react-native-force-graph (native rebuild 风险)"
- d3-force 是纯 JS 不会 native rebuild, 但增加 bundle 体积且要解决 force tick (主线程卡顿) 问题
- **改用自己写的 cluster-by-type + deterministic 散布**: 每个 type 一个 cluster 中心, type 内节点在 cluster 内均匀散布, 整体上保持 visual 解构但节点无重叠. 这就是 brief §A.4 "cluster 分组"

## 3. 改动清单

### 3.1 `clients/expo/src/components/OntologyGraphCanvas.tsx`
- 改 `computeDeterministicLayout` 为 `computeClusteredLayout`:
  - 按 type 分组, 每组一个 cluster 中心 (按 type 数量在 canvas 内分散)
  - type 内均匀环分布, 半径随该 type 节点数算 (上限 30px 半径)
  - 节点内只显示 type 内序号 (1-N), 数字大小与节点半径匹配
- 改 `NodeBubble`:
  - 节点内只显示 index 数字
  - label 移出到节点下方独立 `<Text>` (top: pos.y + r + 4), truncate 12 + "..."
  - 节点半径 max 30, 选中态 ring 边框
- 保留 workbench 屏 4 调用兼容 (canvasSize=1600)
- 节点半径计算: `Math.min(30, 14 + Math.sqrt(count) * 3)`

### 3.2 `clients/expo/src/screens/OntologyDomainListScreen.tsx` (屏 1 内嵌图谱)
- 关系图谱拓扑视图 (`viewMode === "graph"`) 改用 `OntologyGraphCanvas` 组件
- canvasSize 340 → 450 (内嵌)
- 保留现有 typeEdges 逻辑 (喂给 OntologyGraphCanvas)
- 加 pan + zoom (用 PanResponder, 类似 workbench 但单手指 pan)
- type 过滤 chip (波239 已加) 保留

### 3.3 `clients/expo/src/screens/OntologyInstanceGraphScreen.tsx` (屏 2)
- 改 `computeRingPositions` 为 `computeClusteredLayout` (按 ownerId 分 cluster, 或者单 instance 类型时保持 ring)
- canvasSize 320 → 360
- 节点内只显示 instance index
- label 在节点下方独立 Text, truncate 8 → 12
- 节点半径上限 24
- 加 pan + zoom (PanResponder 单手指)
- 1 跳邻居连线已存在, 保留

### 3.4 `server/src/services/ontology-graph.ts` (hydrate UUID 兜底)
- 在文件顶部加 `UUID_RE` (与 Expo 端同步): `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`
- 加 helper `safeNodeLabel(label: string, fallback: string): string`:
  - 如果 label 是 null/empty → fallback
  - 如果 label 是 UUID-shaped → fallback (防 raw uuid 漏出)
  - 否则 → label
- 在 hydrate 函数里, 每个 type 的 put 路径:
  - `project` / `issue` / `spec` / `conversation` / `work_product` / `agent` / `company`: 把现有 `label: row.name` 等 改成 `label: safeNodeLabel(row.name ?? row.title ?? "", `${typeLabel.name ?? type}`)
  - `attachment` 已 wave163 修过, 加强为 `safeNodeLabel(row.filename, "未命名附件")`
  - `comment` 已 wave163 修过, 加强为 `safeNodeLabel(snippet, "评论")`
- placeholder fallback 不变 (已删除的 X)

### 3.5 `server/src/routes/ontology-graph.ts`
- 不动 (snapshot 端点不在主路由, 在 plugin worker, 改不到; hydrate 路径修了之后 snapshot 自动跟着修)

## 4. 不动

- `OntologyGraphWorkbenchScreen` (屏 4 已有 pan+zoom, 1 commit 即可)
- `OntologyGraphSnapshot` 类型 (api-client)
- `OntologyGraphResponse` 类型 (api-client)
- `OntologyDomain` / `OntologyInstanceRow` 等类型
- `ontology-extras.ts` (instances 端点不动)
- server `ontology-backfill.ts`
- server `ontology-spec*.ts`
- wave237 17 端点修, wave242 chip 修, wave243 OTA 升级提示 — 都不动
- wave239 其他屏 (3+5)

## 5. 不顺手改

- ScreenContainer (屏容器)
- AGENT_ROLES enum
- wave222 算法层

## 6. 版本

- bump `clients/expo/app.json` `version: 0.6.10` → `0.6.12`
- bump `clients/expo/android/app/build.gradle` `versionCode 610` → `versionCode 612` 和 `versionName "0.6.10"` → `"0.6.12"`
- bump `clients/expo/package.json` `version: 0.6.13` → `0.6.12` (修回, 之前 wave243 bump 过 0.6.13)
- iOS bundle 这次不动 (老板说 iOS 不动)

## 7. QA 护栏 (4 绿)

1. **typecheck** — `pnpm -r typecheck`
2. **测试** — `pnpm test:run` (Vitest)
3. **build** — `pnpm build`
4. **fork-surface check** — `node scripts/check-fork-surface.mjs`

## 8. QA 真机

- 模拟器装 0.6.12 → 启动 → 进本体域 → 节点不重叠 + 文字真名 + 可拖动
- 老板真机 0.6.12 装 APK + OTA
- 报告 `docs-coolie/evidence/wave244/QA-REPORT.md`

## 9. 大活提醒

5 文件改, 1 commit 即可 (commit message `fix(expo+server): wave244 — 本体图谱看的痛苦 (cluster-by-type + UUID 兜底 + pan/zoom)`)

## 10. 发版

- bump 0.6.10 → 0.6.12 (iOS 不动)
- 重 build APK + OTA
- 老板真机装 0.6.12
- push origin main