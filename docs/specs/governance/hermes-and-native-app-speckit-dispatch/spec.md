# Requirements Specification: Hermes网关与APP原生派活全流程接入Spec-Kit

> **Spec-Kit 标准需求规格说明书 (SRS: Software Requirements Specification)**
> 遵循 IEEE 29148 与 EARS (Easy Approach to Requirements Syntax) 严谨需求工程标准。
> 状态：`PLAN_APPROVED` | 规格类型：`feature` | 所属领域：`governance` | 规格标识：`hermes-and-native-app-speckit-dispatch`
> 对应项目宪法：`.specify/memory/constitution.md` (Rule 0 ~ 13 项不可动摇工程铁律)

---

## 1. 业务目标与愿景 (Introduction & Business Goal)

打通 Hermes Gateway (QQ/微信/意图解析器) 与 Expo APP 原生移动端的任务派发全链路，统一接入 Spec-Kit SDD (规格驱动开发)，实现从一句话派单到物理规格骨架、官方协同文档与活体本体全流程闭环。



## 2. 术语定义与领域边界 (Glossary & Domain Scope)

| 术语 / 概念 | 英文标识 | 领域定义与所属模块 |
|---|---|---|
| Hermes网关与APP原生派活全流程接入Spec-Kit | hermes-and-native-app-speckit-dispatch | 本规格所交付的业务与技术上下文，严格收敛于 `governance` 领域边界 |
| 行级租户隔离 | Multi-Tenant AST | 基于 Kysely AST 自动在 SQL 注入 `tenant_id` 过滤条件，严禁跨租户越权 |
| 审计底座字段 | Audit Base Columns | 实体必须自动继承 8 大审计字段，严禁业务层手工更新审计元数据 |

## 3. 用户故事与角色矩阵 (User Stories & Personas)

1. **P0** [作为掌柜/交付总监 (CEO/FDE)] 封闭发行包构建脚本 package-coolie-dev-bundle.mjs 正式封装 speckit.cjs 与 scripts/lib/ 到 bin/speckit，提供生产级开箱即用 CLI。

2. **P0** [作为掌柜/交付总监 (CEO/FDE)] 控制面 shared 契约与 server issue 服务扩展支持 specKit 与 initialSpec，在原子建单时自动脚手架生成规格物理资产并挂载官方 issue_documents。

3. **P0** [作为掌柜/交付总监 (CEO/FDE)] Hermes Gateway (create-coolie-task.mjs、hermes-boss-intent-dispatcher.sh、board-chat.ts) 派单全流程接入 spec-kit。

4. **P0** [作为掌柜/交付总监 (CEO/FDE)] Expo 原生移动端 CreateTaskModal 升级 Spec-Kit 规范类型 (feature/bugfix/refactor/security)，建单直通 Spec-Kit 规格总线。

## 4. 关键业务不变量 (Key Business Invariants)

1. **规格原子性** —— 带有 specKit 的建单请求必须保证物理目录脚手架与 issue_documents 文档初始化一致，失败则记录降级日志但不中断任务创建

## 5. 验收标准清单 (Acceptance Criteria)

1. **THE system SHALL** 验证：`node scripts/speckit.cjs check --spec hermes-and-native-app-speckit-dispatch` exit=0
2. **THE system SHALL** 验证：package-coolie-dev-bundle.mjs 包含 bin/speckit 打包逻辑
3. **THE system SHALL** 验证：create-coolie-task.mjs 支持 --speckit 派单并成功生成物理规格与工单文档
4. **THE system SHALL** 验证：hermes-boss-intent-dispatcher.sh 解析意图时自动挂载 Spec-Kit 规格
5. **THE system SHALL** 验证：Expo CreateTaskModal 支持 Spec-Kit 类型选择并在建单时透传 specKit

## 6. 约束条件与技术边界 (Constraints & Non-Goals)

### 系统必须满足的架构约束 (The System SHALL Comply With)
* **THE system SHALL COMPLY WITH**: 1 Task = 1 Commit：每个子任务独立提交，工作树保持 0 dirty 0 untracked。
* **THE system SHALL COMPLY WITH**: 双轨一致性：代码仓库物理 Markdown 资产为真理源，控制面 issue_documents 原生协同。
* **THE system SHALL COMPLY WITH**: 零破坏性：平滑兼容既有无 spec 派单与旧版 saveIssueSpec 接口。

### 明确不做与负向范围 (Non-Goals)
* 不修改 Paperclip 官方 issue 表核心字段结构，全面继承 issue_documents 原生模型
* 不破坏现有非 Spec 派单的极简直发通道
