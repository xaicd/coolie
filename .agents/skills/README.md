# Coolie 数字员工技能注册表与 CMMI 00~09 阶段化装配规范

> **最高法典契约**：数字员工接到跨阶段需求时先读本注册表，按 CMMI 00~09 阶段严格加载专属 Skills 与输出规范工程资产，严禁跳过门禁宣称完成。  
> **新 Skill 纪律**：本目录受 `.gitignore` 保护，新增技能必须执行 `git add -f .agents/skills/<name>/SKILL.md` 强制纳管。

---

## 一、 CMMI 00~09 全生命周期阶段化装配矩阵 (Stage-based Skills Matrix)

| CMMI 截断阶段 | 交付核心目标 | 主责数字员工 | 核心专属 Skills | 关键实体产物 | 未过门禁严禁进入 (阻断条件) |
|---|---|---|---|---|---|
| **00 规范与元编程** | 技能标准定义与自动化测评 | 墨斗 (FDA) | `skill-authoring`<br>`skill-creator` | 标准 SKILL.md、技能基准测评报告 | 格式不合法、未过测评严禁入仓 |
| **01_management 决策与立项** | 竞品横评、DAR 加权决策与 WBS 拆解 | 墨斗 (FDA)<br>百晓生 (DS) | `cmmi-asset-authoring`<br>`dar-decision-matrix`<br>`solution-scouting-and-dar`<br>`cmmi-wbs-milestone`<br>`product-project-intake` | `docs/01_management/` (project-charter.md, project-plan.md, rskm-risk-ledger.md, DAR-*.md, phase-configuration-management.md) | 拍脑袋盲目选型、未完成技术选型与工作分解严禁开工 |
| **02_requirements 需求工程** | EARS 5 态无歧义需求与全链路跟踪 | 百晓生 (DS)<br>Hermes | `cmmi-asset-authoring`<br>`ears-spec-writer`<br>`cmmi-req-spec`<br>`requirements-capture`<br>`spec-driven-dev` | `docs/02_requirements/` (software-requirements.md, requirements-traceability-matrix.md, non-functional-reqs.md, user-requirements.md)<br>`docs/specs/<domain>/<feature-slug>/` | 口语化伪需求、缺少 EARS 验收标准严禁编码 |
| **03_design 架构设计** | 总体拓扑、MADR 架构决策与统一契约 | 墨斗 (FDA)<br>铁匠 (CoreSWE) | `cmmi-asset-authoring`<br>`cmmi-tech-solution`<br>`cmmi-detailed-contracts`<br>`adr-architect`<br>`archify`<br>`system-design-spec` | `docs/03_design/` (ADR-*.md, architecture-design-hld.md, database-design-erd.md, interface-contracts/, api-specifications.md) | 跨域直接 import、手写未隔离 SQL 与无契约 Route 严禁通过 G2/G3 |
| **04_implementation 编码实现** | 第一方插件化、领域模型驱动与状态机 | 铁匠 (CoreSWE) | `cmmi-asset-authoring`<br>`core-swe`<br>`swe-delivery-flow`<br>`mutation-tester`<br>`bug-fix-flow`<br>`mcp-builder` | `docs/04_implementation/` (coding-standards.md, mutation-testing-guide.md, plugin-blueprint.md, software-bill-of-materials.md) | 跳过 Validator 直调、缺乏类型守卫严禁合入 |
| **05_verification 变异测试** | 反假 Mock、变异测试打假与全栈验收 | 门神 (FDSE)<br>百晓生 (DS) | `cmmi-asset-authoring`<br>`cmmi-ver-val`<br>`mutation-tester`<br>`comprehensive-testing-workflow`<br>`qa-humanlike-e2e`<br>`agent-device-browser-automation` | `docs/05_verification/` (test-plan.md, test-summary-report.md, mutation-report.md, uat-acceptance-certificate.md) | 假 Mock、空断言、绿牌作弊严禁通过 G4 验收门禁 |
| **06_quality_assurance 质量门禁** | 全生命周期配置审计与 SPC 缺陷预防 | 门神 (FDSE)<br>Hermes | `cmmi-asset-authoring`<br>`cmmi-car-spc-metrics`<br>`check-governance` | `docs/06_cmmi_audit/` (spc-control-chart.md, car-5whys-rca.md, audit-trail.md, gate-trace-record.md) | 门禁未跑通、存在 Blocker/High 债务严禁宣称完工 |
| **07_release 容器交付** | 不可变投产、版本一致性与秒级回滚 | 兜底渊 (SRE) | `cmmi-asset-authoring`<br>`cmmi-immutable-release`<br>`app-release-pipeline`<br>`sre-release-and-deploy`<br>`release-flow`<br>`release-version-sync` | `docs/07_release/` (system-deployment-sop.md, rollback-emergency-plan.md, RELEASE_NOTES_*.md, release-verification-checklist.md) | 生产环境指纹漂移、版本号不一致严禁放行 G5 |
| **08_sre 可靠性保障** | SLI/SLO 告警矩阵、安全红队与免责复盘 | 兜底渊 (SRE) | `cmmi-asset-authoring`<br>`sre-slo-manager`<br>`postmortem-analyzer`<br>`strix-penetration-testing`<br>`pre-sre` | `docs/08_sre/` (01_slo_sli_metrics/SLO-SLI-ERROR-BUDGET-MATRIX.md, disaster-recovery-plan.md, 02_postmortem/POSTMORTEM-*.md, strix-penetration-report.md) | 盲目裸跑发版、事故未闭环 CAPA 严禁关闭工单 |
| **09_operations 持续运营** | 资金守恒、日终平账与多租户治理 | 百晓生 (DS)<br>掌柜 (CEO) | `cmmi-asset-authoring`<br>`financial-reconciliation-agent`<br>`ceo-company-ops`<br>`finance-budget-guard`<br>`agent-device-browser-automation` | `docs/09_operations/` (tenant-governance.md, agent-operations-ledger.md, system-inspection-report.md, 02_financial_reconciliation/RECONCILIATION-*.md) | 资金不守恒、账实不符、违规提现抹账一票否决 |
| **01~09 全生命周期** | CMMI 标准资产脚手架与反造假健康扫描 | 墨斗 (FDA) | `cmmi-asset-authoring` | 全生命周期 26 类标准过程资产、目录拓扑规范 | 散落孤儿文档、伪造假 Demo |

