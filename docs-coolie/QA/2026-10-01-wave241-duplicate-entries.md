# wave241 — 重复功能入口扫描报告

> **波次**: wave241
> **日期**: 2026-10-01
> **触发**: 老板原话 3 条 — 全业务测试 (wave240 跑中) / 极简 + 傻瓜式 / **不能有重复功能入口**
> **范围**: 客户端 (clients/expo + clients/api-client) + 共享层 (packages/shared) + 服务端路由
> **手段**: 5 个视角 × 2 个共享层扫描 + 2 个跨层扫描 (键盘/刷新/Toast + 入口清单) — 共 7 个并行 agent + 主线程自查
> **立场**: 只列不修. 老板要的是清单, 不是修法
> **版本**: APK 0.6.10 (wave239), 不动 server / ui / clients/expo (本波纯测试)
> **发版**: commit type `chore(qa-duplicate-entries)`, push origin main, **不发 APK**

---

## 0. 总览

老板 3 条原话命中率最深的两个问题是:

1. **`App.tsx` 与代码注释严重不一致** — 注释反复说"5 个底栏 tab 是汇览/任务/[+]/员工/收件箱", 实际是"汇览/任务/[+]/工坊/资产". 「员工」和「收件箱」两个 tab **根本不存在**: 「员工」在资产 tab 的"👥 数字员工"分段里, 「收件箱」完全没接入底栏 (顶栏铃铛是 NotificationsScreen, 不是 InboxScreen).
2. **死代码 + 死入口** — SettingsSheet 完全不可达 (没人 `setSettingsOpen(true)`), InboxScreen.tsx (1238 行) 整个屏没被 import, TasksScreen.tsx 也死了. 旧 props/state 还在牵着 App.tsx.

7 个 P0 必改 + 14 个 P1 + 13 个 P2 重要事项, 总计 **34 项重复/冗余入口**. 详情见 §1-§6.

---

## 1. P0 — 必改 (7 项)

### P0-1 ⛔ **App.tsx 注释与实际 5 tab 完全不一致**

**事实**: 老板原话"5 个底栏 tab 是汇览/任务/[+]/工坊/资产"是**对的**, 但 TabBar.tsx:64 和 App.tsx:156/938/1021/1360 4 处注释还说「员工 / 收件箱」, **InboxScreen.tsx 在仓库里但 App.tsx 没 import, 所以"收件箱"tab 永远进不去**.

**注释与实际矛盾**:
- `App.tsx:156`: "底部栏只有 5 项 (汇览 / 任务 / [+] / 员工 / 收件箱)"
- `App.tsx:938`: "tab 级「上一页」... (任务/员工/收件箱) 上左缘右滑..."
- `App.tsx:1021`: "任务/收件箱两个 tab 选中 issue 时用它替换列表..."
- `App.tsx:1360`: "底部导航 — 汇览 / 任务 / [+] / 员工 / 收件箱 (固定常驻)"
- `TabBar.tsx:64`: "汇览 · 任务 · [+] · 员工 · 收件箱"
- 实际 `TabBar.tsx:21-28`: `dashboard / tasks / [+] / chat (工坊) / assets (资产)` — 只有 5 项, 注释里说的「员工」是 OrgAssetsScreen 内的 "👥 数字员工" pill, 「收件箱」是死代码 InboxScreen.

**影响**: 任何读 README / 注释 / 测试用例的开发者都会迷路, 客服沟通也错位.

**修法** (本波**只列**, 不动): 把所有过期注释改成实际 5 tab + 把「收件箱 = 顶栏铃铛 (NotificationsScreen)」写明, 「员工 = 资产段内 "👥 数字员工"」写明.

---

### P0-2 ⛔ **SettingsSheet 100% 不可达 — 退出登录 / 清缓存 / OTA / Git 凭证 / 原生模块 demo 5 项功能用户摸不到**

**事实**: `App.tsx:801 const [settingsOpen, setSettingsOpen] = useState(false)`, 全仓库 grep `setSettingsOpen` 只有:
- `App.tsx:986` swipeBack 里 `setSettingsOpen(false)` — 关闭
- `App.tsx:1343/1348/1352` 关闭 / 子回调

**零调用 `setSettingsOpen(true)`**.

**唯一声明的入口是死代码**: `InboxScreen.tsx:386-390` 头部有齿轮按钮 → `onOpenSettings` prop, 但 **InboxScreen 整体没被 import 渲染** (P0-3).

**5 个功能 100% 不可达** (`SettingsSheet` 在 `App.tsx:254-350`):
1. 版本更新 (OTA 检查)
2. 清理缓存
3. Workspace Git Toggle
4. 原生模块 (6 expo-* demo) 入口
5. 退出登录 — **老板要登出只能 force quit App**

**多公司用户切公司**: 也走不通 — `OrgAssetsScreen` 里 `PluginOrgSwitcher` 的 `switchableCompanies` / `onSwitchCompany` props App.tsx 也没传.

**修法**: 加齿轮按钮到 AppBar (用户视角的自然位), 把上面 5 项的回调传下去. 修 `PluginOrgSwitcher` 的 props 注入.

---

### P0-3 ⛔ **InboxScreen.tsx (1238 行) 死代码 + TasksScreen.tsx 死代码**

**InboxScreen.tsx (1238 行)**:
- 完整的 4 tab 收件箱 (全部 / 我的 / 审批 / 阻塞)
- 派活 (`派活给 ${name}`)
- @me 提及
- 归档
- 5 分钟自动静默刷新
- `InboxScreen.tsx:130 onOpenSettings` 回调 — 本该通到 P0-2 的 SettingsSheet, 但两层都死
- **App.tsx 全文 0 处 import InboxScreen** (CHANGELOG 撒谎说已接, 实测没接)

**TasksScreen.tsx (16KB)**:
- 任务 tab 实际渲染 `TaskKanbanScreen` (`App.tsx:1325-1335`)
- `TasksScreen` 只被 `App.tsx:75` 静态 import, **从未被 JSX 渲染**
- 列表 / 看板 / 分组 4 视图 (`IssuesList` 组件 `clients/expo/src/components/IssuesList.tsx` 445 行) 整个也跟着死
- `tasksRefreshToken` / `setTasksRefreshToken` state (App.tsx:913) 还在驱动这个死屏

**TasksScreen 内嵌的入口也都死**:
- 任务页内嵌搜索框 (`TasksScreen.tsx:251-268`)
- 项目筛选 chip (`TasksScreen.tsx:319`)
- 新建任务 FAB (`TasksScreen.tsx:372-378`)
- Pipeline / Plan / 项目中心 3 个 wave20 顶部编排按钮 — **都丢了**, 用户只能去工坊对话打字 `建 pipeline xxx`

**修法**: 删除或挂载 (老板决定). 删除前先把 `App.tsx:913 tasksRefreshToken` 等死 state / 死 import 一并清理.

---

### P0-4 ⛔ **新建任务 — 16 个并列入口 (中央 FAB + 项目中心 + 工坊 7 个命令 + WhatsNew 演示 + 深链 + AI chip + 沙箱空态)**

**用户视角**: "我要新建任务", 实际有 **16 个触达点** (5 主/次级, 5 命令, 6 隐藏):

| # | 入口位置 | 触发 | 屏幕渲染 |
|---|---|---|---|
| N-① | 底栏中央 "+" FAB | `TabBar.tsx:90-100 onCreate` → `App.tsx:1387 setComposeOpen(true)` | `NewTaskPage` 浮层 |
| N-② | 任务页右下角 FAB | `TasksScreen.tsx:371-378 setCreateOpen(true)` | CreateTaskModal (死屏) |
| N-③ | 项目卡「创建任务」 | `ProjectsScreen.tsx:561-569 onCreateTaskForProject(project)` → `setCreateTaskProjectId` | CreateTaskModal 直接弹 |
| N-④ | 项目中心「极速立项/导入代码库」 | `ProjectsScreen.tsx:232-241 setShowCreateSheet(true)` | CreateProjectSheet (建**项目**, 不建任务) |
| N-⑤ | 工坊 `build xxx / 开发 xxx` | `commandRouter.ts:57-78 kind=build` → `BoardChatScreen startBuild(prompt)` | 5 步链 |
| N-⑥ | 工坊 `domain xxx / 建域 xxx` | `commandRouter.ts:69-71 kind=domain` → `startSpec(prompt)` | spec 编辑器 |
| N-⑦ | 工坊 `plan xxx / 规划 xxx` | `commandRouter.ts:24 kind=plan` → `startPlan(command.subject)` | 建任务 |
| N-⑧ | 工坊 `建 pipeline xxx` | `commandRouter.ts:22 kind=pipeline` → `startPipeline` | 建 pipeline + 任务 |
| N-⑨ | 工坊 `开 pr xxx / 提交 pr xxx` | `commandRouter.ts:26 kind=pr` → `startPr` | 建带 pr-workflow 任务 |
| N-⑩ | 新建任务页「AI 创建」chip | `NewTaskPage.tsx:114 onOpenAiCreate` → `App.tsx:1400-1404 exportBoardPrompt` | 工坊对话 |
| N-⑪ | 新建任务页「对话」chip | `NewTaskPage.tsx:112 onOpenChat` → `App.tsx:1396-1399 navigateTab("chat")` | 工坊对话 |
| N-⑫ | 深链 `coolie://chat/build[/<标题>]` | `App.tsx:874-885 handleUrl` → `exportBoardPrompt` | 工坊对话 |
| N-⑬ | WhatsNew「查看演示」 | `App.tsx:867-872 demoRequested` → `exportBoardPrompt("build 一个演示项目...")` | 工坊对话 |
| N-⑭ | 新建任务页「更多」/「拍照上传」 | `NewTaskPage.tsx:202 onPress={() => setCreateOpen(true)}` | CreateTaskModal |
| N-⑮ | 原型沙箱空态 CTA | `App.tsx:1113-1116 onCreateTask` → `setComposeOpen(true)` | NewTaskPage |
| N-⑯ | 中央 [+] 浮层里的 CreateTaskModal 并列 | `App.tsx:1390` `<NewTaskPage>` + `App.tsx:1414` `<CreateTaskModal>` **同一栈并列渲染** | 两条都能"建任务" |

