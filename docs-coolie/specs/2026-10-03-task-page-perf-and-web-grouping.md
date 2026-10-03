# wave286 原生任务页性能规格 (分页流式加载) 与 Web 端项目筛选分组 — SRS/HLD 规格说明书

> **版本**: v1.0.0 (wave286)
> **日期**: 2026-10-03
> **责任架构师**: 墨斗 (FDA, `modou-fda`) — CMMI G1 需求门禁产出
> **派工来源**: `docs-coolie/briefs/2026-10-03-task-page-perf-wave286.md` (Hermes, 13:50 CST)
> **对应工单**: COOA-13 [wave286] 原生任务页性能规格与 Web 端筛选分组 Spec
> **生效门禁**: G1 需求风控门禁 (本文档即 G1 交付物)；下游 G2 (铁匠/铁匠贰号编码) → G3 (门神 E2E 验真)
> **关联实现基线**: wave285 commit `d4620810e` (真 FlatList/SectionList + 拆外层 ScrollView，已在 main)

---

## 1. 业务背景与目标

### 1.1 老板原话 (需求真源)

> 「任务页功能目前来看 web 的体验更好，**原生的太卡**」
> 「原生 app，任务页功能要像 web 端学习，**web 端任务要支持项目筛选分组**」

### 1.2 波次谱系与本波定位

| 波次 | 交付 | 状态 |
| :--- | :--- | :--- |
| wave254 | `useTasksFilter` reducer 合并 19 个 useState；IssueRow memo | 已交付 |
| wave285 | C-1 原生性能修：`TasksScreen` 拆外层 ScrollView、列表/分组视图换真 FlatList/SectionList (commit `d4620810e`) | 已交付 |
| **wave286 (本波)** | **C-3 规格 (本文档)** + C-2 web 端项目筛选分组 (铁匠贰号) + C-4 E2E/性能基准 (门神) | C-1 已随 wave285 落地；本规格同时固化的**新增能力**是**原生分页流式加载**与 **web 项目筛选分组** |

### 1.3 问题定义 (真因，代码级)

1. **原生「卡」已由 wave285 治理渲染层，但数据层仍是"一次性全量"**：
   `clients/expo/src/hooks/useTasksFilter.ts:232` 一次 `coolie.listIssues(company.id, { limit: 200 })` 拉死 200 条上限——任务超过 200 条即**静默丢失**（无提示、无翻页）；首屏要等全量响应；下拉刷新整页重拉。数据层没有"分页 + 流式增量"能力。
2. **web 端功能缺项目维度**：
   `ui/src/pages/Issues.tsx` 已拉取 `projects` 数据源 (L109) 并传入 `IssuesList` (L244)，但工具栏**没有项目筛选 chip**、视图切换只有「列表 | 看板」两态 (L1772-1786)，项目分组只藏在列表模式的 Group 弹层里 (L1961-1994，`groupBy:"project"` 逻辑 L1323 已存在但入口深、节头无计数、无吸顶)。原生的「列表/分组/看板」三视图心智模型 web 没有对齐。

### 1.4 目标 (5 秒读完)

| # | 目标 | 责任员工 | 优先级 |
| :--- | :--- | :--- | :--- |
| T-1 | 原生任务列表支持**分页流式加载**：首屏快照先渲染、滚动到底自动增量加载、打破 200 条静默上限、保持 60fps | 铁匠 (C-1 增量) | 🔴 P0 |
| T-2 | web 任务页支持**项目维度筛选 + 项目分组视图**：项目 chip、列表/分组/看板三视图对齐原生、分组节头吸顶 + 计数 | 铁匠贰号 (C-2) | 🟠 P1 |
| T-3 | E2E 验真 + 性能基准 (60fps / 200+ 任务 / 三视图切换) | 门神 (C-4) | 🟡 P2 |

---

## 2. 范围 (Scope / Out-of-Scope)

### 2.1 In Scope

- `clients/api-client/src/client.ts` — `listIssues` 增量扩展 (可选参数，向后兼容)
- `clients/expo/src/hooks/useTasksFilter.ts` — 分页状态机
- `clients/expo/src/components/IssuesList.tsx` — 无限滚动接线 (FlatList/SectionList `onEndReached`、尾部加载/到底提示、看板加载入口)
- `ui/src/components/IssuesList.tsx` — 项目筛选 chip、三视图切换、项目分组节头增强 (内部 viewState/过滤链路)
- `ui/src/pages/Issues.tsx` — 仅当需要传递展示态时接线，不改 query shape

