# wave270 导航系统全量审计

**审计员**: wave270 全量审计 1/4 (导航)
**审计日期**: 2026-10-02
**目标代码**: `clients/expo/` (Coolie App)
**核心文件**: `App.tsx` (1976 行) + 11 个屏幕文件

---

## 0. TL;DR

Coolie App **没有用 react-navigation**, 是 `App.tsx` 单文件手写的 `tab` state + 19 个 modal/详情 state flag + 一坨手写 swipe-back 栈。

**真因**: 这是一坨**没有路由器的伪路由**, 每加一个功能就多一个 `useState`, 没人闭环过 `wire consistency` 和 `dead-link 清理`。
老板 "各种不合理" 的根因就是这条线没人管。

**最严重 3 件事**:
- **P0**: `OntologyDomainListScreen.tsx:977` — 「文件夹目录」输入框的 `onChangeText` **写错了 state** (写到 `setDisplayName` 而不是 `setNewDomainDirectoryPath`), 用户键入路径时被静默吞掉, 提交时报 "目录不存在".
- **P0**: `TasksScreen.tsx` 整个文件**没被 App.tsx 引用** — 234 行 + 19 个 useState 全是死代码, App.tsx 用的是 `TaskKanbanScreen`.
- **P0**: `InboxScreen.tsx` 整个文件**没被 App.tsx 引用** — 1238 行全是死代码, 收件箱功能**根本没落到 TabBar**.

---

## 1. 路由架构图

```
App.tsx (1976 行, 单文件伪路由)
│
├─── credential=undefined ─→ LoadingState
├─── credential=null ──→ SignInScreen / WebLoginScreen / RegisterScreen
└─── credential={...} ─→ CompanyGate ─→ HomeScreen
                              │
                              ├── tab=dashboard ─→ DashboardScreen
                              ├── tab=tasks ─→ TaskKanbanScreen ─→ TaskDetailScreen (replace in-tab)
                              ├── tab=chat ─→ BoardChatScreen
                              ├── tab=agents ─→─ tab=ontology ─→─ tab=artifacts ─→ OrgAssetsScreen (SegmentedControl 切)
                              └── tab=assets
                                                       │
[MODE 圈 │ + FAB] ─→ NewTaskPage (composeOverlay zIndex=110)
[MODAL 圈 │ settings] ─→ SettingsSheet (zIndex=100)
[MODAL 圈 │ 项目卡创建任务] ─→ CreateTaskModal
[MODAL 圈 │ notifications] ─→ NotificationsScreen
[MODAL 圈 │ search] ─→ SearchScreen
[MODAL 圈 │ agent detail] ─→ AgentDetailScreen
[MODAL 圈 │ approval] ─→ ApprovalFocusDetail
[MODAL 圈 │ sandbox] ─→ PrototypeSandboxScreen
[MODAL 圈 │ diff] ─→ CodeDiffScreen
[MODAL 圈 │ spec] ─→ SpecEditorScreen
[MODAL 圈 │ onboarding] ─→ WebContainerScreen(/onboarding)
[MODAL 圈 │ web 容器] ─→ WebContainerScreen(/xxx)
[MODAL 圈 │ pipelines/plans/projects] ─→ PipelinesScreen / PlansScreen / ProjectsScreen
[MODAL 圈 │ git creds] ─→ GitCredentialsScreen
[MODAL 圈 │ plugins] ─→ PluginManagerScreen / PluginSettingsScreen
[MODAL 圈 │ 本体 3 屏] ─→ OntologySchemaEditor / OntologyInstanceGraph / OntologyGraphWorkbench
[MODAL 圈 │ native modules] ─→ NativeModulesScreen
[浮层圈 │ update banner] ─→ AppUpdateCard
[顶层圈 │ WhatsNew] ─→ WhatsNewScreen (登录前也弹)
                              └─── EdgeSwipeBack 包裹所有内容, swipeBack() 一坨 if-else 倒序退栈
```

**关键事实**:
- 真只有 **5 个底栏 tab** (`TabBar.tsx:20-28`): 汇览 / 任务 / [+] / 员工 / 收件箱
  - 但**注意**: `TabBar.tsx` 里 RIGHT[1] label="资产", key=TabScope="assets" — 但 5 个 tab 名称是 "汇览·任务·[+]·员工·收件箱" — **与源码注释对不上**: 源码说 "汇览 / 任务 / [+] / 员工 / 收件箱" 但 RIGHT 第二项 key="assets" label="资产" 而 TabKey 类型还包含 "agents/ontology/artifacts" 这些子键 (TabBar.tsx:6)