**重复度评级**: **P0** — 老板"中央 FAB / 项目中心创建任务 / 工坊对话 build / 工坊对话命令路由"完全吻合 4 个并列入口.

**修法 (老板定)**: 收口到中央 [+] 一个入口 + 工坊自然语言. N-②/N-③/N-⑪/N-⑭/N-⑮/N-⑯ 是 UI 残余, 砍. N-⑤~⑨ 是命令路由, 老板愿意就保留.

---

### P0-5 ⛔ **任务详情 — 8 处复制 `navigateTab("tasks") + setSelected(issue)` 模式**

打开"任务详情"在 App.tsx 是**两行动作**: 先切 tab, 再 setSelected. **8 个 callback 里逐字复制**:

| 行号 | 触发源屏 |
|---|---|
| 1123-1124 | PrototypeSandboxScreen.onOpenTask |
| 1165-1166 | SearchScreen.onOpenIssue |
| 1179-1180 | NotificationsScreen.onOpenIssue |
| 1194-1195 | AgentDetailScreen.onOpenIssue |
| 1212-1213 | PlansScreen.onOpenPlan |
| 1271-1272 | BoardChatScreen.onOpenIssue |
| 1282-1283 | BoardChatScreen.onOpenPlan |
| 1292-1293 | OrgAssetsScreen.onOpenIssue |

**修法**: 抽 `openTask(issue)` helper. 改一条规则要改 8 处的反模式.

---

### P0-6 ⛔ **WebContainerScreen — 7 处打开, 重复传 `{ path: "/projects", title: "项目中心" }` 默认值**

`WebContainerScreen` 是"打开 Web 子页"复用屏, 但打开入口散在 **7 处**, 每次手写 path/title 默认值:

| 行号 | 触发源 | path 默认 | title 默认 |
|---|---|---|---|
| 1203 | PipelinesScreen | (来自 props) | "流水线" |
| 1221 | ProjectsScreen | `/projects` | "项目中心" |
| 1237 | PluginManagerScreen | `/plugins` | "插件中心" |
| 1251 | DashboardScreen | `/dashboard` | "控制台" |
| 1303 | OrgAssetsScreen (项目卡) | `/projects` | "项目中心" |
| 1306 | OrgAssetsScreen (本体卡) | `/ontology` | "本体可视化设计器" |
| 1309 | OrgAssetsScreen (控制台入口) | `/dashboard` | "控制台" |

**真重复**:
- 「项目中心」`{ path: subPath || "/projects", title: title || "项目中心" }` 写了**两遍** (1221 + 1303)
- 「控制台」`{ path: path || "/dashboard", title: title || "控制台" }` 写了**两遍** (1251 + 1309)
- Title 默认值字符串字面量散在 7 处, 改个名字要 grep

**修法**: 抽 `WebRoutes` 静态表 + `openWeb(target, subPath?)` helper. 7 处 → 1 处.

---

### P0-7 ⛔ **TabBar.onChange 与 swipeBack 双清单同步 — 加新 modal 必须改 2 处**

`TabBar.onChange` (App.tsx:1363-1385) 写死 **19 个 `setXxx(null/false)`**, swipeBack (App.tsx:967-990) 也维护同样的 19 个 — 镜像清单, 顺序相反.

```ts
// TabBar.onChange:
setComposeOpen(false); setSelected(null); setProjectsOpen(false);
// ... 16 more

// swipeBack():
if (onboardingOpen) return setOnboardingOpen(false), true;
if (createTaskProjectId) return setCreateTaskProjectId(null), true;
// ... 17 more
```

**埋的雷**: 加任何新 modal state 必须同时改这两处 — 已经埋了 (pipelinesOpen / plansOpen / projectsOpen 都是只清不设的死 state, 是上一轮疏忽的证据).

**修法**: 引入 routeStack 单 reducer / app-router, 让 modal state 由一个有限状态机管理. `home tab root` 抽象 = "routeStack 为空". swipeBack = pop.

---

## 2. P1 — 重要 (14 项)

### P1-1 ⛔ **TabBar 撒谎 + OrgAssetsScreen 内部 4 pill — 双层 tab 命名空间冲突**

`TabBar.tsx:6` 声明 7 个 `BarTabKey` (`dashboard | tasks | chat | assets | agents | ontology | artifacts`), 视觉只渲染 4 个 tab, **`agents/ontology/artifacts` 三个 key 全被吸到 `assets` 下** (`TabBar.tsx:106` 高亮判定).

`App.tsx:1286` `tab === "assets" || tab === "agents" || tab === "ontology" || tab === "artifacts"` 全部路由到**同一个** OrgAssetsScreen, 用 `initialTab` prop 区分.

**OrgAssetsScreen 内部** (`OrgAssetsScreen.tsx:30` 的 `OrgAssetTab = "ontology" | "projects" | "agents" | "artifacts"`) 又自己渲染了 4 个 pill (本体/项目/员工/产物).

**双层 tab 架构**:
- 外层: TabBar 给老板看的 4 个底栏 (其中 1 个"资产"吸住 3 个隐藏 tab)
- 内层: OrgAssetsScreen 内部 4 个 pill (SegmentedControl)

**Bug 风险**: `tab === "agents"` 但 OrgAssetsScreen 内部 `activeTab === "ontology"` — 两个真相源.

**修法**: 要么外层真 7 个独立 tab, 要么外层只保留 `assets` 让 OrgAssetsScreen 自己管内 pill (但 initialTab 受控).

---

### P1-2 ⛔ **App.tsx 单组件 24 个 useState — 缺 router**

HomeScreen 第 798-913 行声明 **24 个 `useState`**, 其中 19 个 = 一个未命名的状态机被拆成 19 个 boolean. 这是"无 router"反模式. (与 P0-7 配对, 是同根问题的两个症状.)

---

### P1-3 ⛔ **"新建任务"同屏内部 CreateTaskModal 双源 (App.tsx:1390 + 1414)**

`App.tsx:1390-1427` 在 HomeScreen 同一栈内并列渲染两个独立 CreateTaskModal:

```tsx
{composeOpen ? (
  <NewTaskPage ... />           // ← N-① 中央 FAB 走这条
) : null}
{createTaskProjectId ? (
  <CreateTaskModal ... />       // ← N-③ 项目卡走这条
) : null}
```

用户视角: 两边都"建任务", 都是 CreateTaskModal 风格, 但走的两套 state.

---

### P1-4 ⛔ **"成本核算"双入口 (Dashboard StatTile + 资产 pill)**

- `DashboardScreen.tsx:336-345` [本月花费 ›] → 打开原生 `costSheetOpen` modal (DashboardScreen 内部 Modal, App.tsx 不感知)
- `OrgAssetsScreen.tsx:148-158` [💰 成本核算] pill → `onOpenWebWorkbench('/costs')` → Web 容器

**同功能, 一原生一 web, 两种入口**. 用户切成本分析会有"为什么这里跟那里不一样"的疑惑.

### P1-5 ⛔ **"设置" / "退出登录" 完全不可达 (P0-2 衍生)**

5 项功能用户摸不到 — 详见 P0-2.

### P1-6 ⛔ **审批入口 3+1 处并列**

- Dashboard 「待审批」StatTile → `onOpenApprovals` → 跳任务 tab (`App.tsx:1253-1259`)
- Dashboard 「待审批」单条 → `onOpenApproval(approvalId)` → `setFocusedApprovalId` (`App.tsx:1260-1263`)
- 通知屏铃铛→通知卡 → `onOpenApproval(approvalId)` → `setFocusedApprovalId` (`App.tsx:1182-1185`)
- 工坊对话审批气泡 → `onOpenApproval` (`App.tsx:1269`)

共 4 条路径, 两条不同语义 (`onOpenApprovals` 是列表 / `onOpenApproval` 是单条).

### P1-7 ⛔ **业务本体 / Ontology — 资产 tab + 本体列表内 web + 工坊 domain 命令**

- 资产 tab "🧠 业务本体" pill (`OrgAssetsScreen.tsx:64`) → OntologyDomainListScreen
- 本体列表页「在浏览器中打开」(`OntologyDomainListScreen.tsx:1071-1077`) → WebContainerScreen /ontology
- 工坊对话 `建域 xxx / 建模 xxx / domain xxx` (`commandRouter.ts:69-71`) → startSpec
- Dashboard `onOpenWebWorkbench` (`App.tsx:1308-1310`) — 实际未传 `/ontology`

### P1-8 ⛔ **资产段「更多」下拉的 4 个新 pill 全部 enabled=false (C3 from 老板视角)**

`App.tsx:1286-1324` 渲染 OrgAssetsScreen 时, `onOpenPluginManager / onOpenPrototypeSandbox / onOpenOnboarding / onOpenWebPluginManager` 4 个 prop 一个都没传.

因此 `OrgAssetsScreen.tsx:269/281/293/305` 的 4 项 `enabled: Boolean(...)` 永远 false:
- 「插件管理」 — 不可点
- 「画图 / 原型」 — 不可点
- 「新增实例」 — 不可点
- 「插件产物展示」 — 不可点

**老板点了"更多", 看到 4 项全部"未启用", 会怀疑 App 坏了**.

### P1-9 ⛔ **任务页顶部 4 个 wave20 编排按钮全丢 — Pipeline/Plan/项目中心找不到快捷入口**

用户原本可走 TaskKanbanScreen 顶部 4 chip 跳 Pipeline/Plan/项目中心/编排, 现在任务 tab 只有:
- 3 个 FilterSheet (指派 / 项目 / 排序)
- 「只看主线」chip
- 「列表 / 看板」SegmentedControl

**Pipeline / Plan / 项目中心** 入口完全消失 — 用户只能去工坊对话打字 `建 pipeline xxx`. 任务页与编排按钮的连接彻底断掉.

配套 `App.tsx:808-810` `pipelinesOpen / plansOpen / projectsOpen` 3 个 state 仍声明但 0 调用 setter, 也是死 state.

### P1-10 ⛔ **Artifact/WorkProduct/Deliverable — 7 种命名指向同一屏群**

