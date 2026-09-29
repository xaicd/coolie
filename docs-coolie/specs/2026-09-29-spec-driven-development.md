# Feature: spec-driven 开发链（requirement/bugfix → design → task）

> 日期 2026-09-29 · 基线 commit `078923ead` · 状态：已落地（main），发版待定。

## 1. 背景

boss 2026-09-29 指示：「CMMI 全但不如 spec 驱动凝炼，requirement/bugfix, design, task」。

CMMI（G1–G5）完整但重，适合项目治理（boss/PM 视角）；**员工每次实际开发应走 spec-driven**。
两条路并存：CMMI 是项目治理层，spec-driven 是开发落地层。本 spec 只加开发层，不动 CMMI。

## 2. User Stories

- 作为**员工**，我想在动代码前把「做什么 / 怎么改 / 改哪几行」写成三步 spec，
  这样我的改动可被 PM 查询与验收，而不是一句话派单。
- 作为 **PM**，我想看到一棵 spec 树（req → design → task），这样我能确认每个需求都有
  设计、每个设计都拆到了任务。
- 作为**数字员工/agent**，我想通过 MCP / HTTP 直接读写 spec，这样我能被自动化的工位驱动。

## 3. Acceptance Criteria (EARS)

- WHEN 员工在新建任务时选定 Spec 类型, THEN 系统 SHALL 在建单后写入该类型的 spec 骨架。
- WHEN 员工提交一条不完整的 spec（非 draft）, THEN 系统 SHALL 以 400 拒绝。
- WHEN 员工以 `?draft=1` 提交半成品, THEN 系统 SHALL 接受并原样存储。
- WHEN spec 的 `parentSpecId` 指向自身或其它公司的 issue, THEN 系统 SHALL 以 422 拒绝。
- WHEN 客户端 `GET /api/companies/:cid/specs/tree`, THEN 系统 SHALL 返回 req → design → task 嵌套森林。
- WHILE 一个任务没有 spec（`spec_kind` 为 NULL）system SHALL 不影响既有任务列表/详情。
- system SHALL NOT 修改任何 CMMI 表、文档或页面。

## 4. 边界 / Out of Scope

- 不做 spec 版本历史（复用 issue 的审计日志）。
- 不做 spec 审批流（属 CMMI 层）。
- 不做 App 端完整 spec 编辑器（本期只在新建任务弹窗选类型）。
- 不改 CMMI、不改 `PAPERCLIP_API_KEY`/`DEPLOYMENT_MODE`。

## 5. 文件范围（白名单）

见 `docs-coolie/evidence/wave147/QA-REPORT.md` 的「文件清单」一节（含 fork-surface 声明）。

## 6. 不动项

- `packages/plugins/plugin-ontology/**`、`docs/cmmi/**`、`skills/cmmi-*/**`（CMMI 治理层）。
- 其它并行的 wave（146/148/149）正在写的仓区。

## 7. 技术方案（design）

### 7.1 数据

- `issues.spec_kind text NULL` + `issues.spec jsonb NULL`（手写迁移 `9008_add_issue_spec.sql`，
  fork 的 9000 段；两列可空、无默认 → 不重写表）+ 索引 `(company_id, spec_kind)`。
- 链靠 `parentSpecId` = 父 spec 所在 **issue 的 id**，不新增表。

### 7.2 契约（packages/shared）

- `types/issue-spec.ts`：`IssueSpec` + 四种 payload。
- `validators/issue-spec.ts`：`issueSpecSchema`（严格，kind 必须带对应 payload）+ `issueSpecDraftSchema`（宽松）。
- `spec-templates.ts`：每种 kind 的骨架（一处定义）。
- `spec-tree.ts`：纯函数 `buildSpecTree(rows)`（无 I/O，孤儿浮为根）。

### 7.3 服务端

`server/src/routes/issue-specs.ts`：GET/POST `/issues/:id/spec`、GET `/companies/:cid/specs/tree`、
POST `/companies/:cid/specs/from-template`。直接读写 `issues.spec_kind/spec`，不扩 issue service 的 create 入参。
`issueListSelect` 补 `spec_kind/spec`（与 `milestone` 同款）。

### 7.4 客户端

- 网页：`SpecEditor`（3 步 stepper + 4 kind tab）、`IssueSpecPage`（`/issues/:id/spec`）、
  `SpecTreePage`（`/specs`）、`NewIssueDialog` 的 Spec 胶囊。
- App：`CreateTaskModal` 的「Spec 类型」胶囊 + `api-client.saveIssueSpec`。
- MCP：`spec_create` / `spec_tree` / `spec_template_apply`。

### 7.5 权衡

- **单 issue 单 spec，用 parent id 串链**：复用 issue 树与权限，不引入新表；代价是
  「一条 issue 只能是一个阶段」——对 spec 链而言正是想要的。
- **POST 直接收 spec、`?draft=1` 走宽松 schema**：避免 `{spec,draft}` 包壳给调用方加一层；
  代价是 draft 判定落在 query 上。
- **列表投影带全量 spec**：与 `milestone` 一致（诚实优先）；若日后体积成问题再按需 null 化。
- **App 骨架在客户端复制一份**：expo 不依赖 `@paperclipai/shared`，复制处已注明来源；
  若 drift 成为问题，改由 api-client 出一份共享骨架。

### 7.6 验证方式

见 QA-REPORT：单元（shared 17）、集成（真 Postgres 三链路 3）、MCP（28）、
typecheck（shared/db/server/mcp/api-client/expo/ui）、token gates、fork-surface、
Playwright 三截图（真跑本地实例）。
