# Playwright 100% 操控覆盖分阶段方案 (wave130)

> 配套文档: `docs-coolie/audit/API-PAGE-MAP.md` (逐端点全量映射, 程序生成)。
> 本轮**只分析 + 推算, 不写 spec、不改产品代码**; 数字全部来自映射表的真实统计。
> 基线: 当天 main (`server/src/routes/*.ts` 82 文件 + `server/src/app.ts` 挂载表)。

---

## 0. 结论摘要 (先数)

| 维度 | 数值 | 口径 |
| --- | ---: | --- |
| 解析出的端点 (method+path) | **886** | 脚本解析; brief 基线 894 |
| 界面可达 (Web 或 App 至少一处) | **647 (73.0%)** | 有页面/组件/屏幕消费者 |
| ├ Web 有页面/组件消费者 | **628** | `ui/src` 反查 + import 反向图 |
| └ App 屏幕消费者 | 42 | expo/h5/api-client |
| **无界面支撑 (产品缺口)** | **239 (27.0%)** | 见 §1.2 全清单 |
| 有测试反查命中的端点 | 470 (53.0%) | 代码级反查, 非"已跑通" |
| └ Web 可达中: 有测试 / 无测试 | 339 / 289 | — |
| Web 页面文件 | 79 pages + 283 components | 基线 |
| App 屏幕文件 | 23 | 基线 |

**一句话结论:**

- 全系统 **886** 个端点, **647** 个有界面路径 (73%); 剩下 **239** 个没有 UI —— 但其中大多数**本就不该有 UI** (MCP 网关、工具运行槽、OAuth 回调、heartbeat/调度、smoke-lab), 只有 **76 个 `未接线`** 是真·产品缺口候选。
- Playwright 的**可操控上限 = Web 可达的 628 个端点**, 不是 886。要把"100% 操控覆盖"做实, 分母必须写清是 **628** (Web) / **647** (Web+App), 而不是全端点。
- 推算: **45 个 spec / ~374 用例 / ~10,300 行 / ~31.3 人日** (含 5 人日共用基建)。按 **4–6 名数字员工**并行, **7–10 个工作日**可落地。

---

## 1. 界面可达真数 & 无界面支撑清单

### 1.1 界面可达真数

- **647 / 886 = 73.0%** 有界面路径。
- 其中 Web 驱动 **628** 个 (Playwright 的真实分母)。
- App 端 **42** 个端点有屏幕消费者; 仅 App 不 Web 的 **19** 个 (=647−628)。

### 1.2 无界面支撑的端点 (239 个, 按类别)

> 这是"**产品缺口 / 非 UI 面**, 不是测试缺口"。完整机器清单见附录 §6。
> 判定规则见 `API-PAGE-MAP.md` 头部; 这是启发式分类。

| 类别 | 数量 | 含义 | 是否真·产品缺口 |
| --- | ---: | --- | --- |
| `未接线` | **76** | 全仓仅出现在定义处, 无任何消费者 | **是** (需要 UI 或明确废弃) |
| `拨测` | 105 | 只有测试/smoke 引用, 无界面 | 部分是 (agent 面向/管理端) |
| `内部RPC` | 50 | MCP 网关 / tool-gateway / smoke-lab / plugin bridge | 否 (协议面, 非点击面) |
| `后台任务` | 6 | runner / heartbeat / scheduler / OAuth 回调 | 否 (进程/时间触发) |
| `上游同步` | 2 | skills sync / company export | 否 (服务间) |
| **合计** | **239** | | |

**产品总监视角的重点** (从 `未接线` 76 个里挑出的、看起来"应该有入口却没有"的):

