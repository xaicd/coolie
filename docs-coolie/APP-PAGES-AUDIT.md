# App 页面审计 (PM 2026-09-22)

> Boss 09-22 23:30 OOB: 「只是页面要开始审计精简收敛, 选择」
> 本报告**只审计, 不改代码**。结论 + 3 档方案在 §5, 老板回一个字即可 (§6)。

审计范围 (真查源码, 非文件头猜测):

- `clients/expo/src/screens/**` + `clients/expo/App.tsx` (驾驶舱 App, 包名 `cloud.coolie.app`)
- `clients/h5/src/**` (Coolie H5 / PC web)
- `clients/expo-paperclip-web/` (第三个客户端, PC web 套壳, §1.4)
- 入口真身: `App.tsx` 的 tab/浮层状态机、`components/TabBar.tsx`、`components/AppBar.tsx`

**先纠正 brief 里两条过期前提** (PM 09-22 的 known-state 有误, 见 §4):

1. `ComposerForm` / `ComposeOverlay` / `TaskComposer` **在代码里已不存在** (grep 0 命中)。
   新建任务**只有一份表单实现** = `ComposeScreen.tsx`, 三个入口共用它。wave26 已合并完毕,
   不是"3-4 个重复 composer 待合并"。真正的重复只剩**外壳** (§2.4)。
2. PRD ⑧⑨⑩ (交付周期/车间效率/失败率) **不是"没实现"** —— 服务端 dashboard 已算出
   `deliveryCycle` / `efficiency` / `failureRate` (`server/src/__tests__/dashboard-service.test.ts:242`),
   App 端 `DashboardScreen` 已渲染成 6 张指标卡 + 3 个细分区。PRD ②(看额度) 亦然 (h5 有独立「看额度」页)。

---

## 1. 全量页面清单

### 1.1 App 端主屏 (clients/expo/src/screens/)

底部栏 5 个入口 = 汇览 / 任务 / [+] / 员工 / 收件箱 (`TabBar.tsx:21-29`)。
工坊 / 本体 / 产物 **不占底栏**, 从任务页顶部图标行 (`TasksScreen.tsx:104-106`) 进入。

| 页面 | 功能 (1-2 句) | 行数 | PRD # | 入口 | 重要度 |
| --- | --- | ---: | --- | --- | --- |
| `DashboardScreen` | 驾驶舱「汇览」: 六大指标卡 (预算/完成率/活跃度/交付耗时/交付速度/异常率) + 待办审批卡 + 实时运行 + 时间线 | 1374 | 2,7,8,9,10 | 底栏「汇览」 | P0 |
| `TasksScreen` | 任务 tab: 标题 + 4 图标入口行 + Build/Pipeline/Plan 编排行 + 搜索 + `IssuesList` + 浮动审批卡 + 右下新建 FAB | 336 | 3,4,6 | 底栏「任务」 | P0 |
| `AgentsScreen` | 员工名册: 状态/空闲/能力/成本, 组织视角 | 684 | 7 | 底栏「员工」 | P0 |
| `InboxScreen` | 收件箱: 待审批 / 受阻 / @我 三段, 分段过滤 | 341 | - | 底栏「收件箱」 | P0 |
| `BoardChatScreen` | 工坊: SSE 流式对话 + 内嵌预览 + 审批气泡 + 构建卡 | 2198 | 1,12 | 任务页「工坊」图标 | P0 |
| `OntologyDomainListScreen` | 本体域列表 + 域健康 + 紧急熔断 (Kill Switch) | 1334 | 11 | 任务页「本体」图标 | P0 |
| `ArtifactsScreen` | 产物流 (图/文档/文本) + 内联预览 Modal + 跳 diff/沙箱 | 864 | 3 | 任务页「产物」图标 | P1 |
| `CodeDiffScreen` | 工作区 Git Diff 单列查看器 | 943 | 4 | 任务详情 / 产物 | P1 |
| `PrototypeSandboxScreen` | 原型沙箱 WebView (可换地址/重载) | 917 | 5 | 任务详情 / 产物 | P1 |
| `TaskDetailScreen` | 任务详情 + 评论互动 + 产物/审批入口 | 440 | 3,4,6 | 任务行 / 深链 | P0 |
| `ComposeScreen` | **新建任务唯一表单** (全字段, 1:1 抄 `NewIssueDialog`) | 625 | - | 底栏「+」/ 任务页 FAB | P0 |
| `SearchScreen` | 全局搜索: 任务 / 员工 / 文档 | 278 | - | 顶栏搜索图标 | P1 |
| `NotificationsScreen` | 通知中心: 审批/故障/提及/动态, 已读角标 | 231 | - | 顶栏铃铛 | P1 |
| `AgentDetailScreen` | 员工详情 (配置/技能/成本/派单) | 314 | - | **仅全局搜索可达** (见 §2.3) | P2 |
| `PipelinesScreen` | Pipeline 只读列表, 新建/编辑跳 Web | 200 | - | 任务页「Pipeline」 | P2 |
| `PlansScreen` | Plan 列表 (实为 `Plan: xxx` 任务) | 150 | - | 任务页「Plan」 | P2 |
| `WhatsNewScreen` | 装机自检 + 版本功能点 (首启弹) | 407 | - | 首启模态 | P1 |
| `RegisterScreen` | 自助注册 (建号 + 首个公司) | 194 | - | 登录页 | P1 |

