# 架构治理去伪存真与业务本体工业级重构规格说明书 (Spec)
> **文档版本**: v1.0.0 (CMMI-L5 / EARS 规范)  
> **创建日期**: 2026-10-04  
> **编制角色**: Hermes (顶级 PMO) / 墨斗 (FDA 前线架构师) / 铁匠 (Core SWE)  
> **关联依据**: 老板主线对话意志、`docs-coolie/specs/2026-10-02-g1-g5-evidence-ledger.md`、`docs-coolie/TERMINOLOGY.md`、`doc/SPEC-implementation.md`

---

## 1. 战略背景与核心痛点审计

在 2026-10-04 的深度审计与老板直面评审中，发现当前的两个核心 Web 插件（`plugin-governance` 和 `plugin-ontology`）存在严重的脱离实战与体验硬伤，必须从“概念自嗨”全面切换到“真实场景落地”：

### 1.1 架构治理（Governance）的三大致命硬伤
1. **假大空与纯假数据**：
   - 当前 `GovernancePage.tsx` 写死了 `projectId = "proj_mall"` 和 `企业级核心商城与微服务中台`；
   - G1-G5 门禁、5+2 黄金文档、SPC 度量图、活态拓扑全部基于前端硬编码的 `useState([ ... ])` 假数据，无真实数据持久化与回读。
2. **与上游原生控制面冲突割裂**：
   - Paperclip 原生已具备严谨的审批流（`approvals`）、决策流（`decisions`）、审计日志（`activity_log`）和公司边界；
   - 现治理插件自造了一套脱节的“会签审批弹窗”，既不走上游审批流，也没有与系统的任务（Issues）关联，造成概念混淆与功能冲突。
3. **脱离老板初始的对话诉求**：
   - 老板的真实初心是：**政企与运营商级双轨交付保障**，在研发交付全链路中，能对关键架构边界（DAR 前置架构决策、单向依赖、微服务实体边界）进行真正可核验的质量卡口（G1 需求、G2 方案、G3 契约、G4 验收、G5 投产），并在上游审批中沉淀真实双人复核证据，绝非假前端 Mock。

### 1.2 业务本体（Ontology）的两大工业级痛点
1. **单域/孤岛缺陷与缺乏自生机制**：
   - 业务本体当前割裂在静态模型中，无法灵活支撑**多项目（Projects）、多本体域（Domains）**；
   - 缺乏**默认本体域自生（Auto-bootstrap）**：平台初始化或新项目进厂时，应当基于公司的组织架构、数字员工（六大匠人）、资产（Repos/Docs）、工单流水线自动自生出底层默认本体域，让用户无需手动从零开始画图。
2. **海量关系图谱“全量加载炸裂卡死”性能灾难**：
   - 之前 2000 多条关系被一次性无节制丢给前端 ReactFlow / Webview，导致浏览器 DOM 内存溢出、主线程无响应卡死；
   - 缺乏图谱工业级的大图渲染防御策略：必须具备**视域分级（LOD）**、**度数过滤（Degree Thresholding）**、**核心节点局部扩散（On-demand Sub-graph Expansion）** 与 **最大安全展示上限**。

---

## 2. 顶层设计原则 (Guiding Principles)

1. **真实数据唯一信源 (Single Source of Truth)**：
   - 架构治理模块彻底清除所有硬编码静态数组。所有数据必须来源于系统真实数据库（Projects、Issues、Approvals、Activity Log）以及 `evidence-ledger` 真实账本。
2. **深度并轨原生控制面 (Upstream Parity & Integration)**：
   - 门禁的“双人会签/特批放行”直接复用并扩展 Paperclip 原生 `approvals`，落库到 `approvals` 表，触发真实通知与审计。
3. **本体多项目多域隔离与默认域自生 (Multi-Domain & Auto-Bootstrapping)**：
   - 数据模型全面支持 `companyId` + `projectId` + `domainId`；
   - 提供系统级自生引擎（Bootstrap Provisioner），自动将系统元数据投射为默认业务本体。
4. **工业级图谱渲染防爆 (Safe & Progressive Graph Exploration)**：
   - 默认视图只展示“高中心度核心骨架（Core Backbone）”（节点数 ≤ 50，关系度数 ≥ 设定阈值）；
   - 支持双击节点向外扩散 N 阶邻居（Lazy Expansion），杜绝全量 2000+ 关系瞬时渲染。

---

## 3. 详细功能规格与 EARS 验收标准

### 3.1 架构治理（Governance）重构

#### [REQ-GOV-001] 真实上下文与项目联动
- **WHEN** 用户进入「架构与质量治理」页面时；
- **THEN** 系统 SHALL 自动读取当前 Company 下的真实 Projects 列表，并支持用户下拉切换当前审查项目；
- **IF** 未指定项目或项目为空，系统 SHALL 优雅展示当前公司的全局治理态势，不得写死 `"proj_mall"` 或 mock 名称。