| 端点 | 文件 | 为什么值得关注 |
| --- | --- | --- |
| `GET /api/companies/*/costs/by-*` (5 个) | `costs.ts` | 成本多维细分 (by-agent/biller/project/provider) 无界面入口 |
| `GET /api/companies/*/release-gate/ds-approval` | `companies.ts` | 发版核验 DS 审批, 无页面消费 |
| `GET /api/companies/*/workspace-overview` | `companies.ts` | 工作区总览, 无入口 |
| `GET /api/companies/*/secrets/catalog` | `secrets.ts` | 密钥目录只读, 无界面 |
| `PUT /api/companies/*/skill-policy` (+GET/DELETE) | `company-skill-policy.ts` | 技能策略无管理面 (taste: "域列表管理 得有的") |
| `GET /api/companies/*/org.png` | `companies.ts` | 组织图 PNG 导出, 无按钮 |
| `PUT /api/projects/*/repositories` | `projects.ts` | 项目仓库绑定, 无界面 |
| `GET /api/ota/manifest(.json)` | `ota-manifest.ts` | OTA 清单 (客户端消费, 非 board) |

> 完整 239 条见 **附录 §6**。

---

## 2. Spec 清单 (按页面/域) + 估算

估算模型 (可复核, 可调):

- **1 spec** = 1 个 Playwright 文件, 覆盖一个页面/域的一条主流程簇。
- 用例构成: 正常流 / 异常流 (错误码/空态/校验) / 权限拒绝 (非成员 403、越权 404) / 边界 (长文本、分页、并发)。
- 行数 ≈ 用例数 × 28 行 (setup + 交互 + 双保险断言 + teardown)。
- 人日 (含规格复盘/调试): P0 = 1.0, P1 = 0.5, P2 = 0.6, P3 = 0.25 人日/spec。

### 2.1 P0 核心链路 (登录/项目/任务/审批/产物/发版核验) — 11 specs

| # | spec | 覆盖页面 (ui/src/pages) | 用例 (正/异/权/边) | 行 | 人日 |
| --- | --- | --- | --- | ---: | ---: |
| 1 | `auth-login` | Auth, CliAuth | 4/3/2/1 | 280 | 1.0 |
| 2 | `company-gate-bootstrap` | Companies, BoardClaim, InviteLanding, JoinRequestQueue, CompanyAccess | 4/3/2/1 | 280 | 1.0 |
| 3 | `projects-crud` | Projects, ProjectDetail | 4/3/2/1 | 280 | 1.0 |
| 4 | `project-workspace` | ProjectWorkspaceDetail, Workspaces | 3/3/2/2 | 280 | 1.0 |
| 5 | `tasks-list` | Issues, MyIssues, WhatNeedsMe | 4/3/2/2 | 308 | 1.0 |
| 6 | `task-detail-chat` | IssueDetail, AgentChat, BoardChat | 5/3/2/2 | 336 | 1.0 |
| 7 | `approvals` | Approvals, ApprovalDetail | 4/3/3/1 | 308 | 1.0 |
| 8 | `inbox` | Inbox, LegacyInbox | 3/3/2/2 | 280 | 1.0 |
| 9 | `artifacts` | Artifacts | 3/2/2/1 | 224 | 1.0 |
| 10 | `release-verify` | CompanyExport, CompanyImport, InstanceGeneralSettings | 4/3/2/2 | 308 | 1.0 |
| 11 | `agents-core` | Agents, NewAgent, AdapterManager | 4/3/2/2 | 308 | 1.0 |
| | **小计** | | **~132** | **~3,190** | **11.0** |

### 2.2 P1 域 CRUD — 16 specs