| 屏/位置 | 用词 |
|---|---|
| `PrototypeSandboxScreen` 屏名 | "沙箱" |
| `OrgAssetsScreen.tsx:272` | "原型/沙箱" |
| `OrgAssetsScreen.tsx:275` | "画图" |
| `OrgAssetsScreen.tsx:67` | "📦 交付产物" |
| `OrgAssetsScreen.tsx:7-9` (注) | "产物" |
| `TaskDetailScreen.tsx:347` | "原型" |
| `ProjectsScreen.tsx:578` | "产物" |
| `ArtifactsScreen.tsx:71-77` | "交付物" |
| ontology `ENTITY_TYPES.work_product` | "work_product" |
| 类型 `CompanyArtifact` | "Artifact" |
| 类型 `IssueWorkProduct` | "WorkProduct" |
| `announcements.ts:15` 屏路径 | `/artifacts` |
| `validators/artifact.ts` | "artifact" |
| `IssueWorkProductType` | "WorkProduct" |

**四词同物 (artifact / work_product / IssueWorkProduct / CompanyArtifact)** + **7 种 UI 命名** 指向同一屏群.

### P1-11 ⛔ **Alert vs Toast 严重混用, wave184 没全量迁移**

- `Alert.alert` 出现: **73 处** (28 个文件)
- `showSuccessToast/showErrorToast/showInfoToast` 调用: **33 处** (6 个文件)
- 已迁移到 Toast 的屏只有 4 个: `NativeModulesScreen` / `OntologySchemaEditorScreen` / `OntologyInstanceGraphScreen` / `TaskKanbanScreen`

大头:
- `BoardChatScreen.tsx`: 10 处 Alert
- `OntologyDomainListScreen.tsx`: 13 处 Alert

`toast.ts:4` 注释自己说"替代 wave213 的 Alert.alert 包壳", 但实际没全量迁.

### P1-12 ⛔ **KeyboardAvoidingView 模板 4 个屏 100% 复制**

`BoardChatScreen / SpecEditorScreen / TaskDetailScreen / RegisterScreen` 4 个屏 100% 复制了同一段:
```tsx
<KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==="ios"?"padding":undefined}>
  <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={...}>
```

5 行模板代码散落在 4 个屏, 该抽 `<KeyboardScreen>`. **`NewTaskPage.tsx` / `SearchScreen.tsx` 没 KAV 但有 TextInput, 键盘会盖住底部按钮** — 这是真实 P0 子项 (Keyboard audit 标的).

### P1-13 ⛔ **RefreshControl 模板 15 个屏 100% 复制**

每个屏都有:
```ts
const [refreshing, setRefreshing] = useState(false);
// load 函数里:
if (isRefresh) setRefreshing(true);
try { ... } finally { if (isRefresh) setRefreshing(false); }
```

`useAsync<T>` 已实现 `loading/refetch`, 但 14/15 屏不用 — 平行实现. `OntologyDomainListScreen.tsx` 还有 L787/L1214 双 RefreshControl + header 自定义刷新按钮 — outlier.

### P1-14 ⛔ **「设设置 / 切公司 / 退出登录」3 项基本不可达**

- 设置 (P0-2): 100% 不可达
- 退出登录: SettingsSheet 里, 同样不可达 — **只能 force quit**
- 切公司: `OrgAssetsScreen` 里 `PluginOrgSwitcher` props App.tsx 没传 — 多公司用户切公司只能退出重登

---

## 3. P2 — nice-to-have (13 项)

### P2-1 · 硬编码颜色 340 处 (vs token 1414 处, 19% 违规率)

`grep -rE "color: ?['\"]#|backgroundColor: ?['\"]#"` 返 340 处硬编码颜色. 已知根因 (DESIGN.md 之前的 token-only 规则没收紧). 这一项**不属 wave241 主战**, 但属于「视觉重复 / 不一致」类.

代表:
- `BoardChatScreen.tsx` 6 处 `#FFFFFF` / `#0F1011`
- `InboxScreen.tsx` 5 处
- `NewTaskPage.tsx` 1 处 `#FFFFFF`

修法: 跑 `pnpm check:token-gates` 一遍, 跟 `scripts/check-token-gates.mjs` allowlist 同步.

### P2-2 · BoardChatScreen.tsx 2792 行 — 最大单屏

90 KB, 是第二大屏 (OntologyDomainListScreen 2088 行) 的 1.3 倍. 函式拆得多 (8 个 function), 84 个 Pressable, 18 个 export. 应拆 `BoardChatInput` / `BoardChatMessageList` / `BoardChatHeader` 3 个子组件.

### P2-3 · "项目中心" 6 个并列入口

- Dashboard 大盘 (走 web)
- 任务页项目筛选 chip (死)
- 资产 tab "📁 项目中心" pill
- 资产「更多」下拉 → `/plugins` (web)
- `projectsOpen` 独立屏 (死)
- 项目卡「项目控制台」按钮 (web)

### P2-4 · "搜索" 2 个并列入口

- AppBar 全局搜索 (顶栏 🔍)
- 任务页本地搜索框 (死屏 TasksScreen.tsx:251)

实际死一个, 但命名/语义重复.

### P2-5 · "插件" 4 个并列入口

- 资产「更多」下拉"插件管理" → PluginManagerScreen
- PluginManagerScreen "完整市场" → `/plugins` web
- PluginManagerScreen 单插件"配置" → PluginSettingsScreen
- 资产「更多」下拉"插件产物展示" → `/plugins` web

**两个路径打开同一个 web `/plugins` 屏**.

### P2-6 · "原型 / 交付物" 6+ 个并列入口 (P0-4 衍生)

`PrototypeSandboxScreen` 列表视图 (`wave138c` 扩) ↔ `ArtifactsScreen` 列表视图 — **职责重叠**, 都是"列出 + 预览"交付物, 范围不同 (任务/项目 vs 公司全集) 但功能同构.

修法: 把 ArtifactsScreen 降级为 PrototypeSandboxScreen 列表视图的"全集模式", 或反之.

### P2-7 · "原型 / 沙箱 / 画图" 命名 7 种 (P1-10 衍生)

具体命名清单见 P1-10. 老板要收敛到 1-2 个词.

### P2-8 · `task` 一词三义

- `IssueKind = "task"` (issue 子类型)
- `IssueSpecKind = "task"` (spec 节点类型)
- `GoalLevel = "task"` (目标层级)
- telemetry `agent.task_completed` (执行单元)

4 处同词, 4 种语义边界.

### P2-9 · Artifact / WorkProduct / Deliverable 三词同物 (P1-10 的类型层)

- 屏 `/artifacts` ↔ type `CompanyArtifact` ↔ ontology 节点 `work_product` ↔ issue 子项 `IssueWorkProduct` ↔ schema 注释「artifact review document」—— 5 处用词不收敛.

### P2-10 · `OntologyDomain` snake_case + camelCase 双拼

`packages/shared/src/types/` 的 `OntologyDomain` interface (line 872) 15 个字段每个都写两遍: `company_id?: string; companyId?: string;`. 30 个有效字段槽在 1 个 interface 里.

plugin-worker 返 snake_case + control-plane 返 camelCase 的妥协产物, 但字段对就是同一事实.

### P2-11 · `IssueMilestone` ↔ `WbsMainlineMilestone` 80% 字段重叠

8/9 字段共享 (`gate | status | plannedDate | completedDate | approver | evidence | exempted | exemptionReason`). WbsMainlineMilestone 仅多 `id | code | title | gateLabel | blocked`.

本质是 "milestone list row vs detail row", fields 80% 重叠, 目前是两个独立 Type 但人工维护同步.

### P2-12 · `WorkProduct` 家族 4 type 互重叠

`IssueWorkProduct` / `WorkProductVersion` / `CompanyArtifact` / `CompanyArtifactVersionSummary` 4 个 type 互有重叠. 两个描述"交付物行".

### P2-13 · `Members` (人) vs `Agents` (AI) 语义分离, 屏路径不区分

- `API.agents = /api/agents` 是 AI 员工目录
- `API.members = /api/members` 是"人"
- 但屏路径只有 `/agents`, 容易混

修法: 把成员管理做成 OrgAssets 段内新 pill「公司成员」, 不与 AI 员工混.

---

## 4. 服务端 + 共享层重复 (Palantir 视角, 与客户端并列报告)

### 4.1 API endpoint 重复

- **真重复**: 928 个 server route 声明, 跨文件**只有 2 对真重复** (`companies.ts:426` 与 `issues.ts:7802` 同一份 400 handler 复制)
- **client.ts**: 70 处 `this.request` 调用, 端点层基本无重复, **只有 2 对真重复**:
  - `setIssueAssignee(465)` vs `updateIssue(477)` → 都是 PATCH `/api/issues/:id`
  - `approveApproval(1596)` + `rejectApproval(1607)` vs `resolveApproval(1626)` → 都是 `/api/approvals/:id/{approve|reject}`
- **4 处 fallback retry 模式**: `getWorkspaceDiff` / `listAttachments` / `getOntologySnapshot` / `setDomainLifecycle` 各自 try-A → catch 404/405 → try-B

### 4.2 类型重复 (与客户端 / 数据库共看)

**关键发现**: 5 个 entity interface 在 `packages/shared/src/types/` 和 `clients/api-client/src/types.ts` 双重声明:
- `Agent` (28 字段共享 vs 9 字段客户端)
- `AgentPermissions` (4 字段共享)
- `Issue` (≈100 字段共享 vs 19 字段客户端)
- `Project` (≈25 字段共享 vs 16 字段客户端)
- `Company` (20 字段共享 vs 4 字段客户端)

`IssueCostSummary` 在 `coolie.ts:205` 8 字段重声明 vs `types/cost.ts:33` 9 字段 canonical.

**8 个 server-resource type 应在 `packages/shared/src/types/` 但只在 `clients/expo/src/coolie.ts` 声明**:
- `NotificationItem` / `NotificationFeed` (coolie.ts:272/282)
- `AgentConfiguration` (coolie.ts:339)
- `IssueComment` (coolie.ts:352)
- `IssueAttachment` (coolie.ts:361)
- `SearchAgentResult` / `SearchTaskResult` / `SearchDocumentResult` / `SearchResults` (coolie.ts:287-309)
- `PipelineListRow` (coolie.ts:387)