### 2.2 Out of Scope (brief §D 固化，违者为架构越界)

- **不动 server** (`server/`、`packages/db`)——分页/过滤全部复用既有端点能力 (§3.3 已核实支持)，schema 不变
- **不动** `v0.6.22` release tag (`e06a144ea`) 与 wave281-285 commit
- **不动** web 端 `IssuesList` 组件**对外 props 形状**——`ProjectDetail`/`IssueDetail`/`Pipelines` 等既有调用方零改动
- **不动**原生项目筛选 chip 既有功能 (`useTasksFilter` L129-L321)
- **不动**看板拖拽 (`TaskKanbanScreen` reanimated 路径)
- **不动** `AGENT_ROLES` enum、5 角色 / 7 工具池、7 处版本号源

---

## 3. 现状基线 (As-Is，代码锚点)

### 3.1 原生 (clients/expo)

| 锚点 | 现状 |
| :--- | :--- |
| `screens/TasksScreen.tsx` | wave285 后：筛选区固定顶栏 + 列表本体持有滚动/下拉刷新，无外层 ScrollView |
| `components/IssuesList.tsx` | 列表=FlatList (`getItemLayout`+`windowSize=11`+`initialNumToRender=12`+`removeClippedSubviews`，行槽 64px/步长 72)；分组=SectionList (`stickySectionHeadersEnabled`)；看板=横向 ScrollView 只读 |
| `hooks/useTasksFilter.ts:232` | `setIssues(await coolie.listIssues(company.id, { limit: 200 }))` — **一次性、无翻页、200 静默上限** |
| `lib/issue-list.ts:164` | `groupIssuesByProject`：按 `issue.projectId ?? 未归属` 分桶，项目序按 `projects` 数组序 |
| `lib/issue-list.ts` `selectIssues` | 搜索/状态/指派/项目/排序/主线/聚焦 全部**客户端**过滤 (对已加载集合) |

### 3.2 Web (ui)

| 锚点 | 现状 |
| :--- | :--- |
| `pages/Issues.tsx:149-182` | `useInfiniteQuery` offset 分页 (页大小 100，workspace 筛选时 1000)，`getNextIssuesPageOffset` 启发式 (返回 < pageSize 即无下一页)，`mergeIssuePagesStable` 按 id 去重合并 |
| `pages/Issues.tsx:186-187` | 搜索激活时停用服务端翻页 (`hasMoreServerIssues`) |
| `components/IssuesList.tsx:188` | `viewMode: "list" \| "board"` 两态分段切换 (L1772-1786)；`groupBy` 七选一弹层 (L1961-1994，含 `"project"`，仅 list 模式显示) |
| `components/IssuesList.tsx:1323-1334` | `groupBy=project` 分组已实现：按 `issue.projectId ?? "__no_project"` 分桶、项目名字典序、未归属排最后 |
| `components/IssueGroupHeader.tsx` | 节头组件：可折叠、label 展示，**无计数徽标、无 sticky 定位** |
| `pages/Issues.tsx:109` | `projects` 数据源已有 (含 archived)，但**未接入任何筛选 UI** |

### 3.3 Server 端点能力 (已核实，本波不改)

`GET /api/companies/:companyId/issues` (`server/src/routes/issues.ts:7901`)：

| 参数 | 能力 |
| :--- | :--- |
| `limit` | 默认 500，上限 1000 (`services/issues.ts:212-213`)，非正整数 400 |
| `offset` | 非负整数，offset 分页 |
| `sortField` / `sortDir` | 仅 `updated` \| `id` × `asc` \| `desc` |
| `afterId` | keyset 游标，**仅** `sortField=id&sortDir=asc&offset=0` 时合法 (L7982-7986) |
| `updatedSince` | ISO 8601，`updatedAt` 严格晚于该值的增量集 |
| `projectId` / `status` / `q` / `view=compact` | 过滤参数已具备；`view=compact` 带 ETag/304 |
| 响应体 | **裸数组 `Issue[]`，无 total/hasMore 元数据**——是否有下一页只能用「返回条数 == limit」启发式 |

> 结论：**服务端已具备本波所需的全部分页/过滤能力**，两端改动纯客户端，符合 §2.2 边界。

---

## 4. SRS — EARS 结构化需求清单

句式遵循 EARS 五模式；SHALL 为强制项。编号规则：`REQ-NAT-*` (原生分页流式)、`REQ-WEB-*` (web 筛选分组)、`REQ-NFR-*` (非功能)。