| # | spec | 覆盖页面 | 用例 | 行 | 人日 |
| --- | --- | --- | ---: | ---: | ---: |
| 12 | `agent-detail` | AgentDetail, AgentToolsTab, agent-skills/AgentSkillsTab | 4/2/1/1 | 224 | 0.5 |
| 13 | `routines` | Routines, RoutineDetail | 3/2/1/1 | 196 | 0.5 |
| 14 | `pipelines` | Pipelines, PipelineSettings | 3/2/1/1 | 196 | 0.5 |
| 15 | `goals` | Goals, GoalDetail | 3/2/1/1 | 196 | 0.5 |
| 16 | `skills` | CompanySkills, SkillStudio | 3/2/1/1 | 196 | 0.5 |
| 17 | `cases` | Cases, CaseDetail | 3/2/1/1 | 196 | 0.5 |
| 18 | `apps-connect` | apps/Browse, apps/chat/* | 3/2/2/1 | 224 | 0.5 |
| 19 | `secrets` | Secrets, secrets/* | 3/2/1/1 | 196 | 0.5 |
| 20 | `git-credentials` | Secrets(凭证段) | 3/2/1/1 | 196 | 0.5 |
| 21 | `teams` | TeamCatalog | 3/2/1/1 | 196 | 0.5 |
| 22 | `status-cards` | StatusCards/* | 3/2/1/1 | 196 | 0.5 |
| 23 | `decision-queue` | DecisionQueuePage | 3/2/1/1 | 196 | 0.5 |
| 24 | `environments` | CompanyEnvironments | 3/2/1/1 | 196 | 0.5 |
| 25 | `exec-workspaces` | ExecutionWorkspaceDetail | 3/2/1/1 | 196 | 0.5 |
| 26 | `profiles` | ProfileSettings, UserProfile | 3/2/1/1 | 196 | 0.5 |
| 27 | `company-settings` | CompanySettings, CompanySettingsPluginPage, CompanySettingsArchive | 4/2/1/1 | 224 | 0.5 |
| | **小计** | | **~128** | **~3,272** | **8.0** |

### 2.3 P2 高级 (CMMI/ontology/多源/低代码/插件) — 8 specs

| # | spec | 覆盖页面/插件面 | 用例 | 行 | 人日 |
| --- | --- | --- | ---: | ---: | ---: |
| 28 | `plugin-manager` | PluginManager | 3/2/1/1 | 196 | 0.6 |
| 29 | `plugin-pages` | PluginPage, PluginSettings, plugin-ui-static | 3/2/1/1 | 196 | 0.6 |
| 30 | `ontology` | plugin-ontology 域管理 (宿主 UI) | 3/2/1/1 | 196 | 0.6 |
| 31 | `ai-connections` | ai-connections / connect-model-preview | 3/2/1/1 | 196 | 0.6 |
| 32 | `tools-apps-preflight` | tools/* 安装预检 | 3/2/1/1 | 196 | 0.6 |
| 33 | `decision-training` | decision-training 页 | 3/2/1/1 | 196 | 0.6 |
| 34 | `multi-source-connections` | connection-intents / 自定义镜像会话 | 3/2/1/1 | 196 | 0.6 |
| 35 | `lowcode-bridge` | apps bridge / generic-mcp-connect | 3/2/1/1 | 196 | 0.6 |
| | **小计** | | **~64** | **~1,568** | **4.8** |

### 2.4 P3 只读报表 — 10 specs

| # | spec | 覆盖页面 | 用例 | 行 | 人日 |
| --- | --- | --- | ---: | ---: | ---: |
| 36 | `dashboard` | Dashboard, DashboardLive | 3/1/1/1 | 168 | 0.25 |
| 37 | `costs` | Costs | 3/1/1/1 | 168 | 0.25 |
| 38 | `timeline-activity` | Timeline | 3/1/1/1 | 168 | 0.25 |
| 39 | `search` | Search | 3/1/1/1 | 168 | 0.25 |
| 40 | `notifications` | 通知面 | 2/1/1/1 | 140 | 0.25 |
| 41 | `org-chart` | Org, OrgChart | 2/1/1/1 | 140 | 0.25 |
| 42 | `sidebar` | 侧栏角标/偏好 | 2/1/1/1 | 140 | 0.25 |
| 43 | `announcements` | WhatsNew, ReleaseNotes | 2/1/1/1 | 140 | 0.25 |
| 44 | `instance-read` | InstanceAccess, InstanceExperimentalSettings | 3/1/1/1 | 168 | 0.25 |
| 45 | `my-summary` | WhatNeedsMe / summary-slots | 2/1/1/1 | 140 | 0.25 |
| | **小计** | | **~50** | **~1,540** | **2.5** |

### 2.5 总计与并行工期

| 层级 | spec 数 | 用例 | 行数 | 人日 |
| --- | ---: | ---: | ---: | ---: |
| P0 核心链路 | 11 | ~132 | ~3,190 | 11.0 |
| P1 域 CRUD | 16 | ~128 | ~3,272 | 8.0 |
| P2 高级 | 8 | ~64 | ~1,568 | 4.8 |
| P3 只读 | 10 | ~50 | ~1,540 | 2.5 |
| 共用基建 (§4) | — | — | ~800 | 5.0 |
| **总计** | **45** | **~374** | **~10,370** | **~31.3** |

**并行工期** (含 ~30% 协调/CI/返工系数; 基建先落地再分波):

| 数字员工数 | 理论 (人日/并行) | ×1.3 协调 | 建议工期 |
| ---: | ---: | ---: | ---: |
| 4 | 7.8 | 10.2 | **~10 天** |
| 5 | 6.3 | 8.1 | **~8 天** |
| 6 | 5.2 | 6.8 | **~7 天** |

> 推荐 **5 人**: 1 人先做基建 (§4), 其余分 P0/P1 并行; P2/P3 收尾。6 人时边际收益递减 (共享实例串行约束, `tests/e2e/playwright.config.ts` 是 `workers:1`)。

---

## 3. 分层策略 (P0 → P3)

- **P0 核心链路 (必达, 先做):** 登录/公司门 → 项目 → 任务 → 审批 → 产物 → 发版核验。这是老板从软件交付公司负责人视角"一天要走通的路", 任何一条红的都是交付阻断。
- **P1 域 CRUD:** 每个域实例的列表 + 行内 CRUD (taste: "列表/详情要可直接就地编辑")。覆盖 create/rename/lifecycle/delete 全操作面。
- **P2 高级:** CMMI 治理面、ontology 域管理、多源连接、低代码 bridge、插件管理。复杂但访问频率低。
- **P3 只读报表:** dashboard/成本/时间线/搜索/通知/组织图。断言读得对即可, 交互少。

分层依据 = 页面引用端点数 (映射表 `pageGroups`) × 业务关键度。P0 页面 (Issues/Approvals/Artifacts/Projects) 的端点引用密度最高。

---

## 4. 基础设施 (一次性投入 ~5 人日)

1. **登录态复用** — 复用仓库既有形状:
   - 本地 CI 用 `tests/e2e/playwright.config.ts` 的**抛throwaway 实例** (`PAPERCLIP_DEPLOYMENT_MODE=local_trusted`, `PAPERCLIP_BIND=loopback`, 端口 3199, `onboard --yes --run`), 免登录、**不依赖外网**。
   - 需要真实会话时, 用 `storageState` (参考 `scripts/e2e/wave129/lib.mjs:openAuthed`: 登录一次存 `web-state.json`, 之后复用; 失效自动重登)。**凭据只进 gitignored 路径**, 绝不入库。
2. **数据工厂** — `tests/e2e/fixtures/` 下按实体提供 `seedX()` / `cleanupX()`: 每个 spec 自建自清 (taste: "真依赖测试自建隔离数据并清理, 否则 skip 而非 pass"), 断言前用 API 读回真实行数验证落地。
3. **UI 断言 + API 真值回读双保险** — 先点 UI, 再用 API (`ui/src/api/client.ts` 同 base) GET 同一资源, 断言值**真的变了** (taste: "单元测试看到宿主那条记录, 真实实例读出来是 0 条"; "写进去要读得出来")。禁止"点了没报错就算过"。
4. **失败自愈重跑** — Playwright `retries:1` + `trace:"on-first-retry"`; 外层包装在**新抛throwaway 实例**上重跑失败 spec 一次, 自动区分 flaky vs 真红; 真红写进 `docs-coolie/audit/` 的失败记录 (含 root cause + 原始 stdout)。
5. **CI 集成 (本地, 不联网)** — 沿用 `pnpm test:e2e` (`npx playwright test --config tests/e2e/playwright.config.ts`); 新增一条 audit 门 `node scripts/audit/build-api-page-map.mjs` 做映射表可重跑性检查。浏览器套件保持 opt-in。
6. **截图/视频证据归档** — **本地留存, 不入库** (仓库铁律: `screenshots/` 整目录 gitignore, taste: "测试截图只留本地不上传 git")。证据落到 gitignored 的 `docs-coolie/evidence/waveNNN/`; 需要交付时只提交文字清单 (端点 → PASS/FAIL + 绝对证据路径), 不提交图片/视频。

---

## 5. 100% 的定义 & 明确不可达部分

### 5.1 "100% 操控覆盖" = 什么

明确定义, 不打太极:

> **对全部"驱动路径存在"的界面可达端点 (Web 628 + App 19 = 647) 中, 每一个都有至少一个 spec 通过 UI 真实驱动过, 且改动被 API 读回验证; 其余 239 个端点登记在 §6 的 EXCLUDED 清单, 每条写明不可达理由。**

- 分母是 **647** (界面可达), **不是** 886。
- "操控" = Playwright/模拟器**真的点击驱动**, 不是读源码或 dump DOM (taste: "必须真正驱动, 读源码不算证据")。
- 达成判据: 跑一次全量, 输出 `647/647 有 spec 且 PASS`, 或逐条列出未验证项及原因; **不允许**把没跑的行列为通过 (taste: 门禁必须诚实报覆盖)。

### 5.2 明确不可达 / 不纳入 (诚实清单)

| # | 不可达部分 | 数量级 | 为什么不可达 | 处理 |
| --- | --- | ---: | --- | --- |
| 1 | 第三方 OAuth 回调 (`/api/tools/oauth/*/callback`) | ~4 | 需真实 IdP 授权页, 无外网 | 只断言"发起授权"一跳; 回调 mock |
| 2 | 邮件/Slack/webhook 入站 (`/chat-webhooks/*`, `/api/slack/search/callback`) | ~4 | 外部投递 | 本地伪造签名请求做单元/集成 |
| 3 | 真机推送 (APNs/FCM) | — | 需真机+证书 | 不纳入; App 端仅模拟器 |
| 4 | MCP / tool-gateway 协议面 (`/mcp/*`, `/tool-gateway/*`) | ~20 | JSON-RPC 协议, 非 UI | CLI/集成测试, 非 Playwright |
| 5 | smoke-lab (`/smoke-lab/*`) | ~17 | 本身就是测试夹具设施 | 被 spec 调用, 不作为被测对象 |
| 6 | agent-key 专属端点 (`/api/agents/me/*`) | ~10 | 需 agent 身份, 非 board | agent 集成测试 |
| 7 | 后台任务/调度 (`heartbeat`/`runner`/`scheduler`) | ~6 | 时间/进程触发, 非点击 | 断言其产物 (run log / 状态卡) |
| 8 | cloud 控制面 (`/api/cloud/*`) | — | 跨实例控制 | 不纳入 |
| 9 | `未接线` 76 个 | 76 | **无 UI, 是产品缺口** | 先补 UI 或明确废弃, 再进覆盖 |

> 说明: 上表 #1–#8 的端点大多落在 `内部RPC`/`后台任务`/`上游同步`/`拨测`, 与 §1.2 一致。

---

## 6. 附录: 无界面支撑端点全清单 (239, 机器生成)

> 与 `API-PAGE-MAP.md` 的 `类别` 列一致; 按类别分组。这是"产品缺口/非 UI 面"的原始清单。

```
### 未接线 (76)
GET /api/agent-avatars/*/*/*
POST /api/agents/me/connections/*/start-authorization
POST /api/agents/me/secrets/*/value
GET /api/build/spec/*
POST /api/cases/*/breakdown
GET /api/cases/*/documents/*/annotations/*
PATCH /api/cases/*/documents/*/annotations/*
POST /api/cases/*/documents/*/annotations/*/comments
POST /api/chat-endpoints/*/github/app
GET /api/chat-endpoints/*/github/configuration
PUT /api/chat-endpoints/*/github/configuration
POST /api/chat-endpoints/*/github/identity
POST /api/chat-endpoints/*/github/people/lookup
GET /api/chat-endpoints/*/github/personal-connections
PUT /api/chat-endpoints/*/github/progress
POST /api/chat-endpoints/*/github/registration
POST /api/chat-endpoints/*/github/repositories/refresh
GET /api/chat-endpoints/*/github/reviews
POST /api/chat-endpoints/*/github/verify
POST /api/chat-webhooks/agentmail/*
POST /api/companies/*/agents/bulk
GET /api/companies/*/built-in-agents/*/status
GET /api/companies/*/case-events
POST /api/companies/*/cost-events
POST /api/companies/*/decision-bundles
DELETE /api/companies/*/decision-queues/*/items/*/*
PATCH /api/companies/*/decision-retention/*/*
POST /api/companies/*/decision-retention/*/*/archive
POST /api/companies/*/decision-retention/*/*/revive
POST /api/companies/*/decision-training/preview
GET /api/companies/*/decision-triage/*/*
PUT /api/companies/*/decision-triage/*/*
GET /api/companies/*/decisions/stats
GET /api/companies/*/feedback-traces
POST /api/companies/*/finance-events
GET /api/companies/*/org.png
GET /api/companies/*/pipelines-attention
GET /api/companies/*/release-gate/ds-approval
GET /api/companies/*/search
GET /api/companies/*/search/extract
GET /api/companies/*/secrets/catalog
DELETE /api/companies/*/skill-policy
GET /api/companies/*/skill-policy
PUT /api/companies/*/skill-policy
POST /api/companies/*/skills/*/rename
GET /api/companies/*/slack/endpoints/*/capabilities
DELETE /api/companies/*/slack/endpoints/*/search
GET /api/companies/*/slack/endpoints/*/search
PUT /api/companies/*/slack/endpoints/*/search
POST /api/companies/*/slack/endpoints/*/search/connect
GET /api/companies/*/summary-slots/*/*
PUT /api/companies/*/summary-slots/*/*
POST /api/companies/*/summary-slots/*/*/generate
GET /api/companies/*/summary-slots/*/*/revisions
GET /api/companies/*/tools/examples
POST /api/companies/*/tools/examples/*/install
GET /api/companies/*/workspace-overview
GET /api/companies/templates
GET /api/invites/*/logo
GET /api/invites/*/skills/index
GET /api/invites/*/test-resolution
GET /api/issues/*/documents/*/annotations/*
PATCH /api/issues/*/documents/*/annotations/*
POST /api/issues/*/documents/*/annotations/*/comments
GET /api/issues/*/feedback-traces
POST /api/issues/*/interactions/*/withdraw
GET /api/llms/agent-configuration/*
GET /api/ota/manifest
GET /api/ota/manifest.json
GET /api/plugins/*/jobs/*/runs
GET /api/plugins/*/logs
PUT /api/projects/*/repositories
GET /api/tools/oauth/paperclip-id/callback
POST /companies/*/onboarding-seed
POST /runtime-tools/connections/request
POST /runtime-tools/connections/search

