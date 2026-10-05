# Brief: wave302-v2 — 全局页面栈 + 面包屑 + 滑动返回 (单文件改 App.tsx, no sub-agent)

**Wave**: wave302-v2
**Date**: 2026-10-05 14:15 CST
**PM**: Hermes (hermes-pm)
**触发**: 老板 10-05 14:12 原话「claude别用 subagent了吧，咋老是不稳定」

---

## A. 项目核心信息

| 项 | 值 |
|---|---|
| 项目 | Coolie (paperclip fork) |
| 仓库 | `/Users/mac/workspace/xaicd/coolie` |
| 主分支 | `main` (HEAD `9d9f94fc4` release v0.6.28) |

---

## B. 老板原话 (Boss Input)

> 「claude别用 subagent了吧，咋老是不稳定」

---

## C. 新规矩 (从 wave303 起)

- ❌ **不用** claude (claude-mm / claude-glm) sub-agent 派工模式
- ✅ claude 直接执行（no sub-agent）
- ✅ 复杂任务派 **门神 (cmd)** 直接 ssh + patch
- ✅ 原型/调研派 **墨斗 (agy)**
- ✅ 部署/发版派 **兑底渊 (copilot fallback)**

---

## D. 任务（直接执行, no sub-agent）

铁匠贰号**直接改 App.tsx**，**不再派 sub-agent**：

### D.1 全局页面栈
- App.tsx 加 `useState<ScreenFrame[]>([])` screenStack
- 帧形如 `{ source: 'inbox'|'tasks'|'chat'|'workbench'|'asset', title: string, context?: any }`
- 返回走 pop()

### D.2 onBack 上推
- TaskDetailScreen / InboxScreen / AgentDetailScreen / PipelinesScreen / PlansScreen / ProjectsScreen / SpecEditorScreen
- 所有 onBack 改走 screenStack.pop()

### D.3 滑动返回
- `react-native-gesture-handler@~2.20.2`（**已装**, 禁止再装）
- 50px 边缘 + 80px 距离 + 300ms

### D.4 面包屑
- BreadcrumbBar 组件：水平 chip + chevron + tap 跳级
- `OntologyDrillBreadcrumb.tsx` 可作样式参考（**不修改 OntologyDomainListScreen**）

### D.5 验收
- `pnpm -r typecheck` 0 errors
- 报告 `docs-coolie/evidence/wave302/QA-REPORT.md`

---

## E. 不要做 (Out of Scope)

- 不动 v0.6.28 tag / 24 commit 实质改
- 不动 server / scripts / dispatch
- 不动 业务本体页 (OntologyDomainListScreen)
- 不动 7 工具池 / AGENT_ROLES enum

---

## F. 验收

- 铃铛 → 收件箱 → issue → 返回 → **真回收件箱**
- 面包屑显示完整路径（汇览 › 收件箱 › COOA-28）
- 滑动右滑 → 也回上一级
- `pnpm -r typecheck` 0 errors

---

## G. 派工（直接执行, no sub-agent）

| 员工 | 工具 | 任务 |
|---|---|---|
| **铁匠贰号 (Forge II)** | claude-mm | **直接执行**, 不派 sub-agent |

## H. 不要实现

- ❌ **不调 Agent 工具**派 sub-agent
- ❌ 不动 root workspace pnpm install（codex-acp patch 坑）
- ❌ 不动 v0.6.28 tag

---

## I. 不要顺手改

- 不动 7 工具池配置 / AGENT_ROLES enum

---

## K. PM 反讲 (Compact)

```
【compact ·14:15 ·wave302-v2】
老板: claude别用 subagent, 改规矩
派: 铁匠贰号 (claude-mm) wave302-v2 直接执行 App.tsx, 不派 sub-agent
新规矩: claude 全程直接执行, 复杂任务派门神 cmd, 原型派墨斗 agy
```