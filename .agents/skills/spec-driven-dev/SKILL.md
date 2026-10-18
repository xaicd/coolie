---
name: spec-driven-dev
description: 员工每次代码改动的 3 步 spec 流程（requirement/bugfix → design → task）。Use when 领到一条开发任务、写新功能前、修 bug 前、要把一句话变成可派单的改动点。产物落在 issue 的 spec 字段，可查询/可派单。
---

# spec-driven 开发（数字员工落地层）

CMMI（G1–G5）是**软件工程资产治理层**——管 0-1 阶段门与物理交付物（SRS/HLD/Repo/Test/SOP）。
**每次实际代码改动**走这套 3 步 spec 链——轻，管「做什么 / 怎么改 / 改哪几行」，是用确切代码与测试断言消灭大模型假大空套话的微观引擎。
两者并存：CMMI 定 0-1 软件工程资产怎么验收，spec 定每一次微观改动怎么做。

## 三步

1. **requirement 或 bugfix** —— 描述要做什么 / 哪里不对。
   - requirement：1~3 句话 + 验收条件（EARS：`WHEN … THEN … SHALL …`）。
   - bugfix：复现步骤 + 预期 + 实际。
2. **design** —— 怎么改：方案 + 权衡 + API surface。**别跳**（除非一行改完）。
3. **task** —— 具体改动点（1~N 条），每条一个可独立提交的白名单。

模板：`templates/spec-driven/{requirement,bugfix,design,task,workflow}.md`。

## 怎么落（回归 Paperclip 官方方案与双轨并轨）

1. **统一官方方案优先 (Git + Paperclip Native issue_documents)**：
   - **代码与规格单一真理源**：物理真理源 100% 收归本地 Git（`docs/specs/<slug>/` 与 CMMI `docs/01~09/`）。
   - **控制面协同载体**：控制面 Issue 100% 采用 Paperclip 官方原生 **`issue_documents`**（Markdown 协同文档，`key: "spec"` 与 `key: "plan"`），废弃在 DB 中侵入自定义 JSONB 的方式。
   - **一键双向同步**：`node scripts/speckit.cjs sync --spec <slug>` 自动创建/关联工单并原子挂载 `issue_documents` (`key: 'spec'`, `key: 'plan'`) 以及 Primary Work Product。
   - **存量迁移指令**：`node scripts/speckit.cjs official-migrate` 可一键将所有历史库内 spec 字段迁移至官方 `issue_documents`。

2. **接口向后兼容与双写桥接 (Dual-Write Bridge)**：
   - 写入 spec：`POST /api/issues/:id/spec`（body 为 spec 对象，支持 `?draft=1`），后端自动双写至官方 `issue_documents` (`key: "spec"`)。
   - 模板起骨架：`POST /api/companies/:companyId/specs/from-template`，自动双写并挂载官方文档。
   - 读回：`GET /api/issues/:id/spec`（若未设独立 spec 字段，自动从官方 `issue_documents` 回退反推）；整棵树：`GET /api/companies/:companyId/specs/tree`。
   - 官方原生端点：`PUT /api/issues/:id/documents/spec`，`GET /api/issues/:id/documents/spec`。
   - 网页端：原生 Documents 协同与审批；MCP：`paperclipUpsertIssueDocument` / `paperclipGetDocument`。

链靠 `parentSpecId`（父 spec 所在 **issue 的 id**）或 Issue 原生 `parentId`：task → design → requirement/bugfix。

## 统一 CLI 驱动 (Spec-Kit SDD Engine)

Coolie 已统一整合现代 `speckit` 命令行工具集（`scripts/speckit.cjs`）：
```bash
node scripts/speckit.cjs init              # 检查或初始化 .specify 拓扑与宪法
node scripts/speckit.cjs constitution      # 检视工程宪法
node scripts/speckit.cjs new --name <slug> # 建立特性/缺陷骨架
node scripts/speckit.cjs build --name <slug> # 展开完备规格与任务图
node scripts/speckit.cjs tasks --spec <slug> # 查看波次任务与真实 Git 提交核销
node scripts/speckit.cjs sync --spec <slug>  # 双向同步到控制面工单与工件总线
node scripts/speckit.cjs check --spec <slug> # 检查交付与门禁状态
node scripts/speckit.cjs cmmi check        # CMMI 01~09 过程资产健康度守卫
```


## 四条纪律

1. 一条 task = 一次提交。改完即 commit（不 push，除非老板放行）。
2. 文件列表是白名单：超出即另开一条 task，别顺手改别的。
3. spec 要能被读回。写完 `GET` 一次确认落库，别只信写响应。
4. **No Artifact, No Done 铁律**：每次任务必须挂载物理 Work Product（代码 Commit、OpenAPI 契约、真机截图或部署制品）。无实体交付物严禁置为 `done`。