### 拨测 (105)
POST /api/agents/*/approve
POST /api/agents/*/claude-login
POST /api/agents/*/clear-error
GET /api/agents/*/config-revisions
POST /api/agents/*/config-revisions/*/rollback
POST /api/agents/*/heartbeat/invoke
GET /api/agents/*/instructions-bundle
PATCH /api/agents/*/instructions-bundle
DELETE /api/agents/*/instructions-bundle/file
GET /api/agents/*/instructions-bundle/file
PUT /api/agents/*/instructions-bundle/file
PATCH /api/agents/*/instructions-path
GET /api/agents/*/keys
POST /api/agents/*/keys
DELETE /api/agents/*/keys/*
POST /api/agents/*/pause
PATCH /api/agents/*/permissions
POST /api/agents/*/resume
POST /api/agents/*/terminate
POST /api/agents/*/wakeup
POST /api/agents/me/connections/*/token
GET /api/agents/me/inbox/mine
GET /api/agents/me/secret-proposals
POST /api/agents/me/secret-proposals
DELETE /api/agents/me/secret-proposals/*
GET /api/agents/me/secrets
POST /api/announcements/*/dismiss
GET /api/announcements/current
GET /api/board-api-keys
POST /api/board-api-keys
DELETE /api/board-api-keys/*
POST /api/build/spec/*/instantiate
PUT /api/cases/*/blockers
POST /api/cases/*/claim
GET /api/cases/*/context-pack
DELETE /api/cases/*/issue-links/*
POST /api/cases/*/release
GET /api/cases/*/rollup
POST /api/cases/*/suggest-transition
POST /api/cases/*/attachments
POST /api/cases/*/links
POST /api/chat-webhooks/*/*
POST /api/cli-auth/challenges
POST /api/cli-auth/revoke-current
GET /api/companies/*/attention
GET /api/companies/*/audit/agent-actions
GET /api/companies/*/audit/agent-actions.csv
GET /api/companies/*/decision-training
POST /api/companies/*/decision-training
GET /api/companies/*/decision-training/export.jsonl
GET /api/companies/*/heartbeat-runs
POST /api/companies/*/imports/apply
POST /api/companies/*/imports/preview
GET /api/companies/*/managed-agent-profiles
POST /api/companies/*/managed-agent-profiles
GET /api/companies/*/remote-agent-profiles
POST /api/companies/*/remote-agent-profiles
PUT /api/companies/*/resource-memberships/me/documents/*
GET /api/companies/*/review-cases
POST /api/companies/*/skill-policy/evaluate
POST /api/companies/*/slack/tasks/*/tools
GET /api/companies/*/users/*/inbox-agent-policy
PUT /api/companies/*/users/*/inbox-agent-policy
GET /api/companies/issues
DELETE /api/decision-training/*
GET /api/decision-training/*
PATCH /api/decision-training/*
GET /api/environments/*/leases
POST /api/instance/database-backups
GET /api/instance/lifecycle
POST /api/instance/lifecycle/unarchive-primary
DELETE /api/instance/task-drain
GET /api/instance/task-drain
POST /api/instance/task-drain
POST /api/issues/*/admin/force-release
POST /api/issues/*/children
GET /api/issues/*/diagnostics/blockers
GET /api/issues/*/diagnostics/subtree
GET /api/issues/*/diagnostics/wakes
GET /api/issues/*/documents
GET /api/issues/*/heartbeat-context
POST /api/issues/*/low-trust/promotions
GET /api/issues/*/recovery-actions
GET /api/llms/agent-configuration.txt
GET /api/pipelines/*/cases
POST /api/pipelines/*/cases
POST /api/plugins/*/bridge/action
POST /api/plugins/*/bridge/data
GET /api/plugins/tools
POST /api/plugins/tools/execute
DELETE /api/projects/*/workspaces/*
PATCH /api/projects/*/workspaces/*
POST /api/routine-triggers/public/*/fire
GET /api/routines/*/description/annotations/*
PATCH /api/routines/*/description/annotations/*
POST /api/routines/*/description/annotations/*/comments
GET /api/skills/catalog
GET /api/skills/index
PUT /api/status-cards/*/query
PUT /api/status-cards/*/summary
GET /api/teams/catalog
POST /api/tool-connections/*/grants/installations
GET /api/tool-connections/*/usage
GET /api/tools/oauth/cloud-connector/callback
POST /runtime-tools/github/credentials

### 内部RPC (50)
PATCH /api/agents/*/budgets
GET /api/agents/*/config-revisions/*
GET /api/agents/*/runtime-state
POST /api/agents/*/runtime-state/reset-session
GET /api/agents/*/task-sessions
GET /api/agents/me/inbox-lite
DELETE /api/board/chat/conversations
GET /api/companies/*/activity
POST /api/companies/*/activity
PATCH /api/companies/*/budgets
GET /api/companies/*/email/deliveries/*
POST /api/companies/*/skills/*/audit
POST /api/companies/*/skills/*/reset
POST /api/companies/*/smoke-lab/install-fixtures
GET /api/companies/*/smoke-lab/oauth/authorize
POST /api/companies/*/smoke-lab/oauth/authorize
POST /api/companies/*/smoke-lab/oauth/revoke
POST /api/companies/*/smoke-lab/oauth/token
GET /api/companies/*/smoke-lab/oauth/userinfo
POST /api/companies/*/smoke-lab/reset
GET /api/companies/*/smoke-lab/runs
POST /api/companies/*/smoke-lab/runs
GET /api/companies/*/smoke-lab/runs/*
PATCH /api/companies/*/smoke-lab/runs/*
POST /api/companies/*/smoke-lab/runs/*/steps
GET /api/companies/*/smoke-lab/services
POST /api/companies/*/smoke-lab/services/start
POST /api/companies/*/smoke-lab/services/stop
POST /api/companies/*/tools/examples/*/smoke
GET /api/feedback-traces/*
GET /api/feedback-traces/*/bundle
GET /api/invites/*/skills/*
GET /api/llms/agent-icons.txt
POST /api/mcp/project-tools
GET /api/openapi.json
GET /api/plugins/*/jobs
POST /api/plugins/*/jobs/*/trigger
POST /api/plugins/*/webhooks/*
GET /mcp/gateways/*
POST /mcp/gateways/*
GET /mcp/runtime-tools
POST /mcp/runtime-tools
GET /tool-gateway/gateways/*/mcp
POST /tool-gateway/gateways/*/mcp
POST /tool-gateway/runtime-slots/*/restart
POST /tool-gateway/runtime-slots/*/stop
POST /tool-gateway/sessions
POST /tool-gateway/sessions/*/revoke
GET /tool-gateway/tools
POST /tool-gateway/tools/call

### 后台任务 (6)
GET /api/companies/*/recovery-observability
POST /api/heartbeat-runs/*/provider-trace/reproject-workspace-diffs
GET /api/instance/scheduler-heartbeats
GET /api/slack/search/callback
GET /api/tools/oauth/cloud-connector/enrollment-callback
GET /api/tools/vercel-connect/callback

### 上游同步 (2)
POST /api/agents/*/skills/sync
POST /api/companies/*/export
```

---

## 7. 局限与诚实声明

1. **映射表是启发式 + 字符串反查**, 动态拼接的路径 (如头像 `<img src>`) 查不到 → 界面可达数是**下界**, 无界面清单可能**偏大**。
2. **spec 估算**基于页面数与经验系数, 不是逐用例实测; 落地时以第一批 P0 spec 的实际吞吐**回校**系数 (taste: 计划文档要随落地更新)。
3. 本方案**未执行任何 spec**; "100%" 是**目标口径与分母定义**, 不是已达成的结果。
4. 本轮只产出分析文档与可重跑脚本, **未改动任何产品代码**。

---

*审计: cmd (wave130) · 依据: 当天 main 源码 · 映射表由 `scripts/audit/build-api-page-map.mjs` 生成 · 只读*
