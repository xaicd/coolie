# Brief: wave 18 — Coolie工坊 App [任务] tab 抄 Coolie Web Tasks 页 + 语音按钮

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-21 OOB

Boss: 「任务 tab」+「新增」+ 之前 OOB 「把 web 页面那个搞过来, 然后加语音按钮」

Boss 看 Coolie Web 0.6.2 Tasks 页（截图：appBar 「Coolie Web」 + 「任务」标题 + 搜索 + 6 视图 + TODAY/YESTERDAY/EARLIER 分组 + 底部 tab Home/Tasks/New Task/Agents/Inbox）= 要 App 端 [任务] tab 套这个 UI + 加 [+ 新建] + 语音按钮。

## 1. 已知现状 (PM 09-21 真查)

```
✅ Coolie Web 0.6.2 Tasks 页 = paperclip 上游 /issues (Issues.tsx 237 行 + IssuesList component)
✅ IssuesList.tsx 含 6 视图切换 (list/board/columns/funnel/sort/layers)
✅ 时间分组: TODAY / YESTERDAY / EARLIER (groupBy createdAt day)
✅ Bottom tab: Home / Tasks / New Task / Agents / Inbox
✅ Server /api/issues 端点 (chat-channels.ts:issueId/chat-binding)
✅ wave14 voice dispatch (useRecorder + dispatchVoice + ChatHome 派活)
✅ Coolie工坊 App 当前 [任务] tab = 自己写的 TaskDetailScreen (简陋, 没 web 这套 UI)
```

## 2. 目标

**Coolie工坊 0.5.8 App** 替换现有 [任务] tab UI:

```
✅ 顶部: appBar 显示「Coolie工坊」+ 「驾驶舱Web」按钮 (已有)
✅ 标题: 「任务」(用 IssuesList 同款)
✅ 搜索框 + [+ 新建任务] 按钮
✅ 6 视图切换 (list/board/columns/funnel/sort/layers)
✅ 分组: TODAY / YESTERDAY / EARLIER
✅ 任务卡: 圆圈/勾选/状态色 + 标题 + 时间 (1h ago / 4h ago / 1d ago)
✅ 底部 5 tab: 汇览 / 任务(选中) / [+]中央 / 员工 / 收件箱 (留 App 原底部)
✅ [+ 新建] 按钮 → 创建任务表单
✅ 语音按钮: 工坊内的 任务 tab 顶部加 🎤 mic → dispatchVoice() → ChatHome 派活
```

## 3. 任务 (5 步)

### 3.1 抄 IssuesList component 到 App 端

读 `ui/src/components/IssuesList.tsx` (paperclip 上游) — 把组件移植到 `clients/expo/src/components/IssuesList.tsx`:

- 接收 props: `companyId`, `onIssuePress`, `defaultView='list'`
- 内部: 调 `GET /api/issues?companyId=X` 拿数据
- 渲染 6 视图切换 + 时间分组
- 任务卡组件 `IssueRow` (含圆圈/勾选/状态/标题/时间)
- 中文 i18n (用现有 zh-CN dict)

新建 `clients/h5/src/components/IssuesList.tsx` (h5 端镜像).

### 3.2 创建 TasksScreen 包装

新建 `clients/expo/src/screens/TasksScreen.tsx` (替换 App 当前 TaskDetailScreen):

```
- appBar: 「Coolie工坊」+ 「驾驶舱Web」按钮 + [🎤 语音派发] 按钮 (toolbar 右上)
- 标题区: 「任务」+ 三级菜单
- <IssuesList companyId={...} onIssuePress={...} />
- Floating [+ 新建任务] 按钮 (右下角)
```

新建 `clients/h5/src/screens/TasksScreen.tsx` (镜像).

### 3.3 创建任务表单 (CreateTaskModal) — 跟 Coolie Web NewTaskDialog 同款

新建 `clients/expo/src/components/CreateTaskModal.tsx`:

```
弹窗标题: 「XROA › New task」 + 全屏 ↗ + ✕ 关闭
- "Task title" 大输入框 (placeholder)
- For [Assignee] in [Project] + ⋯ 更多
- "Add description..." 大文本区
- 状态 row: ● Todo (橙红圈) / ⋯ 切换
- Upload 附件 + Auto mode (智能) + ⋯ 更多
- 底部: 灰色 "Discard Draft" + 黑底 "Create Task"
```

[创建] → POST `/api/issues` → 关闭 modal + toast + 列表新增

**i18n (boss 09-21 22:35 截图):** NewTaskDialog 里的字段**全部需要中文** — i18n 补丁字典加 9 条:

```ts
// clients/expo-paperclip-web/App.tsx 里 I18N_PATCH 字典加:
'New task': '新建任务',
'Task title': '任务标题',
'For': '指派给',
'Assignee': '被指派人',
'in': '在',
'Project': '项目中',
'Add description...': '添加任务描述...',
'Todo': '待办',
'Upload': '上传',
'Auto mode': '智能模式',
'Discard Draft': '放弃草稿',
'Create Task': '创建任务',
```

(Dialog 是 portal 渲染, MutationObserver 200ms debounce 能扫到)

### 3.4 语音按钮接 dispatch