---

## 二、 用户意图与技能快速激活矩阵

| 当前工作场景 | 必开专属 Skills 组合 |
|---|---|
| **重大技术选型 / 竞品横评 / 技术路线决策打分** | `dar-decision-matrix`, `solution-scouting-and-dar` |
| **CMMI 01~09 标准资产创建 / 全生命周期作业 SOP** | `cmmi-asset-authoring`, `dar-decision-matrix`, `cmmi-req-spec` |
| **Kiro SDD 工作流编排 / 多智能体自主执行** | `spec-driven-dev`, `cmmi-asset-authoring` |
| **编写新需求规格 / 消除二义性 / 拟定验收标准** | `ears-spec-writer`, `cmmi-req-spec`, `requirements-capture` |
| **项目立项 / 拆解 WBS / 里程碑主线排班** | `cmmi-wbs-milestone`, `product-project-intake` |
| **架构总体设计 / 编写 ADR 决策 / 领域边界划分** | `cmmi-tech-solution`, `adr-architect`, `system-design-spec` |
| **绘制交互式架构全景图 / 业务流程图 / 状态机** | `archify` |
| **详细设计 / 统一 API 契约协议 / 数据模型 ERD** | `cmmi-detailed-contracts` |
| **业务核心开发 / 模块边界 / 静态守卫防御** | `core-swe`, `swe-delivery-flow`, `spec-driven-dev` |
| **缺陷排查与最小化修复** | `bug-fix-flow`, `swe-delivery-flow` |
| **MCP 工具扩展与调度开发** | `mcp-builder`, `coolie-mcp-orchestration` |
| **端到端测试 / 变异测试打假 (杀灭假 Mock)** | `cmmi-ver-val`, `mutation-tester`, `comprehensive-testing-workflow`, `qa-humanlike-e2e` |
| **移动端/Web 真机自动化测试与长效巡检运营** | `agent-device-browser-automation`, `comprehensive-testing-workflow`, `qa-humanlike-e2e` |
| **高管全生命周期治理门禁审计** | `check-governance`, `cmmi-car-spc-metrics` |
| **平台版本发布 / APK 打包 / 7 处版本号一致性** | `app-release-pipeline`, `sre-release-and-deploy`, `release-version-sync`, `cmmi-immutable-release` |
| **SRE 稳定度管理 / SLO/SLI 矩阵 / 多燃烧率告警** | `sre-slo-manager`, `pre-sre` |
| **线上故障免责复盘 / 5-Whys 根本原因溯源** | `postmortem-analyzer` |
| **自主红队渗透测试 / 安全漏洞验证与修复** | `strix-penetration-testing` |
| **财务与业务对账 / 资金轧差平账 / 日终对账** | `financial-reconciliation-agent`, `finance-budget-guard` |
| **掌柜视角经营大盘 / 公司建制与停复工** | `ceo-company-ops` |

