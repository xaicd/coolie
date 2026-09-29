# wave140 — CMMI WBS 拆解 + 里程碑主线任务

- 日期: 2026-09-29
- 基线 commit: `4ec49e8b7048b284c82f917ffe45e5f1f7c9ca9e` (wave136 收尾)
- 状态: Proposed → 实现中

这是一个 **设计记录**。分节: 现状事实 / 决策 / 未决 / 验证方式。

---

## 1. 背景与需求 (boss 2026-09-28)

> coolie工坊系统中的任务，在项目初始化后，cmmi过程有个拆分wbs任务的过程，里程碑任务特别重要，主线任务。

现状 (盘点事实):

| 面 | 现状 | 出处 |
|---|---|---|
| 任务父子 | 有 `issues.parent_id` 自引用 + `request_depth` | `packages/db/src/schema/issues.ts:38` |
| WBS 层级编号 | **无** | — |
| 里程碑语义 | **无** (仅 `doc/TASKS.md` 目标模型里提过) | `packages/db/src/schema/issues.ts` |
| 项目初始化 | 上传文档 → 异步 enrichment 只补 描述 + 目标 | `server/src/services/project-document-enrichment.ts:264` |
| CMMI 门禁 | 6 个 `cmmi-*` 技能 + `cmmi-profile.json` 的 `gate_g1_spec`…`gate_g5_release` | `scripts/scaffold-project-cmmi-skills.mjs` |
| 数据模型 | `goals`/`project_goals`/`projects.goalId` 三级关联 | `packages/db/src/schema/projects.ts`, `goals.ts`, `project_goals.ts` |

**结论**: WBS 层级模型、里程碑主线语义、项目初始化自动产出 WBS —— 三者都不存在，需要新建；父子关系与 goals 关联可复用。

## 2. 决策

### 2.1 存储 —— 复用 defect 的「jsonb 元数据块」模式 (`9005_add_issue_defect.sql`)

`issues` 增 4 列、`projects` 增 1 列，全部 additive:

- `issues.wbs_code text` — 层级编号 (`1` / `1.1` / `1.1.2`)，排序与 rollup 的键
- `issues.wbs_type text` — `phase` / `work_package` / `task`
- `issues.is_milestone boolean NOT NULL DEFAULT false` — 主线标记 (「只看主线」筛选与主线视图读它)
- `issues.milestone jsonb` — 门禁/状态/计划+完成日期/判定人/判定证据/豁免
- `projects.wbs_draft jsonb` — 自动草稿 (待采纳)

理由: 与既有 `issues.defect` 同构；非空即标记；普通任务保持 NULL，无回溯、无重写。
`drizzle-kit generate` 在本 fork 上跑不动 (snapshot 冲突)，故手写 9000 段迁移。

### 2.2 门禁词汇表 —— 对齐仓库里真实可执行的 `cmmi-profile.json` 方案

brief 里写的是「G1-G4」，但仓库里真实可执行的是 **G1-G5** (`gate_g1_spec`…`gate_g5_release`，
`smmi-*` 技能的 DoD + 生成的 `check-*.mjs`)。本 wave 对齐 **G1-G5**，并在报告里标注这处与 brief 措辞的差异。

### 2.3 WBS 阶段模板 (6 阶段，阶段收口生成里程碑)

| # | 阶段 | 门禁 |
|---|---|---|
| 1 | 需求确认 | `gate_g1_spec` |
| 2 | 架构/设计 | `gate_g2_arch` |
| 3 | 详细设计 | (无 — 设计域的中间检查点) |
| 4 | 开发实现 | `gate_g3_compile` |
| 5 | 测试验收 | `gate_g4_eval` |
| 6 | 上线移交 | `gate_g5_release` |

### 2.4 「草案」不是「静默建任务」

生成物落到 `projects.wbs_draft`，由掌柜/项目负责人在 UI **一键采纳** 才物化成 issue。
幂等: 项目已有草稿、或已采纳过 (存在 `is_milestone` 任务) 时不再重建。

### 2.5 纯逻辑抽出为可单测模块 (无 I/O)

- `packages/shared/src/wbs.ts` — WBS 排序键、主线结构构建、门禁联动判定 (server / Web 共用)
- `server/src/services/wbs-draft.ts` — 文档 → WBS 草案 (纯函数，带真实样例)

### 2.6 门禁联动语义

某阶段的任务，若其**之前任一「带门禁阶段」的里程碑**未达成且未豁免 → 默认受阻 (`blocked`) 告警；
豁免需留痕 (`exempted` + `exemptionReason`)。

## 3. 未决 / 边界

- 生成是启发式 (无 LLM)，文档没给时间则 `plannedDate` 留空。
- 采纳后不自动给任务派活/排期 —— 只建结构。
- 门禁联动作用于「项目任务列表」视图；公司级任务列表只标「主线」徽章。

## 4. 验证方式

1. 真项目 (生产《产融…技术规范书》) 或等价的真项目 → 上传/复用 → 触发 WBS 草案 → 贴出结构
2. 采纳 → Web/App 主线视图 + 「只看主线」筛选截图
3. 门禁联动: 里程碑未达成 → 后续阶段任务标受阻 截图
4. 单测: `wbs.ts`、`wbs-draft.ts` 纯函数 + 路由/服务集成
5. 全量 `pnpm -r typecheck` + `pnpm test` + `pnpm build` + `pnpm check:token-gates`