### 1.2 App 端浮层 / 内联页 (无独立文件, 由 `App.tsx` 状态驱动)

| 路由 | 载体 | 说明 | 重要度 |
| --- | --- | --- | --- |
| `SignInScreen` | `App.tsx` 内联 | 邮箱密码 / API Key 两种登录 | P0 |
| `CompanyGate` | `App.tsx` 内联 | 公司解析 (0/1/多) | P0 |
| `ApprovalFocusDetail` | `App.tsx` 内联 | 审批单条裁决页, 复用 `QuickApprovalCard` | P1 |
| `SettingsSheet` | `App.tsx` 内联 | 设置抽屉 (OTA/清缓存/退出) | P1 |
| `AppUpdateCard` | `App.tsx` 内联 | APK 升级提示条 | P2 |
| 新建任务浮层 | `ComposeScreen` (中央「+」, `composeOverlay`) | 内容区浮层, 让出底栏 | P0 |
| 新建任务弹窗 | `CreateTaskModal` → `ComposeScreen` (任务页右下 FAB) | **同一表单的第二个外壳** | P0 |

### 1.3 App 端工作空间子 Tab (clients/expo/src/screens/workspace/)

| 页面 | 功能 | 行数 | 状态 |
| --- | --- | ---: | --- |
| `WorkspaceScreen` | 4 Tab 容器 (Modal slide 拉起) | 260 | 骨架 |
| `ConversationTab` | 内嵌 `BoardChatScreen` (去掉整屏外壳) | 63 | 真 |
| `PreviewTab` | 复用 `InlinePreviewPanel` (webview/图片) | 139 | 真 |
| `FilesTab` | 文件树 | 220 | **mock** (spec §10 明确先 mock) |
| `TerminalTab` | 模拟 shell | 285 | **stub** (spec §5 明确只做 stub UI) |

### 1.4 H5 / PC web (clients/h5/src/screens/)

顶部 nav 7 项 (`App.tsx:36-44`): 工坊 / 任务 / 管线 / 计划 / 看额度 / 本体驱动 / 更新。