- `tab` state 是 `TabKey = "dashboard" | "agents" | "chat" | "tasks" | "artifacts" | "ontology" | "assets"` (App.tsx:156), **7 个值**, 但 TabBar 只显示 5 个. 三个孤儿 key "agents/artifacts/ontology" 通过 `OrgAssetsScreen.initialTab` 映射到 Tab 5 的 segmented sub-tab (TabBar.tsx:104-106)
- `OrgAssetsScreen` 是**单一屏幕**, 内含 4 个 sub-tab (SegControl 切), 不是路由

---

## 2. Tab 入口审计表 (5 tab)

| Tab | 路径 | 子路由 | 内部入口数 | 死链 |
|-----|------|--------|-----------|------|
| **汇览** (dashboard) | `DashboardScreen` | 1 个 sheet (`costSheetOpen`) | 5 (`onOpenApprovals`, `onOpenApproval`, `onOpenWebWorkbench`, EmergencyStop/Resume) | 无 |
| **任务** (tasks) | `TaskKanbanScreen` | `TaskDetailScreen` (in-tab replace, 不换股) | 看板列 + 拖拽 + 浮窗 (`FilterSheet` assignee/project/sort) | **P0: TasksScreen.tsx 234 行是死代码, 没被引用** |
| **+ 中央 FAB** | (不是 tab) `NewTaskPage` | 3 个 onClick: `onOpenChat`/`onOpenAiCreate`/`onCreated` | — | 与 `TasksScreen.tsx:155-163` 自带 FAB "新建任务" 重复 |
| **工坊** (chat) | `BoardChatScreen` | 3 个 modal (`confirmClear`, `conversationsOpen`, `editorOpen`) | voice mic / 文件上传 / 审批快批 / build 卡 / spec 卡 | 无 |
| **资产** (assets) | `OrgAssetsScreen` | 4 个 sub-tab (ontology/projects/agents/artifacts) + 4 个 sub-screen (AgentsScreen / ArtifactsScreen / ProjectsScreen / OntologyDomainListScreen) | 6 个 extra pill + 1 个 "更多" Modal (4 项) | `onOpenOnboarding` 在 OrgAssetsScreen 接了但 App.tsx 没传 (MoreSheet 第 3 项永远 disabled) |
| **员工** (inbox) | **P0 没有该屏幕** | — | n/a | **InboxScreen.tsx 1238 行是死代码, 根本没被 App.tsx 引用**, TabBar 也只显示 5 tab 没真正独立的 inbox 屏 |

**关键缺陷**:
- `TabKey` 类型有 7 个值, 但 TabBar 只渲染 5 个, **3 个孤儿值** ("agents/artifacts/ontology") 通过 `OrgAssetsScreen` 的 SegControl 切换
- 但**真正的 "收件箱" (InboxScreen) 根本没接入**. App.tsx 的 NotificationsScreen 只是通知列表 (App.tsx:1187), 不是 inbox, 4 个 tab (all/mine/approvals/blocked) 的 1238 行代码**全在仓库里吃灰**

---

## 3. 跨 Tab 跳转矩阵

| 从 \ 到 | 汇览 | 任务 | [+] | 工坊 | 资产 |
|--------|------|------|-----|------|------|
| **汇览** | — | `onOpenApprovals` / `onOpenApproval` (App.tsx:1291-1301) → 任务 + 详情/approval | 无 | 无 | 无 |
| **任务** | 切回 (TabBar) | — | TasksScreen 自带 "新建任务" FAB | `BoardChatScreen` 关联任务: `onOpenIssue` (App.tsx:1308) → 任务 + 详情 | `onOpenProjectTasks` (App.tsx:1237-1241) → 任务 + 项目筛选 |
| **[+]** | 无 | `NewTaskPage.onCreated` (App.tsx:1449-1453) → 任务 | — | `NewTaskPage.onOpenChat`/`onOpenAiCreate` (App.tsx:1440-1448) → 工坊 | 无 |
| **工坊** | 无 | `onOpenIssue`/`onOpenPlan` (App.tsx:1308/1319) → 任务 + 详情 | 无 | — | 无 |
| **资产** | 无 | `onOpenIssue`/`onOpenProjectTasks` (App.tsx:1329-1335) → 任务 | 无 (但 OrgAssetsScreen 没有快速 "建任务" 入口) | `onOpenWebWorkbench` 走 Web 容器 | — |

