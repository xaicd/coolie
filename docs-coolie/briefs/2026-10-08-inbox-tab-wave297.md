# Brief: wave297 — 加收件箱 Tab + 工坊中文化 (参 wave297)

**Wave**: wave297
**Date**: 2026-10-08 12:00 CST
**PM**: Hermes (hermes-pm)
**触发**: 老板 10-08 原话「原生 App 没有收件箱，如何审批」+ 「加收件箱，参考 web 收件箱」

---

## A. 项目核心信息

| 项 | 值 |
|---|---|
| 项目 | Coolie (paperclip fork) |
| 仓库 | `$REPO_ROOT` |
| 主分支 | `main` (HEAD `258e8f62f`) |
| 真值源 | `docs-coolie/EMPLOYEE-OBJECTS.md` + `TOOLS.md` |

---

## B. 老板原话 (Boss Input)

> 「原生 App 没有收件箱，如何审批」
> 「加收件箱，参考 web 收件箱」

---

## C. 现状盘点 (FDA 视角)

### C.1 现有收件箱代码
- `clients/expo/src/screens/InboxScreen.tsx` **1238 行**（all / mine / blocked / approvals 4 子页）
- `App.tsx` L1170/L1196/L1300/L1313 多处 `onOpenApproval` 引用

### C.2 TabBar 现状
- App.tsx L158 注释：「5 项（汇览 / 任务 / [+] / **员工** / **收件箱**, 见 src/components/TabBar.tsx）」
- 老板截图实际看到：「汇览 / 任务 / + / 工坊 / 资产」——**label 错了**：第三个不是「+」是「+」（FAB），「工坊」应该是「收件箱」
- 用户看不到「收件箱」入口

### C.3 工坊中文问题
- 副标题显示「Board Operations」**英文** —— 违反 AGENTS.md §14 中文优先
- 「待办」按钮无文字 —— 看不出是什么

---

## E. 目标 (Scope) — 4 件套

| ID | 内容 | 责任人 | 工具 | 优先级 |
|---|---|---|---|---|
| E-1 | **TabBar 修 label**：把「员工」改「收件箱」（参考 App.tsx L158 注释），让收件箱 Tab 真出现在 TabBar | 铁匠贰号 | claude-mm | 🔴 P0 |
| E-2 | **工坊 Tab 副标题中文化**：「Board Operations」→「工坊操作」+ 「待办」按钮加文字「待办审批 N」 | 铁匠贰号 | claude-mm | 🔴 P0 |
| E-3 | **修工坊流卡死 bug**（30 秒无返回 → 看 server 端 chat 流）+ 门神 E2E 验真 | 兑底渊 + 门神 | claude-mm + cmd | 🟠 P1 |
| E-4 | 验证 wave296 v0.6.27 真发版 + 老板装 v0.6.27 验真 | 兑底渊 | claude-mm | 🟠 P1 |

---

## F. 不要做 (Out of Scope)

- **不动** v0.6.26 / v0.6.27 release tag
- **不动** server / scripts / dispatch / context-bus
- **不动** InboxScreen.tsx（1238 行已写好）—— 只调 TabBar label + 工坊副标题
- **不动** 7 工具池 / AGENT_ROLES enum

---

## G. 验收 (Acceptance)

### G.1 TabBar 修 (E-1)
- TabBar.tsx 5 项 label 改：`汇览 / 任务 / + / 收件箱 / 资产`（**收件箱**真正出现）
- InboxScreen 在 App.tsx 路由注册
- 老板截图能看到「收件箱」Tab 入口
- 收件箱点进去能看到「待办」/`all / mine / approvals / blocked` 4 子页（参考 web）

### G.2 工坊中文化 (E-2)
- 工坊 Tab 副标题「Board Operations」→「工坊操作」
- 「待办」按钮加文字「待办审批 N」

### G.3 工坊流卡死 (E-3)
- 工坊 AI 助手流 30 秒无返回 → 兜底不卡
- 报告 `docs-coolie/evidence/wave297/QA-REPORT.md`

### G.4 v0.6.27 验真 (E-4)
- v0.6.27 真发版 + APK 上线 + OTA 推
- 老板装 v0.6.27 后「收件箱」Tab 真出现

---

## H. 派工

| 员工 | 任务 | 工具 | brief |
|---|---|---|---|
| **铁匠贰号 (Forge II)** `forge-ii-core-swe` | E-1 + E-2 实现 | claude-mm | 本 brief |
| **兑底渊 (Operator)** `duidiyuan-pre-sre` | E-3 + E-4 | claude-mm（copilot 空 fallback）| 本 brief |
| **门神 (Guardian)** `menshen-fdse` | E-3 E2E 验真 | cmd | 本 brief |

---

## I. 不要顺手改

- 不动 InboxScreen 1238 行内容（已写好）
- 不动 v0.6.27 tag / wave296 commit
- 不动 7 工具池配置 / AGENT_ROLES enum

---

## J. QA 门禁

- G2 Core SWE: 铁匠贰号 + 兑底渊 code, `pnpm -r typecheck` 0 errors
- G3 FDSE: 门神 E2E 收件箱 + 工坊流 + TabBar 5 项
- G5 PRE-SRE: v0.6.27 验真

---

## K. PM 反讲 (Compact)

```
【compact ·12:00 ·wave297】
老板: 加收件箱 Tab (参考 web) + 工坊中文化
派: 铁匠贰号 wave297 (claude-mm) TabBar 5 项 + 工坊副标题
     兑底渊 wave297 (claude-mm) v0.6.27 验真 + 工坊流 30s 卡死修
     门神 wave297 (cmd) E2E
不动: v0.6.27 / InboxScreen 内容（1238 行已写）/ 7 工具池
```