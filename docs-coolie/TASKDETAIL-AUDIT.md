# TaskDetailScreen 审计 (wave54)

> 任务详情页 (App 端) 真值审计 + 上游 web 对比 + UX 问题清单
> 审计对象: `clients/expo/src/screens/TaskDetailScreen.tsx` (434 行, 0.5.31)
> 对比对象: `ui/src/pages/IssueDetail.tsx` (8263 行, 上游 web)

## 1. 字段真值

| 字段 | 渲染位置 | 数据来源 | 备注 |
|---|---|---|---|
| 标题 | `styles.title` (line 195) | `issue.title` | 必显 |
| 状态 (pill) | line 198-202 | `issue.status` | 有中文映射表 `STATUS_LABEL` |
| 优先级 (pill) | line 203-207 | `issue.priority` | 有中文映射表 `PRIORITY_LABEL` |
| 分配智能体 | line 211 | `issue.assigneeAgentId` → `agentNameById` | 缺失时显示「未分配」 |
| 状态 (重复) | line 212-216 | `issue.status` | KeyValueRow 又渲一遍 (跟 pill 重复) |
| 优先级 (重复) | line 217-221 | `issue.priority` | KeyValueRow 又渲一遍 (跟 pill 重复) |
| 任务编号 | line 222 | `issue.id` (mono) | 上游没有显式 id |
| 描述 | line 226-231 (条件) | `issue.description` | 缺失时不显示 |
| 评论列表 | line 251-296 | `coolie.getIssueComments(issue.id)` | 时间线样式 |
| 员工 @ 胶囊 | line 298-315 | `coolie.listAgents(issue.companyId)` | 点名字追加 @ 到输入框 |

**缺字段** (wave54 新发现):
- 创建时间 / 更新时间 — 不显示
- 项目 (project) — 不显示 (issue.projectId 在 app 端未拿到/未渲染)
- 审批 (approval) — 完全没接 (上游 web 有 IssueApprovals 区)
- 附件 (attachments) — 不显示 (上游 IssueAttachmentsSection 单独区块)
- 标签 / 分类 — 不显示

## 2. 按钮 (App 端 fork 加)

| 按钮 | 代码位置 | 跳转目标 | 状态 |
|---|---|---|---|
| **代码 Diff** | line 236-241 | `onOpenDiff(issue)` → CodeDiffScreen (943 行) | **本次删 (跟上游对齐, 上游无此按钮)** |
| **原型沙箱** | line 242-247 | `onOpenSandbox(issue)` → PrototypeSandboxScreen (917 行) | **保留 + DS 风格重塑 (wave54 改造)** |
| 发送评论 | line 328-338 | `coolie.addIssueComment()` | 保留 |

**两个 actionRow 按钮都依赖 props 注入** (`onOpenDiff?` / `onOpenSandbox?`), 是上层 App.tsx 注入的回调, 不是组件内部跳转。

## 3. UX 问题

| ID | 严重度 | 问题 |
|---|---|---|
| UX-1 | 中 | 状态 + 优先级 在顶部 pill + 下方 KeyValueRow **重复渲染** 两次 (用户看到 4 个相同信息的视觉块) |
| UX-2 | 中 | **按钮太多**: 代码 Diff + 原型沙箱两个 ghost button 占一整行, 上游 web 没有这俩 |
| UX-3 | 低 | **创建/更新时间完全不显示**, 用户不知道这任务是今天建的还是 3 周前建的 |
| UX-4 | 低 | **附件不显示**, 但 server 端 `listIssueAttachments` 已存在 (`coolie.getIssueAttachments`) |
| UX-5 | 低 | 描述渲染为纯文本, 没有 markdown 支持 (上游 web 有渲染器) |
| UX-6 | 低 | 评论时间线: 用户发的 = accent dot (蓝) / 智能体发的 = ok dot (绿), 但视觉差别很小 |
| UX-7 | 低 | Loading 态只在 `comments.length === 0` 时显示, 已有评论的 refresh 不显示 loading |
| UX-8 | 提示 | 「@ 智能体」区在最后, 但用户写评论时已经看到了时间线, 顺序正确 (无问题) |
| UX-9 | 提示 | 5 tab 底部 nav 由 wave51 已修, EdgeSwipeBack 由 wave28 已修 |