复用 wave14 `dispatchVoice()` — 在 TasksScreen appBar 右上 mic icon:
- 点 mic → 录音 → POST `/api/multimodal/transcriptions` mode=dispatch
- transcribed text 作为 issue 标题 → 创建 → 跳 ChatHome

### 3.5 替换路由

`clients/expo/App.tsx` 把现有 [任务] tab 路由换成新的 TasksScreen:
- 旧的 TaskDetailScreen 保留 (深链跳转用)
- 底部 tab 第 2 个 TasksScreen (选中态紫蓝)

### 3.6 TasksScreen 顶部加编排按钮组 (boss 09-21 22:38 OOB 「app工坊要有这些功能的合适入口」+ 「a,b」)

老板选了 A + B 两个方案. A = TasksScreen 顶部按钮组.

在 TasksScreen 顶部 (appBar 下方, 搜索框上方) 加一排 3 按钮:

```
┌────────────────────────────────────────────┐
│ [🔨 Build 5 步链] [🛤️ Pipeline] [📋 Plan]   │
└────────────────────────────────────────────┘
```

每个按钮行为:

#### 3.6.1 [🔨 Build 5 步链]
- 点击 → 弹 BuildModeModal (复用 BoardChatScreen 的 build trigger 形态)
- 用户填"build xxx" → POST /api/board/build/start (server build-orchestrator.ts 已有)
- 弹 BuildProgressCard (5 步链渲染)
- 进 BoardChatScreen 看 BuildProgressCard 详情

#### 3.6.2 [🛤️ Pipeline]
- 点击 → 进 PipelinesScreen (新建) 列表
- 列公司所有 pipelines (server GET /api/pipelines?companyId=X — 复用 paperclip 上游 /api/pipelines 端点)
- 每条 pipeline: 名称 + 阶段数 + 当前状态 (Active/Draft/Archived)
- 点 [+] → PipelineEditor (新建)
- 点 pipeline → 进 PipelineDetail (阶段列表 + 跳 ChatHome 看 case)

#### 3.6.3 [📋 Plan]
- 点击 → 进 PlansScreen (新建) 列表
- 列当前公司所有 in-progress plan documents
- 每条 plan: 标题 + 评审状态 (Approved/Pending/Rejected)
- 点 plan → 进 PlanDetail (纸clip Ask mode + 修订 + 评审)

新建文件:
- `clients/expo/src/screens/PipelinesScreen.tsx` + `PipelineEditorScreen.tsx` + `PipelineDetailScreen.tsx`
- `clients/expo/src/screens/PlansScreen.tsx` + `PlanDetailScreen.tsx`
- `clients/h5/src/screens/Pipelines*.tsx` + `Plans*.tsx` (镜像)

App.tsx 加路由:
```
/pipelines → PipelinesScreen
/pipelines/new → PipelineEditorScreen
/pipelines/:id → PipelineDetailScreen
/plans → PlansScreen
/plans/:id → PlanDetailScreen
```

## 4. 模拟器验证

```bash
# 1. bump 0.5.7 → 0.5.8 + build APK + adb install
# 2. 启动 → 底部 tab 点 [任务]
# 3. 看到 Coolie Web 同款 Tasks UI (搜索 + 6 视图 + TODAY/YESTERDAY 分组 + 列表)
# 4. 点 [+ 新建任务] → 表单弹出 → 填"测试 wave18" + [创建] → 列表新增
# 5. 点 appBar [🎤] → 录音 3s → transcribed text → issue 创建
# 6. 截图入 /tmp/emu-evidence/wave18-0.5.8/
```

## 5. Constraints

- ❌ DON'T 触碰 paperclip 上游 (ui/) — 只读 + 移植
- ❌ DON'T bump 0.5.7 → 0.5.8 之外的版本
- ✅ DO 复用 wave14 dispatchVoice + useRecorder
- ✅ DO 复用现有 5 tab BottomTabBar (不加新 tab)

## 6. Done definition

9 步全完 + 0.5.8 APK 装机 + 模拟器验证 (Tasks UI 同 Coolie Web + [+ 新建] + 语音按钮) + commit + push + 发版 + 上 COS + 装机直链:

```
Coolie工坊 0.5.8: https://dls.xrobinai.cn/coolie/app/0.5.8/coolie-release.apk
```

## 7. Coolie Web 0.6.3 暂不发 (boss 09-21 22:38 OOB 「web不用改了」)

Boss 撤回双 App 同步 — Coolie Web 0.6.2 不动,只 Coolie工坊 0.5.8 抄 NewTaskDialog.

### 7.1 Coolie Web 端动作

**不需要任何动作.**

Coolie Web 0.6.2 仍在线 (boss 截图所见版本), 不要 bump, 不要发版.

i18n 字典扩展 11 条**不做** — Coolie Web 0.6.2 paperclip-web 套壳不动.

### 7.2 单 App 发版

```
装机链接 (boss 09-21 22:38 后):
- Coolie工坊 0.5.8:   https://dls.xrobinai.cn/coolie/app/0.5.8/coolie-release.apk (新)
- Coolie Web 0.6.2:   https://dls.xrobinai.cn/coolie/app/0.6.2-paperclip-web/coolie-release.apk (不变)
```

只 Coolie工坊 抄 NewTaskDialog UI + 语音按钮 + i18n 字典扩展 11 条 (i18n patch2 在 App 端用, 不上 Coolie Web).