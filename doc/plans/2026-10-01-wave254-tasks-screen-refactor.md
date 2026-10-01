# wave254 — TasksScreen 重构去卡死 (5 大修法 + 保留功能)

> **日期:** 2026-10-01
> **触发:** 老板实测任务页容易卡死 → 「a 吧, 之前今日, 项目分组筛选等功能留」。
> **范围:** `clients/expo/src/screens/TasksScreen.tsx` (改) + `clients/expo/src/hooks/useTasksFilter.ts` (新) + `clients/expo/src/components/IssuesList.tsx` (改) + `clients/expo/src/components/TasksScreen{Header,Search,Filters,ViewSwitch}.tsx` (新)
> **不动:** `TaskKanbanScreen.tsx` (看板拖拽) / `IssueDetailScreen.tsx` / issue-specs 路由 / server / db

---

## 0. 一句话

任务页有 5 个卡死真因 (FDE 32 排查), 4 个修在数据 + 渲染层, 1 个修在结构。本波把 19 个 useState 收成一个 reducer、IssuesList 派稳定 onPress/onLongPress、子组件全部 React.memo, 让 36 条 issue 滑动不抖。

---

## 1. 卡死真因 (FDE 32)

| 真因 | 现状 | 修法 |
|---|---|---|
| 4 层 ScrollView 嵌套 | vertical + horizontal + horizontal + 列表 | wave213 后列表区是 View+.map(), 不再 FlatList, 这一条本质已不存在 — 保留结构 |
| 19 个 useState 散落 | line 88-108, 每次 setStatus/assignee 都触发整屏重渲 | `useTasksFilter` reducer, 一份 state + 一份 dispatch |
| 内联 onPress={() => setStatus(...)} | 引用每次重渲都变 | 子组件 dispatch + memo |
| RefreshControl + 无 getItemLayout | IssuesList 是 View+.map(), 无虚拟化 | 父级 stable callback + IssueRow memo |
| 36+ Issue 同步加载, IssueRow 没 React.memo | IssueRow **已** memo (L313), 实际是父级 onPress 引用飘 | `stableIssuePress` 用 useCallback 包, 给 memo IssueRow 稳定引用 |

---

## 2. 5 大修法

### A. useReducer 拆 19 个 useState → `useTasksFilter`

state shape:
```
{ search, createOpen, refreshSignal, scope, status, assignee, project,
  mainline, focusMainlineId, view, sortValue, sheet }
```
actions: `SET/TOGGLE_MAINLINE/CLEAR_SEARCH/FOCUS_MAINLINE/BUMP_REFRESH`。

外层 4 处 useEffect 同步数据 (issues / agents / projects / initialProjectId) 也搬到 hook, TasksScreen 不再持有任何 `useState`。

### B. IssuesList stable callbacks

新增:
```ts
const stableIssuePress = useCallback((issue: Issue) => onIssuePress(issue), [onIssuePress]);
const stableIssueLongPress = useCallback((issue: Issue) => onIssueLongPress?.(issue), [onIssueLongPress]);
```
传给 BoardView / SectionsView / FlatView, 子组件拿到稳定引用, IssueRow memo 真正生效。

### C. ScrollView 嵌套改拆子组件 (不动 SectionList, 因为 ListView 路径 + Focus scope 路径在同一屏多列)

原本 4 层嵌套拆成 4 个独立子组件, 各管各的 ScrollView:

- `TasksScreenHeader` (memo) — h1 + 副标题 + 刷新按钮 (无 ScrollView)
- `TasksScreenSearch` (memo) — TextInput 搜索框 (无 ScrollView)
- `TasksScreenFilters` (memo) — 范围 + 状态 + 指派/项目/排序 chip 三层 (内部用 3 个 ScrollView, 与原 TasksScreen 一致)
- `TasksScreenViewSwitch` (memo) — SegmentedControl 视图切换 (无 ScrollView)

每个子组件只接受 props, 不依赖外层 state, props 真变才重渲。

### D. 派生全部移到 useMemo

`useTasksFilter` 集中:
- `sortOption` — SORT_OPTIONS.find
- `selection` — IssueSelection 拼装
- `statusCounts` — countIssuesByStatus
- `assigneeLabel` / `projectLabel` — label 派生
- `assigneeOptions` / `projectOptions` / `sortOptions` — FilterOption 列表
- `issueScopeLabel` — 范围副标题

父组件拿到的 `t.statusCounts` 已经是 memo 后的对象, 子组件内不再做派生。

### E. 拆分 TasksScreen 到 4 个子组件

文件结构:
```
src/screens/TasksScreen.tsx         (布局 + 数据流, ~190 行)
src/hooks/useTasksFilter.ts         (reducer + 数据加载 + 派生, ~280 行)
src/components/TasksScreenHeader.tsx (memo, ~50 行)
src/components/TasksScreenSearch.tsx (memo, ~45 行)
src/components/TasksScreenFilters.tsx (memo, ~150 行)
src/components/TasksScreenViewSwitch.tsx (memo, ~25 行)
src/components/IssuesList.tsx        (改: stable callback + .map 列表, 列表视图沿用 View+.map())
src/components/IssueRow.tsx          (不动, 已 memo)
```

---

## 3. 保留功能 (老板原话)

- 今日 + 进行中 (scope=focus)
- 全部任务 (scope=all)
- 项目分组 (view=group)
- 列表 (view=list)
- 看板 (view=board)
- 状态筛选 (全部/草稿/待处理/...)
- 指派筛选 (assignee)
- 项目筛选 (project)
- 排序 (sort)
- 只看主线 (mainline)
- 聚焦主线 (focusMainlineId)
- 搜索 (search)
- 视图切换 (SegmentedControl)
- 浮动审批 (QuickApprovalCard)
- 新建任务 (FAB)

---

## 4. 不要顺手改

- `TaskKanbanScreen.tsx` — wave213 看板拖拽, 本波不动 (下波看是否也卡)
- `IssueDetailScreen.tsx` — 不在范围
- issue-specs 路由 — 不在范围
- server / db / web (Coolie Web)

---

## 5. QA

模拟器装 0.6.15 → 进任务 tab:
- 验证 今日/全部/项目分组/列表/看板/状态/指派/项目/排序/只看主线/聚焦主线 全部留
- 性能: 滑动 36 条 issue 不卡 (帧率 50+ fps)
- 4 护栏绿
- typecheck + 测试
- 报告 `docs-coolie/evidence/wave254/QA-REPORT.md`

---

## 6. 发版

- bump `clients/expo/package.json` 0.6.14 → 0.6.15
- iOS 不动 (Android only build)
- 重 build APK + OTA
- 老板真机装 0.6.15 验任务页不卡
- push origin main