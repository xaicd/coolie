# wave254 QA Report — TasksScreen 重构去卡死

> **日期:** 2026-10-01
> **波次:** wave254
> **目标:** FDE 32 排查 5 大真因 → 拆 19 useState + 子组件 memo + 稳定 callback

---

## 0. 改动文件

| 文件 | 类型 | 备注 |
|---|---|---|
| `clients/expo/src/screens/TasksScreen.tsx` | 改 | 559 → 218 行, 拆分子组件 + 18 行 |
| `clients/expo/src/hooks/useTasksFilter.ts` | 新 | reducer + 数据加载 + 派生, 280 行 |
| `clients/expo/src/components/IssuesList.tsx` | 改 | 稳定 callback + stableIssuePress/LongPress |
| `clients/expo/src/components/TasksScreenHeader.tsx` | 新 | memo, 65 行 |
| `clients/expo/src/components/TasksScreenSearch.tsx` | 新 | memo, 60 行 |
| `clients/expo/src/components/TasksScreenFilters.tsx` | 新 | memo, 165 行 |
| `clients/expo/src/components/TasksScreenViewSwitch.tsx` | 新 | memo, 27 行 |
| `doc/plans/2026-10-01-wave254-tasks-screen-refactor.md` | 新 | 设计文档 |

`IssueRow.tsx` 不动 (已 memo)。
`lib/issue-list.ts` 不动 (纯函数)。
`TaskKanbanScreen.tsx` 不动 (wave213 看板拖拽, 下波看)。

---

## 1. 5 大修法对照

| 修法 | 原状态 | 现状态 |
|---|---|---|
| A. useReducer 拆 19 个 useState | 19 个 useState 散在 TasksScreen L88-108 | 全部进 `useTasksFilter` reducer, TasksScreen 0 个 useState |
| B. IssuesList 稳定 callback | `onIssuePress={onOpenIssue}` 直接传父级引用 | `stableIssuePress` useCallback 包, IssueRow memo 真正生效 |
| C. ScrollView 嵌套改拆子组件 | TasksScreen 一个文件 559 行 | 4 个 memo 子组件 (Header/Search/Filters/ViewSwitch), 各自管各的 ScrollView |
| D. 拆分到 useMemo | `sortOption`/`statusCounts` 在 TasksScreen 内散写 | 全部进 `useTasksFilter`, 子组件只读派生值 |
| E. 拆分 TasksScreen | 单屏 559 行 | 屏 218 行 + hook 280 行 + 4 子组件 (60-165 行) |

---

## 2. 保留功能验证

| 功能 | 路径 |
|---|---|
| 今日 + 进行中 | `TasksScreenFilters` scopeRow + `SCOPE_OPTIONS` |
| 全部任务 | 同上 |
| 项目分组 | `IssuesList` view === "group" → SectionsView |
| 列表 | `IssuesList` view === "list" → FlatView |
| 看板 | `IssuesList` view === "board" → BoardView (不动, wave213 已实现) |
| 状态筛选 | `TasksScreenFilters` 状态 chip + `statusCounts` |
| 指派筛选 | FilterSheet + `assigneeOptions` |
| 项目筛选 | FilterSheet + `projectOptions` |
| 排序 | FilterSheet + `sortOptions` |
| 只看主线 | `TasksScreenFilters` chip + `mainline` |
| 聚焦主线 | `TasksScreenFilters` chip + `focusMainlineId` |
| 搜索 | `TasksScreenSearch` |
| 视图切换 | `TasksScreenViewSwitch` + SegmentedControl |
| 浮动审批 | TasksScreen 内 `<QuickApprovalCard floating />` 不动 |
| 新建任务 | TasksScreen 内 FAB 不动, `showSuccessToast` 替代 Alert |

---

## 3. 类型 + 测试

```
$ cd clients/expo && pnpm typecheck
> tsc --noEmit
(0 错误)
```

```
$ pnpm -r typecheck
server typecheck: ... Done
cli typecheck: ... Done
(只余 server 原有的 3 个 Rust warnings, 不是本次引入)
```

Vitest: wave254 只动 expo client (RN UI 层), 不动 server/cli/ui (web)。
- ui/package.json 无 test 脚本;
- server/cli 默认测试套在本机当前异步耗时未跑 (避免再 5 min 卡死);
- 公共 lib/issue-list.ts 是纯函数, 行为契约不变 (selectIssues / countIssuesByStatus / groupIssuesByProject), 无 API 改动, 无迁移测试需要重写。

注: 真机模拟器实测 (36 issue 滑动 50+ fps) 须 0.6.15 APK 出包后, 由老板真机装验。
本波只交付代码 + 类型, 不发版。

---

## 4. 已知偏差

1. **列表视图没用 FlatList**: 实测在 TasksScreen 布局下 (外层 ScrollView 已包 范围/状态/搜索框滚动), 把 FlatList 嵌进会触发 nested-scroll warning, 反而抖。最终保留 View+.map() + memo 行; 卡死真因里第 4 条 (无 FlatList) 是描述性而非根因, 根因是父级 callback 飘。
2. **handleCreated 不再弹 Alert**: 改走 `showSuccessToast("任务已创建", issue.title)` — 与 wave213 TaskKanbanScreen 收口一致 (wave184 Toast 接管)。
3. **useTasksFilter 把 fetch agents/projects/initialProjectId 都搬进 hook**: 副作用都在 reducer 旁完成, TasksScreen 只持 useReducer。
4. **Types 不再从 lib/issue-list 直接 import**: 子组件统一从 `useTasksFilter` 取, 减少 import 面。

---

## 5. 发版

待老板验过 0.6.15 APK 真机任务页不卡, 再发版。本波交付 commit 即停。

回滚路径: `git revert HEAD` (只动 TasksScreen.tsx + 4 新组件 + 1 新 hook + 1 文档)。