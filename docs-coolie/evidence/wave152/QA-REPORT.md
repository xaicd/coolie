# wave152 QA Report — 治理 + 可观察性

日期: 2026-09-29 · 分支: `main` · 起手 commit: `b01e4d9ef`（手写时 HEAD 已被并发线推到 `6613367c5`）
本波纪律: 不动 CMMI / 不动 board-chat / 不动 ios / 不改 `PAPERCLIP_API_KEY`/`DEPLOYMENT_MODE` /
不启停 dev / 不丢他人未提交文件。

## 0. TL;DR（诚实）

| 交付 | 状态 | 证据 |
|---|---|---|
| A 审计 log 全留痕 | **完成** | 迁移 9011 + service + 中间件 + 路由 + 5 处写点；15 单测中 5 条 + 活机 curl |
| B attachment/spec/work_product/conversation 隔离 | **完成（补测为主）** | 现网代码已全守卫；新增 spec/conversation 真测 3 条；attachment 已有单测 |
| C 失败率/交付周期/产能 metrics | **完成（服务端）** | service + `GET …/metrics/overview` + 3 单测 + 活机 curl |
| D 缺陷 KB + 自动 playbook 沉淀 | **完成（服务端）** | 迁移建表 + service + 关闭钩子 + 路由 + 4 单测 + 活机 curl |
| UI（Web/App 的 AuditLogViewer / Dashboard 卡片 / DefectKBPage） | **未做（延期）** | 服务端契约已就绪；见 §5 |

**未按最初 brief 号段**: brief 写 `9009_add_audit_log.sql`，但 9009 已被 wave148 占用；且并发线
wave154 在我建 9010 后又抢注 `9010_add_entity_relations.sql`，故本波审计+缺陷表落到 **9011**。

## 1. 交付物清单

新增（均为本波独有文件）:

- `packages/db/src/migrations/9011_add_audit_log_and_defect_kb.sql`（新表 `audit_log` + `defect_kb`）
- `packages/db/src/schema/audit_log.ts`、`packages/db/src/schema/defect_kb.ts`
- `server/src/services/audit.ts`（`writeAuditLog` / `auditService.list`）
- `server/src/middleware/audit.ts`（`auditActorFromRequest` / `pickFields` / `recordAudit`）
- `server/src/routes/audit-log.ts`（`GET /api/companies/:cid/audit-log`）
- `server/src/services/metrics.ts`、`server/src/routes/metrics.ts`（`GET …/metrics/overview`）
- `server/src/services/defect-kb.ts`、`server/src/routes/defect-kb.ts`（`GET …/defect-kb`）
- `server/src/__tests__/audit-log-routes.test.ts`、`tenant-isolation-resources.test.ts`、
  `metrics-routes.test.ts`、`defect-kb.test.ts`

改动（含并发线 wave154 在同文件内的**附加** hunk，未回退其任何改动）:

- `packages/db/src/migrations/meta/_journal.json`（+9011 条目）、`packages/db/src/schema/index.ts`（+2 export）
- `server/src/app.ts`、`server/src/routes/index.ts`（注册 3 个 router）
- `server/src/services/issues.ts`、`server/src/routes/issues.ts`
- `server/src/routes/issue-specs.ts`、`server/src/routes/board-chat.ts`

## 2. A — 审计 log（必做项）（完成）

### 2.1 表

`audit_log(id, company_id, actor_user_id, actor_agent_id, action, target_type, target_id,
before jsonb, after jsonb, created_at)`；索引 `(company_id,target_type,target_id)` 与
`(company_id,action,created_at desc)`。设计取舍:

- `actor_agent_id` **故意不加外键** —— agent 删除后审计行仍须指认行为人。
- `company_id` 级联删除（公司域数据随公司消失）。
- 两处 `ALTER TABLE … ADD CONSTRAINT` 用 `DO $$ … EXCEPTION WHEN duplicate_object` 包住：
  `ADD CONSTRAINT` 无 `IF NOT EXISTS`，而**活机曾应用过本迁移的早期修订**，这样重放不炸（见 §4）。

