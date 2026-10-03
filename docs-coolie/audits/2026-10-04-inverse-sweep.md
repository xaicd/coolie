# Inverse sweep 审计 — server 注册但零客户端调用的路由 (2026-10-04)

**方向**: 前几轮审计都是 client→server (客户端调的都活着)。本轮反向: server 注册的 933 条路由里,
哪些**没有任何客户端调用** — 即「建成但不可达」的产品面 (InboxScreen 型孤儿的服务端镜像)。
复跑方式: `python3 docs-coolie/audits/inverse-sweep.py` (纯静态, 无需起服务)。

**客户端面 (6)**: api-client SDK / ui (web, 含 ui/src/api/* 相对路径层) / h5 / expo / cli / expo-paperclip-web。

## 总账

- server 注册路由: **933** (routes/*.ts 字面量 + 常量注册 + app.ts 嵌套挂载前缀)
- 客户端字面量: **750** (归一化 739)
- 粗孤儿: **87** → 逐族定性后: **13 假阳性 + ~44 machine-facing 合法 + ~15 真未接线 (5 族) + 尾量杂项**
- **结论: 无「假按钮」级缺陷; 真未接线全是 P3 级「建了没人调」的能力面**, 无需当場修, 留属主/产品裁决 (retire or wire)。

## 真未接线 (P3, 建议属主确认 retire or wire)

| 族 | 路由 | 说明 |
|---|---|---|
| status-cards | GET/POST `/api/status-cards/:id/query`、GET `/:id/summary` | ui wrapper (statusCards.ts) 覆盖 CRUD/updates/summary-revisions/refresh/recompile/dry-run, 唯 query+summary 落单 |
| instance ops | `/api/instance/task-drain` ×3、`/api/instance/lifecycle` ×2、`/lifecycle/unarchive-primary` | **全仓零调用者** (cli/ui/scripts 均无) — 疑 ops 预留 |
| decision-training | GET/PATCH/DELETE `/api/decision-training/:id` 三连 | ui 无 decisionTraining wrapper、无 detail 页; 列表面在役 |
| cases | `/api/cases/:id/breakdown`、`/api/cases/:caseId/context-pack` | pipeline-liveness.ts 状态机认识 `breakdown_pending` 词汇但无客户端调用 — 疑 server/automation 内部或 agent-MCP 触发, 需属主确认 |
| plugins jobs | `/api/plugins/:id/jobs`、`/jobs/:jobId/runs`、`/jobs/:jobId/trigger` | 插件任务调度面 UI 未接 (PluginPage 装/卸/启停/健康/logs 都在役) |

杂项观察 (单条, 不成族): `/api/cases/:id/links`、`/:id/attachments` (数据经 case GET payload 内嵌到达, 专用端点冗余)、`/api/companies/templates`、`/api/companies/issues` (跨司)、`/api/environments/:id/leases`、`/api/tool-connections/:id/usage`。

## Machine-facing 合法孤儿 (样例, 勿立券)

MCP 协议 (tool-gateway 8 条含 `gateways/:id/mcp`、`tools/call`)、**connection runtime-tools 5 条
(`/api/runtime-tools/connections/search|request` 即 connections_search/connection_request 工具的本体,
本审计运行时自身就是其活消费者)**、agent 自助 secrets (`/api/agents/me/secrets*` ×5)、OAuth 回调落地 ×4、
chat-webhooks (slack/agentmail/公网 provider) ×3、OTA manifest ×2 (native 运行时拉取不落源码字面量)、
plugin iframe bridge + plugin-ui-static、dev-server/restart (dev-runner 重启请求机制, COOA-21 缺口3 已知)、
chat-endpoints github/* ×11 (GitHub App 外部 setup 流)。

## 假阳性三族 (本轮新增, 接 run 209ce59d 四盲区之后编号 ⑤⑥⑦)

- **⑤ 相对路径 api 层**: web UI 的 `ui/src/api/*.ts` 走 `BASE="/api"` 包装 (`client.ts:4`), 源码字面量
  不带 `/api` 前缀 — 不收这一层会**虚报 179 条假孤儿** (657→846 的差主要在这)。同构风险: 任何
  「client.ts 内置 base + 相对路径」的客户端。
- **⑥ 嵌套反引号模板**: `` `/api/teams/catalog${query ? `?${query}` : ""}` `` — 简单 `${...}` 折叠与
  反引号终止的正则都会截断 (cli teams.ts:266 / skills.ts:590 / ui plugins.ts:217 实证)。
- **⑦ path-builder 拼接**: `agentPath(id, companyId, "/pause")`、`request("current")` + fetch 模板
  (ui/src/api/agents.ts:101, announcements.ts:5) — 尾段是独立字面量参数, 逐调用点才可见。
  agents 全生命周期 (pause/resume/approve/terminate/heartbeat-invoke/claude-login/clear-error) 因此
  曾被误报为孤儿 — **web 侧 agent 控制面实际全在役**。

## 已核实为健康的亮点

- expo InboxScreen 服务端链 (`/api/inbox`) h5+api-client+ui 三面都在役 (撑 82f8751a 的「该复挂载」判断)。
- announcements current/dismiss 经 useAnnouncement 活跃调用。
- decisions 全族 (list/triage/retention) web 在役 — DecisionQueuePage 无缺角。
