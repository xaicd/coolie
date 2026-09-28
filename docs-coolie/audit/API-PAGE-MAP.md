# API → 页面全量映射 (wave130)

> 本表由 `scripts/audit/build-api-page-map.mjs` **程序生成**, 非手抄。
> 数据源: 当天 main 的 `server/src/routes/*.ts` + `server/src/app.ts` 挂载表 +
> `ui/src`、`clients/{expo,h5,api-client}/src`、`tests/` 源码反查。
> **只读审计, 未改任何产品代码。**

## 结论摘要 (先数)

| 指标 | 数值 |
| --- | ---: |
| 路由文件 (含 Router, 不含 test) | 82 |
| 解析出的端点 (method+path, 含多挂载展开) | **886** |
| 去重后的完整路径 (method+path) | 886 |
| 类别: 界面可达 | **647** |
| 类别: 上游同步 | 2 |
| 类别: 内部RPC | 50 |
| 类别: 拨测 | 105 |
| 类别: 后台任务 | 6 |
| 类别: 未接线 | **76** |
| Web 有页面/组件消费者 | 628 |
| Web 仅停在 api 层 (无页面消费) | 0 |
| App 有屏幕消费者 (expo/h5/api-client) | 42 |
| 有测试反查命中的端点数 | **470** |
| 无任何测试反查命中的端点数 | 416 |

- 界面可达真数 (Web 或 App 至少一处可达): **647 / 886** = 73.0%.

**类别判定规则 (机器启发式, 可复核, 见脚本 `classify()`):**

1. `界面可达` —— 该路径在 `ui/src` 或 `clients/*/src` 被字符串引用;
2. 否则 `上游同步` —— 路径命中 webhook/cloud/ota/slack/email/import/export/sync/ingest/migrate/connection-intent/external-object;
3. 否则 `内部RPC` —— 命中 mcp/gateway/tool-*/plugins/<id>/api|actions/rpc/internal/smoke/board-chat/host-preview;
4. 否则 `拨测` —— 仅被 tests/ 或 smoke 脚本引用;
5. 否则 `后台任务` —— 命中 runner/heartbeat/wakeup/worker/scheduler/attention/recovery/diagnostics 或在 server 内部被引用;
6. 否则 `未接线` —— 全仓仅出现在定义处。

**「产品总监视角用途一句话」是程序按 method + 资源词 + 子动作词生成的派生描述, 不是人工撰写; 用于快速扫读, 精确语义以路由实现为准。**

**方法与已知局限 (诚实声明):**

1. 反查基于「路径字符串归一化后精确匹配」(`${x}` 与 `:x` 都归一成 `*`)。ui/api 封装以 `/api` 为 base, 脚本同时登记 `/api` 前缀形态。
2. Web 列优先显示**页面/组件**, 通过 import 反向图把 `ui/src/api/*` 命中解析成消费它的页面; 只有 api 层而无页面消费者的标注 `[仅api层]`。
3. **动态拼接路径查不到**: 如头像 `<img src>` 由 helper 拼出、路径被完全参数化的调用, 会被判成「未接线」。命中数因此是**下界**。
4. 类别是启发式, 规则写死在 `classify()`; 宁可显式列出规则, 也不假装语义精确。

> 以下 14 个文件在 `server/src/routes/` 下但**未产出可解析端点** (纯 helper/schema, 或 regex 型路径, 如 `tasks-host-preview`): `server/src/routes/adapter-login-route-spine.ts`, `server/src/routes/authz.ts`, `server/src/routes/cases-schemas.ts`, `server/src/routes/company-import-paths.ts`, `server/src/routes/environment-selection.ts`, `server/src/routes/experimental-api-metadata.ts`, `server/src/routes/experimental-api-paths.ts`, `server/src/routes/index.ts`, `server/src/routes/issues-checkout-wakeup.ts`, `server/src/routes/org-chart-svg.ts`, `server/src/routes/pipelines-schemas.ts`, `server/src/routes/tasks-host-preview.ts`, `server/src/routes/workspace-command-authz.ts`, `server/src/routes/workspace-runtime-service-authz.ts`。

> 口径差异: 本轮解析 **886** 个端点; brief 基线 894。差额来自 regex 型路径 (无字符串字面量)、被 `router.use` 嵌套的路径, 及 3 处首参非字面量表达式。

---

## 逐端点全量映射表