### 4.3 Zod Schema 重复 (Create / Update / Upsert)

117 个 `createX/UpdateX/UpsertX` schema. **5 个最严重**:
- `tool-access.ts` (24 CRUD schema) — 多数 hand-roll update 而非 derive from create
- `issue.ts` (11 CRUD schema)
- `secret.ts` (10 CRUD schema) — 4 个 schema (rotateSecret / createSecret / updateSecret / rotateUserSecretValue) 4 个字段重复
- `access.ts` (9 CRUD schema) — `updateCompanyMemberSchema` 与 `updateCompanyMemberWithPermissionsSchema` refine 表达式 100% 复制
- `company-skill.ts` (17 export)

**模式**: `CreateX / UpdateX` 类型与 `X` (canonical) 独立声明, 字段漂移已发生 (e.g. `Routine` 28 字段 vs `createRoutineSchema` 14 字段).

---

## 5. 总结 — 老板要看的 5 个 P0 (按"必改"优先级)

1. **P0-2 + P0-3**: SettingsSheet + InboxScreen + TasksScreen 三个**死代码** 联手把"退出登录 / 切公司 / 收件箱 / 任务搜索 / 任务页项目筛选 / Pipeline-Plan-项目中心编排按钮"一起埋了. 这一组修 = 复活 8 项功能.
2. **P0-4**: 新建任务 16 个并列入口 — 砍到 3 个 (中央 [+] + 工坊自然语言 + 命令路由).
3. **P0-5 + P0-6 + P0-7**: App.tsx 重复模式三件套 — 抽 `openTask(issue)` / `openWeb(target)` helper + routeStack 单 reducer. 这是**架构债**, 不修就继续埋雷.
4. **P0-1**: 注释与实际 5 tab 不一致 — 5 分钟修改 + 改文档.
5. **(本报告 §2 P1-1)**: TabBar 撒谎 + OrgAssetsScreen 内 4 pill — 双层 tab 命名空间冲突.

## 6. 总结 — 老板要看的 5 个 P2 (nice-to-have)

1. **P2-1**: 硬编码颜色 340 处 — 跑 `pnpm check:token-gates` 一遍, 不在本波但应跑.
2. **P2-8/P2-9**: `task` 一词三义 / Artifact 三词同物 — 老板口吻中文一致化, 修法是把代码内命名 (IssueKind / OntologyType) 加 `Display` 字段统一 UI 文案.
3. **P2-10/P2-11/P2-12**: 共享层 `OntologyDomain` / `IssueMilestone` / `WorkProduct` 家族类型重叠 — 应在下一波专做"types 重构"波.
4. **P2-13**: `Members` vs `Agents` 屏路径不区分.
5. **P2-2**: BoardChatScreen 2792 行拆 3 个子组件.

---

## 7. 跨波次影响 (本波**只列不修**, 给后续波参考)

| 后续波 | 修的事 | 阻碍 |
|---|---|---|
| wave242 | 删除 `InboxScreen.tsx` + `TasksScreen.tsx` 死屏, 清理 `App.tsx` 死 state / 死 import | 无 (本波已埋好 anchor) |
| wave243 | 抽 `openTask` / `openWeb` / routeStack 单 reducer | P0-5/P0-6/P0-7 同根 |
| wave244 | 复活 SettingsSheet + 加 AppBar 齿轮 + 修 `PluginOrgSwitcher` props | P0-2/P1-14 |
| wave245 | 注释大扫除 (5 处 App.tsx + 1 处 TabBar.tsx + 1 处 AGENTS.md) | P0-1 |
| wave246 | Alert → Toast 批量迁移 (BoardChatScreen 10 + OntologyDomainListScreen 13) | P1-11 |
| wave247 | KeyboardAvoidingView + RefreshControl 抽 hook | P1-12/P1-13 |
| wave248 | 类型层重构 (`packages/shared/src/types/` 与客户端对齐) | P2-10~13 |

---

## 8. QA 验收

- 撞机完: 7 个并行 agent (老板视角 + Palantir 架构 + 共享层命名 × 2 + 跨功能入口 + bottom tabs + 键盘/刷新/Toast) + 主线程自查
- 报告完整: P0 × 7 + P1 × 14 + P2 × 13 = **34 项**, 跨 5 视角 + 共享层 + 服务端
- 主线程实测:
  - `App.tsx:1390` NewTaskPage + `App.tsx:1414` CreateTaskModal 同栈并列 ✓
  - `App.tsx:1286` 4 个 tab key 共用 OrgAssetsScreen ✓
  - `setSettingsOpen(true)` 全仓 0 调用 ✓
  - `InboxScreen.tsx` 未被 import ✓
  - `TasksScreen.tsx` 静态 import 但 JSX 0 渲染 ✓
  - `OrgAssetsScreen` 4 个 MoreSheet 项 `enabled: Boolean(...)` 全部 false ✓
  - `package.json` + `clients/expo/src/services/` 同步检查 — 未触.

## 9. 发版

- 不发 APK (纯测试波)
- commit type: `chore(qa-duplicate-entries)`
- push origin main (这是 fork 主线, 不是 PR 流程)

---

**真实信号密度**: 老板原话 3 条命中 34 项里的 **7 项 P0**, 其中 **5 项是"功能入口完全不可达"或"重复模式 8+ 处复制"** — 是真正的 P0 信号, 不是 noise. 后续 27 项里 14 项 P1 是中等优先级 (合并后可一波修), 13 项 P2 是技术债.

最关键的一句: **「不能有重复功能入口」被违反的最严重的不是 UI 层, 是 App.tsx 24 个 useState 没 router** — 修 P0-7 = 同时修 7 项 P0/P1.

---

## 10. 补充 — Modal/Sheet 共用度 + 右上菜单/badge/长按 + 三大路径深度扫描 (8-9 号 agent)

最后两个 agent 又带回一组高密度发现, 单独立§10 收纳, **不动前面的 P0/P1/P2 编号**.

### 10.1 Modal/Sheet 共用度 (Modal/Sheet audit)

**关键发现**: 仓库 **17 处浮层**, 共用 `ui/Sheet.tsx` 仅 8 处, **9 处自做**.

#### 底部抽屉 12 处

| 状态 | 数量 | 屏/组件 |
|---|---|---|
| ✅ 走共用 `Sheet` | 8 | AgentPickerSheet / FilterSheet / ArtifactVersionSheet / ApiContractSheet / ExternalOpenSheet / AgentsScreen.AgentDetailSheet / NativeModulesScreen |
| ❌ 自做 Modal+slide | **5** | CreateProjectSheet / CreateTaskModal / BuildModeModal / GitCredentialsScreen.CreateCredentialSheet / BoardChatScreen.conversationsOpen |

**最高 ROI 合并目标**: `CreateCredentialSheet` (`GitCredentialsScreen.tsx:213-344`) 与 `Sheet.tsx` 的实现 99% 一致 — 只缺 close 按钮, 一行替换.

#### 中央弹窗 10 处 — **零共用组件**

形态分裂:
- **ConfirmDialog** (居中, 短文 + 取消/确认, 圆角 14): BoardChatScreen 2 处 (`confirmClear` + `editorOpen`)
- **FormDialog** (居中, 表单 + 底部取消/确认, 圆角 14): OntologyDomainListScreen + OntologySchemaEditorScreen (2 处)
- **ActionSheet** (底部 slide-up + 列表 + 取消, 圆角 18): InboxScreen 2 处 + OrgAssetsScreen.MoreSheet 1 处 + Dropdown 1 处
- **DetailsPanel** (底部 slide-up + 长内容 + 关闭): DashboardScreen.costSheet 1 处
- **全屏预览** (全屏): ArtifactsScreen.previewArtifact + InlinePreviewPanel.fullscreen + WhatsNewScreen.fullScreen

**关键阻塞**: `Sheet` API 不支持 `headerSlot` (右上的 close 按钮) 和 `footerSlot` (贴底按钮行) — 这是阻止 CreateProject / CreateTask / BuildMode 合并的真正原因, 不是开发者偷懒.

**BoardChatScreen `conversationsOpen`** 是**唯一圆角 16 硬编码** 而非 `RADIUS.xl=18` 的底部 sheet, 最偏离设计规范.

**PluginOrgSwitcher** 用 `animationType="none" + Animated` 自做 fade, 是历史包袱 (其他 sheet 全 slide 或 fade).

#### 没暴露的关键能力

仓库 **没有任何 drag-to-dismiss (上滑手势) 实现**, 所有 sheet 靠 `onRequestClose` (Android 物理返回) 或点暗背景关闭 — Sheet API 没暴露 PanResponder.

### 10.2 右上三点菜单 / 红点 badge / 长按菜单 (三项交互统一度审计)

#### 右上三点菜单

| 实现 | 屏/位置 | 问题 |
|---|---|---|
| ✅ composer/MoreMenu 胶囊 (size=15) | composer | 规范样板 |
| ⚠️ `ellipsis-horizontal` size=12 + "更多" 文字 | OrgAssetsScreen | 与 composer 胶囊不一致 |
| ❌ 原生 `Alert.alert` 弹菜单 | BoardChatScreen 对话行 (1980/2002) | iOS 中央弹窗, 不一致 |
| ❌ 原生 `Alert.alert` 弹菜单 | OntologyDomainListScreen 域卡片 (1240) / UUID 文本 (828) | 该统一 |
| ❌ 原生 `Alert.alert` 弹菜单 | PluginManager 卸载 (234) | 破坏性操作, 该 SheetItem |

**P0**: 4 处 `Alert.alert` 模拟菜单迁到 `ui/Dropdown.tsx` 风格轻弹层 (iOS 视觉不一致是真正问题).

#### 红点 badge

| 位置 | 形态 | 状态 |
|---|---|---|
| AppBar 铃铛 (AppBar.tsx:46-51) | 数字 (16×16, C.err 实心) | ✅ 规范 |
| NotificationsScreen 行内 (NotificationsScreen.tsx:230) | 实心小圆点 (8×8, C.err) | ⚠️ 该抽 Badge |
| NotificationsScreen 筛选 chip (NotificationsScreen.tsx:122-124) | 数字 chip (11px, rgba(239,68,68,0.15)) | ⚠️ 同信号 3 套长相 |
| 11 处状态文字 (QuickApprovalCard / CreateProjectSheet / ProjectsScreen / ArtifactsScreen / CodeDiffScreen / WhatsNewScreen / SpecDiffCard / PluginManagerScreen / PluginSettingsScreen / OntologyDomainListScreen / BuildProgressCard) | Pill/StatusBadge | ✅ 规范 |

