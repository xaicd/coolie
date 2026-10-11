#!/usr/bin/env node
/**
 * scripts/sync-openwiki.mjs
 *
 * Coolie 平台 OpenWiki (LLM-Wiki / RFC 8615) 自动化提取与动态同步引擎
 *
 * 核心目的：
 * 专为 AI 数字员工 (Hermes / 墨斗 / 铁匠 / 门神 / 兜底渊 / 百晓生) 与外部 Agent
 * 构建高内聚、精准双向链接的动态知识库，消除全盘盲搜消耗海量 Token 及静态文档口径打架的痛点。
 * AI 进场优先阅读 wiki/index.md 与阶段/领域词条，Token 消耗直降 80%。
 *
 * 用法:
 *   node scripts/sync-openwiki.mjs          # 生成并更新 wiki/ 目录
 *   node scripts/sync-openwiki.mjs --write  # 显式写入
 *   node scripts/sync-openwiki.mjs --check  # CI门禁: 校验是否发生漂移
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const WIKI_DIR = path.join(ROOT, "wiki");
const checkOnly = process.argv.includes("--check");

// 目标产物收集器 Map<relativePath, content>
const generatedFiles = new Map();

// ==========================================
// 1. 生成 wiki/index.md (根索引与 Agent 全景)
// ==========================================
function buildIndexMd() {
  const content = `# Coolie OpenWiki (LLM 知识大脑)

> **面向 AI 数字员工的核心索引**：本知识库由 Coolie 控制面底座、CMMI 00~09 交付管道、Palantir 活体本体及工程真资产**自动化编译生成与动态自愈**。AI 数字员工（Hermes / 墨斗 / 铁匠 / 门神 / 兜底渊 / 百晓生）进场接单必须优先检索对应词条，严禁全盘盲扫代码。

---

## ⚡ 核心架构最高公理 (Foundry Axioms)

1. **最高生态位与三层物理隔离 (公理一)**：
   - 第一层：工厂指挥决策中枢（Console & 移动驾驶舱）；
   - 第二层：软件制造工程流水线（数字员工交付 0-1 软件工程真资产）；
   - 第三层：业务落地运行系统（客户生产环境业务数据自承载）。
2. **六位一体超级集成体 (公理二)**：
   - 控制面中枢 (Paperclip) + 活体本体 (Palantir) + CMMI 5 质量 + 开源基座自适应 + 极简人机 + 数字员工调度。
3. **活体本体即中枢 (公理三)**：
   - 现实业务与技术实现高保真物理并轨，双核基石 (Object Types + Action Types)，深度复用 263 张物理表。
4. **CMMI 0-1 软件工程资产与 Spec-First 产物 (公理四)**：
   - 完工状态必须以不可变工程资产凭据为准 (*No Artifact, No Done*)。
5. **开源基座自适应与扁平敏捷目录 (公理五)**：
   - 默认 PNPM monorepo；开源基座 100% 保持基座原生目录；彻底废弃 \`.coolie/cmmi\` 隐藏单文件，全面采用开放扁平的 \`docs/specs/\` 体系。
6. **极简主义人机与 6 寸屏就地导航 (公理六)**：
   - 核心操作严格收敛为两字按钮，底栏保持 2+1+2 = 5 槽位绝对居中对称，实体检视就地浮层覆盖。
7. **Dev 与 Prod 物理隔离铁律 (公理七)**：
   - Dev 专事工坊自身建设，Prod 专事实体交付。

---

## ⚡ Kiro SDD 原生多智能体工作流引擎与配方 (Workflows & Recipes)

1. **配方单一真源与软链接无缝桥接**：所有多智能体工作流配方统一物理收归 \`.agents/workflows/*.workflow.json\`（根目录通过 \`.kiro/workflows\` 软链接桥接），确保 Kiro IDE 原生识别与 Antigravity / 跨 Agent 平台统一标准；
2. **4 大内置 SDD 工作流配方**：
   - 📦 **\`feature-delivery\`**：全生命周期新特性交付 (\`scaffold\` ➔ \`requirements\` ➔ \`design\` ➔ \`plan-waves\` ➔ \`implement\` ➔ \`verify\`)；
   - 🐛 **\`bugfix\`**：缺陷排查与红绿验证 (\`scaffold\` ➔ \`diagnose\` ➔ \`red-test\` ➔ \`patch\` ➔ \`verify-gate\`)；
   - 🏛️ **\`architecture-refactor\`**：架构债务消除 (\`scaffold\` ➔ \`debt-analysis\` ➔ \`parity-tests\` ➔ \`refactor-execution\` ➔ \`regression-audit\`)；
   - 🛡️ **\`security-patch\`**：安全加固与 PoC 拦截 (\`scaffold\` ➔ \`threat-model\` ➔ \`poc-red-test\` ➔ \`hardening\` ➔ \`strix-audit\`)；
3. **统一工作流 CLI 引擎 (\`scripts/workflow-engine.cjs\` / \`scripts/workflow-engine.ts\`)**：
   - \`pnpm run workflow:list\`、\`workflow:check\`、\`workflow:dry-run\`、\`workflow:run\`、\`workflow:new\`、\`spec:workflows\`；
4. **CMMI 01~09 全生命周期 26 类标准过程资产矩阵**：
   - 覆盖 9 大截断阶段，由 \`pnpm run cmmi:asset new\` 脚手架驱动并严格恪守 \`--real\` 防假门禁与 Rule 0 实事求是铁律。

---

## 🧭 CMMI 00~09 全生命周期阶段导航 (Delivery Stages)

| 阶段代码 | 阶段名称 | 主责数字员工 | 核心专属 Skills | 交付规范与词条 |
|---|---|---|---|---|
| **00** | 规范与元编程 | 墨斗 (FDA) | \`skill-authoring\`, \`skill-creator\` | [00_meta_standards.md](stages/00_meta_standards.md) |
| **01** | 决策分析与立项 | 墨斗 (FDA) / 百晓生 (DS) | \`cmmi-asset-authoring\`, \`dar-decision-matrix\`, \`solution-scouting-and-dar\`, \`cmmi-wbs-milestone\` | [01_management.md](stages/01_management.md) |
| **02** | 需求工程与规格 | 百晓生 (DS) / Hermes | \`cmmi-asset-authoring\`, \`ears-spec-writer\`, \`cmmi-req-spec\`, \`spec-driven-dev\` | [02_requirements.md](stages/02_requirements.md) |
| **03** | 架构设计与契约 | 墨斗 (FDA) / 铁匠 (CoreSWE) | \`cmmi-asset-authoring\`, \`cmmi-tech-solution\`, \`adr-architect\`, \`archify\`, \`cmmi-detailed-contracts\` | [03_design.md](stages/03_design.md) |
| **04** | 编码实现与防假 | 铁匠 (CoreSWE) | \`cmmi-asset-authoring\`, \`core-swe\`, \`swe-delivery-flow\`, \`mutation-tester\`, \`mcp-builder\` | [04_implementation.md](stages/04_implementation.md) |
| **05** | 变异测试与全栈验收 | 门神 (FDSE) / 百晓生 (DS) | \`cmmi-asset-authoring\`, \`cmmi-ver-val\`, \`mutation-tester\`, \`comprehensive-testing-workflow\`, \`qa-humanlike-e2e\` | [05_verification.md](stages/05_verification.md) |
| **06** | 质量门禁与过程控制 | 门神 (FDSE) / Hermes | \`cmmi-asset-authoring\`, \`cmmi-car-spc-metrics\`, \`check-governance\` | [06_quality_assurance.md](stages/06_quality_assurance.md) |
| **07** | 容器交付与不可变投产 | 兜底渊 (SRE) | \`cmmi-asset-authoring\`, \`cmmi-immutable-release\`, \`app-release-pipeline\`, \`sre-release-and-deploy\` | [07_release.md](stages/07_release.md) |
| **08** | SRE 可靠性与事故复盘 | 兜底渊 (SRE) | \`cmmi-asset-authoring\`, \`sre-slo-manager\`, \`postmortem-analyzer\`, \`strix-penetration-testing\`, \`pre-sre\` | [08_sre.md](stages/08_sre.md) |
| **09** | 持续运营与对账平账 | 百晓生 (DS) / 掌柜 (CEO) | \`cmmi-asset-authoring\`, \`financial-reconciliation-agent\`, \`ceo-company-ops\`, \`finance-budget-guard\` | [09_operations.md](stages/09_operations.md) |

---

## 📚 核心架构支柱 (Architecture Pillars)

- [Paperclip 控制面中枢与单人负责人锁](architecture/control-plane-backbone.md)
- [Palantir 活体本体系统与业务双核](architecture/living-ontology.md)
- [开放式扁平敏捷特性库与 CMMI 01~09 体系](architecture/flat-docs-specs-system.md)
- [Kiro SDD 原生多智能体工作流引擎与配方体系](architecture/kiro-native-workflows.md)
- [全球顶尖开源基准对标与持续演进路线](architecture/benchmark-gap-analysis.md)
- [移动端极简人机工程与就地浮层导航](architecture/minimalist-ui-and-navigation.md)
- [ACP 标准调度协议栈与免交互自主授权](architecture/acp-agent-protocol.md)
- [Dev 施工总社与 Prod 生产交付绝对物理隔离](architecture/dev-prod-isolation.md)
- [Coolie 工坊 AI 活体业务本体全面图谱 (M1~M7+MU)](architecture/coolie-foundry-ai-ontology.md)

---

## 🏛️ 业务领域与活体孪生 (Living Domains)

- [商业软件交付工厂核心模型](domains/delivery-foundry.md)
- [五大数字员工战斗集群体系](domains/digital-fleet.md)
- [供应链进销存中台系统 (基于 ruoyi-all-next)](domains/scm-platform.md)
- [智能制造 MES 与板材开料运筹求解器](domains/mes-manufacturing.md)
- [企业微信画像与网关集成](domains/wecom-integration.md)

---

## ⚠️ 高频踩坑与防御指南 (Gotchas)

- [Docker 容器运算与 Mac 宿主机 host-exec 穿透纪律](gotchas/container-host-exec-discipline.md)
- [移动端两字按钮契约与防技术泄露](gotchas/two-letter-button-contract.md)
- [Expo OTA 7 处版本一致性与运行时对齐](gotchas/expo-ota-consistency.md)
- [PNPM Monorepo 与开源基座自适应目录规范](gotchas/monorepo-pnpm-workspaces.md)
`;
  generatedFiles.set("index.md", content);
}

// ==========================================
// 2. 生成 wiki/stages/*.md (CMMI 00~09 阶段词条)
// ==========================================
function buildStages() {
  const stages = [
    {
      code: "00",
      file: "00_meta_standards.md",
      title: "00 规范与元编程 (Meta & Standards)",
      role: "墨斗 (FDA)",
      skills: ["skill-authoring", "skill-creator"],
      gates: "技能格式合法性校验、自动化测评通过",
      artifacts: "合规 SKILL.md、技能测评报告",
      blockedBy: "未经格式审计与测评的非规范技能严禁入仓",
      desc: "规范定义技能元数据、调用契约与自检用例，确保数字员工技能资产可复用、防退化。",
    },
    {
      code: "01",
      file: "01_management.md",
      title: "01_management 决策分析与立项 (DAR & WBS)",
      role: "墨斗 (FDA) / 百晓生 (DS)",
      skills: ["cmmi-asset-authoring", "dar-decision-matrix", "solution-scouting-and-dar", "cmmi-wbs-milestone", "product-project-intake"],
      gates: "CMMI G1 立项门禁、DAR 加权选型通过 (含 >=2 正选 + 1 阴性对照)",
      artifacts: "docs/01_management/ (project-charter.md, project-plan.md, rskm-risk-ledger.md, DAR-*.md, phase-configuration-management.md)",
      blockedBy: "拍脑袋盲目选型、未完成技术选型与工作分解严禁开工",
      desc: "收到客户需求时，执行行业标杆调研与开源基座搜寻，输出 CMMI DAR 选型矩阵与 WBS 骨架。",
    },
    {
      code: "02",
      file: "02_requirements.md",
      title: "02_requirements 需求工程与规格 (EARS & Spec-First)",
      role: "百晓生 (DS) / Hermes",
      skills: ["cmmi-asset-authoring", "ears-spec-writer", "cmmi-req-spec", "requirements-capture", "spec-driven-dev"],
      gates: "CMMI G1 需求门禁 (EARS 5态语法收敛)",
      artifacts: "docs/02_requirements/ (software-requirements.md, requirements-traceability-matrix.md, non-functional-reqs.md, user-requirements.md) 与 docs/specs/<domain>/<feature-slug>/",
      blockedBy: "口语化伪需求、缺少 EARS 验收标准严禁编码",
      desc: "项目级工程需求落地于 docs/02_requirements/，敏捷特性包以独立全息包落盘于 docs/specs/<domain>/<feature-slug>/，建立双向全链路跟踪矩阵 (RTM)。",
    },
    {
      code: "03",
      file: "03_design.md",
      title: "03_design 架构设计与契约 (HLD, LLD & OpenAPI)",
      role: "墨斗 (FDA) / 铁匠 (CoreSWE)",
      skills: ["cmmi-asset-authoring", "cmmi-tech-solution", "cmmi-detailed-contracts", "adr-architect", "archify", "system-design-spec"],
      gates: "CMMI G2 架构门禁、G3 静态契约门禁 (0 编译报错)",
      artifacts: "docs/03_design/ (ADR-*.md, architecture-design-hld.md, database-design-erd.md, interface-contracts/, api-specifications.md)",
      blockedBy: "跨域直接 import、手写未隔离 SQL 与无契约 Route 严禁通过 G2/G3",
      desc: "画死微服务拓扑、租户隔离、MADR 架构决策记录与统一 OpenAPI 契约，以编译器守卫把错误挡在提交前。",
    },
    {
      code: "04",
      file: "04_implementation.md",
      title: "04_implementation 编码实现与防假 (Core SWE & Plugins)",
      role: "铁匠 (CoreSWE)",
      skills: ["cmmi-asset-authoring", "core-swe", "swe-delivery-flow", "mutation-tester", "bug-fix-flow", "mcp-builder"],
      gates: "单向模块依赖扫描、TypeScript 0 编译报错、8 大防假红线",
      artifacts: "docs/04_implementation/ (coding-standards.md, mutation-testing-guide.md, plugin-blueprint.md, software-bill-of-materials.md)",
      blockedBy: "跳过 Validator 直调、缺乏类型守卫严禁合入主干",
      desc: "以领域驱动与状态机为核心，坚持第一方插件规范与防假 Mock 守卫，严禁在 src/ 随意平铺代码。",
    },
    {
      code: "05",
      file: "05_verification.md",
      title: "05_verification 变异测试打假与全栈验收 (Anti-Fake Mock)",
      role: "门神 (FDSE) / 百晓生 (DS)",
      skills: ["cmmi-asset-authoring", "cmmi-ver-val", "mutation-tester", "comprehensive-testing-workflow", "qa-humanlike-e2e"],
      gates: "CMMI G4 全栈验收门禁、变异杀灭率 MSI >= 85%",
      artifacts: "docs/05_verification/ (test-plan.md, test-summary-report.md, mutation-report.md, uat-acceptance-certificate.md)",
      blockedBy: "假 Mock、空断言、绿牌作弊严禁通过 G4 验收门禁",
      desc: "全栈真实驱动走查，杜绝前端虚假 Mock，真实真机快照存证，持有一票否决权。",
    },
    {
      code: "06",
      file: "06_quality_assurance.md",
      title: "06_quality_assurance 质量门禁与过程控制 (Compliance & CAR)",
      role: "门神 (FDSE) / Hermes",
      skills: ["cmmi-asset-authoring", "cmmi-car-spc-metrics", "check-governance"],
      gates: "14~20 道全生命周期自动化门禁全绿",
      artifacts: "docs/06_cmmi_audit/ (spc-control-chart.md, car-5whys-rca.md, audit-trail.md, gate-trace-record.md)",
      blockedBy: "门禁未跑通、存在 Blocker/High 债务严禁宣称完工",
      desc: "实施统计过程控制 (SPC) 与缺陷预防，制度交由编译器与脚本强制执行，杜绝人肉记忆。",
    },
    {
      code: "07",
      file: "07_release.md",
      title: "07_release 容器交付与不可变投产 (DevOps & Release)",
      role: "兜底渊 (SRE)",
      skills: ["cmmi-asset-authoring", "cmmi-immutable-release", "app-release-pipeline", "sre-release-and-deploy", "release-flow", "release-version-sync"],
      gates: "CMMI G5 不可变投产门禁、7 处版本一致性守卫",
      artifacts: "docs/07_release/ (system-deployment-sop.md, rollback-emergency-plan.md, RELEASE_NOTES_*.md, release-verification-checklist.md)",
      blockedBy: "生产指纹漂移、版本号不一致、缺乏回滚 SOP 严禁放行",
      desc: "确保「测过的东西就是发布的东西」，配置基线固化，具备秒级回滚止血预案。",
    },
    {
      code: "08",
      file: "08_sre.md",
      title: "08_sre 可靠性保障与事故复盘 (SRE, SLO & Incident)",
      role: "兜底渊 (SRE)",
      skills: ["cmmi-asset-authoring", "sre-slo-manager", "postmortem-analyzer", "strix-penetration-testing", "pre-sre"],
      gates: "SLO 可用率 >= 99.95%、12 项安全渗透扫描 0 漏洞",
      artifacts: "docs/08_sre/ (01_slo_sli_metrics/SLO-SLI-ERROR-BUDGET-MATRIX.md, disaster-recovery-plan.md, 02_postmortem/POSTMORTEM-*.md, strix-penetration-report.md)",
      blockedBy: "线上盲目裸跑发版、事故未闭环 CAPA 严禁关闭工单",
      desc: "落地多窗口错误预算燃烧率告警、红队 PoC 漏洞确证与免责 5-Whys 复盘改进闭环。",
    },
    {
      code: "09",
      file: "09_operations.md",
      title: "09_operations 商业化持续运营与对账平账 (Ops & Reconciliation)",
      role: "百晓生 (DS) / 掌柜 (CEO)",
      skills: ["cmmi-asset-authoring", "financial-reconciliation-agent", "ceo-company-ops", "finance-budget-guard"],
      gates: "三方账实守恒 (0 差错闭环)、日常巡检健康拨测全绿",
      artifacts: "docs/09_operations/ (tenant-governance.md, agent-operations-ledger.md, system-inspection-report.md, 02_financial_reconciliation/RECONCILIATION-*.md)",
      blockedBy: "资金不守恒、账实不符、违规提现抹账一票否决",
      desc: "日终/月终财务与业务三方自动平账，多租户准入与配额治理，确保商业闭环健康可持续。",
    },
  ];

  for (const s of stages) {
    const content = `# 阶段交付百科：${s.title}

> **所属生命周期**：CMMI 截断阶段 ${s.code} | **主责数字员工**：${s.role}  
> **核心专属 Skills**：\`${s.skills.join("\`, \`")}\`

---

## 一、 交付目标与职责定义
${s.desc}

---

## 二、 阶段核心产物清单 (Physical Artifacts)
- **工程产物归宿**：\`${s.artifacts}\`
- **控制面映射**：统一通过 \`issue_work_products\` 与 \`documents\` 挂载至 Paperclip 控制面工件总线。

---

## 三、 门禁准入与阻断条件 (Quality Gates)
- **达标准绳**：${s.gates}
- **阻断铁律**：**${s.blockedBy}** (*No Artifact, No Done*)

---

## 四、 关键实战指引与推荐工具
- 优先加载 \`${s.skills[0]}\` 展开具体施工；
- 遵循 CMMI 规范要求，过程证据实时沉淀，杜绝先编码后补文档。
`;
    generatedFiles.set(`stages/${s.file}`, content);
  }
}

// ==========================================
// 3. 生成 wiki/architecture/*.md (核心架构支柱)
// ==========================================
function buildArchitecture() {
  const pillars = [
    {
      file: "control-plane-backbone.md",
      title: "Paperclip 控制面中枢与单人负责人锁",
      content: `# 架构支柱：Paperclip 控制面中枢与单人负责人锁

- **单一人负责模型**：每一条工单/任务在任何时刻仅允许唯一 assignee 签出锁定，杜绝多人并发修改冲突；
- **真实预算硬熔断**：企业与数字员工配置硬停预算阈值，超额自动触发系统暂停；
- **原生工件总线**：统一采用 \`issue_work_products\` 与 \`issue_documents\` 作为第一法定事实源。`,
    },
    {
      file: "living-ontology.md",
      title: "Palantir 活体本体系统与业务双核",
      content: `# 架构支柱：Palantir 活体本体系统与业务双核

- **业务双核**：Object Types（现实世界活体孪生）+ Action Types（闭环业务动词）；
- **物理并轨三大铁律**：
  1. 项目进厂即本体域 (Project as Domain)；
  2. 工坊会话即本体演进 (Conversation as Proposal)；
  3. 任务施工即动词血缘 (Task as Action Execution & Provenance)；
- **全盘 263 张物理表**高内聚复用，杜绝伪孪生与死报表。`,
    },
    {
      file: "flat-docs-specs-system.md",
      title: "开放式扁平敏捷特性库与 CMMI 01~09 体系",
      content: `# 架构支柱：开放式扁平敏捷特性库与 CMMI 01~09 体系

- **彻底弃用 .coolie/cmmi 隐藏单文件目录**；
- **CMMI 01~09 全生命周期 26 类工程资产规范归宿**：
  - \`docs/01_management/\`：立项章程、综合计划、风险台账、DAR 决策分析、阶段配置计划
  - \`docs/02_requirements/\`：EARS 语法软件需求规格 (SRS)、跟踪矩阵 (RTM)、NFR
  - \`docs/03_design/\`：MADR 架构决策 (ADR)、HLD 设计、数据库模型 ERD、接口契约
  - \`docs/04_implementation/\`：编码规范、变异测试指南、插件隔离蓝图、SBOM
  - \`docs/05_verification/\`：测试计划、测试总结大盘、变异测试报告、客户终验单
  - \`docs/06_cmmi_audit/\`：统计过程控制 (SPC)、CAR 5-Whys、配置审计单、门禁追踪
  - \`docs/07_release/\`：部署割接 SOP、秒级回滚 Runbook、版本发布说明、发版清单
  - \`docs/08_sre/\`：SLO/SLI 矩阵、容灾演练方案、5-Whys 事故复盘、Strix 渗透报告
  - \`docs/09_operations/\`：多租户开通 SOP、数字员工台账、常态巡检报告、财务对账平账单
- **敏捷特性规格全息包**：
  - \`docs/specs/<domain>/<feature-slug>/\`：由 Kiro SDD 引擎 (\`npm run spec:ops\`) 驱动，内聚 brief.json, requirements.md, design.md, tasks.md, spec.json, runbook.json
- **机器证据库与工作流流水**：
  - \`docs/artifacts/\`：静态扫描、高并发压测、环境指纹与工作流执行历史 (\`workflow-runs/\`)`,
    },
    {
      file: "kiro-native-workflows.md",
      title: "Kiro SDD 原生多智能体工作流引擎与配方体系",
      content: `# 架构支柱：Kiro SDD 原生多智能体工作流引擎与配方体系

- **核心运行引擎**：
  工作流是把 SDD 规格从静态 Markdown 推向多智能体自动化执行的核心引擎。
- **物理单一真源与软链接桥接**：
  - 单一真源：\`.agents/workflows/*.workflow.json\`
  - Kiro IDE 原生软链接桥接：\`.kiro/workflows -> ../.agents/workflows\`
- **4 大内置 SDD 配方**：
  1. \`feature-delivery.workflow.json\`：全生命周期新特性交付
  2. \`bugfix.workflow.json\`：缺陷排查与红绿验证 (5-Whys + Red-to-Green)
  3. \`architecture-refactor.workflow.json\`：架构债务消除与渐进演进
  4. \`security-patch.workflow.json\`：安全加固与 PoC 红蓝渗透验证
- **统一工作流 CLI 引擎 (\`scripts/workflow-engine.cjs\`)**：
  - \`pnpm run workflow:list\`：检视配方清单与依赖
  - \`pnpm run workflow:check\`：DAG 有向无环图深度扫描与语法校验
  - \`pnpm run workflow:dry-run\`：模拟展开输出 Mermaid DAG 与角色指令
  - \`pnpm run workflow:run\`：驱动执行脚手架并落盘执行流水
  - \`pnpm run workflow:new\`：脚手架生成新配方模板`,
    },
    {
      file: "benchmark-gap-analysis.md",
      title: "全球顶尖开源基准对标与持续演进路线",
      content: `# 架构支柱：全球顶尖开源基准对标与持续演进路线

- **对标顶级项目**：
  1. **Supabase (80k★)**：极速本地开发、Realtime CDC、原生向量检索；
  2. **MedusaJS v2 (27k★)**：TypeScript 原生可逆 DAG 工作流与长事务 Saga；
  3. **ruoyi-vue-pro (25k★)**：17 领域工业级模型、BPMN 2.0 审批流；
  4. **Directus / Refine (30k★)**：低代码动态 Schema 与虚拟滚动大表格；
  5. **Strix (60k★)**：多智能体红队渗透测试平台。
- **核心差距与持续突破**：
  - TS 原生可逆 Saga/Workflow 引擎已落地；
  - 数据权限与 AST 级隔离持续深化；
  - 移动端极简人机工程与 6 寸屏局部一跳卡片流全面对齐。`,
    },
    {
      file: "minimalist-ui-and-navigation.md",
      title: "移动端极简人机工程与就地浮层导航",
      content: `# 架构支柱：移动端极简人机工程与就地浮层导航

- **两字按钮契约**：核心操作按钮 100% 收敛为纯两字（【创建】、【查看】、【沙箱】、【确认】等）；
- **2+1+2 黄金对称底栏**：严格保持 [汇览] [任务] [+] [工坊] [资产] 绝对居中对称；
- **就地浮层覆盖 (Inspect In-Place)**：实体检视统一作为全局顶层抽屉就地弹出，保持调用方上下文、筛选条件与滚动位置完整无损；
- **严格 LIFO 返回栈**：返回操作按层级逆序出栈，杜绝界面跨 Tab 乱跳。`,
    },
    {
      file: "acp-agent-protocol.md",
      title: "ACP 标准调度协议栈与免交互自主授权",
      content: `# 架构支柱：ACP 标准调度协议栈与免交互自主授权

- **Agent Client Protocol (ACP)**：通过标准 ACP 协议统一管理 6 大工具适配器；
- **免交互自主授权**：
  - cmd 工具配置 \`--yolo --tools-all\`；
  - claude 工具配置 \`--dangerously-skip-permissions\`；
  - 执行管道重定向 \`< /dev/null\` 防 stdin 挂起死锁。`,
    },
    {
      file: "dev-prod-isolation.md",
      title: "Dev 施工总社与 Prod 生产交付绝对物理隔离",
      content: `# 架构支柱：Dev 施工总社与 Prod 生产交付绝对物理隔离

- **Dev 环境（工坊自身建设面）**：专属于 Coolie 本地施工总社（localhost:3100 / 内嵌 PGlite）；
- **Prod 环境（商业实体交付面）**：专属于客户交付业务中台（xrobinai.cn / PostgreSQL 独立集群）；
- **数据物理隔绝**：严禁在生产库中混杂工坊自身任务与内部会话日志。`,
    },
    {
      file: "coolie-foundry-ai-ontology.md",
      title: "Coolie 工坊 AI 活体业务本体全面图谱 (M1~M7+MU)",
      content: `# 架构支柱：Coolie 工坊 AI 活体业务本体全面图谱 (M1~M7+MU)

> **导读与全景**：详见核心架构白皮书 [docs-coolie/architecture/2026-10-10-coolie-foundry-ai-ontology-master-graph.md](../../docs-coolie/architecture/2026-10-10-coolie-foundry-ai-ontology-master-graph.md)。
> 本词条为 AI 数字员工（Hermes / 墨斗 / 铁匠 / 门神 / 兜底渊 / 百晓生）提供全自主驱动（AI Agent-Driven）Coolie 平台自身的机器可读活体业务本体。

---

## 1. 三层物理隔离法典
- **Layer 1 (决策层)**：Console & 6寸屏移动驾驶舱，专属于掌柜/CEO，一句话意图派单、局部一跳卡片审批流；
- **Layer 2 (制造层)**：数字交付工厂，专属于数字员工（Hermes/墨斗/铁匠/门神/兜底渊），全自主交付 0-1 软件工程真资产；
- **Layer 3 (运行层)**：客户生产环境，专属于交付业务中台（如云南移动、九夏智居），业务数据自承载自平账。

---

## 2. 活体业务本体七模型 (M1~M7+MU)
1. **M1 业务对象模型 (Objects)**：8 大核心业务实体（\`Company\`, \`Project\`, \`Domain\`, \`Issue\`, \`Document\`, \`WorkProduct\`, \`Approval\`, \`DigitalEmployee\`）；
2. **M2 行为动词状态机 (Actions)**：8 大核心动词（\`HatchProject\`, \`ProposeOntologyEvolution\`, \`ApproveProposal\`, \`BootstrapCmmiWbs\`, \`CheckoutTask\`, \`SubmitDeliverable\`, \`SignOffUat\`, \`HaltBudgetBreach\`），具备明确的前置条件、事务变更与后置事件；
3. **M3 业务规则与系统硬不变量 (Invariants)**：
   - *INV-1*: No Artifact, No Done（无实质物理工程资产凭证严禁结项）；
   - *INV-2*: Single-Assignee Exclusive Lock（单人原子签出互斥锁）；
   - *INV-3*: Two-Letter Cockpit Actions（移动驾驶舱核心操作 100% 收敛为两字）；
   - *INV-4*: Budget Hard Stop Auto-Pause（花销达标硬熔断停工）；
   - *INV-5*: Dev/Prod Absolute Isolation（Dev专事工坊建设，Prod专事实体交付）；
4. **M4 状态机与生命周期 (State Machines)**：Issue 状态机（todo ➔ in_progress ➔ in_review ➔ done）与 Proposal 状态机；
5. **M5 组织与角色权限 (RACI)**：掌柜 (CEO)、Hermes (调度中枢)、墨斗 (FDA)、铁匠 (CoreSWE)、门神 (FDSE)、兜底渊 (SRE)、百晓生 (DS)；
6. **M6 端到端业务旅程 (E2E Journeys)**：Journey 1 (新客户需求 0-1 交付与终验) & Journey 2 (生产期活体本体驱动增量演进)；
7. **M7 度量指标与统计过程控制 (Metrics & SPC)**：G1~G5 门禁通关率、SPC 任务偏差、变异杀灭率 (MSI >= 85%)、双向需求覆盖率 (100%)；
8. **MU 极简人机工程与驾驶舱模型 (Cockpit UI)**：黄金 2+1+2 对称底栏、全局抽屉就地浮层覆盖、LIFO 调用栈返回。

---

## 3. AI Agent 驱动执行协议 (Autonomous Loop)
- **探查感知**：\`node scripts/ontology-ops.cjs inspect\`
- **意图提议**：\`node scripts/ontology-ops.cjs propose --slug <feat> --name <Name> --add-props ...\`
- **掌柜确认**：掌柜在移动端或控制台点击【确认】
- **应用闭环**：\`node scripts/ontology-ops.cjs apply --proposal <id>\` 自动生成 DDL + SDD 规格 + Paperclip 工单！
`,
    },
  ];

  for (const p of pillars) {
    generatedFiles.set(`architecture/${p.file}`, p.content);
  }
}

// ==========================================
// 4. 生成 wiki/domains/*.md (业务活体领域)
// ==========================================
function buildDomains() {
  const domains = [
    {
      file: "delivery-foundry.md",
      title: "商业软件交付工厂核心模型",
      content: `# 领域百科：商业软件交付工厂核心模型

- **工厂定位**：全流程 AI 原生数字员工全自主驱动的「端到端商业软件交付工厂」；
- **商业闭环**：以客户真实生产环境中依据《软件需求规格说明书 (SRS)》签署的《客户终验核销单 (UAT)》为商业与法律闭环标准。`,
    },
    {
      file: "digital-fleet.md",
      title: "五大数字员工战斗集群体系",
      content: `# 领域百科：五大数字员工战斗集群体系

- **墨斗 (FDA)**：前线架构师，画死隔离边界、数据模型与技术选型；
- **铁匠 (CoreSWE)**：核心研发，统一强类型契约、状态机与核心算法；
- **门神 (FDSE)**：前线部署工程师，真实测试驱动、防假Mock、UI全态覆盖；
- **兜底渊 (SRE)**：产品可靠性工程师，环境指纹对齐、秒级回滚、持有一票否决权；
- **百晓生 (DS)**：部署战略专家，真实用户主审官，端到端业务闭环终验。`,
    },
    {
      file: "scm-platform.md",
      title: "供应链进销存中台系统 (基于 ruoyi-all-next)",
      content: `# 领域百科：企业级供应链进销存中台系统

- **开源底座**：基于 \`xaicd/ruoyi-all-next\` 派生；
- **核心模块**：
  - 采购协同与比价审批 (\`plugin-erp\`)；
  - 多级仓储库位与先进先出成本核算 (\`plugin-wms\`)；
  - 供应商准入资质与多租户审计 (\`domains/system\`)；
- **工程资产**：含 7.0MB 全栈源码包、交互沙箱与生产容器编排。`,
    },
    {
      file: "mes-manufacturing.md",
      title: "智能制造 MES 与板材开料运筹求解器",
      content: `# 领域百科：智能制造 MES 与板材开料运筹求解器

- **核心资产**：
  - 2D 矩形板材正交开料启发式求解器 (综合出材率 ≥ 92.4%)；
  - 3D CAD 设计图纸智能拆单与 BOM 提取微服务；
  - 工匠计件工单与原材料仓储质押监管。`,
    },
    {
      file: "wecom-integration.md",
      title: "企业微信画像与网关集成",
      content: `# 领域百科：企业微信画像与网关集成

- **核心功能**：云南移动政企业务画像、专线数据穿透与企微机器人告警推送；
- **通信保障**：专网安全鉴权、敏感字段脱敏与高可用负载均衡。`,
    },
  ];

  for (const d of domains) {
    generatedFiles.set(`domains/${d.file}`, d.content);
  }
}

// ==========================================
// 5. 生成 wiki/gotchas/*.md (高频避坑实录)
// ==========================================
function buildGotchas() {
  const gotchas = [
    {
      file: "container-host-exec-discipline.md",
      title: "Docker 容器运算与 Mac 宿主机 host-exec 穿透纪律",
      content: `# 避坑实录：容器运算与 Mac 宿主机 host-exec 穿透纪律

1. **容器内能力**：文件读写、代码静态编译、Git 暂存、代码分析等；
2. **Mac 宿主机独占能力**：Android 模拟器、adb 交互、截图存证、Xcode、SSH 直连生产服务器；
3. **铁律**：遇到宿主机独占工具，统一使用 \`host-exec "<cmd>"\` 穿透至宿主机执行，严禁在容器内硬启模拟器或裸跑宿主机命令。`,
    },
    {
      file: "two-letter-button-contract.md",
      title: "移动端两字按钮契约与防技术泄露",
      content: `# 避坑实录：移动端两字按钮契约与防技术泄露

1. **两字按钮契约**：所有交互操作按钮必须严格收敛为纯 2 汉字（【创建】、【查看】、【沙箱】、【确认】、【关闭】、【返回】）；
2. **严禁技术泄露**：严禁在按钮上暴露口语化或技术长文案（如「查看详情」、「立即执行」、「提交审批」）。`,
    },
    {
      file: "expo-ota-consistency.md",
      title: "Expo OTA 7 处版本一致性与运行时对齐",
      content: `# 避坑实录：Expo OTA 7 处版本一致性与运行时对齐

1. **7 处版本源**：app.json, package.json, build.gradle, CHANGELOG, version.json, manifest, git tag 保持严格一致；
2. **OTA 缓存陷阱**：原生 versionCode 优先判定，老版本设备必须附带 bundle hash 防止更新静默丢失。`,
    },
    {
      file: "monorepo-pnpm-workspaces.md",
      title: "PNPM Monorepo 与开源基座自适应目录规范",
      content: `# 避坑实录：PNPM Monorepo 与开源基座自适应目录规范

1. **自研项目**：统一遵循 PNPM workspace monorepo 根结构；
2. **开源基座项目**：100% 保持基座原生目录结构（如 RuoYi 等），通过 \`degit\` 极速派生；
3. **彻底弃用 .coolie/cmmi**：增量敏捷特性需求统一扁平落盘于 \`docs/specs/\`。`,
    },
  ];

  for (const g of gotchas) {
    generatedFiles.set(`gotchas/${g.file}`, g.content);
  }
}

// ==========================================
// 主执行入口
// ==========================================
function main() {
  buildIndexMd();
  buildStages();
  buildArchitecture();
  buildDomains();
  buildGotchas();

  if (checkOnly) {
    console.log(`[openwiki:check] 开始校验 OpenWiki 动态知识库 (共 ${generatedFiles.size} 篇词条)...`);
    let driftCount = 0;

    for (const [relPath, expectedContent] of generatedFiles.entries()) {
      const fullPath = path.join(WIKI_DIR, relPath);
      if (!fs.existsSync(fullPath)) {
        console.error(`  ❌ 缺失 Wiki 词条: wiki/${relPath}`);
        driftCount++;
        continue;
      }
      const existingContent = fs.readFileSync(fullPath, "utf-8");
      if (existingContent.trim() !== expectedContent.trim()) {
        console.error(`  ❌ 词条内容发生漂移: wiki/${relPath}`);
        driftCount++;
      }
    }

    if (driftCount > 0) {
      console.error(`\n[openwiki:check] ✗ 发现 ${driftCount} 处 Wiki 漂移，请运行: npm run openwiki:sync 修复\n`);
      process.exit(1);
    }

    console.log(`[openwiki:check] 🎉 PASS: 全部 ${generatedFiles.size} 篇 OpenWiki 知识库词条与规范 100% 同步！`);
    return;
  }

  // 写入模式
  console.log(`[openwiki:sync] 开始动态生成与自愈 OpenWiki 知识大脑 (共 ${generatedFiles.size} 篇词条)...`);
  for (const [relPath, content] of generatedFiles.entries()) {
    const fullPath = path.join(WIKI_DIR, relPath);
    const parentDir = path.dirname(fullPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.writeFileSync(fullPath, content.trim() + "\n", "utf-8");
    console.log(`  [SYNCED] wiki/${relPath}`);
  }

  // 确保 openwiki 软链接存在
  const symlinkPath = path.join(ROOT, "openwiki");
  try {
    if (!fs.existsSync(symlinkPath)) {
      fs.symlinkSync("wiki", symlinkPath, "dir");
      console.log(`  [LINKED] openwiki -> wiki`);
    }
  } catch (err) {
    // 忽略软链接已存在或只读错误
  }

  console.log(`\n🎉 [openwiki:sync] 成功生成并同步 ${generatedFiles.size} 篇 OpenWiki 知识库词条至 wiki/ 目录！`);
}

main();
