---
name: cmmi-wbs-milestone
description: >-
  CMMI 项目工作分解结构 (WBS) 与里程碑主线管理。在项目初始化 / 立项、需求文档
  上传后，把项目拆成 CMMI 阶段 → 工作包 → 收口里程碑的层级任务树，让里程碑作为
  主线贯穿 G1-G5 门禁。当掌柜/项目负责人要「拆 WBS」「排里程碑」「看项目处在哪个
  阶段」「哪些后续任务被上游门禁卡住」时使用；也用于解释/调整平台自动生成的 WBS
  草案。与 cmmi-req-spec / cmmi-tech-solution / cmmi-detailed-contracts /
  cmmi-ver-val / cmmi-immutable-release / cmmi-car-spc-metrics 衔接，为它们各自的
  门禁交付物提供任务骨架。
---

# CMMI WBS 与里程碑主线

> **门禁对应**: 贯穿 G1–G5（策划 PP / 监控 PMC 两个过程域的实现）
> **主责工匠角色**: 掌柜 / 项目负责人（PM）；Hermes 调度与风控助理协同
> **平台落点**: 平台一等公民能力 —— 见第 6 节「平台落地」的 API 与 UI 路径

## 1. 目的

在一个项目初始化（立项 + 需求文档落地）之后，把「这个项目要做什么」拆成一张
可执行、可跟踪的层级任务树：**阶段（phase）→ 工作包（work_package）→ 任务（task）**，
并在每个阶段的收口处放一个 **里程碑（milestone）**。里程碑是主线 —— 它回答：

- 项目现在处在哪个阶段？
- 下一个必须跨过的门禁是什么？
- 哪些后续阶段的工作正被一个未达成的上游里程碑卡着？

## 2. 何时使用

- 新项目立项、需求文档刚上传，需要产出 WBS 草案。
- 项目推进中要新增/调整阶段、工作包或里程碑。
- 交付例会要看「主线走到哪了」「门禁状态」。
- 有人问「为什么第 4 阶段的任务一直不动」——先看是不是被 G2 门禁卡住。

## 3. 输入

| 输入 | 来源 | 必需 |
|---|---|---|
| 项目 | 平台 `projects`（`GET /projects/:id`） | 是 |
| 需求文档 | 项目 `coolie-docs/` 下已上传的规范书 | 建议 |
| 建设目标 / 范围 | 文档解析产出的 `goals`（`project_goals`） | 建议 |
| CMMI 门禁定义 | `cmmi-profile.json` 的 `gates`（`gate_g1_spec`…`gate_g5_release`） | 是 |

## 4. 拆解规则

### 4.1 顶层六阶段（固定，来自平台 CMMI 阶段模板）

| # | 阶段 | 收口门禁 |
|---|---|---|
| 1 | 需求确认 | `gate_g1_spec` (G1) |
| 2 | 架构/设计 | `gate_g2_arch` (G2) |
| 3 | 详细设计 | —（设计域中间检查点，无独立门禁） |
| 4 | 开发实现 | `gate_g3_compile` (G3) |
| 5 | 测试验收 | `gate_g4_eval` (G4) |
| 6 | 上线移交 | `gate_g5_release` (G5) |

### 4.2 WBS 编号

层级编号用点分数字：阶段 `1`、工作包 `1.1`、里程碑 `1.2`（一个阶段下先列工作包，
里程碑排在最后）。排序按数字逐段比较（`1.2` 在 `1.10` 之前）。

### 4.3 里程碑 = 阶段收口

每个阶段收口生成**恰好一个**里程碑任务：
- 标题：`<阶段名>收口里程碑`；
- `milestone.gate` = 该阶段对应门禁（详细设计阶段为 `null`）；
- 验收标准占位 = 该阶段模板里的验收断言（详见平台 `CMMI_WBS_PHASES`）；
- 状态 `not_started`，日期/判定人/证据留空，采纳后由负责人补全。

### 4.4 工作包来源

**需求确认阶段**的工作包用文档解析出的建设目标（每个目标一个工作包），让 WBS 真正
反映这份文档；其余阶段各生成一个「<阶段名>阶段工作包」，后续由负责人细化。

### 4.5 草案，不静默建任务

自动拆解只产出**草案**（`projects.wbs_draft`），必须由掌柜/项目负责人**一键采纳**
才物化为真实任务。这是硬约束：不静默乱建任务。

## 5. 门禁判据（里程碑如何算达成）

