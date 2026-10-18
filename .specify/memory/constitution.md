# Project Constitution (项目工程宪法)

> **Spec-Kit 核心治理文件**：本项目基于 **GitHub Spec-Kit (SDD: Spec-Driven Development)** 开源标准构建并扩展。
> 本宪法文件定义了 AI 智能体 (Agent) 与人类研发协同开发时的**最高不可动摇底线法则 (Non-Negotiable Directives & Quality Bars)**。
> 详见权威真源：`AGENTS.md` 与 `.agents/rules/RULE-0-UNIVERSAL-DIRECTIVES.md`。

---

## 🏛️ Rule 0: 零 Token 浪费、零重复样板与工具优先架构

1. **零 Token 与算力浪费 (Zero Token Waste)**：严禁大模型人肉逐行生成几百行千篇一律的重复 CRUD、样板代码或冗余 DDL；业务开发必须采用 **Schema / DSL 极简声明式驱动**，由底层通用引擎自动展开！
2. **架构模式极致复用 (Architectural Pattern Mastery)**：必须复用泛型 `BaseMapper<T>`、`QueryWrapper<T>`、`BaseService<T>` 与 `createBaseSchema`，自动继承多租户隔离、逻辑删除与 8 大基础审计底座字段。
3. **开源成熟方案优先与竞品性价比选型 (Open-Source First & Best ROI)**：严禁盲目从零造轮子，必须优先基于 GitHub 开源成熟方案（如 GitHub Spec-Kit、Archify、Strix、Vercel 等）进行扩展与集成。
4. **SpaceX 级全链路测试验证与真实数据库驱动 (SpaceX-Grade Testing & Zero Fake Mock)**：代码变更必须跑通 4 层金字塔测试矩阵（L1 单测、L2 集成、L3 契约、L4 E2E）；100% 由真实数据库/嵌入式 SQLite 支撑，严禁前端伪造 Mock！
5. **本体域全息导航与 API 契约第一切入 (Ontology & API-Contract-First)**：任意需求必须先在本体域（实体网、Domain Facade、route manifest、权限码）中秒级定位目标域与影响半径，以 API 契约为探针执行穿透闭环。
6. **全工种四类契约族收敛 (All-Role Contract Families)**：数据同步/ETL、BI 查询、运营编排、运维发布等非编码需求同样必须收敛为可审计契约——API 契约 / 数据契约 / 流程契约 / 预案契约四选一。
7. **全局高阶反向思维与 AI-Driven Harness 全程监督 (High-Order Inverse Thinking)**：严禁以初级外包码农视角就事论事贴补丁；敲代码必须业务对象溯源且由通用引擎展开；写单测必须 4 态状态机真实入库覆盖与反假 Mock。
8. **0-1 软件工程交付资产与 No Artifact, No Done 铁律 (Spec-First Artifacts)**：严禁口头声明完工；每个特性必须基于 8 要素 Brief 派发，且必须产出 7 类物理工程资产（SRS/RTM、OpenAPI 契约、0 报错源码、真实 DB 状态机单测报告、生产回滚 SOP、SRE 稳定性基线、持续运营对账单）。
9. **单一真源与全生命周期过程资产防污染铁律 (Single Source of Truth & Anti-Pollution)**：技能唯一真源为 `.agents/skills/<name>/SKILL.md`；指令唯一真源为 `.agents/commands/`；业务规格按域隔离于 `docs/specs/<domain>/<name>/`（支持 feature/bugfix/enhancement/refactor/security 五态）并支持自动归档。
10. **全能力 AI Agent 驱动公理 (All Capabilities Must Be AI Agent Driven)**：系统内的一切能力（需求立项、代码实现、API 契约、页面交互、接口运营、自动化测试、容器发版、故障自愈）必须具备 **100% 机器可读与 AI Agent 闭环驱动能力**。
11. **全项目文档 Spec-Kit 规范化书写与 CMMI 01~09 / docs/specs 双轨法定归宿铁律 (Unified Spec-Kit & Dual-Track CMMI Law)**：全仓所有工程、管理、架构、测试与运维文档，严禁无规范自由手写与随意散落。所有文档必须统一由 Spec-Kit 规范引擎 (`scripts/speckit.cjs`) 驱动书写，遵循模板化插值、IEEE 29148 / EARS 句式、不可篡改元数据头与 1 Task = 1 Commit 物理取证。物理路径必须严格落盘于法定双轨目录：
    - **宏观项目全生命周期资产轨**：严格归属 `docs/01_management/` 到 `docs/09_operations/` (CMMI 01~09 组织级过程资产)；
    - **微观特性全息规格包轨**：严格归属 `docs/specs/<domain>/<feature-slug>/` (Spec-Kit 15 资产包)；
    任何散落在根目录或其他未经登记目录的 markdown 文件，一律由 `speckit health` 视为非法污染并阻断门禁！
12. **控制面 Issue 架构向 Paperclip 官方主线全面回归与双核并轨铁律 (Return to Paperclip Upstream Law)**：
    - **单一物理真理源**：本地代码仓库内的 **Spec-Kit Markdown 资产**（`docs/specs/` 与 CMMI 01~09）是规格与设计唯一的版本化真理源，贯彻“代码即文档，1 Task = 1 Commit”；
    - **控制面原生协同载体**：控制面 Issue 100% 采用 Paperclip 官方原生 **`issue_documents`**（Markdown 协同文档，`key: 'spec'` 与 `'plan'`），原生享受版本历史（`document_revisions`）、实时行级标注（`document_annotation_threads`）、排他锁与差异比对；
    - **自研 In-DB 字段降级与平滑解耦**：全面淘汰并停止扩展 Wave 147 遗留的 `issues.spec` / `issues.spec_kind` 数据库私有 JSONB 字段。统一由 `node scripts/speckit.cjs sync` 自动将本地 Git 规格无缝推送到官方 `issue_documents`，并通过 `official-migrate` 确保历史数据零丢失。控制面 `issues` 表物理结构逐步向上游主干完全对齐，彻底消除 Fork 分歧面！

---

## 📐 质量基线与阶段门禁 (Quality Gates)

| 门禁 (Gate) | 门禁名称 | 强制验收标准 |
|---|---|---|
| **Gate 1** | 规格完备性 | `brief.json` 8 要素齐全，EARS 句式无二义性，非目标明确。 |
| **Gate 2** | 契约与方案 | OpenAPI 契约就绪，真实 DB 模型就绪，Domain Facade 缝隙对齐。 |
| **Gate 3** | 任务原子性 | 任务拆解具备依赖波次，严格贯彻 **1 Task = 1 Commit**，白名单文件约束。 |
| **Gate 4** | 真实入库测试 | 真实 PostgreSQL / SQLite 跑通 4 态状态机测试，0 空壳单测，变异测试杀灭假断言。 |
| **Gate 5** | 生产就绪度 | SRE 稳定性指标达标，安全渗透红线 0 违规，自动化回滚 Runbook 实测通过。 |
| **Gate 6** | 归档防污染 | 规格生命周期移入 `docs/specs/archive/`，活跃区 0 散落文件，Git 提交痕迹核验通过。 |
