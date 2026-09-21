# Spec: Coolie 平台功能 — 公司=Workspace 模板立项

- 日期：2026-09-21
- 老板：chenwei（weixin）
- 优先级：**P0**（老板明确说"coolie 这个系统要具备"）
- PM：Hermes
- 状态：READY FOR DISPATCH（派门神）

## 1. 背景

老板原话：「coolie 这个系统要具备我说的功能」。

指向的是前面 spec (`docs-coolie/specs/2026-09-21-coolie-workspace-template.md`)
的 5 个诉求：

1. Palantir 5 角色（FDA / Core SWE / PRE-SRE / FDSE / DS）作为 Coolie 平台「本体岗位」
3. 立项目脚本一键铺 workspace（CLI/模型/skills/spec 预装好）
4. 框架模板预装 ruoyi-all-next
5. 公司=workspace=代码目录，每个公司仓库自带角色 skill + spec 文档

## 2. Coolie 平台要新增的能力

### 2.1 公司级 Workspace 模板

- 平台层：`packages/templates/` 加 5 个内置模板
  - `template-palantir-5-role`（默认，含 5 角色 + spec workspace + ruoyi-all-next submodule）
  - `template-paperclip-default`（旧默认，保留兼容）
  - `template-empty`（最小）
- UI 层：建公司向导可选「模板」，不再是只填名字
- Server 层：`POST /api/companies` 接受 `template` 字段

### 2.2 5 角色 Agent 模板（员工配岗位）

- `packages/agents/role-templates/` 加 5 个：
  - `fda-agent` —— 领域模型/RBAC/隔离职责
  - `core-swe-agent` —— 编译/静态门禁
  - `pre-sre-agent` —— 环境指纹/灰度/拨测
  - `fdse-agent` —— 全栈交付/状态机/零死穴
  - `ds-agent` —— 业务旅程探路/一票否决
- 每个 role template 内置：
  - `role` 字段（"fda" / "core-swe" / ...）
  - `cli` 配置（哪条 cli 命令）
  - `model`（glm-5.3 / mm / cmd）
  - `skill_refs`（指 .agents/skills/<role>/）
  - `pacing`（GLM 同池串行规则）

### 2.3 一键立项目脚本

`scripts/new-company.sh` 在 Coolie 主仓根目录：

```
scripts/new-company.sh <公司名> [模板名]
   ↓
1. POST /api/companies { name, template: "template-palantir-5-role" }
   ↓
2. POST /api/companies/<id>/agents [批量 5 个 role]
   ↓
3. mkdir ~/workspace/xaicd/<公司名>/
   ↓
4. cp -R templates/workspace-skel/* ~/workspace/xaicd/<公司名>/
   ↓
5. cd ~/workspace/xaicd/<公司名> && git init
   ↓
6. git submodule add https://github.com/xaicd/ruoyi-all-next
   ↓
7. 输出：公司 ID、5 个 agent ID、workspace 绝对路径、立项报告
```

### 2.4 角色 Skill 自带

仓库 `.agents/skills/` 下新建 5 个细化角色 skill：

```
.agents/skills/
├── fda/SKILL.md                    (从 palantir-role-engineering 拆 FDA 章)
├── core-swe/SKILL.md               (拆 Core SWE 章)
├── pre-sre/SKILL.md                (拆 PRE-SRE 章)
├── fdse/SKILL.md                   (拆 FDSE 章)
└── ds/SKILL.md                     (拆 DS 章)
```

每个细化 skill 自带 `references/<role>-checklist.md`，匠人派单时按 checklist 自查。

### 2.5 DS 投产一票否决

`server/src/services/release-gate.ts` 新增 `requireDsApproval(companyId)`：
- 任何 company 发版前必须有一个 `ds-agent` 的 "go" 决议（issue comment / approval）
- 没 ds 签 → release-app.sh 拒绝执行
- 与 build orchestrator 集成：build 完成后强制 ds 走一遍「业务旅程探路」 + 本地 e2e-local.sh

