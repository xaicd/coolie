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

### 3.4 语音按钮接 dispatch

复用 wave14 `dispatchVoice()` — 在 TasksScreen appBar 右上 mic icon:
- 点 mic → 录音 → POST `/api/multimodal/transcriptions` mode=dispatch
- transcribed text 作为 issue 标题 → 创建 → 跳 ChatHome

### 3.5 替换路由

`clients/expo/App.tsx` 把现有 [任务] tab 路由换成新的 TasksScreen:
- 旧的 TaskDetailScreen 保留 (深链跳转用)
- 底部 tab 第 2 个 TasksScreen (选中态紫蓝)

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

5 步全完 + 0.5.8 APK 装机 + 模拟器验证 (Tasks UI 同 Coolie Web + [+ 新建] + 语音按钮) + commit + push + 发版 + 上 COS + 装机直链:

```
Coolie工坊 0.5.8: https://dls.xrobinai.cn/coolie/app/0.5.8/coolie-release.apk
```