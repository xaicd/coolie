# Brief: wave 31 — App 页面审计精简收敛 (给老板选)

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-22 23:30 OOB 「只是页面要开始审计精简收敛，选择」

老板要求**审计整个 App 端页面 (expo + h5)**, 给出精简收敛清单, 让老板**选**保留哪些 / 合并哪些 / 砍哪些.

不要直接改代码, 出审计报告 + 选项, 让老板拍板.

## 1. 已知现状 (PM 09-22 真查)

```
✅ Coolie工坊 0.5.18 已发版 (wave29 修 keyboardShouldPersistTaps)
✅ Coolie Web 0.6.2 已发版
✅ App 5 tab: 汇览 / 任务 / [+] / 员工 / 收件箱
❌ 各屏字段堆 / UI 冗杂 / 多个页面有重叠功能 (老板视觉乱的感觉)
```

## 2. 目标

**只审计, 不动代码.** 出 `docs-coolie/APP-PAGES-AUDIT.md` 报告:

- 所有页面清单 (App + h5)
- 每个页面功能简述
- 重叠/冗余页面识别
- 推荐精简/合并/砍掉方案 (3 档: 激进 / 中庸 / 保守)
- 让老板**选** (回字: "激进 / 中庸 / 保守 / 自定义")

## 3. 任务 (5 步)

### 3.1 列所有 expo App 端页面

```bash
find clients/expo/src/screens -name "*.tsx" | sort
find clients/expo/src/components -name "*.tsx" | sort
find clients/h5/src/screens -name "*.tsx" | sort
find clients/h5/src/components -name "*.tsx" | sort
```

### 3.2 看每个页面做什么

读每个 tsx 文件第 1-50 行 (主要 comment + export), 写每页功能简述 (1-2 句).

### 3.3 重叠页面识别

- TasksScreen vs IssuesList 组件 vs IssuesList page wrapper
- DashboardScreen vs InboxScreen vs NotificationsScreen
- AgentDetailScreen vs AgentsScreen
- TaskDetailScreen vs NewTaskDialog
- ComposerForm vs CreateTaskModal vs ComposeScreen (3 个, 应该合并)
- ComposeOverlay (浮层) vs ComposeScreen (全屏) vs TaskComposer (内嵌)
- 等等

### 3.4 写 docs-coolie/APP-PAGES-AUDIT.md

报告结构:

