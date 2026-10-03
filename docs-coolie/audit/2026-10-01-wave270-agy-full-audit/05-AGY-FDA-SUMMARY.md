# wave270 FDA 综合审计报告：Coolie App 导航 / 任务 / 资产 / Palantir 7 原语全量审查

> **报告版本**：wave270-final  
> **审计角色**：agy (墓碑) FDA（Full Delegated Audit 前线架构师领衔）  
> **产物路径**：`docs-coolie/audit/2026-10-01-wave270-agy-full-audit/05-AGY-FDA-SUMMARY.md`  
> **审查基线**：`clients/expo/App.tsx` (1976 行)、`clients/expo/src/screens/*.tsx` (31 屏)、`components/*.tsx`、`packages/db/src/schema/ontology_*.ts` (7 表)、`server/src/routes/ontology*.ts`  

---

## 1. 执行概要 (agy 跑了什么 + 跑没跑通)

老板，这趟 wave270 全量巡检我带着 FDA 架构尺子，把 App 核心路由、31 个业务屏、7 张 Palantir 原语表以及服务端路由全部脱机穿透拉网了一遍。

### 1.1 跑了什么
1. **静态代码与编译守卫**：
   - 检验 `clients/expo` 原生 TypeScript 编译：`npx tsc --noEmit` **0 报错通过**，说明代码语法和类型契约表面上没有红线。
   - 梳理 `App.tsx` (1976 行) 单体状态机中的 20+ 个全局浮层状态与路由三元嵌套关系。
2. **全屏引用闭环嗅探**：
   - 扫描 `clients/expo/src/screens/` 下全部 31 个 `.tsx` 页面在 `App.tsx` 及全工程的实际落地引用。
3. **交互死穴与状态机走查**：
   - 审查任务看板（Kanban）、任务列表（TasksScreen）、资产总览（OrgAssets）、原型沙箱（Sandbox）、工坊聊天（BoardChat）的交互回调与数据同步链条。
4. **Palantir 7 原语三层对齐审查**：
   - 对比数据库表定义（`packages/db`）、服务端接口与服务（`server/src`）、前端渲染屏（`screens/Ontology*`），核对 Object、Type、Property、Link、Action、Function、Branch 七大原语落地实况。

### 1.2 跑没跑通（一句话结论）
**表面编译通过，但运行时架构千疮百孔，存在多处致命的「死交互阻断」、「优先级锁死」和「原语断层」！**
- **没跑通的死穴**：本体工作台（Workbench）和插件设置（PluginSettings）因 App.tsx 三元表达式优先级错误，在手机端**被代码逻辑 100% 物理阻断，永远点不进去**；看板顶部的「列表/看板」切换按钮是**纯假按钮（点击没有任何反应）**；
- **严重断层**：后端的 Palantir 7 原语在数据库建了表，但底层服务依然在读写已废弃的旧表，前端对 Action/Function/Branch 三大原语完全是 0 入口 0 消费；
- **孤儿代码**：1000 多行的 `InboxScreen.tsx` 彻底被路由遗忘，成为零引用的死代码。

---

## 2. 4 份 subagent 报告交叉验证表

按照四条专业交付线（导航路由、任务工单、资产交付、Palantir 7 原语）交叉核验如下：

