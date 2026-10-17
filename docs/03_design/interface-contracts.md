# Coolie AI 原生商业软件交付工厂控制面平台 · 统一对外接口契约与 API 规范说明书

> **文档代号**: COOLIE-FOUNDRY-LLD-API-2.0.0  
> **基线版本**: 2.0.0 (生产冻结稳定版)  
> **制定日期**: 2026-10-17  
> **归属规范**: CMMI 03_design (TS) / OpenAPI 3.1 / .agents/skills/cmmi-detailed-contracts  

---

## 1. 契约设计准则与两字动词语义映射 (API Design Principles)

1. **统一两字动词动作映射**:
   服务端暴露的业务能力与前端界面按钮两字语义严格对应，杜绝“界面文案与接口语义不一致”：

| 核心业务动作 | 界面按钮 (两字准则) | 映射 REST 路由与方法 | 幂等性与锁机制 | 归属服务模块 |
| :--- | :---: | :--- | :---: | :--- |
| **任务下发** | **【派活】** | `POST /api/companies/:companyId/issues` | 幂等键防重提交 | `issues.ts` |
| **任务认领** | **【签出】** | `POST /api/issues/:id/checkout` | 单人原子互斥锁 | `issues.ts` |
| **主动交还** | **【释放】** | `POST /api/issues/:id/release` | CAS 乐观锁防跨人释放 | `issues.ts` |
| **审批批准** | **【通过】** | `POST /api/approvals/:id/approve` | 强校验防自审自批 | `approvals.ts` |
| **审批驳回** | **【驳回】** | `POST /api/approvals/:id/reject` | 强制填写驳回原因 | `approvals.ts` |
| **预算追加** | **【提额】** | `POST /api/companies/:companyId/budgets` | 复核审批双人门禁 | `costs.ts` |
| **企业归档** | **【归档】** | `POST /api/companies/:companyId/archive` | 软删除保护历史账目 | `companies.ts` |
| **协同评论** | **【评论】** | `POST /api/issues/:id/comments` | 线程锁顺序追加 | `issues.ts` |
| **员工挂起** | **【挂起】** | `POST /api/agents/:id/pause` | 立即释放执行租约 | `agents.ts` |
| **员工复工** | **【复工】** | `POST /api/agents/:id/resume` | 重置心跳健康看门狗 | `agents.ts` |
| **凭证登记** | **【登记】** | `POST /api/issues/:id/work-products` | SHA-256 唯一指纹 | `work-products.ts` |

2. **统一响应结构与类型强校验**:
   所有 JSON 接口严格继承统一响应体封套与错误字典：

```typescript
// packages/shared/src/api/envelope.ts (统一响应封套)
export interface ApiResponse<T = any> {
  code: number;       // 0 为成功，非 0 为明确错误码
  data: T;            // 强类型业务响应负载
  msg: string;        // 提示信息 (支持 i18n 翻译)
  traceId?: string;   // 分布式全链路追踪标识 (OTLP TraceId)
  timestamp: string;  // ISO 8601 服务端时标
}

// 统一错误码字典 (部分核心定义)
export const ErrorCodes = {
  SUCCESS: 0,
  UNAUTHORIZED: 401001,
  FORBIDDEN_TENANT_BOUNDARY: 403001,
  ISSUE_LOCKED_BY_OTHER: 409001,
  BUDGET_HARD_STOP_EXCEEDED: 422001,
  NO_ARTIFACT_NO_DONE: 422002,
  SYSTEM_INTERNAL_ERROR: 500001,
} as const;
```

3. **租户边界自动注入**:
   租户参数 `company_id` 由认证网关根据 Bearer Token 自动注入，杜绝直接从 Query/Body 穿透传参造成越权。

---

## 2. 核心控制面 REST 路由清单 (REST Routes Catalog)