**机制总结**:
- **跨 tab 跳转只通过 `navigateTab(key)`** (App.tsx:949)
- **没有任何"反向回流"** — 工坊跳任务后, 任务页返回靠 TabBar (切回去)
- **汇览 → 任务/工坊/资产 没有跳转** — 老板在汇览哪个 tab 想看工坊, 必须手动 TabBar

---

## 4. Modal/浮层清单 (19 个)

| # | State | 打开方式 | 关闭方式 | 关闭后跳到哪 |
|---|-------|----------|----------|--------------|
| 1 | `whatsNewOpen` | `shouldShowWhatsNew` (App.tsx:399) | `markWhatsNewSeen` | (顶层) 或 `/onboarding` deep link |
| 2 | `composeOpen` | TabBar 中央 "+" (App.tsx:1431) | `setComposeOpen(false)` / swipeBack | 不跳, 留在当前 tab |
| 3 | `settingsOpen` | (推断) 设置按钮 | `setSettingsOpen(false)` / swipeBack | 不跳 |
| 4 | `boardView` | (当前未使用) | — | — |
| 5 | `appUpdate` | `checkAppVersion` (App.tsx:840) | `setAppUpdate(null)` | 不跳 |
| 6 | `searchOpen` | `AppBar.onOpenSearch` (App.tsx:1104) | `setSearchOpen(false)` / swipeBack | 不跳 (但 `onOpenIssue` 会跳任务) |
| 7 | `notificationsOpen` | `AppBar.onOpenNotifications` (App.tsx:1103) | `setNotificationsOpen(false)` / swipeBack | 不跳 (但 `onOpenIssue` 会跳任务) |
| 8 | `agentDetail` | (从 AgentsScreen 设) | `setAgentDetail(null)` / swipeBack | 不跳 |
| 9 | `pipelinesOpen` | (从 TasksScreen 顶) | `setPipelinesOpen(false)` / swipeBack | 不跳 |
| 10 | `plansOpen` | (从 TasksScreen 顶) | `setPlansOpen(false)` / swipeBack | 不跳 |
| 11 | `projectsOpen` | (从 TasksScreen 顶) | `setProjectsOpen(false)` / swipeBack | 不跳 (但可跳任务 + 项目筛选) |
| 12 | `createTaskProjectId` | 项目卡 `onCreateTaskForProject` (App.tsx:1337) | `setCreateTaskProjectId(null)` / swipeBack | 不跳 (弹 CreateTaskModal) |
| 13 | `webContainerTarget` | 多个 `onOpenWeb*` | `setWebContainerTarget(null)` / swipeBack | 不跳 |
| 14 | `gitCredentialsOpen` | SettingsSheet `onOpenGitCredentials` (App.tsx:1391-1394) | `setGitCredentialsOpen(false)` / swipeBack | 不跳 |
| 15 | `pluginManagerOpen` | `onOpenPluginManager` (App.tsx:1361) | `setPluginManagerOpen(false)` / swipeBack | 不跳 (内嵌 `pluginSettingsId`) |
| 16 | `pluginSettingsId` | PluginManagerScreen `onOpenPluginSettings` (App.tsx:1249) | `setPluginSettingsId(null)` / swipeBack | 不跳 |
| 17 | `schemaEditorType` | OrgAssetsScreen `onOpenSchemaEditor` (App.tsx:1346) | `setSchemaEditorType(null)` / swipeBack | 不跳 (内嵌 `ontologyWorkbenchOpen`) |
| 18 | `instanceGraphType` | OrgAssetsScreen `onOpenInstanceGraph` (App.tsx:1349) | `setInstanceGraphType(null)` / swipeBack | 不跳 (内嵌 `ontologyWorkbenchOpen`) |
| 19 | `ontologyWorkbenchOpen` | `onOpenWorkbench` (App.tsx:1277) | `setOntologyWorkbenchOpen(false)` / swipeBack | 不跳 |
| 20 | `nativeModulesOpen` | SettingsSheet `onOpenNativeModules` (App.tsx:1395-1398) | `setNativeModulesOpen(false)` / swipeBack | 不跳 |
| 21 | `selected` (Issue detail) | TaskKanbanScreen `onOpenIssue` | `setSelected(null)` / swipeBack | 不跳 (in-tab replace) |
| 22 | `focusedApprovalId` | DashboardScreen `onOpenApproval` / NotificationsScreen `onOpenApproval` (App.tsx:1298 / 1196) | `setFocusedApprovalId(null)` / swipeBack | 不跳 |
| 23 | `specIssue` | TaskDetailScreen `onOpenSpec` (App.tsx:1039) | `setSpecIssue(null)` / swipeBack | 不跳 |
| 24 | `diffContext` | ArtifactsScreen `onOpenDiff` (App.tsx:1358) | `setDiffContext(null)` / swipeBack | 不跳 |
| 25 | `sandboxContext` | 多处 `onOpenSandbox` (App.tsx:1355) | `setSandboxContext(null)` / swipeBack | 可跳任务/产物 (sandbox 内 onOpenTask) |
| 26 | `onboardingOpen` | `shouldShowOnboarding` (App.tsx:857) | `markOnboardingDone` / swipeBack | 不跳 |