| 方法+路径 | route 文件 | 用途 (产品总监视角) | Web 页面/组件 (ui/src) | App 屏幕 (clients) | 类别 | 测试覆盖 |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /_plugins/:pluginId/ui/*filePath` | `plugin-ui-static.ts` | 读取_plugins/ui | plugins/launchers.tsx, plugins/slots.tsx | — | 界面可达 | 无 |
| `GET /api/adapters` | `adapters.ts` | 读取适配器 | wizard-preview-main.tsx, lib/instance-settings.ts, pages/AdapterManager.tsx, pages/CompanyImport.tsx, +4 | — | 界面可达 | 有 |
| `DELETE /api/adapters/:type` | `adapters.ts` | 删除适配器 | pages/AdapterManager.tsx, pages/CompanyImport.tsx, components/new-agent/AgentBasicsDialog.tsx, components/new-agent/NewAgentSetup.tsx, +2 | — | 界面可达 | 有 |
| `GET /api/adapters/:type` | `adapters.ts` | 读取适配器 | pages/AdapterManager.tsx, pages/CompanyImport.tsx, components/new-agent/AgentBasicsDialog.tsx, components/new-agent/NewAgentSetup.tsx, +2 | — | 界面可达 | 有 |
| `PATCH /api/adapters/:type` | `adapters.ts` | 更新适配器 | pages/AdapterManager.tsx, pages/CompanyImport.tsx, components/new-agent/AgentBasicsDialog.tsx, components/new-agent/NewAgentSetup.tsx, +2 | — | 界面可达 | 有 |
| `GET /api/adapters/:type/config-schema` | `adapters.ts` | 读取适配器 (config-schema) | adapters/schema-config-fields.tsx | — | 界面可达 | 无 |
| `PATCH /api/adapters/:type/override` | `adapters.ts` | 更新适配器 (override) | pages/AdapterManager.tsx, pages/CompanyImport.tsx, components/new-agent/AgentBasicsDialog.tsx, components/new-agent/NewAgentSetup.tsx, +2 | — | 界面可达 | 无 |
| `POST /api/adapters/:type/reinstall` | `adapters.ts` | 创建适配器 (reinstall) | pages/AdapterManager.tsx, pages/CompanyImport.tsx, components/new-agent/AgentBasicsDialog.tsx, components/new-agent/NewAgentSetup.tsx, +2 | — | 界面可达 | 有 |
| `POST /api/adapters/:type/reload` | `adapters.ts` | 创建适配器 (reload) | pages/AdapterManager.tsx, pages/CompanyImport.tsx, components/new-agent/AgentBasicsDialog.tsx, components/new-agent/NewAgentSetup.tsx, +2 | — | 界面可达 | 有 |
| `GET /api/adapters/:type/ui-parser.js` | `adapters.ts` | 读取适配器 (ui-parser.js) | adapters/dynamic-loader.ts | — | 界面可达 | 无 |
| `POST /api/adapters/install` | `adapters.ts` | 创建适配器 (install) | pages/AdapterManager.tsx, pages/CompanyImport.tsx, components/new-agent/AgentBasicsDialog.tsx, components/new-agent/NewAgentSetup.tsx, +2 | — | 界面可达 | 有 |
| `GET /api/admin/users` | `access.ts` | 读取用户 (admin) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardClaim.tsx, +41 | — | 界面可达 | 有 |
| `GET /api/admin/users/:userId/company-access` | `access.ts` | 读取用户 (admin/company-access) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardClaim.tsx, +41 | — | 界面可达 | 无 |
| `PUT /api/admin/users/:userId/company-access` | `access.ts` | 更新用户 (admin/company-access) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardClaim.tsx, +41 | — | 界面可达 | 无 |
| `POST /api/admin/users/:userId/demote-instance-admin` | `access.ts` | 创建用户 (admin/demote-instance-admin) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardClaim.tsx, +41 | — | 界面可达 | 无 |
| `POST /api/admin/users/:userId/promote-instance-admin` | `access.ts` | 创建用户 (admin/promote-instance-admin) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardClaim.tsx, +41 | — | 界面可达 | 无 |
| `GET /api/agent-avatars/:version/:palette/:file` | `agent-avatars.ts` | 读取agent-avatars | — | — | 未接线 | 无 |
| `PATCH /api/agents/:agentId/budgets` | `costs.ts` | 更新预算 | — | — | 内部RPC | 无 |
| `DELETE /api/agents/:id` | `agents.ts` | 删除员工 | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/Agents.production.tsx, pages/Agents.tsx, +90 | expo/src/coolie.ts | 界面可达 | 有 |
| `GET /api/agents/:id` | `agents.ts` | 读取员工 | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/Agents.production.tsx, pages/Agents.tsx, +90 | expo/src/coolie.ts | 界面可达 | 有 |
| `PATCH /api/agents/:id` | `agents.ts` | 更新员工 | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/Agents.production.tsx, pages/Agents.tsx, +90 | expo/src/coolie.ts | 界面可达 | 有 |
| `POST /api/agents/:id/approve` | `agents.ts` | 创建员工 · 通过 | — | — | 拨测 | 有 |
| `POST /api/agents/:id/claude-login` | `agents.ts` | 创建员工 (claude-login) | — | — | 拨测 | 有 |
| `POST /api/agents/:id/clear-error` | `agents.ts` | 创建员工 (clear-error) | — | — | 拨测 | 有 |
| `GET /api/agents/:id/config-revisions` | `agents.ts` | 读取员工 (config-revisions) | — | — | 拨测 | 有 |
| `GET /api/agents/:id/config-revisions/:revisionId` | `agents.ts` | 读取员工 (config-revisions) | — | — | 内部RPC | 无 |
| `POST /api/agents/:id/config-revisions/:revisionId/rollback` | `agents.ts` | 创建员工 (config-revisions/rollback) | — | — | 拨测 | 有 |
| `GET /api/agents/:id/configuration` | `agents.ts` | 读取员工 (configuration) | — | expo/src/coolie.ts | 界面可达 | 有 |
| `POST /api/agents/:id/heartbeat/invoke` | `agents.ts` | 创建员工 (heartbeat/invoke) | — | — | 拨测 | 有 |
| `GET /api/agents/:id/instructions-bundle` | `agents.ts` | 读取员工 (instructions-bundle) | — | — | 拨测 | 有 |
| `PATCH /api/agents/:id/instructions-bundle` | `agents.ts` | 更新员工 (instructions-bundle) | — | — | 拨测 | 有 |
| `DELETE /api/agents/:id/instructions-bundle/file` | `agents.ts` | 删除员工 (instructions-bundle/file) | — | — | 拨测 | 有 |
| `GET /api/agents/:id/instructions-bundle/file` | `agents.ts` | 读取员工 (instructions-bundle/file) | — | — | 拨测 | 有 |
| `PUT /api/agents/:id/instructions-bundle/file` | `agents.ts` | 更新员工 (instructions-bundle/file) | — | — | 拨测 | 有 |
| `PATCH /api/agents/:id/instructions-path` | `agents.ts` | 更新员工 (instructions-path) | — | — | 拨测 | 有 |
| `GET /api/agents/:id/keys` | `agents.ts` | 读取员工 (keys) | — | — | 拨测 | 有 |
| `POST /api/agents/:id/keys` | `agents.ts` | 创建员工 (keys) | — | — | 拨测 | 有 |
| `DELETE /api/agents/:id/keys/:keyId` | `agents.ts` | 删除员工 (keys) | — | — | 拨测 | 有 |
| `POST /api/agents/:id/pause` | `agents.ts` | 创建员工 (pause) | — | — | 拨测 | 有 |
| `PATCH /api/agents/:id/permissions` | `agents.ts` | 更新员工 (permissions) | — | — | 拨测 | 有 |
| `POST /api/agents/:id/resume` | `agents.ts` | 创建员工 (resume) | — | — | 拨测 | 有 |
| `GET /api/agents/:id/runtime-state` | `agents.ts` | 读取员工 (runtime-state) | — | — | 内部RPC | 无 |
| `POST /api/agents/:id/runtime-state/reset-session` | `agents.ts` | 创建员工 (runtime-state/reset-session) | — | — | 内部RPC | 无 |
| `GET /api/agents/:id/skills` | `agents.ts` | 读取技能 | pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, components/BuiltInBundlePanel.tsx, components/skill-studio/AgentsUsingSkillDialog.tsx | expo/src/coolie.ts | 界面可达 | 无 |
| `POST /api/agents/:id/skills/sync` | `agents.ts` | 创建技能 · 同步 | — | — | 上游同步 | 有 |
| `GET /api/agents/:id/task-sessions` | `agents.ts` | 读取员工 (task-sessions) | — | — | 内部RPC | 无 |
| `POST /api/agents/:id/terminate` | `agents.ts` | 创建员工 (terminate) | — | — | 拨测 | 有 |
| `POST /api/agents/:id/wakeup` | `agents.ts` | 创建员工 (wakeup) | — | — | 拨测 | 有 |
| `GET /api/agents/me` | `agents.ts` | 读取员工 (me) | — | api-client/src/client.ts [仅api层] | 界面可达 | 有 |
| `POST /api/agents/me/connections/:connectionId/start-authorization` | `tool-access.ts` | 创建员工 (connections/start-authorization) | — | — | 未接线 | 无 |
| `POST /api/agents/me/connections/:connectionId/token` | `tool-access.ts` | 创建员工 (connections/token) | — | — | 拨测 | 有 |
| `GET /api/agents/me/inbox-lite` | `agents.ts` | 读取员工 (me/inbox-lite) | — | — | 内部RPC | 无 |
| `GET /api/agents/me/inbox/mine` | `agents.ts` | 读取收件箱 (me/mine) | — | — | 拨测 | 有 |
| `GET /api/agents/me/secret-proposals` | `secrets.ts` | 读取员工 (me/secret-proposals) | — | — | 拨测 | 有 |
| `POST /api/agents/me/secret-proposals` | `secrets.ts` | 创建员工 (me/secret-proposals) | — | — | 拨测 | 有 |
| `DELETE /api/agents/me/secret-proposals/:id` | `secrets.ts` | 删除员工 (me/secret-proposals) | — | — | 拨测 | 有 |
| `GET /api/agents/me/secrets` | `secrets.ts` | 读取密钥 (me) | — | — | 拨测 | 有 |
| `POST /api/agents/me/secrets/:key/value` | `secrets.ts` | 创建密钥 (me/value) | — | — | 未接线 | 无 |
| `GET /api/announcements/:id/animation` | `announcements.ts` | 读取公告 (animation) | hooks/useAnnouncementAnimation.ts | — | 界面可达 | 有 |
| `POST /api/announcements/:id/dismiss` | `announcements.ts` | 创建公告 · 忽略 | — | — | 拨测 | 有 |
| `GET /api/announcements/:id/image` | `announcements.ts` | 读取公告 (image) | components/AnnouncementCard.tsx | — | 界面可达 | 无 |
| `GET /api/announcements/current` | `announcements.ts` | 读取公告 (current) | — | — | 拨测 | 有 |
| `GET /api/approvals/:id` | `approvals.ts` | 读取审批 | pages/ApprovalDetail.tsx, pages/Approvals.tsx, pages/Inbox.tsx, pages/IssueDetail.tsx, +7 | api-client/src/client.ts [仅api层] | 界面可达 | 无 |
| `POST /api/approvals/:id/approve` | `approvals.ts` | 创建审批 · 通过 | pages/ApprovalDetail.tsx, pages/Approvals.tsx, pages/Inbox.tsx, pages/IssueDetail.tsx, +4 | api-client/src/client.ts [仅api层] | 界面可达 | 有 |
| `GET /api/approvals/:id/comments` | `approvals.ts` | 读取评论 | pages/ApprovalDetail.tsx, pages/Approvals.tsx, pages/Inbox.tsx, pages/IssueDetail.tsx, +4 | — | 界面可达 | 无 |
| `POST /api/approvals/:id/comments` | `approvals.ts` | 创建评论 | pages/ApprovalDetail.tsx, pages/Approvals.tsx, pages/Inbox.tsx, pages/IssueDetail.tsx, +4 | — | 界面可达 | 无 |
| `GET /api/approvals/:id/issues` | `approvals.ts` | 读取任务 | pages/ApprovalDetail.tsx, pages/Approvals.tsx, pages/Inbox.tsx, pages/IssueDetail.tsx, +4 | expo/src/coolie.ts | 界面可达 | 无 |
| `POST /api/approvals/:id/reject` | `approvals.ts` | 创建审批 · 驳回 | pages/ApprovalDetail.tsx, pages/Approvals.tsx, pages/Inbox.tsx, pages/IssueDetail.tsx, +4 | api-client/src/client.ts [仅api层] | 界面可达 | 无 |
| `POST /api/approvals/:id/request-revision` | `approvals.ts` | 创建审批 (request-revision) | pages/ApprovalDetail.tsx, pages/Approvals.tsx, pages/Inbox.tsx, pages/IssueDetail.tsx, +4 | — | 界面可达 | 无 |
| `POST /api/approvals/:id/resubmit` | `approvals.ts` | 创建审批 (resubmit) | pages/ApprovalDetail.tsx, pages/Approvals.tsx, pages/Inbox.tsx, pages/IssueDetail.tsx, +4 | — | 界面可达 | 无 |
| `GET /api/assets/:assetId/content` | `assets.ts` | 读取资产 (content) | lib/attention.ts, pages/CaseDetail.tsx, pages/Cases.tsx, components/CaseActivityFeed.tsx, +4 | — | 界面可达 | 有 |
| `DELETE /api/attachments/:attachmentId` | `issues.ts` | 删除附件 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 无 |
| `GET /api/attachments/:attachmentId/content` | `issues.ts` | 读取附件 (content) | pages/DesignGuide.tsx, lib/composer-draft.ts, components/EmailMessageCard.tsx | — | 界面可达 | 有 |
| `GET /api/auth/exchange` | `auth.ts` | 读取鉴权 (exchange) | — | expo/src/screens/WebContainerScreen.tsx | 界面可达 | 有 |
| `GET /api/auth/get-session` | `auth.ts` | 读取鉴权 (get-session) | plugins/bridge-init.ts, plugins/launchers.tsx, plugins/slots.tsx, pages/AgentChat.tsx, +37 | api-client/src/client.ts [仅api层] | 界面可达 | 有 |
| `GET /api/auth/profile` | `auth.ts` | 读取鉴权 (profile) | plugins/bridge-init.ts, plugins/launchers.tsx, plugins/slots.tsx, pages/AgentChat.tsx, +37 | — | 界面可达 | 有 |
| `PATCH /api/auth/profile` | `auth.ts` | 更新鉴权 (profile) | plugins/bridge-init.ts, plugins/launchers.tsx, plugins/slots.tsx, pages/AgentChat.tsx, +37 | — | 界面可达 | 有 |
| `POST /api/auth/register` | `auth.ts` | 创建鉴权 (register) | — | expo/src/coolie.ts | 界面可达 | 无 |
| `GET /api/auth/session-token` | `auth.ts` | 读取鉴权 (session-token) | — | expo/src/screens/WebLoginScreen.tsx | 界面可达 | 无 |
| `GET /api/board-api-keys` | `access.ts` | 读取board-api-keys | — | — | 拨测 | 有 |
| `POST /api/board-api-keys` | `access.ts` | 创建board-api-keys | — | — | 拨测 | 有 |
| `DELETE /api/board-api-keys/:keyId` | `access.ts` | 删除board-api-keys | — | — | 拨测 | 有 |
| `GET /api/board-claim/:token` | `access.ts` | 读取board-claim | pages/BoardClaim.tsx, plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, +41 | — | 界面可达 | 无 |
| `POST /api/board-claim/:token/claim` | `access.ts` | 创建board-claim/claim | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardClaim.tsx, +41 | — | 界面可达 | 无 |
| `DELETE /api/board/chat/conversation/:id` | `board-chat.ts` | 删除对话 (conversation) | — | api-client/src/client.ts [仅api层] | 界面可达 | 无 |
| `DELETE /api/board/chat/conversations` | `board-chat.ts` | 删除对话 (conversations) | — | — | 内部RPC | 无 |
| `POST /api/board/chat/stream` | `board-chat.ts` | 创建对话 · 流式 | pages/BoardChat.tsx | api-client/src/client.ts [仅api层] | 界面可达 | 有 |
| `POST /api/bootstrap/claim` | `access.ts` | 创建bootstrap/claim | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardClaim.tsx, +41 | — | 界面可达 | 有 |
| `GET /api/build/spec/:specId` | `build.ts` | 读取build/spec | — | — | 未接线 | 无 |
| `POST /api/build/spec/:specId/instantiate` | `build.ts` | 创建spec/instantiate | — | — | 拨测 | 有 |
| `POST /api/build/spec/start` | `build.ts` | 创建spec/start | pages/BoardChat.tsx | expo/src/screens/BoardChatScreen.tsx | 界面可达 | 有 |
| `POST /api/build/start` | `build.ts` | 创建build/start | pages/BoardChat.tsx | expo/src/screens/BoardChatScreen.tsx, expo/src/components/BuildModeModal.tsx | 界面可达 | 无 |
| `GET /api/cases/:caseId` | `pipelines.ts` | 读取案例 | lib/case-reference.ts, pages/CaseDetail.tsx, pages/Cases.tsx, components/CaseActivityFeed.tsx, +11 | — | 界面可达 | 有 |
| `PATCH /api/cases/:caseId` | `pipelines.ts` | 更新案例 | lib/case-reference.ts, pages/CaseDetail.tsx, pages/Cases.tsx, components/CaseActivityFeed.tsx, +11 | — | 界面可达 | 有 |
| `POST /api/cases/:caseId/acknowledge-drift` | `pipelines.ts` | 创建案例 (acknowledge-drift) | pages/PipelineSettings.tsx, pages/Pipelines.tsx, lib/pipeline-breakdown.ts, lib/pipeline-item-detail.ts, +3 | — | 界面可达 | 有 |
| `POST /api/cases/:caseId/automation/current-stage/rerun` | `pipelines.ts` | 创建案例 (current-stage/rerun) | pages/PipelineSettings.tsx, pages/Pipelines.tsx, lib/pipeline-breakdown.ts, lib/pipeline-item-detail.ts, +3 | — | 界面可达 | 无 |
| `POST /api/cases/:caseId/automation/retry` | `pipelines.ts` | 创建案例 · 重试 | pages/PipelineSettings.tsx, pages/Pipelines.tsx, lib/pipeline-breakdown.ts, lib/pipeline-item-detail.ts, +3 | — | 界面可达 | 无 |
| `GET /api/cases/:caseId/automation/retry-plan` | `pipelines.ts` | 读取案例 (automation/retry-plan) | pages/PipelineSettings.tsx, pages/Pipelines.tsx, lib/pipeline-breakdown.ts, lib/pipeline-item-detail.ts, +3 | — | 界面可达 | 无 |
| `POST /api/cases/:caseId/automations/:automationId/retry` | `pipelines.ts` | 创建案例 · 重试 | pages/PipelineSettings.tsx, pages/Pipelines.tsx, lib/pipeline-breakdown.ts, lib/pipeline-item-detail.ts, +3 | — | 界面可达 | 无 |
| `PUT /api/cases/:caseId/blockers` | `pipelines.ts` | 更新案例 · 阻塞 | — | — | 拨测 | 有 |
| `POST /api/cases/:caseId/breakdown` | `pipelines.ts` | 创建案例 (breakdown) | — | — | 未接线 | 无 |
| `GET /api/cases/:caseId/children` | `pipelines.ts` | 读取案例 (children) | pages/PipelineSettings.tsx, pages/Pipelines.tsx, lib/pipeline-breakdown.ts, lib/pipeline-item-detail.ts, +3 | — | 界面可达 | 有 |
| `GET /api/cases/:caseId/children/tree` | `pipelines.ts` | 读取案例 (children/tree) | pages/PipelineSettings.tsx, pages/Pipelines.tsx, lib/pipeline-breakdown.ts, lib/pipeline-item-detail.ts, +3 | — | 界面可达 | 无 |
| `POST /api/cases/:caseId/claim` | `pipelines.ts` | 创建案例 (claim) | — | — | 拨测 | 有 |
| `GET /api/cases/:caseId/context-pack` | `pipelines.ts` | 读取案例 (context-pack) | — | — | 拨测 | 有 |
| `GET /api/cases/:caseId/documents/:key` | `pipelines.ts` | 读取文档 | pages/CaseDetail.tsx, pages/Cases.tsx, components/CaseActivityFeed.tsx, components/CaseAttachmentsGallery.tsx, +10 | — | 界面可达 | 无 |
| `PUT /api/cases/:caseId/documents/:key` | `pipelines.ts` | 更新文档 | pages/CaseDetail.tsx, pages/Cases.tsx, components/CaseActivityFeed.tsx, components/CaseAttachmentsGallery.tsx, +10 | — | 界面可达 | 无 |
| `GET /api/cases/:caseId/documents/:key/revisions` | `pipelines.ts` | 读取文档 (revisions) | pages/CaseDetail.tsx, pages/Cases.tsx, components/CaseActivityFeed.tsx, components/CaseAttachmentsGallery.tsx, +10 | — | 界面可达 | 有 |
| `POST /api/cases/:caseId/documents/:key/revisions/:revisionId/restore` | `pipelines.ts` | 创建文档 (revisions/restore) | pages/CaseDetail.tsx, pages/Cases.tsx, components/CaseActivityFeed.tsx, components/CaseAttachmentsGallery.tsx, +10 | — | 界面可达 | 有 |
| `GET /api/cases/:caseId/events` | `pipelines.ts` | 读取事件 | pages/CaseDetail.tsx, pages/Cases.tsx, components/CaseActivityFeed.tsx, components/CaseAttachmentsGallery.tsx, +3 | — | 界面可达 | 有 |
| `GET /api/cases/:caseId/issue-links` | `pipelines.ts` | 读取案例 (issue-links) | pages/PipelineSettings.tsx, pages/Pipelines.tsx, lib/pipeline-breakdown.ts, lib/pipeline-item-detail.ts, +3 | — | 界面可达 | 有 |
| `POST /api/cases/:caseId/issue-links` | `pipelines.ts` | 创建案例 (issue-links) | pages/PipelineSettings.tsx, pages/Pipelines.tsx, lib/pipeline-breakdown.ts, lib/pipeline-item-detail.ts, +3 | — | 界面可达 | 有 |
| `DELETE /api/cases/:caseId/issue-links/:linkId` | `pipelines.ts` | 删除案例 (issue-links) | — | — | 拨测 | 有 |
| `POST /api/cases/:caseId/open-conversation` | `pipelines.ts` | 创建案例 (open-conversation) | pages/PipelineSettings.tsx, pages/Pipelines.tsx, lib/pipeline-breakdown.ts, lib/pipeline-item-detail.ts, +3 | — | 界面可达 | 有 |
| `GET /api/cases/:caseId/outputs` | `pipelines.ts` | 读取案例 (outputs) | pages/PipelineSettings.tsx, pages/Pipelines.tsx, lib/pipeline-breakdown.ts, lib/pipeline-item-detail.ts, +3 | — | 界面可达 | 无 |
| `POST /api/cases/:caseId/release` | `pipelines.ts` | 创建案例 (release) | — | — | 拨测 | 有 |
| `POST /api/cases/:caseId/resolve-suggestion` | `pipelines.ts` | 创建案例 (resolve-suggestion) | pages/PipelineSettings.tsx, pages/Pipelines.tsx, lib/pipeline-breakdown.ts, lib/pipeline-item-detail.ts, +3 | — | 界面可达 | 有 |
| `POST /api/cases/:caseId/review` | `pipelines.ts` | 创建案例 (review) | pages/PipelineSettings.tsx, pages/Pipelines.tsx, lib/pipeline-breakdown.ts, lib/pipeline-item-detail.ts, +3 | — | 界面可达 | 有 |
| `GET /api/cases/:caseId/rollup` | `pipelines.ts` | 读取案例 (rollup) | — | — | 拨测 | 有 |
| `POST /api/cases/:caseId/suggest-transition` | `pipelines.ts` | 创建案例 (suggest-transition) | — | — | 拨测 | 有 |
| `POST /api/cases/:caseId/transition` | `pipelines.ts` | 创建案例 (transition) | pages/PipelineSettings.tsx, pages/Pipelines.tsx, lib/pipeline-breakdown.ts, lib/pipeline-item-detail.ts, +3 | — | 界面可达 | 有 |
| `GET /api/cases/:id` | `cases.ts` | 读取案例 | lib/case-reference.ts, pages/CaseDetail.tsx, pages/Cases.tsx, components/CaseActivityFeed.tsx, +11 | — | 界面可达 | 有 |
| `PATCH /api/cases/:id` | `cases.ts` | 更新案例 | lib/case-reference.ts, pages/CaseDetail.tsx, pages/Cases.tsx, components/CaseActivityFeed.tsx, +11 | — | 界面可达 | 有 |
| `POST /api/cases/:id/attachments` | `cases.ts` | 创建附件 | — | — | 拨测 | 有 |
| `DELETE /api/cases/:id/documents/:key` | `cases.ts` | 删除文档 | pages/CaseDetail.tsx, pages/Cases.tsx, components/CaseActivityFeed.tsx, components/CaseAttachmentsGallery.tsx, +10 | — | 界面可达 | 无 |
| `GET /api/cases/:id/documents/:key` | `cases.ts` | 读取文档 | pages/CaseDetail.tsx, pages/Cases.tsx, components/CaseActivityFeed.tsx, components/CaseAttachmentsGallery.tsx, +10 | — | 界面可达 | 无 |
| `PUT /api/cases/:id/documents/:key` | `cases.ts` | 更新文档 | pages/CaseDetail.tsx, pages/Cases.tsx, components/CaseActivityFeed.tsx, components/CaseAttachmentsGallery.tsx, +10 | — | 界面可达 | 无 |
| `GET /api/cases/:id/documents/:key/annotations` | `cases.ts` | 读取文档 (annotations) | hooks/useDocumentAnnotationMutations.ts, components/DocumentAnnotationPanel.tsx, components/DocumentAnnotationPopover.tsx, components/IssueDocumentAnnotations.tsx, +1 | — | 界面可达 | 无 |
| `POST /api/cases/:id/documents/:key/annotations` | `cases.ts` | 创建文档 (annotations) | hooks/useDocumentAnnotationMutations.ts, components/DocumentAnnotationPanel.tsx, components/DocumentAnnotationPopover.tsx, components/IssueDocumentAnnotations.tsx, +1 | — | 界面可达 | 无 |
| `GET /api/cases/:id/documents/:key/annotations/:threadId` | `cases.ts` | 读取文档 (annotations) | — | — | 未接线 | 无 |
| `PATCH /api/cases/:id/documents/:key/annotations/:threadId` | `cases.ts` | 更新文档 (annotations) | — | — | 未接线 | 无 |
| `POST /api/cases/:id/documents/:key/annotations/:threadId/comments` | `cases.ts` | 创建评论 (annotations) | — | — | 未接线 | 无 |
| `POST /api/cases/:id/documents/:key/lock` | `cases.ts` | 创建文档 (lock) | pages/CaseDetail.tsx, pages/Cases.tsx, components/CaseActivityFeed.tsx, components/CaseAttachmentsGallery.tsx, +3 | — | 界面可达 | 无 |
| `GET /api/cases/:id/documents/:key/revisions` | `cases.ts` | 读取文档 (revisions) | pages/CaseDetail.tsx, pages/Cases.tsx, components/CaseActivityFeed.tsx, components/CaseAttachmentsGallery.tsx, +10 | — | 界面可达 | 有 |
| `POST /api/cases/:id/documents/:key/revisions/:revisionId/restore` | `cases.ts` | 创建文档 (revisions/restore) | pages/CaseDetail.tsx, pages/Cases.tsx, components/CaseActivityFeed.tsx, components/CaseAttachmentsGallery.tsx, +10 | — | 界面可达 | 有 |
| `POST /api/cases/:id/documents/:key/unlock` | `cases.ts` | 创建文档 (unlock) | pages/CaseDetail.tsx, pages/Cases.tsx, components/CaseActivityFeed.tsx, components/CaseAttachmentsGallery.tsx, +3 | — | 界面可达 | 无 |
| `GET /api/cases/:id/events` | `cases.ts` | 读取事件 | pages/CaseDetail.tsx, pages/Cases.tsx, components/CaseActivityFeed.tsx, components/CaseAttachmentsGallery.tsx, +3 | — | 界面可达 | 有 |
| `POST /api/cases/:id/links` | `cases.ts` | 创建案例 (links) | — | — | 拨测 | 有 |
| `GET /api/chat-endpoints/:endpointId` | `chat-channels.ts` | 读取chat-endpoints | pages/apps/Browse.tsx, pages/apps/chat/ChatEndpointDetail.tsx, pages/apps/chat/ChatEndpointSetup.tsx, pages/apps/chat/ChatIdentityConfirm.tsx, +8 | — | 界面可达 | 有 |
| `PATCH /api/chat-endpoints/:endpointId` | `chat-channels.ts` | 更新chat-endpoints | pages/apps/Browse.tsx, pages/apps/chat/ChatEndpointDetail.tsx, pages/apps/chat/ChatEndpointSetup.tsx, pages/apps/chat/ChatIdentityConfirm.tsx, +8 | — | 界面可达 | 有 |
| `POST /api/chat-endpoints/:endpointId/actions/:actionId/resolve` | `chat-channels.ts` | 创建actions/resolve · 裁决 | pages/apps/Browse.tsx, pages/apps/chat/ChatEndpointDetail.tsx, pages/apps/chat/ChatEndpointSetup.tsx, pages/apps/chat/ChatIdentityConfirm.tsx, +8 | — | 界面可达 | 有 |
| `GET /api/chat-endpoints/:endpointId/activity` | `chat-channels.ts` | 读取动态 (chat-endpoints) | pages/apps/Browse.tsx, pages/apps/chat/ChatEndpointDetail.tsx, pages/apps/chat/ChatEndpointSetup.tsx, pages/apps/chat/ChatIdentityConfirm.tsx, +8 | — | 界面可达 | 有 |
| `GET /api/chat-endpoints/:endpointId/conversations` | `chat-channels.ts` | 读取chat-endpoints/conversations | pages/apps/Browse.tsx, pages/apps/chat/ChatEndpointDetail.tsx, pages/apps/chat/ChatEndpointSetup.tsx, pages/apps/chat/ChatIdentityConfirm.tsx, +8 | — | 界面可达 | 有 |
| `POST /api/chat-endpoints/:endpointId/conversations/:conversationId/publications` | `chat-channels.ts` | 创建conversations/publications | pages/apps/Browse.tsx, pages/apps/chat/ChatEndpointDetail.tsx, pages/apps/chat/ChatEndpointSetup.tsx, pages/apps/chat/ChatIdentityConfirm.tsx, +8 | — | 界面可达 | 有 |
| `GET /api/chat-endpoints/:endpointId/conversations/:conversationId/publications/:publicationId/status` | `chat-channels.ts` | 读取状态 (conversations/publications) | pages/apps/Browse.tsx, pages/apps/chat/ChatEndpointDetail.tsx, pages/apps/chat/ChatEndpointSetup.tsx, pages/apps/chat/ChatIdentityConfirm.tsx, +8 | — | 界面可达 | 有 |
| `POST /api/chat-endpoints/:endpointId/deliveries/:deliveryId/replay` | `chat-channels.ts` | 创建deliveries/replay | pages/apps/Browse.tsx, pages/apps/chat/ChatEndpointDetail.tsx, pages/apps/chat/ChatEndpointSetup.tsx, pages/apps/chat/ChatIdentityConfirm.tsx, +8 | — | 界面可达 | 有 |
| `POST /api/chat-endpoints/:endpointId/finish` | `chat-channels.ts` | 创建chat-endpoints/finish | pages/apps/Browse.tsx, pages/apps/chat/ChatEndpointDetail.tsx, pages/apps/chat/ChatEndpointSetup.tsx, pages/apps/chat/ChatIdentityConfirm.tsx, +8 | — | 界面可达 | 有 |
| `POST /api/chat-endpoints/:endpointId/github/app` | `chat-channels.ts` | 创建github/app | — | — | 未接线 | 无 |
| `GET /api/chat-endpoints/:endpointId/github/configuration` | `chat-channels.ts` | 读取github/configuration | — | — | 未接线 | 无 |
| `PUT /api/chat-endpoints/:endpointId/github/configuration` | `chat-channels.ts` | 更新github/configuration | — | — | 未接线 | 无 |
| `POST /api/chat-endpoints/:endpointId/github/identity` | `chat-channels.ts` | 创建github/identity | — | — | 未接线 | 无 |
| `POST /api/chat-endpoints/:endpointId/github/people/lookup` | `chat-channels.ts` | 创建people/lookup | — | — | 未接线 | 无 |
| `GET /api/chat-endpoints/:endpointId/github/personal-connections` | `chat-channels.ts` | 读取github/personal-connections | — | — | 未接线 | 无 |
| `PUT /api/chat-endpoints/:endpointId/github/progress` | `chat-channels.ts` | 更新github/progress | — | — | 未接线 | 无 |
| `POST /api/chat-endpoints/:endpointId/github/registration` | `chat-channels.ts` | 创建github/registration | — | — | 未接线 | 无 |
| `POST /api/chat-endpoints/:endpointId/github/repositories/refresh` | `chat-channels.ts` | 创建repositories/refresh · 刷新 | — | — | 未接线 | 无 |
| `GET /api/chat-endpoints/:endpointId/github/reviews` | `chat-channels.ts` | 读取github/reviews | — | — | 未接线 | 无 |
| `POST /api/chat-endpoints/:endpointId/github/verify` | `chat-channels.ts` | 创建github/verify | — | — | 未接线 | 无 |
| `POST /api/chat-endpoints/:endpointId/photon/inspect` | `chat-channels.ts` | 创建photon/inspect | pages/apps/Browse.tsx, pages/apps/chat/ChatEndpointDetail.tsx, pages/apps/chat/ChatEndpointSetup.tsx, pages/apps/chat/ChatIdentityConfirm.tsx, +8 | — | 界面可达 | 有 |
| `GET /api/chat-endpoints/:endpointId/principals` | `chat-channels.ts` | 读取chat-endpoints/principals | pages/apps/Browse.tsx, pages/apps/chat/ChatEndpointDetail.tsx, pages/apps/chat/ChatEndpointSetup.tsx, pages/apps/chat/ChatIdentityConfirm.tsx, +8 | — | 界面可达 | 有 |
| `DELETE /api/chat-endpoints/:endpointId/principals/:principalId/link` | `chat-channels.ts` | 删除principals/link | pages/apps/Browse.tsx, pages/apps/chat/ChatEndpointDetail.tsx, pages/apps/chat/ChatEndpointSetup.tsx, pages/apps/chat/ChatIdentityConfirm.tsx, +8 | — | 界面可达 | 有 |
| `POST /api/chat-endpoints/:endpointId/principals/:principalId/link-intent` | `chat-channels.ts` | 创建principals/link-intent | pages/apps/Browse.tsx, pages/apps/chat/ChatEndpointDetail.tsx, pages/apps/chat/ChatEndpointSetup.tsx, pages/apps/chat/ChatIdentityConfirm.tsx, +8 | — | 界面可达 | 有 |
| `POST /api/chat-endpoints/:endpointId/publications/:publicationId/replay` | `chat-channels.ts` | 创建publications/replay | pages/apps/Browse.tsx, pages/apps/chat/ChatEndpointDetail.tsx, pages/apps/chat/ChatEndpointSetup.tsx, pages/apps/chat/ChatIdentityConfirm.tsx, +8 | — | 界面可达 | 有 |
| `POST /api/chat-endpoints/:endpointId/publications/:publicationId/resolve` | `chat-channels.ts` | 创建publications/resolve · 裁决 | pages/apps/Browse.tsx, pages/apps/chat/ChatEndpointDetail.tsx, pages/apps/chat/ChatEndpointSetup.tsx, pages/apps/chat/ChatIdentityConfirm.tsx, +8 | — | 界面可达 | 有 |
| `GET /api/chat-endpoints/:endpointId/resources` | `chat-channels.ts` | 读取chat-endpoints/resources | pages/apps/Browse.tsx, pages/apps/chat/ChatEndpointDetail.tsx, pages/apps/chat/ChatEndpointSetup.tsx, pages/apps/chat/ChatIdentityConfirm.tsx, +8 | — | 界面可达 | 有 |
| `PUT /api/chat-endpoints/:endpointId/resources` | `chat-channels.ts` | 更新chat-endpoints/resources | pages/apps/Browse.tsx, pages/apps/chat/ChatEndpointDetail.tsx, pages/apps/chat/ChatEndpointSetup.tsx, pages/apps/chat/ChatIdentityConfirm.tsx, +8 | — | 界面可达 | 有 |
| `POST /api/chat-endpoints/:endpointId/setup` | `chat-channels.ts` | 创建chat-endpoints/setup | pages/apps/Browse.tsx, pages/apps/chat/ChatEndpointDetail.tsx, pages/apps/chat/ChatEndpointSetup.tsx, pages/apps/chat/ChatIdentityConfirm.tsx, +8 | — | 界面可达 | 有 |
| `POST /api/chat-endpoints/:endpointId/setup-secret` | `chat-channels.ts` | 创建chat-endpoints/setup-secret | pages/apps/Browse.tsx, pages/apps/chat/ChatEndpointDetail.tsx, pages/apps/chat/ChatEndpointSetup.tsx, pages/apps/chat/ChatIdentityConfirm.tsx, +8 | — | 界面可达 | 有 |
| `POST /api/chat-endpoints/:endpointId/test` | `chat-channels.ts` | 创建chat-endpoints/test | pages/apps/Browse.tsx, pages/apps/chat/ChatEndpointDetail.tsx, pages/apps/chat/ChatEndpointSetup.tsx, pages/apps/chat/ChatIdentityConfirm.tsx, +8 | — | 界面可达 | 有 |
| `GET /api/chat-endpoints/:endpointId/test-status` | `chat-channels.ts` | 读取chat-endpoints/test-status | pages/apps/Browse.tsx, pages/apps/chat/ChatEndpointDetail.tsx, pages/apps/chat/ChatEndpointSetup.tsx, pages/apps/chat/ChatIdentityConfirm.tsx, +8 | — | 界面可达 | 有 |
| `POST /api/chat-identity-links/confirm` | `chat-channels.ts` | 创建chat-identity-links/confirm | pages/apps/Browse.tsx, pages/apps/chat/ChatEndpointDetail.tsx, pages/apps/chat/ChatEndpointSetup.tsx, pages/apps/chat/ChatIdentityConfirm.tsx, +8 | — | 界面可达 | 有 |
| `GET /api/chat-identity-links/preview` | `chat-channels.ts` | 读取chat-identity-links/preview · 预览 | pages/apps/Browse.tsx, pages/apps/chat/ChatEndpointDetail.tsx, pages/apps/chat/ChatEndpointSetup.tsx, pages/apps/chat/ChatIdentityConfirm.tsx, +8 | — | 界面可达 | 有 |
| `POST /api/chat-identity-links/request-access` | `chat-channels.ts` | 创建chat-identity-links/request-access | pages/apps/Browse.tsx, pages/apps/chat/ChatEndpointDetail.tsx, pages/apps/chat/ChatEndpointSetup.tsx, pages/apps/chat/ChatIdentityConfirm.tsx, +8 | — | 界面可达 | 有 |
| `POST /api/chat-webhooks/:publicId/:provider` | `chat-channels.ts` | 创建chat-webhooks | — | — | 拨测 | 有 |
| `POST /api/chat-webhooks/agentmail/:publicId` | `email.ts` | 创建chat-webhooks/agentmail | — | — | 未接线 | 无 |
| `POST /api/cli-auth/challenges` | `access.ts` | 创建cli-auth/challenges | — | — | 拨测 | 有 |
| `GET /api/cli-auth/challenges/:id` | `access.ts` | 读取cli-auth/challenges | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardClaim.tsx, +41 | — | 界面可达 | 无 |
| `POST /api/cli-auth/challenges/:id/approve` | `access.ts` | 创建challenges/approve · 通过 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardClaim.tsx, +41 | — | 界面可达 | 无 |
| `POST /api/cli-auth/challenges/:id/cancel` | `access.ts` | 创建challenges/cancel · 取消 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardClaim.tsx, +41 | — | 界面可达 | 无 |
| `GET /api/cli-auth/me` | `access.ts` | 读取cli-auth/me | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardClaim.tsx, +41 | — | 界面可达 | 无 |
| `POST /api/cli-auth/revoke-current` | `access.ts` | 创建cli-auth/revoke-current | — | — | 拨测 | 有 |
| `GET /api/cloud/stacks` | `cloud.ts` | 读取云端 (stacks) | components/SidebarCompanyMenu.production.tsx, components/SidebarCompanyMenu.tsx | — | 界面可达 | 有 |
| `GET /api/companies` | `companies.ts` | 读取公司 | wizard-preview-main.tsx, components/CompanySwitcher.tsx, pages/Companies.tsx, pages/CompanyExport.tsx, +48 | expo/src/screens/WebLoginScreen.tsx | 界面可达 | 有 |
| `POST /api/companies` | `companies.ts` | 创建公司 | wizard-preview-main.tsx, components/CompanySwitcher.tsx, pages/Companies.tsx, pages/CompanyExport.tsx, +48 | expo/src/screens/WebLoginScreen.tsx | 界面可达 | 有 |
| `DELETE /api/companies/:companyId` | `companies.ts` | 删除公司 | pages/Companies.tsx, pages/CompanyExport.tsx, pages/CompanyImport.tsx, pages/CompanySettings.tsx, +2 | api-client/src/client.ts [仅api层] | 界面可达 | 有 |
| `GET /api/companies/:companyId` | `companies.ts` | 读取公司 | pages/Companies.tsx, pages/CompanyExport.tsx, pages/CompanyImport.tsx, pages/CompanySettings.tsx, +2 | api-client/src/client.ts [仅api层] | 界面可达 | 有 |
| `PATCH /api/companies/:companyId` | `companies.ts` | 更新公司 | pages/Companies.tsx, pages/CompanyExport.tsx, pages/CompanyImport.tsx, pages/CompanySettings.tsx, +2 | api-client/src/client.ts [仅api层] | 界面可达 | 有 |
| `GET /api/companies/:companyId/activity` | `activity.ts` | 读取动态 | — | — | 内部RPC | 无 |
| `POST /api/companies/:companyId/activity` | `activity.ts` | 创建动态 | — | — | 内部RPC | 无 |
| `GET /api/companies/:companyId/adapters/:type/auth-signal` | `agents.ts` | 读取适配器 (auth-signal) | plugins/bridge-init.ts, pages/AgentChat.tsx, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, +80 | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/adapters/:type/detect-model` | `agents.ts` | 读取适配器 (detect-model) | plugins/bridge-init.ts, pages/AgentChat.tsx, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, +80 | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/adapters/:type/login-sessions` | `agents.ts` | 创建适配器 (login-sessions) | plugins/bridge-init.ts, pages/AgentChat.tsx, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, +80 | — | 界面可达 | 有 |
| `GET /api/companies/:companyId/adapters/:type/login-sessions/:sessionId` | `agents.ts` | 读取适配器 (login-sessions) | plugins/bridge-init.ts, pages/AgentChat.tsx, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, +80 | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/adapters/:type/login-sessions/:sessionId/cancel` | `agents.ts` | 创建适配器 · 取消 | plugins/bridge-init.ts, pages/AgentChat.tsx, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, +80 | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/adapters/:type/login-sessions/active` | `agents.ts` | 读取适配器 (login-sessions/active) | plugins/bridge-init.ts, pages/AgentChat.tsx, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, +80 | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/adapters/:type/models` | `agents.ts` | 读取适配器 (models) | plugins/bridge-init.ts, pages/AgentChat.tsx, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, +80 | api-client/src/client.ts [仅api层] | 界面可达 | 无 |
| `POST /api/companies/:companyId/adapters/:type/test-environment` | `agents.ts` | 创建适配器 (test-environment) | plugins/bridge-init.ts, pages/AgentChat.tsx, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, +80 | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/agent-configurations` | `agents.ts` | 读取公司 (agent-configurations) | plugins/bridge-init.ts, pages/AgentChat.tsx, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, +80 | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/agent-hires` | `agents.ts` | 创建公司 (agent-hires) | plugins/bridge-init.ts, pages/AgentChat.tsx, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, +80 | — | 界面可达 | 有 |
| `GET /api/companies/:companyId/agents` | `agents.ts` | 读取员工 | plugins/bridge-init.ts, pages/AgentChat.tsx, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, +80 | api-client/src/client.ts [仅api层] | 界面可达 | 有 |
| `POST /api/companies/:companyId/agents` | `agents.ts` | 创建员工 | plugins/bridge-init.ts, pages/AgentChat.tsx, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, +80 | api-client/src/client.ts [仅api层] | 界面可达 | 有 |
| `POST /api/companies/:companyId/agents/bulk` | `agents.ts` | 创建员工 (bulk) | — | — | 未接线 | 无 |
| `GET /api/companies/:companyId/ai-connections` | `ai-connections.ts` | 读取AI 连接 | components/OnboardingWizard.tsx, components/onboarding/SavedProviderKeySelect.tsx, components/new-agent/AgentProviderConnection.tsx, components/ai-connections/AiConnectionCredentialStep.tsx, +3 | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/ai-connections` | `ai-connections.ts` | 创建AI 连接 | components/OnboardingWizard.tsx, components/onboarding/SavedProviderKeySelect.tsx, components/new-agent/AgentProviderConnection.tsx, components/ai-connections/AiConnectionCredentialStep.tsx, +3 | — | 界面可达 | 有 |
| `GET /api/companies/:companyId/ai-connections/:connectionId/active-runs` | `ai-connections.ts` | 读取AI 连接 (active-runs) | components/OnboardingWizard.tsx, components/onboarding/SavedProviderKeySelect.tsx, components/new-agent/AgentProviderConnection.tsx, components/ai-connections/AiConnectionCredentialStep.tsx, +3 | — | 界面可达 | 有 |
| `PUT /api/companies/:companyId/ai-connections/default` | `ai-connections.ts` | 更新AI 连接 (default) | components/OnboardingWizard.tsx, components/onboarding/SavedProviderKeySelect.tsx, components/new-agent/AgentProviderConnection.tsx, components/ai-connections/AiConnectionCredentialStep.tsx, +3 | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/ai-connections/local` | `ai-connections.ts` | 创建AI 连接 (local) | components/OnboardingWizard.tsx, components/onboarding/SavedProviderKeySelect.tsx, components/new-agent/AgentProviderConnection.tsx, components/ai-connections/AiConnectionCredentialStep.tsx, +3 | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/ai-connections/local/attempts` | `ai-connections.ts` | 创建AI 连接 (local/attempts) | components/OnboardingWizard.tsx, components/onboarding/SavedProviderKeySelect.tsx, components/new-agent/AgentProviderConnection.tsx, components/ai-connections/AiConnectionCredentialStep.tsx, +3 | — | 界面可达 | 无 |
| `DELETE /api/companies/:companyId/ai-connections/local/attempts/:sessionId` | `ai-connections.ts` | 删除AI 连接 (local/attempts) | components/OnboardingWizard.tsx, components/onboarding/SavedProviderKeySelect.tsx, components/new-agent/AgentProviderConnection.tsx, components/ai-connections/AiConnectionCredentialStep.tsx, +3 | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/ai-connections/local/check` | `ai-connections.ts` | 创建AI 连接 (local/check) | components/OnboardingWizard.tsx, components/onboarding/SavedProviderKeySelect.tsx, components/new-agent/AgentProviderConnection.tsx, components/ai-connections/AiConnectionCredentialStep.tsx, +3 | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/ai-connections/login/:sessionId` | `ai-connections.ts` | 读取AI 连接 (login) | components/OnboardingWizard.tsx, components/onboarding/SavedProviderKeySelect.tsx, components/new-agent/AgentProviderConnection.tsx, components/ai-connections/AiConnectionCredentialStep.tsx, +3 | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/approvals` | `approvals.ts` | 读取审批 | pages/ApprovalDetail.tsx, pages/Approvals.tsx, pages/Inbox.tsx, pages/IssueDetail.tsx, +4 | api-client/src/client.ts [仅api层] | 界面可达 | 无 |
| `POST /api/companies/:companyId/approvals` | `approvals.ts` | 创建审批 | pages/ApprovalDetail.tsx, pages/Approvals.tsx, pages/Inbox.tsx, pages/IssueDetail.tsx, +4 | api-client/src/client.ts [仅api层] | 界面可达 | 无 |
| `POST /api/companies/:companyId/archive` | `companies.ts` | 创建公司 · 归档 | pages/Companies.tsx, pages/CompanyExport.tsx, pages/CompanyImport.tsx, pages/CompanySettings.tsx, +2 | — | 界面可达 | 有 |
| `GET /api/companies/:companyId/artifacts` | `companies.ts` | 读取产物 | pages/Artifacts.tsx, components/artifacts/ArtifactCard.tsx, components/artifacts/ArtifactGroupCard.tsx | api-client/src/client.ts [仅api层] | 界面可达 | 有 |
| `POST /api/companies/:companyId/assets/images` | `assets.ts` | 创建资产 (images) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/CompanySettings.tsx, pages/GoalDetail.tsx, +5 | — | 界面可达 | 有 |
| `GET /api/companies/:companyId/attention` | `attention.ts` | 读取公司 (attention) | — | — | 拨测 | 有 |
| `GET /api/companies/:companyId/audit/agent-actions` | `activity.ts` | 读取公司 (audit/agent-actions) | — | — | 拨测 | 有 |
| `GET /api/companies/:companyId/audit/agent-actions.csv` | `activity.ts` | 读取公司 (audit/agent-actions.csv) | — | — | 拨测 | 有 |
| `PATCH /api/companies/:companyId/branding` | `companies.ts` | 更新公司 (branding) | pages/Companies.tsx, pages/CompanyExport.tsx, pages/CompanyImport.tsx, pages/CompanySettings.tsx, +2 | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/budget-incidents/:incidentId/resolve` | `costs.ts` | 创建公司 · 裁决 | pages/AgentDetail.production.tsx, pages/Costs.production.tsx, pages/Costs.tsx, pages/ProjectDetail.tsx | — | 界面可达 | 无 |
| `PATCH /api/companies/:companyId/budgets` | `costs.ts` | 更新预算 | — | — | 内部RPC | 无 |
| `GET /api/companies/:companyId/budgets/overview` | `costs.ts` | 读取预算 (overview) | pages/AgentDetail.production.tsx, pages/Costs.production.tsx, pages/Costs.tsx, pages/ProjectDetail.tsx | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/budgets/policies` | `costs.ts` | 创建预算 (policies) | pages/AgentDetail.production.tsx, pages/Costs.production.tsx, pages/Costs.tsx, pages/ProjectDetail.tsx | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/built-in-agents` | `built-in-agents.ts` | 读取公司 (built-in-agents) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/Agents.production.tsx, pages/Agents.tsx, +7 | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/built-in-agents/:key/provision` | `built-in-agents.ts` | 创建公司 (built-in-agents/provision) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/Agents.production.tsx, pages/Agents.tsx, +7 | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/built-in-agents/:key/reconcile` | `built-in-agents.ts` | 创建公司 (built-in-agents/reconcile) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/Agents.production.tsx, pages/Agents.tsx, +7 | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/built-in-agents/:key/reset` | `built-in-agents.ts` | 创建公司 (built-in-agents/reset) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/Agents.production.tsx, pages/Agents.tsx, +7 | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/built-in-agents/:key/routines/:routineKey/disable` | `built-in-agents.ts` | 创建例行 (built-in-agents/disable) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/Agents.production.tsx, pages/Agents.tsx, +7 | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/built-in-agents/:key/routines/:routineKey/enable` | `built-in-agents.ts` | 创建例行 (built-in-agents/enable) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/Agents.production.tsx, pages/Agents.tsx, +7 | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/built-in-agents/:key/routines/:routineKey/run` | `built-in-agents.ts` | 创建运行 (built-in-agents) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/Agents.production.tsx, pages/Agents.tsx, +7 | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/built-in-agents/:key/status` | `built-in-agents.ts` | 读取状态 (built-in-agents) | — | — | 未接线 | 无 |
| `GET /api/companies/:companyId/case-events` | `pipelines.ts` | 读取公司 (case-events) | — | — | 未接线 | 无 |
| `GET /api/companies/:companyId/cases` | `cases.ts` | 读取案例 | pages/CaseDetail.tsx, pages/Cases.tsx, components/CaseActivityFeed.tsx, components/CaseAttachmentsGallery.tsx, +3 | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/cases` | `cases.ts` | 创建案例 | pages/CaseDetail.tsx, pages/Cases.tsx, components/CaseActivityFeed.tsx, components/CaseAttachmentsGallery.tsx, +3 | — | 界面可达 | 有 |
| `GET /api/companies/:companyId/chat-endpoints` | `chat-channels.ts` | 读取公司 (chat-endpoints) | pages/apps/Browse.tsx, pages/apps/chat/ChatEndpointDetail.tsx, pages/apps/chat/ChatEndpointSetup.tsx, pages/apps/chat/ChatIdentityConfirm.tsx, +8 | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/chat-endpoints` | `chat-channels.ts` | 创建公司 (chat-endpoints) | pages/apps/Browse.tsx, pages/apps/chat/ChatEndpointDetail.tsx, pages/apps/chat/ChatEndpointSetup.tsx, pages/apps/chat/ChatIdentityConfirm.tsx, +8 | — | 界面可达 | 有 |
| `GET /api/companies/:companyId/claude-oauth-token-status` | `agents.ts` | 读取公司 (claude-oauth-token-status) | plugins/bridge-init.ts, pages/AgentChat.tsx, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, +80 | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/cost-events` | `costs.ts` | 创建公司 (cost-events) | — | — | 未接线 | 无 |
| `GET /api/companies/:companyId/costs/by-agent` | `costs.ts` | 读取成本 (by-agent) | pages/Costs.production.tsx, pages/Costs.tsx | expo/src/coolie.ts | 界面可达 | 无 |
| `GET /api/companies/:companyId/costs/by-agent-model` | `costs.ts` | 读取成本 (by-agent-model) | pages/Costs.production.tsx, pages/Costs.tsx | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/costs/by-biller` | `costs.ts` | 读取成本 (by-biller) | pages/Costs.production.tsx, pages/Costs.tsx | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/costs/by-project` | `costs.ts` | 读取成本 (by-project) | pages/Costs.production.tsx, pages/Costs.tsx | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/costs/by-provider` | `costs.ts` | 读取成本 (by-provider) | pages/Costs.production.tsx, pages/Costs.tsx | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/costs/finance-by-biller` | `costs.ts` | 读取成本 (finance-by-biller) | pages/Costs.production.tsx, pages/Costs.tsx | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/costs/finance-by-kind` | `costs.ts` | 读取成本 (finance-by-kind) | pages/Costs.production.tsx, pages/Costs.tsx | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/costs/finance-events` | `costs.ts` | 读取成本 (finance-events) | pages/Costs.production.tsx, pages/Costs.tsx | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/costs/finance-summary` | `costs.ts` | 读取成本 (finance-summary) | pages/Costs.production.tsx, pages/Costs.tsx | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/costs/quota-windows` | `costs.ts` | 读取成本 (quota-windows) | pages/Costs.production.tsx, pages/Costs.tsx | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/costs/summary` | `costs.ts` | 读取成本 (summary) | pages/Costs.production.tsx, pages/Costs.tsx | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/costs/window-spend` | `costs.ts` | 读取成本 (window-spend) | pages/Costs.production.tsx, pages/Costs.tsx | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/dashboard` | `dashboard.ts` | 读取驾驶舱 | pages/Dashboard.tsx, pages/Inbox.tsx, pages/LegacyInbox.tsx, hooks/useInboxBadge.ts | api-client/src/client.ts [仅api层] | 界面可达 | 有 |
| `POST /api/companies/:companyId/decision-archive-proposals` | `decisions.ts` | 创建公司 (decision-archive-proposals) | pages/DecisionQueuePage.tsx, components/DecisionQueueRail.tsx, components/DecisionShelf.tsx, components/DecisionTriageStrip.tsx | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/decision-bundles` | `decisions.ts` | 创建公司 (decision-bundles) | — | — | 未接线 | 无 |
| `GET /api/companies/:companyId/decision-queue-seed-rules` | `decision-queues.ts` | 读取公司 (decision-queue-seed-rules) | pages/DecisionQueuePage.tsx, components/DecisionQueueRail.tsx, components/DecisionShelf.tsx, components/DecisionTriageStrip.tsx | — | 界面可达 | 有 |
| `GET /api/companies/:companyId/decision-queues` | `decision-queues.ts` | 读取决策队列 | pages/DecisionQueuePage.tsx, components/DecisionQueueRail.tsx, components/DecisionShelf.tsx, components/DecisionTriageStrip.tsx | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/decision-queues` | `decision-queues.ts` | 创建决策队列 | pages/DecisionQueuePage.tsx, components/DecisionQueueRail.tsx, components/DecisionShelf.tsx, components/DecisionTriageStrip.tsx | — | 界面可达 | 有 |
| `PATCH /api/companies/:companyId/decision-queues/:key` | `decision-queues.ts` | 更新决策队列 | pages/DecisionQueuePage.tsx, components/DecisionQueueRail.tsx, components/DecisionShelf.tsx, components/DecisionTriageStrip.tsx | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/decision-queues/:key/items` | `decision-queues.ts` | 读取决策队列 (items) | pages/DecisionQueuePage.tsx, components/DecisionQueueRail.tsx, components/DecisionShelf.tsx, components/DecisionTriageStrip.tsx | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/decision-queues/:key/items` | `decision-queues.ts` | 创建决策队列 (items) | pages/DecisionQueuePage.tsx, components/DecisionQueueRail.tsx, components/DecisionShelf.tsx, components/DecisionTriageStrip.tsx | — | 界面可达 | 无 |
| `DELETE /api/companies/:companyId/decision-queues/:key/items/:sourceKind/:sourceId` | `decision-queues.ts` | 删除决策队列 (items) | — | — | 未接线 | 无 |
| `PATCH /api/companies/:companyId/decision-retention/:sourceKind/:sourceId` | `decision-queues.ts` | 更新公司 (decision-retention) | — | — | 未接线 | 无 |
| `POST /api/companies/:companyId/decision-retention/:sourceKind/:sourceId/archive` | `decision-queues.ts` | 创建公司 · 归档 | — | — | 未接线 | 无 |
| `POST /api/companies/:companyId/decision-retention/:sourceKind/:sourceId/revive` | `decision-queues.ts` | 创建公司 (decision-retention/revive) | — | — | 未接线 | 无 |
| `GET /api/companies/:companyId/decision-training` | `decision-training.ts` | 读取公司 (decision-training) | — | — | 拨测 | 有 |
| `POST /api/companies/:companyId/decision-training` | `decision-training.ts` | 创建公司 (decision-training) | — | — | 拨测 | 有 |
| `GET /api/companies/:companyId/decision-training/export.jsonl` | `decision-training.ts` | 读取公司 (decision-training/export.jsonl) | — | — | 拨测 | 有 |
| `POST /api/companies/:companyId/decision-training/preview` | `decision-training.ts` | 创建公司 · 预览 | — | — | 未接线 | 无 |
| `GET /api/companies/:companyId/decision-triage/:sourceKind/:sourceId` | `decision-queues.ts` | 读取公司 (decision-triage) | — | — | 未接线 | 无 |
| `PUT /api/companies/:companyId/decision-triage/:sourceKind/:sourceId` | `decision-queues.ts` | 更新公司 (decision-triage) | — | — | 未接线 | 无 |
| `GET /api/companies/:companyId/decisions` | `decisions.ts` | 读取决策 | pages/WhatNeedsMe.tsx, components/DecisionCard.tsx, components/DecisionResolver.tsx | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/decisions` | `decisions.ts` | 创建决策 | pages/WhatNeedsMe.tsx, components/DecisionCard.tsx, components/DecisionResolver.tsx | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/decisions/stats` | `decisions.ts` | 读取决策 · 统计 | — | — | 未接线 | 无 |
| `POST /api/companies/:companyId/email/connections` | `email.ts` | 创建公司 (email/connections) | pages/apps/chat/EmailEndpointSetup.tsx, components/EmailMessageCard.tsx, components/EmailTaskActivity.tsx | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/email/connections/:connectionId/inspect` | `email.ts` | 创建公司 (connections/inspect) | pages/apps/chat/EmailEndpointSetup.tsx, components/EmailMessageCard.tsx, components/EmailTaskActivity.tsx | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/email/deliveries/:publicationId` | `email.ts` | 读取公司 (email/deliveries) | — | — | 内部RPC | 无 |
| `POST /api/companies/:companyId/email/deliveries/:publicationId/resolve` | `email.ts` | 创建公司 · 裁决 | pages/apps/chat/EmailEndpointSetup.tsx, components/EmailMessageCard.tsx, components/EmailTaskActivity.tsx | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/email/inboxes` | `email.ts` | 读取公司 (email/inboxes) | pages/apps/chat/EmailEndpointSetup.tsx, components/EmailMessageCard.tsx, components/EmailTaskActivity.tsx | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/email/inboxes` | `email.ts` | 创建公司 (email/inboxes) | pages/apps/chat/EmailEndpointSetup.tsx, components/EmailMessageCard.tsx, components/EmailTaskActivity.tsx | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/email/inspect` | `email.ts` | 创建公司 (email/inspect) | pages/apps/chat/EmailEndpointSetup.tsx, components/EmailMessageCard.tsx, components/EmailTaskActivity.tsx | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/email/send` | `email.ts` | 创建公司 (email/send) | pages/apps/chat/EmailEndpointSetup.tsx, components/EmailMessageCard.tsx, components/EmailTaskActivity.tsx | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/email/tasks/:issueId` | `email.ts` | 读取任务 (email) | pages/apps/chat/EmailEndpointSetup.tsx, components/EmailMessageCard.tsx, components/EmailTaskActivity.tsx | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/emergency-resume` | `companies.ts` | 创建公司 (emergency-resume) | — | expo/src/coolie.ts | 界面可达 | 有 |
| `POST /api/companies/:companyId/emergency-stop` | `companies.ts` | 创建公司 (emergency-stop) | — | expo/src/coolie.ts | 界面可达 | 有 |
| `GET /api/companies/:companyId/environments` | `environments.ts` | 读取环境 | pages/Agents.production.tsx, pages/Agents.tsx, pages/CompanyEnvironments.tsx, components/AgentConfigForm.tsx, +5 | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/environments` | `environments.ts` | 创建环境 | pages/Agents.production.tsx, pages/Agents.tsx, pages/CompanyEnvironments.tsx, components/AgentConfigForm.tsx, +5 | — | 界面可达 | 有 |
| `GET /api/companies/:companyId/environments/capabilities` | `environments.ts` | 读取环境 (capabilities) | pages/Agents.production.tsx, pages/Agents.tsx, pages/CompanyEnvironments.tsx, components/AgentConfigForm.tsx, +5 | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/environments/probe-config` | `environments.ts` | 创建环境 (probe-config) | pages/Agents.production.tsx, pages/Agents.tsx, pages/CompanyEnvironments.tsx, components/AgentConfigForm.tsx, +5 | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/execution-workspaces` | `execution-workspaces.ts` | 读取执行工作区 | — | api-client/src/client.ts [仅api层] | 界面可达 | 无 |
| `POST /api/companies/:companyId/export` | `companies.ts` | 创建公司 · 导出 | — | — | 上游同步 | 有 |
| `GET /api/companies/:companyId/export/fidelity` | `companies.ts` | 读取公司 · 导出 | pages/Companies.tsx, pages/CompanyExport.tsx, pages/CompanyImport.tsx, pages/CompanySettings.tsx, +2 | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/exports` | `companies.ts` | 创建公司 (exports) | pages/Companies.tsx, pages/CompanyExport.tsx, pages/CompanyImport.tsx, pages/CompanySettings.tsx, +2 | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/exports/preview` | `companies.ts` | 创建公司 · 预览 | pages/Companies.tsx, pages/CompanyExport.tsx, pages/CompanyImport.tsx, pages/CompanySettings.tsx, +2 | — | 界面可达 | 有 |
| `GET /api/companies/:companyId/feedback-traces` | `companies.ts` | 读取公司 (feedback-traces) | — | — | 未接线 | 无 |
| `POST /api/companies/:companyId/finance-events` | `costs.ts` | 创建公司 (finance-events) | — | — | 未接线 | 无 |
| `GET /api/companies/:companyId/folders` | `folders.ts` | 读取目录 | pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, pages/Routines.production.tsx, pages/Routines.tsx | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/folders` | `folders.ts` | 创建目录 | pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, pages/Routines.production.tsx, pages/Routines.tsx | — | 界面可达 | 无 |
| `DELETE /api/companies/:companyId/folders/:folderId` | `folders.ts` | 删除目录 | pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, pages/Routines.production.tsx, pages/Routines.tsx | — | 界面可达 | 无 |
| `PATCH /api/companies/:companyId/folders/:folderId` | `folders.ts` | 更新目录 | pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, pages/Routines.production.tsx, pages/Routines.tsx | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/folders/:folderId/move` | `folders.ts` | 创建目录 (move) | pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, pages/Routines.production.tsx, pages/Routines.tsx | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/folders/ensure-my` | `folders.ts` | 创建目录 (ensure-my) | pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, pages/Routines.production.tsx, pages/Routines.tsx | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/folders/items/move` | `folders.ts` | 创建目录 (items/move) | pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, pages/Routines.production.tsx, pages/Routines.tsx | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/goals` | `goals.ts` | 读取目标 | pages/BoardChat.tsx, pages/GoalDetail.tsx, pages/Goals.tsx, components/GoalProperties.tsx, +2 | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/goals` | `goals.ts` | 创建目标 | pages/BoardChat.tsx, pages/GoalDetail.tsx, pages/Goals.tsx, components/GoalProperties.tsx, +2 | — | 界面可达 | 有 |
| `GET /api/companies/:companyId/heartbeat-runs` | `agents.ts` | 读取公司 (heartbeat-runs) | — | — | 拨测 | 有 |
| `POST /api/companies/:companyId/imports/apply` | `companies.ts` | 创建公司 · 应用 | — | — | 拨测 | 有 |
| `POST /api/companies/:companyId/imports/preview` | `companies.ts` | 创建公司 · 预览 | — | — | 拨测 | 有 |
| `GET /api/companies/:companyId/inbox-dismissals` | `inbox-dismissals.ts` | 读取收件箱忽略 | hooks/useInboxBadge.ts | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/inbox-dismissals` | `inbox-dismissals.ts` | 创建收件箱忽略 | hooks/useInboxBadge.ts | — | 界面可达 | 有 |
| `DELETE /api/companies/:companyId/inbox-dismissals/:itemKey` | `inbox-dismissals.ts` | 删除收件箱忽略 | hooks/useInboxBadge.ts | — | 界面可达 | 有 |
| `GET /api/companies/:companyId/invites` | `access.ts` | 读取邀请 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardClaim.tsx, +41 | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/invites` | `access.ts` | 创建邀请 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardClaim.tsx, +41 | — | 界面可达 | 有 |
| `GET /api/companies/:companyId/issues` | `issues.ts` | 读取任务 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | h5/src/screens/BoardChatScreen.tsx | 界面可达 | 有 |
| `POST /api/companies/:companyId/issues` | `issues.ts` | 创建任务 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | h5/src/screens/BoardChatScreen.tsx | 界面可达 | 有 |
| `POST /api/companies/:companyId/issues/:issueId/attachments` | `issues.ts` | 创建附件 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | api-client/src/client.ts [仅api层] | 界面可达 | 有 |
| `GET /api/companies/:companyId/issues/count` | `issues.ts` | 读取任务 · 计数 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/issues/external-object-summaries` | `issues.ts` | 创建任务 (external-object-summaries) | hooks/useIssueExternalObjects.ts | — | 界面可达 | 有 |
| `GET /api/companies/:companyId/join-requests` | `access.ts` | 读取公司 (join-requests) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardClaim.tsx, +41 | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/join-requests/:requestId/approve` | `access.ts` | 创建公司 · 通过 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardClaim.tsx, +41 | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/join-requests/:requestId/reject` | `access.ts` | 创建公司 · 驳回 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardClaim.tsx, +41 | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/labels` | `issues.ts` | 读取标签 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | api-client/src/client.ts [仅api层] | 界面可达 | 无 |
| `POST /api/companies/:companyId/labels` | `issues.ts` | 创建标签 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | api-client/src/client.ts [仅api层] | 界面可达 | 无 |
| `GET /api/companies/:companyId/live-runs` | `agents.ts` | 读取公司 (live-runs) | — | expo/src/coolie.ts | 界面可达 | 有 |
| `POST /api/companies/:companyId/logo` | `assets.ts` | 创建公司 (logo) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/CompanySettings.tsx, pages/GoalDetail.tsx, +5 | — | 界面可达 | 有 |
| `GET /api/companies/:companyId/managed-agent-profiles` | `managed-agent-profiles.ts` | 读取托管员工配置 | — | — | 拨测 | 有 |
| `POST /api/companies/:companyId/managed-agent-profiles` | `managed-agent-profiles.ts` | 创建托管员工配置 | — | — | 拨测 | 有 |
| `GET /api/companies/:companyId/me/user-secrets` | `secrets.ts` | 读取公司 (me/user-secrets) | pages/CompanyEnvironments.tsx, pages/PipelineSettings.tsx, pages/RoutineDetail.production.tsx, pages/RoutineDetail.tsx, +18 | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/me/user-secrets` | `secrets.ts` | 创建公司 (me/user-secrets) | pages/CompanyEnvironments.tsx, pages/PipelineSettings.tsx, pages/RoutineDetail.production.tsx, pages/RoutineDetail.tsx, +18 | — | 界面可达 | 无 |
| `DELETE /api/companies/:companyId/me/user-secrets/:secretId` | `secrets.ts` | 删除公司 (me/user-secrets) | pages/CompanyEnvironments.tsx, pages/PipelineSettings.tsx, pages/RoutineDetail.production.tsx, pages/RoutineDetail.tsx, +18 | — | 界面可达 | 无 |
| `PATCH /api/companies/:companyId/me/user-secrets/:secretId` | `secrets.ts` | 更新公司 (me/user-secrets) | pages/CompanyEnvironments.tsx, pages/PipelineSettings.tsx, pages/RoutineDetail.production.tsx, pages/RoutineDetail.tsx, +18 | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/me/user-secrets/:secretId/rotate` | `secrets.ts` | 创建公司 (user-secrets/rotate) | pages/CompanyEnvironments.tsx, pages/PipelineSettings.tsx, pages/RoutineDetail.production.tsx, pages/RoutineDetail.tsx, +18 | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/members` | `access.ts` | 读取成员 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardClaim.tsx, +41 | — | 界面可达 | 有 |
| `PATCH /api/companies/:companyId/members/:memberId` | `access.ts` | 更新成员 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardClaim.tsx, +41 | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/members/:memberId/archive` | `access.ts` | 创建成员 · 归档 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardClaim.tsx, +41 | — | 界面可达 | 无 |
| `PATCH /api/companies/:companyId/members/:memberId/permissions` | `access.ts` | 更新成员 (permissions) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardClaim.tsx, +41 | — | 界面可达 | 无 |
| `PATCH /api/companies/:companyId/members/:memberId/role-and-grants` | `access.ts` | 更新成员 (role-and-grants) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardClaim.tsx, +41 | — | 界面可达 | 有 |
| `GET /api/companies/:companyId/metrics/cockpit` | `dashboard.ts` | 读取公司 (metrics/cockpit) | — | api-client/src/client.ts [仅api层] | 界面可达 | 无 |
| `POST /api/companies/:companyId/openclaw/invite-prompt` | `access.ts` | 创建公司 (openclaw/invite-prompt) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardClaim.tsx, +41 | — | 界面可达 | 有 |
| `GET /api/companies/:companyId/org` | `agents.ts` | 读取组织 | plugins/bridge-init.ts, pages/AgentChat.tsx, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, +80 | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/org.png` | `agents.ts` | 读取公司 (org.png) | — | — | 未接线 | 无 |
| `GET /api/companies/:companyId/org.svg` | `agents.ts` | 读取公司 (org.svg) | pages/CompanyExport.tsx | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/pipelines` | `pipelines.ts` | 读取管线 | pages/PipelineSettings.tsx, pages/Pipelines.tsx, lib/pipeline-breakdown.ts, lib/pipeline-item-detail.ts, +3 | expo/src/coolie.ts, expo/src/screens/BoardChatScreen.tsx, h5/src/screens/BoardChatScreen.tsx, h5/src/screens/PipelinesScreen.tsx | 界面可达 | 有 |
| `POST /api/companies/:companyId/pipelines` | `pipelines.ts` | 创建管线 | pages/PipelineSettings.tsx, pages/Pipelines.tsx, lib/pipeline-breakdown.ts, lib/pipeline-item-detail.ts, +3 | expo/src/coolie.ts, expo/src/screens/BoardChatScreen.tsx, h5/src/screens/BoardChatScreen.tsx, h5/src/screens/PipelinesScreen.tsx | 界面可达 | 有 |
| `GET /api/companies/:companyId/pipelines-attention` | `pipelines.ts` | 读取公司 (pipelines-attention) | — | — | 未接线 | 无 |
| `GET /api/companies/:companyId/project-repositories` | `projects.ts` | 读取公司 (project-repositories) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/Cases.tsx, +42 | — | 界面可达 | 有 |
| `GET /api/companies/:companyId/projects` | `projects.ts` | 读取项目 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/Cases.tsx, +42 | expo/src/coolie.ts | 界面可达 | 有 |
| `POST /api/companies/:companyId/projects` | `projects.ts` | 创建项目 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/Cases.tsx, +42 | expo/src/coolie.ts | 界面可达 | 有 |
| `GET /api/companies/:companyId/projects/:projectId/documents` | `projects.ts` | 读取文档 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/Cases.tsx, +42 | api-client/src/client.ts [仅api层] | 界面可达 | 无 |
| `POST /api/companies/:companyId/projects/:projectId/documents` | `projects.ts` | 创建文档 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/Cases.tsx, +42 | api-client/src/client.ts [仅api层] | 界面可达 | 无 |
| `POST /api/companies/:companyId/projects/analyze-document` | `projects.ts` | 创建项目 (analyze-document) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/Cases.tsx, +42 | api-client/src/client.ts [仅api层] | 界面可达 | 无 |
| `GET /api/companies/:companyId/provider-traces` | `agents.ts` | 读取公司 (provider-traces) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/Agents.production.tsx, +41 | — | 界面可达 | 有 |
| `GET /api/companies/:companyId/recovery-observability` | `dashboard.ts` | 读取公司 (recovery-observability) | — | — | 后台任务 | 无 |
| `GET /api/companies/:companyId/release-gate/ds-approval` | `companies.ts` | 读取公司 (release-gate/ds-approval) | — | — | 未接线 | 无 |
| `GET /api/companies/:companyId/remote-agent-profiles` | `remote-agent-profiles.ts` | 读取远程员工配置 | — | — | 拨测 | 有 |
| `POST /api/companies/:companyId/remote-agent-profiles` | `remote-agent-profiles.ts` | 创建远程员工配置 | — | — | 拨测 | 有 |
| `GET /api/companies/:companyId/resource-memberships/me` | `resource-memberships.ts` | 读取资源成员 (me) | hooks/useResourceMemberships.ts | — | 界面可达 | 有 |
| `PUT /api/companies/:companyId/resource-memberships/me/agents/:agentId` | `resource-memberships.ts` | 更新员工 (me) | hooks/useResourceMemberships.ts | — | 界面可达 | 有 |
| `PUT /api/companies/:companyId/resource-memberships/me/documents/:documentId` | `resource-memberships.ts` | 更新文档 (me) | — | — | 拨测 | 有 |
| `PUT /api/companies/:companyId/resource-memberships/me/projects/:projectId` | `resource-memberships.ts` | 更新项目 (me) | hooks/useResourceMemberships.ts | — | 界面可达 | 有 |
| `GET /api/companies/:companyId/review-cases` | `pipelines.ts` | 读取公司 (review-cases) | — | — | 拨测 | 有 |
| `POST /api/companies/:companyId/review-cases/bulk` | `pipelines.ts` | 创建公司 (review-cases/bulk) | pages/PipelineSettings.tsx, pages/Pipelines.tsx, lib/pipeline-breakdown.ts, lib/pipeline-item-detail.ts, +3 | — | 界面可达 | 有 |
| `GET /api/companies/:companyId/routines` | `routines.ts` | 读取例行 | pages/CompanyImport.tsx, pages/ExecutionWorkspaceDetail.tsx, pages/RoutineDetail.production.tsx, pages/RoutineDetail.tsx, +11 | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/routines` | `routines.ts` | 创建例行 | pages/CompanyImport.tsx, pages/ExecutionWorkspaceDetail.tsx, pages/RoutineDetail.production.tsx, pages/RoutineDetail.tsx, +11 | — | 界面可达 | 有 |
| `GET /api/companies/:companyId/search` | `issues.ts` | 读取搜索 | — | — | 未接线 | 无 |
| `GET /api/companies/:companyId/search/extract` | `issues.ts` | 读取搜索 (extract) | — | — | 未接线 | 无 |
| `GET /api/companies/:companyId/secret-proposals` | `secrets.ts` | 读取公司 (secret-proposals) | pages/CompanyEnvironments.tsx, pages/PipelineSettings.tsx, pages/RoutineDetail.production.tsx, pages/RoutineDetail.tsx, +18 | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/secret-proposals/:id/approve` | `secrets.ts` | 创建公司 · 通过 | pages/CompanyEnvironments.tsx, pages/PipelineSettings.tsx, pages/RoutineDetail.production.tsx, pages/RoutineDetail.tsx, +18 | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/secret-proposals/:id/reject` | `secrets.ts` | 创建公司 · 驳回 | pages/CompanyEnvironments.tsx, pages/PipelineSettings.tsx, pages/RoutineDetail.production.tsx, pages/RoutineDetail.tsx, +18 | — | 界面可达 | 有 |
| `GET /api/companies/:companyId/secret-provider-configs` | `secrets.ts` | 读取公司 (secret-provider-configs) | pages/CompanyEnvironments.tsx, pages/PipelineSettings.tsx, pages/RoutineDetail.production.tsx, pages/RoutineDetail.tsx, +18 | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/secret-provider-configs` | `secrets.ts` | 创建公司 (secret-provider-configs) | pages/CompanyEnvironments.tsx, pages/PipelineSettings.tsx, pages/RoutineDetail.production.tsx, pages/RoutineDetail.tsx, +18 | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/secret-provider-configs/discovery/preview` | `secrets.ts` | 创建公司 · 预览 | pages/CompanyEnvironments.tsx, pages/PipelineSettings.tsx, pages/RoutineDetail.production.tsx, pages/RoutineDetail.tsx, +18 | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/secret-providers` | `secrets.ts` | 读取公司 (secret-providers) | pages/CompanyEnvironments.tsx, pages/PipelineSettings.tsx, pages/RoutineDetail.production.tsx, pages/RoutineDetail.tsx, +18 | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/secret-providers/health` | `secrets.ts` | 读取健康检查 (secret-providers) | pages/CompanyEnvironments.tsx, pages/PipelineSettings.tsx, pages/RoutineDetail.production.tsx, pages/RoutineDetail.tsx, +18 | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/secrets` | `secrets.ts` | 读取密钥 | pages/CompanyEnvironments.tsx, pages/PipelineSettings.tsx, pages/RoutineDetail.production.tsx, pages/RoutineDetail.tsx, +18 | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/secrets` | `secrets.ts` | 创建密钥 | pages/CompanyEnvironments.tsx, pages/PipelineSettings.tsx, pages/RoutineDetail.production.tsx, pages/RoutineDetail.tsx, +18 | — | 界面可达 | 有 |
| `GET /api/companies/:companyId/secrets/catalog` | `secrets.ts` | 读取密钥 (catalog) | — | — | 未接线 | 无 |
| `POST /api/companies/:companyId/secrets/remote-import` | `secrets.ts` | 创建密钥 (remote-import) | pages/CompanyEnvironments.tsx, pages/PipelineSettings.tsx, pages/RoutineDetail.production.tsx, pages/RoutineDetail.tsx, +18 | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/secrets/remote-import/preview` | `secrets.ts` | 创建密钥 · 预览 | pages/CompanyEnvironments.tsx, pages/PipelineSettings.tsx, pages/RoutineDetail.production.tsx, pages/RoutineDetail.tsx, +18 | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/setup-token-login-sessions` | `agents.ts` | 创建公司 (setup-token-login-sessions) | plugins/bridge-init.ts, pages/AgentChat.tsx, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, +80 | — | 界面可达 | 有 |
| `GET /api/companies/:companyId/setup-token-login-sessions/:sessionId` | `agents.ts` | 读取公司 (setup-token-login-sessions) | plugins/bridge-init.ts, pages/AgentChat.tsx, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, +80 | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/setup-token-login-sessions/:sessionId/cancel` | `agents.ts` | 创建公司 · 取消 | plugins/bridge-init.ts, pages/AgentChat.tsx, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, +80 | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/setup-token-login-sessions/:sessionId/code` | `agents.ts` | 创建公司 (setup-token-login-sessions/code) | plugins/bridge-init.ts, pages/AgentChat.tsx, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, +80 | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/setup-token-login-sessions/:sessionId/completion` | `agents.ts` | 创建公司 (setup-token-login-sessions/completion) | plugins/bridge-init.ts, pages/AgentChat.tsx, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, +80 | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/setup-token-login-sessions/:sessionId/prompt` | `agents.ts` | 读取公司 (setup-token-login-sessions/prompt) | plugins/bridge-init.ts, pages/AgentChat.tsx, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, +80 | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/setup-token-login-sessions/active` | `agents.ts` | 读取公司 (setup-token-login-sessions/active) | plugins/bridge-init.ts, pages/AgentChat.tsx, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, +80 | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/sidebar-badges` | `sidebar-badges.ts` | 读取侧栏角标 | components/CompanySettingsSidebar.production.tsx, components/CompanySettingsSidebar.tsx | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/sidebar-preferences/me` | `sidebar-preferences.ts` | 读取侧栏偏好 (me) | pages/CompanyImport.tsx, hooks/useCompanyOrder.ts, hooks/useProjectOrder.ts | — | 界面可达 | 无 |
| `PUT /api/companies/:companyId/sidebar-preferences/me` | `sidebar-preferences.ts` | 更新侧栏偏好 (me) | pages/CompanyImport.tsx, hooks/useCompanyOrder.ts, hooks/useProjectOrder.ts | — | 界面可达 | 无 |
| `DELETE /api/companies/:companyId/skill-policy` | `company-skill-policy.ts` | 删除公司 (skill-policy) | — | — | 未接线 | 无 |
| `GET /api/companies/:companyId/skill-policy` | `company-skill-policy.ts` | 读取公司 (skill-policy) | — | — | 未接线 | 无 |
| `PUT /api/companies/:companyId/skill-policy` | `company-skill-policy.ts` | 更新公司 (skill-policy) | — | — | 未接线 | 无 |
| `POST /api/companies/:companyId/skill-policy/evaluate` | `company-skill-policy.ts` | 创建公司 (skill-policy/evaluate) | — | — | 拨测 | 有 |
| `GET /api/companies/:companyId/skill-test-run-templates` | `company-skills.ts` | 读取公司 (skill-test-run-templates) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, +8 | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/skill-test-run-templates` | `company-skills.ts` | 创建公司 (skill-test-run-templates) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, +8 | — | 界面可达 | 无 |
| `DELETE /api/companies/:companyId/skill-test-run-templates/:templateId` | `company-skills.ts` | 删除公司 (skill-test-run-templates) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, +8 | — | 界面可达 | 无 |
| `PATCH /api/companies/:companyId/skill-test-run-templates/:templateId` | `company-skills.ts` | 更新公司 (skill-test-run-templates) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, +8 | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/skills` | `company-skills.ts` | 读取技能 | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, +8 | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/skills` | `company-skills.ts` | 创建技能 | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, +8 | — | 界面可达 | 有 |
| `DELETE /api/companies/:companyId/skills/:skillId` | `company-skills.ts` | 删除技能 | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, +8 | — | 界面可达 | 有 |
| `GET /api/companies/:companyId/skills/:skillId` | `company-skills.ts` | 读取技能 | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, +8 | — | 界面可达 | 有 |
| `PATCH /api/companies/:companyId/skills/:skillId` | `company-skills.ts` | 更新技能 | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, +8 | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/skills/:skillId/audit` | `company-skills.ts` | 创建技能 (audit) | — | — | 内部RPC | 无 |
| `GET /api/companies/:companyId/skills/:skillId/comments` | `company-skills.ts` | 读取评论 | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, +8 | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/skills/:skillId/comments` | `company-skills.ts` | 创建评论 | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, +8 | — | 界面可达 | 无 |
| `DELETE /api/companies/:companyId/skills/:skillId/comments/:commentId` | `company-skills.ts` | 删除评论 | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, +8 | — | 界面可达 | 无 |
| `PATCH /api/companies/:companyId/skills/:skillId/comments/:commentId` | `company-skills.ts` | 更新评论 | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, +8 | — | 界面可达 | 无 |
| `DELETE /api/companies/:companyId/skills/:skillId/files` | `company-skills.ts` | 删除文件 | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, +8 | — | 界面可达 | 有 |
| `GET /api/companies/:companyId/skills/:skillId/files` | `company-skills.ts` | 读取文件 | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, +8 | — | 界面可达 | 有 |
| `PATCH /api/companies/:companyId/skills/:skillId/files` | `company-skills.ts` | 更新文件 | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, +8 | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/skills/:skillId/fork` | `company-skills.ts` | 创建技能 (fork) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, +8 | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/skills/:skillId/fork-precheck` | `company-skills.ts` | 读取技能 (fork-precheck) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, +8 | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/skills/:skillId/install-update` | `company-skills.ts` | 创建技能 (install-update) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, +8 | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/skills/:skillId/rename` | `company-skills.ts` | 创建技能 (rename) | — | — | 未接线 | 无 |
| `POST /api/companies/:companyId/skills/:skillId/reset` | `company-skills.ts` | 创建技能 (reset) | — | — | 内部RPC | 无 |
| `DELETE /api/companies/:companyId/skills/:skillId/star` | `company-skills.ts` | 删除技能 (star) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, +8 | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/skills/:skillId/star` | `company-skills.ts` | 创建技能 (star) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, +8 | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/skills/:skillId/test-inputs` | `company-skills.ts` | 读取技能 (test-inputs) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, +8 | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/skills/:skillId/test-inputs` | `company-skills.ts` | 创建技能 (test-inputs) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, +8 | — | 界面可达 | 无 |
| `DELETE /api/companies/:companyId/skills/:skillId/test-inputs/:inputId` | `company-skills.ts` | 删除技能 (test-inputs) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, +8 | — | 界面可达 | 无 |
| `PATCH /api/companies/:companyId/skills/:skillId/test-inputs/:inputId` | `company-skills.ts` | 更新技能 (test-inputs) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, +8 | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/skills/:skillId/test-runs` | `company-skills.ts` | 读取技能 (test-runs) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, +8 | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/skills/:skillId/test-runs` | `company-skills.ts` | 创建技能 (test-runs) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, +8 | — | 界面可达 | 无 |
| `DELETE /api/companies/:companyId/skills/:skillId/test-runs/:runId` | `company-skills.ts` | 删除技能 (test-runs) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, +8 | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/skills/:skillId/test-runs/:runId` | `company-skills.ts` | 读取技能 (test-runs) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, +8 | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/skills/:skillId/test-runs/:runId/cancel` | `company-skills.ts` | 创建技能 · 取消 | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, +8 | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/skills/:skillId/update-status` | `company-skills.ts` | 读取技能 (update-status) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, +8 | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/skills/:skillId/versions` | `company-skills.ts` | 读取技能 (versions) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, +8 | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/skills/:skillId/versions` | `company-skills.ts` | 创建技能 (versions) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, +8 | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/skills/:skillId/versions/:versionId` | `company-skills.ts` | 读取技能 (versions) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, +8 | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/skills/browse-project` | `company-skills.ts` | 创建技能 (browse-project) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, +8 | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/skills/categories` | `company-skills.ts` | 读取技能 (categories) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, +8 | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/skills/import` | `company-skills.ts` | 创建技能 · 导入 | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, +8 | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/skills/install-catalog` | `company-skills.ts` | 创建技能 (install-catalog) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, +8 | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/skills/scan-projects` | `company-skills.ts` | 创建技能 (scan-projects) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, +8 | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/slack/endpoints/:endpointId/capabilities` | `slack-tools.ts` | 读取公司 (endpoints/capabilities) | — | — | 未接线 | 无 |
| `DELETE /api/companies/:companyId/slack/endpoints/:endpointId/search` | `slack-tools.ts` | 删除搜索 (slack/endpoints) | — | — | 未接线 | 无 |
| `GET /api/companies/:companyId/slack/endpoints/:endpointId/search` | `slack-tools.ts` | 读取搜索 (slack/endpoints) | — | — | 未接线 | 无 |
| `PUT /api/companies/:companyId/slack/endpoints/:endpointId/search` | `slack-tools.ts` | 更新搜索 (slack/endpoints) | — | — | 未接线 | 无 |
| `POST /api/companies/:companyId/slack/endpoints/:endpointId/search/connect` | `slack-tools.ts` | 创建搜索 (endpoints/connect) | — | — | 未接线 | 无 |
| `POST /api/companies/:companyId/slack/tasks/:issueId/tools` | `slack-tools.ts` | 创建任务 (slack/tools) | — | — | 拨测 | 有 |
| `POST /api/companies/:companyId/smoke-lab/install-fixtures` | `smoke-lab.ts` | 创建冒烟实验室 (install-fixtures) | — | — | 内部RPC | 有 |
| `GET /api/companies/:companyId/smoke-lab/oauth/authorize` | `smoke-lab.ts` | 读取冒烟实验室 (oauth/authorize) | — | — | 内部RPC | 有 |
| `POST /api/companies/:companyId/smoke-lab/oauth/authorize` | `smoke-lab.ts` | 创建冒烟实验室 (oauth/authorize) | — | — | 内部RPC | 有 |
| `POST /api/companies/:companyId/smoke-lab/oauth/revoke` | `smoke-lab.ts` | 创建冒烟实验室 (oauth/revoke) | — | — | 内部RPC | 有 |
| `POST /api/companies/:companyId/smoke-lab/oauth/token` | `smoke-lab.ts` | 创建冒烟实验室 (oauth/token) | — | — | 内部RPC | 有 |
| `GET /api/companies/:companyId/smoke-lab/oauth/userinfo` | `smoke-lab.ts` | 读取冒烟实验室 (oauth/userinfo) | — | — | 内部RPC | 有 |
| `POST /api/companies/:companyId/smoke-lab/reset` | `smoke-lab.ts` | 创建冒烟实验室 (reset) | — | — | 内部RPC | 无 |
| `GET /api/companies/:companyId/smoke-lab/runs` | `smoke-lab.ts` | 读取运行 | — | — | 内部RPC | 有 |
| `POST /api/companies/:companyId/smoke-lab/runs` | `smoke-lab.ts` | 创建运行 | — | — | 内部RPC | 有 |
| `GET /api/companies/:companyId/smoke-lab/runs/:runId` | `smoke-lab.ts` | 读取运行 | — | — | 内部RPC | 有 |
| `PATCH /api/companies/:companyId/smoke-lab/runs/:runId` | `smoke-lab.ts` | 更新运行 | — | — | 内部RPC | 有 |
| `POST /api/companies/:companyId/smoke-lab/runs/:runId/steps` | `smoke-lab.ts` | 创建运行 (steps) | — | — | 内部RPC | 有 |
| `GET /api/companies/:companyId/smoke-lab/services` | `smoke-lab.ts` | 读取冒烟实验室 (services) | — | — | 内部RPC | 有 |
| `POST /api/companies/:companyId/smoke-lab/services/start` | `smoke-lab.ts` | 创建冒烟实验室 (services/start) | — | — | 内部RPC | 有 |
| `POST /api/companies/:companyId/smoke-lab/services/stop` | `smoke-lab.ts` | 创建冒烟实验室 (services/stop) | — | — | 内部RPC | 无 |
| `GET /api/companies/:companyId/status-cards` | `status-cards.ts` | 读取状态卡 | pages/StatusCards/ArchivedStatusCardRow.tsx, pages/StatusCards/CreateStatusCardDialog.tsx, pages/StatusCards/StatusCardDetailDrawer.tsx, pages/StatusCards/index.tsx | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/status-cards` | `status-cards.ts` | 创建状态卡 | pages/StatusCards/ArchivedStatusCardRow.tsx, pages/StatusCards/CreateStatusCardDialog.tsx, pages/StatusCards/StatusCardDetailDrawer.tsx, pages/StatusCards/index.tsx | — | 界面可达 | 有 |
| `GET /api/companies/:companyId/summary-slots/:scopeKind/:slotKey` | `summary-slots.ts` | 读取摘要槽 | — | — | 未接线 | 无 |
| `PUT /api/companies/:companyId/summary-slots/:scopeKind/:slotKey` | `summary-slots.ts` | 更新摘要槽 | — | — | 未接线 | 无 |
| `POST /api/companies/:companyId/summary-slots/:scopeKind/:slotKey/generate` | `summary-slots.ts` | 创建摘要槽 (generate) | — | — | 未接线 | 无 |
| `GET /api/companies/:companyId/summary-slots/:scopeKind/:slotKey/revisions` | `summary-slots.ts` | 读取摘要槽 (revisions) | — | — | 未接线 | 无 |
| `POST /api/companies/:companyId/teams/catalog/:catalogId/install` | `teams-catalog.ts` | 创建团队 (catalog/install) | pages/TeamCatalog.tsx | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/teams/catalog/:catalogId/preview` | `teams-catalog.ts` | 创建团队 · 预览 | pages/TeamCatalog.tsx | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/teams/catalog/installed` | `teams-catalog.ts` | 读取团队 (catalog/installed) | pages/TeamCatalog.tsx | — | 界面可达 | 有 |
| `GET /api/companies/:companyId/timeline` | `companies.ts` | 读取公司 · 时间线 | pages/Timeline.tsx | expo/src/coolie.ts | 界面可达 | 有 |
| `GET /api/companies/:companyId/tools/action-requests` | `tool-access.ts` | 读取公司 (tools/action-requests) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/tools/action-requests/:actionRequestId/trust-rule` | `tool-access.ts` | 创建公司 (action-requests/trust-rule) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `GET /api/companies/:companyId/tools/applications` | `tool-access.ts` | 读取公司 (tools/applications) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/tools/applications` | `tool-access.ts` | 创建公司 (tools/applications) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/tools/apps/:connectionId/finalize-oauth-access` | `tool-access.ts` | 创建公司 (apps/finalize-oauth-access) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/tools/apps/:connectionId/finish` | `tool-access.ts` | 创建公司 (apps/finish) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `GET /api/companies/:companyId/tools/apps/:galleryKey/preflight` | `tool-access.ts` | 读取公司 (apps/preflight) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/tools/apps/attention` | `tool-access.ts` | 读取公司 (apps/attention) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/tools/apps/connect` | `tool-access.ts` | 创建公司 (apps/connect) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `GET /api/companies/:companyId/tools/connections` | `tool-access.ts` | 读取公司 (tools/connections) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/tools/connections` | `tool-access.ts` | 创建公司 (tools/connections) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/tools/connections/:connectionId/start-authorization` | `tool-access.ts` | 创建公司 (connections/start-authorization) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/tools/examples` | `tool-access.ts` | 读取公司 (tools/examples) | — | — | 未接线 | 无 |
| `POST /api/companies/:companyId/tools/examples/:id/install` | `tool-access.ts` | 创建公司 (examples/install) | — | — | 未接线 | 无 |
| `POST /api/companies/:companyId/tools/examples/:id/smoke` | `tool-access.ts` | 创建公司 (examples/smoke) | — | — | 内部RPC | 无 |
| `GET /api/companies/:companyId/tools/gallery` | `tool-access.ts` | 读取公司 (tools/gallery) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/tools/mcp/import-json` | `tool-access.ts` | 创建公司 (mcp/import-json) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `GET /api/companies/:companyId/tools/policies` | `tool-access.ts` | 读取公司 (tools/policies) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/tools/policies` | `tool-access.ts` | 创建公司 (tools/policies) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `DELETE /api/companies/:companyId/tools/policies/:policyId` | `tool-access.ts` | 删除公司 (tools/policies) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `PATCH /api/companies/:companyId/tools/policies/:policyId` | `tool-access.ts` | 更新公司 (tools/policies) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/tools/policies/:policyId/duplicate` | `tool-access.ts` | 创建公司 (policies/duplicate) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/tools/policies/reorder` | `tool-access.ts` | 创建公司 (policies/reorder) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/tools/policy/test` | `tool-access.ts` | 创建公司 (policy/test) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/tools/profiles` | `tool-access.ts` | 读取公司 (tools/profiles) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/tools/profiles` | `tool-access.ts` | 创建公司 (tools/profiles) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/tools/profiles/:profileId/bind` | `tool-access.ts` | 创建公司 (profiles/bind) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/tools/profiles/:profileId/unbind` | `tool-access.ts` | 创建公司 (profiles/unbind) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `GET /api/companies/:companyId/tools/profiles/effective/agents/:agentId` | `tool-access.ts` | 读取员工 (profiles/effective) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/tools/runs/:runId/decisions` | `tool-access.ts` | 读取决策 (tools) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/tools/runtime-health` | `tool-access.ts` | 读取公司 (tools/runtime-health) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/tools/runtime-slots` | `tool-access.ts` | 读取公司 (tools/runtime-slots) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/tools/runtime-slots/:id/restart` | `tool-access.ts` | 创建公司 (runtime-slots/restart) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/tools/runtime-slots/:id/stop` | `tool-access.ts` | 创建公司 (runtime-slots/stop) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `GET /api/companies/:companyId/tools/stdio-templates` | `tool-access.ts` | 读取公司 (tools/stdio-templates) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/tools/stdio-templates` | `tool-access.ts` | 创建公司 (tools/stdio-templates) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `POST /api/companies/:companyId/tools/stdio-templates/:templateId/disable` | `tool-access.ts` | 创建公司 (stdio-templates/disable) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/tools/trust-rules` | `tool-access.ts` | 读取公司 (tools/trust-rules) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/tools/trust-rules/:policyId/revoke` | `tool-access.ts` | 创建公司 (trust-rules/revoke) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `GET /api/companies/:companyId/user-directory` | `access.ts` | 读取公司 (user-directory) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardClaim.tsx, +41 | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/user-secret-definitions` | `secrets.ts` | 读取公司 (user-secret-definitions) | pages/CompanyEnvironments.tsx, pages/PipelineSettings.tsx, pages/RoutineDetail.production.tsx, pages/RoutineDetail.tsx, +18 | — | 界面可达 | 无 |
| `POST /api/companies/:companyId/user-secret-definitions` | `secrets.ts` | 创建公司 (user-secret-definitions) | pages/CompanyEnvironments.tsx, pages/PipelineSettings.tsx, pages/RoutineDetail.production.tsx, pages/RoutineDetail.tsx, +18 | — | 界面可达 | 无 |
| `DELETE /api/companies/:companyId/user-secret-definitions/:definitionId` | `secrets.ts` | 删除公司 (user-secret-definitions) | pages/CompanyEnvironments.tsx, pages/PipelineSettings.tsx, pages/RoutineDetail.production.tsx, pages/RoutineDetail.tsx, +18 | — | 界面可达 | 无 |
| `PATCH /api/companies/:companyId/user-secret-definitions/:definitionId` | `secrets.ts` | 更新公司 (user-secret-definitions) | pages/CompanyEnvironments.tsx, pages/PipelineSettings.tsx, pages/RoutineDetail.production.tsx, pages/RoutineDetail.tsx, +18 | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/user-secret-definitions/:definitionId/coverage` | `secrets.ts` | 读取公司 (user-secret-definitions/coverage) | pages/CompanyEnvironments.tsx, pages/PipelineSettings.tsx, pages/RoutineDetail.production.tsx, pages/RoutineDetail.tsx, +18 | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/users/:userId/inbox-agent-policy` | `inbox-agent-policy.ts` | 读取用户 (inbox-agent-policy) | — | — | 拨测 | 有 |
| `PUT /api/companies/:companyId/users/:userId/inbox-agent-policy` | `inbox-agent-policy.ts` | 更新用户 (inbox-agent-policy) | — | — | 拨测 | 有 |
| `GET /api/companies/:companyId/users/:userSlug/profile` | `user-profiles.ts` | 读取用户 (profile) | pages/UserProfile.tsx | — | 界面可达 | 无 |
| `GET /api/companies/:companyId/users/me/inbox-agent-policy` | `inbox-agent-policy.ts` | 读取用户 (me/inbox-agent-policy) | components/InboxAgentPolicyControl.tsx | — | 界面可达 | 有 |
| `PUT /api/companies/:companyId/users/me/inbox-agent-policy` | `inbox-agent-policy.ts` | 更新用户 (me/inbox-agent-policy) | components/InboxAgentPolicyControl.tsx | — | 界面可达 | 有 |
| `GET /api/companies/:companyId/workspace-overview` | `execution-workspaces.ts` | 读取公司 (workspace-overview) | — | — | 未接线 | 无 |
| `POST /api/companies/import` | `companies.ts` | 创建公司 · 导入 | pages/Companies.tsx, pages/CompanyExport.tsx, pages/CompanyImport.tsx, pages/CompanySettings.tsx, +2 | — | 界面可达 | 有 |
| `GET /api/companies/import/jobs/:jobId` | `companies.ts` | 读取公司 · 导入 | pages/CompanyImport.tsx, pages/Companies.tsx, pages/CompanyExport.tsx, pages/CompanySettings.tsx, +2 | — | 界面可达 | 无 |
| `POST /api/companies/import/preview` | `companies.ts` | 创建公司 · 预览 | pages/Companies.tsx, pages/CompanyExport.tsx, pages/CompanyImport.tsx, pages/CompanySettings.tsx, +2 | — | 界面可达 | 有 |
| `GET /api/companies/issues` | `companies.ts` | 读取任务 | — | — | 拨测 | 有 |
| `GET /api/companies/stats` | `companies.ts` | 读取公司 · 统计 | pages/Companies.tsx, pages/CompanyExport.tsx, pages/CompanyImport.tsx, pages/CompanySettings.tsx, +2 | — | 界面可达 | 无 |
| `GET /api/companies/templates` | `companies.ts` | 读取模板 | — | — | 未接线 | 无 |
| `DELETE /api/decision-training/:id` | `decision-training.ts` | 删除decision-training | — | — | 拨测 | 有 |
| `GET /api/decision-training/:id` | `decision-training.ts` | 读取decision-training | — | — | 拨测 | 有 |
| `PATCH /api/decision-training/:id` | `decision-training.ts` | 更新decision-training | — | — | 拨测 | 有 |
| `GET /api/decisions/:id` | `decisions.ts` | 读取决策 | pages/WhatNeedsMe.tsx, components/DecisionCard.tsx, components/DecisionResolver.tsx | — | 界面可达 | 无 |
| `POST /api/decisions/:id/cancel` | `decisions.ts` | 创建决策 · 取消 | pages/WhatNeedsMe.tsx, components/DecisionCard.tsx, components/DecisionResolver.tsx | — | 界面可达 | 无 |
| `POST /api/decisions/:id/decide` | `decisions.ts` | 创建决策 (decide) | pages/WhatNeedsMe.tsx, components/DecisionCard.tsx, components/DecisionResolver.tsx | — | 界面可达 | 无 |
| `POST /api/decisions/:id/dismiss` | `decisions.ts` | 创建决策 · 忽略 | pages/WhatNeedsMe.tsx, components/DecisionCard.tsx, components/DecisionResolver.tsx | — | 界面可达 | 无 |
| `POST /api/email/inboxes/:endpointId/control` | `email.ts` | 创建inboxes/control | pages/apps/chat/EmailEndpointSetup.tsx, components/EmailMessageCard.tsx, components/EmailTaskActivity.tsx | — | 界面可达 | 无 |
| `POST /api/email/inboxes/:endpointId/reconnect` | `email.ts` | 创建inboxes/reconnect | pages/apps/chat/EmailEndpointSetup.tsx, components/EmailMessageCard.tsx, components/EmailTaskActivity.tsx | — | 界面可达 | 无 |
| `GET /api/environment-custom-image-setup-sessions/:sessionId` | `environments.ts` | 读取environment-custom-image-setup-sessions | pages/Agents.production.tsx, pages/Agents.tsx, pages/CompanyEnvironments.tsx, components/AgentConfigForm.tsx, +5 | — | 界面可达 | 无 |
| `POST /api/environment-custom-image-setup-sessions/:sessionId/cancel` | `environments.ts` | 创建environment-custom-image-setup-sessions/cancel · 取消 | pages/Agents.production.tsx, pages/Agents.tsx, pages/CompanyEnvironments.tsx, components/AgentConfigForm.tsx, +5 | — | 界面可达 | 无 |
| `POST /api/environment-custom-image-setup-sessions/:sessionId/finish` | `environments.ts` | 创建environment-custom-image-setup-sessions/finish | pages/Agents.production.tsx, pages/Agents.tsx, pages/CompanyEnvironments.tsx, components/AgentConfigForm.tsx, +5 | — | 界面可达 | 无 |
| `POST /api/environment-custom-image-setup-sessions/:sessionId/terminal-session-token` | `environments.ts` | 创建environment-custom-image-setup-sessions/terminal-session-token | pages/Agents.production.tsx, pages/Agents.tsx, pages/CompanyEnvironments.tsx, components/AgentConfigForm.tsx, +5 | — | 界面可达 | 无 |
| `GET /api/environment-leases/:leaseId` | `environments.ts` | 读取environment-leases | pages/Agents.production.tsx, pages/Agents.tsx, pages/CompanyEnvironments.tsx, components/AgentConfigForm.tsx, +5 | — | 界面可达 | 有 |
| `POST /api/environments/:environmentId/custom-image-setup-sessions` | `environments.ts` | 创建环境 (custom-image-setup-sessions) | pages/Agents.production.tsx, pages/Agents.tsx, pages/CompanyEnvironments.tsx, components/AgentConfigForm.tsx, +5 | — | 界面可达 | 无 |
| `DELETE /api/environments/:environmentId/custom-image-template` | `environments.ts` | 删除环境 (custom-image-template) | pages/Agents.production.tsx, pages/Agents.tsx, pages/CompanyEnvironments.tsx, components/AgentConfigForm.tsx, +5 | — | 界面可达 | 无 |
| `GET /api/environments/:environmentId/custom-image-template` | `environments.ts` | 读取环境 (custom-image-template) | pages/Agents.production.tsx, pages/Agents.tsx, pages/CompanyEnvironments.tsx, components/AgentConfigForm.tsx, +5 | — | 界面可达 | 无 |
| `POST /api/environments/:environmentId/custom-image-template/relink` | `environments.ts` | 创建环境 (custom-image-template/relink) | pages/Agents.production.tsx, pages/Agents.tsx, pages/CompanyEnvironments.tsx, components/AgentConfigForm.tsx, +5 | — | 界面可达 | 无 |
| `POST /api/environments/:environmentId/custom-image-template/rollback` | `environments.ts` | 创建环境 (custom-image-template/rollback) | pages/Agents.production.tsx, pages/Agents.tsx, pages/CompanyEnvironments.tsx, components/AgentConfigForm.tsx, +5 | — | 界面可达 | 无 |
| `DELETE /api/environments/:id` | `environments.ts` | 删除环境 | pages/Agents.production.tsx, pages/Agents.tsx, pages/CompanyEnvironments.tsx, components/AgentConfigForm.tsx, +5 | — | 界面可达 | 有 |
| `GET /api/environments/:id` | `environments.ts` | 读取环境 | pages/Agents.production.tsx, pages/Agents.tsx, pages/CompanyEnvironments.tsx, components/AgentConfigForm.tsx, +5 | — | 界面可达 | 有 |
| `PATCH /api/environments/:id` | `environments.ts` | 更新环境 | pages/Agents.production.tsx, pages/Agents.tsx, pages/CompanyEnvironments.tsx, components/AgentConfigForm.tsx, +5 | — | 界面可达 | 有 |
| `GET /api/environments/:id/delete-blast-radius` | `environments.ts` | 读取环境 (delete-blast-radius) | pages/Agents.production.tsx, pages/Agents.tsx, pages/CompanyEnvironments.tsx, components/AgentConfigForm.tsx, +5 | — | 界面可达 | 无 |
| `GET /api/environments/:id/leases` | `environments.ts` | 读取环境 (leases) | — | — | 拨测 | 有 |
| `POST /api/environments/:id/probe` | `environments.ts` | 创建环境 (probe) | pages/Agents.production.tsx, pages/Agents.tsx, pages/CompanyEnvironments.tsx, components/AgentConfigForm.tsx, +5 | — | 界面可达 | 有 |
| `GET /api/environments/:id/secret-refs` | `environments.ts` | 读取环境 (secret-refs) | pages/Agents.production.tsx, pages/Agents.tsx, pages/CompanyEnvironments.tsx, components/AgentConfigForm.tsx, +5 | — | 界面可达 | 无 |
| `GET /api/execution-workspaces/:id` | `execution-workspaces.ts` | 读取执行工作区 | pages/CompanyEnvironments.tsx, pages/ExecutionWorkspaceDetail.tsx, components/IssueWorkspaceCard.tsx, components/ProjectWorkspaceSummaryCard.tsx, +14 | — | 界面可达 | 有 |
| `PATCH /api/execution-workspaces/:id` | `execution-workspaces.ts` | 更新执行工作区 | pages/CompanyEnvironments.tsx, pages/ExecutionWorkspaceDetail.tsx, components/IssueWorkspaceCard.tsx, components/ProjectWorkspaceSummaryCard.tsx, +14 | — | 界面可达 | 有 |
| `GET /api/execution-workspaces/:id/close-readiness` | `execution-workspaces.ts` | 读取执行工作区 (close-readiness) | pages/ExecutionWorkspaceDetail.tsx, pages/Inbox.tsx, pages/IssueDetail.tsx, pages/LegacyInbox.tsx, +12 | — | 界面可达 | 无 |
| `POST /api/execution-workspaces/:id/login-handoff` | `execution-workspaces.ts` | 创建执行工作区 (login-handoff) | pages/ExecutionWorkspaceDetail.tsx, pages/Inbox.tsx, pages/IssueDetail.tsx, pages/LegacyInbox.tsx, +12 | — | 界面可达 | 无 |
| `POST /api/execution-workspaces/:id/reconcile-branch` | `execution-workspaces.ts` | 创建执行工作区 (reconcile-branch) | pages/ExecutionWorkspaceDetail.tsx, pages/Inbox.tsx, pages/IssueDetail.tsx, pages/LegacyInbox.tsx, +12 | — | 界面可达 | 无 |
| `POST /api/execution-workspaces/:id/runtime-commands/:action` | `execution-workspaces.ts` | 创建执行工作区 (runtime-commands) | pages/ExecutionWorkspaceDetail.tsx, pages/Inbox.tsx, pages/IssueDetail.tsx, pages/LegacyInbox.tsx, +12 | — | 界面可达 | 无 |
| `POST /api/execution-workspaces/:id/runtime-services/:action` | `execution-workspaces.ts` | 创建执行工作区 (runtime-services) | pages/ExecutionWorkspaceDetail.tsx, pages/Inbox.tsx, pages/IssueDetail.tsx, pages/LegacyInbox.tsx, +12 | — | 界面可达 | 无 |
| `GET /api/execution-workspaces/:id/workspace-operations` | `execution-workspaces.ts` | 读取执行工作区 (workspace-operations) | pages/ExecutionWorkspaceDetail.tsx, pages/Inbox.tsx, pages/IssueDetail.tsx, pages/LegacyInbox.tsx, +12 | — | 界面可达 | 无 |
| `GET /api/feedback-traces/:traceId` | `issues.ts` | 读取feedback-traces | — | — | 内部RPC | 无 |
| `GET /api/feedback-traces/:traceId/bundle` | `issues.ts` | 读取feedback-traces/bundle | — | — | 内部RPC | 无 |
| `GET /api/git-credentials` | `git-credentials.ts` | 读取Git 凭证 | — | api-client/src/client.ts [仅api层] | 界面可达 | 无 |
| `POST /api/git-credentials` | `git-credentials.ts` | 创建Git 凭证 | — | api-client/src/client.ts [仅api层] | 界面可达 | 无 |
| `DELETE /api/git-credentials/:repoId` | `git-credentials.ts` | 删除Git 凭证 | — | api-client/src/client.ts [仅api层] | 界面可达 | 无 |
| `GET /api/git-credentials/:repoId` | `git-credentials.ts` | 读取Git 凭证 | — | api-client/src/client.ts [仅api层] | 界面可达 | 无 |
| `GET /api/git-pat/target` | `projects.ts` | 读取git-pat/target | — | expo/src/components/CreateProjectSheet.tsx | 界面可达 | 无 |
| `DELETE /api/goals/:id` | `goals.ts` | 删除目标 | pages/GoalDetail.tsx, pages/Goals.tsx, components/ActivityRow.tsx, components/FeedCard.tsx, +4 | — | 界面可达 | 有 |
| `GET /api/goals/:id` | `goals.ts` | 读取目标 | pages/GoalDetail.tsx, pages/Goals.tsx, components/ActivityRow.tsx, components/FeedCard.tsx, +4 | — | 界面可达 | 有 |
| `PATCH /api/goals/:id` | `goals.ts` | 更新目标 | pages/GoalDetail.tsx, pages/Goals.tsx, components/ActivityRow.tsx, components/FeedCard.tsx, +4 | — | 界面可达 | 有 |
| `GET /api/health` | `health.ts` | 读取健康检查 | lib/agent-onboarding-prompt.ts, pages/InstanceGeneralSettings.tsx, pages/InviteLanding.tsx, pages/apps/chat/ChatIdentityConfirm.tsx, +12 | — | 界面可达 | 有 |
| `POST /api/health/dev-server/restart` | `health.ts` | 创建健康检查 (dev-server/restart) | pages/InstanceGeneralSettings.tsx, pages/InviteLanding.tsx, pages/apps/chat/ChatIdentityConfirm.tsx, pages/apps/chat/SlackIdentityStep.tsx, +11 | — | 界面可达 | 无 |
| `GET /api/heartbeat-runs/:runId` | `agents.ts` | 读取heartbeat-runs | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/Agents.production.tsx, +41 | — | 界面可达 | 有 |
| `POST /api/heartbeat-runs/:runId/cancel` | `agents.ts` | 创建heartbeat-runs/cancel · 取消 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/Agents.production.tsx, +41 | — | 界面可达 | 有 |
| `GET /api/heartbeat-runs/:runId/events` | `agents.ts` | 读取事件 (heartbeat-runs) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/Agents.production.tsx, +41 | — | 界面可达 | 有 |
| `GET /api/heartbeat-runs/:runId/issues` | `activity.ts` | 读取任务 (heartbeat-runs) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/Dashboard.tsx, pages/IssueDetail.tsx, +7 | — | 界面可达 | 有 |
| `GET /api/heartbeat-runs/:runId/log` | `agents.ts` | 读取heartbeat-runs/log | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/Agents.production.tsx, +41 | — | 界面可达 | 有 |
| `DELETE /api/heartbeat-runs/:runId/provider-trace` | `agents.ts` | 删除heartbeat-runs/provider-trace | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/Agents.production.tsx, +41 | — | 界面可达 | 无 |
| `GET /api/heartbeat-runs/:runId/provider-trace` | `agents.ts` | 读取heartbeat-runs/provider-trace | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/Agents.production.tsx, +41 | — | 界面可达 | 无 |
| `GET /api/heartbeat-runs/:runId/provider-trace/download` | `agents.ts` | 读取provider-trace/download · 下载 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/Agents.production.tsx, +41 | — | 界面可达 | 无 |
| `POST /api/heartbeat-runs/:runId/provider-trace/frames/:frameId/reveal` | `agents.ts` | 创建frames/reveal | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/Agents.production.tsx, +41 | — | 界面可达 | 无 |
| `POST /api/heartbeat-runs/:runId/provider-trace/reproject-workspace-diffs` | `agents.ts` | 创建provider-trace/reproject-workspace-diffs | — | — | 后台任务 | 无 |
| `POST /api/heartbeat-runs/:runId/runtime-requests/:requestId/resolve` | `agents.ts` | 创建runtime-requests/resolve · 裁决 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/Agents.production.tsx, +41 | — | 界面可达 | 无 |
| `POST /api/heartbeat-runs/:runId/watchdog-decisions` | `agents.ts` | 创建heartbeat-runs/watchdog-decisions | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/Agents.production.tsx, +41 | — | 界面可达 | 无 |
| `GET /api/heartbeat-runs/:runId/workspace-operations` | `agents.ts` | 读取heartbeat-runs/workspace-operations | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/Agents.production.tsx, +41 | — | 界面可达 | 有 |
| `GET /api/inbox` | `inbox.ts` | 读取收件箱 | pages/IssueDetail.tsx, pages/JoinRequestQueue.tsx, lib/issueDetailBreadcrumb.ts, components/CommandPalette.tsx, +5 | api-client/src/client.ts [仅api层] | 界面可达 | 无 |
| `POST /api/instance/database-backups` | `instance-database-backups.ts` | 创建instance/database-backups | — | — | 拨测 | 有 |
| `GET /api/instance/lifecycle` | `instance-settings.ts` | 读取instance/lifecycle · 生命周期 | — | — | 拨测 | 有 |
| `POST /api/instance/lifecycle/unarchive-primary` | `instance-settings.ts` | 创建lifecycle/unarchive-primary · 生命周期 | — | — | 拨测 | 有 |
| `GET /api/instance/scheduler-heartbeats` | `agents.ts` | 读取instance/scheduler-heartbeats | — | — | 后台任务 | 无 |
| `GET /api/instance/settings` | `instance-settings.ts` | 读取instance/settings · 设置 | wizard-preview-main.tsx, plugins/bridge.ts, lib/instance-settings.ts, pages/AgentDetail.production.tsx, +52 | — | 界面可达 | 有 |
| `PATCH /api/instance/settings` | `instance-settings.ts` | 更新instance/settings · 设置 | wizard-preview-main.tsx, plugins/bridge.ts, lib/instance-settings.ts, pages/AgentDetail.production.tsx, +52 | — | 界面可达 | 有 |
| `GET /api/instance/settings/experimental` | `instance-settings.ts` | 读取settings/experimental · 设置 | wizard-preview-main.tsx, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/Agents.production.tsx, +50 | — | 界面可达 | 有 |
| `PATCH /api/instance/settings/experimental` | `instance-settings.ts` | 更新settings/experimental · 设置 | wizard-preview-main.tsx, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/Agents.production.tsx, +50 | — | 界面可达 | 有 |
| `GET /api/instance/settings/general` | `instance-settings.ts` | 读取settings/general · 设置 | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/Agents.production.tsx, pages/Agents.tsx, +49 | — | 界面可达 | 有 |
| `PATCH /api/instance/settings/general` | `instance-settings.ts` | 更新settings/general · 设置 | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/Agents.production.tsx, pages/Agents.tsx, +49 | — | 界面可达 | 有 |
| `DELETE /api/instance/task-drain` | `instance-settings.ts` | 删除instance/task-drain | — | — | 拨测 | 有 |
| `GET /api/instance/task-drain` | `instance-settings.ts` | 读取instance/task-drain | — | — | 拨测 | 有 |
| `POST /api/instance/task-drain` | `instance-settings.ts` | 创建instance/task-drain | — | — | 拨测 | 有 |
| `POST /api/invites/:inviteId/revoke` | `access.ts` | 创建邀请 (revoke) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardClaim.tsx, +41 | — | 界面可达 | 无 |
| `GET /api/invites/:token` | `access.ts` | 读取邀请 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardClaim.tsx, +41 | — | 界面可达 | 有 |
| `POST /api/invites/:token/accept` | `access.ts` | 创建邀请 (accept) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardClaim.tsx, +41 | — | 界面可达 | 有 |
| `GET /api/invites/:token/logo` | `access.ts` | 读取邀请 (logo) | — | — | 未接线 | 无 |
| `GET /api/invites/:token/onboarding` | `access.ts` | 读取上手引导 · 邀请 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardClaim.tsx, +41 | — | 界面可达 | 无 |
| `GET /api/invites/:token/onboarding.txt` | `access.ts` | 读取邀请 (onboarding.txt) | components/new-agent/ExternalAgentInviteDialog.tsx | — | 界面可达 | 无 |
| `GET /api/invites/:token/skills/:skillName` | `access.ts` | 读取技能 · 邀请 | — | — | 内部RPC | 无 |
| `GET /api/invites/:token/skills/index` | `access.ts` | 读取技能 · 邀请 | — | — | 未接线 | 无 |
| `GET /api/invites/:token/test-resolution` | `access.ts` | 读取邀请 (test-resolution) | — | — | 未接线 | 无 |
| `GET /api/issues` | `issues.ts` | 读取任务 | App.tsx, pages/Dashboard.tsx, pages/IssueDetail.tsx, pages/Search.tsx, +6 | expo/src/screens/WebLoginScreen.tsx | 界面可达 | 有 |
| `DELETE /api/issues/:id` | `issues.ts` | 删除任务 | pages/Inbox.tsx, pages/LegacyInbox.tsx, pages/SkillStudio.tsx, pages/tools/AuditTab.tsx, +78 | expo/src/coolie.ts | 界面可达 | 有 |
| `GET /api/issues/:id` | `issues.ts` | 读取任务 | pages/Inbox.tsx, pages/LegacyInbox.tsx, pages/SkillStudio.tsx, pages/tools/AuditTab.tsx, +78 | expo/src/coolie.ts | 界面可达 | 有 |
| `PATCH /api/issues/:id` | `issues.ts` | 更新任务 | pages/Inbox.tsx, pages/LegacyInbox.tsx, pages/SkillStudio.tsx, pages/tools/AuditTab.tsx, +78 | expo/src/coolie.ts | 界面可达 | 有 |
| `GET /api/issues/:id/accepted-plan-decompositions` | `issues.ts` | 读取任务 (accepted-plan-decompositions) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 有 |
| `POST /api/issues/:id/accepted-plan-decompositions` | `issues.ts` | 创建任务 (accepted-plan-decompositions) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 有 |
| `GET /api/issues/:id/activity` | `activity.ts` | 读取动态 | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/Dashboard.tsx, pages/IssueDetail.tsx, +7 | — | 界面可达 | 有 |
| `POST /api/issues/:id/admin/force-release` | `issues.ts` | 创建任务 (admin/force-release) | — | — | 拨测 | 有 |
| `GET /api/issues/:id/approvals` | `issues.ts` | 读取审批 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 有 |
| `POST /api/issues/:id/approvals` | `issues.ts` | 创建审批 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 有 |
| `DELETE /api/issues/:id/approvals/:approvalId` | `issues.ts` | 删除审批 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 无 |
| `GET /api/issues/:id/attachments` | `issues.ts` | 读取附件 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | expo/src/coolie.ts | 界面可达 | 有 |
| `POST /api/issues/:id/checkout` | `issues.ts` | 创建任务 · 领取 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 有 |
| `POST /api/issues/:id/children` | `issues.ts` | 创建任务 (children) | — | — | 拨测 | 有 |
| `GET /api/issues/:id/comments` | `issues.ts` | 读取评论 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | expo/src/coolie.ts | 界面可达 | 有 |
| `POST /api/issues/:id/comments` | `issues.ts` | 创建评论 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | expo/src/coolie.ts | 界面可达 | 有 |
| `DELETE /api/issues/:id/comments/:commentId` | `issues.ts` | 删除评论 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 有 |
| `GET /api/issues/:id/comments/:commentId` | `issues.ts` | 读取评论 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 有 |
| `GET /api/issues/:id/cost-summary` | `costs.ts` | 读取任务 (cost-summary) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | expo/src/coolie.ts | 界面可达 | 无 |
| `GET /api/issues/:id/diagnostics/blockers` | `issues.ts` | 读取任务 · 阻塞 | — | — | 拨测 | 有 |
| `GET /api/issues/:id/diagnostics/subtree` | `issues.ts` | 读取任务 · 子树 | — | — | 拨测 | 有 |
| `GET /api/issues/:id/diagnostics/wakes` | `issues.ts` | 读取任务 · 唤醒 | — | — | 拨测 | 有 |
| `GET /api/issues/:id/documents` | `issues.ts` | 读取文档 | — | — | 拨测 | 有 |
| `DELETE /api/issues/:id/documents/:key` | `issues.ts` | 删除文档 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 有 |
| `GET /api/issues/:id/documents/:key` | `issues.ts` | 读取文档 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 有 |
| `PUT /api/issues/:id/documents/:key` | `issues.ts` | 更新文档 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 有 |
| `GET /api/issues/:id/documents/:key/annotations` | `issues.ts` | 读取文档 (annotations) | hooks/useDocumentAnnotationMutations.ts, components/DocumentAnnotationPanel.tsx, components/DocumentAnnotationPopover.tsx, components/IssueDocumentAnnotations.tsx, +1 | — | 界面可达 | 无 |
| `POST /api/issues/:id/documents/:key/annotations` | `issues.ts` | 创建文档 (annotations) | hooks/useDocumentAnnotationMutations.ts, components/DocumentAnnotationPanel.tsx, components/DocumentAnnotationPopover.tsx, components/IssueDocumentAnnotations.tsx, +1 | — | 界面可达 | 无 |
| `GET /api/issues/:id/documents/:key/annotations/:threadId` | `issues.ts` | 读取文档 (annotations) | — | — | 未接线 | 无 |
| `PATCH /api/issues/:id/documents/:key/annotations/:threadId` | `issues.ts` | 更新文档 (annotations) | — | — | 未接线 | 无 |
| `POST /api/issues/:id/documents/:key/annotations/:threadId/comments` | `issues.ts` | 创建评论 (annotations) | — | — | 未接线 | 无 |
| `POST /api/issues/:id/documents/:key/lock` | `issues.ts` | 创建文档 (lock) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 无 |
| `GET /api/issues/:id/documents/:key/revisions` | `issues.ts` | 读取文档 (revisions) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 有 |
| `POST /api/issues/:id/documents/:key/revisions/:revisionId/restore` | `issues.ts` | 创建文档 (revisions/restore) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 有 |
| `POST /api/issues/:id/documents/:key/unlock` | `issues.ts` | 创建文档 (unlock) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 无 |
| `GET /api/issues/:id/external-object-summary` | `issues.ts` | 读取任务 (external-object-summary) | hooks/useIssueExternalObjects.ts | — | 界面可达 | 有 |
| `GET /api/issues/:id/external-objects` | `issues.ts` | 读取任务 (external-objects) | hooks/useIssueExternalObjects.ts | — | 界面可达 | 有 |
| `POST /api/issues/:id/external-objects/refresh` | `issues.ts` | 创建任务 · 刷新 | hooks/useIssueExternalObjects.ts | — | 界面可达 | 有 |
| `GET /api/issues/:id/feedback-traces` | `issues.ts` | 读取任务 (feedback-traces) | — | — | 未接线 | 无 |
| `GET /api/issues/:id/feedback-votes` | `issues.ts` | 读取任务 (feedback-votes) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 无 |
| `POST /api/issues/:id/feedback-votes` | `issues.ts` | 创建任务 (feedback-votes) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 无 |
| `GET /api/issues/:id/heartbeat-context` | `issues.ts` | 读取任务 (heartbeat-context) | — | — | 拨测 | 有 |
| `DELETE /api/issues/:id/inbox-archive` | `issues.ts` | 删除任务 · 收件箱归档 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | api-client/src/client.ts [仅api层] | 界面可达 | 有 |
| `POST /api/issues/:id/inbox-archive` | `issues.ts` | 创建任务 · 收件箱归档 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | api-client/src/client.ts [仅api层] | 界面可达 | 有 |
| `GET /api/issues/:id/interactions` | `issues.ts` | 读取任务 (interactions) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 有 |
| `POST /api/issues/:id/interactions` | `issues.ts` | 创建任务 (interactions) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 有 |
| `POST /api/issues/:id/interactions/:interactionId/accept` | `issues.ts` | 创建任务 (interactions/accept) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 有 |
| `POST /api/issues/:id/interactions/:interactionId/cancel` | `issues.ts` | 创建任务 · 取消 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 无 |
| `POST /api/issues/:id/interactions/:interactionId/reject` | `issues.ts` | 创建任务 · 驳回 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 有 |
| `POST /api/issues/:id/interactions/:interactionId/respond` | `issues.ts` | 创建任务 (interactions/respond) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 有 |
| `POST /api/issues/:id/interactions/:interactionId/skip` | `issues.ts` | 创建任务 (interactions/skip) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 无 |
| `POST /api/issues/:id/interactions/:interactionId/verdicts` | `issues.ts` | 创建任务 (interactions/verdicts) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 无 |
| `POST /api/issues/:id/interactions/:interactionId/withdraw` | `issues.ts` | 创建任务 (interactions/withdraw) | — | — | 未接线 | 无 |
| `POST /api/issues/:id/low-trust/promotions` | `issues.ts` | 创建任务 (low-trust/promotions) | — | — | 拨测 | 有 |
| `POST /api/issues/:id/monitor/check-now` | `issues.ts` | 创建任务 (monitor/check-now) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 无 |
| `GET /api/issues/:id/queued-comments` | `issues.ts` | 读取任务 (queued-comments) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 有 |
| `DELETE /api/issues/:id/queued-comments/:commentId` | `issues.ts` | 删除任务 (queued-comments) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 有 |
| `PATCH /api/issues/:id/queued-comments/:commentId` | `issues.ts` | 更新任务 (queued-comments) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 有 |
| `POST /api/issues/:id/queued-comments/:commentId/steer` | `issues.ts` | 创建任务 (queued-comments/steer) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 有 |
| `POST /api/issues/:id/queued-comments/interrupt` | `issues.ts` | 创建任务 (queued-comments/interrupt) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 有 |
| `PUT /api/issues/:id/queued-comments/order` | `issues.ts` | 更新任务 (queued-comments/order) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 有 |
| `DELETE /api/issues/:id/read` | `issues.ts` | 删除任务 (read) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 无 |
| `POST /api/issues/:id/read` | `issues.ts` | 创建任务 (read) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 无 |
| `GET /api/issues/:id/recovery-actions` | `issues.ts` | 读取任务 · 恢复动作 | — | — | 拨测 | 有 |
| `POST /api/issues/:id/recovery-actions/resolve` | `issues.ts` | 创建任务 · 裁决 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 有 |
| `POST /api/issues/:id/release` | `issues.ts` | 创建任务 (release) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 有 |
| `GET /api/issues/:id/runner-goal` | `issues.ts` | 读取任务 (runner-goal) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 无 |
| `POST /api/issues/:id/runner-goal/actions` | `issues.ts` | 创建任务 (runner-goal/actions) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 无 |
| `GET /api/issues/:id/runs` | `activity.ts` | 读取运行 | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/Dashboard.tsx, pages/IssueDetail.tsx, +7 | — | 界面可达 | 有 |
| `POST /api/issues/:id/scheduled-retry/retry-now` | `issues.ts` | 创建任务 (scheduled-retry/retry-now) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 有 |
| `POST /api/issues/:id/stalled-review-decision` | `issues.ts` | 创建任务 (stalled-review-decision) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 有 |
| `POST /api/issues/:id/tree-control/preview` | `issue-tree-control.ts` | 创建任务 · 预览 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 无 |
| `GET /api/issues/:id/tree-control/state` | `issue-tree-control.ts` | 读取任务 (tree-control/state) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 有 |
| `GET /api/issues/:id/tree-holds` | `issue-tree-control.ts` | 读取任务 (tree-holds) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 无 |
| `POST /api/issues/:id/tree-holds` | `issue-tree-control.ts` | 创建任务 (tree-holds) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 无 |
| `GET /api/issues/:id/tree-holds/:holdId` | `issue-tree-control.ts` | 读取任务 (tree-holds) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 无 |
| `POST /api/issues/:id/tree-holds/:holdId/release` | `issue-tree-control.ts` | 创建任务 (tree-holds/release) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 有 |
| `DELETE /api/issues/:id/watchdog` | `issues.ts` | 删除任务 · 看门狗 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 有 |
| `GET /api/issues/:id/watchdog` | `issues.ts` | 读取任务 · 看门狗 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 有 |
| `PUT /api/issues/:id/watchdog` | `issues.ts` | 更新任务 · 看门狗 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 有 |
| `GET /api/issues/:id/work-products` | `issues.ts` | 读取交付产物 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | api-client/src/client.ts [仅api层] | 界面可达 | 有 |
| `POST /api/issues/:id/work-products` | `issues.ts` | 创建交付产物 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | api-client/src/client.ts [仅api层] | 界面可达 | 有 |
| `POST /api/issues/:id/work-products/:workProductId/review-document` | `issues.ts` | 创建交付产物 (review-document) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 有 |
| `GET /api/issues/:issueId/active-run` | `agents.ts` | 读取任务 (active-run) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/Agents.production.tsx, +41 | — | 界面可达 | 无 |
| `GET /api/issues/:issueId/cases` | `cases.ts` | 读取案例 | pages/CaseDetail.tsx, pages/Cases.tsx, components/CaseActivityFeed.tsx, components/CaseAttachmentsGallery.tsx, +3 | — | 界面可达 | 有 |
| `GET /api/issues/:issueId/chat-binding` | `chat-channels.ts` | 读取任务 (chat-binding) | pages/apps/Browse.tsx, pages/apps/chat/ChatEndpointDetail.tsx, pages/apps/chat/ChatEndpointSetup.tsx, pages/apps/chat/ChatIdentityConfirm.tsx, +8 | — | 界面可达 | 有 |
| `GET /api/issues/:issueId/execution` | `agents.ts` | 读取任务 (execution) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/Agents.production.tsx, +41 | — | 界面可达 | 无 |
| `POST /api/issues/:issueId/file-resources/availability` | `file-resources.ts` | 创建文件资源 (availability) | hooks/useWorkspaceFileAvailability.ts, components/FileViewerSheet.tsx, components/WorkspaceFileBrowser.tsx, components/task-side-panel/TaskSidePanel.tsx, +1 | — | 界面可达 | 有 |
| `GET /api/issues/:issueId/file-resources/content` | `file-resources.ts` | 读取文件资源 (content) | hooks/useWorkspaceFileAvailability.ts, components/FileViewerSheet.tsx, components/WorkspaceFileBrowser.tsx, components/task-side-panel/TaskSidePanel.tsx, +1 | — | 界面可达 | 有 |
| `GET /api/issues/:issueId/file-resources/list` | `file-resources.ts` | 读取文件资源 (list) | hooks/useWorkspaceFileAvailability.ts, components/FileViewerSheet.tsx, components/WorkspaceFileBrowser.tsx, components/task-side-panel/TaskSidePanel.tsx, +1 | — | 界面可达 | 有 |
| `GET /api/issues/:issueId/file-resources/resolve` | `file-resources.ts` | 读取文件资源 · 裁决 | hooks/useWorkspaceFileAvailability.ts, components/FileViewerSheet.tsx, components/WorkspaceFileBrowser.tsx, components/task-side-panel/TaskSidePanel.tsx, +1 | — | 界面可达 | 有 |
| `GET /api/issues/:issueId/live-runs` | `agents.ts` | 读取任务 (live-runs) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/Agents.production.tsx, +41 | — | 界面可达 | 有 |
| `POST /api/join-requests/:requestId/claim-api-key` | `access.ts` | 创建join-requests/claim-api-key | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardClaim.tsx, +41 | — | 界面可达 | 无 |
| `DELETE /api/labels/:labelId` | `issues.ts` | 删除标签 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 无 |
| `GET /api/llms/agent-configuration.txt` | `llms.ts` | 读取模型 (agent-configuration.txt) | — | — | 拨测 | 有 |
| `GET /api/llms/agent-configuration/:adapterType.txt` | `llms.ts` | 读取模型 (agent-configuration) | — | — | 未接线 | 无 |
| `GET /api/llms/agent-icons.txt` | `llms.ts` | 读取模型 (agent-icons.txt) | — | — | 内部RPC | 无 |
| `POST /api/mcp/project-tools` | `project-tools.ts` | 创建mcp/project-tools | — | — | 内部RPC | 无 |
| `GET /api/notifications` | `notifications.ts` | 读取通知 | — | expo/src/coolie.ts | 界面可达 | 无 |
| `PATCH /api/notifications/:id/read` | `notifications.ts` | 更新通知 (read) | — | expo/src/coolie.ts | 界面可达 | 无 |
| `GET /api/openapi.json` | `openapi.ts` | 读取openapi.json | — | — | 内部RPC | 无 |
| `GET /api/ota/manifest` | `ota-manifest.ts` | 读取ota/manifest | — | — | 未接线 | 无 |
| `GET /api/ota/manifest.json` | `ota-manifest.ts` | 读取ota/manifest.json | — | — | 未接线 | 无 |
| `GET /api/pipelines/:pipelineId` | `pipelines.ts` | 读取管线 | pages/PipelineSettings.tsx, pages/Pipelines.tsx, lib/pipeline-breakdown.ts, lib/pipeline-item-detail.ts, +3 | expo/src/screens/PipelinesScreen.tsx, h5/src/screens/PipelinesScreen.tsx | 界面可达 | 有 |
| `PATCH /api/pipelines/:pipelineId` | `pipelines.ts` | 更新管线 | pages/PipelineSettings.tsx, pages/Pipelines.tsx, lib/pipeline-breakdown.ts, lib/pipeline-item-detail.ts, +3 | expo/src/screens/PipelinesScreen.tsx, h5/src/screens/PipelinesScreen.tsx | 界面可达 | 有 |
| `GET /api/pipelines/:pipelineId/cases` | `pipelines.ts` | 读取案例 | — | — | 拨测 | 有 |
| `POST /api/pipelines/:pipelineId/cases` | `pipelines.ts` | 创建案例 | — | — | 拨测 | 有 |
| `POST /api/pipelines/:pipelineId/cases/batch` | `pipelines.ts` | 创建案例 (batch) | pages/PipelineSettings.tsx, pages/Pipelines.tsx, lib/pipeline-breakdown.ts, lib/pipeline-item-detail.ts, +3 | — | 界面可达 | 有 |
| `GET /api/pipelines/:pipelineId/documents/:key` | `pipelines.ts` | 读取文档 | pages/PipelineSettings.tsx, pages/Pipelines.tsx, lib/pipeline-breakdown.ts, lib/pipeline-item-detail.ts, +3 | — | 界面可达 | 无 |
| `PUT /api/pipelines/:pipelineId/documents/:key` | `pipelines.ts` | 更新文档 | pages/PipelineSettings.tsx, pages/Pipelines.tsx, lib/pipeline-breakdown.ts, lib/pipeline-item-detail.ts, +3 | — | 界面可达 | 无 |
| `GET /api/pipelines/:pipelineId/documents/:key/revisions` | `pipelines.ts` | 读取文档 (revisions) | pages/PipelineSettings.tsx, pages/Pipelines.tsx, lib/pipeline-breakdown.ts, lib/pipeline-item-detail.ts, +3 | — | 界面可达 | 有 |
| `POST /api/pipelines/:pipelineId/documents/:key/revisions/:revisionId/restore` | `pipelines.ts` | 创建文档 (revisions/restore) | pages/PipelineSettings.tsx, pages/Pipelines.tsx, lib/pipeline-breakdown.ts, lib/pipeline-item-detail.ts, +3 | — | 界面可达 | 有 |
| `GET /api/pipelines/:pipelineId/health` | `pipelines.ts` | 读取健康检查 | pages/PipelineSettings.tsx, pages/Pipelines.tsx, lib/pipeline-breakdown.ts, lib/pipeline-item-detail.ts, +3 | — | 界面可达 | 无 |
| `GET /api/pipelines/:pipelineId/intake-form` | `pipelines.ts` | 读取管线 (intake-form) | pages/PipelineSettings.tsx, pages/Pipelines.tsx, lib/pipeline-breakdown.ts, lib/pipeline-item-detail.ts, +3 | — | 界面可达 | 无 |
| `POST /api/pipelines/:pipelineId/stages` | `pipelines.ts` | 创建管线 (stages) | pages/PipelineSettings.tsx, pages/Pipelines.tsx, lib/pipeline-breakdown.ts, lib/pipeline-item-detail.ts, +3 | — | 界面可达 | 有 |
| `DELETE /api/pipelines/:pipelineId/stages/:stageId` | `pipelines.ts` | 删除管线 (stages) | pages/PipelineSettings.tsx, pages/Pipelines.tsx, lib/pipeline-breakdown.ts, lib/pipeline-item-detail.ts, +3 | — | 界面可达 | 有 |
| `PATCH /api/pipelines/:pipelineId/stages/:stageId` | `pipelines.ts` | 更新管线 (stages) | pages/PipelineSettings.tsx, pages/Pipelines.tsx, lib/pipeline-breakdown.ts, lib/pipeline-item-detail.ts, +3 | — | 界面可达 | 有 |
| `PATCH /api/pipelines/:pipelineId/stages/:stageId/automation-env` | `pipelines.ts` | 更新管线 (stages/automation-env) | pages/PipelineSettings.tsx, pages/Pipelines.tsx, lib/pipeline-breakdown.ts, lib/pipeline-item-detail.ts, +3 | — | 界面可达 | 无 |
| `PUT /api/pipelines/:pipelineId/transitions` | `pipelines.ts` | 更新管线 (transitions) | pages/PipelineSettings.tsx, pages/Pipelines.tsx, lib/pipeline-breakdown.ts, lib/pipeline-item-detail.ts, +3 | — | 界面可达 | 有 |
| `GET /api/plugins` | `plugins.ts` | 读取插件 | lib/instance-settings.ts | — | 界面可达 | 无 |
| `DELETE /api/plugins/:pluginId` | `plugins.ts` | 删除插件 | plugins/bridge.ts, plugins/launchers.tsx, plugins/slots.tsx, pages/PluginManager.tsx, +4 | — | 界面可达 | 有 |
| `GET /api/plugins/:pluginId` | `plugins.ts` | 读取插件 | plugins/bridge.ts, plugins/launchers.tsx, plugins/slots.tsx, pages/PluginManager.tsx, +4 | — | 界面可达 | 有 |
| `POST /api/plugins/:pluginId/actions/:key` | `plugins.ts` | 创建插件 (actions) | plugins/bridge.ts, plugins/launchers.tsx, plugins/slots.tsx, pages/PluginManager.tsx, +4 | — | 界面可达 | 无 |
| `POST /api/plugins/:pluginId/bridge/action` | `plugins.ts` | 创建插件 (bridge/action) | — | — | 拨测 | 有 |
| `POST /api/plugins/:pluginId/bridge/data` | `plugins.ts` | 创建插件 (bridge/data) | — | — | 拨测 | 有 |
| `GET /api/plugins/:pluginId/bridge/stream/:channel` | `plugins.ts` | 读取插件 · 流式 | plugins/bridge.ts | — | 界面可达 | 无 |
| `GET /api/plugins/:pluginId/companies/:companyId/local-folders` | `plugins.ts` | 读取公司 (local-folders) | plugins/bridge.ts, plugins/launchers.tsx, plugins/slots.tsx, pages/PluginManager.tsx, +4 | — | 界面可达 | 无 |
| `PUT /api/plugins/:pluginId/companies/:companyId/local-folders/:folderKey` | `plugins.ts` | 更新公司 (local-folders) | plugins/bridge.ts, plugins/launchers.tsx, plugins/slots.tsx, pages/PluginManager.tsx, +4 | — | 界面可达 | 无 |
| `GET /api/plugins/:pluginId/companies/:companyId/local-folders/:folderKey/status` | `plugins.ts` | 读取状态 (local-folders) | plugins/bridge.ts, plugins/launchers.tsx, plugins/slots.tsx, pages/PluginManager.tsx, +4 | — | 界面可达 | 无 |
| `POST /api/plugins/:pluginId/companies/:companyId/local-folders/:folderKey/validate` | `plugins.ts` | 创建公司 (local-folders/validate) | plugins/bridge.ts, plugins/launchers.tsx, plugins/slots.tsx, pages/PluginManager.tsx, +4 | — | 界面可达 | 无 |
| `GET /api/plugins/:pluginId/config` | `plugins.ts` | 读取插件 (config) | plugins/bridge.ts, plugins/launchers.tsx, plugins/slots.tsx, pages/PluginManager.tsx, +4 | — | 界面可达 | 有 |
| `POST /api/plugins/:pluginId/config` | `plugins.ts` | 创建插件 (config) | plugins/bridge.ts, plugins/launchers.tsx, plugins/slots.tsx, pages/PluginManager.tsx, +4 | — | 界面可达 | 有 |
| `POST /api/plugins/:pluginId/config/test` | `plugins.ts` | 创建插件 (config/test) | plugins/bridge.ts, plugins/launchers.tsx, plugins/slots.tsx, pages/PluginManager.tsx, +4 | — | 界面可达 | 有 |
| `GET /api/plugins/:pluginId/dashboard` | `plugins.ts` | 读取驾驶舱 | plugins/bridge.ts, plugins/launchers.tsx, plugins/slots.tsx, pages/PluginManager.tsx, +4 | — | 界面可达 | 无 |
| `POST /api/plugins/:pluginId/data/:key` | `plugins.ts` | 创建插件 (data) | plugins/bridge.ts, plugins/launchers.tsx, plugins/slots.tsx, pages/PluginManager.tsx, +4 | — | 界面可达 | 无 |
| `POST /api/plugins/:pluginId/disable` | `plugins.ts` | 创建插件 (disable) | plugins/bridge.ts, plugins/launchers.tsx, plugins/slots.tsx, pages/PluginManager.tsx, +4 | — | 界面可达 | 有 |
| `POST /api/plugins/:pluginId/enable` | `plugins.ts` | 创建插件 (enable) | plugins/bridge.ts, plugins/launchers.tsx, plugins/slots.tsx, pages/PluginManager.tsx, +4 | — | 界面可达 | 有 |
| `GET /api/plugins/:pluginId/health` | `plugins.ts` | 读取健康检查 | plugins/bridge.ts, plugins/launchers.tsx, plugins/slots.tsx, pages/PluginManager.tsx, +4 | — | 界面可达 | 无 |
| `GET /api/plugins/:pluginId/jobs` | `plugins.ts` | 读取插件 (jobs) | — | — | 内部RPC | 无 |
| `GET /api/plugins/:pluginId/jobs/:jobId/runs` | `plugins.ts` | 读取运行 (jobs) | — | — | 未接线 | 无 |
| `POST /api/plugins/:pluginId/jobs/:jobId/trigger` | `plugins.ts` | 创建插件 (jobs/trigger) | — | — | 内部RPC | 无 |
| `GET /api/plugins/:pluginId/logs` | `plugins.ts` | 读取插件 (logs) | — | — | 未接线 | 无 |
| `POST /api/plugins/:pluginId/upgrade` | `plugins.ts` | 创建插件 (upgrade) | plugins/bridge.ts, plugins/launchers.tsx, plugins/slots.tsx, pages/PluginManager.tsx, +4 | — | 界面可达 | 有 |
| `POST /api/plugins/:pluginId/webhooks/:endpointKey` | `plugins.ts` | 创建插件 (webhooks) | — | — | 内部RPC | 无 |
| `GET /api/plugins/examples` | `plugins.ts` | 读取插件 (examples) | plugins/bridge.ts, plugins/launchers.tsx, plugins/slots.tsx, pages/PluginManager.tsx, +4 | — | 界面可达 | 有 |
| `POST /api/plugins/install` | `plugins.ts` | 创建插件 (install) | plugins/bridge.ts, plugins/launchers.tsx, plugins/slots.tsx, pages/PluginManager.tsx, +4 | — | 界面可达 | 有 |
| `GET /api/plugins/tools` | `plugins.ts` | 读取插件 (tools) | — | — | 拨测 | 有 |
| `POST /api/plugins/tools/execute` | `plugins.ts` | 创建插件 (tools/execute) | — | — | 拨测 | 有 |
| `GET /api/plugins/ui-contributions` | `plugins.ts` | 读取插件 (ui-contributions) | plugins/bridge.ts, plugins/launchers.tsx, plugins/slots.tsx, pages/PluginManager.tsx, +4 | — | 界面可达 | 无 |
| `DELETE /api/projects/:id` | `projects.ts` | 删除项目 | pages/ExecutionWorkspaceDetail.tsx, pages/IssueDetail.tsx, pages/ProjectDetail.tsx, pages/ProjectWorkspaceDetail.tsx, +47 | expo/src/screens/ProjectsScreen.tsx | 界面可达 | 有 |
| `GET /api/projects/:id` | `projects.ts` | 读取项目 | pages/ExecutionWorkspaceDetail.tsx, pages/IssueDetail.tsx, pages/ProjectDetail.tsx, pages/ProjectWorkspaceDetail.tsx, +47 | expo/src/screens/ProjectsScreen.tsx | 界面可达 | 有 |
| `PATCH /api/projects/:id` | `projects.ts` | 更新项目 | pages/ExecutionWorkspaceDetail.tsx, pages/IssueDetail.tsx, pages/ProjectDetail.tsx, pages/ProjectWorkspaceDetail.tsx, +47 | expo/src/screens/ProjectsScreen.tsx | 界面可达 | 有 |
| `GET /api/projects/:id/external-object-summary` | `projects.ts` | 读取项目 (external-object-summary) | hooks/useIssueExternalObjects.ts | — | 界面可达 | 无 |
| `PUT /api/projects/:id/repositories` | `projects.ts` | 更新项目 (repositories) | — | — | 未接线 | 无 |
| `GET /api/projects/:id/workspaces` | `projects.ts` | 读取工作区 | pages/ExecutionWorkspaceDetail.tsx, pages/ProjectDetail.tsx, pages/ProjectWorkspaceDetail.tsx, pages/Workspaces.tsx | — | 界面可达 | 有 |
| `POST /api/projects/:id/workspaces` | `projects.ts` | 创建工作区 | pages/ExecutionWorkspaceDetail.tsx, pages/ProjectDetail.tsx, pages/ProjectWorkspaceDetail.tsx, pages/Workspaces.tsx | — | 界面可达 | 有 |
| `DELETE /api/projects/:id/workspaces/:workspaceId` | `projects.ts` | 删除工作区 | — | — | 拨测 | 有 |
| `PATCH /api/projects/:id/workspaces/:workspaceId` | `projects.ts` | 更新工作区 | — | — | 拨测 | 有 |
| `POST /api/projects/:id/workspaces/:workspaceId/runtime-commands/:action` | `projects.ts` | 创建工作区 (runtime-commands) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/Cases.tsx, +42 | — | 界面可达 | 无 |
| `POST /api/projects/:id/workspaces/:workspaceId/runtime-services/:action` | `projects.ts` | 创建工作区 (runtime-services) | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/Cases.tsx, +42 | — | 界面可达 | 无 |
| `GET /api/release-notes` | `release-notes.ts` | 读取release-notes | — | expo/src/releaseNotes.ts, h5/src/screens/WhatsNewScreen.tsx | 界面可达 | 无 |
| `DELETE /api/routine-triggers/:id` | `routines.ts` | 删除routine-triggers | pages/CompanyImport.tsx, pages/ExecutionWorkspaceDetail.tsx, pages/RoutineDetail.production.tsx, pages/RoutineDetail.tsx, +11 | — | 界面可达 | 有 |
| `PATCH /api/routine-triggers/:id` | `routines.ts` | 更新routine-triggers | pages/CompanyImport.tsx, pages/ExecutionWorkspaceDetail.tsx, pages/RoutineDetail.production.tsx, pages/RoutineDetail.tsx, +11 | — | 界面可达 | 有 |
| `POST /api/routine-triggers/:id/rotate-secret` | `routines.ts` | 创建routine-triggers/rotate-secret | pages/CompanyImport.tsx, pages/ExecutionWorkspaceDetail.tsx, pages/RoutineDetail.production.tsx, pages/RoutineDetail.tsx, +11 | — | 界面可达 | 有 |
| `POST /api/routine-triggers/public/:publicId/fire` | `routines.ts` | 创建public/fire | — | — | 拨测 | 有 |
| `GET /api/routines/:id` | `routines.ts` | 读取例行 | pages/ExecutionWorkspaceDetail.tsx, pages/IssueDetail.tsx, pages/Pipelines.tsx, pages/RoutineDetail.production.tsx, +15 | — | 界面可达 | 有 |
| `PATCH /api/routines/:id` | `routines.ts` | 更新例行 | pages/ExecutionWorkspaceDetail.tsx, pages/IssueDetail.tsx, pages/Pipelines.tsx, pages/RoutineDetail.production.tsx, +15 | — | 界面可达 | 有 |
| `GET /api/routines/:id/description/annotations` | `routines.ts` | 读取例行 (description/annotations) | hooks/useDocumentAnnotationMutations.ts, components/DocumentAnnotationPanel.tsx, components/DocumentAnnotationPopover.tsx, components/IssueDocumentAnnotations.tsx, +1 | — | 界面可达 | 有 |
| `POST /api/routines/:id/description/annotations` | `routines.ts` | 创建例行 (description/annotations) | hooks/useDocumentAnnotationMutations.ts, components/DocumentAnnotationPanel.tsx, components/DocumentAnnotationPopover.tsx, components/IssueDocumentAnnotations.tsx, +1 | — | 界面可达 | 有 |
| `GET /api/routines/:id/description/annotations/:threadId` | `routines.ts` | 读取例行 (description/annotations) | — | — | 拨测 | 有 |
| `PATCH /api/routines/:id/description/annotations/:threadId` | `routines.ts` | 更新例行 (description/annotations) | — | — | 拨测 | 有 |
| `POST /api/routines/:id/description/annotations/:threadId/comments` | `routines.ts` | 创建评论 (description/annotations) | — | — | 拨测 | 有 |
| `GET /api/routines/:id/revisions` | `routines.ts` | 读取例行 (revisions) | pages/CompanyImport.tsx, pages/ExecutionWorkspaceDetail.tsx, pages/RoutineDetail.production.tsx, pages/RoutineDetail.tsx, +11 | — | 界面可达 | 有 |
| `POST /api/routines/:id/revisions/:revisionId/restore` | `routines.ts` | 创建例行 (revisions/restore) | pages/CompanyImport.tsx, pages/ExecutionWorkspaceDetail.tsx, pages/RoutineDetail.production.tsx, pages/RoutineDetail.tsx, +11 | — | 界面可达 | 有 |
| `POST /api/routines/:id/run` | `routines.ts` | 创建运行 | pages/CompanyImport.tsx, pages/ExecutionWorkspaceDetail.tsx, pages/RoutineDetail.production.tsx, pages/RoutineDetail.tsx, +11 | — | 界面可达 | 有 |
| `GET /api/routines/:id/runs` | `routines.ts` | 读取运行 | pages/CompanyImport.tsx, pages/ExecutionWorkspaceDetail.tsx, pages/RoutineDetail.production.tsx, pages/RoutineDetail.tsx, +11 | — | 界面可达 | 有 |
| `POST /api/routines/:id/triggers` | `routines.ts` | 创建例行 (triggers) | components/routine-triggers/TriggerWizard.tsx, pages/CompanyImport.tsx, pages/ExecutionWorkspaceDetail.tsx, pages/RoutineDetail.production.tsx, +12 | — | 界面可达 | 有 |
| `GET /api/search` | `search.ts` | 读取搜索 | lib/search-query-parser.ts, components/Sidebar.production.tsx, components/Sidebar.tsx | expo/src/coolie.ts | 界面可达 | 无 |
| `DELETE /api/secret-provider-configs/:id` | `secrets.ts` | 删除secret-provider-configs | pages/CompanyEnvironments.tsx, pages/PipelineSettings.tsx, pages/RoutineDetail.production.tsx, pages/RoutineDetail.tsx, +18 | — | 界面可达 | 无 |
| `GET /api/secret-provider-configs/:id` | `secrets.ts` | 读取secret-provider-configs | pages/CompanyEnvironments.tsx, pages/PipelineSettings.tsx, pages/RoutineDetail.production.tsx, pages/RoutineDetail.tsx, +18 | — | 界面可达 | 无 |
| `PATCH /api/secret-provider-configs/:id` | `secrets.ts` | 更新secret-provider-configs | pages/CompanyEnvironments.tsx, pages/PipelineSettings.tsx, pages/RoutineDetail.production.tsx, pages/RoutineDetail.tsx, +18 | — | 界面可达 | 无 |
| `POST /api/secret-provider-configs/:id/default` | `secrets.ts` | 创建secret-provider-configs/default | pages/CompanyEnvironments.tsx, pages/PipelineSettings.tsx, pages/RoutineDetail.production.tsx, pages/RoutineDetail.tsx, +18 | — | 界面可达 | 无 |
| `POST /api/secret-provider-configs/:id/health` | `secrets.ts` | 创建健康检查 (secret-provider-configs) | pages/CompanyEnvironments.tsx, pages/PipelineSettings.tsx, pages/RoutineDetail.production.tsx, pages/RoutineDetail.tsx, +18 | — | 界面可达 | 无 |
| `DELETE /api/secrets/:id` | `secrets.ts` | 删除密钥 | pages/CompanyEnvironments.tsx, pages/PipelineSettings.tsx, pages/RoutineDetail.production.tsx, pages/RoutineDetail.tsx, +18 | — | 界面可达 | 无 |
| `PATCH /api/secrets/:id` | `secrets.ts` | 更新密钥 | pages/CompanyEnvironments.tsx, pages/PipelineSettings.tsx, pages/RoutineDetail.production.tsx, pages/RoutineDetail.tsx, +18 | — | 界面可达 | 无 |
| `GET /api/secrets/:id/access-events` | `secrets.ts` | 读取密钥 (access-events) | pages/CompanyEnvironments.tsx, pages/PipelineSettings.tsx, pages/RoutineDetail.production.tsx, pages/RoutineDetail.tsx, +18 | — | 界面可达 | 无 |
| `POST /api/secrets/:id/rotate` | `secrets.ts` | 创建密钥 (rotate) | pages/CompanyEnvironments.tsx, pages/PipelineSettings.tsx, pages/RoutineDetail.production.tsx, pages/RoutineDetail.tsx, +18 | — | 界面可达 | 无 |
| `GET /api/secrets/:id/usage` | `secrets.ts` | 读取用量 | pages/CompanyEnvironments.tsx, pages/PipelineSettings.tsx, pages/RoutineDetail.production.tsx, pages/RoutineDetail.tsx, +18 | — | 界面可达 | 无 |
| `GET /api/sidebar-preferences/me` | `sidebar-preferences.ts` | 读取侧栏偏好 (me) | pages/CompanyImport.tsx, hooks/useCompanyOrder.ts, hooks/useProjectOrder.ts | — | 界面可达 | 有 |
| `PUT /api/sidebar-preferences/me` | `sidebar-preferences.ts` | 更新侧栏偏好 (me) | pages/CompanyImport.tsx, hooks/useCompanyOrder.ts, hooks/useProjectOrder.ts | — | 界面可达 | 有 |
| `GET /api/skills/:skillName` | `access.ts` | 读取技能 | pages/agent-skills/AgentSkillsTab.tsx, lib/company-skill-routes.ts, components/MarkdownBody.tsx | — | 界面可达 | 无 |
| `GET /api/skills/available` | `access.ts` | 读取技能 (available) | plugins/bridge-init.ts, pages/AgentChat.tsx, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, +80 | — | 界面可达 | 无 |
| `GET /api/skills/catalog` | `company-skills.ts` | 读取技能 (catalog) | — | — | 拨测 | 有 |
| `GET /api/skills/catalog/:catalogId` | `company-skills.ts` | 读取技能 (catalog) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, +8 | — | 界面可达 | 无 |
| `GET /api/skills/catalog/:catalogId/files` | `company-skills.ts` | 读取文件 (catalog) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/CompanySkills.production.tsx, pages/CompanySkills.tsx, +8 | — | 界面可达 | 无 |
| `GET /api/skills/index` | `access.ts` | 读取技能 (index) | — | — | 拨测 | 有 |
| `GET /api/slack/search/callback` | `slack-tools.ts` | 读取搜索 (slack/callback) | — | — | 后台任务 | 无 |
| `DELETE /api/status-cards/:id` | `status-cards.ts` | 删除状态卡 | pages/StatusCards/ArchivedStatusCardRow.tsx, pages/StatusCards/CreateStatusCardDialog.tsx, pages/StatusCards/StatusCardDetailDrawer.tsx, pages/StatusCards/index.tsx | — | 界面可达 | 有 |
| `GET /api/status-cards/:id` | `status-cards.ts` | 读取状态卡 | pages/StatusCards/ArchivedStatusCardRow.tsx, pages/StatusCards/CreateStatusCardDialog.tsx, pages/StatusCards/StatusCardDetailDrawer.tsx, pages/StatusCards/index.tsx | — | 界面可达 | 有 |
| `PATCH /api/status-cards/:id` | `status-cards.ts` | 更新状态卡 | pages/StatusCards/ArchivedStatusCardRow.tsx, pages/StatusCards/CreateStatusCardDialog.tsx, pages/StatusCards/StatusCardDetailDrawer.tsx, pages/StatusCards/index.tsx | — | 界面可达 | 有 |
| `GET /api/status-cards/:id/dry-run` | `status-cards.ts` | 读取状态卡 (dry-run) | pages/StatusCards/ArchivedStatusCardRow.tsx, pages/StatusCards/CreateStatusCardDialog.tsx, pages/StatusCards/StatusCardDetailDrawer.tsx, pages/StatusCards/index.tsx | — | 界面可达 | 有 |
| `PUT /api/status-cards/:id/query` | `status-cards.ts` | 更新状态卡 (query) | — | — | 拨测 | 有 |
| `POST /api/status-cards/:id/recompile` | `status-cards.ts` | 创建状态卡 (recompile) | pages/StatusCards/ArchivedStatusCardRow.tsx, pages/StatusCards/CreateStatusCardDialog.tsx, pages/StatusCards/StatusCardDetailDrawer.tsx, pages/StatusCards/index.tsx | — | 界面可达 | 有 |
| `POST /api/status-cards/:id/refresh` | `status-cards.ts` | 创建状态卡 · 刷新 | pages/StatusCards/ArchivedStatusCardRow.tsx, pages/StatusCards/CreateStatusCardDialog.tsx, pages/StatusCards/StatusCardDetailDrawer.tsx, pages/StatusCards/index.tsx | — | 界面可达 | 有 |
| `PUT /api/status-cards/:id/summary` | `status-cards.ts` | 更新状态卡 (summary) | — | — | 拨测 | 有 |
| `GET /api/status-cards/:id/summary-revisions` | `status-cards.ts` | 读取状态卡 (summary-revisions) | pages/StatusCards/ArchivedStatusCardRow.tsx, pages/StatusCards/CreateStatusCardDialog.tsx, pages/StatusCards/StatusCardDetailDrawer.tsx, pages/StatusCards/index.tsx | — | 界面可达 | 有 |
| `GET /api/status-cards/:id/updates` | `status-cards.ts` | 读取状态卡 (updates) | pages/StatusCards/ArchivedStatusCardRow.tsx, pages/StatusCards/CreateStatusCardDialog.tsx, pages/StatusCards/StatusCardDetailDrawer.tsx, pages/StatusCards/index.tsx | — | 界面可达 | 有 |
| `GET /api/teams/catalog` | `teams-catalog.ts` | 读取团队 (catalog) | — | — | 拨测 | 有 |
| `GET /api/teams/catalog/:catalogId` | `teams-catalog.ts` | 读取团队 (catalog) | pages/TeamCatalog.tsx | — | 界面可达 | 无 |
| `GET /api/teams/catalog/:catalogId/files` | `teams-catalog.ts` | 读取文件 (catalog) | pages/TeamCatalog.tsx | — | 界面可达 | 无 |
| `DELETE /api/tool-applications/:applicationId` | `tool-access.ts` | 删除tool-applications | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `PATCH /api/tool-applications/:applicationId` | `tool-access.ts` | 更新tool-applications | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `DELETE /api/tool-connections/:connectionId` | `tool-access.ts` | 删除tool-connections | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `GET /api/tool-connections/:connectionId` | `tool-access.ts` | 读取tool-connections | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `PATCH /api/tool-connections/:connectionId` | `tool-access.ts` | 更新tool-connections | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `GET /api/tool-connections/:connectionId/activity` | `tool-access.ts` | 读取动态 (tool-connections) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `GET /api/tool-connections/:connectionId/catalog` | `tool-access.ts` | 读取tool-connections/catalog | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `POST /api/tool-connections/:connectionId/catalog/refresh` | `tool-access.ts` | 创建catalog/refresh · 刷新 | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `GET /api/tool-connections/:connectionId/grants` | `tool-access.ts` | 读取tool-connections/grants | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `DELETE /api/tool-connections/:connectionId/grants/:grantId` | `tool-access.ts` | 删除tool-connections/grants | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `POST /api/tool-connections/:connectionId/grants/:grantId/delegations` | `tool-access.ts` | 创建grants/delegations | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `DELETE /api/tool-connections/:connectionId/grants/:grantId/delegations/:delegationId` | `tool-access.ts` | 删除grants/delegations | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `PUT /api/tool-connections/:connectionId/grants/:grantId/members` | `tool-access.ts` | 更新成员 (tool-connections/grants) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 无 |
| `POST /api/tool-connections/:connectionId/grants/installations` | `tool-access.ts` | 创建grants/installations | — | — | 拨测 | 有 |
| `POST /api/tool-connections/:connectionId/health-check` | `tool-access.ts` | 创建tool-connections/health-check | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `GET /api/tool-connections/:connectionId/installs` | `tool-access.ts` | 读取tool-connections/installs | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `PUT /api/tool-connections/:connectionId/installs` | `tool-access.ts` | 更新tool-connections/installs | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `POST /api/tool-connections/:connectionId/railway/ssh` | `tool-access.ts` | 创建railway/ssh | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 无 |
| `POST /api/tool-connections/:connectionId/reconnect` | `tool-access.ts` | 创建tool-connections/reconnect | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `GET /api/tool-connections/:connectionId/test-agents` | `tool-access.ts` | 读取tool-connections/test-agents | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `GET /api/tool-connections/:connectionId/test-agents/:agentId/access` | `tool-access.ts` | 读取访问 (tool-connections/test-agents) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `POST /api/tool-connections/:connectionId/test-calls` | `tool-access.ts` | 创建tool-connections/test-calls | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `GET /api/tool-connections/:connectionId/test-calls/:actionRequestId` | `tool-access.ts` | 读取tool-connections/test-calls | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `GET /api/tool-connections/:connectionId/usage` | `tool-access.ts` | 读取用量 (tool-connections) | — | — | 拨测 | 有 |
| `DELETE /api/tool-profile-entries/:entryId` | `tool-access.ts` | 删除tool-profile-entries | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `PATCH /api/tool-profile-entries/:entryId` | `tool-access.ts` | 更新tool-profile-entries | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `DELETE /api/tool-profiles/:profileId` | `tool-access.ts` | 删除tool-profiles | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `PATCH /api/tool-profiles/:profileId` | `tool-access.ts` | 更新tool-profiles | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `POST /api/tool-profiles/:profileId/duplicate` | `tool-access.ts` | 创建tool-profiles/duplicate | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `POST /api/tool-profiles/:profileId/entries` | `tool-access.ts` | 创建tool-profiles/entries | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `GET /api/tool-profiles/:profileId/new-tools` | `tool-access.ts` | 读取tool-profiles/new-tools | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `POST /api/tool-profiles/:profileId/new-tools/review` | `tool-access.ts` | 创建new-tools/review | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `POST /api/tools/oauth/:connectionId/start` | `tool-access.ts` | 创建oauth/start | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `GET /api/tools/oauth/callback` | `tool-access.ts` | 读取oauth/callback | pages/apps/generic-mcp-connect.ts | — | 界面可达 | 有 |
| `GET /api/tools/oauth/cloud-connector/callback` | `tool-access.ts` | 读取cloud-connector/callback | — | — | 拨测 | 有 |
| `GET /api/tools/oauth/cloud-connector/enrollment` | `tool-access.ts` | 读取cloud-connector/enrollment | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 无 |
| `POST /api/tools/oauth/cloud-connector/enrollment` | `tool-access.ts` | 创建cloud-connector/enrollment | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 无 |
| `GET /api/tools/oauth/cloud-connector/enrollment-callback` | `tool-access.ts` | 读取cloud-connector/enrollment-callback | — | — | 后台任务 | 无 |
| `GET /api/tools/oauth/paperclip-id/callback` | `tool-access.ts` | 读取paperclip-id/callback | — | — | 未接线 | 无 |
| `GET /api/tools/vercel-connect/callback` | `tool-access.ts` | 读取vercel-connect/callback | — | — | 后台任务 | 无 |
| `DELETE /api/work-products/:id` | `issues.ts` | 删除交付产物 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 有 |
| `PATCH /api/work-products/:id` | `issues.ts` | 更新交付产物 | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/BoardChat.tsx, +56 | — | 界面可达 | 有 |
| `GET /api/workspace-operations/:operationId/log` | `agents.ts` | 读取workspace-operations/log | plugins/bridge-init.ts, pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/Agents.production.tsx, +41 | — | 界面可达 | 无 |
| `POST /companies/:companyId/onboarding-seed` | `onboarding-seed.ts` | 创建公司 (onboarding-seed) | — | — | 未接线 | 无 |
| `GET /companies/:companyId/tools/gateways` | `tool-gateway.ts` | 读取公司 (tools/gateways) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 无 |
| `POST /companies/:companyId/tools/gateways` | `tool-gateway.ts` | 创建公司 (tools/gateways) | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 无 |
| `POST /connection-intents/:interactionId/complete` | `connection-intents.ts` | 创建连接意向 (complete) | features/connections/ConnectionIntentInteractionBody.tsx | — | 界面可达 | 无 |
| `POST /connection-intents/:interactionId/decline` | `connection-intents.ts` | 创建连接意向 (decline) | features/connections/ConnectionIntentInteractionBody.tsx | — | 界面可达 | 无 |
| `POST /connection-intents/:interactionId/phase` | `connection-intents.ts` | 创建连接意向 (phase) | features/connections/ConnectionIntentInteractionBody.tsx | — | 界面可达 | 无 |
| `GET /connection-intents/:interactionId/setup-options` | `connection-intents.ts` | 读取连接意向 (setup-options) | features/connections/ConnectionIntentInteractionBody.tsx | — | 界面可达 | 无 |
| `GET /mcp/gateways/:gatewayPublicId` | `tool-gateway.ts` | 读取mcp/gateways | — | — | 内部RPC | 有 |
| `POST /mcp/gateways/:gatewayPublicId` | `tool-gateway.ts` | 创建mcp/gateways | — | — | 内部RPC | 有 |
| `GET /mcp/runtime-tools` | `connection-intents.ts` | 读取mcp/runtime-tools | — | — | 内部RPC | 无 |
| `POST /mcp/runtime-tools` | `connection-intents.ts` | 创建mcp/runtime-tools | — | — | 内部RPC | 无 |
| `POST /runtime-tools/connections/request` | `connection-intents.ts` | 创建connections/request | — | — | 未接线 | 无 |
| `POST /runtime-tools/connections/search` | `connection-intents.ts` | 创建搜索 (runtime-tools/connections) | — | — | 未接线 | 无 |
| `POST /runtime-tools/github/credentials` | `connection-intents.ts` | 创建凭证 (runtime-tools/github) | — | — | 拨测 | 有 |
| `POST /tool-gateway/action-requests/:id/approve` | `tool-gateway.ts` | 创建action-requests/approve · 通过 | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 无 |
| `POST /tool-gateway/action-requests/:id/decline` | `tool-gateway.ts` | 创建action-requests/decline | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 无 |
| `GET /tool-gateway/audit` | `tool-gateway.ts` | 读取tool-gateway/audit | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 有 |
| `POST /tool-gateway/gateway-tokens/:tokenId/revoke` | `tool-gateway.ts` | 创建gateway-tokens/revoke | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 无 |
| `PATCH /tool-gateway/gateways/:gatewayId` | `tool-gateway.ts` | 更新tool-gateway/gateways | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 无 |
| `GET /tool-gateway/gateways/:gatewayId/mcp` | `tool-gateway.ts` | 读取gateways/mcp | — | — | 内部RPC | 无 |
| `POST /tool-gateway/gateways/:gatewayId/mcp` | `tool-gateway.ts` | 创建gateways/mcp | — | — | 内部RPC | 无 |
| `POST /tool-gateway/gateways/:gatewayId/tokens` | `tool-gateway.ts` | 创建gateways/tokens | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 无 |
| `GET /tool-gateway/runtime-slots` | `tool-gateway.ts` | 读取tool-gateway/runtime-slots | pages/AgentDetail.production.tsx, pages/AgentDetail.tsx, pages/AgentToolsTab.tsx, pages/tools/AuditTab.tsx, +34 | — | 界面可达 | 无 |
| `POST /tool-gateway/runtime-slots/:slotId/restart` | `tool-gateway.ts` | 创建runtime-slots/restart | — | — | 内部RPC | 无 |
| `POST /tool-gateway/runtime-slots/:slotId/stop` | `tool-gateway.ts` | 创建runtime-slots/stop | — | — | 内部RPC | 无 |
| `POST /tool-gateway/sessions` | `tool-gateway.ts` | 创建会话 (tool-gateway/sessions) | — | — | 内部RPC | 有 |
| `POST /tool-gateway/sessions/:sessionId/revoke` | `tool-gateway.ts` | 创建会话 (sessions/revoke) | — | — | 内部RPC | 无 |
| `GET /tool-gateway/tools` | `tool-gateway.ts` | 读取tool-gateway/tools | — | — | 内部RPC | 有 |
| `POST /tool-gateway/tools/call` | `tool-gateway.ts` | 创建tools/call | — | — | 内部RPC | 有 |

*生成于 2026-09-28T18:09:35.560Z · 脚本 scripts/audit/build-api-page-map.mjs · 只读*
