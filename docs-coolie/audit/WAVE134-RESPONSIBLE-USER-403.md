# WAVE134 — responsibleUserId 伪用户导致 agent 回写 403 / 任务 blocked

- 日期: 2026-09-29
- 公司: `4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e`（xrobinai 工坊）
- 修复提交: `28f01298b`（主体）+ `ee5e08de1`（部署脚本连带修复），已 push `origin/main`
- 生产: `tc-coolie-claw` / `/opt/coolie`，`tsx src/index.ts`，PostgreSQL 16

## 1. 机制说明（根因链）

**症状**：agent run 的每一次 API 调用被 403 `RESPONSIBLE_USER_UNAVAILABLE`，员工干完活交不上，
系统等不到 disposition → periodic heartbeat recovery 判 `blocked` → 自己修不好。

**触发点**：本机（App/board concierge）用 `x-paperclip-api-key` 调 127.0.0.1:3100。
`server/src/middleware/auth.ts` 把这个 header 升级成一个 **board actor，userId = `paperclip-concierge`**：

```ts
req.actor = { type: "board", userId: "paperclip-concierge", isInstanceAdmin: true, source: "api_key", ... }
```

它是个**合成身份**，不是真用户：`auth_users` 里没有它，`company_memberships` 里也没有它。

**写入错误归属**（机动车）：
1. `POST /api/companies/:cid/issues` 时，route 用 `createdByUserId: actor.actorType === "user" ? actor.actorId : null`
   → `createdByUserId = "paperclip-concierge"`。
2. `server/src/services/issues.ts:resolveResponsibleUserIdForIssueCreate` 在无显式 responsibleUser 时
   **回退到 `createdByUserId`** → issue 的 `responsible_user_id = "paperclip-concierge"`。
3. 该 issue 的 run 在 dispatch 时经由
   `resolveResponsibleUserIdForRunSeed` / `resolveResponsibleUserIdForRun` /
   `initializeRunIdentity` 继承 issue 的 responsible user；
   `initializeRunIdentity` 还会**自己再取一次 operator identity**
   （`explicitOperatorRunIdentity`，手动 wake 时 `actorId = requestedByActorId = paperclip-concierge`）
   并优先用它 → `run_identity_contexts.responsible_user_id = paperclip-concierge`。
4. agent 带 JWT 调用时，middleware 用身份上下文的 responsible user 作为 `onBehalfOfUserId`；
   `server/src/routes/authz.ts:assertCompanyAccess` 做
   「responsible-user company access intersection」：在 `company_memberships` 里找不到
   `paperclip-concierge` 的 active 成员 → 抛 403 `RESPONSIBLE_USER_UNAVAILABLE`。
   `loadResponsibleUserMemberships` 因为该 user 不存在，直接返回 `[]`。

**后果**：run 全程 403，落不了 disposition → issue 被 recovery 判 `blocked`
（`missing disposition ... board decision required`），`dispositionRepairRequeued` 恒为 0。

**候选方案与选择**：三方案中选 **方案1（修写入归属）**。理由：根因是「把合成身份写进了
responsibleUser 字段」，而不是校验本身错。校验是对的（responsible user 必须是公司成员）。
方案2（agent 授权回退到 agent 自身）要改动通用授权判定，语义更弱且把「谁的授权」和「谁在执行」
混为一谈；方案3（把 concierge 登记为公司成员）语义最差（凭空造一个假成员，还会污染成员表）。
上游契约核对：`heartbeat-responsible-user-invariant.test.ts` 明确规定 run 的 responsible user
**可以不是公司成员**（外部评论者、手动 wake 调用者），所以不能把 run 的校验改成「必须成员」——
这也正是为什么修复只针对**合成 concierge 身份**，其他 id 一律不动。

## 2. 修复 diff 摘要

新增 `server/src/services/responsible-user.ts`（单一实现，避免各写入面各写一份）：

- `PAPERCLIP_CONCIERGE_USER_ID` —— 合成身份的唯一来源，middleware 也 import 它。
- `resolveCompanyScopedResponsibleUserId(reader, companyId, candidate)` ——
  **只**把 `paperclip-concierge` 换成公司真实默认用户（`defaultResponsibleUserId` → owner ∈ active members →
  最早 active member）；其他 id **原样返回**；公司没有真实成员时返回 candidate（不抹掉归属）。

接入点（每一处都会写/派生 responsible user）：

| 文件 | 改动 |
|---|---|
| `server/src/services/issues.ts` | `resolveResponsibleUserIdForIssueCreate` 现在包一层 `derive...`，结果过 normalizer → 建单归属为真实成员 |
| `server/src/services/heartbeat.ts` | `resolveResponsibleUserIdForRunSeed` 包一层 normalizer；`resolveResponsibleUserIdForRun` 忽略 concierge 的 explicit operator identity；dispatch 后把 `heartbeat_runs.responsible_user_id` 同步成身份上下文的权威值（run 行在 wake 时就建好了，早于身份解析） |
| `server/src/services/run-identity.ts` | **关键**：`initializeRunIdentity` 自己重取 operator identity 并优先用它的 actorId，是实际落库 `run_identity_contexts` 的地方。现在它丢掉 concierge actorId（保留「显式 wake」语义与 cause），并把 dispatch / 逐消息的 responsibleUser 都过 normalizer |
| `server/src/routes/agents.ts` | `POST /agents/:id/keys` 建 key 时把 responsibleUser 过 normalizer（否则 concierge 建的 key 100% 不可用） |
| `server/src/services/routines.ts` | routine 生成的 issue 同样归一化；顺手删掉本文件里重复的 company-default 解析，改用共享实现 |
| `server/src/middleware/auth.ts` | 用共享常量替代裸字面量 `"paperclip-concierge"` |

