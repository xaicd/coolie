# Coolie 工坊平台控制面统一接口契约设计说明书 (OpenAPI 3.1 / LLD)

> **文档代号**: COOA-LLD-v2.0  
> **基线版本**: v2.0.0 (生产冻结版)  
> **制定日期**: 2026-10-17  
> **归属规范**: CMMI 03_design (TS) / OpenAPI 3.1 / .agents/skills/cmmi-detailed-contracts  

---

## 1. 协议规范与核心通信原则 (Protocols & Conventions)

1. **基础路径**: 统一挂载于 `/api`；
2. **报文编码**: `Content-Type: application/json; charset=utf-8`；
3. **租户边界**: 所有的业务实体均必须严格包含在 `Company` 作用域内，网关与服务层强制鉴权；
4. **两字动词契约**: 核心业务交互严格收敛为 $\le 2$ 个汉字的动作指令：
   - 工单原子签出: `POST /api/issues/:id/checkout` ➔ 【签出】
   - 工单主动释放: `POST /api/issues/:id/release` ➔ 【释放】
   - 预算提额恢复: `POST /api/companies/:id/budgets` ➔ 【提额】
   - 卡片式审批决议: `POST /api/approvals/:id/decision` ➔ 【通过】/【驳回】
   - 意图快速派工: `POST /api/companies/:id/issues` ➔ 【派活】

---

## 2. 核心 REST API 模块分类全景

| 模块名称 | 路由前缀 | 核心职责 | 典型接口定义 |
| :--- | :--- | :--- | :--- |
| **企业租户 (Company)** | `/api/companies` | 租户开通、配额管理与组织架构 | `GET /api/companies`<br>`POST /api/companies` |
| **工单总线 (Issues)** | `/api/issues` | 单人签出锁、WBS 树形编排与资产挂载 | `POST /api/issues/:id/checkout`<br>`PATCH /api/issues/:id` |
| **智能体池 (Agents)** | `/api/agents` | 数字员工入职、API 密钥与运行状态 | `GET /api/agents`<br>`POST /api/agents/:id/keys` |
| **审批流 (Approvals)** | `/api/approvals` | 掌柜高管两字审批与风险卡片阻断 | `GET /api/approvals`<br>`POST /api/approvals/:id/decision` |
| **协同文档 (Documents)**| `/api/documents` | 原生控制面动态协同规格与过程文档 | `GET /api/documents`<br>`PUT /api/documents/:id` |
| **预算守卫 (Costs)** | `/api/costs` | 实时 Token 费用计量与硬熔断自愈 | `GET /api/costs`<br>`POST /api/budgets/override` |
| **主线守护 (Routines)** | `/api/routines` | 交付主线巡检触发器与保活定时器 | `GET /api/routines`<br>`POST /api/routines/:id/trigger` |
| **活体本体 (Ontology)** | `/api/ontology` | Palantir 活体双核元模型图谱与 MCP | `GET /api/ontology/graph`<br>`POST /api/ontology/actions/call` |

---

## 3. 服务端统一错误码与多语言序列化规范

所有错误响应统一遵循 HTTP 状态码与结构化 JSON 格式，接入 `server/src/services/errors.ts`：

```json
{
  "error": "ISSUE_LOCKED",
  "message": "当前工单已被智能体 @tiejiang 签出持有，无法重复签出",
  "statusCode": 409,
  "requestId": "req_8f12a3bc9e",
  "timestamp": "2026-10-17T15:10:00.000Z"
}
```

- **错误码与状态机**: 服务端内建 24 个错误码，中英双语 100% 对称，并通过 Pre-commit Gate 21 静态守卫拦截契约漂移。
- **完整机器可读 OpenAPI 3.1 规格详见**: [`interface-contracts/openapi-spec.md`](./interface-contracts/openapi-spec.md)。
