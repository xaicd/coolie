# Feature: 主线/支线/临时三级任务收敛体系与审计治理闭环规格书

> 日期：2026-09-30 · 基线 commit：`899b45ea56` · 状态：已确立 (Draft / Ready for Implementation)

---

## 1. 背景与核心问题

在本次对话的全量代码审计与架构探讨中，梳理并收敛出当前系统亟待标准化的两层核心诉求：

1. **工程治理层缺陷（Audit 闭环）**：
   - **Fork Surface 漂移**：`wave154`/`wave155` 产生的 19 个上游改动文件未纳管，CI 阻断。
   - **Onboarding 引导重定向 UX 竞态**：`CompanyRootRedirect` 在异步查询返回前过早执行跳转，导致新企业首次登录永久绕过 `/getting-started`。
   - **RBAC 鉴权缺位**：Onboarding 变异接口缺少 `assertBoard(req)`，Backfill 缺少 `logActivity` 审计留痕。
2. **任务模型与可视化呈现层（用户核心洞察）**：
   - **概念混淆与区分度不足**：当前主任务列表（`IssuesList`）能看 `[主线]` 里程碑，但无法一眼识别哪些是 `[Spec]` 驱动任务。
   - **任务层级缺乏收敛原则**：日常开发中存在大量“支线任务”和“临时排查/调试任务”；缺乏明确的收敛纪律，导致大量无源“孤儿任务”淹没主线大盘，工时和进度无法向上穿透统计。
   - **主线-支线-临时树形收敛架构**：明确 **“主线是树干，支线是树枝，临时任务是树叶”**。任何支线与临时任务，底层都必须归属于某一条主线任务（`parentId` 挂接），支持折叠、下钻与进度穿透。

---

## 2. 核心角色故事 (User Stories)

- **作为 管理员 / PM (掌柜)**：
  - 我想在任务列表清晰看到以“主线里程碑”为树干的大盘结构，支线与临时任务默认收拢在主线下，不淹没核心交付视角。
  - 我想通过点击某条主线，一键“聚焦下钻”只看该主线及其派生的所有子任务。
- **作为 研发工程师 / Agent 匠人**：
  - 当我创建一个临时修复或功能支线任务时，系统应当提示或默认挂载在“当前正在进行的主线”下，确保每一次代码改动都有明确归宿。
  - 当我在主列表浏览时，能通过徽章一眼识别任务性质（`[主线]` / `[支线]` / `[临时]` / `[Spec · 任务]`）。
- **作为 质量与合规架构师 (FDA / Core SWE)**：
  - 确保 Onboarding 仅允许 Board 角色写入，Backfill 操作具备审计追踪；
  - 保证上游变更 100% 纳管在 `fork-surface.json` 中，CI 门禁 0 报警。

---

## 3. 任务分级与分类模型 (Domain Model)

任务基于统一的 [`issues`](../../packages/db/src/schema/issues.ts) 实体承载，通过正交字段组合定义三级四类任务：

```
┌────────────────────────────────────────────────────────────────────────┐
│                        【主线任务 (Mainline / Milestone)】              │
│       - is_milestone: true                                             │
│       - 对应 CMMI 阶段收口门禁 (G1~G5) 或企业核心版本交付目标           │
│       - 标识：[主线 · G1~G5]                                           │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ parentId 归集
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
┌────────────────────────────────────┐ ┌────────────────────────────────────┐
│      【支线任务 (Branch Track)】     │ │     【临时任务 (Ad-hoc / Spike)】    │
│ - parentId: 指向主线任务             │ │ - parentId: 指向主线或支线任务     │
│ - 特性开发包、模块开发、UI 配套     │ │ - 现场排查、临时调研、极速 Bug 修复 │
│ - 标识：[支线]                     │ │ - 标识：[临时]                      │
└─────────────────┬──────────────────┘ └────────────────────────────────────┘
                  │ 研发落地层可挂载 Spec
                  ▼
┌────────────────────────────────────┐
│        【SPEC 开发任务 (Spec)】     │
│ - spec_kind: requirement/design/task│
│ - 严格三步链与文件修改白名单        │
│ - 标识：[Spec · 任务/需求/设计]    │
└────────────────────────────────────┘
```

---

## 4. 验收标准 (Acceptance Criteria / EARS 规范)

### 4.1 任务列表与徽标可视化 (IssuesList UI)
- **WHEN** 任务属于主线里程碑（`isMilestone === true`），系统 **SHALL** 渲染高亮微标 `[主线]`，悬浮提示对应的门禁类型（如 `里程碑 · gate_g3_compile`）。
- **WHEN** 任务挂载了 Spec 规范（`specKind !== null`），系统 **SHALL** 在标题旁渲染专属徽标 `[Spec · 任务/需求/设计]`。
- **WHEN** 任务具有父节点（`parentId !== null`），系统 **SHALL** 在树状导轨（`treeGuides`）下缩进展示，并根据父任务折叠状态进行展开/收起。
- **WHEN** 用户点击主线任务的“聚焦此主线”快捷操作，系统 **SHALL** 过滤任务列表，仅保留该主线及其全量后代子任务。