一个里程碑算「已达成」当且仅当 `milestone.status = achieved`（或显式豁免：
`exempted = true` 且 `exemptionReason` 非空）。

**门禁联动（默认受阻）**：某阶段的任务，若其**之前任一「带门禁阶段」的里程碑**
存在且未达成、未豁免，则该任务默认 **受阻**（`blocked`）并告警。豁免必须留痕
（`exempted` + `exemptionReason`），否则视为未豁免。

> 注意：只在「能看到该里程碑」时才会卡住 —— 里程碑不存在（未采纳/部分拉取）不构成阻塞，
> 避免把「没数据」误报成「被卡住」。

## 6. 平台落地（怎么真的做）

**API**（`server` 已实现）:
- `GET  /api/companies/:companyId/projects/:projectId/wbs`
  → `{ draft, mainline, gateStates }`（主线 + 各任务门禁状态）
- `POST /api/companies/:companyId/projects/:projectId/wbs/adopt`（幂等物化草案）
- `DELETE /api/companies/:companyId/projects/:projectId/wbs/draft`（忽略草案）

**触发**：上传需求文档后，异步 enrichment 在补描述/目标的同时产出 WBS 草案
（10s 超时、失败静默、同项目不重复建）。

**UI**：
- Web 项目页 →「里程碑主线」Tab：草案卡片（采纳/忽略）+ 六阶段时间线 + 门禁受阻告警；
  任务列表有「主线」徽章与「只看主线」筛选。
- App 项目中心展开面板 →「里程碑主线」；任务页有「主线」标记与「只看主线」筛选。

**数据结构**：`issues.wbs_code` / `wbs_type` / `is_milestone` / `milestone`(jsonb)；
`projects.wbs_draft`(jsonb)。里程碑与目标的关联走既有 `issues.goal_id`。

## 7. 常见错误

1. **把里程碑当普通任务** —— 里程碑是门禁判定的锚点，不派给工程师当工作量任务；
   它是「这一阶段做完了、门禁过了」的记号。
2. **跳过阶段** —— 六个顶层阶段是 CMMI 生命周期，不要为省事关掉中间阶段，
   否则门禁顺序失去意义。
3. **里程碑未达成却不留痕就往下走** —— 要么把上游里程碑补达成，要么显式豁免并写原因；
   「口头说没事」会在下次复盘中反咬。
4. **重复拆解** —— 一个项目只应有一份 WBS；重新上传文档不会重建（幂等保护）。
   要重来先忽略旧草案、并明确处理已有的里程碑任务。
5. **把工作包写成一个阶段** —— 工作包是可交付/可估工的小块，不是「开发阶段」这种大词。
6. **门禁绑错** —— G1=需求、G2=架构、G3=静态编译、G4=验收、G5=投产；别把验收绑到 G2。

## 8. 与 cmmi-* 技能的衔接

WBS 是骨架，各门禁交付物是骨架上的肉：

| 阶段收口 | 门禁 | 交付物 / 负责技能 | 主责角色 |
|---|---|---|---|
| 需求确认 | G1 | `docs/cmmi/01-srs.md` — `cmmi-req-spec` | `emp_ds` |
| 架构/设计 | G2 | `docs/cmmi/02-hld.md` — `cmmi-tech-solution` | `emp_fda` |
| 开发实现 | G3 | `docs/cmmi/03-lld-api.md` — `cmmi-detailed-contracts` | `emp_swe` |
| 测试验收 | G4 | `docs/cmmi/04-test-report.md` — `cmmi-ver-val` | `emp_fdse` |
| 上线移交 | G5 | `docs/cmmi/05-deploy-sop.md` — `cmmi-immutable-release` | `emp_sre` |
| 持续 | — | `docs/cmmi/06-spc-metrics.md`, `07-car-prevention.md` — `cmmi-car-spc-metrics` | `emp_hermes` |

**用法**：里程碑的「判定证据」应指向对应阶段的门禁交付物或门禁命令输出
（如 G3 的 `node scripts/check-contracts.mjs` 退出码 0）。

## 9. Definition of Done

- [ ] 六阶段齐全，每个阶段恰好一个收口里程碑。
- [ ] 每个里程碑绑定了正确的 `gate`（详细设计阶段可为空）。
- [ ] 工作包大小可估工，需求确认阶段的工作包对应文档目标。
- [ ] 草案路径下：未采纳前不产生真实任务；幂等（同项目不重复建）。
- [ ] 门禁联动可验证：上游里程碑未达成时，后续阶段任务被标受阻（或显式豁免并留痕）。
