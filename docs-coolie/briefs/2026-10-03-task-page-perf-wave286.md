# Brief: wave286 — 原生任务页性能修 + web 任务页补项目筛选分组

**Wave**: wave286
**Date**: 2026-10-03 13:50 CST
**PM**: Hermes (hermes-pm)
**触发**: 老板 10-03 原话「任务页功能目前来看web的体验更好，原生的太卡」+「原生app，任务页功能要像web端学习，web端 任务要支持项目筛选分组」

---

## A. 项目核心信息 (5 秒读完)

| 项 | 值 |
|---|---|
| 项目 | Coolie (paperclip fork) |
| 仓库 | `$REPO_ROOT` |
| 主分支 | `main` (HEAD `e06a144ea` release v0.6.22) |
| 真值源 | `docs-coolie/EMPLOYEE-OBJECTS.md` + `TOOLS.md` + `PM-DISPATCH-QUICKCARD.md` |

---

## B. 背景 / 真因 (PM FDA 视角)

老板拿真截图+真体验说话:

1. **原生任务页 (expo) 渲染卡**:
   - `clients/expo/src/screens/TasksScreen.tsx:65` 外层是 `ScrollView`
   - `clients/expo/src/components/IssuesList.tsx:240` `FlatView` 用 `View + issues.map()` (非 FlatList)
   - `clients/expo/src/components/IssuesList.tsx:294` `SectionsView` 用 `View + groups.map()` (非 SectionList)
   - 注释自己承认: "保留 SectionView 形式 (SectionList 在 4+ 段时启 sticky header" — **但代码仍是嵌套 View**
   - 36+ 任务时一次过全渲 + ScrollView 抢主线程 + groups 重算 → **掉帧**
   - `IssueRow` 已 `React.memo`, 父级 `useTasksFilter` 已合并 19 个 useState 到 reducer (wave254 干过), **但外层 FlatList/SectionList 一直没摆进 TasksScreen**

2. **web 任务页功能缺**:
   - `ui/src/pages/Issues.tsx:109` 拿到 `projects` 数据源, 传给 `IssuesList` 组件 (`L244`)
   - 但**没有项目筛选 chip** (filter), **没有项目分组视图** (groupBy)
   - 原生 `useTasksFilter` L129-L321 已经有项目 chip + `IssuesList` L36 L45 已经有分组 SectionView

## C. 目标 (Scope)

| ID | 内容 | 责任人 | 工具 | 优先级 |
|---|---|---|---|---|
| C-1 | 原生任务页 P0 性能修: 把 `TasksScreen` ScrollView 拆掉, 列表/分组视图走真 FlatList/SectionList (移除嵌套 ScrollView) | 铁匠 | claude-glm | 🔴 P0 |
| C-2 | web 任务页补项目筛选 chip + 项目分组视图 (3 视图切换 列表/分组/看板) | 铁匠贰号 | claude-mm | 🟠 P1 |
| C-3 | brief + spec 写 wave286 (CMMI G1-G5 门禁) | 墨斗 | agy-gemini3.8 | 🟠 P1 |
| C-4 | E2E 验真 + 性能基准 (60fps / 200+ 任务不抖 + 3 视图切换) | 门神 | cmd | 🟡 P2 |

## D. 不要做 (Out of Scope)

- **不动** `v0.6.22` release tag (`e06a144ea`) / `v0.6.21` tag / `wave281-285` commit
- **不动** server (`packages/db`, `server/`) — 性能修在前端, schema 不变
- **不动** web 端 `IssuesList` 组件 API 形状 — 只补 IssueList 内部 project 筛选/分组
- **不动** 原生项目筛选 chip 已有功能 (`useTasksFilter` L129-L321)
- **不动** 看板拖拽 (KanterReact-native-reanimated + GestureDetector)
- **不动** 5 角色 / 7 工具池 / `AGENT_ROLES` enum / 7 处版本号源

## E. 验收 (Acceptance)