上游文件清单同步登记在 `scripts/fork-surface.json`（新增 5 条 + 更新 2 条，共 10 个文件在预算内，
`node scripts/check-fork-surface.mjs` PASS）。

**测试**：`responsible-user.test.ts`（embedded PG，6 通过：真成员保留 / concierge 换真 owner /
建单落库为真 owner）、`run-identity.test.ts` 新增 concierge 手动 wake 用例（11 通过）。
回归：`actor-middleware-api-key`、`authz-company-access`、`agent-auth-middleware`、
`authorization-service`、`routines-service`、`issue-created-from-routes`（189 通过）、
`heartbeat-responsible-user-invariant`（14 通过）。`tsc --noEmit` = 0。

## 3. 存量修正清单与数量

生产 DB 直接修（事务内，只改 `responsible_user_id` 这一类字段）：

| 表 | 修正行数 | 目标值 |
|---|---|---|
| `issues` | 15 | `CtCxJJuva2SacStByNr58GpQSLMiTjSi`（公司 owner = `defaultResponsibleUserId`） |
| `heartbeat_runs` | 55 | 同上 |
| `run_identity_contexts` | 56 | 同上 |

修正后 `select count(*) ... where responsible_user_id='paperclip-concierge'`：issues=0、runs=0、identity=0。
涉及工单：**XROA-42/43/44/45/46/47/48/49/50/74/75/76/77/78/79**（15 条，全部原为 blocked）。

`created_by_user_id` **故意保留** `paperclip-concierge`：那是「用哪把 key 建的」的真实记录，
不重写历史；功能阻塞字段是 `responsible_user_id`，已修。

（`activity_log` 有 198 行 responsible_user_id=concierge，属审计历史的当时归属，未改。）

## 4. 解封前/后证据

**探针**：用 concierge key 新建 issue（XROA-131）→
`responsibleUserId = CtCxJJuva2SacStByNr58GpQSLMiTjSi`（真 owner），`createdByUserId = paperclip-concierge`。
随后置为 cancelled 清理。（证明**修复已生效**，建单不再落伪用户。）

**日志前后（journalctl -u coolie）**：

| 窗口 | `RESPONSIBLE_USER_UNAVAILABLE` 计数 |
|---|---|
| 00:00–04:19（修复前） | **152** |
| 04:41–现在（修复后） | **0** |

（会话开始时 72h 累计为 569；`recorded responsible-user denial code` 在 04:41 后同样为 0。）

修复前样本：

```
9月 29 00:22:18 ... {"code":"RESPONSIBLE_USER_UNAVAILABLE","action":"company_access",
  "companyId":"4cafeb9a-...","actorAgentId":"95069d63-...","responsibleUserId":"paperclip-concierge",
  "method":"POST","msg":"responsible-user company access intersection denied"}
```

**实测解封（agent 真能回写）**：重新 wake XROA-78（ds-agent）：

- `heartbeat_runs.responsible_user_id` = `CtCxJJuva2SacStByNr58GpQSLMiTjSi`
- `run_identity_contexts.responsible_user_id` = `CtCxJJuva2SacStByNr58GpQSLMiTjSi`（cause `manual_user_wake`）
- 04:42:26 agent 成功 POST 出此前被 403 打回的最终交付评论（「XROA-78 S5 集成实施与验收测试 — 最终交付与门禁判定」）
- 工单 **XROA-78: blocked → done**（04:42:27）

**整批重派结果**（对 15 条逐一 wake）：

| 结果 | 数量 | 工单 |
|---|---|---|
| done | 7 | XROA-43/46/75/76/77/78/79 |
| in_progress | 1 | XROA-48 |
| blocked（剩余） | 7 | XROA-42/44/45/47/49/50/74 |

剩余 blocked 的 7 条**不是 auth 问题**：其 agent run 现已 `succeeded` 且控制面写成功
（XROA-42 的评论自称 `POST comment (复查 + 计划) → 201`），blocked 是 agent 依其**自身业务**给出的
disposition（如 XROA-45「真机环境闸门是硬前置」、XROA-44「未闭环」），属需要 board 决策的正常阻塞。

## 5. 链路完成度结论

- **根因已解**：`RESPONSIBLE_USER_UNAVAILABLE` 在生产 04:41 后归零；concierge key 建单落真实归属。
- **存量已清**：15/55/56 行全部改正，无残留 concierge responsible user。
- **解封已证**：被 403 卡住的交付物真正落地（XROA-78 → done，评论 201），整批从「全部 blocked」变为 7 done / 1 in_progress / 7 需 board 决策。
- **防复发**：写入路径（建单/run seed/run identity/agent key/routine）统一走一个 normalizer，并有测试钉住；
  middleware 常量单一来源。still-open：历史 `activity_log` 归属未改（设计如此）。

## 6. 连带发现（非本任务根因，但由本次部署暴露）

`scripts/deploy-coolie.sh` 的 UI 重建会 `vite build` 清空 `ui/dist`，把 `release-app.sh` 放在那里的
App 升级清单 `ui/dist/version.json` 一起删掉；而脚本自带的「upgrade feed 存活」探测**在重建之前**跑，
所以探测通过、销毁无感 —— Caddy 随后对 `/version.json` 返 404，已装 App 静默「无更新」（0.5.89 实测命中）。
已单独修复（`ee5e08de1`）：重建时在宿主上 stash/restore `ui/dist/version.json`（644），
并在**重建之后**再断言 upgrade feed + OTA manifest 存活。清单已恢复为 0.5.89，`/version.json` = 200。
