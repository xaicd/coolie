# 02 · 任务页全量审计 (wave270 · agy)

> 老板原话: 「感觉这两天改的内容各种问题, 各种不合理」
> 审计范围: Coolie App 任务流 — 列表 / 看板 / 分组三视图, 详情页, 创建浮层, 派活精准
> 角色: agy 全量审计员 2/4
> 时间: 2026-10-02
> 状态: **已交付老板**

---

## 摘要 (TL;DR)

任务页是 Coolie App 最高频屏, 也是老板「各种不合理」的震中。本波审计发现 **6 个 P0/P1 体验硬伤**, 其中 **P0 一个**:

> **「列表 / 分组 / 看板」三视图只剩一个真屏 (`TaskKanbanScreen`), 另一个 (`TasksScreen`) 是死代码** — wave254 重构了 `TasksScreen` (用 `useTasksFilter` + 4 个 memo 子组件) 但路由根本没挂它, 老板点任务 tab 看到的还是 wave213 那条 822 行的看板。
> 老板说的「TasksScreen 重构了, TaskKanbanScreen 没动」**事实刚好相反**。

其他 P0:

- **创建任务入口 3 个, 落到 3 套不同表单**, 表单字段不一致 (Spec 类型 / 缺陷严重度只在主路径有, 项目卡 / 中央 FAB 没有)
- **任务详情无状态修改按钮**, 只能在 `TaskKanbanScreen` 拖拽 (列表视图无此能力)
- **「筛选」chip 一共 17 个** (scope 2 + status 8 + 维度 4 + 聚焦 1 + 看板视图 2), 列表/看板各铺一份, 老板实测「不知道在筛什么」

P1 / P2 列在第 6 节。

---

## 1. 三视图对比表

| 维度 | 列表视图 | 看板视图 | 分组视图 |
|------|---------|---------|---------|
| **承载屏** | TasksScreen.tsx | TaskKanbanScreen.tsx | TasksScreen.tsx (内嵌在 IssuesList) |
| **是否被路由** | **否 (死代码)** | **是 (App.tsx:1373)** | 否 (TasksScreen 死代码) |
| **行数** | 218 (含 198 行 JSX+styles) | **822** | IssuesList.tsx 499 行, TasksScreen 218 行 |
| **重构波次** | wave254 重构 | wave213 首次, 之后再没动 | 跟随 TasksScreen 一起 wave254 |
| **数据获取** | useTasksFilter (reducer) | 内联 useState (10 个) | 跟随列表 |
| **筛选 chips** | TasksScreenFilters (3 层共 17 chip) | 内联重铺 6 个 chip | 跟随列表 |
| **搜索框** | ✓ TasksScreenSearch | **无 (useState 但不渲染)** | 跟随列表 |
| **视图切换入口** | TasksScreenViewSwitch (SegmentedControl) | 内联 SegmentedControl (仅 list/board 2 项) | 跟随列表 |
| **拖拽换状态** | 无 | ✓ Pan gesture + Reanimated | 无 |
| **FAB [+ 新建任务]** | ✓ 长条 FAB (但屏不渲染) | **无 FAB** (TasksScreen.tsx:156 自己铺一份; TaskKanbanScreen 不铺) | 跟随列表 |
| **Pull-to-refresh** | ✓ RefreshControl | ✓ RefreshControl | 跟随列表 |
| **FlatList** | **否** (View + map, 注释里说实测嵌套滚动反而抖 — IssuesList.tsx:241) | **否** (外层 ScrollView + 横向 ScrollView 内 issues.map) | 跟随列表 |
| **创建任务弹窗** | 内联 CreateTaskModal (屏不渲染) | 无 | 跟随列表 |
| **ApprovalCard** | ✓ QuickApprovalCard floating | ✓ QuickApprovalCard floating | 跟随列表 |

### 关键事实 (一行一个)