### 4.1 A 组：原生任务列表分页流式加载 (T-1)

- **[REQ-NAT-001]** (Ubiquitous) 原生任务页 SHALL 以 **offset 分页**方式从服务端拉取任务，页大小 **50** 条，锚定服务端序 `sortField=updated&sortDir=desc`。
- **[REQ-NAT-002]** (Event-driven) WHEN 任务页落地或刷新信号 (`refreshSignal`/`refreshToken`) 触发，THE 系统 SHALL 先拉取第一页并**立即渲染** (流式首屏)，不等待全量数据。
- **[REQ-NAT-003]** (Event-driven) WHEN 列表视图或分组视图滚动至距底部不足 **10 个行槽 (≈720px)**，THE 系统 SHALL 自动拉取下一页并将新页**增量追加**进列表渲染。
- **[REQ-NAT-004]** (State-driven) WHILE 某页返回条数 < 页大小 (50)，THE 系统 SHALL 判定 `hasMore=false`、停止发起新分页请求，并在列表尾部展示「已全部加载 · N 条」。
- **[REQ-NAT-005]** (Ubiquitous) 分页数据集 SHALL 与筛选/搜索**解耦**：翻页始终按锚定序推进公司全量集合；搜索/状态/指派/项目/排序/主线等筛选仅对**已加载数据集**执行 (沿用 `selectIssues` 客户端过滤语义)。
- **[REQ-NAT-006]** (Event-driven) WHEN 合并新页，THE 系统 SHALL 按 issue `id` 去重合并 (与 web `mergeIssuePagesStable` 同语义)，防止 offset 页间漂移导致重复行。
- **[REQ-NAT-007]** (Unwanted) IF 某次翻页请求失败，THEN 系统 SHALL 保留已加载内容、在尾部显示重试入口，且不重复追加失败页。
- **[REQ-NAT-008]** (Event-driven) WHEN 用户下拉刷新，THE 系统 SHALL 重置分页游标、重拉首页，并以去重合并结果整体替换数据集。
- **[REQ-NAT-009]** (Event-driven) WHEN 用户新建任务成功 (含外部 `refreshToken` +1)，THE 系统 SHALL 走刷新路径 (游标重置 + 首页重拉)，保证新任务立即可见。
- **[REQ-NAT-010]** (State-driven) WHILE 用户选择非默认排序 (标题/创建时间) 或激活搜索，THE 系统 SHALL 在列表尾部提示排序/筛选结果「基于已加载 N 条」，但**不暂停**服务端翻页 (数据集与视图解耦，见 REQ-NAT-005)。
- **[REQ-NAT-011]** (State-driven) WHILE 看板视图，THE 系统 SHALL 消费已加载数据集渲染各状态列，并在列区尾部提供「加载更多」入口 (看板列内自动加载列为 P1 可选)。
- **[REQ-NAT-012]** (Ubiquitous) `@coolie/api-client` 的 `listIssues` SHALL 向后兼容：既有 `status/limit/projectId` 调用方行为不变；新增 `offset/sortField/sortDir` 均为可选参数。

### 4.2 B 组：Web 端项目维度筛选分组 (T-2)

- **[REQ-WEB-001]** (Ubiquitous) web 任务页工具栏 SHALL 提供项目筛选器，选项 = 「全部项目 / 各项目 (名 + 色点) / 未归属项目」，数据源复用 `projects` 查询缓存。
- **[REQ-WEB-002]** (Ubiquitous) 项目筛选 SHALL 在**客户端**对已加载集合执行 (`issue.projectId` 匹配；「未归属」匹配空值)，且**不得改变** `Issues.tsx` 现有 `useInfiniteQuery` 的 queryKey/queryFn 形状 (React Query 缓存兼容，brief E.2)。
- **[REQ-WEB-003]** (Event-driven) WHEN 项目筛选激活，THE 页面 SHALL 使列表、分组、看板、状态计数、搜索结果全部基于过滤后集合。
- **[REQ-WEB-004]** (Ubiquitous) web 任务页 SHALL 提供「列表 / 分组 / 看板」三视图切换，与原生 `VIEW_OPTIONS` 心智模型对齐；「分组」视图锚定**项目分组**。
- **[REQ-WEB-005]** (Ubiquitous) 分组视图节头 SHALL 显示**项目名 + 任务计数**，未归属项目组固定排序最后；节头可折叠，折叠状态持久化 (复用 `collapsedGroups`)。
- **[REQ-WEB-006]** (State-driven) WHILE 分组视图滚动，THE 项目节头 SHALL 吸顶 (sticky) 且背景不透明，行内容不得从节头底下透出。
- **[REQ-WEB-007]** (Event-driven) WHEN 用户切换视图模式或项目筛选，THE 选择 SHALL 写入现有 viewState 持久化存储 (scoped key)，下次进入保持。
- **[REQ-WEB-008]** (Unwanted) IF 存量用户 localStorage 中 viewState 无「分组」态，THEN 归一化 SHALL 回退为 `list`，不报错、不白屏 (向后兼容迁移)。
- **[REQ-WEB-009]** (Ubiquitous) web `IssuesList` 组件 SHALL 保持对外 props 形状不变 (改动限于内部 viewState/过滤链路/渲染分支)。

