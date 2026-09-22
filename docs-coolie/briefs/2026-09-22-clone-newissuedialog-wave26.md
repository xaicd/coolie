# Brief: wave 26 — 1:1 抄 Coolie Web NewIssueDialog 到 Coolie工坊 App 端

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-22 OOB 「抄 web」

老板明确指令: **直接 1:1 抄 Coolie Web 上游 NewIssueDialog.tsx, 不要重设计, 不要抽象, 完全照搬.**

## 1. 已知现状 (PM 09-22 真查)

```
✅ Coolie Web 上游 NewIssueDialog 完整文件:
   ssh tc-coolie-claw 'cat /opt/coolie/ui/src/components/NewIssueDialog.tsx'
   
   含字段:
   - Title: "Task title"
   - Description: "Add description..."
   - For [Assignee] placeholder
   - in [Project] placeholder
   - Reviewer / Approver
   - Watchdog agent + instructions
   - Assignee model lane + thinking effort + chrome toggle
   - Execution workspace mode
   - Work mode (auto/code/plan/etc, IssueWorkMode enum)
   - Priority
   - Status (todo/in-progress/done)
   - Upload attachment
   - Tags
   - Due date
   - Trust policy preset
   - ⋯ More menu (additional actions)
   - Draft persisted (paperclip DRAFT_KEY + debounce 800ms)
   - Discard Draft + Create Task 按钮
   - Visual viewport layout (mobile-friendly)
   
✅ App 端 wave24 已加 For/Assignee/Project/Mode/Upload (但只是字段, 不是 1:1 抄)
✅ App 端 wave25 续跑 (3 文件 modified: ComposerForm/MoreMenu/StatusChip), 撞 max-turns 后没完成
✅ boss "你是设计师吗" + "啥玩意啊" + "抄 web" — 三连拒绝抽象设计, 要直接抄
```

## 2. 目标

**Coolie工坊 0.5.15 App** 新建任务 composer = Coolie Web NewIssueDialog 1:1 RN 适配版.

不要再用 mockup, 不要再设计, **直接照抄**.

## 3. 任务 (4 步 — 1:1 抄)

### 3.1 读 Coolie Web NewIssueDialog.tsx 全文

`/opt/coolie/ui/src/components/NewIssueDialog.tsx` (server 上) - 完整 JSX 结构 + IssueDraft type + 所有 hook/state 都要复用.

### 3.2 仿写 RN 版本 (但 1:1 字段)

新建 `clients/expo/src/screens/ComposeScreen.tsx` (替换现 App.tsx TaskComposer):

**RN 适配但保留所有字段**:

```tsx
// 1. 字段 (跟 NewIssueDialog IssueDraft type 一一对应)
const [title, setTitle] = useState('');
const [description, setDescription] = useState('');
const [status, setStatus] = useState('todo');
const [priority, setPriority] = useState('medium');
const [assigneeId, setAssigneeId] = useState<string | null>(null);
const [reviewerId, setReviewerId] = useState<string | null>(null);
const [approverId, setApproverId] = useState<string | null>(null);
const [watchdogAgentId, setWatchdogAgentId] = useState<string | null>(null);
const [watchdogInstructions, setWatchdogInstructions] = useState('');
const [projectId, setProjectId] = useState<string | null>(null);
const [workMode, setWorkMode] = useState<IssueWorkMode>('auto');
const [tags, setTags] = useState<string[]>([]);
const [dueDate, setDueDate] = useState<string | null>(null);
const [trustPolicy, setTrustPolicy] = useState<string>('standard');
const [attachments, setAttachments] = useState<Attachment[]>([]);
// + IssueModelLane + thinking effort + chrome toggle + isolated workspace mode (来自 NewIssueDialog)
```

**JSX 结构 (1:1 抄 NewIssueDialog)**:

```
Dialog Header:
  XROA › New task + ↗ Maximize/↙ Minimize + ⋯ (other actions)

Body:
  1. Title Input (大)
  2. Description Textarea (Markdown)
  3. For [Assignee selector]
  4. in [Project selector]
  5. Reviewer selector
  6. Approver selector
  7. Watchdog agent selector + instructions
  8. Assignee model lane + thinking effort + chrome toggle
  9. Execution workspace mode select
  10. Work mode chips
  11. Priority chips
  12. Status chip
  13. Upload (attachments)
  14. Tags chip
  15. Due date picker
  16. Trust policy preset
  17. ⋯ More menu (toggle section)
  18. InlineBanner (MissingUserSecretsBanner 等)
  
Footer:
  Discard Draft + Create Task
```

### 3.3 复用上游 helper 函数 + API client (跟 NewIssueDialog 同一套)

- `agentsApi.list()` (列 Assignee/Reviewer/Approver)
- `projectsApi.list()` (列 Project)
- `assetsApi.create()` (上传附件)
- `issuesApi.create({ ...all fields })` (创建任务)
- `workModeMetaFor(mode)` (从 `@paperclipai/shared` import)
- `assigneeValueFromSelection / parseAssigneeValue` (跟 NewIssueDialog 同一套解析)

### 3.4 h5 镜像 + i18n + 发版

`clients/h5/src/screens/ComposeScreen.tsx` 同样 1:1 (用 HTML `<select>` 替换 RN `<Pressable>`)

i18n 字典加 20+ 条 (跟 NewIssueDialog 字段 label 一一对应).

bump 0.5.13 → 0.5.14 (wave25 续如果完不成, 用这个新版)

## 4. 模拟器验证

```bash
1. (如果有 wave25 0.5.14 发版, 用 0.5.14, 否则直接 0.5.13 → 0.5.15)
2. Build APK + adb install
3. 进 [任务] tab → 点 [+] → composer 浮层:
   ✅ 跟 Coolie Web NewIssueDialog 1:1
   ✅ Title input + Description textarea + For/Assignee/in/Project 4 列
   ✅ Priority chips + Status chip + Upload + Work mode chips
   ✅ Reviewer/Approver/Watchdog (高级字段)
   ✅ Tags + Due date + Trust policy
   ✅ Discard Draft + Create Task
4. 填全字段 + Create → POST /api/issues 201
5. 截图 /tmp/emu-evidence/wave26-0.5.15/
```

## 5. Constraints

- ❌ DON'T 重设计 — 1:1 抄 NewIssueDialog 字段和布局
- ❌ DON'T 用 mockup HTML 风格 — 那是参考, 不是规范
- ❌ DON'T 触碰 paperclip 上游 (ui/) — 只读
- ✅ DO 仿写 RN 但保留所有字段
- ✅ DO 复用 @paperclipai/api-client + @paperclipai/shared (IssueWorkMode, workModeMetaFor, assignee helpers)

## 6. Done definition

4 步全完 + 0.5.15 APK 装机 + 模拟器验证 (1:1 Coolie Web 同款, 字段全) + commit + push + 发版 + 上 COS:

```
Coolie工坊 0.5.15: https://dls.xrobinai.cn/coolie/app/0.5.15/coolie-release.apk
```