**P0**: 抽 `ui/Badge.tsx` 暴露 `<Badge count={n} variant="dot|numeric" tone="err|warn|ok|accent" />`. 当前 11 个 Pill/StatusBadge/Chip 都已承认 metadata 该独立, **就是漏了 Badge**.

#### 长按菜单

| 屏 | 长按对象 | 弹出实现 | 问题 |
|---|---|---|---|
| InboxScreen (487, 575, 590) | InboxIssueRow / BlockedRow / SwipeToArchive | **自建 Modal+SheetItem** | ✅ 规范样板, 但藏在文件内私有 |
| TasksScreen (357-359) | 任务行 (走 IssuesList) | **不弹菜单**, 只 setFocusMainlineId 聚焦下钻 | ❌ 同 IssueRow 双语义 |
| BoardChatScreen (1980) | 对话行 | 原生 `Alert.alert` 弹重命名/归档 | ❌ 该 SheetItem |
| BoardChatScreen (285, 356) | 审批气泡 | 长按 = 进详情 (与短按同) | ❌ 无意义 |
| BoardChatScreen (1587, 1607) | 用户/助手消息气泡 | `Alert.alert("已复制"…)` + Clipboard | ❌ 该 toast (wave184 已落地) |
| PluginManagerScreen (234) | 插件 AppCard | `Alert.alert` 二次确认卸载 | ❌ 该 SheetItem |
| OntologyDomainListScreen (1235) | 域卡片 | `Alert.alert` 弹"实例图谱/编辑字段" | ❌ 该 SheetItem |
| OntologyDomainListScreen (826) | UUID 文本行 | `Alert.alert` 显示 UUID | ❌ 该 Clipboard + toast |
| OntologyInstanceGraphScreen (298, 347) | 节点/列表行 | `showInfoToast` 假装 onDelete 实际是 toast 详情 | ❌ 函数名 vs 行为错配 |
| TaskKanbanScreen (562) | 拖拽中 (非长按) | `expo-haptics ImpactFeedbackStyle.Medium` | ✅ 唯一震动反馈 |

**P0**: 抽 `ui/LongPressMenu.tsx` 收纳 InboxScreen 的 SheetItem 模式, 搬 4 处 `Alert.alert` 长按过来.

**P1**: `delayLongPress` 3 档 (300/320/350ms) 统一 320; 所有破坏性长按加 `expo-haptics selectionAsync` (当前 0 处).

### 10.3 「审批 / 新建任务 / 插件」三大路径深度扫描

#### 审批

**入口 5 处 + 浮动卡 3 处**:
- Dashboard 「待审批」StatTile → 跳任务 tab + reset 4 states (App.tsx:1253-1258)
- Dashboard 「待审批」单条 → setFocusedApprovalId (App.tsx:1260-1263)
- InboxScreen 4 tab 之一 "审批" (死屏)
- NotificationsScreen `target.kind === "approval"` → setFocusedApprovalId (App.tsx:1182-1185)
- BoardChatScreen `InlineApprovalBubble` → onOpenApproval (App.tsx:1269)
- SpecDiffCard → onOpenApproval (多处)
- TaskKanbanScreen 右下浮动卡 (445)
- TasksScreen 右下浮动卡 (368) — 死
- ApprovalFocusDetail 全屏裁决 (1449-1525)

**收敛度良好**: 全部最终汇聚到 `ApprovalFocusDetail` 一个裁决屏, 复用 `QuickApprovalCard`. 决策后 `exportBoardEcho` 把「✅ 已批准 / ⛔ 已驳回」写回工坊聊天流.

**风险点**: `approvalLabel / formatApprovalSummary / formatApprovalTitle / approvalTypeLabel` 4 个纯函数 helper 在 QuickApprovalCard 定义, 但 BoardChatScreen 也引 — 共享契约清晰. 唯独 TaskDetailScreen **完全无审批引用** — 任务详情里看不到审批信息, 这才是 UX 真正缺位.

#### 新建任务

老板原话 4 个; **实际展开 5 直接 + 1 间接 + 1 孤儿**:

| # | 入口 | 落地 | 状态 |
|---|---|---|---|
| 1 | 中央 "+" FAB | NewTaskPage → CreateTaskModal | ✅ 主入口 |
| 2 | TasksScreen 右下角 FAB「+ 新建任务」 | CreateTaskModal | ❌ 死屏 |
| 3 | 项目卡内「创建任务」 | CreateTaskModal (initialProjectId) | ✅ 预选项目 |
| 4 | NewTaskPage 「拍照上传」 chip | CreateTaskModal | ⚠️ 隐藏 |
| 5 | NewTaskPage 「AI 创建」 chip | build-orchestrator | ⚠️ 隐藏 |
| 6 | 工坊触发词 (build/plan/pr/pipeline/domain) | createIssue / build-orchestrator | ⚠️ 命令 |
| 7 | BuildModeModal (孤儿) | 自身 | ❌ 未挂载 |

**BuildModeModal 是孤儿组件** — 注释说「任务页顶部 [🔨 Build 5 步链] 的落地入口」, 实际 `grep "BuildModeModal"` 在 clients/expo/ 零匹配 import. 注释误导新接手者.

**整个 App 没有 sub-task 概念**: TaskDetailScreen 无「创建子任务」, InboxScreen 无「转任务」.

#### 插件

**唯一入口**: OrgAssetsScreen 头部「更多」→ `插件管理`. AppBar / TabBar / 设置 / Dashboard / TaskDetail 全部无插件引用.

| # | 入口 | 落地 |
|---|---|---|
| 1 | OrgAssetsScreen 「更多」→ `插件管理` | PluginManagerScreen |
| 2 | OrgAssetsScreen 「更多」→ `插件产物展示` | WebContainer `/plugins` |
| 3 | PluginManagerScreen 右上「Web 端完整插件中心」 | WebContainer `/plugins` |
| 4 | PluginManagerScreen 行点击 | PluginSettingsScreen |
| 5 | PluginSettingsScreen 顶部返回 | PluginManagerScreen |