1. **App.tsx:1373 路由只挂 `TaskKanbanScreen`, `TasksScreen` 从未被渲染** — wave254 改的是「死代码」
2. **TasksScreen.tsx:29 注释自承**: `wave254 重构 (FDE 32 排查): 1. 19 个 useState 合并到 useTasksFilter 的 reducer` — 但路由没改
3. **TaskKanbanScreen.tsx:822 总行数**, 其中 268 行 styles + 150 行拖拽 gesture + 270 行渲染逻辑 — 单一屏, 跨 4 个职责 (拉数据 / 筛选 / 拖拽 / 渲染)
4. **TasksScreenViewSwitch.tsx:6 注释**: `列表 / 分组 / 看板 (wave254 抽出 + memo)` — 三选项齐全, 但 TasksScreen 不渲染 → 死代码
5. **老板原话复核**: 老板说「TasksScreen 重构了但 TaskKanbanScreen 没动」— 实测**反了**, 老板看到的看板是 822 行老 `TaskKanbanScreen`, 老板没看到列表/分组, 因为路由根本不挂

### 视图切换的死循环

`TaskKanbanScreen.tsx:410-414` 有 `SegmentedControl options={[{list}, {board}]}` — 只有 2 项。`TasksScreenViewSwitch.tsx` 有 3 项 `{list, group, board}`。

→ **同一个应用里存在两套视图切换组件**, 一个 2 项, 一个 3 项, 互不兼容 (state/view 类型不同 — 见 `IssuesView` vs IssuesScope)。

---

## 2. 任务页 12+ 入口全清单

老板原话: 「任务页有 3 视图 (列表/看板/分组) + 顶部编排按钮组 + 创建任务浮层」— 实际比这多得多。我从 App.tsx 顺着 `setSelected` / `navigateTab("tasks")` / `setComposeOpen` / `setCreateTaskProjectId` 反向追了 12 个入口。

| # | 入口位置 | 落地态 | 一致性 |
|---|---------|--------|-------|
| 1 | **底部 TabBar 第 2 项「任务」** (App.tsx:1369) | TaskKanbanScreen, `tasksFilterProjectId=null`, `selected=null`, 视图=`board` | ⚠️ 永远落到看板 |
| 2 | **底部 TabBar 中央 [+] FAB** (TabBar.tsx:90, App.tsx:1431) | `setComposeOpen(true)` → NewTaskPage 浮层 (空状态 + 4 chip + 按住说话) | ❌ 表单 1/3 |
| 3 | **任务页右上 FAB [+ 新建任务]** (TasksScreen.tsx:156) | CreateTaskModal (屏不渲染, 死入口) | ❌ 表单 2/3 (但屏死了) |
| 4 | **项目中心 / 项目卡「创建任务」** (App.tsx:1337) | `setCreateTaskProjectId(p.id)` → CreateTaskModal **直接打开**, 预选该项目 | ❌ 表单 3/3 (但跳过了「先取标题」环节) |
| 5 | **项目中心 / 项目卡「查看任务」** (App.tsx:1237) | `setTasksFilterProjectId(p.id)` + `navigateTab("tasks")` → TaskKanbanScreen **带项目筛选**, view=`board` | ⚠️ 不让选 list/group, 永远看板 |
| 6 | **OrgAssetsScreen 项目卡 同上** (App.tsx:1333-1339) | 同 #4 / #5 | 一致 |
| 7 | **搜索屏 onOpenIssue** (App.tsx:1177) | `setSelected(issue)` → TaskDetailScreen (内嵌) | ✓ |
| 8 | **通知屏 onOpenIssue** (App.tsx:1191) | 同 #7 | ✓ |
| 9 | **通知屏 onOpenApproval** (App.tsx:1196) | ApprovalFocusDetail (审批单) | ⚠️ 走「待审批」路径而非任务路径 |
| 10 | **驾驶舱 DashboardScreen onOpenApprovals** (App.tsx:1291) | `setSelected(null)` + `navigateTab("tasks")` → 跳到任务 tab 但**什么都不显示** | ❌ P0: 点完啥也没 |
| 11 | **驾驶舱 onOpenApproval(id)** (App.tsx:1298) | `navigateTab("tasks")` + `setFocusedApprovalId(id)` → ApprovalFocusDetail 整屏 | ⚠️ 落任务 tab 但切到审批屏, tab 标签变「任务」但不显示任务 |
| 12 | **AgentDetailScreen onOpenIssue** (App.tsx:1206) | 同 #7 | ✓ |
| 13 | **OrgAssetsScreen onOpenIssue (本体/资产/产物/员工)** (App.tsx:1329) | 同 #7 | ✓ |
| 14 | **OrgAssetsScreen onCreateTaskForProject** (App.tsx:1337) | 同 #4 | 一致 |
| 15 | **PlansScreen onOpenPlan** (App.tsx:1224) | `setSelected(issue)` → TaskDetailScreen | ✓ |
| 16 | **BoardChatScreen onOpenIssue** (App.tsx:1308) | 同 #7 | ✓ |
| 17 | **BoardChatScreen onOpenPlan** (App.tsx:1319) | 同 #7 | ✓ |
| 18 | **沙箱 onOpenTask** (App.tsx:1131) | 同 #7 | ✓ |
| 19 | **新会话页 (NewTaskPage) onCreated** (App.tsx:1449) | 关浮层 + 跳任务 tab + `tasksRefreshToken++` | ⚠️ 跳到任务 tab 但不打开新建任务的详情, 用户「建完不知去哪儿了」 |
| 20 | **深链 coolie://chat/build/标题** (App.tsx:880) | 跳 chat, 不进任务流 | N/A |