---

## Kiro 原生工作流编排机制 (Kiro Workflows & Recipes)

在 Kiro SDD 架构中，**工作流 (Workflows)** 是将 SDD 从“静态文档规范”推向“多智能体自主执行”的核心运行引擎：

### 1. 核心运行机制
1. **多智能体隔离会话 (Fresh Session per Step)**：工作流将复杂任务拆解为树状/图状步骤链，每个步骤在独立的会话上下文中运行。例如审查角色（`@wf-reviewer` / 兜底渊）拥有干净的全新上下文，绝不继承编码角色（`@wf-coder` / 铁匠）的代码自辩偏见！
2. **声明式配方单一真源**：所有可复用工作流物理收归 `.agents/workflows/*.workflow.json`（根目录通过 `.kiro/workflows` 软链接无缝桥接，确保 Kiro IDE 原生识别与 Antigravity / 跨 Agent 平台统一标准）。
3. **数据管道自动透传**：后续步骤可通过 `{{previous.output}}` 或 `{{inputs.<param>}}` 顺畅消费上游产物。

### 2. 内置 4 大 SDD 原生工作流配方 (`.agents/workflows/`)

| 配方文件 (`.agents/workflows/`) | 适用场景 | 步骤链编排 (Step Pipeline) | 驱动数字员工角色 |
|---|---|---|---|
| 📦 **`feature-delivery.workflow.json`** | 全生命周期新特性交付 | `scaffold` ➔ `requirements` ➔ `design` ➔ `plan-waves` ➔ `implement` ➔ `verify` | Hermes / 百晓生 (`@wf-planner`)<br/>墨斗 (`@wf-architect`)<br/>铁匠 (`@wf-coder`)<br/>门神 (`@wf-tester`) |
| 🐛 **`bugfix.workflow.json`** | 缺陷排查与红绿验证 | `scaffold` ➔ `diagnose` (5-Whys) ➔ `red-test` ➔ `patch` ➔ `verify-gate` | Hermes / 百晓生 (`@wf-planner`)<br/>门神 (`@wf-tester`)<br/>铁匠 (`@wf-coder`)<br/>兜底渊 (`@wf-reviewer`) |
| 🏛️ **`architecture-refactor.workflow.json`** | 架构债务消除与演进 | `scaffold` ➔ `debt-analysis` ➔ `parity-tests` ➔ `refactor-execution` ➔ `regression-audit` | Hermes / 百晓生 (`@wf-planner`)<br/>墨斗 (`@wf-architect`)<br/>门神 (`@wf-tester`)<br/>铁匠 (`@wf-coder`)<br/>兜底渊 (`@wf-reviewer`) |
| 🛡️ **`security-patch.workflow.json`** | 安全加固与漏洞拦截 | `scaffold` ➔ `threat-model` ➔ `poc-red-test` ➔ `hardening` ➔ `strix-audit` | Hermes / 百晓生 (`@wf-planner`)<br/>兜底渊 (`@wf-security`)<br/>门神 (`@wf-tester`)<br/>铁匠 (`@wf-coder`) |

### 3. 工作流标准工具链与 CLI 引擎 (`scripts/workflow-engine.cjs` / `scripts/workflow-engine.ts`)

```bash
# 1. 查看全量工作流配方清单与参数
pnpm run workflow:list

# 2. 静态语法、DAG 依赖无环性与 Agent 角色合法性门禁检查
pnpm run workflow:check

# 3. 模拟展开：变量代换预览、输出 Mermaid DAG 编排图与各数字员工指令
pnpm run workflow:dry-run -- --recipe <recipe> --name <spec> --domain <domain> --title "<title>"

# 4. 驱动执行：自动执行脚手架并落盘工作流执行记录
pnpm run workflow:run -- --recipe <recipe> --name <spec> --domain <domain> --title "<title>"

# 5. 快速生成新的工作流配方模板
pnpm run workflow:new -- --name <recipe-name> --description "<desc>"

# 6. Spec-Ops 控制台全景检视
pnpm run spec:workflows
```

---

## ⚠️ 交付路径提醒（重要）

`.agents/skills/**` 被本仓库归类为 **maintainer-only**，**不进入运行时投递**——
放这里的指引不会自动到达员工 agent。要让员工真正读到，需落在投递路径上：

- 看板对话每次请求读 `skills/paperclip-board/SKILL.md`（改这里**即时**生效）。
- 仓库 `skills/` 目录由服务端解析进 adapter config，写到 `~/.hermes/skills`。
- 面向 PM/操作者的玩法说明放在 `docs-coolie/playbooks/spec-driven-dev.md`。

本 skill 是**给人看的权威定义**；要让它对 agent 生效，把要点同步进上面前两条路径。
