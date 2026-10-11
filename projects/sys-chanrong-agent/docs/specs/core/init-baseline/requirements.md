# Requirements: 产融商业保理与供应链金融智能体系统 初始工程地基与规范基线

状态：`PLAN_APPROVED`　类型：`feature`　特性：`init-baseline`　域名：`core`
上游：一句话立项需求 + 《某公司产融智能体应用系统集成服务项目 技术规范书》
下游：`design.md`（本设计严格支撑需求，不得反向修改需求定义）

> 本文件只写**可断言的工程地基**，不写业务套话。每条需求遵循 EARS（Easy Approach to Requirements Syntax）
> 五态句式，可直接转译为测试断言。业务场景需求（REQ-CR-###）见 `docs/02_requirements/software-requirements.md`，
> 本文件只覆盖「0→1 工程地基 + 规范基线」这一层。

## 1. 目标与背景 (Introduction)

在 0→1 阶段，把产融智能体系统的**工程地基**一次立死：多企业隔离的持久化层、统一 API 契约与 DTO、
离线私有化运行时门禁、管理面与编排面的物理边界、以及 CMMI 01~09 规范基线。
地基不牢则所有后续 G1→G5 阶段都会长出跨域特例与静默数据穿透。本阶段的唯一交付物是**可断言的地基 + 规范基线**。

技术栈基线：`node / react / python-vision / docker`；存储介质：`git_repo`。

## 2. 术语表 (Glossary)

| 术语 | 英文 | 定义 |
|---|---|---|
| 工程地基 | Engineering Foundation | 多企业隔离持久化层 + 统一 API 契约 + 运行时门禁 + 模块边界 |
| 规范基线 | Norm Baseline | CMMI 01~09 目录拓扑与 G1~G5 门禁的初始冻结版本 |
| 企业隔离字段 | company_id | 每条业务记录强制携带、服务端强制注入的租户边界 |
| 审计底座列 | Audit Base Columns | 全表统一继承的 8 个物理列（见 REQ-BASE-002） |
| 统一契约 | ApiResponse Envelope | 所有 HTTP 响应的统一封装 `{code,message,data,traceId,timestamp}` |
| 管理面 / 编排面 | Admin Plane / Orchestration Plane | Node 控制台 / Python 编排引擎，运行时分离 |
| 人类复核门禁 | Human-in-the-Loop | 资金/额度/放款状态变更必须保留人类双人复核 |

## 3. 用户故事 (User Stories)

### US-001: 作为掌柜 / 交付总监
- **优先级**: `P0`
- **内容**: 我要在移动端驾驶舱实时检视工程资产与两字审批，避免口头交工与虚假空转。

### US-002: 作为前线 FDE / 核心工程师
- **优先级**: `P0`
- **内容**: 我要基于 CMMI 01~09 资产与统一 OpenAPI 契约高效交付，不必反复猜测隔离与权限边界。

### US-003: 作为产融风控 / 业务经理
- **优先级**: `P1`
- **内容**: 我要以只读或建议权限调用智能体，且任何资金/额度动作都保留人类复核，确保合规可追溯。

## 4. 关键业务不变量 (Invariants)

1. **多企业数据强隔离** —— 所有业务查询在仓储层强制注入 `company_id` 过滤；客户端传入的租户标识永不可信。
2. **资金/额度守恒** —— 授信额度、发票抵扣金额的变动必须处于同一原子事务，并满足进出双向对账与防重复冲销。
3. **人类复核不可绕过** —— 涉及资金、额度批复、放款的状态变更，智能体只有只读/建议权限，落地必须人类双人复核。
4. **离线不出域** —— 推理、检索、OCR 全部支持内网脱机运行，不回连公网。

## 5. EARS 验收标准 (Acceptance Criteria)

### 5.1 工程地基 (Ubiquitous / Event-driven / State-driven / Optional / Unwanted)