## 3. User Stories

- **作为老板**：跑 `bash scripts/new-company.sh acme`，输出 5 个 agent ID + workspace 路径，能立刻给「FDSE 李四」派活
- **作为新公司 admin**：打开建公司向导，看见「模板」下拉，选 palantir-5-role 一键建公司
- **作为派单掌柜**：派单时直接 `cli/fdse.sh "..."`，不必每次说文件范围
- **作为 DS**：每个公司发版前都自动收到一个 issue「业务旅程探路」，探路完成才能继续
- **作为匠人**：打开新 workspace，看到自己角色的 SKILL.md + 模型 yaml + specs/ 入口

## 4. Acceptance Criteria (EARS)

### 4.1 一键立项

- WHEN PM 跑 `scripts/new-company.sh acme`，THEN SHALL：
  - POST /api/companies 返回 company_id
  - 创建 5 个 agent 角色，each role=`<5 roles>`
  - workspace 路径真实存在
  - ruoyi-all-next submodule init 成功
  - 退出码 0，并打印报告到 stdout

### 4.2 平台公司模板可下拉

- WHEN UI 调 `GET /api/companies/templates`，THEN SHALL 返回至少 3 个模板
- WHEN UI 调 `POST /api/companies {name, template_id}`，THEN SHALL 接受 template 并把 template 存到 company 表

### 4.3 5 角色 Agent 模板

- WHEN PM 跑 `scripts/register-roles.sh <company_id>`，THEN SHALL 给该公司注册 5 个 agent，每个 agent 的 role 字段等于一个 Palantir 5 角色
- WHEN 平台创建公司时指定 palantir-5-role 模板，THEN SHALL 自动注册 5 个 agent

### 4.4 角色 Skill 自带

- WHEN `acme/.agents/skills/fdse/SKILL.md` 存在，THEN SHALL 含「职责 / 门禁 / 自查脚本 / 必交付物 / 反例」5 节
- 每个 role skill 引 `references/<role>-checklist.md` 真实存在

### 4.5 DS 投产一票否决

- WHEN `scripts/release-app.sh` 发版前，THEN SHALL 调 `requireDsApproval(company_id)`，若 ds 没签 → 退出码非零 + 错误信息
- WHEN 平台里一个公司没 ds-agent，THEN 平台 SHALL 在 UI 提示「无可用 DS，建议添加」

### 4.6 ruoyi-all-next 预装

- WHEN 新公司 workspace 创建完成，THEN SHALL 含 `ruoyi-all-next/` 目录
- WHEN `cd ruoyi-all-next && mvn compile`，THEN SHALL 在 JAVA_HOME=17 环境下 0 错误

### 4.7 不动项

- 已有 v0.5.0 的工坊对话、build orchestrator、本体域、spec workflow
- DS 一票否决只拦新发版，**不拦已有的 OTA 升级**

## 5. 边界 / Out of Scope

- ❌ 5 角色 skill 完整 200+ 行（先各 60-100 行范本）
- ❌ 替换 Coolie 公司表结构（**新增字段**，不 ALTER 已有）
- ❌ 真换 Coolie 公司 ID 体系（继续 UUID）
- ❌ ruoyi-all-next 完整打通 Coolie user 表（仅 stub + 示例 controller）
- ❌ 给所有现存公司回填 5 agent（只对新公司生效）

## 6. 文件范围（白名单）

**主仓改动（必要）：**