**核心问题**:
- 26 个 modal/详情 state, 每个都要 `App.tsx:1407-1428` 切 tab 时手 reset, **没有任何 abstraction**
- `swipeBack` (App.tsx:972-1000) 是 26 行 if-else 倒序退栈, 加一个 modal 必须先回来加一行

---

## 5. 重复入口 / 死链 / 走不通路径清单

### P0 (走不通)

#### P0-1: `OntologyDomainListScreen.tsx:977` — 文件夹目录输入框写错 state

```tsx
<TextInput
  ...
  value={directoryPath}
  onChangeText={setDisplayName /* placeholder state, see below */}  // ← BUG
/>
```

**真因**: `onChangeText={setDisplayName}` 把目录路径写到了 "显示名称" state, 而不是 `setNewDomainDirectoryPath`. 用户在「文件夹目录接入」模式下输入路径, 提交时 `directoryPath` 永远是空字符串, 后端拿不到路径就失败 (走 "directory 模式不空 metadata" 分支失败).

**严重度**: P0 — "建 domain" 是 wave239 主功能, 不可调

**老板原话**: "感觉这两天改的内容各种问题" (wave261 5 层下钻 PM 瞎做)

#### P0-2: `App.tsx:1373` — `TasksScreen.tsx` 整个文件是死代码

`TasksScreen.tsx` 234 行被 `App.tsx:78` 导入, 但**没有一处使用**. App.tsx 任务 tab 走的是 `TaskKanbanScreen` (App.tsx:1373). TasksScreen 顶部的 "新建任务" FAB (TasksScreen.tsx:156-163) 永远不被显示.

**真因**: TasksScreen 是 wave18 的旧版, 后 wave213 起被 TaskKanbanScreen 取代, TasksScreen 没删.

**严重度**: P0 — 234 行 + 19 个 useState 全部进 git 垃圾. 删掉即可.

**老板原话**: wave266 删共享登录但其它重复入口没清 — 同一现象在 TasksScreen 上演.

#### P0-3: `App.tsx` 没接 `InboxScreen.tsx` — 收件箱 1238 行全在吃灰

`InboxScreen.tsx` 1238 行实现了 4 个 tab (all / mine / approvals / blocked) + 左滑归档 + 派活 sheet + 阻塞视图. 整个文件**没被 App.tsx 引用**.

**真因**: wave65/wave69/wave70 投资做的 inbox 全功能, 但 App.tsx 任务 tab 路由只指向 TaskKanbanScreen, 收件箱功能**没落到任何 tab**.

**严重度**: P0 — 1238 行 + 收件箱所有能力 (归档/派活/阻塞) 完全不可见

**老板原话**: 老板真机 "感觉两天改的内容各种问题" — 投入没交付

### P1 (重复 / 不一致)

#### P1-1: 中央 "+" FAB 与 TasksScreen 自带 FAB 重复

- **中央 "+" FAB** (TabBar.tsx:89-101 → App.tsx:1431 → NewTaskPage 浮层)
- **TasksScreen 自带"新建任务" FAB** (TasksScreen.tsx:156-163 → CreateTaskModal)