| ID | 类别 | 验收描述 |
|---|---|---|
| REQ-BASE-001 | Ubiquitous | **The** 系统 **SHALL** 在仓储层为每条业务记录强制注入 `company_id` 过滤，任何缺少该过滤的查询 SHALL 被静态检查拒绝。 |
| REQ-BASE-002 | Ubiquitous | **The** 系统 **SHALL** 令所有业务表继承 8 个审计底座列：`id, company_id, created_at, updated_at, created_by, updated_by, is_deleted, version`。 |
| REQ-BASE-003 | Ubiquitous | **The** 系统 **SHALL** 令所有 HTTP 响应遵循统一封装 `ApiResponse<T> = {code,message,data,traceId,timestamp}`。 |
| REQ-BASE-004 | Ubiquitous | **The** 系统 **SHALL** 只使用 `200/400/401/403/404/409/422/500` 八类 HTTP 错误码，并全局携带 `traceId`。 |
| REQ-BASE-005 | State-driven | **While** 系统处于专网离线启动态，**the** 系统 **SHALL** 校验本地硬件指纹（CPU/MAC/主板序列号）与离线 License 有效期；校验失败 SHALL 拒绝提供业务服务并记录越权启动告警。 |
| REQ-BASE-006 | Ubiquitous | **The** 管理面（Node）**SHALL NOT** 内联编排逻辑；**the** 编排面（Python）**SHALL NOT** 直连产融业务库；二者 **SHALL** 仅经 `/api/v1/chanrong/*` 契约交互。 |
| REQ-BASE-007 | State-driven | **While** 任一智能体发起请求，**the** 系统 **SHALL** 只授予其只读或建议权限；涉及资金/额度/放款的状态变更 **SHALL** 保留人类双人复核门禁。 |
| REQ-BASE-008 | Event-driven | **When** 任意业务实体发生状态变更，**then** 系统 **SHALL** 生成防篡改哈希链审计记录（含操作人、时间、源 IP、变更前值、变更后值）。 |
| REQ-BASE-009 | Ubiquitous | **The** 验证套件 **SHALL** 运行于真实数据库（禁止假 Mock 业务数据），数据隔离断言 SHALL 覆盖跨企业越权拒绝路径。 |
| REQ-BASE-010 | Event-driven | **When** 开发者提交变更，**then** G1~G5 门禁脚本 **SHALL** 全部以退出码 0 通过。 |
| REQ-BASE-011 | Unwanted | **If** 客户端请求体携带与他租户不符的 `company_id`，**then** 系统 **SHALL** 拒绝该请求（403）并写入审计日志。 |
| REQ-BASE-012 | Optional | **Where** 需要外部系统对接，**the** 系统 **SHALL** 通过独立适配器（防腐层）实现，禁止业务核心直接依赖外部 SDK。 |

### 5.2 非功能性验收 (NFR)

| ID | 验收描述 |
|---|---|
| NFR-BASE-001 | 统一契约改造后，全量接口在 `npx tsc --noEmit` 下 0 编译报错。 |
| NFR-BASE-002 | CMMI 01~09 目录拓扑 100% 就位，`docs/` 根目录 0 孤儿文件。 |
| NFR-BASE-003 | 未发生的运行期事实（事故复盘、财务对账）严格保留 `.gitkeep` 留空，杜绝伪造。 |

## 6. 约束与边界 (Constraints & Non-Goals)

* **THE system SHALL COMPLY WITH**: 多租户隔离 —— 严禁跨企业租户数据穿透。
* **THE system SHALL COMPLY WITH**: 反假 Mock —— 必须使用真实数据库事务测试。
* **THE system SHALL COMPLY WITH**: 极简人机 —— 核心操作按钮 ≤2 汉字，底栏 5 槽位绝对对称。

### 明确不做 (Non-Goals)

* 本阶段不实现产融业务场景功能（发票 OCR、智能体问答、授信流转），只立地基与模块边界。
* 本阶段不交付生产部署与终验（G5），只冻结 G1/G2 规范基线。
* 本阶段不改动平台仓库 `server/`、`ui/` 与发布文件。

## 7. 需求 ↔ 交付物追溯 (轻量 RTM)

| 需求 | 对应设计模块 | 交付物 | 门禁 |
|---|---|---|---|
| REQ-BASE-001/002 | 持久化层 · 隔离底座 | `docs/03_design/database-design-erd.md` | G2 |
| REQ-BASE-003/004 | 统一契约 · BFF | `design.md §3` | G3 |
| REQ-BASE-005/008 | 安全与授权 · 审计链 | `docs/03_design/architecture-design-hld.md` | G2 |
| REQ-BASE-006/007/012 | 模块边界 · 适配层 | `docs/03_design/architecture-design-hld.md` | G2 |
| REQ-BASE-009/010 | 测试地基 · 门禁 | `docs/05_verification/test-summary-report.md` | G1/G4 |