### 4.3 C 组：非功能需求 (NFR)

- **[REQ-NFR-001]** (隔离) 所有请求 SHALL 保持 company-scoped 路径与既有鉴权链路 (`assertCompanyAccess`)，零跨企业数据面变化。
- **[REQ-NFR-002]** (兼容) 本波 SHALL 零 server 代码/schema 改动；api-client 扩展向后兼容；web 组件对外形状不变。
- **[REQ-NFR-003]** (Unwanted) IF 服务端拒绝分页参数 (400/422)，THEN 原生客户端 SHALL 回退为单次大页拉取 (`limit=1000`)、记录告警日志，不白屏、不崩溃。
- **[REQ-NFR-004]** (性能-原生) 列表/分组视图在 **200+ 任务、5 项目分组**下滚动 SHALL 保持 **60fps**、无可感知掉帧 (以 wave285 FlatList 参数为基线，不得因分页回退虚拟化参数)。
- **[REQ-NFR-005]** (性能-流式) 首页 (50 条) 拉取 + 首帧渲染 SHALL ≤ **1.5s** (本地局域网基准)；首帧前展示骨架行 (复用 `LoadingRows`)。
- **[REQ-NFR-006]** (性能-web) 200 任务集合上切换 列表↔分组↔看板 与切换项目筛选 SHALL 无可感知卡顿 (< 100ms 主线程阻塞)，且不触发任何新的 issues 网络请求 (React Query 缓存命中)。
- **[REQ-NFR-007]** (门禁) `scripts/VERSION-CONSISTENCY-CHECK.sh` SHALL 退出码 0 (7 处版本号源一致)。

---

## 5. HLD — 概要设计

### 5.1 架构拓扑与数据流 (改后面)

```mermaid
graph TD
  subgraph Native[原生 expo]
    TS[TasksScreen 固定顶栏] --> UL[useTasksFilter + 分页状态机 M2]
    UL -->|listIssues(limit=50, offset=n, sortField=updated, sortDir=desc)| API[@coolie/api-client M1]
    UL -->|已加载数据集| IL[IssuesList M3<br/>FlatList/SectionList/Board]
    IL -->|onEndReached| UL
    IL -->|selectIssues 客户端筛选| Rows[IssueRowSlot ×视口窗口]
  end
  API --> SRV[GET /api/companies/:id/issues<br/>limit/offset/sort — 不改动]
  subgraph Web[web ui]
    P[Issues 页 — query shape 不变] --> WIL[web IssuesList M4/M5/M6]
    WIL -->|projects 缓存| Chip[项目筛选 chip]
    WIL --> Filter[客户端过滤链路 filtered]
    Filter --> G[groupBy=project 分组 + sticky 节头]
    Filter --> B[看板列]
  end
```

分层不变：数据获取层 (api-client / React Query) → 状态层 (useTasksFilter / viewState) → 渲染层 (虚拟化列表)。改动全部收敛在**状态层与渲染层**，网络契约仅做**增量可选参数**扩展。

### 5.2 M1 — api-client 契约扩展 (`clients/api-client/src/client.ts:377`)

```ts
async listIssues(companyId: string, opts?: {
  status?: string; limit?: number; projectId?: string;   // 既有，不变
  offset?: number; sortField?: "updated" | "id"; sortDir?: "asc" | "desc";  // wave286 新增可选
}): Promise<Issue[]>
```

- 新参数直接映射 query string；不传时行为与现状逐字节一致 (REQ-NAT-012 / REQ-NFR-002)。
- **不做**：`afterId` keyset、`updatedSince` 增量、`view=compact` 接入——列为后续波次可选优化 (§6 DAR-1、§10)。

