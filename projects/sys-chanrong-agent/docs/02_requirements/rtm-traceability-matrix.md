# 产融商业保理与供应链金融智能体系统 需求双向跟踪矩阵 (RTM)

> **所属业务系统**: `SYS_CHANRONG_AGENT`　**本体域**: `enterprise-core`　**规范**: CMMI REQM
> 双向绑定：业务需求 ↔ 软件需求(EARS) ↔ 架构模块(HLD) ↔ 接口契约(LLD) ↔ 测试用例 ↔ 门禁

---

## 1. 业务需求 → 软件需求 → 设计 → 测试 全链路

| 业务需求 | 需求名称 | 软件需求 (EARS) | 架构模块 (HLD) | 接口契约 (LLD) | 测试用例 | 门禁 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| BR-01 | 企业统一档案 | REQ-CR-001, REQ-CR-002 | `module-corp-profile` | `/api/v1/chanrong/enterprise/*` | TC-CORP-01/02 | G1/G4 |
| BR-02 | 单证智能提取 | REQ-CR-003, REQ-CR-004, REQ-CR-005 | `module-vision-ocr` | `/api/v1/chanrong/document/ocr-parse` | TC-OCR-01/02/03 | G1/G4 |
| BR-03 | 产融 Agent 中枢 | REQ-CR-006, REQ-CR-007 | `module-agent-orchestrator` | `/api/v1/chanrong/agent/chat-stream` | TC-AGENT-01/02 | G1/G4 |
| BR-04 | 融资授信流转 | REQ-CR-008, REQ-CR-009 | `module-credit-workflow` | `/api/v1/chanrong/credit/calculate-limit` | TC-FLOW-01/02/03 | G1/G4 |
| BR-05 | 系统集成对接 | REQ-CR-010 | `module-ruoyi-connector` | `RuoyiAuthBridge` | TC-AUTH-01/02 | G1/G4 |
| BR-06 | 安全与合规授权 | REQ-CR-011, REQ-CR-012 | `module-security-license` | `/api/v1/health` | TC-SEC-01/02 | G1/G4 |
| BR-07 | 离线私有化运行时 | REQ-BASE-005 | `core-domain` | `scripts/check-release-baseline.mjs` | TC-BASE-05 | G2/G5 |
| BR-08 | 多企业强隔离 | REQ-BASE-001, REQ-BASE-002, REQ-BASE-011 | `core-repo` | `/api/v1/chanrong/enterprise/*` | TC-BASE-01/02/11 | G2/G4 |
| BR-09 | 统一 API 契约 | REQ-BASE-003, REQ-BASE-004 | `core-service` | `ApiResponse<T>` | TC-BASE-03/04 | G3 |
| BR-10 | 模块边界与适配层 | REQ-BASE-006, REQ-BASE-012 | `agent-bridge` / `adapters/*` | `/api/v1/chanrong/*` | TC-BASE-06/12 | G2 |
| BR-11 | 不可篡改审计链 | REQ-BASE-008 | `core-service` | `cr_audit_chain` | TC-BASE-08 | G2/G4 |
| BR-12 | 测试地基与门禁 | REQ-BASE-009, REQ-BASE-010 | 全部 | 门禁脚本 | TC-BASE-09/10 | G1~G5 |

## 2. 覆盖率核对准则

- 每条业务需求（BR）至少映射 1 条 EARS 软件需求、1 个架构模块、1 个测试用例。
- 每条 EARS 需求反向必须可在设计（HLD/LLD）中定位落地位置。
- 覆盖率目标 **100%**；任何未覆盖项在 G1/G2 门禁即判红。
- 变更任一需求/模块/契约，必须同步更新本矩阵（双向唯一真源）。

## 3. 与门禁脚本的绑定

| 门禁 | 脚本 | 校验点 |
| :--- | :--- | :--- |
| G1 需求 | `node scripts/verify-reqs.mjs` | SRS 含 REQ- 编号与 SHALL 语句 |
| G2 架构 | `node scripts/check-fork-surface.mjs` | 分层拓扑 / `company_id` 隔离 / DAR 加权矩阵 / 需求覆盖 / 待决事项 |
| G3 契约 | `node scripts/check-contracts.mjs` | `npx tsc --noEmit` 0 报错 |
| G4 验收 | `node scripts/run-tests.mjs` | 真实数据库测试通过 |
| G5 投产 | `node scripts/check-release-baseline.mjs` | 部署 SOP 含回滚与制品校验和 |