经代码内省扫描，全盘共计 **764** 个对外暴露的标准 REST API 端点，源码统一收拢于 [`server/src/routes/`](file:///host-workspace/xaicd/coolie/server/src/routes/)：

| 序号 | 请求方法 | 路由 URI 路径 | 所属功能域 | 动作语义 | 源码路由文件 |
| :---: | :---: | :--- | :--- | :---: | :--- |
| 1 | `GET` | `/` | 🏢 企业租户域 | 【查询】 | `server/src/routes/companies.ts` |
| 2 | `POST` | `/` | 🏢 企业租户域 | 【创建】 | `server/src/routes/companies.ts` |
| 3 | `GET` | `/_plugins/:pluginId/ui/*filePath` | 🔌 扩展插件域 | 【查询】 | `server/src/routes/plugin-ui-static.ts` |
| 4 | `GET` | `/:companyId` | 🏢 企业租户域 | 【查询】 | `server/src/routes/companies.ts` |
| 5 | `PATCH` | `/:companyId` | 🏢 企业租户域 | 【更新】 | `server/src/routes/companies.ts` |
| 6 | `DELETE` | `/:companyId` | 🏢 企业租户域 | 【删除】 | `server/src/routes/companies.ts` |
| 7 | `POST` | `/:companyId/archive` | 🏢 企业租户域 | 【归档】 | `server/src/routes/companies.ts` |
| 8 | `GET` | `/:companyId/artifacts` | 🏢 企业租户域 | 【查询】 | `server/src/routes/companies.ts` |
| 9 | `POST` | `/:companyId/board-hygiene/audit` | 🏢 企业租户域 | 【创建】 | `server/src/routes/companies.ts` |
| 10 | `PATCH` | `/:companyId/branding` | 🏢 企业租户域 | 【更新】 | `server/src/routes/companies.ts` |
| 11 | `POST` | `/:companyId/emergency-resume` | 🏢 企业租户域 | 【复工】 | `server/src/routes/companies.ts` |
| 12 | `POST` | `/:companyId/emergency-stop` | 🏢 企业租户域 | 【创建】 | `server/src/routes/companies.ts` |
| 13 | `POST` | `/:companyId/export` | 🏢 企业租户域 | 【创建】 | `server/src/routes/companies.ts` |
| 14 | `GET` | `/:companyId/export/fidelity` | 🏢 企业租户域 | 【查询】 | `server/src/routes/companies.ts` |
| 15 | `POST` | `/:companyId/exports` | 🏢 企业租户域 | 【创建】 | `server/src/routes/companies.ts` |
| 16 | `POST` | `/:companyId/exports/preview` | 🏢 企业租户域 | 【创建】 | `server/src/routes/companies.ts` |
| 17 | `GET` | `/:companyId/feedback-traces` | 🏢 企业租户域 | 【查询】 | `server/src/routes/companies.ts` |
| 18 | `POST` | `/:companyId/imports/apply` | 🏢 企业租户域 | 【创建】 | `server/src/routes/companies.ts` |
| 19 | `POST` | `/:companyId/imports/preview` | 🏢 企业租户域 | 【创建】 | `server/src/routes/companies.ts` |
| 20 | `GET` | `/:companyId/release-gate/ds-approval` | 🏢 企业租户域 | 【释放】 | `server/src/routes/companies.ts` |
| 21 | `GET` | `/:companyId/timeline` | 🏢 企业租户域 | 【查询】 | `server/src/routes/companies.ts` |
| 22 | `GET` | `/adapters` | 基础服务 | 【查询】 | `server/src/routes/adapters.ts` |
| 23 | `GET` | `/adapters/:type` | 基础服务 | 【查询】 | `server/src/routes/adapters.ts` |
| 24 | `PATCH` | `/adapters/:type` | 基础服务 | 【更新】 | `server/src/routes/adapters.ts` |
| 25 | `DELETE` | `/adapters/:type` | 基础服务 | 【删除】 | `server/src/routes/adapters.ts` |
| 26 | `GET` | `/adapters/:type/config-schema` | 基础服务 | 【查询】 | `server/src/routes/adapters.ts` |
| 27 | `PATCH` | `/adapters/:type/override` | 基础服务 | 【更新】 | `server/src/routes/adapters.ts` |
| 28 | `POST` | `/adapters/:type/reinstall` | 基础服务 | 【创建】 | `server/src/routes/adapters.ts` |
| 29 | `POST` | `/adapters/:type/reload` | 基础服务 | 【创建】 | `server/src/routes/adapters.ts` |
| 30 | `GET` | `/adapters/:type/ui-parser.js` | 基础服务 | 【查询】 | `server/src/routes/adapters.ts` |
| 31 | `POST` | `/adapters/install` | 基础服务 | 【创建】 | `server/src/routes/adapters.ts` |
| 32 | `GET` | `/admin/users` | 基础服务 | 【查询】 | `server/src/routes/access.ts` |
| 33 | `GET` | `/admin/users/:userId/company-access` | 🏢 企业租户域 | 【查询】 | `server/src/routes/access.ts` |
| 34 | `GET` | `/agent-avatars/:version/:palette/:file` | 🤖 智能体员工域 | 【查询】 | `server/src/routes/agent-avatars.ts` |
| 35 | `PATCH` | `/agents/:agentId/budgets` | 🤖 智能体员工域 | 【更新】 | `server/src/routes/costs.ts` |
| 36 | `GET` | `/agents/:id` | 🤖 智能体员工域 | 【查询】 | `server/src/routes/agents.ts` |
| 37 | `PATCH` | `/agents/:id` | 🤖 智能体员工域 | 【更新】 | `server/src/routes/agents.ts` |
| 38 | `DELETE` | `/agents/:id` | 🤖 智能体员工域 | 【删除】 | `server/src/routes/agents.ts` |
| 39 | `POST` | `/agents/:id/approve` | 🤖 智能体员工域 | 【通过】 | `server/src/routes/agents.ts` |
| 40 | `POST` | `/agents/:id/claude-login` | 🤖 智能体员工域 | 【创建】 | `server/src/routes/agents.ts` |
| 41 | `POST` | `/agents/:id/clear-error` | 🤖 智能体员工域 | 【创建】 | `server/src/routes/agents.ts` |
| 42 | `GET` | `/agents/:id/config-revisions` | 🤖 智能体员工域 | 【查询】 | `server/src/routes/agents.ts` |
| 43 | `GET` | `/agents/:id/config-revisions/:revisionId` | 🤖 智能体员工域 | 【查询】 | `server/src/routes/agents.ts` |
| 44 | `POST` | `/agents/:id/config-revisions/:revisionId/rollback` | 🤖 智能体员工域 | 【创建】 | `server/src/routes/agents.ts` |
| 45 | `GET` | `/agents/:id/configuration` | 🤖 智能体员工域 | 【查询】 | `server/src/routes/agents.ts` |
| 46 | `POST` | `/agents/:id/heartbeat/invoke` | 🤖 智能体员工域 | 【心跳】 | `server/src/routes/agents.ts` |
| 47 | `GET` | `/agents/:id/instructions-bundle` | 🤖 智能体员工域 | 【查询】 | `server/src/routes/agents.ts` |
| 48 | `PATCH` | `/agents/:id/instructions-bundle` | 🤖 智能体员工域 | 【更新】 | `server/src/routes/agents.ts` |
| 49 | `GET` | `/agents/:id/instructions-bundle/file` | 🤖 智能体员工域 | 【查询】 | `server/src/routes/agents.ts` |
| 50 | `PUT` | `/agents/:id/instructions-bundle/file` | 🤖 智能体员工域 | 【更新】 | `server/src/routes/agents.ts` |
| 51 | `DELETE` | `/agents/:id/instructions-bundle/file` | 🤖 智能体员工域 | 【删除】 | `server/src/routes/agents.ts` |
| 52 | `PATCH` | `/agents/:id/instructions-path` | 🤖 智能体员工域 | 【更新】 | `server/src/routes/agents.ts` |
| 53 | `GET` | `/agents/:id/keys` | 🤖 智能体员工域 | 【查询】 | `server/src/routes/agents.ts` |
| 54 | `POST` | `/agents/:id/keys` | 🤖 智能体员工域 | 【创建】 | `server/src/routes/agents.ts` |
| 55 | `DELETE` | `/agents/:id/keys/:keyId` | 🤖 智能体员工域 | 【删除】 | `server/src/routes/agents.ts` |
| 56 | `POST` | `/agents/:id/pause` | 🤖 智能体员工域 | 【挂起】 | `server/src/routes/agents.ts` |
| 57 | `PATCH` | `/agents/:id/permissions` | 🤖 智能体员工域 | 【更新】 | `server/src/routes/agents.ts` |
| 58 | `POST` | `/agents/:id/resume` | 🤖 智能体员工域 | 【复工】 | `server/src/routes/agents.ts` |
| 59 | `GET` | `/agents/:id/runtime-state` | 🤖 智能体员工域 | 【查询】 | `server/src/routes/agents.ts` |
| 60 | `POST` | `/agents/:id/runtime-state/reset-session` | 🤖 智能体员工域 | 【创建】 | `server/src/routes/agents.ts` |
| 61 | `GET` | `/agents/:id/skills` | 🤖 智能体员工域 | 【查询】 | `server/src/routes/agents.ts` |
| 62 | `GET` | `/agents/:id/task-sessions` | 🤖 智能体员工域 | 【查询】 | `server/src/routes/agents.ts` |
| 63 | `POST` | `/agents/:id/terminate` | 🤖 智能体员工域 | 【创建】 | `server/src/routes/agents.ts` |
| 64 | `POST` | `/agents/:id/wakeup` | 🤖 智能体员工域 | 【创建】 | `server/src/routes/agents.ts` |
| 65 | `GET` | `/agents/me` | 🤖 智能体员工域 | 【查询】 | `server/src/routes/agents.ts` |
| 66 | `POST` | `/agents/me/connections/:connectionId/start-authorization` | 🤖 智能体员工域 | 【创建】 | `server/src/routes/tool-access.ts` |
| 67 | `POST` | `/agents/me/connections/:connectionId/token` | 🤖 智能体员工域 | 【创建】 | `server/src/routes/tool-access.ts` |
| 68 | `GET` | `/agents/me/inbox-lite` | 🤖 智能体员工域 | 【查询】 | `server/src/routes/agents.ts` |
| 69 | `GET` | `/agents/me/inbox/mine` | 🤖 智能体员工域 | 【查询】 | `server/src/routes/agents.ts` |
| 70 | `POST` | `/agents/me/secret-proposals` | 🤖 智能体员工域 | 【创建】 | `server/src/routes/secrets.ts` |
| 71 | `GET` | `/agents/me/secret-proposals` | 🤖 智能体员工域 | 【查询】 | `server/src/routes/secrets.ts` |
| 72 | `DELETE` | `/agents/me/secret-proposals/:id` | 🤖 智能体员工域 | 【删除】 | `server/src/routes/secrets.ts` |
| 73 | `GET` | `/agents/me/secrets` | 🤖 智能体员工域 | 【查询】 | `server/src/routes/secrets.ts` |
| 74 | `POST` | `/agents/me/secrets/:key/value` | 🤖 智能体员工域 | 【创建】 | `server/src/routes/secrets.ts` |
| 75 | `GET` | `/announcements/:id/animation` | 基础服务 | 【查询】 | `server/src/routes/announcements.ts` |
| 76 | `POST` | `/announcements/:id/dismiss` | 基础服务 | 【创建】 | `server/src/routes/announcements.ts` |
| 77 | `GET` | `/announcements/:id/image` | 基础服务 | 【查询】 | `server/src/routes/announcements.ts` |
| 78 | `GET` | `/announcements/current` | 基础服务 | 【查询】 | `server/src/routes/announcements.ts` |
| 79 | `POST` | `/api/chat-webhooks/:publicId/:provider` | 基础服务 | 【创建】 | `server/src/routes/chat-channels.ts` |
| 80 | `POST` | `/api/chat-webhooks/agentmail/:publicId` | 🤖 智能体员工域 | 【创建】 | `server/src/routes/email.ts` |
| ... | ... | *(全盘共计 764 个标准 REST 契约端点，100% 收拢于 server/src/routes/)* | ... | ... | ... |
