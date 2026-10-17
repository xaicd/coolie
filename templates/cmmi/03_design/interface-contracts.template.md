<!--
==========================================================================
【组织标准过程资产模版 (OSSP Template)】
类型: 跨端契约与动词化接口定义规范 (LLD)
归属: CMMI Phase 03 (03_design)
注意: 本文件为纯净空白母本，严禁直接填写项目业务数据！
      使用 node scripts/cmmi-asset-scaffold.cjs batch 或 generate 派生到各项目 docs/ 中。
==========================================================================
-->

# {{PROJECT_TITLE}} · 跨端契约与动词化接口定义说明书 (LLD)

> **文档代号**: {{SYSTEM_CODE}}-LLD-API-{{VERSION}}  
> **基线版本**: {{VERSION}}  
> **制定日期**: {{DATE}}  
> **归属规范**: CMMI 03_design (TS) / OpenAPI 3.1 / .agents/skills/cmmi-detailed-contracts  

---

## 1. 契约设计准则与两字动词语义映射 (API Design Principles)

1. **统一两字动词动作映射**:
   服务端暴露的业务能力与前端界面按钮两字语义严格对应，杜绝“界面文案与接口语义不一致”：
   - 【派活】➔ `POST /api/companies/:id/issues`
   - 【签出】➔ `POST /api/issues/:id/checkout`
   - 【释放】➔ `POST /api/issues/:id/release`
   - 【通过】➔ `POST /api/approvals/:id/approve`
   - 【驳回】➔ `POST /api/approvals/:id/reject`
   - 【提额】➔ `POST /api/companies/:id/budgets`
   - 【归档】➔ `POST /api/companies/:id/archive`
2. **统一响应结构与类型强校验**:
   所有 JSON 接口严格继承统一响应体契约：
   ```typescript
   export interface ApiResponse<T> {
     code: number; // 0 为成功，非 0 为业务异常错误码
     data: T;
     msg: string;
   }
   ```
3. **租户边界自动注入**:
   租户参数 `company_id` 由认证网关根据 Bearer Token 自动注入，杜绝直接从 Query/Body 穿透传参造成越权。

---

## 2. 核心控制面 REST 路由清单 (REST Routes Catalog)

### 2.1 任务工单与签出管理 (`/api/issues`)
- `GET /api/companies/:companyId/issues`: 分页获取指定企业工单列表；
- `POST /api/companies/:companyId/issues`: 创建新工单（自然语言意图进厂排期）；
- `POST /api/issues/:id/checkout`: 智能体申请原子签出锁；
- `POST /api/issues/:id/release`: 智能体主动释放签出锁；
- `PATCH /api/issues/:id`: 更新工单状态（完工时强制核验工件总线资产）。

### 2.2 智能体与心跳上报 (`/api/agents`)
- `GET /api/companies/:companyId/agents`: 获取企业数字员工花名册与状态；
- `POST /api/agents/:id/heartbeat`: 智能体定时上报心跳运行数据与当前执行步骤；
- `POST /api/agents/:id/pause`: 预算超标或异常时暂停智能体运行。

### 2.3 审批流卡片 (`/api/approvals`)
- `GET /api/companies/:companyId/approvals`: 获取待审批流卡片；
- `POST /api/approvals/:id/decision`: 掌柜或主管做出批准或驳回决议（防自审）。

### 2.4 协同文档与工件总线 (`/api/documents` & `/api/work-products`)
- `GET /api/issues/:issueId/work-products`: 获取工单挂载的不可变交付物列表；
- `POST /api/issues/:issueId/work-products`: 注册并挂载有效 Git Commit SHA 或截屏工件。