| 页面 | 功能 | 行数 | 对应 App 页 |
| --- | --- | ---: | --- |
| `BoardChatScreen` | 工坊 (简化版: 只有内嵌预览, 无流式/审批) | 422 | BoardChatScreen (简版) |
| `TasksScreen` | 任务列表 + `IssuesList` + 内嵌 `ComposeScreen` | 291 | TasksScreen |
| `ComposeScreen` | 新建任务 (与 expo 同构的 HTML 版) | 515 | ComposeScreen |
| `DashboardScreen` | **看额度** (公司本月支出/预算) | 318 | DashboardScreen (仅额度部分) |
| `OntologyScreen` | 本体域列表 | 295 | OntologyDomainListScreen |
| `PipelinesScreen` | Pipeline 只读列表 | 180 | PipelinesScreen |
| `PlansScreen` | Plan 列表 | 161 | PlansScreen |
| `WhatsNewScreen` | 版本更新说明 | 166 | WhatsNewScreen |
| `workspace/*` (5 文件) | 工作空间 4 Tab (HTML 版) | 519 | workspace/* |

h5 **没有**: AgentDetail / Agents / Inbox / Notifications / Artifacts / CodeDiff / PrototypeSandbox / Search / Register。

### 1.5 第三个客户端 (clients/expo-paperclip-web/)

`Coolie Web` (`cloud.coolie.app.web`) —— 一屏 WebView 套壳 PC web, 独立 OTA 流。
与驾驶舱 App 并存, **零共享代码** (不 import `@coolie/api-client`)。审计结论: 保留, 不在精简范围。

---

## 2. 重叠 / 冗余识别

> 判定标准: **同一份信息 / 同一个动作, 在一屏以上出现**, 且有独立入口。
> 「列表 → 详情」是正常模式, 不算重叠; 「同一动作 4 个按钮」要算。

### 2.1 【重】审批 (Approvals) 出现在 5 个地方

| # | 位置 | 证据 |
| --- | --- | --- |
| 1 | 汇览 `DashboardScreen` 顶部「待办审批」卡 (前 3 条 + 前往处理) | `DashboardScreen.tsx:295-338` |
| 2 | 任务页右下**浮动审批卡** `QuickApprovalCard floating` | `TasksScreen.tsx:172` |
| 3 | 收件箱「待审批」分段 | `InboxScreen.tsx` |
| 4 | 通知中心 `approval` 类 | `NotificationsScreen.tsx:28-36` |
| 5 | 工坊对话内审批气泡 + `ApprovalFocusDetail` 裁决页 | `App.tsx:1146` |

**建议**: 收敛到「收件箱」一个入口。汇览保留一张**计数卡** (点了跳收件箱), 任务页浮动审批卡删除。

### 2.2 【重】收件箱 ↔ 通知中心 (同一批数据, 两屏两入口)

| 维度 | `InboxScreen` (底栏 tab) | `NotificationsScreen` (顶栏铃铛) |
| --- | --- | --- |
| 数据源 | `GET /api/inbox` | `listNotifications` (store) |
| 分类 | 待审批 / 受阻 / @我 | 审批 / 故障 / 提及 / **动态** |
| 未读 | ✗ | ✓ (角标) |
| 位置 | 主 tab | 覆盖层 |

**结论**: 三类 (审批/受阻/@我) 完全重合, 通知只多一个 `activity` 类 + 已读态。
两个独立页面 = 两套加载/错误/空态代码 (`InboxScreen` 341 行 + `NotificationsScreen` 231 行)。
**建议**: 合并为一屏 (推荐保留「收件箱」为主, 通知作为其分段); 顶栏铃铛改为「切到收件箱 + 未读角标」。

### 2.3 【重】员工: `AgentsScreen` ↔ `AgentDetailScreen` (且详情是死入口)

- 员工 tab 的 `AgentsScreen` **没有** `onOpenAgent` (`AgentsScreen.tsx:347-354` 只有 `onOpenSettings` / `onOpenIssue`)。
- `AgentDetailScreen` 的**唯一入口**是全局搜索的员工结果 (`App.tsx:888-890`)。
- 即: 老板从「员工」列表**点不进任何一个人的详情**, 详情页只能靠搜索撞到 —— 314 行页面对主流程等同死代码。

**建议**: 二选一 —— 员工列表行可展开为详情 (砍掉独立页), 或给 `AgentsScreen` 接上 `onOpenAgent` (保留页)。审计倾向**合并** (列表内展开/抽屉), 顺带治入口不一致。

### 2.4 【中】新建任务: 一份表单, 两个外壳 (非重复表单)

`ComposeScreen` 是唯一表单, 但有两个外壳同时存在于**同一屏**:

- 底栏中央「+」→ `composeOverlay` (`App.tsx` 内联浮层)
- 任务页右下 FAB「新建任务」→ `CreateTaskModal` (`TasksScreen.tsx:184-190`)

任务 tab 上**两个新建按钮并存** (底栏「+」恒在 + 页内 FAB)。
**建议**: 删 `CreateTaskModal` 外壳, 两处都走中央「+」的浮层 (保留一个)。

### 2.5 【中】产物预览与 diff/沙箱三处都能看

- `ArtifactsScreen` 自带预览 Modal, 内嵌 `CodeViewerWebView` (文本/代码/diff 渲染) —— `ArtifactsScreen.tsx:263, 497-567`
- 同一批产物又能跳 `CodeDiffScreen` (真 diff 查看器) / `PrototypeSandboxScreen` (真沙箱)
- `board-inline/InlinePreviewPanel` 是第四处 webview 预览 (工坊内嵌)

**结论**: 产物屏内部那份「轻量 diff 渲染」与 `CodeDiffScreen` 职责重叠。
**建议**: 产物屏预览只负责**图片/文档**; 代码/diff 一律跳 `CodeDiffScreen`, 删内联 CodeViewer 分支。

### 2.6 【中】工作空间 4 Tab 与既有屏重复 (且 2 个是 mock/stub)

| 子 Tab | 与谁重复 | 状态 |
| --- | --- | --- |
| `ConversationTab` | 工坊 tab `BoardChatScreen` (就是它的 embedded 版) | 真 |
| `PreviewTab` | `PrototypeSandboxScreen` + `InlinePreviewPanel` | 真 |
| `FilesTab` | 无 (唯一) | **mock** |
| `TerminalTab` | 无 (唯一) | **stub** |

**结论**: 4 Tab 里有 2 个是同一能力的不同外壳, 另 2 个是假数据。对整个工作空间 Modal 的价值存疑。
**建议**: 工作空间只留「对话 + 预览」(对话本就=工坊, 可考虑整体并入工坊); 文件/终端等后端真接口到位再回归。

### 2.7 【中】`PlansScreen` 是转发的薄壳

`PlansScreen` 没有自己的数据模型: plan = `Plan: xxx` 任务, 点进去复用 `TaskDetailScreen`
(`PlansScreen.tsx` 头注释明说)。等于给一个 `Tasks` 的**过滤视图**单开了一屏 + 一个入口。
**建议**: 改成 `TasksScreen` 的一个视图过滤 (与 `IssuesList` 的 6 视图并列), 删独立屏。

### 2.8 【低】h5 ↔ expo 镜像双份实现 (跨端重复)

同名同构但两份代码 (各自维护, 已经出现字段漂移):

- `ComposeScreen` 625 (expo) vs 515 (h5)
- `IssuesList` 586 vs 541
- `composer/*` 17 个文件双份
- `board-inline/*` / `workspace/*` / `BoardChatScreen` / `TasksScreen` / `PipelinesScreen` / `PlansScreen` / `WhatsNewScreen` 双份

**建议** (不属本次"砍页面", 但记一笔): 收敛到共享组件包, 长期减少一半维护面。

---

## 3. 入口密度 (老板「页面看起来有点乱」的直接来源)

`TasksScreen` 一屏之内塞了 **8 类控件**:

1. 标题 + 副标题
2. 4 个图标入口 (工坊/本体/产物/设置) —— `TasksScreen.tsx:104-107`
3. 3 个编排按钮 (Build 5 步链/Pipeline/Plan) —— `:112-140`
4. 搜索框 —— `:143-160`
5. 任务列表 (`IssuesList`)
6. 浮动审批卡 —— `:172`
7. 右下「新建任务」FAB —— `:175-182`
8. 底栏中央「+」FAB (恒在)

**建议**: 图标入口行 + 编排行收敛为 1 个「更多」菜单; 删页内新建 FAB (§2.4); 删浮动审批卡 (§2.1)。

---

## 4. PRD 12 项 vs 当前实现 (校准版)

brief 的映射表有两处过期, 以下是**按源码校准**的结果:

| PRD # | 功能 | 当前实现 (证据) | brief 说法 | 校准 |
| --- | --- | --- | --- | --- |
| ① | 语音派活 | `composer/VoiceInputButton` + `useRecorder` (工坊长按 mic) | ✅ | ✅ |
| ② | 看额度 | 服务端 `costs/*`; expo `DashboardScreen` 预算卡; h5 独立「看额度」页 | ❌ 无页 | **✅ 已实现** |
| ③ | 看产物 | `ArtifactsScreen` | ✅ | ✅ |
| ④ | 看代码 | `CodeDiffScreen` + `UnifiedDiffViewer` | ✅ | ✅ |
| ⑤ | 看原型 | `PrototypeSandboxScreen` | ✅ | ✅ |
| ⑥ | 看进度 | `BuildProgressCard` + `DashboardScreen` 时间线 | ✅ | ✅ |
| ⑦ | 看空闲度 | `AgentsScreen` | ✅ | ✅ |
| ⑧ | 交付周期 | 服务端 `dashboard.deliveryCycle`; App「平均交付耗时」卡 + 细分区 | ❌ 未实现 | **✅ 已实现** |
| ⑨ | 车间效率 | 服务端 `dashboard.efficiency`; App「车间交付速度」卡 | ❌ 未实现 | **✅ 已实现** |
| ⑩ | 失败率 | 服务端 `dashboard.failureRate`; App「综合异常率」卡 + 细分区 | ❌ 未实现 | **✅ 已实现** |
| ⑪ | 本体驱动 | `OntologyDomainListScreen` + `EmergencyKillSwitch` | ✅ | ✅ |
| ⑫ | 驾驶舱问答 | `BoardChatScreen` (SSE) | ✅ | ✅ |

**结论: PRD 12 项已 12/12 落地** (⑧⑨⑩ 在 dashboard 聚合里, 不是独立页)。
所以"砍 PRD 8/9/10 出范围"这件事**没有依据** —— 它们已经在跑了。

---

## 5. 精简方案 (3 档, 请老板选一档)

三档都**不动 PRD 能力**, 只动"同一件事的入口数"。总页数按 §1.1+§1.3 的 23 个 App 端屏幕文件 + 6 个内联页计。

### 5.1 激进 (砍 6 屏 + 合并 5 处) —— 任务页/员工页最干净

**砍**:
- ❌ `NotificationsScreen` → 并入 `InboxScreen` (通知=收件箱的「未读」分段)
- ❌ `AgentDetailScreen` → 并入 `AgentsScreen` (行内展开)
- ❌ `PlansScreen` → 并入 `TasksScreen` 视图过滤
- ❌ `PipelinesScreen` (App 内无编辑器, 只读列表) → 直接外链 Web 或并入 Tasks 视图
- ❌ `workspace/FilesTab` + `workspace/TerminalTab` (mock/stub)
- ❌ `workspace/ConversationTab` (与工坊 tab 重复) → 工作空间只留 `PreviewTab`

**合并**:
- 🔀 `CreateTaskModal` 外壳删除 → 只留中央「+」浮层
- 🔀 审批 5 处 → 只留收件箱 1 处 (汇览留计数卡)
- 🔀 `ArtifactsScreen` 内联 diff 预览 → 全走 `CodeDiffScreen`
- 🔀 任务页 图标行+编排行 → 1 个「更多」菜单
- 🔀 任务页浮动审批卡 + 页内新建 FAB → 删

**结果: App 端屏幕 18 → 12, 内联 6 → 5; 审批入口 5 → 1。**

### 5.2 中庸 (砍 3 屏 + 合并 3 处) —— **PM 推荐**

**砍**:
- ❌ `NotificationsScreen` → 并入 `InboxScreen` (顶栏铃铛跳收件箱, 带未读角标)
- ❌ `AgentDetailScreen` → 并入 `AgentsScreen` (行内展开; 同时修好"点不进详情"的入口 bug)
- ❌ `workspace/FilesTab` + `workspace/TerminalTab` (纯 mock/stub) → 工作空间留「对话+预览」

**合并**:
- 🔀 `CreateTaskModal` 外壳删除 → 只留中央「+」浮层
- 🔀 审批入口: 删任务页浮动审批卡 + 汇览保留计数卡, 裁决一律去收件箱
- 🔀 任务页图标行 + 编排行 → 1 个「更多」菜单

**保留 (后续再议)**: `PlansScreen` / `PipelinesScreen` (等真端点/pipeline 编辑器), `ArtifactsScreen` 内联预览。
**结果: App 端屏幕 18 → 16, 内联 6 → 5; 审批入口 5 → 2。**

### 5.3 保守 (砍 1 屏) —— 只治最明确的那一处

- ❌ `NotificationsScreen` → 并入 `InboxScreen` (唯一 100% 同数据的两屏)
- 其余全部保留。

**结果: App 端屏幕 18 → 17; 审批入口 5 → 4。**

---

## 6. 给老板选

回一个字即可:

| 回复 | 含义 |
| --- | --- |
| **激进** | 砍 6 屏 + 合并 5 处 (最干净, 动得多) |
| **中庸** | 砍 3 屏 + 合并 3 处 (**PM 推荐**, 治重叠但不伤能力) |
| **保守** | 只合并 通知中心 → 收件箱 |
| **自定义** | 说明哪几页要留 / 砍 / 合并 (可直接点名上面 §2 的编号) |

老板拍板后再派 wave32 实施 (本报告不含任何代码改动)。

---

*审计: cmd (wave31) · 依据: 09-22 当天 main 源码 · 只读, 未改任何代码*
