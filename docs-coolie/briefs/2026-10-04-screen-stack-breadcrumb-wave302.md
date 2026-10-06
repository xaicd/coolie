# Brief: wave302 — 全局页面返回栈 + 面包屑 + 滑动返回 (精准返回 + 滑返回)

**Wave**: wave302
**Date**: 2026-10-04 23:00 CST
**PM**: Hermes (hermes-pm)
**触发**: 老板 10-04 原话「A,所有页面都要有自己的的页码吧,要支持精准返回，滑动返回也要支持」

---

## A. 项目核心信息

| 项 | 值 |
|---|---|
| 项目 | Coolie (paperclip fork) |
| 仓库 | `$REPO_ROOT` |
| 主分支 | `main` (HEAD `9d9f94fc4` release v0.6.28) |
| 真值源 | `docs-coolie/EMPLOYEE-OBJECTS.md` + `TOOLS.md` |

---

## B. 老板原话 (Boss Input)

> 「A,所有页面都要有自己的的页码吧,要支持精准返回，滑动返回也要支持」

---

## C. 真问题盘点

老板当前 bug：铃铛 → 收件箱 → 任务详情 → 返回 → 不再回到「收件箱」而是空 TaskKanbanScreen，**无法精准回到铃铛页**。

类似问题可能影响：任务详情 → spec → ... 本体详情 → graph → ...

**当前 App.tsx 真相**：
- L993-994: `if (selected) return setSelected(null), true` —— 返回只清 selected，**不记来源**
- L1039: `onBack={() => setSelected(null)}` —— TaskDetailScreen 返回按钮，**也是只清 selected**
- L1083-1087: notificationsOpen / agentDetail / pipelinesOpen / plansOpen / projectsOpen 等都是**独立 boolean state**，**无栈结构**

---

## D. 目标 (Scope) — 5 件套

| ID | 内容 | 责任人 | 工具 | 优先级 |
|---|---|---|---|---|
| D-1 | **App.tsx 加全局页面栈 `screenStack` + breadcrumb `pagePath[]`**：push/pop 按层级，铃铛 → 收件箱 → 任务详情 → 返回**精准回铃铛页** | 铁匠贰号 | claude-mm | 🔴 P0 |
| D-2 | **每个子屏改 onBack 上推 breadcrumb**：TaskDetailScreen / InboxScreen / AgentDetailScreen / PipelinesScreen / PlansScreen / ProjectsScreen / SpecEditorScreen 等**所有**返回按钮走 breadcrumb.pop() | 铁匠贰号 | claude-mm | 🔴 P0 |
| D-3 | **滑动返回**（react-native-gesture-handler EdgeSwipe）：iOS 边缘右滑 + Android 系统返回手势触发 breadcrumb.pop() | 铁匠贰号 | claude-mm | 🔴 P0 |
| D-4 | **面包屑渲染组件**：每个页面顶部 chip 显示完整路径（汇览 › 收件箱 › 任务 COOA-28），点击任一级跳到该级 | 铁匠贰号 | claude-mm | 🔴 P0 |
| D-5 | pnpm -r typecheck 0 errors + 真机 E2E (面包屑/返回/滑动全可用) | 铁匠贰号 + 门神 | claude-mm + cmd | 🔴 P0 |

---

## E. 不要做 (Out of Scope)

- **不动** v0.6.28 tag / 24 commit 实质改
- **不动** server / scripts / dispatch
- **不动** 业务本体页 (OntologyDomainListScreen)
- **不动** 7 工具池 / AGENT_ROLES enum / 5 角色

---

## F. 验收 (Acceptance)

### F.1 全局页面栈 (D-1)
- App.tsx 加 `useState<ScreenFrame[]>([])` screenStack
- 每层 push: `{ source: 'inbox'|'tasks'|'chat'|'workbench'|'asset', title: string, context?: any }`
- 返回按钮调 screenStack.pop()
- 铃铛 → 收件箱 → issue：栈 = `[{source:'inbox'}] → [{source:'inbox', detail:'all'}] → [{source:'inbox', detail:'all'}, {source:'inbox', detail:'issue', id}]`

### F.2 onBack 上推 (D-2)
- TaskDetailScreen.onBack → screenStack.pop() 而非 dashboard
- InboxScreen.onBack → screenStack.pop()
- AgentDetailScreen.onBack → screenStack.pop()
- ... 所有子屏均按此改

### F.3 滑动返回 (D-3)
- react-native-gesture-handler EdgeSwipe 包装
- 触发阈值：边缘 50px 内 + 右滑 80px 以上 + 300ms 内
- 同时禁掉 system back 安卓返回键（统一走 stack）

### F.4 面包屑 (D-4)
- BreadcrumbBar 组件：水平 chip 列表 + tap 跳到该级 + chevron 分隔符
- 所有子屏顶部渲染面包屑（替换当前简单的 [← 返回] 标题）

### F.5 验收
- 真机：铃铛 → 收件箱 → issue → 右滑 → 回到收件箱 ✅
- 真机：铃铛 → 收件箱 → issue → 顶部「收件箱」chip 点 → 回收件箱 ✅
- 真机：任务列表 → issue → 右滑 → 回任务列表 ✅
- `pnpm -r typecheck` 0 errors
- 报告 `docs-coolie/evidence/wave302/QA-REPORT.md`

---

## G. 派工

| 员工 | 任务 | 工具 | brief |
|---|---|---|---|
| **铁匠贰号 (Forge II)** `forge-ii-core-swe` | D-1+D-2+D-3+D-4+D-5 全跑 | claude-mm | 本 brief |

---

## H. 不要顺手改

- 不动 v0.6.28 tag / 24 commit 实质改
- 不动其它 plugin / script
- 不动 native TabBar
- 不动 7 工具池配置

---

## I. QA 门禁

- G2 Core SWE: 铁匠贰号 code, `pnpm -r typecheck` 0 errors
- G3 FDSE: 门神 E2E (可选, 真机由老板主导)
- **不发版**：等老板装 dev 看效果

---

## K. PM 反讲 (Compact)

```
【compact ·23:00 ·wave302】
老板: 全屏 + 面包屑 + 滑动返回, 解决铃铛→任务详情→回不去的 bug
派: 铁匠贰号 (claude-mm) wave302: App.tsx 加 screenStack + breadcrumb + EdgeSwipe + 所有子屏 onBack 上推
不动: v0.6.28 / server / TabBar / 7 工具池
```