## 4. 跟上游 web IssueDetail.tsx 差异

### 4.1 上游有, App 没有 (App fork 漏掉的)

| 上游区段 | 上游位置 | App 缺失 |
|---|---|---|
| IssueApprovals | 上游 line ~2090 | **缺** — 审批门控完全没接 |
| IssueAttachmentsSection | 上游 line ~185 | **缺** — 附件区空 |
| 创建/更新时间 | 上游 IssuePropertiesHeader | **缺** |
| 项目 (project) | 上游 IssuePropertiesHeader | **缺** |
| Tabs (评论 / 工时 / 历史) | 上游 line 278 (Tabs/TabsList) | **缺** — App 是单页 ScrollView |
| TaskSidePanel | 上游 line 216 | **缺** |
| SidePanelToggleButton | 上游 line 217 | **缺** |

### 4.2 上游没有, App fork 自己加的

| App 区段 | 位置 | 说明 |
|---|---|---|
| 代码 Diff 按钮 | line 236-241 | CodeDiffScreen 943 行 (纯 git diff 渲染) |
| 原型沙箱 按钮 | line 242-247 | PrototypeSandboxScreen 917 行 (react-native-webview) |
| @ 智能体胶囊区 | line 298-315 | 简化版的 @ 提示, 上游用 RichEditor |
| IssueComment timeline dot | line 273-294 | 上游没用 dot + line 设计 |

### 4.3 上游和 App 都有

| 区段 | 上游位置 | App 位置 |
|---|---|---|
| 标题 | line ~1037 | line 195 |
| 状态/优先级 pill | IssuePropertiesHeader | line 198-208 |
| 描述 | IssueDescriptionSection | line 226-231 |
| 评论区 | IssueCommentSection (line ~2279) | line 251-296 |
| 评论 composer | 上游 CommentComposer | line 318-339 |

## 5. wave54 改造动作 (本审计 → 编码)

| 决策 | 来源 | 动作 |
|---|---|---|
| 删「代码 Diff」按钮 | PM 拍板, 跟上游对齐 | 删除 line 234-241 中的 `{onOpenDiff ? ... : null}` 块 |
| 保留「原型沙箱」按钮 | 用户场景需要 | 保留, 但下游 PrototypeSandboxScreen 加 DS 风格标识 |
| 状态/优先级不去重 | 时间不够, 不在 brief 里 | 不动 |
| 添加创建/更新时间 | 不在 brief 里 | 不动 (后续 wave) |
| 审批/附件 | 不在 brief 里 | 不动 (后续 wave) |

## 6. 数字快照

- TaskDetailScreen.tsx 总行数: **434 行**
- 引入的依赖: `KeyboardAvoidingView` + `RefreshControl` + `Ionicons` + 8 个本地 UI 组件 + 4 个常量 map
- 网络请求: `getIssueComments` + `listAgents` + `addIssueComment` (3 个端点)
- 上游 IssueDetail.tsx 总行数: **8263 行** (App 端 fork 的 19× 大, 复杂度差巨大)

## 7. Done 时再读一次

下游 PR 要保证:
1. TaskDetailScreen 「代码 Diff」按钮彻底不渲染 (App.tsx 注入侧也删)
2. TaskDetailScreen 「原型沙箱」按钮还在, 但任务详情页本身 UX 行为不变
3. 任务详情页基础功能 (字段 / 评论 / 状态 / @ 提示) 全部保留
4. 不 bump 0.5.31→0.5.32 之外的版本号
5. 不触碰上游 `ui/`