---

## 三、 OpenWiki (LLM-Wiki / RFC 8615) 知识大脑自愈同步

为彻底解决 AI 数字员工全盘盲搜消耗海量 Token 及静态文档口径打架的行业痛点，Coolie 全面吸纳并轨 `ruoyi-all-next` 的 **OpenWiki (LLM-Wiki) 自动化提取与动态同步引擎**：

1. **唯一动态自愈知识大脑 (`wiki/`)**：
   - `wiki/index.md`：专供 AI Agent 首屏检索的机器可读架构与 17 领域维基大纲；
   - `wiki/stages/`：CMMI 00~09 全生命周期阶段交付标准与技能路由词条；
   - `wiki/domains/`：业务领域活体孪生维基（包含 Facade 接口契约、表模型与鉴权策略）；
   - `wiki/architecture/`：核心架构支柱、Kiro 工作流编排与物理隔离规约；
   - `wiki/gotchas/`：高频排障与防踩坑实录。
2. **零漂移自动化守卫 (Zero Doc Drift)**：
   - `npm run openwiki:sync`：从底层实体、元数据与契约自动化编译生成全量 28 篇 Wiki 词条；
   - `npm run openwiki:check`：门禁硬校验，发现任何文档滞后或漂移立即阻断 CI。
3. **数字员工 OpenWiki First 铁律**：
   - 任何数字员工接单进场，优先阅读 `wiki/index.md`，Token 消耗降低 80%！

---

## 四、 Kiro SDD 原生多智能体工作流引擎与配方体系 (`.agents/workflows`)

1. **配方物理单一真源与软链接无缝桥接**：
   - 单一真源存放于 `.agents/workflows/*.workflow.json`；
   - 由根目录 `.kiro/workflows` 软链接无缝桥接，Kiro IDE 与外部 Agent 零门槛识别。
2. **4 大内置工作流配方**：
   - 📦 `feature-delivery.workflow.json`：全生命周期新特性交付
   - 🐛 `bugfix.workflow.json`：缺陷排查与红绿验证 (5-Whys + Red-to-Green)
   - 🏛️ `architecture-refactor.workflow.json`：架构债务消除与渐进重构
   - 🛡️ `security-patch.workflow.json`：安全加固与 PoC 红蓝对抗拦截
3. **工作流标准 CLI 指令集**：
   - `pnpm run workflow:list`：检视全量配方与参数
   - `pnpm run workflow:check`：静态语法与 DAG 依赖无环性校验
   - `pnpm run workflow:dry-run`：模拟代换展开与 Mermaid 拓扑预览
   - `pnpm run workflow:run`：驱动脚手架执行并记录工作流流水
   - `pnpm run workflow:new`：脚手架快速生成新配方模板
   - `pnpm run spec:workflows`：在 Spec-Ops 控制台全景检视配方

---

## 五、 上游边界与引入纪律

### 1. 上游保留边界
`check-pr` / `release` / `release-changelog*` / `garden-inbox` / `pr-*` / `prepare-paperclip-pr` / `terminal-bench-loop` / `doc-maintenance` / `deal-with-security-advisory` / `company-creator` / `create-*` / `paperclip-*` / `diagnose-why-work-stopped` 等 20 个来自 **upstream** (`master` 分支也有) — 不删不改，动了会撞 fork-sync。

### 2. 引入政策 (wave285 教训)
1. 其他机器 (aja-pc/cwall) 的 **定制 skills 不引入** — 它们内嵌对方的环境绑定 (主机名/镜像/镜像同步路径)，搬过来就是双源漂移；
2. 确有通用的**思想**值得学 → 基于 coolie 自己的栈重写，不复制文档；
3. 引入前查重：先 `ls .agents/skills/` + 本索引比对职责，再决定；
4. 引入后回填：更新本索引 + `docs-coolie/EMPLOYEE-SKILLS.md` 装配矩阵。