### 2.2 自动写点（对 brief 列表的落地）

| brief 项 | 落点 | action |
|---|---|---|
| issue_status 变更 | `services/issues.ts` `update()` 内 `buildIssueChanges` 的 `changes` | `issue.status_changed` |
| issue assignee 变更 | 同上 | `issue.assignee_changed` |
| issue 删除 | `routes/issues.ts` `DELETE /issues/:id` | `issue.deleted` |
| spec 写入/编辑 | `routes/issue-specs.ts` POST spec | `issue.spec_saved` |
| conversation 创建/归档/删除 | `routes/board-chat.ts`（wave148 三路由） | `board_conversation.created/archived/updated/deleted` |
| work_product 版本切换/删除 | `routes/issues.ts` | `issue_work_product.version_activated/deleted` |
| attachment 删除 | `routes/issues.ts` `DELETE /attachments/:id` | `issue.attachment_deleted` |
| agent 任命/停用、role/permission、app_releases | **未接线** | —（见 §5 缺口） |

**噪音过滤**: heartbeat / read / list 一律不写审计（审计只发生在写点，且只写被治理对象的语义变更）。
`issueService.update` 用 `buildIssueChanges` 的 `from/to` 真 diff，所以只记真正变化的字段。

### 2.3 活机真值（非模拟）

活机 `http://localhost:3100`（`local_trusted`，版本 `0.6.0+4.git.6613367c5.dirty`），公司 `b1d6850c-…`：

1. 建 issue → `PATCH {status:"todo"}` → 读审计：

```
GET /api/companies/b1d6850c-…/audit-log?targetId=d208dc80-…  → HTTP 200
{"items":[{"action":"issue.status_changed","actorUserId":"local-board",
  "targetType":"issue","targetId":"d208dc80-…",
  "before":{"status":"backlog"},"after":{"status":"todo"}}]}
```

2. 删除两枚探针 issue 后读全量，四条审计（真值）：

```
issue.deleted          | issue | {"title":"wave152 audit probe","status":"todo",…}            -> null
issue.deleted          | issue | {"title":"wave152 defect probe: login timeout","status":"done"} -> null
issue.status_changed   | issue | {"status":"todo"}   -> {"status":"done"}
issue.status_changed   | issue | {"status":"backlog"}-> {"status":"todo"}
```

### 2.4 权限

`GET …/audit-log` 为 **board-only** + `assertCompanyAccess`：agent key → 403；A 公司 board 读 B → 403（单测覆盖）。

## 3. B — 数据隔离（完成，主要是补真测）

审查结论：四类资源的现网路由**本就**走 `getAccessibleResource` / `assertCompanyAccess`：

- attachment：`GET /issues/:id/attachments`、`DELETE /attachments/:id`、POST 上传均带公司守卫
  （跨公司读 → 404，见既有 `issue-attachment-routes.test.ts:782`）。
- spec：`routes/issue-specs.ts` 全走 `getAccessibleResource`（跨公司 → 404）。
- work_product：`GET/PATCH/DELETE /work-products/:id` 走 `getAccessibleResource`。
- conversation：`assertCompanyAccess` + `findBoardConversation(companyId)`（跨公司 → 403/404）。

本波补上**可执行防回归**（`tenant-isolation-resources.test.ts`，真 Postgres）:
跨公司 spec 读/写 → 与「不存在」**字节相同**的 404；跨公司 conversation list → 403；本公司 → 200。

> 关于 brief 写的「→ 403」：本仓对**按 id 取资源**的路径是**故意**返回 404（反存在性预言机，
> 见 `routes/authz.ts` 注释与 `security-tenant-isolation-invariants.test.ts`）。隔离**成立**，
> 只是状态码按仓内既定契约取 404 —— 比 403 更强，不泄露存在性。

## 4. C/D — 活机真值

