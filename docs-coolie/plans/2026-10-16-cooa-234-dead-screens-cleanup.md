# COOA-234 · 移动端 3 个结构性死屏/死导入清理

- 工单: [COOA-234](/COOA/issues/COOA-234)
- 来源: [COOA-228](/COOA/issues/COOA-228) §二 真机复测发现（13 屏复测矩阵）
- 日期: 2026-10-16
- 执行人: Hermes (PM) · run `3b02c981-18d8-4a7a-b20b-3c2c8551cea7`
- 状态: ready for PM/前端裁决

## 二、证据（来自 COOA-228 §二，stat 真机取证）

| 屏 | 类型 | 真机状态 | 取证 |
| :-- | :-- | :-- | :-- |
| `PipelinesScreen` (`src/screens/PipelinesScreen.tsx`, 216 行) | 只读列表 | ❌ **不可达** | 全仓 0 个 `setPipelinesOpen(true)` 调用点 |
| `PlansScreen` (`src/screens/PlansScreen.tsx`, 156 行) | 列 `Plan: xxx` 任务 | ❌ **不可达** | 全仓 0 个 `setPlansOpen(true)` 调用点 |
| `TasksScreen` (`src/screens/TasksScreen.tsx`, 243 行) | 列表+看板 | ❌ **死导入** | `App.tsx:78` import，全仓 0 个渲染点 |

**附带死代码**：
- `BuildModeModal` (`src/components/BuildModeModal.tsx`)：0 个调用方（只剩自身 export）
- `coolie.listPipelines / listPlanIssues` (`src/coolie.ts:691,703`)：仅上述两屏使用
- `PipelineListRow` 类型 (`src/coolie.ts:406`)：仅上述两屏 + coolie.ts 自身

## 三、根因（git 历史回溯）

- **wave20 (Sep 22, `8e9a8373b`)**：在 TasksScreen 顶部加了「编排按钮组」3 个按钮 `[🔨 Build 5 步链][🛤️ Pipeline][📋 Plan]`，并新建 `PipelinesScreen / PlansScreen / BuildModeModal`。
- **wave213**：任务 Tab 迁移到 `TaskKanbanScreen`（自治的看板+分组+列表中枢），**未把 3 按钮组迁过去**。
- **TasksScreen 自报 (line 19)**：「wave213 后实际由 TaskKanbanScreen 接管；本屏保留以便 web 团队后续复用同一份筛选/视图组件」 —— TasksScreen 的子组件库 (`TasksScreenHeader / Filters / ViewSwitch / IssuesList`) 仍在被 TaskKanbanScreen 复用，所以 TasksScreen.tsx 文件本身是有子组件库载体价值的，但 `export function TasksScreen({...})` 这个屏本体（外层组合器）已经无人用。

## 四、能力与替代路径

| 能力 | 原 mobile 屏 | 现在的真机落地路径 | 替代方案是否够 |
| :-- | :-- | :-- | :-- |
| 列 Pipeline（Active/Draft/Archived） | `PipelinesScreen` | 工坊 `BoardChatScreen.onOpenPipeline` (line 1256) → `Linking.openURL(/pipelines/:id)` 直开 Web 容器 | ✅ 够（Web 端编辑器完整，mobile 不重发明） |
| 列 Plan 任务 | `PlansScreen` | 任务 Tab 状态筛选里 type=plan 即可见 | ✅ 够 |
| Build 5 步链 | `BuildModeModal` | 工坊输入 `build xxx` 触发（`BoardChatScreen.commandRouter`） | ✅ 够（`BuildProgressCard` 已在工坊对话里挂） |
| 任务 Tab | `TasksScreen` | `TaskKanbanScreen` 已接管 | ✅ 够（现役即此） |
| 项目中心 | `ProjectsScreen`（保留） | OrgAssetsScreen 的 projects sub-tab 仍路由到 `ProjectsScreen` 本体 | ✅ 够（不要动 `ProjectsScreen` 本身，只删 App.tsx 里 `setProjectsOpen(true)` 死入口） |

## 五、推荐方案：删残码（Hermes PM 拍）