但 TasksScreen.tsx 死代码, 所以现状只有中央 "+" 走 NewTaskPage. **一致性**: 用户在 "资产" tab 点中央 "+" → 走 NewTaskPage; 用户在 "任务" tab 点 TasksScreen 自带 FAB (永远不显示) → CreateTaskModal. **但** `createTaskProjectId` (App.tsx:1337) 走的是 CreateTaskModal, **同一逻辑但 2 个浮层**. 真要建任务时, 中央 "+" 走的是 NewTaskPage (语音派单为主), 项目卡走的是 CreateTaskModal (表单为主), **入口分裂**.

**严重度**: P1 — 入口分裂, 老板想 "派活" 要分清楚走哪条

#### P1-2: `OrgAssetsScreen` 与 `TabBar` TabKey 不一致

- `TabKey` 包含 7 个值 (`dashboard/agents/chat/tasks/artifacts/ontology/assets`) (App.tsx:156)
- TabBar 只渲染 5 个 (汇览 / 任务 / [+] / 员工 / 收件箱) (TabBar.tsx:20-28)
- RIGHT 第 2 项 key="assets" (TabBar.tsx:27), label="资产", 但注释说 "员工 / 收件箱"
- App.tsx 把 "agents/artifacts/ontology" 通过 `OrgAssetsScreen.initialTab` (App.tsx:1328) 路由到 Tab 5 内的 SegControl sub-tab
- **真因**: 老板原话 "工坊/本体/产物 不再占底部栏, 仍从任务页顶部的图标行进入" (App.tsx:159-165), 但 TabKey 留了 4 个孤儿值, 没清理

**严重度**: P1 — TypeScript 类型撒谎, 加新 tab 容易踩

**老板原话**: "5 域" wave261 5 层下钻 PM 瞎做

#### P1-3: `MoreSheet` 第 3 项 "新增实例" 永远 disabled

`OrgAssetsScreen.tsx:332-336` 接 `onOpenOnboarding` (可开关), 但 App.tsx:1324 传 OrgAssetsScreen 时**没传 `onOpenOnboarding`**, 第 3 项 (orgasm, 启用新员工入职引导) 永远 disabled.

**真度**: P1 — 入口在但点了没用

#### P1-4: 收件箱重复入口

- App.tsx:1187 `NotificationsScreen` (通知 list, 只显示通知) — 顶栏铃铛
- InboxScreen.tsx (1238 行全功能, 4 tab + 归档 + 派活) — **没接**入

**严重度**: P1 — 收件箱能力 (4 tab) 完全用不到, 顶栏铃铛的 NotificationsScreen 不是 inbox

### P2 (不一致)

#### P2-1: 顶栏铃铛红点 `unreadCount` 走 `useNotificationsStore`, 但点开的是 NotificationsScreen (通知列表), 不是收件箱

`App.tsx:1103 onOpenNotifications` 打开 NotificationsScreen, **不是** InboxScreen. unreadCount 是通知, 视觉上是铃铛, 跟 InboxScreen 是 2 个不兼容的事.

**严重度**: P2 — 老板看红点以为点开会看收件箱, 实际是通知

#### P2-2: 任务 tab 与 TaskDetailScreen 的返回交互

- 任务 tab 内打开 TaskDetailScreen → setSelected(issue) → `taskDetail` (App.tsx:1034) 替换 TaskKanbanScreen
- 返回靠 `onBack={() => setSelected(null)}` (App.tsx:1038) 或系统返回键 → swipeBack → setSelected(null) → 回到 TaskKanbanScreen
- 但 `TasksFilterProjectId` 不在 TaskDetailScreen 返回后清掉 (App.tsx:1407-1428 切 tab 时才清)
- **真因**: 项目筛选 state 没绑在 selected 上, 老板点完详情回来项目筛选还在

**严重度**: P2 — 老板看项目筛选没清以为程序脏

#### P2-3: TabBar.tsx:104 `tab === 'assets'` 高亮 "资产" tab 但不真正进入该 tab

`TabBar.tsx:104-106` 当 `tab === 'agents' || tab === 'ontology' || tab === 'artifacts'` 时也高亮 "资产" tab. 但 `OrgAssetsScreen` 收到的 `initialTab` (App.tsx:1328) 决定内部 SegControl 切到哪个 sub-tab. **真因**: 资产 tab 是 4 sub-tab, 高亮只跟主 tab, 不跟 sub.

**严重度**: P2 — 视觉高亮不精确

