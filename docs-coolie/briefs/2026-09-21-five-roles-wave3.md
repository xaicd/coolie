# Brief: 5 角色 agent 真接入 Coolie 公司创建流程（铁匠 wave 3）

Repo: `~/workspace/xaicd/coolie` (main, AFTER h5 wave 2 + 0.5.1 release)
PM: Hermes
Worker: cmd（铁匠 claude 撞 model catalog 错误）

## 0. Pre-condition

WAIT for h5 wave 2 (proc_4ab46825c3ae) to commit + push first.

Check:
```bash
git log --oneline -5
# expect: h5 wave 2 commit at HEAD
```

If not done → STOP. Don't start this brief.

## 1. Background (boss 2026-09-21)

Boss said: "用 coolie 按照 palantir 本体岗位角度方式组建项目开发完整团队，每个角色的员工运行的环境、CLI、大模型、skills 先预装好，用到的框架模板也预装好 ruoyi-all, 每个公司就是一个项目".

5 角色 (Palantir Foundry):
- FDA — 前线架构师（领域模型 / RBAC / 隔离）
- Core SWE — 平台核心研发（编译 / 静态门禁）
- PRE-SRE — 产品可靠性工程师（环境指纹 / 灰度 / 拨测）
- FDSE — 前线部署全栈（全栈交付 / 状态机 / 零死穴）
- DS — 部署战略专家（业务旅程探路 / 一票否决）

Already in place (workspace-as-company wave 1, commit 6f46bf815):
- ✅ 5 role skill 范本 in `.agents/skills/{fda,core-swe,pre-sre,fdse,ds}/SKILL.md`
- ✅ `templates/workspace-skel/` (cli shells, models.yaml, .gitmodules)
- ✅ `scripts/new-company.sh` (stub: mkdir + cp + git init + submodule init)
- ✅ `scripts/register-roles.sh` (stub: prints 5 role names)
- ✅ `packages/templates/{template-palantir-5-role,template-paperclip-default,template-empty}.ts`

What's MISSING (this brief fills):
- ❌ `scripts/new-company.sh` does NOT call Coolie API to register company
- ❌ `scripts/register-roles.sh` does NOT actually create agents via API
- ❌ No HTTP route to ingest `POST /api/companies { name, template_id }` template selection
- ❌ No `POST /api/companies/<id>/agents` bulk-create 5 role agents
- ❌ `packages/agents/role-templates/*.ts` does NOT exist (referenced in Coolie-FORK-BOUNDARY.md)

## 2. Tasks (in order)

### 2.1 Backend: company template API

`server/src/routes/companies.ts` — extend `POST /api/companies` to accept `templateId` field. Store in `companies` table (need migration if not exists).

Files:
- `packages/db/src/schema/companies.ts` — add `template_id` column (nullable)
- `packages/db/drizzle/00XX_add_template_id.sql` — migration
- `server/src/services/company-template.ts` — new service
- `server/src/routes/companies.ts` — extend POST handler

### 2.2 Backend: 5 role agent templates

`packages/agents/role-templates/*.ts` × 5:
- `fda.ts` — domain model, RBAC, isolation
- `core-swe.ts` — compile gates, AST
- `pre-sre.ts` — env fingerprint, canary
- `fdse.ts` — full-stack delivery, state machine
- `ds.ts` — business journey, veto power

Each file ≥ 50 lines, exports `ROLE_TEMPLATE` constant matching `AgentRole` type.

### 2.3 Backend: register 5 role agents API

`server/src/routes/companies/<id>/agents.post.ts` (or similar):
- Accepts `roles: string[]`
- For each role: create agent with `role` field set
- Returns `{ created: Agent[] }`

### 2.4 CLI: new-company.sh upgrade

`scripts/new-company.sh`:
1. POST to Coolie API (with auth) to create company with template_id
2. POST to register 5 agents
3. mkdir workspace + cp templates + git init + submodule init
4. Print report: company_id / workspace path / 5 agent ids

### 2.5 CLI: register-roles.sh upgrade

`scripts/register-roles.sh <company_id>`:
- POST to `/api/companies/<id>/agents` with 5 roles
- Print 5 agent IDs returned

### 2.6 DS release veto

`server/src/services/release-gate.ts` — new service.
`requireDsApproval(company_id)` — check for `ds-agent` with "go" comment on most recent issue. If none → throw `RELEASE_REJECTED_NEEDS_DS`.

`scripts/release-app.sh` — insert one-line check at start:
```bash
require_ds_approval || exit 1
```

## 3. Constraints

- DO NOT touch: `clients/expo/`, `clients/h5/`, `ui/`, any version number on h5 / app side
- USE existing agent factory (search for `createAgent` in server/src/services/agent*.ts)
- USE existing company service
- One commit per task section (don't bundle)
- Stay within --max-turns 200

## 4. Verification

- [ ] `pnpm -r typecheck` 0 errors
- [ ] `bash scripts/new-company.sh acme-test-$(date +%s)` succeeds (real Coolie API)
- [ ] 5 agents created with correct role field
- [ ] `release-app.sh` aborts when no ds approval exists (test by removing ds approval)
- [ ] `release-app.sh` proceeds when ds approval exists
- [ ] Commit + push each section
- [ ] weixin report: company_id / 5 agent ids / ds-veto verified

## 5. Don't do

- ❌ Don't change existing agent / company types (add new fields only)
- ❌ Don't add new tables unless required
- ❌ Don't migrate existing data
- ❌ Don't bypass auth

## 6. Done definition

All 6 tasks done + tsc 0 + commit + push + weixin report