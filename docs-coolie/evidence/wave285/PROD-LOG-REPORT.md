# wave285 — 原生任务页下拉刷新性能优化 (C-1) 实施报告

- **日期**: 2026-10-03
- **责任员工**: 铁匠 (forge-core-swe) · 工具 claude-glm
- **派单**: `.coolie-local/dispatch/20261003T071931Z-wave285-forge-core-swe.json`
  (Paperclip `COOA-12`, boss 原话「实现原生任务页下拉刷新性能优化」)
- **对照 brief**: `docs-coolie/briefs/2026-10-03-task-page-perf-wave286.md` §C-1 / §E.1
  (Hermes 派单 wave 号 wave285, brief 文档落在 wave286, 工作内容一致)

## 老板痛点 → 根因

老板原话「原生的太卡」。根因三层:

1. **整屏一个 ScrollView**: 任务页外层 `ScrollView` 把标题/搜索/筛选 chips/
   视图切换/列表全部包住, 下拉刷新与滚动触发整屏重排;
2. **列表假虚拟化**: `IssuesList` 的列表/分组视图实际是 `View + .map()` 全量
   渲染 (wave254 注释声称换 FlatList, 代码没落地; `ISSUE_ROW_HEIGHT` 常量
   建了没用上), 36+ 任务一次性全渲;
3. **活体屏同样嵌套**: 线上任务 tab 实际挂 `TaskKanbanScreen` (wave213 起),
   它的外层 ScrollView 里垫着同一个 `IssuesList` —— 若只把 IssuesList 换成
   VirtualizedList 而不拆外层, 嵌套会让窗口化彻底失效。

## 改动 (3 个文件)

### `clients/expo/src/components/IssuesList.tsx` (核心)

- 列表视图: `View+.map()` → 真 **FlatList**
  (`getItemLayout` + `windowSize=11` + `removeClippedSubviews`
  + `initialNumToRender=12` + `maxToRenderPerBatch=12`);
- 分组视图 (项目分组 + 今日/进行中 focus 分组): `View+groups.map()` → 真
  **SectionList**, `stickySectionHeadersEnabled` 真启 (节头吸顶, 补了不透明
  背景防透行);
- **固定行槽 64px** (`rowSlot`, IssueRow 最大内容高 60 + 4px 余量, 行距 8
  折进 marginBottom, 布局步长 72) —— `getItemLayout` 免测量命中的前提,
  内容垂直居中, 视觉与原 gap 布局一致;
- 下拉刷新透传: 新增 `refreshing` / `onRefresh` / `contentContainerStyle`
  可选 props, RefreshControl 挂在列表本体 (错误态/空态/看板态也保留下拉
  刷新, 空态走 `ListEmptyComponent`);
- 看板视图: 列布局不变, 外面补一层竖向 ScrollView 承接滚动+下拉刷新
  (内外不同轴向, 无嵌套冲突)。

### `clients/expo/src/screens/TasksScreen.tsx`

- 拆掉最外层 ScrollView (brief E.1 验收第 1 条);
- 标题/搜索/筛选/视图切换固定顶栏 (`styles.header`), 滚动 + 下拉刷新交给
  IssuesList 本体; 内边距沿用原 `content` (顶部 16 / 底部 96 给 FAB 让位)。

### `clients/expo/src/screens/TaskKanbanScreen.tsx` (线上任务 tab)

- 列表分支: 同样拆外层 ScrollView —— 固定顶栏 (headerCluster 抽取, 两种
  视图共用) + IssuesList 持有滚动/下拉刷新; 不拆则虚拟化列表垫在
  ScrollView 里会破窗口化;
- **看板分支零改动**: 拖拽 (Gesture.Pan + reanimated + 列布局落点) 全部
  原样保留在竖向 ScrollView 结构里, 符合 brief「不动看板拖拽」。

## 验证

| 门禁 | 命令 | 结果 |
|---|---|---|
| G2 编译 | `cd clients/expo && pnpm typecheck` | ✅ 0 errors (改动前基线也是 0) |
| E.3 版本一致 | `bash scripts/VERSION-CONSISTENCY-CHECK.sh` | ✅ 7 处源全一致 0.6.23, exit 0 |

性能目标 (60fps @ 200 任务 + 5 项目分组) 的真机基准由门神 C-4 走查
(`docs-coolie/evidence/wave286/QA-REPORT.md`), 本报告只认静态门禁 +
结构验收:

- [x] `TasksScreen` 不再用 ScrollView 作最外层
- [x] 列表视图走 FlatList (getItemLayout / windowSize / removeClippedSubviews)
- [x] 分组视图走 SectionList (sticky header 真启)
- [x] 看板视图保持 reanimated 路径不重做
- [x] 不动 server / web IssuesList API 形状 / 原生项目筛选 chip / 版本号源

## 行为保留清单 (无功能回退)

今日+进行中/全部 scope、列表/分组/看板三视图、状态/指派/项目/排序/只看
主线/聚焦主线/搜索、QuickApprovalCard 浮动审批、FAB 新建任务、长按主线
聚焦下钻、看板拖拽换列 + 乐观更新 + 震动 —— 全部保留。