### 5.3 M2 — 原生分页状态机 (`useTasksFilter.ts`)

状态扩展 (新 useState/reducer 字段)：

| 字段 | 类型 | 语义 |
| :--- | :--- | :--- |
| `issues` | `Issue[]` | 语义升级为「已加载数据集」(去重合并后) |
| `pageSize` | `50` (常量) | REQ-NAT-001 |
| `hasMore` | `boolean` | 末页返回 `< pageSize` → false (REQ-NAT-004) |
| `loadingMore` | `boolean` | 翻页请求在途 |
| `loadError` | `string \| null` | 翻页失败原因 (与首屏 `error` 分离) |

控制流不变式：

1. **在途锁**：`loading || refreshing || loadingMore` 任一为真时忽略新的翻页触发 (防 R6 竞态)。
2. **游标推进**：`offset` 仅由「成功返回满页」推进；失败页不推进 (REQ-NAT-007)。
3. **合并规则**：`mergeByIdStable(existing, page)` —— 以 `id` 为键，**保留既有条目的引用** (已渲染行不因重拉换引用，保护 `React.memo`)，仅追加新 id (REQ-NAT-006)。
4. **重置路径**：`loadIssues(isRefresh)` 重置 `offset=0` 并整体替换 (REQ-NAT-008/009)；筛选变化**不**触发重拉 (REQ-NAT-005)。
5. **回退路径**：请求 400/422 时置 `hasMore=false` + 一次性 `limit=1000` 兜底拉取 (REQ-NFR-003)。

### 5.4 M3 — IssuesList 无限滚动接线

- `IssuesListProps` 新增可选：`hasMore?: boolean`、`loadingMore?: boolean`、`onLoadMore?: () => void`、`loadError?: string | null`、`onRetryLoadMore?: () => void` (全部可选 → 既有调用方零改动)。
- `FlatView`/`SectionsView`：`onEndReachedThreshold` 按 10 行槽换算 (FlatList 取 0.5~0.9 视口比例，以 720px/视口高在实现时校准)；`ListFooterComponent` 三态：
  - `loadingMore` → 骨架行 (复用 `LoadingRows` 单行样式)；
  - `loadError` → `ErrorRetry variant="inline"` + 重试；
  - `!hasMore` → 「已全部加载 · N 条」；默认排序/搜索激活时按 REQ-NAT-010 附注「基于已加载 N 条」。
- 看板视图：列区尾部「加载更多」入口 (REQ-NAT-011)，不改动列渲染与拖拽路径。
- 虚拟化参数 (`windowSize=11` 等) **冻结不动** (REQ-NFR-004 基线保护)。

### 5.5 M4/M5/M6 — Web 项目筛选与三视图 (`ui/src/components/IssuesList.tsx` 内部)

1. **M6 viewState 内部扩展** (不改 props)：
   - `viewMode: "list" | "group" | "board"` (`normalizeIssueViewState` L240 同步扩展；存量值无 `group` → 回退 `list`，REQ-WEB-008)；
   - 新增 `projectFilter: string`，`"all"` | projectId | `"__no_project"`，并入现有 viewState 持久化 (REQ-WEB-007)。
2. **M4 项目筛选 chip**：工具栏 Group 弹层旁新增项目 Popover (复用 `projects` 缓存数据 + 项目色点样式，参照原生 `projectOptions` 的 `dotColor` 心智)；选中值写 `viewState.projectFilter`；过滤接入**既有 `filtered` 链路** (在 groupBy 分桶之前生效，REQ-WEB-002/003)。
3. **M5 分组视图与节头**：
   - `viewMode === "group"` 渲染列表容器并锚定 `groupBy="project"` (进入分组视图不改写用户既有的 list 模式 groupBy 偏好，退出恢复)；
   - `IssueGroupHeader` 增加 `count` 徽标 (trailing) 与 `sticky` 定位变体 (CSS `position: sticky; top: 0;` + 不透明背景，REQ-WEB-005/006)；
   - 未归属项目组排序保持在最后 (沿用 L1327-1329 现状)。
4. **三视图切换器**：L1772 两态分段控件扩为三态 (列表/分组/看板)，与原生 `VIEW_OPTIONS` 图标语义一致 (REQ-WEB-004)。

### 5.6 边界与隔离声明 (G2 关注面)

