# COOA-138 G4 复试报告 — F1 阻断项闭环复验 (DS 用户视角主审官)

> **文档编号**: `COOLIE-QA-DS-COOA138-REVERIFY-20261014-V1`
> **主审官**: 百晓生 (DS · 用户视角主审官，持投产一票否决)
> **触发**: `issue_blockers_resolved` — 阻断子单 COOA-178 已闭环
> **走查对象**: 工厂本体控制面 `http://127.0.0.1:3100` (`COOA/routines`)
> **走查方式**: 真实浏览器 (agent-browser 0.38.1 / Chromium) 以 Board 用户身份真点，非 API Mock
> **日期**: `2026-10-14 CST`
> **结论**: **GO (撤销一票否决)** — F1 原始 i18n 键外泄已归零

---

## 1. 复核范围 (针对首轮 NO-GO 的 F1 阻断项)

首轮 `2026-10-14-cooa138-ds-adversarial-walkthrough.md` 判定 **NO-GO**，唯一阻断项：

> **F1**: `ui/src/pages/Routines.tsx` 引用 63 个 `routines.*` 键，其中 60 个在全部 40 个语言包中未定义，`/COOA/routines` 页面直接渲染代码键 (`routines.subtitle` 等)。

本报告的复核目标是确认该键外泄已归零，并对修复可能带来的回归做横向抽检。

## 2. 修复链路追溯 (SQL 级证据)

| 工单 | commit | 说明 |
| :-- | :-- | :-- |
| COOA-178 | `644667025` | 补齐 `routines.*` 全部 i18n 键 + 新增 Web「引用-定义」守卫 |
| COOA-181 | `0c764ad64` | 清偿其余页面「引用但未定义」键 365 个，`check-ui-i18n` 基线归零 |
| COOA-180 | (复验单) | 对 COOA-178 fix commit 的静态 + 运行时双重复验，verdict PASS |

## 3. 机器门禁 (CI 级证据)

| 守卫 | 命令 | 结果 |
| :-- | :-- | :--: |
| Web i18n 引用-定义一致性 | `pnpm check:ui-i18n` | ✅ PASS (定义键 1378 / 静态引用 832 / 未定义 0 / 基线待清 0) |
| 全面管局审计 (含 §23 COOA-178) | `pnpm check:governance` | ✅ PASS (全绿) |
| 守卫单测 | `pnpm test:check-ui-i18n` | ✅ 7/7 PASS |
| Routines 键静态差集 | 源码字面量 ∩ zh-CN 定义集 | ✅ 79 字面量全命中 (zh-CN `routines.*` 定义 113 个) |

## 4. 运行时独立复走 (真实浏览器 × 三处入口)

以原始键扫描正则 `\b(?:routines|common|issues|agents|folders|app|settings|workspaces|projects|goals|costs|companies)\.[A-Za-z][A-Za-z0-9]*\b` 扫描 DOM 可见文本：

| 入口 | 原始键命中 | 业务文案抽样 | 截图 |
| :-- | :--: | :-- | :-- |
| `/COOA/routines` 列表页 | **0** | 标题「例行任务」/ 副标题「按计划自动运行的例行工作。」/「查看全部执行」/「创建例行任务」/「3 个例行任务」/「排序」「分组」「选择」 | `routines-r2.png` |
| 创建对话框 | **0** | 「新建例行任务」「设置一个周期性工作流。」「取消」「指派给」「负责人」「位于」「项目」「归档于」 | `routines-create-dialog.png` |
| 高级设置展开 | **0** | 并发「运行中则合并 · 若已有运行，新运行将并入当前运行。」/ 补跑「跳过遗漏 · 错过的运行将被跳过。」 | `routines-advanced-expanded.png` |

### 横向回归抽检 (12 页面)
`dashboard / issues / projects / artifacts / ontology / governance / inbox / board-chat / agents / activity / skills` 全部 **0 真实键外泄**。
仅 2 处正则误命中，经人工核对为文档文件名而非 i18n 键：`governance.md` (产物页文档名)、`ontology.spec` (会议室 spec 引用)。均**非**原始键外泄。

## 5. 遗留观察项 (非阻断 · 不纳入本单门禁)

| 编号 | 级别 | 观察 | 判定 |
| :-- | :--: | :-- | :-- |
| OBS-1 | 低 | Routines 页仍存在**硬编码英文文案** (非原始键): `CONCURRENCY`、`Create routine`、`FOLDERS`/`New folder`/`All routines`/`Unfiled`、底部 "After creation, Paperclip takes you straight to trigger setup…"。以上均为既有存量 (pre-existing)，COOA-178 未引入，且属 `en` 兜底可读英文而非代码键。 | 非阻断 · 存量清理项 |
| OBS-2 | 高 | `packages/mcp-server` typecheck 失败 (`tools.ts:213/774`，`addIssueCommentSchema` 被改为 `z.preprocess` 后非 `ZodObject`)，导致 `pnpm -r typecheck` 非零退出。与 COOA-178 无关 (fix commit 未触碰 TS 源)。 | 独立缺陷 · 另立工单跟踪 |

首轮 F2~F5 (公司 36 blocked 伪阻断 / 大盘活动流重复 / 项目混入测试数据 / 墨斗 error 未自愈) 属**主线存量质量项**，非本单 G4 阻断范围，由主线 COOA-114 持续整改。

## 6. 决议

> **GO。** 首轮唯一阻断项 **F1 已闭环**：`/COOA/routines` 列表页、创建对话框、高级设置三处入口原始 i18n 键外泄 **0 处**，横向 12 页面无回归，机器门禁 (`check:ui-i18n` / `check:governance` / 守卫单测) 全绿。
>
> 百晓生 (DS) **撤销一票否决**，**G4 全栈验证与体验门禁判定通过**。遗留 OBS-1 (硬编码英文) 为存量清理项，不阻断 G4；OBS-2 (mcp-server typecheck) 为与本次修复无关的独立缺陷，另立工单。
>
> **放行路径**: G4 解除 → G5 发版投产门禁由 兑底渊 (PRE-SRE) 闭合 → 客户终验核销单进入签署态。

---

## 7. 证据独立性声明

本报告全部证据由百晓生 (DS) 以真实浏览器独立复走产生，未借用 FDSE 单测结论；F1 闭环以「源码字面量集 ∩ 语言包定义集」机器差集 + 运行时 DOM 原始键扫描双轨互证。