### 4.2 临时与支线任务挂载纪律 (Task Creation & Defense)
- **WHEN** 用户或 Agent 在新建任务弹窗（`NewIssueDialog`）中创建任务且未显式指定 `parentId` 时，系统 **SHALL** 智能探测并推荐当前项目活跃的主线任务供一键关联，严禁隐式制造游离任务。
- **WHEN** 统计主线进度时，系统 **SHALL** 穿透聚合其名下所有支线与临时任务的完成状态（`status === 'done'`）。

### 4.3 审计治理闭环修复 (Audit Remediation)
- **WHILE** `CompanyRootRedirect` 正在异步拉取企业的 Onboarding 状态 (`isLoading === true`)，系统 **SHALL** 渲染 `<PaperclipLoading />` 加载组件，**SHALL NOT** 触发提前跳转。
- **WHEN** 企业 Onboarding 状态加载完成且 `onboardedStep === null`，系统 **SHALL** 确定性跳转至 `/:issuePrefix/getting-started`。
- **WHEN** 非 Board 操作员（例如使用普通 Agent API Key）调用 `POST /api/companies/:companyId/onboarding/step` 或 `/complete`，系统 **SHALL** 拦截并返回 `403 Forbidden`。
- **WHEN** Board 操作员触发 `POST /api/companies/:companyId/ontology/backfill`，系统 **SHALL** 写入一条 `action: "ontology.backfill"` 的审计日志。
- **WHEN** 运行 `node scripts/check-fork-surface.mjs --range=946c9fd7f3..HEAD`，系统 **SHALL** 0 报错通过，19 个 wave154/155 文件全部登记且在预算内。

---

## 5. 文件范围（白名单）

```
scripts/fork-surface.json                            # 登记 19 个上游改动文件及行数预算
ui/src/App.tsx                                       # 修复 CompanyRootRedirect 竞态
ui/src/components/IssuesList.tsx                     # 补充 Spec 徽标与主线下钻入口
ui/src/components/NewIssueDialog.tsx                 # 强化新建任务关联父主线推荐
server/src/routes/onboarding.ts                      # 补充 assertBoard 鉴权
server/src/routes/ontology-graph.ts                  # 补充 assertBoard 与 logActivity 审计
server/src/__tests__/onboarding-routes.test.ts       # 补充 403 权限拦截单测
```

---

## 6. Palantir 五角色分工与防御矩阵

| 角色 | 本 Spec 中的核心职责 | 必须提交的交付证据 |
| :--- | :--- | :--- |
| **FDA (前线架构师)** | 划定“主线-支线-临时”树形领域边界；确立 Onboarding 接口的 Board 操作员权限边界。 | 接口 403 鉴权拦截代码；领域实体无跨租户泄漏证据。 |
| **Core SWE (核心研发)** | 保持 TypeScript 类型 0 报错；补全 `fork-surface.json` 预算；维护共享 Zod 契约。 | `check-fork-surface.mjs` 退出码 0；`pnpm -r typecheck` 全绿。 |
| **PRE-SRE (可靠性)** | 环境一致性守卫；容器执行环境修复；回滚方案与发布后拨测。 | 生产迁移幂等回放报告；环境握手一致性证明。 |
| **FDSE (前线部署全栈)** | 交付第一责任人：修复 `App.tsx` 加载态竞态；在 `IssuesList.tsx` 中补全 Spec 徽标与树形展开折叠；编写单元测试。 | `IssuesList` 徽标渲染快照；`CompanyRootRedirect` 加载态测试用例。 |
| **DS (部署战略专家)** | 业务用户视角走查：以新注册企业身份走通 3 步 Onboarding；以项目负责人身份走查主线折叠与下钻体验。 | 真实浏览器端到端走查无闪烁截图；死交互与假按钮排查证据。 |

---

## 7. 实施计划 (Task Breakdown)

- **Task 1 (Audit 闭环)**:
  - 更新 `scripts/fork-surface.json` 登记 19 个文件。
  - 在 `server/src/routes/onboarding.ts` 与 `ontology-graph.ts` 注入 `assertBoard` 与 `logActivity`。
  - 修复 `ui/src/App.tsx` 中的 `CompanyRootRedirect` 加载竞态。
- **Task 2 (列表可视化与层级收敛)**:
  - 在 `ui/src/components/IssuesList.tsx` 的行徽章区追加 `specKind` 渲染（`[Spec · 任务]` 等）。
  - 在主线任务行右侧增加快捷操作：“下钻聚焦此主线”（联动现有的 `parentId` 筛选器）。
- **Task 3 (全栈验证与验收)**:
  - 跑通 `check-fork-surface.mjs` 与 `check-token-gates.mjs`。
  - 验证新租户进入 `/getting-started` 稳定重定向。