- **企业隔离**：两端所有请求仍走 company-scoped 路径；服务端 `assertCompanyAccess`/actor 过滤链路零改动 (REQ-NFR-001)。
- **契约防漂移**：web `IssuesList` 对外 props、`Issues.tsx` queryKey/queryFn、server 路由三层契约全部冻结；本波 diff 仅允许出现在 §2.1 文件清单的内部实现面。
- **数据面**：无 schema 变更、无迁移、无新端点。

---

## 6. DAR — 关键技术决策分析 (加权裁定)

### DAR-1 原生分页策略

| 评价准则 | 权重 | A: offset 分页 (**选中**) | B: keyset (`afterId`) | C: `updatedSince` 增量同步 |
| :--- | :--- | :--- | :--- | :--- |
| 服务端现状兼容 (不动 server) | 30% | 9.5 (参数现成) | 6.0 (限 id+asc 序) | 8.0 (需自维护水位) |
| 排序灵活性 (updated:desc 锚定) | 25% | 9.0 | 4.0 (仅 id 升序) | 7.0 |
| 页间一致性 | 20% | 6.0 (漂移→id 去重兜底) | 9.5 | 8.5 |
| 与 web 端实现同构 (心智一致) | 15% | 9.5 (web 即 offset) | 4.0 | 5.0 |
| 实现成本 | 10% | 9.0 | 6.0 | 5.0 |
| **加权总分** | 100% | **8.80 (中标)** | 5.90 | 7.05 |

> 裁定：offset 分页。页间漂移风险 (R1) 以 id 去重 + 下拉刷新收敛兜底。`updatedSince` 增量刷新列为后续优化候选，不阻塞本波。

### DAR-2 原生页大小

| 评价准则 | 权重 | A: 25 | B: 50 (**选中**) | C: 100 |
| :--- | :--- | :--- | :--- | :--- |
| 首屏时延 (REQ-NFR-5) | 40% | 9.0 | 8.5 | 7.0 |
| 请求频次 (200 任务需翻 4/2/2 次) | 30% | 6.0 | 8.5 | 9.0 |
| 与 web (100) 可比性 / 调参空间 | 30% | 7.0 | 8.5 | 7.0 |
| **加权总分** | 100% | 7.5 | **8.5 (中标)** | 7.6 |

> 裁定：50。首屏 50 条 ≈ 3.6 屏内容，覆盖首帧窗口且响应体可控；常量单点定义，基准后可调。

### DAR-3 web 项目筛选实现路径

| 评价准则 | 权重 | A: 客户端 chip 过滤 (**选中**) | B: 服务端 `projectId` 下推 (改 query) | C: URL 参数同步 + 客户端 |
| :--- | :--- | :--- | :--- | :--- |
| React Query 缓存兼容 (brief E.2 硬约束) | 40% | 10 (零 query 变化) | 3.0 (queryKey 变更→缓存分裂) | 8.0 |
| 实现成本 | 25% | 9.0 | 6.0 | 6.5 |
| 与现有 viewState 持久化一致性 | 20% | 9.0 | 5.0 | 8.5 |
| 大数据集正确性 (分页未加载完) | 15% | 7.0 (筛选作用于已加载集，与翻页语义一致) | 9.0 | 7.0 |
| **加权总分** | 100% | **9.05 (中标)** | 5.35 | 7.68 |

> 裁定：客户端 chip。与原生「客户端过滤已加载集」语义、web「搜索时停服务端翻页」的既有折衷同构；筛选作用于已加载集合的边界在 REQ-WEB-002 明示。

### DAR-4 web 分组视图形态

| 评价准则 | 权重 | A: viewMode 扩三态 list/group/board (**选中**) | B: 双态 viewMode + 独立「按项目分组」开关 |
| :--- | :--- | :--- | :--- |
| 与原生三视图心智对齐 (老板原话诉求) | 45% | 9.5 | 6.0 |
| 组件对外形状不变 (§D 硬约束) | 30% | 9.0 (viewMode 是内部 viewState，非 props) | 9.5 |
| 实现与迁移成本 (存量 viewState 兼容) | 25% | 8.0 (归一化回退 list) | 9.0 |
| **加权总分** | 100% | **8.93 (中标)** | 7.83 |

> 裁定：viewMode 内部扩三态；分组视图锚定项目分组；存量持久化值经归一化回退 `list` (REQ-WEB-008)，零迁移脚本。

---

## 7. RSKM — 风险登记与预案