```markdown
# App 页面审计 (PM 2026-09-22)

## 1. 所有页面清单

### App 端 (clients/expo/src/screens/)
| 页面 | 功能 | 行数 | PRD # | 重要度 |
| --- | --- | --- | --- | --- |
| DashboardScreen | 主驾驶舱 | ? | 12 | P0 |
| TasksScreen | 任务列表 | ? | 3, 4, 6 | P0 |
| TaskDetailScreen | 任务详情 | ? | 3, 4 | P0 |
| BoardChatScreen | 工坊对话 | ? | 12 | P0 |
| ComposeScreen | 新建任务浮层 | ? | 1 | P0 |
| AgentDetailScreen | 智能体详情 | ? | - | P1 |
| AgentsScreen | 员工列表 | ? | 7 | P1 |
| InboxScreen | 收件箱 | ? | - | P1 |
| NotificationsScreen | 通知 | ? | - | P1 |
| OntologyDomainListScreen | 本体列表 | ? | 11 | P0 |
| ArtifactsScreen | 产物 | ? | 3 | P1 |
| CodeDiffScreen | 代码差异 | ? | 4 | P1 |
| PrototypeSandboxScreen | 原型沙箱 | ? | 5 | P1 |
| PipelinesScreen | Pipeline | ? | - | P1 |
| PlansScreen | Plan | ? | - | P1 |
| WhatsNewScreen | 装机自检 | ? | - | P0 |
| DashboardScreen | ... | ... | ... | ... |

### H5 端 (clients/h5/src/screens/) — 类似列表

## 2. 重叠页面识别

| 重叠 | 重复内容 | 建议 |
| --- | --- | --- |
| ComposerForm / CreateTaskModal / ComposeScreen / TaskComposer | 都是新建任务 | 合并到 1 个 ComposeScreen.tsx |
| TasksScreen 主 list + IssuesList 组件 + TasksScreen wrapper | TasksScreen 含 IssuesList, IssuesList 已重构 | TasksScreen 内嵌 IssuesList, 删 wrapper |
| ComposeOverlay 浮层 / ComposeScreen 全屏 | 浮层 + 全屏 重复 | 浮层复用 ComposeScreen 组件 |

## 3. PRD 12 项 vs 当前实现

| PRD # | 功能 | 当前实现 | 缺口 |
| --- | --- | --- | --- |
| 1 | 语音派发 | wave21 + wave26 §3.5 (voice button) | ✅ |
| 2 | 看额度 | 无 Usage/Cost 页 | ❌ (wave17 brief 写过未派) |
| 3 | 看产物 | ArtifactsScreen | ✅ |
| 4 | 看代码 | CodeDiffScreen + CodeMirror | ✅ |
| 5 | 看原型 | PrototypeSandboxScreen | ✅ |
| 6 | 看进度 | BuildProgressCard | ✅ |
| 7 | 看空闲度 | AgentsScreen | ✅ |
| 8 | 交付周期 | ? | ❌ |
| 9 | 车间效率 | ? | ❌ |
| 10 | 失败率 | ? | ❌ |
| 11 | 本体驱动 | OntologyDomainListScreen | ✅ |
| 12 | 驾驶舱问答 | BoardChatScreen | ✅ |

## 4. 精简方案 (3 档)

### 激进 (砍 5+ 页面, 合并 3 屏幕)
- ❌ 砍: NotificationsScreen (与 InboxScreen 重叠)
- ❌ 砍: ComposeOverlay 浮层 (用 ComposeScreen 全屏覆盖)
- ❌ 砍: TaskComposer 内嵌 (用 ComposeScreen 覆盖)
- 🔀 合并: ComposerForm + CreateTaskModal + ComposeScreen → 1 个 ComposeScreen
- 🔀 合并: TasksScreen + IssuesList → 1 个 TasksScreen
- 🔀 合并: AgentDetailScreen + AgentsScreen → 1 个 AgentsScreen
- 📦 砍 PRD 8/9/10 (交付周期/效率/失败率) — 没实现, 砍出 PRD
- 总屏数: 17 → 10

### 中庸 (砍 3 页面, 合并 2 屏幕) - **PM 推荐**
- ❌ 砍: NotificationsScreen
- ❌ 砍: ComposeOverlay 浮层 (用 ComposeScreen 覆盖)
- ❌ 砍: TaskComposer 内嵌 (用 ComposeScreen 覆盖)
- 🔀 合并: ComposerForm + CreateTaskModal + ComposeScreen → 1 个 ComposeScreen
- 🔀 合并: TasksScreen + IssuesList → 1 个 TasksScreen
- 保留 PRD 8/9/10 计划, 后续实装
- 总屏数: 17 → 13

### 保守 (砍 1 页面)
- ❌ 砍: NotificationsScreen (仅 1 个)
- 总屏数: 17 → 16

## 5. 给老板选

老板回复: 激进 / 中庸 / 保守 / 自定义 (说明哪几页要留 / 砍 / 合并)
```

### 3.5 把报告发到老板 (via wave31 report)

报告放 `docs-coolie/APP-PAGES-AUDIT.md` + 列入 PM 摘要, 给老板选.

## 4. Constraints

- ❌ DON'T 改任何代码 (只审计报告)
- ✅ DO 出 3 档方案 (激进 / 中庸 / 保守)
- ✅ DO 给老板选 (单字回复就够)

## 5. Done definition

5 步全完 + docs-coolie/APP-PAGES-AUDIT.md 入档 + commit + push + 给老板 3 档选择 + 等老板拍板后再派 wave32 实施.

```
docs-coolie/APP-PAGES-AUDIT.md (新文件)
```