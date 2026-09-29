# WAVE140 — CMMI WBS 拆解 + 里程碑主线任务

- 日期: 2026-09-29
- wave: wave140（需求来源: boss 2026-09-28「coolie工坊系统中的任务，在项目初始化后，cmmi过程有个拆分wbs任务的过程，里程碑任务特别重要，主线任务」）
- 分支: `main`
- 设计记录: `doc/plans/2026-09-29-cmmi-wbs-milestone.md`
- 本报告: 交付结构 / 真验证据 / 缺口 / 发版

> 证据分级沿用仓库口径: **已实现且已验证** / **已实现但未验证** / **缺失**。

---

## 1. 交付结构（全部已实现）

### A) 数据 / 契约（已实现且已验证）

`issues` 增 4 列、`projects` 增 1 列，手写迁移 `9006_add_issue_wbs_milestone.sql`
（本 fork 上 `drizzle-kit generate` 跑不动 —— 0280/9000、9002/9003 snapshot 冲突，正是
9000 段的由来）。全部 additive、可空或常量默认，无回溯。

| 列 | 含义 |
|---|---|
| `issues.wbs_code` | 层级编号（`1` / `1.1` / `1.1.2`） |
| `issues.wbs_type` | `phase` / `work_package` / `task` |
| `issues.is_milestone` | 主线标记（默认 false） |
| `issues.milestone` (jsonb) | gate/status/计划+完成日期/判定人/判定证据/豁免 |
| `projects.wbs_draft` (jsonb) | 自动草案（待采纳） |

契约同步: `packages/shared`（constants / types / validators / 纯 wbs 模块）→ `server`
→ `ui` → `clients/api-client`。里程碑与 goal 的关联复用既有 `issues.goal_id`。

**门禁词汇表对齐仓库真实可执行方案**（`cmmi-profile.json` 的 `gate_g1_spec`…`gate_g5_release`，
6 个 `cmmi-*` 技能的 DoD + 生成的 `check-*.mjs`），**不是** brief 措辞里的「G1-G4」——
仓库里真实是 G1-G5。这是**与 brief 的一处有意差异**，已在 plan doc 与本节写明。

### B) 项目初始化 → 自动 WBS 拆解（已实现且已验证）

- 纯模块 `server/src/services/wbs-draft.ts`（无 I/O，时钟注入）: 六阶段
  （需求确认 → 架构/设计 → 详细设计 → 开发实现 → 测试验收 → 上线移交），
  每阶段至少一个工作包 + 一个收口里程碑；**需求确认阶段的工作包 = 文档解析出的建设目标**。
- 钩入既有异步 enrichment（`project-document-enrichment.ts`）: 上传需求文档后，除描述 +
  目标外再产出草案。约束: 10s 超时、失败静默、**幂等**（仅当无草案且无里程碑任务时才生成）。

### C) 里程碑 = 主线（已实现；Web 已验证，App 未真机驱动 — 见 §3）

- 共享纯逻辑 `packages/shared/src/wbs.ts`: WBS 数字排序、`buildWbsMainline`、
  `evaluateWbsGates`（门禁联动）。server / Web / App 读同一份派生结果。
- 服务端三路由: `GET/POST/DELETE …/projects/:projectId/wbs[/adopt|/draft]`。
- Web: 项目页「里程碑主线」Tab（草案卡片 + 六阶段时间线 + 受阻告警）、任务行「主线」徽章、
  「只看主线」筛选、项目头「N 个里程碑」证书。
- App: 项目中心展开面板「里程碑主线」、任务行「主线」标记、任务页「只看主线」chip。
- 门禁联动: 某阶段任务，若之前任一「带门禁阶段」的里程碑未达成且未豁免 → 默认受阻；
  豁免需留痕（`exempted` + `exemptionReason`，校验强制）。

### D) 沉淀（已实现）

- skill `.agents/skills/cmmi-wbs-milestone/SKILL.md`（force-add；`.agents/` 被 gitignore）。
- playbook `docs-coolie/playbooks/cmmi-wbs-milestone.md`（含真实 curl 用法，无凭据明文）。
- `scripts/scaffold-project-cmmi-skills.mjs` 注册新技能（6→7），真实 dry-run 已确认会
  生成 `.agents/skills/cmmi-wbs-milestone/SKILL.md` 到新项目。

---

## 2. 真验证据（对**运行中的本地实例**）

实例: `http://localhost:3100`（dev / local_trusted，PGlite）。代码 = 本 wave HEAD。

### 2.1 API 全链路（脚本 `docs-coolie/evidence/wave140/verify-wbs-api.sh`）

建项目 → 上传《产融…技术规范书》→ 触发草案 → 采纳 → 读主线:

```
== 3. WBS 草案 ==
  来源: 产融智能体应用系统技术规范书.txt | 节点数: 25 | 目标: [智能体应用平台标准功能, 系统配置,
        风险防控智能体, 风险预警, 经营管理智能体, 经营分析, 知识管理智能体, 知识检索]
     1 阶段   … · 需求确认阶段
   1.1 工作包 智能体应用平台标准功能
   …（1.1–1.8 为文档目标）…
   1.9 ★里程碑 需求确认收口里程碑  gate_g1_spec
     2 阶段   … · 架构/设计阶段   2.1 工作包  2.2 ★里程碑 … gate_g2_arch
     3 阶段   … · 详细设计阶段     3.1 工作包  3.2 ★里程碑 （无门禁）
     4 阶段   … · 开发实现阶段     4.2 ★里程碑 … gate_g3_compile
     5 阶段   … · 测试验收阶段     5.2 ★里程碑 … gate_g4_eval
     6 阶段   … · 上线移交阶段     6.2 ★里程碑 … gate_g5_release
== 4. 一键采纳 == created=25 milestones=6
== 5. 主线 == 门禁 0/5 已达成; 当前阶段 index=0; 受阻任务数: 15
```