| ID | 风险 | 概率/影响 | 缓解 (设计内置) | 验证归属 |
| :--- | :--- | :--- | :--- | :--- |
| R1 | offset 页间漂移 (翻页间隙任务被更新 → 重复/遗漏) | 中/低 | id 去重合并 (REQ-NAT-006)；下拉刷新整体收敛 (REQ-NAT-008)；残余遗漏属可接受最终一致性 | TC-PAG-04 |
| R2 | 翻页与下拉刷新竞态 (刷新中触发加载更多) | 中/中 | 在途锁不变式 (§5.3-1) | TC-PAG-05 |
| R3 | SectionList sticky 节头 + Footer 布局互相挤压 | 低/中 | Footer 走 `ListFooterComponent` 而非内容内嵌；E2E 走查 | TC-WEB-05 / TC-PAG-02 |
| R4 | web 存量 viewState 无 `group` 态导致异常 | 低/高 | `normalizeIssueViewState` 回退 `list` (REQ-WEB-008) | TC-WEB-04 |
| R5 | web 分组模式与用户 list 模式 groupBy 偏好互相污染 | 中/低 | 分组视图锚定 project、不改写 list 模式偏好 (§5.5-3) | TC-WEB-03 |
| R6 | 分页回归虚拟化性能 (Footer 重渲拖累滚动) | 低/高 | Footer 组件 memo；虚拟化参数冻结 (REQ-NFR-004)；60fps 基准把关 | TC-PERF-01/02 |
| R7 | 200 条静默上限被依赖方隐性依赖 (如看板计数) | 低/中 | 数据集升级为「已加载全集」，看板/计数全部消费同一数据集，语义单调改善 | TC-PAG-06 |

---

## 8. RTM — 需求双向跟踪矩阵

| REQ-ID | 需求摘要 | HLD 模块 | 验证用例 (门神 C-4) | 责任人 | 门禁 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| REQ-NAT-001/002 | offset 分页 50/页 + 流式首屏 | M1+M2 | TC-PAG-01 | 铁匠 | G2 |
| REQ-NAT-003/004 | 滚动自动加载 + 到底提示 | M3 | TC-PAG-02 | 铁匠 | G2/G3 |
| REQ-NAT-005/006/010 | 筛选解耦 + id 去重 + 已加载提示 | M2+M3 | TC-PAG-03/04 | 铁匠 | G2 |
| REQ-NAT-007/008/009 | 翻页失败重试 / 刷新重置 / 新建可见 | M2 | TC-PAG-05/06 | 铁匠 | G3 |
| REQ-NAT-011 | 看板消费已加载集 + 加载入口 | M3 | TC-PAG-06 | 铁匠 | G2 |
| REQ-NAT-012 | api-client 向后兼容 | M1 | TC-PAG-07 (既有调用回归) | 铁匠 | G2 |
| REQ-WEB-001/002/003 | 项目 chip + 客户端过滤 + 全视图生效 | M4 | TC-WEB-01 | 铁匠贰号 | G2 |
| REQ-WEB-004/005 | 三视图切换 + 项目分组节头计数 | M5+M6 | TC-WEB-02 | 铁匠贰号 | G2 |
| REQ-WEB-006/007 | sticky 节头 + 状态持久化 | M5+M6 | TC-WEB-03 | 铁匠贰号 | G3 |
| REQ-WEB-008/009 | 存量 viewState 兼容 + props 形状不变 | M6 | TC-WEB-04 | 铁匠贰号 | G2 |
| REQ-NFR-001/002/007 | 隔离 / 零 server / 版本一致 | 全局 | TC-GATE-01 | 铁匠/铁匠贰号 | G2 |
| REQ-NFR-003 | 分页参数被拒回退 | M2 | TC-PAG-08 | 铁匠 | G3 |
| REQ-NFR-004/005 | 60fps @ 200 任务 + 首屏 1.5s | M2+M3 | TC-PERF-01/02 | 门神 | G3 |
| REQ-NFR-006 | web 切换 <100ms 零新请求 | M4-M6 | TC-PERF-03 | 门神 | G3 |

测试用例细则由门神按本矩阵在 `docs-coolie/evidence/wave286/QA-REPORT.md` 落地 (brief §E.3)。

---

## 9. 验收标准与门禁映射 (brief §E 固化)

### 9.1 原生 (C-1 增量，E.1)

- [ ] `TasksScreen` 无外层 ScrollView (wave285 回归保护，不回退)
- [ ] 列表/分组视图虚拟化参数与 wave285 一致 (`getItemLayout`/`windowSize=11`/`removeClippedSubviews`/sticky 节头)
- [ ] **新增**：200+ 任务公司中，滚动接近底部自动加载下一页，直至「已全部加载 · N 条」出现；全程无重复行
- [ ] 下拉刷新后游标重置、数据集收敛；新建任务立即可见
- [ ] **性能基准**：60fps @ 200 任务 + 5 项目分组；首页首帧 ≤ 1.5s (本地基准)

