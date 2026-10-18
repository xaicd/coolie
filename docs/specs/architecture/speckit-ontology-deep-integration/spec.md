# Requirements Specification: Spec-Kit 活体本体建模全生命周期深度接管

> **Spec-Kit 标准需求规格说明书 (SRS: Software Requirements Specification)**
> 遵循 IEEE 29148 与 EARS (Easy Approach to Requirements Syntax) 严谨需求工程标准。
> 状态：`PLAN_APPROVED` | 规格类型：`feature` | 所属领域：`architecture` | 规格标识：`speckit-ontology-deep-integration`
> 对应项目宪法：`.specify/memory/constitution.md` (Rule 0 ~ 13 项不可动摇工程铁律)

---

## 1. 业务目标与愿景 (Introduction & Business Goal)

将 ODD 七模型活体业务本体建模深度编织入 Spec-Kit SDD 全生命周期：立项即具备本体 YAML 骨架、编译即自动融合 Mermaid 架构图、自检与提交即通过零死穴机器审计，实现业务规格与活体本体 100% 同构闭环。



## 2. 术语定义与领域边界 (Glossary & Domain Scope)

| 术语 / 概念 | 英文标识 | 领域定义与所属模块 |
|---|---|---|
| Spec-Kit 活体本体建模全生命周期深度接管 | speckit-ontology-deep-integration | 本规格所交付的业务与技术上下文，严格收敛于 `architecture` 领域边界 |
| 行级租户隔离 | Multi-Tenant AST | 基于 Kysely AST 自动在 SQL 注入 `tenant_id` 过滤条件，严禁跨租户越权 |
| 审计底座字段 | Audit Base Columns | 实体必须自动继承 8 大审计字段，严禁业务层手工更新审计元数据 |

## 3. 用户故事与角色矩阵 (User Stories & Personas)

1. **P0** [作为前线架构师 (FDA / Core SWE)] 运行 speckit new 时支持 --ontology 自动生成符合规范的七模型 YAML 骨架，并支持 speckit ontology 完整子命令族 (init/lint/mermaid/inspect/callchain)

2. **P0** [作为前线架构师 (FDA / Core SWE)] 运行 speckit build 时系统自动提取 spec 目录下的 ontology/ 编译 Mermaid ER 图、状态机图与 M2 动词契约表注入 design.md 与 plan.md

3. **P0** [作为前线架构师 (FDA / Core SWE)] 运行 speckit check / health 以及 Git pre-commit 提交时，系统自动执行反死穴与零孤岛静态审计，拦截 DEAD_UI_BUTTON 与 ILLEGAL_STATE_TRANSITION

## 4. 关键业务不变量 (Key Business Invariants)

1. **反死按钮不变量 (INV_NO_DEAD_BUTTON)** —— 界面 actionPoints 引用的 behaviorRef 必须在 M2 behaviors 中完全存在
2. **状态跃迁守恒不变量 (INV_LIFECYCLE_BOUND)** —— M2 behavior postconditions 变更的状态必须在 M1 lifecycle 允许枚举内

## 5. 验收标准清单 (Acceptance Criteria)

1. **THE system SHALL** 验证：node scripts/speckit.cjs ontology lint 成功对全域规格执行反死穴审计
2. **THE system SHALL** 验证：node scripts/speckit.cjs build 在存在 ontology/ 时自动生成 Mermaid ER/状态图并注入 design.md
3. **THE system SHALL** 验证：node scripts/pre-commit-check.mjs Gate 1.5 拦截存在死按钮或语法缺陷的本体变更

## 6. 约束条件与技术边界 (Constraints & Non-Goals)

### 系统必须满足的架构约束 (The System SHALL Comply With)
* **THE system SHALL COMPLY WITH**: 符合本体驱动建模框架 v9.0：统一采用 M1 (Objects), M2 (Behaviors), M3 (Rules), M5 (Actors), M6 (Flows), MU (Views) 声明式标准。
* **THE system SHALL COMPLY WITH**: 零外网依赖与确定性：所有图表生成与静态审计均为纯本地算法，0 外部网络调用与零假 Mock。
* **THE system SHALL COMPLY WITH**: 物理交付硬门禁：1 Task = 1 Commit，严格贯彻白名单挂锁与不可变工件闭环。

### 明确不做与负向范围 (Non-Goals)
* 不在本次任务中改动 Postgres 物理表结构
* 不侵入 Paperclip 上游数据流，继续采用官方 issue_documents 承载协同