#### P2-4: deep link `coolie://chat/build[/<标题>]` (App.tsx:880-896) 处理在 HomeScreen 顶层, 但 `exportBoardPrompt` 入队后只在 `BoardChatScreen` 挂载时消费, 切到 chat tab 才挂载

**真因**: HomeScreen 顶层 useEffect 调 `navigateTab("chat")` (App.tsx:885-886), 切到 chat tab → BoardChatScreen 挂载 → `useEffect historyReady` (App.tsx:1386) drain 队列. 但 HomeScreen 顶层 useEffect 跑**之前** BoardChatScreen 已经挂载 (前一次切回), 队列入队后没机会被 drain (因为 historyReady 已经 true).

**严重度**: P2 — 大多数情况下不会死, 但冷启动时 deep link 顺序敏感

---

## 6. 推荐改造方案 (不下手, 只列)

### 6.1 合并 modal

- **`pipelinesOpen` / `plansOpen` / `projectsOpen`** — 都从 TasksScreen 顶进入, **应合并成单一 `tasksToolbarOpen` state**, 内嵌 SegControl 切换 (类似 OrgAssetsScreen 的 SegControl). 少 2 个 state flag + 2 个 swipeBack 分支
- **`pipelinesOpen` 跳的 PipelinesScreen + 多个 `onOpenWeb*` 走 WebContainerScreen** — 应统一走 WebContainerScreen, 不必写独立 PipelinesScreen (实际项目 Web 端已经实现了, App 端 RIP 重复)
- **`gitCredentialsOpen` / `nativeModulesOpen` / `webContainerTarget`** — 都是 "进入一个独立屏", 可合并成单一 `configStack` (modal 栈), 加第一项进入

### 6.2 下沉到主 tab

- **webContainerTarget 内的 `/projects`, `/ontology`, `/routines`, `/costs`, `/plugins`, `/dashboard`** — 这些都是 "Web 端抄过来的 5+ 个屏", 应在 OrgAssetsScreen 加 1-2 个 sub-tab (例 "插件管理" / "例行计划"), 不要每次都开 Web 容器
- **`skillMatcherOpen` (OrgAssetsScreen:113) "派活精准"** — 这是个浮层, 应下沉到 NewTaskPage 中央 "+" 浮层里 (FAB 一站式)

### 6.3 删 / 修死链

- **删 TasksScreen.tsx** — 234 行死代码, 删除即可
- **删 InboxScreen.tsx** 或**接入 App.tsx** — 1238 行要么删要么用, 现状 "两不沾" 最差
- **修 OntologyDomainListScreen.tsx:977** — `onChangeText={setNewDomainDirectoryPath}`, 不是 `setDisplayName`
- **删 OrgAssetsScreen.MoreSheet 第 3 项 "新增实例"** — 不接 onOpenOnboarding 永远 disabled, 删了不让人误点
- **清理 TabKey 类型** — `TabKey` 只留 5 个值 (`dashboard/tasks/chat/assets`), 删 `agents/artifacts/ontology` 孤儿键
- **删 `boardView` state** (App.tsx:795) — 已声明未使用

---

## 7. P0/P1/P2 缺陷总结表