### 9.2 web (C-2，E.2)

- [ ] 工具栏项目筛选 chip (全部/各项目含色点/未归属)
- [ ] 「列表 / 分组 / 看板」三视图切换；分组视图按项目分组、节头吸顶、显示项目名 + 计数、未归属排最后
- [ ] **React Query 缓存兼容**：操作筛选/视图切换时网络面板无新增 issues 请求 (query shape 不变)
- [ ] 存量 viewState 用户升级后无报错 (归一化回退 list)
- [ ] `ProjectDetail`/`IssueDetail` 等既有调用方零改动、零回归

### 9.3 通用 (E.3)

- [ ] `.coolie-local/dispatch/<id>.json` status=done + commit hash + 验证命令 + evidence 路径
- [ ] `docs-coolie/evidence/wave286/`：`PROD-LOG-REPORT.md` / `WEB-FILTER-GROUP-REPORT.md` / `QA-REPORT.md`
- [ ] `scripts/VERSION-CONSISTENCY-CHECK.sh` 退出 0
- [ ] `pnpm -r typecheck` 0 errors (G2)

| 门禁 | 内容 | 责任 | 状态 |
| :--- | :--- | :--- | :--- |
| G1 | 本规格 (SRS/HLD/DAR/RTM) + brief 终稿 | 墨斗 | **本文档交付** |
| G2 | C-1 增量 + C-2 编码、`pnpm -r typecheck` 0 errors | 铁匠 / 铁匠贰号 | 待实现 |
| G3 | C-4 E2E + 性能基准 → `evidence/wave286/QA-REPORT.md` | 门神 | 待验真 |
| G4/G5 | brief §H：本次不需要 (不发版) | — | 豁免 |

---

## 10. 附录

### 10.1 代码锚点索引

| 主题 | 文件:行 |
| :--- | :--- |
| 原生一次性拉取 (改造点) | `clients/expo/src/hooks/useTasksFilter.ts:232` |
| 原生虚拟化列表 (基线保护) | `clients/expo/src/components/IssuesList.tsx:339-360, 414-432` |
| 原生固定行槽 (getItemLayout 前提) | `clients/expo/src/components/IssuesList.tsx:83-88` |
| api-client listIssues (扩展点) | `clients/api-client/src/client.ts:377-388` |
| 服务端分页参数 (能力核实) | `server/src/routes/issues.ts:7901-8136`；`server/src/services/issues.ts:212-213` |
| 服务端 afterId 限制 (DAR-1 依据) | `server/src/services/issues.ts:7982-7986` |
| web 无限分页现状 (同构参照) | `ui/src/pages/Issues.tsx:23-55, 149-194` |
| web 视图切换现状 (三态改造点) | `ui/src/components/IssuesList.tsx:1772-1786` |
| web groupBy=project 现状 (复用) | `ui/src/components/IssuesList.tsx:1323-1334, 1961-1994` |
| web 节头组件 (计数/sticky 改造点) | `ui/src/components/IssueGroupHeader.tsx:9-46` |
| compact issue 携带 projectId (过滤依据) | `server/src/routes/issues.ts:2986-2992` |

### 10.2 后续波次候选 (不阻塞 wave286)

1. `updatedSince` 增量刷新收敛 (替代全量下拉重拉，DAR-1 遗留优化)
2. `view=compact` + ETag/304 接入原生 (弱网流量优化)
3. 看板列内自动加载更多 (本波 P1 可选项的完整形态)
4. 原生/ web 排序字段服务端下推 (需动 server `sortField` 白名单，与本波边界冲突，需单独立项)

### 10.3 术语

| 术语 | 定义 |
| :--- | :--- |
| 已加载数据集 | 客户端经分页拉取并去重合并后的任务全集；筛选/排序/分组/看板均作用于其上 |
| 锚定序 | 分页推进所依赖的确定性排序：`sortField=updated&sortDir=desc` |
| 流式加载 | 首页先渲染、后续页到达即增量追加的用户可感知渐进过程 |
| 项目分组 | 按 `issue.projectId` 分桶；空值归入「未归属项目」且恒排最后 |

---

*规格终稿 · 墨斗 (FDA) · wave286 · 2026-10-03*