**理由**：
1. 3 个 mobile 屏本体都已被 wave20 后的新架构**自然淘汰**（Pipeline 跳 Web / Plan 走任务 Tab / 任务 Tab 走 TaskKanbanScreen）。
2. TasksScreen 自报「保留以便复用子组件库」——保留的是子组件，不是 TasksScreen 屏本体；屏本体删整后子组件库无损。
3. 删除后 App.tsx 少 5 个 useState + 3 个整屏分支 + 3 段死导入 = 真机结线 + 启动更快 + IDE 索引更小。
4. `BuildModeModal` 完全无调用方 → 删。
5. `listPipelines / listPlanIssues / PipelineListRow` 在 mobile 无其它消费者 → 删；server 端路由不动（h5 镜像与 Web 还在用）。

## 六、执行清单（待 PM 确认后落地）

### 6.1 删除文件（6 个）
1. `clients/expo/src/screens/TasksScreen.tsx`
2. `clients/expo/src/screens/PipelinesScreen.tsx`
3. `clients/expo/src/screens/PlansScreen.tsx`
4. `clients/expo/src/components/BuildModeModal.tsx`
5. `clients/h5/src/screens/PipelinesScreen.tsx`（h5 镜像同上）
6. `clients/h5/src/screens/PlansScreen.tsx`（h5 镜像同上）
7. `clients/h5/src/screens/TasksScreen.tsx`（如果与 expo 同为死屏，确认后删）

### 6.2 修剪 `clients/expo/App.tsx`
- L78: 删 `import { TasksScreen } from "./src/screens/TasksScreen";`
- L81-82: 删 `import { PipelinesScreen }` 与 `import { PlansScreen }`
- L699-701: 删 3 个 `useState`（`pipelinesOpen` / `plansOpen` / `projectsOpen`）
- L883-908 `swipeBack()`: 删 `if (pipelinesOpen) ...` / `if (plansOpen) ...` / `if (projectsOpen) ...` 3 行
- L981-998 `hasSubHeader`: 删 `pipelinesOpen || plansOpen || projectsOpen ||`
- L1118-1151: 删 3 个整段 `pipelinesOpen ? <PipelinesScreen ... /> : ...` / plansOpen 同 / projectsOpen 同
- L1362-1364: 删 TabBar 切换重置里的 3 个 `setXxxOpen(false)`
- L132 的注释保留（旧描述已完成使命，新注释清理在 6.3）

### 6.3 修剪 `clients/expo/src/coolie.ts`
- L691-707 附近：删 `listPipelines` 与 `listPlanIssues` 方法
- L406 附近：删 `PipelineListRow` 接口

### 6.4 验证（h6）
- `pnpm -C clients/expo tsc --noEmit` （expo typecheck）
- `pnpm -C clients expo` 启动（Metro bundler 不报缺失）
- grep 复核：全仓 0 个 `setPipelinesOpen|setPlansOpen|setProjectsOpen|PipelinesScreen|PlansScreen|TasksScreen`（保留 ProjectsScreen 子组件与 OrgAssetsScreen 内的项目子组件）
- 真机回归：任务 Tab + 资产 tab projects sub-tab 两张验证

### 6.5 提交
- 单 commit `fix(expo): wave394 删除 3 个结构性死屏/死导入 (COOA-234)`
- commit message 内嵌 COOA-234 与本计划 doc 路径

## 七、不做的事（明确边界）
- 不删 `BuildProgressCard`（BoardChatScreen 真用）
- 不删 `FleetPipelineStrip`（BoardChatScreen 真用）
- 不删 `ProjectsScreen` 本体（OrgAssetsScreen 真用）
- 不删 server 端 `/api/companies/:id/pipelines` 路由（h5 与 Web 还在用）
- 不动 COOA-228 在跑的真机复测 run（run 3ce21006-...）持有的 BoardChatScreen 工作树改动

## 八、次生项（低优先级，COOA-234 不阻塞）
- 13 屏中 12 屏 0 testID → 建议另立子工单补 `testID=[Screen]__[Component]__[Action]`（low）
- AppBar 入口 vs 死 state 关系：删 dead state 后再做一次真机路径勘察，确保「汇览 → …」5 槽位流没有任何「按了没反应」假按钮

## 九、待 PM 拍板
- 选 ①删除残码（推荐，详见 §五）
- 或 ②补回入口（在 TaskKanbanScreen 顶部加 3 按钮 → 启 dead state）
- 或 ③只删 TasksScreen 死导入，保留 PipelinesScreen/PlansScreen 留作未来入口（不推荐：仍未解决「入口在哪」）