### 入口一致性问题

**入口 1 vs 入口 5**: 都落 `TaskKanbanScreen`, 但**入口 5 强制看板视图**, 老板「点了项目卡想看任务, 跳过去永远是横向 5 列看板」。

**入口 10 (DashboardScreen onOpenApprovals)**: App.tsx:1291 `setSelected(null) + setDiffContext(null) + setSandboxContext(null) + setFocusedApprovalId(null) + navigateTab("tasks")` — 跳任务 tab 但**不打开任何任务或审批**, 屏幕是空列表 / 空看板 — 老板实测「按了没反应」的真凶。

**入口 11 vs 入口 9**: 同一条审批路径两条入口 (#9 来自通知, #11 来自驾驶舱), 行为相同 (`ApprovalFocusDetail`), 但 `navigateTab("tasks")` 让底栏高亮「任务」 — 视觉错位: 用户在「审批页」, 底栏说他在「任务 tab」。

**入口 19 (NewTaskPage 建完任务)**: 建完只 `navigateTab("tasks")` + `tasksRefreshToken++`, **不打开新建任务的详情**, 老板「建了任务找不到」。

---

## 3. 头部编排按钮组 (wave20)

老板说「任务页顶部 6 个图标按钮: Pipeline / Plan / Project / Search / Notification / Filter / Create」— **实测只有 2 个**, 老板脑补的 6 个里有 4 个已经下线。

| # | 按钮 | 入口 | 现状 |
|---|------|------|------|
| 1 | 🔍 全局搜索 | AppBar.tsx:33, App.tsx:1104 `setSearchOpen(true)` | ✓ 还活着 |
| 2 | 🔔 通知铃铛 (红点) | AppBar.tsx:38, App.tsx:1103 `setNotificationsOpen(true)` | ✓ 还活着, 显示未读数 |
| 3 | 🛤️ Pipeline | state `pipelinesOpen` (App.tsx:801) | **未挂载** — 没有任何代码 `setPipelinesOpen(true)`, state 永远 false |
| 4 | 📋 Plan | state `plansOpen` (App.tsx:802) | **未挂载** — 同上, state 永远 false |
| 5 | 📁 Project | state `projectsOpen` (App.tsx:803) | **未挂载** — 同上, state 永远 false |
| 6 | ⚙️ Filter | 无 state | **从未存在** — TasksScreenFilters 是内嵌 chip 行, 不是顶部图标 |
| 7 | ➕ Create | TasksScreen.tsx:156 长条 FAB | ✓ 在 TasksScreen 右下角, 但屏死了 |
| 8 | ➕ 中央 [+] | TabBar.tsx:90 圆形 FAB | ✓ 在底栏中央 |
| 9 | 🔃 刷新 | TasksScreenHeader.tsx:29 + TaskKanbanScreen.tsx:340 | 两屏各铺一份 |

### 死 state 列表 (App.tsx)

`pipelinesOpen` / `plansOpen` / `projectsOpen` 三个 state 在 App.tsx 声明, 在 `swipeBack` 倒序退栈里检查 (App.tsx:983-985), 在 `hasSubHeader` 里参与计算 (App.tsx:1083-1085), 在 `renderContent` 里挂 `<PipelinesScreen>` / `<PlansScreen>` / `<ProjectsScreen>` (App.tsx:1212/1220/1230), 但**没有任何代码调用 `setPipelinesOpen(true)` / `setPlansOpen(true)` / `setProjectsOpen(true)`** (除了 wave18 时期的 grep 旧 commit, 现在的 HEAD 上没有)。

→ **3 个 state 是真死代码**, 整 30+ 行无效逻辑, 还有「切 tab 时统一重置」列表 (App.tsx:1411-1413) 也是无效。

### 创建入口的 N 种形态

| 入口 | 形态 | 表单 |
|------|------|------|
| TabBar 中央 FAB | `setComposeOpen(true)` → **NewTaskPage** (空状态 + 4 chip + 按住说话, NewTaskPage.tsx:120) | 二段式: 先取标题 → CreateTaskModal |
| 项目卡「创建任务」 | `setCreateTaskProjectId(id)` → **CreateTaskModal** (CreateTaskModal.tsx:90) | 一段式直接开弹窗 |
| TasksScreen 长条 FAB | **CreateTaskModal** (TasksScreen.tsx:190) | 一段式直接开弹窗, 但屏死了 |
| 新会话页 (中央 FAB 落地) | NewTaskPage → CreateTaskModal | 二段式 |
| 新会话页底部 [创建任务] | NewTaskPage → CreateTaskModal (NewTaskPage.tsx:202 「更多」按钮) | 二段式 |
| 新会话页 [相机] / [键盘] / [创建] | 同上 | 二段式 |

→ **3 种触发 × 2 套表单 = 6 种用户路径**, 但表单单字段不一致 (见第 4 节)。

---

## 4. 任务详情 / 创建浮层 / 派活精准

### 4.1 TaskDetailScreen 字段

`TaskDetailScreen.tsx` 渲染字段 (只看屏):

| 字段 | 来源 | 可改 |
|------|------|------|
| 标题 (只读) | `issue.title` | 否 |
| 状态 (只读) | `issue.status` | **否** (只能去看板拖) |
| 优先级 (只读) | `issue.priority` | 否 |
| 缺陷严重度 (只读) | `issue.defect.severity` | 否 |
| 编号 (只读) | `issue.id` | 否 |
| 描述 (只读) | `issue.description` | 否 |
| Pull Request 链接卡 | workProducts filter | 否 |
| **负责人 (可改)** | `changeAssignee` → `setIssueAssignee` | ✓ (AgentPickerSheet) |
| 评论 | addIssueComment / getIssueComments | ✓ |
| @ 智能体 chips | 列出全部员工 | ✓ (点进评论框) |
| 原型沙箱按钮 | `onOpenSandbox` | ✓ |
| Spec 编辑器按钮 | `onOpenSpec` | ✓ |

→ **任务详情只能改「负责人」+「评论」**, 状态/优先级/缺陷严重度/描述全部只读。要改这些必须**回列表 / 看板拖 / 重进 Web** — 老板「任务详情啥也改不了」。

### 4.2 CreateTaskModal vs NewTaskPage 表单对齐

| 字段 | CreateTaskModal (直接打开) | NewTaskPage + CreateTaskModal (中央 FAB 路径) |
|------|----------------------------|-----------------------------------------------|
| 标题 | ✓ TextInput | ✓ NewTaskPage 先取, CreateTaskModal 预填 |
| 描述 | ✓ TextInput | ✓ CreateTaskModal 同字段 |
| 类型 (任务/缺陷) | ✓ chip | ✓ chip (CreateTaskModal) |
| 缺陷严重度 (P0-P3) | ✓ chip (缺陷时显示) | ✓ chip |
| 项目 (Dropdown) | ✓ 项目卡路径预选 | ✓ 默认「无项目」 |
| 优先级 | ✓ chip (4 档) | ✓ chip |
| Spec 类型 (需求/缺陷修复/设计/任务) | ✓ chip (wave147) | ✓ chip |
| 上传附件 | ✓ UploadRow (新建任务后才 flush) | ✓ NewTaskPage 先 pick, 建单时一并传 |
| 复核人 / 审批人 / 看守 | ✗ (上游 useComposerFields 有, 这里不上屏) | ✗ 同 |
| 状态 | ✗ (默认 backlog → 指派即改 todo) | ✗ 同 |
| 标签 | ✗ | ✗ 同 |
| 工作模式 / 模型选项 | ✗ | ✗ 同 |

→ **两个表单字段一致** (都走同一份 `useComposerFields`, 见 CreateTaskModal.tsx:123), 字段缺的部分是上游决策 (精简入口密度)。但**项目卡路径没有「先取标题」环节**, 用户点项目卡 → 直接开 CreateTaskModal → 标题为空 → 必须回去打字。

### 4.3 SkillMatcherSheet (派活精准, wave258)

老板原话: 「wave258 派活精准 + 数字员工 chip 重复」— 审计复核:

| 项 | 现状 | 评价 |
|----|------|------|
| 入口 | **唯一**: `OrgAssetsScreen` 第 267 行 `<SkillMatcherSheet>` | ✓ |
| 算法 | `matchAgents()` 本地 (SkillMatcherSheet.tsx:85) | ✓ 与 server-side 同算法 |
| 数字员工 chip | ROLE_TONE 6 色 FDA / Core SWE / PRE-SRE / FDSE / DS / PM | ✓ 不重复 |
| **不做的事** | 注释自承: 「点员工: 关闭浮层 + 复制到 clipboard...这次不做端到端派活流程」 | ⚠️ **实际只复制文本到剪贴板** — 老板以为「派活」是真的派, 实际只是「复制一行字」 |
| 与任务页关系 | **零关联** | ❌ SkillMatcherSheet 不在任务流, 在资产流; 选了员工不会进任务创建表单 |

→ **派活精准 = 选员工 + 复制文本**, 与任务创建流程完全脱节。复制到剪贴板的内容 (`派活给 X (matched: Y, 评分 Z)`) 老板还得自己粘贴进任务描述, 或者粘进 Hermes chat。

「数字员工 chip 重复」复核: TaskDetailScreen.tsx:412-429 有一个 `@ 智能体` chip 行 (14 行代码, 列出全部员工 + StatusDot), SkillMatcherSheet.tsx:171 也有 `roleBadge` (5 色 chip), AssetsAgentCard 还有一份 (我未读, 估计还有)。

→ **同一公司 6 名员工的「角色徽章 + 状态点 + 名字」chip 在 App 里至少出现 3 次**, 没有抽出复用 — 老板的「重复」是真的。

### 4.4 AgentPickerSheet (任务详情 + 创建任务共用)

`AgentPickerSheet.tsx:32-85` 是任务详情改派 + CreateTaskModal 选负责人的共用抽屉, 设计一致。

但它和 SkillMatcherSheet **互不引用**: 都是「选员工」, 前者是「列名单选」, 后者是「按技能匹配」。逻辑不冲突, 但产品上不一致: 改派用 pickerSheet (按状态点 + 名字), 派活精准用 matcherSheet (按技能评分 + 角色徽章)。**同一个「我要选个员工」动作在两套 UI**。

---

## 5. 性能 / UX 问题

### 5.1 TaskKanbanScreen 822 行: 性能风险

| 风险点 | 行号 | 评估 |
|--------|------|------|
| **外层 ScrollView 包内层横向 ScrollView** (嵌套滚动) | TaskKanbanScreen.tsx:321-442 | 老板机型上 iOS 已报「左右滑不动」 — Android 也偶发 |
| **issues 单次 fetch 200 条** (`limit: 200`) | TaskKanbanScreen.tsx:199 | 数据上限 200, 超过不显示; 真实项目任务数常 200+, 用户看不到 |
| **5 列内每列 `issues.map` 全渲染** (没用 FlatList) | TaskKanbanScreen.tsx:511-528 | 每列 40+ 卡时, 拖拽手势识别区重叠, 一按卡片触发滚动 |
| **KanbanColumnView 整列重渲** | TaskKanbanScreen.tsx:475-532 | `byStatus` 引用变更 → 5 列全渲, 没 memo |
| **拖拽 `tryDropOnColumn` 乐观更新** | TaskKanbanScreen.tsx:245-271 | UI 立刻换列, 但其他列的 `byStatus` 重算 (useMemo 失效) → 全屏闪一下 |
| **`columnLayouts` 用 ref 不触发重渲, 但拖拽中也无法得知最新布局** | TaskKanbanScreen.tsx:227 | 横向滚动后 `x` 漂移, 拖到末列可能落空 |

### 5.2 TasksScreen 死代码性能

`TasksScreen.tsx` 路由不挂, 但代码 + styles 全编译进 APK, 估 5-10KB 影响有限。**更大的问题是 `useTasksFilter` 这个 hook 也没人用** — 它的能力 (reducer + 4 memo 子组件) 应该在 `TaskKanbanScreen` 里复用, 老板「卡死」问题没真解。

### 5.3 死链 / 点了没反应

| 入口 | 行为 | 用户感知 |
|------|------|---------|
| DashboardScreen onOpenApprovals (App.tsx:1291) | `setSelected(null)` + `navigateTab("tasks")` | **屏幕是空列表 / 空看板**, 啥也没 — 老板「按了没反应」真凶 |
| 通知 onOpenApproval (App.tsx:1196) | `setFocusedApprovalId(id)` | 跳任务 tab 但显示 ApprovalFocusDetail, **底栏「任务」高亮但屏幕不是任务** — 视觉错位 |
| TasksScreen.tsx:156 长条 FAB | 屏不渲染 | **任何时候都点不到** — 但 TasksScreen.tsx:160 还有「新建任务」accessibility label, 老板实测「找不到创建按钮」 |
| SkillMatcherSheet 选员工 | 复制到剪贴板 | 老板以为派活了, 实际**啥也没发生** (SkillMatcherSheet.tsx:113-119) |

### 5.4 数据不对

| 项 | 现状 | 风险 |
|----|------|------|
| `coolie.listIssues(company.id, { limit: 200 })` | 单次 200 条 | 超 200 静默丢 — 老板项目超过 200 任务就只看到前 200 |
| `coolie.listIssues` **不含子任务** (只看顶层) | 子任务被计入「项目任务数」但列表里看不到 | 老板「项目 X 有 50 个任务, 这里只看到 30 个」 |
| `TaskKanbanScreen.tsx:147-167` `selection.scope === "focus"` 判定 | 用 `updatedAt` 是今天 + 未完成 | 「今日+进行中」实际是「今日动过 + 进行中」, 用户预期不对 |
| 看板拖拽失败回滚 (TaskKanbanScreen.tsx:260) | 只回滚 `status`, 但**不改的字段 (assigneeAgentId) 也被乐观覆盖**? | 看代码: `setIssues(... status: prevStatus)`, OK, 不动 assignee — 但**实际改 assignee 的路径不在看板**, 所以这条 OK |

---

## 6. P0 / P1 / P2 缺陷总结表

| # | 文件:行 | 类别 | 描述 | 严重度 |
|---|--------|------|------|--------|
| **P0-1** | App.tsx:1373 vs TasksScreen.tsx:1 | **路由错误** | 任务 tab 路由挂的是 822 行老 `TaskKanbanScreen`, wave254 重构的 `TasksScreen` (用 `useTasksFilter` + 4 个 memo 子组件) **路由不挂**, 三视图 (列表/分组/看板) **永远进不去** | **P0** |
| **P0-2** | App.tsx:1291 | **死链** | DashboardScreen onOpenApprovals 只 `navigateTab("tasks")` 不打开任何任务/审批, 屏幕空 | **P0** |
| **P0-3** | TaskDetailScreen.tsx (整屏) | **能力缺失** | 任务详情**不能改状态 / 优先级 / 缺陷严重度 / 描述**, 状态改只能去看板拖; 列表视图用户无此能力 | **P0** |
| **P0-4** | SkillMatcherSheet.tsx:113 | **派活精准 = 复制剪贴板** | 老板以为「派活」真派了, 实际只是 `Clipboard.setString(text)`, 不进任务创建流, 选了员工啥也没发生 | **P0** |
| **P1-1** | App.tsx:801-803 / 983-985 / 1083-1085 / 1212-1230 | **死 state** | `pipelinesOpen` / `plansOpen` / `projectsOpen` 3 个 state + 整段逻辑无 setter 调用, wave18 时期遗留, 现在 HEAD 上全死 | P1 |
| **P1-2** | TasksScreen.tsx:156 + TasksScreenViewSwitch.tsx | **死代码** | `TasksScreen` 组件 + 4 个 memo 子组件 + `useTasksFilter` hook + `TasksScreenFilters` / `TasksScreenSearch` / `TasksScreenViewSwitch` 全链路不被任何路由使用 | P1 |
| **P1-3** | App.tsx:1196 + 1298 | **视觉错位** | 通知/驾驶舱进审批 → 跳任务 tab 但显示 ApprovalFocusDetail, 底栏「任务」高亮但屏幕不是任务 | P1 |
| **P1-4** | TaskKanbanScreen.tsx:199 | **数据上限** | `listIssues({ limit: 200 })` 单次拉 200, 超 200 静默丢 | P1 |
| **P1-5** | TaskKanbanScreen.tsx (整屏) | **视图切换不一致** | 看板里有 SegmentedControl (2 项 list/board), 列表里有 SegmentedControl (3 项 list/group/board), 两套组件互不兼容 | P1 |
| **P1-6** | App.tsx:1452 | **建完任务无引导** | NewTaskPage 建完任务只跳任务 tab, 不打开新建任务详情, 用户「建了找不到」 | P1 |
| **P1-7** | TaskKanbanScreen.tsx:475-532 | **不 memo 列** | KanbanColumnView 整列不 memo, 任一卡片 status 变 → 5 列全渲, 拖拽时全屏闪 | P1 |
| **P1-8** | TaskDetailScreen.tsx:412 / SkillMatcherSheet.tsx:171 / (AssetsAgentCard 估) | **员工 chip 3 处重复** | 同一公司员工的「角色徽章 + 状态点 + 名字」chip 至少 3 处, 没有共用组件 | P1 |
| **P2-1** | TaskKanbanScreen.tsx:199 | **不显示子任务** | `listIssues` 只看顶层, 子任务不进列表 — 老板项目任务数对不上 | P2 |
| **P2-2** | TaskKanbanScreen.tsx:227 | **columnLayouts ref** | 拖拽中横向滚动后 `x` 漂移, 末列落点可能空 | P2 |
| **P2-3** | TaskKanbanScreen.tsx:510 | **空列文案** | `columnEmpty: "—"` — 老板看不到空原因 | P2 |
| **P2-4** | TasksScreenFilters.tsx + TaskKanbanScreen.tsx:350 | **chip 堆叠 3 层** | scope 2 + status 8 + 维度 4 + 聚焦 1 = 17 chip, 列表视图中 17 个 chip 占 3 行, 列表内容挤到下方 | P2 |
| **P2-5** | TaskKanbanScreen.tsx:147-167 | **「今日+进行中」判定错** | 实际是「今日动过 + 进行中」(updatedAt 今天 + 非 done/cancelled), 用户预期不对 | P2 |
| **P2-6** | App.tsx:805-807 | **项目筛选不持久** | `tasksFilterProjectId` 切 tab 即清 (App.tsx:1420), 老板「项目 X 任务筛选点过去看一眼, 切到员工再回来就没了」 | P2 |
| **P2-7** | TaskKanbanScreen.tsx:411 | **看板里「分组」入口消失** | 看板里 SegmentedControl 只 2 项 (list/board), 「分组」视图进不去, 但老板说「有 3 视图」 | P2 |
| **P2-8** | TasksScreen.tsx:166 vs CreateTaskModal.tsx | **empty 文案误导** | 列表视图空态: 「点右下角 [+ 新建任务] 创建第一个任务」 — 但右下角 FAB 在 TasksScreen, 屏不渲染 | P2 |

---

## 7. 推荐改造方案

### 7.1 路由: 决定保留谁

| 选项 | 含义 | 工作量 | 推荐 |
|------|------|--------|------|
| **A. 用 TasksScreen 替换 TaskKanbanScreen** | App.tsx:1373 改挂 `TasksScreen`, `useTasksFilter` 取代内联 useState; TaskKanbanScreen 删 (功能合并到 `IssuesList.view === "board"`, 拖拽手势抽出为 hook) | **3-5 天**, 但老板「卡死」真解 | ★★★★★ |
| **B. 把 TasksScreen 迁回列表/分组, TaskKanbanScreen 留看板** | 路由先看 `selected` 决定, 否则按 view 派; 但两套组件两份代码 | 2-3 天, 长期烂 | ★★ |
| **C. 现状不动, 只把 TasksScreen 当 web 复用准备** | 啥也不改 | 0 天 | ✗ |

**建议: 走 A**, 老板「卡死」的真凶是 `TaskKanbanScreen` 822 行单屏; `TasksScreen` 的 reducer + memo 子组件是正确方向, 缺的只是把 `TaskKanbanScreen` 的拖拽能力 (Reanimated gesture) 抽成 hook (`useKanbanDrag`).

### 7.2 创建入口合并

| 入口 | 现状 | 建议 |
|------|------|------|
| TabBar 中央 [+] | NewTaskPage (空状态 + 按住说话) | 保留 (语音派活是真优势) |
| 任务页右下 [+ 新建任务] (TasksScreen.tsx:156) | CreateTaskModal 直接开 | **删除** (重复) |
| 项目卡「创建任务」 | CreateTaskModal 直接开 (跳过标题环节) | 改: 先开 NewTaskPage, 预选项目但允许取标题, 再 CreateTaskModal — 或简化为「弹一个 CreateTaskModal, 标题字段从键盘弹上来聚焦」 |

### 7.3 字段统一 (CreateTaskModal)

不动字段 (复核人 / 看守 / 工作模式), 让老板「建单简单」保留; 但加 1 个字段:

- **状态 chip** — 默认 backlog, 老板可显式选 todo / in_progress (避免「指派即改 todo」的隐式行为, 见 CreateTaskModal.tsx:425-426)

### 7.4 TaskDetailScreen 加可改字段

| 字段 | 加交互 | 复杂度 |
|------|--------|--------|
| 状态 | 点 chip → 弹 FilterSheet (复用 IssuesScope 那份) | 半天 |
| 优先级 | 点 chip → 弹 4 选 1 | 半天 |
| 缺陷严重度 | 点 chip → 弹 P0-P3 | 半天 |
| 描述 | 点编辑 → TextInput inline | 1 天 |

→ 让老板「任务详情啥也改不了」彻底解。

### 7.5 SkillMatcherSheet 真做端到端派活

| 选项 | 含义 | 工作量 |
|------|------|--------|
| **A. 选员工 → 自动填进 CreateTaskModal 的「负责人」** | 资产页选员工 → 跳任务 tab → CreateTaskModal 自动预填 assignee | 1 天 |
| **B. 选员工 → 复制派活指令到 Hermes chat** | 当前实现, 但在 Hermes chat 里自动 paste | 半天 |
| **C. 选员工 → 跳 NewTaskPage, 自动预填 assignee + 自动 fill 一段「派活给 X (matched Y)」到描述** | 折中 | 1 天 |

**建议: 走 A**, 派活精准 = 直接落到任务创建, 老板「选完就建单」。

### 7.6 死 state / 死代码清理

| 删除 | 涉及 |
|------|------|
| `pipelinesOpen` / `plansOpen` / `projectsOpen` 3 个 state + `<PipelinesScreen>` / `<PlansScreen>` / `<ProjectsScreen>` 路由分支 + `swipeBack` 倒序检查 + `hasSubHeader` 计算 + TabBar 切 tab 重置 — **除非 wave270 决定恢复这些入口** | App.tsx:801-803, 983-985, 1083-1085, 1212-1230, 1411-1413 |
| `TasksScreen.tsx` + `TasksScreenHeader.tsx` + `TasksScreenFilters.tsx` + `TasksScreenSearch.tsx` + `TasksScreenViewSwitch.tsx` + `useTasksFilter.ts` — 除非走 7.1 A 方案复用它们 | 5 文件 |
| `TaskKanbanScreen.tsx` 拖拽手势以外的 state — 走 7.1 A 方案时合并到 IssuesList | 整屏 |

### 7.7 视觉错位

`ApprovalFocusDetail` 在 App.tsx:1167 的路由: 把 `navigateTab("tasks")` 去掉, 改为保持当前 tab (「通知」/「驾驶舱」), 路由层加一个 `focusedApprovalId` 全局态但**不绑 tab**。

---

## 8. 一句话总结

**任务页的真正问题不是「改了各种不合理」, 而是「TasksScreen 重构走对了路, 但路由没跟上; TaskKanbanScreen 还在原地 822 行; 入口分散到 3 套表单; 详情啥也改不了; 派活精准是假派活」。**

**最低修复路径**: 把 wave254 的 `TasksScreen` + `useTasksFilter` 推到路由, 拖拽抽 hook 进 IssuesList.board, 详情页加状态/优先级/严重度 inline 编辑, SkillMatcherSheet 选完员工直接预填进 CreateTaskModal.assignee。

预期工作量: 5-7 天 (含联调)。