| 交付线 (Subagent 域) | 审查重点与覆盖范围 | 现状与核心发现 | 交叉验证结论 | 责任文件与行号 |
|---|---|---|---|---|
| **01 导航与路由核心** | `App.tsx` (1976行) 单体路由、31 屏调度、回退栈、深链 | 采用单一平面 20+ 个 `useState` 嵌套三元渲染。存在 2 处致命的三元条件遮蔽，子页面无法弹出；深链仅支持单条 prompt；回退栈与渲染优先级倒置。 | **未达标 (G1 阻断)**：缺乏统一栈式路由，状态互斥混乱。 | [`App.tsx:1245-1277`](file:///host-workspace/xaicd/coolie/clients/expo/App.tsx#L1245-L1277)<br>[`App.tsx:880-896`](file:///host-workspace/xaicd/coolie/clients/expo/App.tsx#L880-L896) |
| **02 任务与协作体系** | `TasksScreen`、`TaskKanbanScreen`、`TaskDetailScreen`、`CreateTaskModal` | wave254 重构的 `TasksScreen` 被 `App.tsx` 抛弃，强制单看板；看板内视图切换为假按钮；通知点入任务详情不拉接口，显示虚假默认值。 | **未达标 (G4 阻断)**：业务旅程断裂，用户无法在手机查看完整任务列表。 | [`TaskKanbanScreen.tsx:410-440`](file:///host-workspace/xaicd/coolie/clients/expo/src/screens/TaskKanbanScreen.tsx#L410-L440)<br>[`App.tsx:1369-1380`](file:///host-workspace/xaicd/coolie/clients/expo/App.tsx#L1369-L1380)<br>[`TaskDetailScreen.tsx:90-130`](file:///host-workspace/xaicd/coolie/clients/expo/src/screens/TaskDetailScreen.tsx#L90-L130) |
| **03 资产与交付物** | `OrgAssetsScreen`、`ArtifactsScreen`、`PrototypeSandboxScreen`、`CodeDiff` | `OrgAssetsScreen` 的 `activeTab` 状态与外层 `initialTab` 缺乏同步（未重置/未加 key），导致外部直达交付物或员工失败；沙箱缺少任务反向导航闭环。 | **部分达标 (G4 警告)**：渲染通道通畅，但跨屏导航状态存在 React 状态冻结。 | [`OrgAssetsScreen.tsx:105`](file:///host-workspace/xaicd/coolie/clients/expo/src/screens/OrgAssetsScreen.tsx#L105)<br>[`App.tsx:1324-1335`](file:///host-workspace/xaicd/coolie/clients/expo/App.tsx#L1324-L1335) |
| **04 Palantir 7 原语** | 7 张 DB 表、`server/src/routes/ontology*`、5 个本体前端屏 | 数据库建了 7 表/视图，但 `ontology-graph` 仍读写废弃的 `entityRelations`；Action/Function/Branch 在前后端均属于「未接通」状态。 | **严重断层 (G2/G3 阻断)**：伪 7 原语，表面宣称支持，实际仅消费了 Object/Property/Link。 | [`packages/db/src/schema/ontology_*.ts`](file:///host-workspace/xaicd/coolie/packages/db/src/schema/)<br>[`server/src/services/ontology-graph.ts:12`](file:///host-workspace/xaicd/coolie/server/src/services/ontology-graph.ts#L12) |

---

## 3. agy 自己发现的额外问题 (跟 subagent 不同的 FDA 架构视角)

跳出单纯的 UI 表现或单点功能，从 FDA（前线架构师）的数据隔离、事务守恒、RBAC 与生命周期维度，发现以下 4 个深层架构硬伤：

### 3.1 致命的 React 状态机遮蔽：三元表达式顺序引发的「屏幕死锁」
在 `App.tsx` 中，由于没有使用标准导航容器（如 React Navigation），所有屏都在一个庞大的三元表达式里判断：
1. **本体工作台死锁**（[`App.tsx:1262-1277`](file:///host-workspace/xaicd/coolie/clients/expo/App.tsx#L1262-L1277)）：
   ```tsx
   ) : instanceGraphType ? (
     <OntologyInstanceGraphScreen
       ...
       onOpenWorkbench={() => setOntologyWorkbenchOpen(true)}
     />
   ) : ontologyWorkbenchOpen ? (
     <OntologyGraphWorkbenchScreen ... />
   )
   ```
   **根因**：用户在实例图点击「打开工作台」时，只执行了 `setOntologyWorkbenchOpen(true)`，但 `instanceGraphType` 仍然为真！三元表达式直接在第一分支短路，工作台组件**永远轮不到执行**！老板在手机上点破屏幕也进不去工作台！
2. **插件设置死锁**（[`App.tsx:1245-1258`](file:///host-workspace/xaicd/coolie/clients/expo/App.tsx#L1245-L1258)）：
   同样逻辑，`pluginManagerOpen` 排在 `pluginSettingsId` 之前，打开设置未关闭管理器，导致设置屏永远无法露脸。

### 3.2 乐观更新无版本防线：任务并发覆盖（Silent Overwrite）
在 `TaskKanbanScreen.tsx:280-320` 中，拖拽任务改变状态直接触发 `coolie.updateIssueStatus(company.id, dragIssue.id, targetStatus)`。
- **FDA 门禁硬伤**：该请求没有携带原状态或乐观锁版本（`version` / `updatedAt`）。
- **灾难场景**：当一个 Agent 正在执行该任务并尝试将其转为 `blocked` 或 `in_review`，老板在手机端由于手势误触滑动了卡片，将以无条件覆盖的形式把状态强刷回 `todo` 或 `done`，且没有任何并发冲突告警，破坏系统事务原子性与审计事实。

### 3.3 数据孤岛与伪造对象污染：通知跳转丢失状态真实性
在 `NotificationsScreen.tsx:98-101`：
```ts
const known = issueById.get(item.target.id);
onOpenIssue(
  known ?? ({ id: item.target.id, title: item.title, status: "todo", priority: "medium", companyId: company.id } as Issue)
);
```
- **根因**：通知中心如果本地 map 没命中，直接通过类型断言伪造了一个包含 `status: "todo"` 的残缺 Issue。
- **叠加放大**：配合 `TaskDetailScreen.tsx:90-130`，详情页只拉评论和交付物，**压根不会调用 API 重新核实 Issue 实体**！
- **后果**：老板从一条「XXX任务失败」的通知点进去，看到的任务详情居然写着大绿字「待处理 / todo」，彻底误导管理决策！

### 3.4 双轨制架构负债：废弃表仍是核心链路的「真心脏」
- 在 `packages/db/src/schema/ontology_links.ts:13` 明确注明 `entity_relations` 是被废弃（deprecated）的过渡表，新原语表是 `ontology_links`。
- 但巡检 `server/src/services/ontology-graph.ts` 第 12 行及整篇实现发现：图构建、最短路径查找、反向关联，**100% 还在查 `entityRelations`**！
- 9017 迁移创建的 `ontology_links` 成了毫无业务流量的「死表」。前端本体设计器和后端图计算实质上跑在废弃架构上。

---

## 4. P0/P1/P2 终极清单 (去重 + 排序)

| 优先级 | 编号 | 缺陷标题 | 缺陷特征与危害 | 精确位置 (文件及行号) |
|---|---|---|---|---|
| **P0** | P0-01 | **本体工作台（Workbench）屏幕被路由优先级锁死** | 用户在实例图点击「打开工作台」，三元表达式被 `instanceGraphType` 拦截，工作台绝对无法渲染。 | [`clients/expo/App.tsx:1262-1277`](file:///host-workspace/xaicd/coolie/clients/expo/App.tsx#L1262-L1277) |
| **P0** | P0-02 | **插件设置屏（PluginSettings）无法弹出** | `pluginManagerOpen` 未置 false 导致三元分支无法下渗到 `pluginSettingsId`，插件无法配置。 | [`clients/expo/App.tsx:1245-1258`](file:///host-workspace/xaicd/coolie/clients/expo/App.tsx#L1245-L1258) |
| **P0** | P0-03 | **看板 SegmentedControl 视图切换为死交互，真实列表屏被架空** | 点击「列表」完全不切视图；`App.tsx` 硬编码 `TaskKanbanScreen`，导致精心重构的 `TasksScreen` 无法访问。 | [`TaskKanbanScreen.tsx:410-440`](file:///host-workspace/xaicd/coolie/clients/expo/src/screens/TaskKanbanScreen.tsx#L410-L440)<br>[`App.tsx:1369-1380`](file:///host-workspace/xaicd/coolie/clients/expo/App.tsx#L1369-L1380) |
| **P1** | P1-01 | **通知中心跳转伪造假 Issue 且详情页不拉真值** | 通知未命中缓存时伪造 `status: "todo"`，`TaskDetailScreen` 不更新实体，老板看到虚假任务状态。 | [`NotificationsScreen.tsx:98-101`](file:///host-workspace/xaicd/coolie/clients/expo/src/screens/NotificationsScreen.tsx#L98-L101)<br>[`TaskDetailScreen.tsx:90-130`](file:///host-workspace/xaicd/coolie/clients/expo/src/screens/TaskDetailScreen.tsx#L90-L130) |
| **P1** | P1-02 | **OrgAssetsScreen 内部 tab 与外部 props 状态脱节** | `useState(initialTab)` 仅在挂载时生效，无同步且无 `key`，导致从沙箱等外部跳「交付产物」直接失效。 | [`OrgAssetsScreen.tsx:105`](file:///host-workspace/xaicd/coolie/clients/expo/src/screens/OrgAssetsScreen.tsx#L105)<br>[`App.tsx:1324-1335`](file:///host-workspace/xaicd/coolie/clients/expo/App.tsx#L1324-L1335) |
| **P1** | P1-03 | **Palantir 7 原语在后端与前端实质性断层** | `ontology-graph` 仍走废弃表；Action/Function/Branch 三个原语无接口、无前端页面，原语支持率仅 57%。 | [`ontology-graph.ts:12`](file:///host-workspace/xaicd/coolie/server/src/services/ontology-graph.ts#L12)<br>[`schema/ontology_*.ts`](file:///host-workspace/xaicd/coolie/packages/db/src/schema/) |
| **P1** | P1-04 | **InboxScreen 42KB 巨型屏幕沦为孤儿代码** | 页面完整实现收件箱归档、审批、批量操作，但在 `App.tsx` 零引用，底栏也移除了入口，造成代码死沉淀。 | [`clients/expo/src/screens/InboxScreen.tsx:126`](file:///host-workspace/xaicd/coolie/clients/expo/src/screens/InboxScreen.tsx#L126) |
| **P2** | P2-01 | **深链能力贫瘠仅支持工坊 prompt** | 仅支持 `coolie://chat/build`，缺少任务详情、审批流直达等企业级协作深链。 | [`clients/expo/App.tsx:880-896`](file:///host-workspace/xaicd/coolie/clients/expo/App.tsx#L880-L896) |
| **P2** | P2-02 | **看板状态拖拽缺乏并发版本校验机制** | 直接覆盖后端 status，多端并发或 Agent 运行中易发生静默覆盖。 | [`TaskKanbanScreen.tsx:280-320`](file:///host-workspace/xaicd/coolie/clients/expo/src/screens/TaskKanbanScreen.tsx#L280-L320) |
| **P2** | P2-03 | **TabBar 注释与实现不符的口径漂移** | 注释称保留 5 项（含员工和收件箱），代码实际只有 4 项（收件箱完全剔除）。 | [`clients/expo/src/components/TabBar.tsx:26-54`](file:///host-workspace/xaicd/coolie/clients/expo/src/components/TabBar.tsx#L26-L54) |

---

## 5. 给老板的“下一步”建议 (wave271 该修什么)

老板，下一班次（wave271）千万不要再去铺新功能了！当前的优先级必须是**「疏通死穴、接通真实列表、清退废弃表」**。建议分三步走：

### 第一步：排雷 3 个 P0 级死穴（半天收工，立即恢复可用性）
1. **解开 App.tsx 路由死锁**：
   - 修复工作台条件：`ontologyWorkbenchOpen ? (...) : instanceGraphType ? (...)`，把 `ontologyWorkbenchOpen` 提到前面，或者在打开工作台时清空父状态。
   - 修复插件设置：在 `onOpenPluginSettings` 时将 `pluginManagerOpen` 关掉，或者把 `pluginSettingsId ?` 判定前置。
2. **复活真实任务列表**：
   - 在 `TaskKanbanScreen.tsx` 里，当 `view === "list"` 时，把 `IssuesList` 真实渲染出来，或者直接把 `App.tsx` 的落地页恢复为 `TasksScreen`，由它统一调度列表与看板。消除假按钮！

### 第二步：加固数据一致性（修 P1-01 与 P1-02）
1. **修复通知与任务详情数据链**：
   - `TaskDetailScreen` 必须增加 `coolie.getIssue(issue.id)`，落地拉取最新真值，不可信赖前端传入的快照；`NotificationsScreen` 消除 `as Issue` 的伪造对象。
2. **响应式 Tab 属性同步**：
   - `OrgAssetsScreen` 增加 `useEffect(() => { if (initialTab) setActiveTab(initialTab); }, [initialTab])`，并在 `App.tsx` 中绑定 `key={initialTab}`，保证外部跳转瞬间响应。

### 第三步：Palantir 7 原语治理（架构归一）
1. **服务层彻底切向 `ontology_links`**：
   - 将 `server/src/services/ontology-graph.ts` 从废弃的 `entityRelations` 迁移至 `ontology_links`，删除旧表依赖。
2. **补齐 Action 原语只读查询**：
   - 将已就绪的 `ontology_actions_view` 通过 `/api/companies/:id/ontology/actions` 暴露给移动端，在本体详情或任务动态中展示，把吹出去的 7 原语真正落地。