**两条路径打开同一个 web `/plugins` 屏** (#2 + #3): 入口 #2 是 OrgAssetsScreen "更多" 下拉里的"插件产物展示", 入口 #3 是 PluginManagerScreen 头部右上角的"Web 端完整插件中心". 用户视角命名不同但打开相同 URL, 是老板原话"不能有重复功能入口"的字面违反.

**注**: `PluginOrgSwitcher` (OrgAssetsScreen:129-136 头部) 是**多公司切换**不是插件管理, 命名误导.

### 10.4 §10 总结

**新增 P0 (3 项, 紧接 §1 的 P0-7)**:
- **P0-8**: 抽 `ui/Badge.tsx` — AppBar 数字 + NotificationsScreen 红点 + unreadChip 3 套同信号不同长相.
- **P0-9**: 抽 `ui/LongPressMenu.tsx` — InboxScreen 的 SheetItem 是仓库最成熟样板, 但藏在文件内私有; 4 处 `Alert.alert` 长按搬过来.
- **P0-10**: 抽 `ui/Dropdown`/ActionSheet 共用 — 4 处原生 `Alert.alert` 模拟菜单 (iOS 视觉不一致是真正问题).

**新增 P1 (3 项, 紧接 §2 的 P1-14)**:
- **P1-15**: `Sheet` 扩展 `headerSlot` + `footerSlot` API, 让 CreateProject / CreateTask / BuildMode 4 行替换.
- **P1-16**: 创建中央弹窗共用组件 (ConfirmDialog / FormDialog / ActionSheet / DetailsPanel), 收编 10+ 处自做.
- **P1-17**: `delayLongPress` 3 档 (300/320/350) 统一 320; 破坏性长按加 `expo-haptics`.

**新增 P2 (4 项, 紧接 §3 的 P2-13)**:
- **P2-14**: BuildModeModal 是孤儿组件, 删或挂载 (注释误导接手者).
- **P2-15**: BoardChatScreen `conversationsOpen` 圆角 16 硬编码, 该 `RADIUS.xl=18`.
- **P2-16**: `PluginOrgSwitcher` 命名误导 (是多公司切换不是插件), 该改名 `CompanySwitcher`.
- **P2-17**: OrgAssetsScreen 「更多」/「例行计划」/「成本核算」三个 extraPill 与 composer/MoreMenu 胶囊不一致 (size=12 vs 15, "更多"文字 vs 纯图标), 收编.

---

## 11. 重新统计

合并 §10 增量后:

| 等级 | §1-§3 计数 | §10 增量 | 总计 |
|---|---|---|---|
| **P0** | 7 | 3 | **10** |
| **P1** | 14 | 3 | **17** |
| **P2** | 13 | 4 | **17** |
| **总计** | **34** | **10** | **44** |

老板原话 3 条命中率最深的:
1. **「不能有重复功能入口」** — 命中 P0-4 (16 个新建任务入口) / P0-6 (WebContainer 7 处打开) / P1-10 (原型 7 种命名) / P0-10 (4 处 Alert 顶替菜单)
2. **「极简 + 傻瓜式」** — 命中 P0-1 (注释与实际 tab 不一致) / P0-2 (SettingsSheet 不可达) / P0-3 (死代码 1238 行)
3. **「全业务测试 (wave240 跑中)」** — 给后续修法波提供输入 (本波不动)

---

## 12. QA 报告完整度 (更新)

- 撞机完: 9 个并行 agent (老板视角 / Palantir 架构 / 共享层命名 × 2 / 跨功能入口 / bottom tabs / 键盘/刷新/Toast / Modal-Sheet / App.tsx 拓扑 / 审批+任务+插件 / 右上菜单+badge+长按) + 主线程自查
- 报告完整: **P0 × 10 + P1 × 17 + P2 × 17 = 44 项**, 跨 5 视角 + 共享层 + 服务端 + 视觉交互层
- 主线程实测 (8 处事实核验):
  1. `App.tsx:1390` NewTaskPage + `App.tsx:1414` CreateTaskModal 同栈并列 ✓
  2. `App.tsx:1286` 4 个 tab key 共用 OrgAssetsScreen ✓
  3. `setSettingsOpen(true)` 全仓 0 调用 ✓
  4. `InboxScreen.tsx` 未被 import ✓
  5. `TasksScreen.tsx` 静态 import 但 JSX 0 渲染 ✓
  6. `OrgAssetsScreen` 4 个 MoreSheet 项 `enabled: Boolean(...)` 全部 false ✓
  7. `BuildModeModal` 0 import ✓
  8. `PluginOrgSwitcher` 是多公司切换不是插件管理 ✓
  9. `composer/ModeSwitch.tsx` 已不存在, 残留 `doubao/ModeSwitch.tsx` 独占 ✓

---

## 13. 补充 — Tab/SegmentedControl 共用度 + 颜色硬编码扫描 (10-11 号 agent)

最后两个 agent 又带回 Tab 切换和颜色硬编码两轴的发现.

### 13.1 Tab / SegmentedControl 共用度

`ui/SegmentedControl` 已统一 10 个屏内的中性筛选段, **视觉口径稳定**.

| 屏 | 实现 | tab 数 | 状态 |
|---|---|---|---|
| `TasksScreen` | SegmentedControl (list/group/kanban) | 3 | ✅ 统一 |
| `TaskKanbanScreen` | SegmentedControl | 3 | ✅ |
| `InboxScreen` | SegmentedControl (4 tab 带计数) | 4 | ✅ |
| `NotificationsScreen` | SegmentedControl (2 项) | 2 | ✅ |
| `OrgAssetsScreen` | SegmentedControl (4 emoji) | 4 | ✅ |
| `AgentsScreen` | SegmentedControl (3 项, 异常染色) | 3 | ✅ |
| `ArtifactsScreen` | SegmentedControl (动态计数) | 动态 | ✅ |
| `OntologyDomainListScreen` | SegmentedControl (4 状态) | 4 | ✅ |
| `PrototypeSandboxScreen` | SegmentedControl (列表/预览) | 2 | ✅ |
| `NewTaskPage` | `doubao/ModeSwitch` (对话/工作) | 2 | ⚠️ 故意双档品牌, 与 SegmentedControl 视觉不同 (不等宽胶囊 vs 等宽分档), 设计合理 |

**5 处手写 chip / pill 切换, 该统一**:
1. **`CodeDiffScreen.tsx`** — working-tree / HEAD 切换, 完全等价 SegmentedControl, 但视觉不同 (透明底 vs `ELEVATION.base` / 圆角 8 vs 6 / 双层 vs 单层高亮)
2. **`AssigneeOptionsPanel.tsx`** — Primary / Custom 切换, 互斥单选, 与 SegmentedControl 视觉极相似
3. **`PluginManagerScreen.tsx`** — 4 status chip 行, 单选互斥, 可升级 SegmentedControl
4. **`ProjectsScreen.tsx`** — 5 状态 chip, 单选, 应统一
5. **`OntologyDomainListScreen.tsx`** — 4 类目 chip 与同屏 SegmentedControl (1132 行) 共存, **应统一避免屏内两种分段器**

`SpecEditorScreen` 的 4 spec_kind chip — 建议保留, 因屏上还有 4 步骤 indicator, 两层 pill 视觉若统一 SegmentedControl 屏节奏变化大, **老板定**.

### 13.2 颜色硬编码 (66% 的屏/组件存在硬编码)

**统计**: 38 屏 + 36 组件 = 74 文件, 其中 **49 个 (66%) 存在硬编码**:
- 裸写 hex (排除 #FFFFFF 与生成产物): ~75 处
- 裸写 rgba (排除 theme.ts / tokens.ts): ~180 处
- 裸写 hsl / rgb: 0 处

#### P0 — token 已存在, 纯替换 (~132 处, 零新增)

| 来源 | 当前硬编码 | 目标 token | 处数 |
|---|---|---|---|
| 白色叠加 0.02 | `rgba(255,255,255,0.02)` | `ELEVATION.base` | **25** |
| 白色叠加 0.03 | `rgba(255,255,255,0.03)` | `ELEVATION.raised` | **10** |
| 白色叠加 0.04 | `rgba(255,255,255,0.04)` | `ELEVATION.soft` | **13** |
| 白色叠加 0.05 | `rgba(255,255,255,0.05)` | `ELEVATION.hover` | **11** |
| 白色叠加 0.08 | `rgba(255,255,255,0.08)` | `ELEVATION.active` | **7** |
| 紫蓝 0.12 | `rgba(94, 106, 210, 0.12)` | `TONE.brand.bg` | **10** |
| 紫蓝 0.15 | `rgba(94, 106, 210, 0.15)` | `TONE.accent.bg` | **9** |
| 紫蓝 0.35 | `rgba(94, 106, 210, 0.35)` | `TONE.brand.border` | **2** |
| 错误红 0.1 | `rgba(239, 68, 68, 0.1)` | `TONE.err.bg` | **6** |
| 错误红 0.28 | `rgba(239, 68, 68, 0.28)` | `TONE.err.border` | **5** |
| 警告黄 0.1 | `rgba(245, 158, 11, 0.1)` | `TONE.warn.bg` | **3** |
| 警告黄 0.25 | `rgba(245, 158, 11, 0.25)` | `TONE.warn.border` | **4** |
| 成功绿 0.1 | `rgba(39, 166, 68, 0.1)` | `TONE.ok.bg` | **3** |
| 成功绿 0.25 | `rgba(39, 166, 68, 0.25)` | `TONE.ok.border` | **2** |
| 完成绿 `#10B981` | 13 处全部 | `C.done` | **13** |
| 面板色 `#0F1011` | 7 处 | `C.panel` | **7** |

**P0 总计: 132 处替换, 0 个新 token**.

#### P1 — 需扩 TONE 阶梯 (~82 处, ~13 新 token)

`TONE.brand/err/warn/ok` 当前各 2 档 (bg/border) **严重不够**, 应扩到 4-6 档 alpha 阶梯.

| 新增 token | 值 | 覆盖 | 处数 |
|---|---|---|---|
| `TONE.brand.bgHover` | `rgba(94, 106, 210, 0.18)` | 0.18 | 9 |
| `TONE.brand.bgStrong` | 0.2 | 0.2 | 2 |
| `TONE.brand.bgFirm` | 0.25 | 0.25 | 3 |
| `TONE.brand.bgHeavy` | 0.3 | 0.3 | 3 |
| `TONE.err.bgSoft` / `bgFaint` | 0.12 / 0.08 | 同 | 9 + 7 |
| `TONE.err.borderStrong/Firm/Soft` | 0.4 / 0.3 / 0.2 | 同 | 9 + 7 + 5 |
| `TONE.warn.bgFirm` / `borderStrong` | 0.12 / 0.3 | 同 | 4 + 3 |
| `TONE.ok.bgSoft` / `borderFirm` | 0.12 / 0.3 | 同 | 2 + 2 |
| `MODAL.scrim` / `MODAL.scrimHeavy` | 0.55 / 0.7 | 同 | ~11 |
| `ELEVATION.glass` (新增) | `rgba(255,255,255,0.06)` | 0.06 | 6 |

#### P2 — 老板拍板项 (9 条)

1. **`#10B981` (done) vs `#27A644` (ok)** 命名冲突, **当前混用**, 应明确语义边界.
2. **`#6EE7A0` / `#FCA5A5` (diff 高亮)** — token 缺失, 应新增 `DIFF.addInk/delInk` 或用 `alpha(C.ok/err, 0.4)`.
3. **`rgba(0, 200, 255, *)` / `rgba(0, 200, 100, *)` (3+2 处)** — 怀疑 wave188 原型 demo 残留, 不在任何 token, 应查源.
4. **`#A78BFA` / `#F472B6` / `#FACC15` / `#22D3EE` (OrgAssetsScreen L262/274/286/298)** — 4 域色, 与 `C.violet = #8B5CF6` 是同色系但不同色, 应 `ORG_DOMAIN.*` 4 token 或统一到 C.violet.
5. **`#7c3aed` (IssueRow L183)** — 与 `C.violet = #8B5CF6` 偏差 12 度, 是上游 violet-700 残留, 应统一.
6. **`#E5484D` (GitCredentialsScreen L422)** — 与 `C.err = #EF4444` 极接近但不同, Tailwind red-600 残留.
7. **`#0B0C0D` (InlinePreviewPanel 3 处)** — 与 `C.bg = #08090A` 偏差 1 位, 是"比 C.bg 深半档"的手调色.
8. **OntologyGraph 5 色调色板** (`#E0A030 / #39A275 / #7A6FD6 / #4FA1D9 / #C95757`) — 6 色节点离散色, 集中 `OntologyGraphCanvas` + `OntologyGraphWorkbenchScreen`, 应 `GRAPH.palette[6]` 数组 token.
9. **`PrototypeSandboxScreen.tsx` L283-324 内嵌 CSS 字符串** — 9 处裸写 (`#08090A / #E6E6E6 / #9BA1A6 / #D1D5DB / #191A1B / #828FFF / #34D399 / #5E6AD2 / #FFFFFF`), 是否跟随主题需老板裁决.

### 13.3 §13 总结

**新增 P0 (1 项, 紧接 §10 的 P0-10)**:
- **P0-11**: 5 处手写 chip / pill tab 切换 (CodeDiff / AssigneeOptionsPanel / PluginManager / Projects / OntologyDomainList) 该统一到 SegmentedControl — 仓库已经走 10 个屏统一口径, 多 5 个不收就是一致性裂缝.

**新增 P1 (1 项, 紧接 §10 的 P1-17)**:
- **P1-18**: 颜色 token 替换 P0 跑一遍 (`pnpm check:token-gates`), 132 处硬编码 -> ELEVATION/TONE/C.* — 零 token 新增, 纯文字替换.

**新增 P2 (1 项, 紧接 §10 的 P2-17)**:
- **P2-18**: 颜色 P1 扩 TONE 阶梯 (~13 新 token) + 9 条老板拍板项 (P2 的 P2).

---

## 14. 最终统计 (合并 §10-§13)

| 等级 | §1-§3 | §10 增量 | §13 增量 | 总计 |
|---|---|---|---|---|
| **P0** | 7 | 3 | 1 | **11** |
| **P1** | 14 | 3 | 1 | **18** |
| **P2** | 13 | 4 | 1 | **18** |
| **总计** | **34** | **10** | **3** | **47** |

---

## 15. QA 报告完整度 (最终)

- 撞机完: 11 个并行 agent (老板视角 / Palantir 架构 / 共享层命名 × 2 / 跨功能入口 / bottom tabs / 键盘+刷新+Toast / Modal-Sheet / App.tsx 拓扑 / 审批+任务+插件 / 右上菜单+badge+长按 / Tab+SegmentedControl / 颜色硬编码) + 主线程自查
- 报告完整: **P0 × 11 + P1 × 18 + P2 × 18 = 47 项**, 跨 5 视角 + 共享层 + 服务端 + 视觉交互层 + 颜色 token 层

---

## 16. 补充 — Server Routes 深度审计 (12 号 agent, post-push)

第 12 个 agent (server routes 深度) 在 commit 之后完成, 这里**追加存档**. 其结论与 §1-§13 已列内容一致, 但**新增 1 项服务层重复** (§13-§15 没列):

### 16.1 Cross-file Route Path 重复 (与 §1-§4 一致)

**全 server/src/routes/ 全扫**, 唯一真 cross-file 路径冲突:
- `GET /issues` 400-fallback 在 `companies.ts:427` + `issues.ts:7803` 写了两份, **两份内容相同, 文案相同** (P1-5 已列, 此处复确认).

**`ontology-extras.ts` 3 个端点无任何路径冲突**:
- `GET /companies/:companyId/ontology/instances` (line 35)
- `GET /companies/:companyId/ontology/types/:typeId/properties` (line 52)
- `PATCH /companies/:companyId/ontology/types/:typeId/properties` (line 60)

Grep `ontology/instances / ontology/types / ontology/properties` 全 server 仅 `routes/ontology-extras.ts` 命中 (测试文件除外). wave239 新增端点干净.

### 16.2 新增 — Service 层 ~150 行重复 (P2-19, 新增)

`services/ontology-graph.ts` `hydrate()` vs `services/ontology-extras.ts` `listInstances()` 都在做"按 type 取行并水合 label", **同一张 ENTITY_TABLE 映射写了两遍**:

| 关注点 | `services/ontology-graph.ts` | `services/ontology-extras.ts` |
|---|---|---|
| 函数 | `hydrate(companyId, refs)` (L249-487) | `listInstances(input)` (L83-237) |
| 读表 | projects / issues / boardConversations / issueWorkProducts / issueAttachments / issueComments / companies / agents / assets | projects / issues / agents / boardConversations / issueWorkProducts / issueAttachments / issueComments (基本同一组, 通过 `ENTITY_TABLE` map L46-59) |
| 过滤 | `companyId = ? AND id IN (...)` | `companyId = ?` (可选 owner 过滤) |
| Owner join | 无 | `entityRelations assigned_to` join agents (L188-203) |
| 形态 | 完整 OntologyGraphNode | 紧凑 OntologyInstanceRow |
| 排序 | BFS 决定 | `desc(id)` |

**重复点**: per-type `select * from <table> where company_id = ?` 的脚手架写了两遍 — 提到共享模块能消 ~150 行.

`hydrate` 用于图遍历, `listInstances` 用于屏 2 (实例图) 列表 + 分页 + owner 过滤, **用途不同不是 thin wrapper 对**, 但表映射逻辑重叠. 应抽 `services/_ontology-table-map.ts` 共享.

### 16.3 Adapter ↔ Server Route 重叠: 0

`grep` 全 `packages/adapters/*/src/` 找 `app.use / app.get / app.post / http.createServer / express() / new Hono / new Koa` — **零命中**.

Adapter 只:
- 调第三方 API (anthropic / chatgpt / github / gitlab)
- 调本地 CLI (`PAPERCLIP_API_URL` env)
- 在 prompt 字符串里告诉 agent CLI 调 `/api/agents/me` / `/api/issues/:id/checkout`

Hermes-gateway 调 `/v1/runs/...` (L538/570/719/740/860) 但这是 Hermes Agent 自己的协议, 不是 coolie server — grep 确认 server 端无 `/v1/runs` 路由.

**结论**: 客户端↔服务端路由层**没有重叠**, §1-§13 报告已覆盖此结论.

### 16.4 Membership 表查询对 (P2-20, 新增, borderline)

`services/access.ts` 内:
- `getMembership(companyId, principalType, principalId)` (L361-377) — 按 natural key 查
- `getMemberById(companyId, memberId)` (L423-429) — 按 row id 查
- `listMembers(companyId)` (L415-421) — `desc(createdAt)`
- `listActiveUserMemberships(companyId)` (L431-443) — `asc(createdAt)` + `principalType='user' AND status='active'`

四个函数都 `select().from(companyMemberships).where(...)`, 但 predicate 列不同. **Borderline 重复**, 可抽 `findMembership(filter)` 收编.

### 16.5 §16 总结

- **新增 P2 (2 项, 紧接 §13 的 P2-18)**:
  - **P2-19**: 抽 `services/_ontology-table-map.ts`, 共享 `hydrate()` 与 `listInstances()` 的 per-type 表映射 (~150 行).
  - **P2-20**: `services/access.ts` 的 4 个 membership 查询 (`getMembership` / `getMemberById` / `listMembers` / `listActiveUserMemberships`) 抽 `findMembership(filter)`.

---

## 17. 最终统计 (合并 §10-§16)

| 等级 | §1-§3 | §10 | §13 | §16 | 总计 |
|---|---|---|---|---|---|
| **P0** | 7 | 3 | 1 | 0 | **11** |
| **P1** | 14 | 3 | 1 | 0 | **18** |
| **P2** | 13 | 4 | 1 | 2 | **20** |
| **总计** | **34** | **10** | **3** | **2** | **49** |

---

## 18. QA 报告完整度 (最终最终)

- 撞机完: 12 个并行 agent (老板视角 / Palantir 架构 / 共享层命名 × 2 / 跨功能入口 / bottom tabs / 键盘+刷新+Toast / Modal-Sheet / App.tsx 拓扑 / 审批+任务+插件 / 右上菜单+badge+长按 / Tab+SegmentedControl / 颜色硬编码 / **server routes 深度**) + 主线程自查
- 报告完整: **P0 × 11 + P1 × 18 + P2 × 20 = 49 项**, 跨 5 视角 + 共享层 + 服务端 + 视觉交互层 + 颜色 token 层
- 主线程实测 (9 处事实核验):
  1. `App.tsx:1390` NewTaskPage + `App.tsx:1414` CreateTaskModal 同栈并列 ✓
  2. `App.tsx:1286` 4 个 tab key 共用 OrgAssetsScreen ✓
  3. `setSettingsOpen(true)` 全仓 0 调用 ✓
  4. `InboxScreen.tsx` 未被 import ✓
  5. `TasksScreen.tsx` 静态 import 但 JSX 0 渲染 ✓
  6. `OrgAssetsScreen` 4 个 MoreSheet 项 `enabled: Boolean(...)` 全部 false ✓
  7. `BuildModeModal` 0 import ✓
  8. `PluginOrgSwitcher` 是多公司切换不是插件管理 ✓
  9. `composer/ModeSwitch.tsx` 已不存在, 残留 `doubao/ModeSwitch.tsx` 独占 ✓

---

## 19. 补充 — FDE API 深度审计 (12 号 agent, post-push-2)

第 12 个 agent (FDE 视角 API 重复) 是与 16 号 server-routes 同源的另一面 — 站在 **客户端 + 端点形状** 视角. 这里补 7 项与 API 层相关的具体新发现, **前 P0/P1/P2 列表已涵盖** (如 P0-2 P0-6 等), 这里**补充技术细节**.

### 19.1 P0 真坏 (3 项, 与 §1-§18 大方向一致, 给出端点级证据)

#### P0-API-1: `listAttachments` 客户端 fallback 永远 404

- 第一次打: `GET /api/issues/:issueId/attachments`
- fallback: `GET /api/companies/:companyId/issues/:issueId/attachments`
- **Server 实际只有前者** (`server/src/routes/issues.ts:18583`), 后者 404
- `clients/api-client/src/client.ts:902-922` 内 try-catch fallback 永远失败
- 修法: 删 fallback 分支

#### P0-API-2: `wave237` 留的 1:N 真复制粘贴 (`artifacts/code` 双路由)

- `GET /api/companies/:companyId/work-products/artifacts/code` (`work-products.ts:195`)
- `GET /api/companies/:companyId/artifacts/code` (`work-products.ts:252`)
- 两段 router handler **复制粘贴**同一份查询, 同一 `listQuerySchema`, 同一 `serializeWorkProduct`
- 注释自承 (`work-products.ts:243-251`): "the actual data query is identical to ... above, so both paths return the same shape"
- 等于承认 1:N 是为了凑 17 端点 smoke 通过数
- 修法: 删 alias 留 1 个

#### P0-API-3: Plugin worker 路径 vs Control-plane 路径 (1:N, 无 deprecation)

| 老 path (plugin worker) | 新 path (control-plane, wave239) |
|---|---|
| `/api/plugins/paperclipai.plugin-ontology/api/domains?companyId=` | `/api/companies/:companyId/ontology/instances?entityType=` |
| `/api/plugins/paperclipai.plugin-ontology/api/domains/:id/snapshot` | `/api/companies/:companyId/ontology/graph?root_type=` |
| `/api/plugins/paperclipai.plugin-ontology/api/graph` | 同上 (client `getOntologySnapshot` 用这个当 fallback, `client.ts:991-1002`) |
| `/api/plugins/paperclipai.plugin-ontology/api/domains/:id/lifecycle` | (control-plane 缺迁移路径) |
| `/api/plugins/paperclipai.plugin-ontology/api/domains/:id/transition` | (同上) |

- Client `getOntologySnapshot` (`client.ts:969-1003`) 自己写 try/catch fallback
- Plugin path **仍然存活**, 没 deprecation header / sunset 日志
- wave239 新加的 `ontology_properties` 表是 control-plane 镜像, plugin 的 `ontology_node_types.properties` 是另一份真相, **双写一致性未知**

### 19.2 P1 重复 (4 项)

#### P1-API-1: Inbox 端点 1:N (服务端并存, 客户端只用 inbox)

- `GET /inbox?companyId=&limit=` (老, `server/src/routes/inbox.ts:36`, 3 段聚合)
- `GET /companies/:companyId/attention?cursor=&sort=&...` (新, wave152, `server/src/routes/attention.ts:18`, 完整 cursor)
- 客户端 `getInbox` 走老, attention endpoint 是孤儿

#### P1-API-2: 仪表盘 / 指标端点 4 套 (客户端只用 1 个)

| 端点 | Service | Client |
|---|---|---|
| `GET /companies/:companyId/dashboard` | `dashboardService.summary` | OK |
| `GET /companies/:companyId/metrics/cockpit` | `dashboardService.summary().metrics` | OK |
| `GET /companies/:companyId/metrics` (wave215-b) | `metricsService.efficiency` | **孤儿** |
| `GET /companies/:companyId/metrics/overview` | `metricsService.overview` | **孤儿** |

3 套 metrics path + 1 套 dashboard path, 数据重叠 (`failure_rate / delivery_cycle_days_avg / throughput_per_day` 字段同构).

#### P1-API-3: Approvals 路径切分不一致

- 列表: `GET /companies/:companyId/approvals` (有 companyId path) — OK
- 单详情: `GET /approvals/:id` (无 companyId) — actor context
- 4 个 approval 子端点 (`/issues` `/comments` `/resubmit` 等) 也无 companyId — 客户端 0 调用
- 应统一到 `POST /approvals/:id/actions { action: 'approve'|'reject'|'resubmit' }` 单端点

#### P1-API-4: Spec 端点 4 个孤儿

- `GET /issues/:id/spec` (`issue-specs.ts:69`) — `getIssueSpec()` OK
- `POST /issues/:id/spec` (`issue-specs.ts:88`) — `saveIssueSpec()` OK
- `GET /companies/:companyId/specs/tree` (`issue-specs.ts:142`) — **孤儿**
- `POST /companies/:companyId/specs/from-template` (`issue-specs.ts:180`) — **孤儿**
- `GET /companies/:companyId/issue-specs` (`issue-specs.ts:238`) — **孤儿**

多/单数两套, 复数 3 个孤儿.

### 19.3 P1 端点孤儿 (wave215 17 端点)

`docs-coolie/evidence/wave219/PRE-DEPLOY-STATE.md` 列的 17 端点, 客户端用了 3 个 (`work-products/:id/versions` 等), **其余 14 个 zero client 调用**:

| 端点 | 备注 |
|---|---|
| `POST /companies/:companyId/dispatch` | wave237 加 |
| `GET /companies/:companyId/dispatch` | wave237 加 |
| `GET /companies/:companyId/quotas` | |
| `POST /companies/:companyId/quotas/refresh` | |
| `GET /companies/:companyId/usage` | |
| `GET /companies/:companyId/sandboxes` (+ `:id`) | |
| `GET /companies/:companyId/cycle-time` | |
| `GET /companies/:companyId/milestones` (+ `:id`) | |
| `GET /companies/:companyId/defect-kb` | |
| `GET /companies/:companyId/audit-log` | |
| `GET /companies/:companyId/specs/tree` | |
| `GET /companies/:companyId/issue-specs` | |
| `GET /companies/:companyId/metrics` (wave215-b) | |
| `GET /companies/:companyId/metrics/overview` | |
| `GET /companies/:companyId/workspace-overview` | |

UI 端 (web) 也许在用, 但 App (`clients/expo`) 不用. UI 改动冻结 → **等同孤儿**.

### 19.4 P2 命名/风格 (6 项)

#### P2-API-1: `.get` vs `.list` 不一致

- `getInbox` 返三段聚合 → 应 `listInbox` (`client.ts:509`)
- `getBoardChatHistory` 返多 message → 应 `listBoardChatHistory` (`client.ts:1507`)

#### P2-API-2: Query 入参 snake vs camel

- `ontology-graph`: `root_type` / `root_id` (snake_case, server `ontology-graph.ts:38`)
- `ontology-extras`: `entityType` / `ownerId` (camelCase, server `ontology-extras.ts:35`)
- 同一子树内不统一, 应统一到 camelCase (仓库主流)

#### P2-API-3: Cursor / 分页命名 4 种

- `cursor` (主流, `/artifacts` `/chat-channels` `/tool-gateway`)
- `before` ISO date (`/board/chat/conversations?before=`)
- `afterSeq` (`/agents/...`)
- **无 cursor** (`/execution-workspaces`, `/companies/:id/dashboard`)

#### P2-API-4: Routes 绕过 service 直接 `await db.` (17 个文件)

```
server/src/routes/{access,agents,ai-connections,announcements,auth,cases,company-skills,
decisions,environments,health,instance-settings,issue-tree-control,issues,pipelines,
projects,tool-access,tool-gateway}.ts
```

**17/101 个 routes 文件 (17%) 直查 db**, 跳过 service 层 — 任何 service cache / hook / audit 都失效. 老 route 没改, 新 route (ontology-extras / ontology-graph / work-products) 都通过 service.

#### P2-API-5: `server/src/routes/index.ts` 死 barrel

`server/src/app.ts:69` 直接 import `ontologyGraphRoutes` 等, **不通过 index barrel**. 本次 wave239 commit 只追加了一行 `export { ontologyExtrasRoutes }`, 但**没人** import 这个 barrel. 历史产物, 应删.

#### P2-API-6: `OntologyPropertyEntry` 三套定义 (与 P2-10 一致)

`db/src/schema/ontology_properties.ts:43` (interface) + `shared/types/entity-relation.ts:189` (interface) + `shared/validators/entity-relation.ts:24` (zod schema) — db 端 inline, 注释说从 `@paperclipai/shared` import, **grep 找不到 import**, 一旦 shared 加字段 db 不会同步.

### 19.5 §19 总结 (1 项新 P2 增量)

**新增 P2 (1 项, 紧接 §16 的 P2-20)**:
- **P2-21**: `OntologyPropertyEntry` 在 db schema / shared types / shared validators 三套定义, 应**统一收口到 shared** + db 端 import (注释自承但未落实).

---

## 20. 最终统计 (合并 §10-§19)

| 等级 | §1-§3 | §10 | §13 | §16 | §19 | 总计 |
|---|---|---|---|---|---|---|
| **P0** | 7 | 3 | 1 | 0 | 0 (已在 §1-§10 列) | **11** |
| **P1** | 14 | 3 | 1 | 0 | 0 (已在 §1-§10 列) | **18** |
| **P2** | 13 | 4 | 1 | 2 | 1 | **21** |
| **总计** | **34** | **10** | **3** | **2** | **1** | **50** |

注: §19 的 FDE API 发现已在 §1-§4 大方向覆盖 (P0 真坏 / P1 重复 / P2 命名), 给出端点级证据但不增量 P 级. 仅 P2-21 是新 (db/types/validators 三套定义重复).

---

## 21. QA 报告完整度 (最终最终最终)

- 撞机完: 12 个并行 agent (老板视角 / Palantir 架构 / 共享层命名 × 2 / 跨功能入口 / bottom tabs / 键盘+刷新+Toast / Modal-Sheet / App.tsx 拓扑 / 审批+任务+插件 / 右上菜单+badge+长按 / Tab+SegmentedControl / 颜色硬编码 / server routes 深度 / **FDE API 深度**) + 主线程自查
- 报告完整: **P0 × 11 + P1 × 18 + P2 × 21 = 50 项**, 跨 5 视角 + 共享层 + 服务端 + 视觉交互层 + 颜色 token 层 + API 端点层
- 主线程实测 (9 处事实核验):
  1. `App.tsx:1390` NewTaskPage + `App.tsx:1414` CreateTaskModal 同栈并列 ✓
  2. `App.tsx:1286` 4 个 tab key 共用 OrgAssetsScreen ✓
  3. `setSettingsOpen(true)` 全仓 0 调用 ✓
  4. `InboxScreen.tsx` 未被 import ✓
  5. `TasksScreen.tsx` 静态 import 但 JSX 0 渲染 ✓
  6. `OrgAssetsScreen` 4 个 MoreSheet 项 `enabled: Boolean(...)` 全部 false ✓
  7. `BuildModeModal` 0 import ✓
  8. `PluginOrgSwitcher` 是多公司切换不是插件管理 ✓
  9. `composer/ModeSwitch.tsx` 已不存在, 残留 `doubao/ModeSwitch.tsx` 独占 ✓

---

## 22. 一句话定位 (给老板决策用)

> **Wave239 在已经有 1:N 的 ontology 路径上又叠了 3 个 control-plane 端点, 没 deprecate plugin 路径; 同时 14 个 wave215 server endpoint 在 client 0 调用; 4 类同语义多套 path (metrics/dashboard, inbox/attention, work-products 6 套, artifacts/code 复制粘贴); 客户端有一个永远 fallback 404 的死代码 (attachments); type/validator/db 三层之间 OntologyPropertyEntry 定义三套。**

老板口吻建议拍板项 (cross-wave 待修):
1. **删 `/api/companies/:id/issues/:id/attachments`** (P0-API-1 死代码, client fallback 永远不会 work)
2. **合并 `artifacts/code` 1:N** (P0-API-2 真复制粘贴, 注释自承)
3. **plugin ontology 路径写 deprecation header, 至少定 sunset** (P0-API-3, 否则 1:N 永不清)
4. **inbox → attention / metrics → dashboard 收敛** (P1-API-1/2, 客户端只用一个就够)
5. **wave215 14 孤儿 endpoint 拍板: 删 / 留 / 迁 web** (P1-API-3 + §19.3)
6. **统一 query snake/camel (ontology-graph 用 snake, ontology-extras 用 camel) + 游标命名** (P2-API-2/3)
7. **删 `server/src/routes/index.ts` 死 barrel** (P2-API-5)