采纳后 25 个任务（6 阶段 + 13 工作包 + 6 里程碑）真实落库；主线读回六阶段 + 门禁。

### 2.2 门禁联动动态验证

把 G1 里程碑（`1.9`）标 `achieved` 后：

```
before: blocked=15 | by: Counter({'1.9': 15})
G1 marked achieved
after:  blocked=12 | by: Counter({'2.2': 12})
```

15 → 12，受阻源从 G1 转移到 G2 的里程碑 —— 联动是动态、按顺序、可豁免的。

### 2.3 Web UI（Playwright 真点击，对同一实例）

脚本 `scripts/e2e/wave140-ui.mjs`（复用仓库已有 e2e 脚手架；本地未提交）。
断言 / 截图（PNG 仅本地，`screenshots/` 已 gitignore，不入库）:

| 截图 | 断言 |
|---|---|
| `screenshots/wave140/web-01-milestone-mainline.png` | 6 张阶段卡；门禁受阻告警可见 |
| `screenshots/wave140/web-02-wbs-draft.png` | 草案卡 + 6 个草案阶段块 |
| `screenshots/wave140/web-03-task-list-mainline-badge.png` | 任务列表「主线」徽章 = 6 |
| `screenshots/wave140/web-04-only-mainline-filter.png` | 打开筛选浮层勾选「只看主线」 |

页面实渲染文本（DOM 转写，等价于截图内容）:

```
里程碑主线 | 门禁 1/5 已达成 · 当前阶段: 架构/设计
需求确认 GATE_G1_SPEC 需求确认收口里程碑 已达成 | 架构/设计 GATE_G2_ARCH 未开始 |
详细设计 未开始 上游里程碑未达成 | 开发实现 GATE_G3_COMPILE 上游里程碑未达成 |
测试验收 GATE_G4_EVAL 上游里程碑未达成 | 上线移交 GATE_G5_RELEASE 上游里程碑未达成 |
12 个后续阶段任务因上游里程碑未达成而受阻
```

> **真验抓到并修掉一个真缺陷**：`/projects/:id/milestones` 路由虽注册在 React Router 面，
> 但 ProjectDetail 自身的 tab 解析与 URL 归一化不认这个 tab，URL 被改写并静默回退到
> `/issues`。真浏览器一跑就暴露。修复见 commit `fix(ui): make the 里程碑主线 project tab
> reachable …`。这正是「单元测试全绿但功能打不开」的典型 —— 靠真点击才抓到。

### 2.4 单测 / 静态检查

| 检查 | 结果 |
|---|---|
| `packages/shared/src/wbs.test.ts` | 8 passed（排序 / 门禁联动 / 豁免 / 主线） |
| `server/src/services/wbs-draft.test.ts` + `project-document-enrichment.test.ts` | 20 passed |
| `ui/src/lib/issue-filters.test.ts` | 16 passed（含 3 条新「只看主线」） |
| `pnpm -r typecheck` | 0 error（exit 0，全工作区） |
| `node scripts/check-fork-surface.mjs` | PASS（scaffold 改动 10/500 净行，在预算内） |
| `pnpm check:token-gates` | 4 gate 全 CLEAN（UI 纯 token，无裸 hex/px） |
| App 纯选择层 `selectIssues(..., mainline:true)` | 实跑：`all:a,b,c,d / 只看主线:a,c,d`（APP_SELECT_OK） |

---

## 3. 缺口（如实标注）

1. **App 未在真机/模拟器上驱动验证**（`已实现但未验证`）。模拟器 `emulator-5556` 在线，
   但上面装的是生产壳 `cloud.coolie.app 0.5.93`（固定 JS bundle，指向 prod）。本 wave 的
   App 改动是纯 JS，要看到它必须走**发版 / OTA** 这条路径本身 —— 因此 App 的**视觉**证据
   只能在发版后补。当前 App 面的证据是: typecheck 通过 + 纯选择层实跑通过 + 代码走查；
   **没有**主线段落的真机截图。最后一次「亲眼确认」只能由发版后的真机/掌柜完成。
2. **生产文档不是原件**。《产融…技术规范书》原件在生产实例上、未在本仓库；真验用了一份
   同结构（wave139 那种 `2.1 技术目标` / `2.3 系统功能` 扁平表）的等价文本文档
   `docs-coolie/evidence/wave140/产融智能体应用系统技术规范书.txt` 作为输入，**流程与产物
   形态一致**，但输入文本非生产原件。
3. **未在生产的真项目上复跑**。真验在本地实例完成（隔离、不影响生产数据）。若要求在
   生产那份文档所在项目上复跑，需要生产写权限，本次未执行。
4. 角色卡 / 治理表（`docs-coolie/CMMI-ROLE-CARDS.md`、`CMMI-ROLE-GOVERNANCE.md`）
   未加新技能条目 —— 属文档同步的小缺口，新技能已进 scaffold 与 skill 库。

---

## 4. 发版

（见本节末尾「结果」——在发版执行后回填。）

- 目标版本: **0.5.94**（`app.json` 0.5.93 → 0.5.94，versionCode 594；patch bump，
  当前生产为 0.5.93）。
- App: `scripts/release-app.sh 0.5.94 "<notes>"`（全量发版；含 DS 门禁 / 干净树 /
  APK 构建 / COS / version.json / OTA / 服务端同步）。
- Server: `scripts/deploy-coolie.sh`（加固部署；护栏 = 部署前后 `version.json` 与
  `ota/manifest` 200 + `/api/health`）。

### 结果

待发版执行后回填。
