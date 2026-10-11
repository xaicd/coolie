# Coolie OpenWiki (LLM 知识大脑)

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
   - 默认 PNPM monorepo；开源基座 100% 保持基座原生目录；彻底废弃 `.coolie/cmmi` 隐藏单文件，全面采用开放扁平的 `docs/specs/` 体系。
6. **极简主义人机与 6 寸屏就地导航 (公理六)**：
   - 核心操作严格收敛为两字按钮，底栏保持 2+1+2 = 5 槽位绝对居中对称，实体检视就地浮层覆盖。
7. **Dev 与 Prod 物理隔离铁律 (公理七)**：
   - Dev 专事工坊自身建设，Prod 专事实体交付。

---

## ⚡ Kiro SDD 原生多智能体工作流引擎与配方 (Workflows & Recipes)

1. **配方单一真源与软链接无缝桥接**：所有多智能体工作流配方统一物理收归 `.agents/workflows/*.workflow.json`（根目录通过 `.kiro/workflows` 软链接桥接），确保 Kiro IDE 原生识别与 Antigravity / 跨 Agent 平台统一标准；
2. **4 大内置 SDD 工作流配方**：
   - 📦 **`feature-delivery`**：全生命周期新特性交付 (`scaffold` ➔ `requirements` ➔ `design` ➔ `plan-waves` ➔ `implement` ➔ `verify`)；
   - 🐛 **`bugfix`**：缺陷排查与红绿验证 (`scaffold` ➔ `diagnose` ➔ `red-test` ➔ `patch` ➔ `verify-gate`)；
   - 🏛️ **`architecture-refactor`**：架构债务消除 (`scaffold` ➔ `debt-analysis` ➔ `parity-tests` ➔ `refactor-execution` ➔ `regression-audit`)；
   - 🛡️ **`security-patch`**：安全加固与 PoC 拦截 (`scaffold` ➔ `threat-model` ➔ `poc-red-test` ➔ `hardening` ➔ `strix-audit`)；
3. **统一工作流 CLI 引擎 (`scripts/workflow-engine.cjs` / `scripts/workflow-engine.ts`)**：
   - `pnpm run workflow:list`、`workflow:check`、`workflow:dry-run`、`workflow:run`、`workflow:new`、`spec:workflows`；
4. **CMMI 01~09 全生命周期 26 类标准过程资产矩阵**：
   - 覆盖 9 大截断阶段，由 `pnpm run cmmi:asset new` 脚手架驱动并严格恪守 `--real` 防假门禁与 Rule 0 实事求是铁律。

---

## 🧭 CMMI 00~09 全生命周期阶段导航 (Delivery Stages)

| 阶段代码 | 阶段名称 | 主责数字员工 | 核心专属 Skills | 交付规范与词条 |
|---|---|---|---|---|
| **00** | 规范与元编程 | 墨斗 (FDA) | `skill-authoring`, `skill-creator` | [00_meta_standards.md](stages/00_meta_standards.md) |
| **01** | 决策分析与立项 | 墨斗 (FDA) / 百晓生 (DS) | `cmmi-asset-authoring`, `dar-decision-matrix`, `solution-scouting-and-dar`, `cmmi-wbs-milestone` | [01_management.md](stages/01_management.md) |
| **02** | 需求工程与规格 | 百晓生 (DS) / Hermes | `cmmi-asset-authoring`, `ears-spec-writer`, `cmmi-req-spec`, `spec-driven-dev` | [02_requirements.md](stages/02_requirements.md) |
| **03** | 架构设计与契约 | 墨斗 (FDA) / 铁匠 (CoreSWE) | `cmmi-asset-authoring`, `cmmi-tech-solution`, `adr-architect`, `archify`, `cmmi-detailed-contracts` | [03_design.md](stages/03_design.md) |
| **04** | 编码实现与防假 | 铁匠 (CoreSWE) | `cmmi-asset-authoring`, `core-swe`, `swe-delivery-flow`, `mutation-tester`, `mcp-builder` | [04_implementation.md](stages/04_implementation.md) |
| **05** | 变异测试与全栈验收 | 门神 (FDSE) / 百晓生 (DS) | `cmmi-asset-authoring`, `cmmi-ver-val`, `mutation-tester`, `comprehensive-testing-workflow`, `qa-humanlike-e2e` | [05_verification.md](stages/05_verification.md) |
| **06** | 质量门禁与过程控制 | 门神 (FDSE) / Hermes | `cmmi-asset-authoring`, `cmmi-car-spc-metrics`, `check-governance` | [06_quality_assurance.md](stages/06_quality_assurance.md) |
| **07** | 容器交付与不可变投产 | 兜底渊 (SRE) | `cmmi-asset-authoring`, `cmmi-immutable-release`, `app-release-pipeline`, `sre-release-and-deploy` | [07_release.md](stages/07_release.md) |
| **08** | SRE 可靠性与事故复盘 | 兜底渊 (SRE) | `cmmi-asset-authoring`, `sre-slo-manager`, `postmortem-analyzer`, `strix-penetration-testing`, `pre-sre` | [08_sre.md](stages/08_sre.md) |
| **09** | 持续运营与对账平账 | 百晓生 (DS) / 掌柜 (CEO) | `cmmi-asset-authoring`, `financial-reconciliation-agent`, `ceo-company-ops`, `finance-budget-guard` | [09_operations.md](stages/09_operations.md) |

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
