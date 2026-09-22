# Brief: wave 24 — 新建任务 composer 增强 (拿 Coolie Web NewIssueDialog 存量复用)

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-22 00:10 OOB 「新增任务这个页面还是不如外边之前的那个好，它那个里面还可以 assign 分配和那个选择那个那个模式」+ 23:11 OOB 「我需要的是你把人家那个存量的东西拿过来增强一下，而不是完全从零开始」

老板要求 Coolie工坊 App 新建任务浮层跟 Coolie Web 同款 — 加 Assign (指派人) + Work Mode (执行模式) 字段. **不要从零写 RN 适配版, 直接复用 Coolie Web 上游 NewIssueDialog 存量代码**.

## 1. 已知现状 (PM 09-22 真查)

```
App 端 TaskComposer (App.tsx 当前):
- 标题 + 描述 + 优先级4选
- ❌ 没 Assign (指派人) 字段
- ❌ 没 Work Mode (执行模式) 字段
- ❌ 没 Project 选择
- ❌ 没附件 Upload
- ❌ 没 Markdown editor

Coolie Web NewIssueDialog (上游 ui/src/components/NewIssueDialog.tsx):
✅ 标题 + 描述 (MarkdownEditor)
✅ Assignee (智能体 OR 用户) — 联想下拉
✅ Project 选择
✅ Priority
✅ Status (todo/in-progress/done)
✅ Upload 附件
✅ Work Mode (IssueWorkMode 枚举 — Auto/Code/Plan/Auto-PR/…)
✅ Trust policy preset
✅ Execution workspace
```

## 2. 目标

**Coolie工坊 0.5.13 App** 用 *direct reuse + enhancement* 模式: 把 Coolie Web 上游 NewIssueDialog 现有逻辑作为参考, 不重写代码, 但补齐 App 端缺字段.

**核心原则 (boss 09-22 23:11 OOB "把人家那个存量的东西拿过来增强一下")**:

- **DON'T 重发明 NewIssueDialog 的逻辑** — 调上游同一 API 端点 (POST /api/issues) 即可
- **DO 复用上游的 API client** (`@paperclipai/api-client` 跨 RN/React-DOM 可用)
- **DO 复用上游 type/常量** (`IssueWorkMode` 枚举, `priorityColor`, etc.)
- **DON'T 复制 React-DOM JSX 过来** — 那跑不动, 必须 RN 适配

```
┌──────────────────────────────────────┐
│ 标题 (必填)                            │
│ 描述 (Markdown)                        │
│ For [Assignee agent/user] ⋯            │  ← NEW
│ in [Project] ⋯                         │  ← NEW
│ [●Todo] 优先级: low/medium/high/critical │
│ Upload 附件                            │  ← NEW
│ Mode: [🔨 Auto / Code / Plan / Auto-PR]│  ← NEW
│ [Discard Draft] [Create Task]          │
└──────────────────────────────────────┘
```

## 3. 任务 (5 步)

### 3.1 读 NewIssueDialog 上游字段

读 `ui/src/components/NewIssueDialog.tsx` — 看 Assignee / Work Mode / Project / Upload 4 个字段的具体逻辑 (paperclip 上游用什么 component / state).

### 3.2 改 App TaskComposer (App.tsx)

`clients/expo/App.tsx` `TaskComposer` 函数加 4 个 state + UI:

```tsx
const [assigneeId, setAssigneeId] = useState<string | null>(null);
const [projectId, setProjectId] = useState<string | null>(null);
const [workMode, setWorkMode] = useState<IssueWorkMode>('auto');
const [attachments, setAttachments] = useState<Attachment[]>([]);
```

UI:
- **For [Assignee ⋯]** 下拉: 调 `GET /api/agents?companyId=X` 列智能体 + 当前用户选项
- **in [Project ⋯]** 下拉: 调 `GET /api/projects?companyId=X` 列项目
- **Mode** 切换: 4 个 chip [🔨 Auto / 💻 Code / 📋 Plan / 🔀 Auto-PR]
- **Upload** 按钮: 选本地文件 → POST `/api/assets` → 拿 url → 加到 attachments

createTask 时把所有字段一起 POST `/api/issues`.

### 3.3 h5 镜像

`clients/h5/src/App.tsx` 同样补 4 字段 (h5 端用 HTML `<select>` / `<input type=file>`).

### 3.4 server 端验证

调 `POST /api/issues` body schema — 确认 server 接受:
- `assigneeAgentId`
- `assigneeUserId`
- `projectId`
- `workMode`
- `attachments: [{ url, name }]`

(应该都接受, paperclip 上游 NewIssueDialog 在用)

### 3.5 i18n 字典扩展

`clients/expo-paperclip-web/App.tsx` I18N_PATCH 加 6 条:

```
'Assignee' → '被指派人'
'Project' → '项目'
'Work Mode' → '执行模式'
'Auto' → '智能'
'Code' → '代码'
'Plan' → '规划'
'Auto-PR' → '自动开 PR'
```

## 4. 模拟器验证

```bash
1. bump 0.5.12 → 0.5.13 (release-app.sh runtimeVersion drift fix from wave16)
2. Build APK + adb install + 启动
3. 进 [任务] tab → 点中央 [+] → 新建任务浮层打开:
   ✅ 标题/描述/优先级4选 (已有)
   ✅ For [Assignee ⋯] 下拉可见 (NEW)
   ✅ in [Project ⋯] 下拉可见 (NEW)
   ✅ Mode 4 chip 切换 (NEW)
   ✅ Upload 按钮可见 (NEW)
4. 填 "wave24 测试" + 选 Assignee "fda" + Mode "Auto" + 点 Create Task:
   ✅ POST /api/issues → 201
   ✅ 列表新增
5. 截图 /tmp/emu-evidence/wave24-0.5.13/
```

## 5. Constraints

- ❌ DON'T 触碰 paperclip 上游 (ui/) — 只读参考
- ❌ DON'T 重发明 NewIssueDialog — 直接抄字段逻辑
- ✅ DO 复用 server 端点 (`POST /api/issues` 等)
- ✅ DO i18n 中文覆盖

## 6. Done definition

5 步全完 + 0.5.13 APK 装机 + 模拟器验证 (4 新字段可见+可用) + 真 POST 创建带 Assign/Mode 的任务 + commit + push + 发版 + 上 COS:

```
Coolie工坊 0.5.13: https://dls.xrobinai.cn/coolie/app/0.5.13/coolie-release.apk
```