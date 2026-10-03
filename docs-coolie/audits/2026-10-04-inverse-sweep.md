# Inverse sweep 审计 — server 注册但零客户端调用的路由 (2026-10-04)

**方向**: 前几轮审计都是 client→server (客户端调的都活着)。本轮反向: server 注册的 933 条路由里,
哪些**没有任何客户端调用** — 即「建成但不可达」的产品面 (InboxScreen 型孤儿的服务端镜像)。
复跑方式: `python3 docs-coolie/audits/inverse-sweep.py` (纯静态, 无需起服务)。

**客户端面 (6)**: api-client SDK / ui (web, 含 ui/src/api/* 相对路径层) / h5 / expo / cli / expo-paperclip-web。

## 总账

- server 注册路由: **933** (routes/*.ts 字面量 + 常量注册 + app.ts 嵌套挂载前缀)
- 客户端字面量: **750** (归一化 739)
- 粗孤儿: **87** → 逐族定性 (含同日复核修正): **13 假阳性 + ~74 machine-facing 合法 (含 agent-invoked/
  cloud-control 改判 3 族) + 真未接线 2 小族 + 6 单条, 全 P3**
- **结论: 无「假按钮」级缺陷; 真未接线全是 P3 级「建了没人调」的能力面**, 无需当場修, 留属主/产品裁决 (retire or wire)。

## 真未接线 (P3, 建议属主确认 retire or wire)

**复核修正 (同日第二轮)**: 首轮判为真孤儿的 3 族经服务端内部调用链核查后改判 machine-facing —
- status-cards `query`/`summary`: **agent-invoked** — server 把 `PUT /api/status-cards/:id/query|summary`
  注入 Summarizer 指令 (services/status-cards.ts:91,129-130);
- instance `task-drain`/`lifecycle` ×5: **cloud-control 平面专用** (middleware/cloud-control.ts:11-19);
- cases `breakdown`: **agent-invoked** — pipeline stage 指令注入 `POST /api/cases/:id/breakdown`
  (services/pipelines.ts:2340); `context-pack`: 服务端 buildPipelineCaseContextPack 构建后随 run
  投递, GET 端点为按需取用 — agent-runtime 面。
- **审计方法补盲区 ⑧: agent-invoked 路由只出现在 server 指令注入字符串里, 六个客户端面都扫不到;
  反向 sweep 的「真孤儿」必须再过一遍 server 侧指令/中间件字符串才能定谳。**

修正后真未接线 (2 小族 + 单条, 全 P3):

| 族 | 路由 | 说明 |
|---|---|---|
| decision-training | GET/PATCH/DELETE `/api/decision-training/:id` 三连 | ui 无 decisionTraining wrapper、无 detail 页; 列表面在役 |
| plugins jobs | `/api/plugins/:id/jobs`、`/jobs/:jobId/runs`、`/jobs/:jobId/trigger` | 插件任务调度面 UI 未接 (PluginPage 装/卸/启停/健康/logs 都在役) |

单条杂项 (P3): `/api/cases/:id/links`、`/:id/attachments` (数据经 case GET payload 内嵌, 专用端点冗余)、`/api/companies/issues` (跨司列表)、`/api/environments/:id/leases`、`/api/tool-connections/:id/usage`。`/api/companies/templates` 服务建司模板 (onboarding 面)。

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