#### [REQ-GOV-002] G1-G5 门禁与真实证据账本联动
- **WHEN** 治理页面展示 G1（需求）、G2（方案）、G3（契约）、G4（验收）、G5（投产）五大门禁时；
- **THEN** 系统 SHALL 调取后端 `/api/companies/:companyId/governance/gates?projectId=...` 接口，动态读取真实关联的任务（Issues）、代码提交（Commits）及本地/数据库证据账本（`evidence-ledger`）；
- **THEN** 只有当对应角色（DS/FDA/Core SWE/FDSE/PRE-SRE）提交了真实证据或对应工单关闭时，门禁状态才显示为 `passed`；未完成时显示 `blocked` 或 `in-progress`。

#### [REQ-GOV-003] 与上游原生 Approvals 审批流并轨
- **WHEN** 某个门禁被阻断或需要高级别双人会签特批时；
- **THEN** 用户点击「发起特批/会签」按钮，系统 SHALL 调用 Paperclip 原生 `POST /api/companies/:companyId/approvals` 创建一个类型为 `governance_gate_waiver` 的真实待审批单；
- **THEN** 审批单必须在 Paperclip 原生「审批中心」与治理页面双向可见，审批通过后，触发真实 `activity_log` 审计，并在治理页面实时刷新门禁放行状态。

#### [REQ-GOV-004] 真实架构巡检与 API 契约穿透
- **WHEN** 用户切换至「API 契约中心」或「活态拓扑」时；
- **THEN** 系统 SHALL 基于真实代码仓库中的 OpenAPI / Swagger / DDL 扫描结果或数据库存储的契约列表展示，禁止前端手写假微服务节点。

---

### 3.2 业务本体（Ontology）重构

#### [REQ-ONT-001] 多项目与多本体域支持
- **WHEN** 用户访问业务本体时；
- **THEN** 系统 SHALL 允许用户在指定的项目内创建、管理多个本体域（Ontology Domains，如“电商核心域”、“物流履约域”、“客户风控域”）；
- **THEN** 每个域具备独立的数据隔离范围与生命周期状态（活跃中/治理中/已熔断）。

#### [REQ-ONT-002] 默认本体域自动自生 (Auto-Bootstrapping)
- **WHEN** 一个新公司或新项目初始化，或者用户首次打开本体系统时；
- **IF** 当前项目尚无任何本体域；
- **THEN** 系统自生服务（Bootstrap Engine）SHALL 自动提取当前公司的组织架构、数字员工（如 6 大工种）、资产代码库、任务流水线等元数据，自动生成一个名为「平台核心基础设施域（Core Platform Domain）」的默认本体域，并生成基础 Entity 与 Relationship；
- **THEN** 用户进入页面即能看到生动、真实的系统自身本体，无需冷启动。

#### [REQ-ONT-003] 2000+ 海量关系防爆图谱渲染策略
- **WHEN** 某个本体域内包含海量实体（>100）或海量关系（>2000）时；
- **THEN** 前端图谱加载器 SHALL 启动「大图安全防御机制」：
  1. **骨架采样（Backbone Sampling）**：首屏默认仅加载核心骨干节点（PageRank / 度数前 30-50 个核心实体），其余次要节点默认折叠；
  2. **边聚合（Edge Bundling / Aggregation）**：同方向多条不同类型关系自动聚合为带权重的单条复合边，降低渲染边数量 80% 以上；
  3. **按需邻域扩散（On-Demand Expansion）**：用户点击/双击某个实体时，才向后端按需查询其 1 阶或 2 阶关联实体并动态追加到画布，避免一次性重绘；
  4. **全量降级告警与纯列表备用**：若关系数仍超出阈值，图谱顶部提示「已启动关系剪枝模式（当前展示 50/2000+）」，并提供「切换至极速数据表格」按钮，杜绝浏览器假死崩溃。

#### [REQ-ONT-004] 移动端 (Expo App) 与 Web 端视觉体验对齐
- **WHEN** 用户在移动端使用「业务本体」时；
- **THEN** 界面 SHALL 严格保持 6 天前（commit `676518396`）的经典三层结构（四态瓦片过滤、原生轻量 SVG 环形关系图谱、实体卡片流与熔断控制），图谱采用轻量原生 SVG 渲染，杜绝卡顿。

---

## 4. 实施阶段与 WBS 拆解

| 阶段 | 任务包 | 责任角色 | 交付目标 |
| :--- | :--- | :--- | :--- |
| **Phase 1** | **Spec 固化与 Coolie Dev 任务下发** | Hermes (PM) | 输出完整规范，在 Paperclip 官方工单系统注册跟踪任务 |
| **Phase 2** | **架构治理真数据改造与原生审批并轨** | 墨斗 (FDA) / 铁匠 (Core SWE) | 剔除 mock 数据，打通真实项目选择、真实门禁接口与原生 Approvals |
| **Phase 3** | **业务本体默认域自生引擎 (Auto-Bootstrapper)** | 铁匠 (Core SWE) | 实现公司级基础设施模型自动抽取并自生为默认本体域 |
| **Phase 4** | **海量关系图谱防爆与渐进式探索架构** | 门神 (FDSE) / 铁匠 (Core SWE) | 实现度数过滤、骨架首屏、按需扩散与大图防御保护 |
| **Phase 5** | **全栈测试验证与 CMMI G4 验收** | 百晓生 (DS) / 兑底渊 (PRE-SRE) | 验证 0 报错、无死交互、大图流畅不卡死、审批全链路闭环 |