```
server/src/
├── services/
│   ├── company-template.ts            (新增)
│   ├── role-template.ts               (新增)
│   └── release-gate.ts                (新增, 5 行内调 ds check)
└── routes/
    ├── companies.ts                   (扩 POST 接受 template)
    └── agents.ts                      (扩 POST 接受 role)

packages/
├── templates/
│   ├── template-palantir-5-role.ts    (新增)
│   ├── template-paperclip-default.ts  (新增, 兼容)
│   └── template-empty.ts              (新增)
└── agents/
    └── role-templates/
        ├── fda.ts                     (新增)
        ├── core-swe.ts                (新增)
        ├── pre-sre.ts                 (新增)
        ├── fdse.ts                    (新增)
        └── ds.ts                      (新增)

scripts/
├── new-company.sh                     (新增)
├── register-roles.sh                  (新增)
└── release-app.sh                     (扩: 发版前 require DsApproval)

.agents/skills/                        (新增 5 个角色 skill, git add -f)
├── fda/SKILL.md
├── core-swe/SKILL.md
├── pre-sre/SKILL.md
├── fdse/SKILL.md
└── ds/SKILL.md

templates/workspace-skel/              (新建, 默认 workspace 骨架)
├── README.md
├── specs/                             (空, 留给公司填)
├── docs/                              (空)
├── .agents/skills/<role>/             (各角色 skill 副本)
├── cli/<role>.sh                      (各角色 cli 壳)
├── models.yaml
├── .gitmodules
└── scripts/
    ├── bootstrap.sh
    └── import-ruoyi.sh
```

**主仓不动：** `clients/expo/android/**` / 任何 version 号 / `AGENTS.md` 根目录 / `release-app.sh` 发版逻辑本体（只插 1 个 requireDsApproval 调用）

## 7. 验收 gate

- [ ] `scripts/new-company.sh acme` 跑通（创建 platform company + 5 agent + workspace + ruoyi submodule）
- [ ] `GET /api/companies/templates` 返回 3 个模板
- [ ] `POST /api/companies {name, template_id}` 接受 template 字段
- [ ] 5 个 role agent templates 都注册可查
- [ ] `.agents/skills/{fda,core-swe,pre-sre,fdse,ds}/SKILL.md` 5 文件入库（`git add -f`）
- [ ] `scripts/release-app.sh` 发版前调 requireDsApproval，没签拒绝
- [ ] ruoyi-all-next submodule init + mvn compile 0 错误
- [ ] `pnpm -r typecheck` 0 错误
- [ ] `scripts/e2e-local.sh` 仍能跑（不破坏已有本地验收）
- [ ] 老板回签

## 8. 派单策略

- **第一波（门神 cmd）**：搭骨架
  - 5 个 role skill 范本（`SKILL.md` × 5，每份 60-80 行，引 checklist）
  - `scripts/new-company.sh` + `scripts/register-roles.sh` stub
  - `templates/workspace-skel/` 骨架（含 cli/<role>.sh + .gitmodules）
- **第二波（铁匠 claude）**：平台层 wire
  - `packages/templates/template-palantir-5-role.ts` + 2 个对照
  - `packages/agents/role-templates/*.ts` × 5
  - `server/src/services/company-template.ts` + `role-template.ts` + `release-gate.ts`
  - 扩 `routes/companies.ts` + `routes/agents.ts`
  - 扩 `release-app.sh` 一行 requireDsApproval
- **第三波（掌柜自己）**：本地验证
  - `bash scripts/new-company.sh acme` 跑通
  - `bash scripts/e2e-local.sh` 仍绿
  - 写 docs-coolie/COOLIE-WORKSPACE-TEMPLATE.md 主仓文档同步
  - PM-RELEASE-CHECKLIST 24 项 gate 签字

## 9. 不回签就停在哪

如果老板认为某条不该做（例如「ruoyi 集成不要」），本 spec 立刻修订，不开工。

## 10. 派活阻塞

| 阻塞 | 解决 |
|---|---|
| 墨斗 agy 09-23 恢复前不可用 | 用 cmd + claude 配对 |
| 铁匠 claude max-turns 不够 | 拆任务，每波 ≤ 30 turns |
| cmd 长任务不稳定 | 派多波，每波 ≤ 10 分钟 |