### E.1 原生 (C-1)
- `TasksScreen` 不再用 ScrollView 作为最外层
- 列表视图走 `FlatList` (含 `getItemLayout`, `windowSize`, `removeClippedSubviews`)
- 分组视图走 `SectionList` (sticky header 真启)
- 看板视图保持 react-native-reanimated (不重做)
- 性能基准: 60fps @ 200 任务 + 5 项目分组; 滚动无掉帧

### E.2 web (C-2)
- `Issues.tsx` 加项目筛选 chip (filter, 复用 web 自有 chip 样式, 不强求跟原生同款)
- 加「分组视图」 切换 (列表 / 分组 / 看板)
- 分组视图按项目分组, sticky project header, 显示项目名 + 计数
- 跟 web React Query 缓存兼容 (不变 query shape)

### E.3 通用
- `.coolie-local/dispatch/<id>.json` status = `done` + commit hash + verification cmd + evidence 路径
- `docs-coolie/evidence/wave286/` 含 `PROD-LOG-REPORT.md` (C-1) + `WEB-FILTER-GROUP-REPORT.md` (C-2) + `QA-REPORT.md` (C-4)
- 7 处版本号源一致 (跑 `scripts/VERSION-CONSISTENCY-CHECK.sh`, 退出 0)

## F. 派工 (Dispatch)

| 员工 | 任务 | 工具 | brief |
|---|---|---|---|
| **铁匠 (Forge)** `forge-core-swe` | C-1 原生性能修 | claude-glm | 本 brief §C.1 |
| **铁匠贰号 (Forge II)** `forge-ii-core-swe` | C-2 web 端补项目筛选分组 | claude-mm | 本 brief §C.2 |
| **墨斗 (Inkstick)** `modou-fda` | C-3 spec + brief 终稿 | agy-gemini3.8 | 本 brief §C.3 |
| **门神 (Guardian)** `menshen-fdse` | C-4 E2E 验真 + 性能基准 | cmd | 本 brief §C.4 |

## G. 不要顺手改

- 不动 wave281-285 commit
- 不动 5 字段定义 (员工名/任务/多长时间/工具/状态)
- 不动 `AGENT_ROLES` enum / `ROLE_MAPPING`
- 不动 7 工具池配置
- 不动 sub-agent `.md` 中的「排他约束」

## H. QA (门禁)

- G1 FDA: 墨斗 spec + brief 终稿 (`docs-coolie/specs/2026-10-03-task-page-perf-and-web-grouping.md`)
- G2 Core SWE: 铁匠 / 铁匠贰号 code + tests, `pnpm -r typecheck` 0 errors
- G3 FDSE: 门神 E2E + 性能基准, 报告 `docs-coolie/evidence/wave286/QA-REPORT.md`
- G4 DS: 不需要 (本次无性能)
- G5 PRE-SRE: 不需要 (本次不发版, 只是修性能 + 补功能)

## I. 下一步 (wave287+)

- 老板微信「修完」 → Hermes 自动派门神验真
- 老板微信「调优」 → Hermes 派铁匠微调
- 真值源锁定: `EMPLOYEE-OBJECTS.md §1-§7` + `~/.claude/agents/{name}.md` + `scripts/dispatch-local-employee.sh`

## J. PM 反讲真值 (Compact)

```
【compact ·13:50 ·wave286】
老板: 原生任务卡 + web 端要学原生项目分组
真因: 原生 TasksScreen ScrollView + IssuesList View+.map() 全量渲染
     web Issues.tsx 有 projects 数据但没接 UI
派单:
  1. 墨斗 wave286 写 spec (FDA G1)
  2. 铁匠 wave286 C-1 原生 FlatList/SectionList (Core SWE G2)
  3. 铁匠贰号 wave286 C-2 web chip + 分组 (Core SWE G2 兜底)
  4. 门神 wave286 C-4 E2E + 60fps 基准 (FDSE G3)
不动: v0.6.22 tag / server / 看板拖拽 / 已有的项目 chip / AGENT_ROLES
```