| # | 文件:行 | 类别 | 描述 | 严重度 |
|---|---------|------|------|--------|
| 1 | OntologyDomainListScreen.tsx:977 | 走不通 | "文件夹目录" 输入框 onChangeText 写到 setDisplayName, 不是 setNewDomainDirectoryPath, 用户键入路径被吞 | P0 |
| 2 | App.tsx:78 + TasksScreen.tsx (whole file) | 死代码 | TasksScreen.tsx 234 行导入但没被引用, App.tsx 用 TaskKanbanScreen | P0 |
| 3 | App.tsx + InboxScreen.tsx (whole file) | 死代码 | InboxScreen.tsx 1238 行 (4 tab / 归档 / 派活 / 阻塞) 全功能未被 App.tsx 接入, TabBar 无 inbox tab | P0 |
| 4 | App.tsx:1431 + TasksScreen.tsx:155-163 | 重复入口 | 中央 "+" FAB 走 NewTaskPage, TasksScreen 自带 FAB 走 CreateTaskModal, 2 条建任务路径分裂 | P1 |
| 5 | App.tsx:156 + TabBar.tsx:6 | 类型撒谎 | TabKey 含 7 值但 TabBar 只显示 5, agents/artifacts/ontology 是孤儿键 | P1 |
| 6 | OrgAssetsScreen.tsx:332-336 | 死链 | MoreSheet 第 3 项 "新增实例" 接了 onOpenOnboarding 但 App.tsx 没传, 永远 disabled | P1 |
| 7 | App.tsx + InboxScreen.tsx + NotificationsScreen.tsx | 重复入口 | 顶栏铃铛走 NotificationsScreen (通知), 真 inbox 走 InboxScreen (4 tab 全功能), 用户视觉红点 ≠ 真实功能 | P1 |
| 8 | App.tsx:795 | 死代码 | boardView state 已用但从未 set | P2 |
| 9 | App.tsx:807 + App.tsx:1407 | 一致性 | tasksFilterProjectId 在 selected 切回时不重置, 老板看任务 tab 还套着上次项目过滤 | P2 |
| 10 | TabBar.tsx:104 | 视觉高亮 | "资产" tab 高亮不区分 4 个 sub-tab, 内部 SegControl 切换后 tab bar 不动 | P2 |
| 11 | App.tsx:880-896 + BoardChatScreen.tsx:1386 | 顺序敏感 | deep link coolie://chat/build 处理时 BoardChatScreen 可能已挂载, historyReady=true, 队列被消费前已 drain 完 | P2 |
| 12 | App.tsx:1287-1324 | 死代码 | OrgAssetsScreen 接 `onOpen+` 但 App.tsx 1340-1344 传了 onOpenWebProjects 和 onOpenWebOntology 但调用 OrgAssetsScreen 时画了一半的项目图标行 (OrgAssetsScreen.tsx:152-202) 永远显示 | P2 |
| 13 | App.tsx:1407-1428 | Schema 重置 | 切 tab 时硬 reset 19 个 state (一行行 set), 加新 modal 必须同步加一行 | P2 |

---

## 8. 修复优先级

1. **P0-1** (OntologyDomainListScreen.tsx:977) — 单字符修复, **直接可发**, 不依赖其他
2. **P0-2** (删 TasksScreen.tsx) — 纯删除, **直接可发**
3. **P0-3** (InboxScreen 接入) — 需要 UX 决定: 加 6 个 tab 还是 Tab 5 内的 sub-tab; 接入工作 1-2 周
4. **P1-4/6/7** — 一致性, 3-5 天
5. **P2** — 跟着 P0/P1 顺手修

**不推荐优先修**: `OrgAssetsScreen.MoreSheet 第 3 项` (P1-3) — 等 P0-3 收件箱接入后再说.

---

## 9. 附录: 文件清单

| 文件 | 行数 | 状态 |
|------|------|------|
| App.tsx | 1976 | 路由核心 |
| src/components/TabBar.tsx | 164 | 5 tab 定义 |
| src/screens/TasksScreen.tsx | 234 | **死代码 (P0)** |
| src/screens/TaskKanbanScreen.tsx | 822 | 真任务页 |
| src/screens/OrgAssetsScreen.tsx | 538 | 资产中枢 |
| src/screens/OntologyDomainListScreen.tsx | 1318+ | **P0 走不通** |
| src/screens/InboxScreen.tsx | 1238 | **死代码 (P0)** |
| src/screens/BoardChatScreen.tsx | 2792 | 工坊 |
| src/screens/AgentsScreen.tsx | 659 | (资产 sub) |
| src/screens/ArtifactsScreen.tsx | 1323 | (资产 sub) |
| src/screens/DashboardScreen.tsx | 1028 | 汇览 |
| src/screens/ProjectsScreen.tsx | 1048 | (资产 sub) |
| src/screens/PrototypeSandboxScreen.tsx | 1397 | 沙箱 modal |
| src/screens/WebContainerScreen.tsx | 554 | Web 容器 modal |

**未读但相关** (本任务审过但可补充): NotificationsScreen, SearchScreen, AgentDetailScreen, PipelinesScreen, PlansScreen, GitCredentialsScreen, CodeDiffScreen, SpecEditorScreen, NativeModulesScreen, PluginManagerScreen, PluginSettingsScreen, ApprovalFocusDetail, OntologySchemaEditorScreen, OntologyInstanceGraphScreen, OntologyGraphWorkbenchScreen, NewTaskPage, CreateTaskModal.

---

**报告完毕**. 行数: 251 (未超 800 行限制).