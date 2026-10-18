# Requirements Specification: 全量架构治理门禁回归 Paperclip 官方 issue_documents 对齐改造

> **Spec-Kit 标准需求规格说明书 (SRS: Software Requirements Specification)**
> 遵循 IEEE 29148 与 EARS (Easy Approach to Requirements Syntax) 严谨需求工程标准。
> 状态：`PLAN_APPROVED` | 规格类型：`refactor` | 所属领域：`architecture` | 规格标识：`governance-official-issue-doc-alignment`
> 对应项目宪法：`.specify/memory/constitution.md` (Rule 0 ~ 13 项不可动摇工程铁律)

---

## 1. 业务目标与愿景 (Introduction & Business Goal)

全面改造与对齐平台全量架构治理门禁（活体本体对账、管局审计 Gate 17/28、Fork 表面防腐、Pre-Commit 白名单物理核销与 CMMI 双轨资产门禁），使之 100% 吻合 Paperclip 官方原生 issue_documents 协同架构与 Git 物理真理源双轨法典，消除历史私有字段技术债与伪漂移报警。


### 架构债务与异味分析 (Debt Analysis)

Wave 147 历史实现将 Spec 强耦合在 issues.spec / specKind 私有 JSONB 字段中，导致本体对账 (harness-ontology-audit) 硬编码映射 specKind、管局审计未防腐拦截私有字段膨胀、Pre-commit 未对 SDD 白名单物理挂锁，存在规则与官方主线脱节的技术债。

### 目标整洁架构形态 (Target Architecture)

Git Markdown 资产 (docs/specs/ 与 docs/01~09/) 为物理单一真理源，控制面 100% 使用 Paperclip 原生 issue_documents 协同；本体模型对齐原生 Document 关联，管局审计守卫防腐拦截，Pre-Commit 物理核销 1 Task = 1 Commit 与白名单，CMMI 双轨资产结项闭环。


## 2. 术语定义与领域边界 (Glossary & Domain Scope)

| 术语 / 概念 | 英文标识 | 领域定义与所属模块 |
|---|---|---|
| 全量架构治理门禁回归 Paperclip 官方 issue_documents 对齐改造 | governance-official-issue-doc-alignment | 本规格所交付的业务与技术上下文，严格收敛于 `architecture` 领域边界 |
| 行级租户隔离 | Multi-Tenant AST | 基于 Kysely AST 自动在 SQL 注入 `tenant_id` 过滤条件，严禁跨租户越权 |
| 审计底座字段 | Audit Base Columns | 实体必须自动继承 8 大审计字段，严禁业务层手工更新审计元数据 |

## 3. 用户故事与角色矩阵 (User Stories & Personas)

1. **P0** [作为平台架构师 (FDA)] 作为架构师，我希望活体本体对账脚本解除对 issues.specKind 私有列的硬编码依赖，转向官方 issue_documents 关联，消除 COLUMN_DRIFT 伪报警。

2. **P0** [作为平台架构师 (FDA)] 作为交付总监，我希望管局审计包含官方 issue_documents 对齐守卫并冻结 Fork issues 表面，确保所有同步工单挂载官方原生 Markdown 文档。

3. **P1** [作为平台架构师 (FDA)] 作为研发工程师，我希望 Pre-Commit 与 CMMI 规则自动核验 1 Task = 1 Commit 和文件白名单，杜绝口头规范与虚假完工。

## 4. 关键业务不变量 (Key Business Invariants)

1. **官方主线零侵入** —— 控制面协同完全走官方 issue_documents 路由与数据模型，不向 upstream issues 表强塞私有字段

## 5. 验收标准清单 (Acceptance Criteria)

1. **THE system SHALL** 验证：node scripts/harness-ontology-audit.mjs 运行全绿，0 COLUMN_DRIFT 伪报警
2. **THE system SHALL** 验证：node scripts/check-governance-audit.mjs 运行全绿，官方 issue_documents 守卫通过
3. **THE system SHALL** 验证：node scripts/speckit.cjs health 运行通过，0 散落、0 污染

## 6. 约束条件与技术边界 (Constraints & Non-Goals)

### 系统必须满足的架构约束 (The System SHALL Comply With)
* **THE system SHALL COMPLY WITH**: 功能等价与历史兼容：老端点 (/api/issues/:id/spec 等) 保持平滑双写与读取回退，存量数据 0 丢失。
* **THE system SHALL COMPLY WITH**: 0 假门禁与 100% 自动化：所有门禁必须能经由自动化脚本 (node scripts/...) 独立执行，严禁口头打勾。

### 明确不做与负向范围 (Non-Goals)
* 本次不对业务页面 UI 进行非必要的视觉重构，仅聚焦于架构治理与自动化门禁体系的升级收口