- `GET /api/companies/b1d6850c-…/metrics/overview` → **HTTP 200**，真值：
  `{"period_days":30,"failure_rate":0,"delivery_cycle_days_avg":null,"throughput_per_day":0,
   "totals":{"tasks":33,"done":0,"cancelled":0,"blocked":0,"blockedStuck":0,"inProgress":1},
   "by_agent":[{"agent_name":"onboarding-cache-test-agent",…},{"agent_name":"core-swe-agent",…}],
   "series":[14 天]}`（该测试公司无 done/cancelled，故比率为 0）。
- `GET …/defect-kb` → **HTTP 200**；对一枚 P1 缺陷建单并 `PATCH {status:"done"}` 后：
  `{"playbookThreshold":3,"items":[{"fingerprint":"ad69420b…","count":1,"sampleIssueId":"772b186d…"}]}`。

## 5. 缺口与延期（诚实，不假装跑通）

1. **UI 未做**：brief 要求的 Web/App `AuditLogViewer`、Dashboard 三卡片+sparkline、`DefectKBPage`、
   App 缺陷详情 KB 提示 **均未实现**。服务端契约（含 `series` sparkline 数据、snake_case 字段）已就绪，
   UI 可直接消费。这是本波最大缺口。
2. **审计未接线**：agent 任命/停用、role/permission 变更、app_releases 发布 **未写审计**
   （需在 `routes/agents.ts` / `routes/companies.ts` / 发版路径补 `recordAudit`）。
3. **`prod 公司 4cafeb9a` 无法验**：该实例（`local_trusted`，`~/.paperclip/instances/default`）
   只有两个 `onboarding-cache-test-*` 测试公司，**不存在** `4cafeb9a`。C/D 的活机真值跑在本地测试公司上。
4. **缺陷指纹用 title + severity**（非 brief 字面的 "tags"）：`IssueDefect` 无 tags 数组；
   `source` 故意不入指纹（同一缺陷会从 web/app 两个面被发现，入指纹会把一个反复缺陷拆成多行）。

## 6. 验证命令与结果

```
npx vitest run server/src/__tests__/audit-log-routes.test.ts \
  server/src/__tests__/tenant-isolation-resources.test.ts \
  server/src/__tests__/metrics-routes.test.ts \
  server/src/__tests__/defect-kb.test.ts        → 4 files, 15 tests P A S S E D
npx vitest run <issue-spec-routes|work-product-versions|issue-attachment-routes|
  board-chat-issue-route|board-chat-route-feature-flag|security-tenant-isolation-invariants>
                                                 → 6 files, 67 passed, 1 failed
packages/db  npx tsc --noEmit                    → exit 0
server       npx tsc --noEmit                    → exit 0
npx tsx packages/db/src/check-migration-numbering.ts → MIGRATION_NUMBERING_OK
```

**唯一的红**：`issue-attachment-routes.test.ts > canonicalizes paperclip artifact metadata before
creating a work product` → 期望 201 得 500。已用 HEAD 版 `routes/issues.ts` 复跑，**同样失败** →
**本波之前就红**，与 wave152 无关（未修，越界）。

## 7. 交付时工作区与并发说明

工作树**不干净**（并发线 wave154 `entity_relations`/`ontology-graph` 在途、wave149 的 e2e/scripts
未提交）。本波 commit 需要注册 3 个 router，必须与 `server/src/app.ts`、`server/src/routes/index.ts`、
`packages/db/src/schema/index.ts`、`_journal.json`、`server/src/routes/board-chat.ts` **同文件**；
这些文件里同时含 wave154 的**附加** hunk。为**不丢他人改动**，未回退其 hunk（回退=丢弃），
故这些附加 hunk 随本波 commit 一并落盘——已在 commit body 注明。`clients/expo/app.json`、
`ui/src/*`、`scripts/e2e/*`、`docs-coolie/evidence/wave154/*` **未纳入**本波 commit。

**发版**：`version.json` **未 bump**（仍 0.6.0）；按纪律本波只记 `RELEASE-HISTORY.md`，不打 tag。
`release-app.sh` 因工作树不干净**必然拒**，未尝试。
