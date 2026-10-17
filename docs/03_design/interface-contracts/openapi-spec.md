# Coolie 工坊控制面统一接口契约说明书 (OpenAPI Specification)

> **文档代号**: COOA-API-v2.0  
> **基线版本**: v2.0.0  
> **制定日期**: 2026-10-17  
> **适用规范**: OpenAPI 3.1.0 / CMMI 03_design (TS / LLD) / .agents/skills/cmmi-detailed-contracts  

---

## 1. 接口全局约定 (Global Conventions)

- **协议基地址**: `http://localhost:3100/api` (开发态) / `https://api.coolie.ai/api` (生产态)
- **认证方式**: HTTP Header `Authorization: Bearer <agent_api_key_or_session>`
- **租户上下文**: HTTP Header `X-Company-Id: <uuid>` (可选，优先由 Token 绑定解析)
- **请求与响应格式**: `Content-Type: application/json; charset=utf-8`
- **全局错误响应格式**:
  ```json
  {
    "error": {
      "code": "BAD_REQUEST",
      "message": "参数校验失败: 缺少必须的 issueId",
      "details": []
    }
  }
  ```

---

## 2. 核心 OpenAPI 3.1 RESTful 路由清单

### 2.1 企业与租户中枢 (`/api/companies`)
- `GET /api/companies`: 获取当前用户有权访问的企业列表
- `POST /api/companies`: 创建新交付企业或客户组织
- `GET /api/companies/:id`: 获取企业详细大盘、配置与预算状态

### 2.2 工单与任务流水线 (`/api/issues` / `/api/companies/:id/issues`)
- `GET /api/companies/:id/issues`: 分页获取企业任务工单列表 (支持状态、优先级、负责人过滤)
- `POST /api/companies/:id/issues`: 正式立项排期创建新任务 (支持 EARS 需求输入与自动 WBS)
- `GET /api/issues/:id`: 获取任务详情、当前签出人、工件引用与上下文
- `POST /api/issues/:id/checkout`: 原子签出该任务（获取排他性写锁）
- `POST /api/issues/:id/release`: 主动释放该任务的签出锁
- `PATCH /api/issues/:id`: 更新任务状态（流转为 `done` 时强制触发实质性工程资产校验）

### 2.3 数字员工与心跳中枢 (`/api/agents` / `/api/heartbeat`)
- `GET /api/companies/:id/agents`: 获取企业数字员工花名册、当前状态与预算消耗
- `POST /api/companies/:id/agents`: 招募/配置新数字员工（指定角色、模型与工具池）
- `POST /api/heartbeat`: 数字员工例行心跳上报（包含当前步骤、运行时日志与资源消耗）

### 2.4 高管审批流与卡片中枢 (`/api/approvals`)
- `GET /api/companies/:id/approvals`: 获取待审批流清单（支持高危操作、预算提额、投产放行）
- `POST /api/approvals/:id/decision`: 掌柜或交付总监提交两字审批决策（`approve` / `reject`）

### 2.5 交付主线巡检常驻任务 (`/api/routines`)
- `GET /api/companies/:id/routines`: 获取项目交付主线例行保活任务状态
- `POST /api/routines/:id/trigger`: 手动或定时触发交付主线小时级巡检

---

## 3. OpenAPI 3.1 核心定义片段 (Schema Definitions)

```yaml
openapi: 3.1.0
info:
  title: Coolie Control Plane API
  version: 2.0.0
  description: AI-Native Commercial Software Delivery Foundry REST API
paths:
  /api/issues/{id}/checkout:
    post:
      summary: 原子签出任务 (获取排他写锁)
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
            format: uuid
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [agentId]
              properties:
                agentId:
                  type: string
                  format: uuid
      responses:
        '200':
          description: 签出成功
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/IssueCheckoutResult'
        '409':
          description: 冲突: 任务已被其他智能体签出

components:
  schemas:
    IssueCheckoutResult:
      type: object
      properties:
        issueId:
          type: string
        lockedBy:
          type: string
        lockedAt:
          type: string
          format: date-time
        leaseExpiresAt:
          type: string
          format: date-time
```
