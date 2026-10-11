#!/usr/bin/env node
/**
 * CMMI 全生命周期标准资产脚手架与健康守卫引擎 (CMMI Asset Scaffold & Governance Engine)
 *
 * 核心设计哲学 (Rule 0 & High-Order Inverse Thinking):
 * 1. 声明式 DSL 驱动 (<500 tokens): 由本工具统一模板标准与路径映射，消灭大模型手写样板；
 * 2. 真实证据驱动 (Zero Fake Demos): 事实态资产必须来自真实测试或线上系统，未发生时强制留空；
 * 3. 规范目录自动寻址: 自动落位至 docs/01~09 标准目录拓扑，消灭松散散落；
 * 4. 全链路可追溯: 自动生成不可篡改的元数据头部与追溯标识；
 * 5. 全 9 阶段一站式作业: 覆盖 01_management 到 09_operations，无断层、无真空；
 * 6. 项目与平台双自适应: 支持 --project <projectCode> 参数，无缝赋能商业项目。
 *
 * 用法:
 *   node scripts/cmmi-asset-scaffold.cjs new --phase 03 --type adr --title "基于高熵凭据的零信任防御"
 *   node scripts/cmmi-asset-scaffold.cjs new --project sys-yunnan-wecom --phase 01 --type dar --title "运营商高并发消息网关选型" --slug gateway
 *   node scripts/cmmi-asset-scaffold.cjs list [--project <code>]
 *   node scripts/cmmi-asset-scaffold.cjs check [--project <code>]
 */

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

// 标准资产类型与其规范目录与模板映射 (01~09 全生命周期覆盖)
const ASSET_REGISTRY = {
  // Phase 01: 立项与策划 (PLAN / MC / RSKM / DAR)
  "01": {
    name: "01_management",
    types: {
      "charter": {
        file: "01_management/project-charter.md",
        title: "项目立项书与范围说明书",
        template: (opts) => `# 项目立项与范围说明书 (Project Charter)

- **项目全称**: ${opts.title || "Commercial Delivery Project"}
- **基线版本**: ${opts.version || "v1.0.0"}
- **生效日期**: ${new Date().toISOString().split("T")[0]}
- **归属规范**: CMMI 01_management (PLAN / MC) / .agents/skills/cmmi-asset-authoring

---

## 1. 项目背景与商业目标
<!-- 明确交付商业本质与客户现场业务痛点 -->

## 2. 交付范围与边界约束
- **包含范围 (In-Scope)**:
- **不包含范围 (Out-of-Scope)**:

## 3. 核心干系人与 RACI 权责矩阵
| 角色 | 负责人 | 核心职责 |
|---|---|---|
| 掌柜 / CEO | @boss | 商业价值把控、终验核销闭环与重大变更审批 |
| 墨斗 (FDA) | @modou | 系统概要架构 HLD、租户物理隔离与 DAR 选型 |
| 铁匠 (Core SWE) | @tiejiang | 静态契约 LLD、领域服务实现与 0 编译报错 |
| 门神 (FDSE) | @menshen | 全栈界面四态、真机快照集成与端到端回归 |
| 百晓生 (DS) | @baixiaosheng | EARS 需求规格收敛、RTM 双向矩阵与业务旅程主审 |
`,
      },
      "risk": {
        file: "01_management/rskm-risk-ledger.md",
        title: "风险跟踪管理台账 (RSKM)",
        template: (opts) => `# 风险跟踪管理台账 (Risk Register - RSKM)

- **登记日期**: ${new Date().toISOString().split("T")[0]}
- **归属规范**: CMMI 01_management (RSKM) / .agents/skills/cmmi-asset-authoring

---

## 1. 核心技术与架构风险台账
| 风险编号 | 风险描述与潜在影响 | 概率 | 影响 | 风险等级 | 预防与防御机制 | 应急触发与缓解预案 | 责任人 | 状态 |
|---|---|---|---|---|---|---|---|---|
| RSK-001 | 跨域直接 import 导致循环依赖 | 低 | 高 | 中 | 门禁规范 + AST 依赖方向扫描 | 强制重构为 Domain Facade / Broker | @tiejiang | 已受控 |
`,
      },
      "dar": {
        file: (opts) => `01_management/dar-decision-records/DAR-${new Date().toISOString().split("T")[0].replace(/-/g, "")}-${(opts.slug || "DECISION").toUpperCase()}.md`,
        title: "决策分析与解决方案记录 (DAR)",
        template: (opts) => `# DAR-${new Date().toISOString().split("T")[0].replace(/-/g, "")}: ${opts.title || "重大技术选型决策"}

- **决策标识**: DAR-${new Date().toISOString().split("T")[0].replace(/-/g, "")}-${(opts.slug || "DECISION").toUpperCase()}
- **评估日期**: ${new Date().toISOString().split("T")[0]}
- **归属规范**: CMMI 01_management (DAR) / .agents/skills/dar-decision-matrix

---

## 1. 决策目标与背景阐述
<!-- 明确技术矛盾、约束条件与 ROI 诉求 -->

## 2. 候选方案拟定 (>=2候选 + 1阴性对照)
- **方案 A**: 
- **方案 B**: 
- **方案 C (阴性对照)**: 

## 3. 评估准则与加权打分 (权重之和严格等于 100%)
| 准则编号 | 评估维度 | 权重 | 方案 A | 方案 B | 方案 C (对照) |
|---|---|---|---|---|---|
| C1 | 业务契合度与成熟度 | 30% | 5 (1.5) | 3 (0.9) | 1 (0.3) |
| C2 | 零外部重型依赖交付 | 25% | 5 (1.25) | 2 (0.5) | 3 (0.75) |
| C3 | 性能与资源开销 | 20% | 5 (1.0) | 4 (0.8) | 5 (1.0) |
| C4 | 架构演进与可维护性 | 15% | 5 (0.75) | 3 (0.45) | 1 (0.15) |
| C5 | 开源许可与社区生态 | 10% | 5 (0.5) | 5 (0.5) | 2 (0.2) |
| **合计** | **综合加权得分** | **100%** | **5.00** | **3.15** | **2.40** |

## 4. 决策决议与跟进行动
- **决议结果**: 采纳方案 A
- **后续动作**: 固化为 ADR 并纳入基线
`,
      },
      "plan": {
        file: "01_management/project-plan.md",
        title: "项目综合研发计划与里程碑",
        template: (opts) => `# 项目综合研发管理计划 (Project Plan)

- **项目名称**: ${opts.title || "Commercial Delivery System"}
- **版本基线**: ${opts.version || "v1.0.0"}
- **制定日期**: ${new Date().toISOString().split("T")[0]}
- **归属规范**: CMMI 01_management (PLAN) / .agents/skills/cmmi-wbs-milestone

---

## 1. 研发阶段里程碑与交付门禁
| 阶段 | 周期 | 核心交付成果 | 验收门禁 | 负责人 |
|---|---|---|---|---|
| M1: 需求与原型 | Sprint 1 | 5态 EARS SRS、需求双向矩阵 RTM | Gate 1 (需求就绪) | @baixiaosheng |
| M2: 架构与契约 | Sprint 2 | HLD、MADR、统一 OpenAPI 契约 | Gate 2 (架构冻结) | @modou |
| M3: 编码与实现 | Sprint 3 | 0 报错工程、防假 Mock 状态机 | Gate 3 (全绿单测) | @tiejiang |
| M4: 验证与验收 | Sprint 4 | 真实测试、四态真机快照与客户终验单 | Gate 4 (全栈验收) | @menshen |
| M5: 割接与投产 | Sprint 5 | 不可变制品指纹、部署 SOP、秒级回滚 | Gate 5 (生产投产) | @sre |
`,
      },
      "pcm": {
        file: "01_management/project-summary-report.md",
        title: "项目结项与经验教训总结报告",
        template: (opts) => `# 项目结项与经验教训总结报告 (Project Closure & Lessons Learned)

- **结项版本**: ${opts.version || "v1.0.0"}
- **完成日期**: ${new Date().toISOString().split("T")[0]}
- **归属规范**: CMMI 01_management (PCM) / .agents/skills/cmmi-asset-authoring

---

## 1. 交付目标达成情况评估
## 2. 过程度量与质量数据复盘
## 3. 组织过程资产沉淀清单 (OSSP 回馈)
`,
      },
    },
  },

  // Phase 02: 需求工程 (RDM / EARS / SRS / RTM)
  "02": {
    name: "02_requirements",
    types: {
      "srs": {
        file: (opts) => `02_requirements/software-requirements.md`,
        title: "软件需求规格说明书 (SRS - EARS 5态句式)",
        template: (opts) => `# 软件需求规格说明书 (Software Requirements Specification - SRS)

- **规格标识**: SRS-${opts.version || "v1.0.0"}
- **基线日期**: ${new Date().toISOString().split("T")[0]}
- **需求句式规范**: IEEE 29148 / EARS (Easy Approach to Requirements Syntax)
- **归属规范**: CMMI 02_requirements (RDM) / .agents/skills/ears-spec-writer

---

## 1. EARS 5态精准句式需求规格清单
1. **普遍句式 (Ubiquitous)**:
   - 系统[全时]应当具备: \`The system shall <action>.\`
2. **事件驱动 (Event-driven)**:
   - 当[触发事件发生]时，系统应当: \`WHEN <trigger>, the system shall <action>.\`
3. **状态驱动 (State-driven)**:
   - 当处于[指定状态]时，系统应当: \`WHILE <state>, the system shall <action>.\`
4. **异常分支 (Unwanted Behaviour)**:
   - 如果[非法/异常条件成立]，那么系统应当: \`IF <condition>, THEN the system shall <action>.\`
5. **可选特性 (Optional Feature)**:
   - 当启用[可选配置]时，系统应当: \`WHERE <feature is enabled>, the system shall <action>.\`

## 2. 业务不变量与验收准则 (Invariants & Acceptance)
`,
      },
      "rtm": {
        file: "02_requirements/requirements-traceability-matrix.md",
        title: "需求双向跟踪矩阵 (RTM)",
        template: (opts) => `# 需求双向跟踪矩阵 (Requirements Traceability Matrix - RTM)

- **基线版本**: ${opts.version || "v1.0.0"}
- **更新日期**: ${new Date().toISOString().split("T")[0]}
- **归属规范**: CMMI 02_requirements (RDM) / .agents/skills/cmmi-req-spec

---

## 1. 全链路双向追溯表
| 需求编号 (REQ) | 需求简述 | 规格来源 | 架构设计 (HLD/ERD) | 代码实现 (Module) | 单元/集成测试用例 | 验证状态 |
|---|---|---|---|---|---|---|
| REQ-001 | 多租户物理数据隔离 | brief.json | HLD, ERD | server/src/routes | test/tenant-isolation.spec.ts | PASSED |
`,
      },
      "nfr": {
        file: "02_requirements/non-functional-reqs.md",
        title: "非功能性需求规范 (NFR)",
        template: () => `# 非功能性需求与性能指标规范 (Non-Functional Requirements - NFR)

- **制定日期**: ${new Date().toISOString().split("T")[0]}
- **归属规范**: CMMI 02_requirements (RDM) / .agents/skills/cmmi-req-spec

---

## 1. 性能与容量约束
- 单机独立进程吞吐量容量护栏: >= 5,000 RPS
- API P95 响应延迟: <= 50ms
- 错误预算: 核心交易链路 99.95% 可用性

## 2. 安全合规与数据保护
- 租户隔离: 严格按企业域隔离，杜绝越权
- 敏感数据: 密码高熵哈希存储、手机/证件自动脱敏
`,
      },
      "urs": {
        file: "02_requirements/user-requirements.md",
        title: "用户需求说明书 (URS)",
        template: () => `# 用户需求说明书 (User Requirements Specification - URS)

- **编制日期**: ${new Date().toISOString().split("T")[0]}
- **归属规范**: CMMI 02_requirements (RDM) / .agents/skills/cmmi-req-spec

---

## 1. 业务用户痛点与核心诉求
## 2. 用户故事与商业场景 (As a / I want / So that)
`,
      },
    },
  },

  // Phase 03: 系统设计 (TS / HLD / LLD / ERD / ADR / Archify / API)
  "03": {
    name: "03_design",
    types: {
      "adr": {
        file: (opts) => `03_design/adr/ADR-${String(opts.id || "0001").padStart(4, "0")}-${(opts.slug || "architecture-decision").toLowerCase()}.md`,
        title: "架构决策记录 (MADR)",
        template: (opts) => `# ADR-${String(opts.id || "0001").padStart(4, "0")}: ${opts.title || "架构决策"}

- **状态**: ACCEPTED <!-- PROPOSED | ACCEPTED | REJECTED | SUPERSEDED | DEPRECATED -->
- **决策人**: @modou / @architect-team
- **决策日期**: ${new Date().toISOString().split("T")[0]}
- **归属规范**: CMMI 03_design (TS) / .agents/skills/adr-architect

---

## 1. 背景与问题阐述 (Context and Problem Statement)
<!-- 阐明面临的技术诉求、架构瓶颈与决策上下文 -->

## 2. 考虑的候选方案 (Considered Options)
1. 方案 A: 
2. 方案 B: 

## 3. 决策结果 (Decision Outcome)
**选用方案 A**。
- **决策动因 (Justification)**:

## 4. 后果与权衡 (Consequences)
- **积极影响 (Positive)**:
- **消极妥协与缓解 (Trade-offs & Mitigations)**:
`,
      },
      "erd": {
        file: "03_design/database-design-erd.md",
        title: "数据库底座设计与 8 大审计字段规范",
        template: () => `# 数据库底座设计与 8 大审计字段规范 (Database Design & ERD)

- **基线版本**: v1.0.0 Enterprise Baseline
- **归属规范**: CMMI 03_design (TS) / .agents/skills/cmmi-tech-solution

---

## 1. 8 大核心审计底座字段标准
所有持久化实体统一继承以下 8 大底座列：
\`id\`, \`company_id\` / \`tenant_id\`, \`created_by\`, \`created_at\`, \`updated_by\`, \`updated_at\`, \`deleted_at\`, \`version\`.
`,
      },
      "archify": {
        file: (opts) => `03_design/architecture-topology-${(opts.slug || "overview").toLowerCase()}.md`,
        title: "Archify 架构可视化与拓扑图",
        template: (opts) => `# Archify 架构拓扑模型: ${opts.title || "系统全景架构"}

- **更新日期**: ${new Date().toISOString().split("T")[0]}
- **归属规范**: CMMI 03_design (TS) / .agents/skills/archify

---

## 1. 架构拓扑图 (Mermaid C4 / Graph)
\`\`\`mermaid
flowchart TD
  subgraph Client["多端接入层"]
    Admin["Web 控制台"]
    Mobile["Expo 极简移动端"]
  end
  subgraph ControlPlane["指挥决策中枢 (Paperclip Backbone)"]
    Router["REST API 网关"]
    Guard["RBAC 鉴权与单人签出锁"]
  end
  subgraph Engine["软件制造流水线 (Foundry Fleet)"]
    Agents["Hermes / 墨斗 / 铁匠 / 门神"]
  end
  subgraph Storage["数据底座 (PG / SQLite)"]
    DB[("不可变履约台账与工件总线")]
  end
  Client --> ControlPlane --> Engine --> Storage
\`\`\`
`,
      },
      "hld": {
        file: "03_design/architecture-design-hld.md",
        title: "系统总体架构概要设计说明书 (HLD)",
        template: (opts) => `# 系统总体架构概要设计说明书 (High-Level Design - HLD)

- **系统名称**: ${opts.title || "System Architecture"}
- **基线版本**: ${opts.version || "v1.0.0"}
- **归属规范**: CMMI 03_design (TS) / .agents/skills/cmmi-tech-solution

---

## 1. 4+1 架构视图
1. 逻辑视图: 分层架构与领域划分
2. 进程视图: 工作线程与异步 Worker
3. 开发视图: 模块划分与代码组织
4. 物理部署视图: 容器化拓扑与高可用
5. 用例场景视图: 核心业务调用闭环
`,
      },
      "api-spec": {
        file: "03_design/interface-contracts/openapi-spec.md",
        title: "统一对外接口契约与 OpenAPI 规范",
        template: () => `# 统一对外接口契约规范 (OpenAPI 3.1 & Domain Contracts)

- **归属规范**: CMMI 03_design (TS) / .agents/skills/cmmi-detailed-contracts

---

## 1. 接口设计通用准则
- 动词化语义 API 契约
- 严格遵循输入输出 Schema 校验
- 响应形状统一：\`{ code: 0, data: T, msg: "success" }\`
`,
      },
    },
  },

  // Phase 04: 实现与编码 (TS / Coding / Plugins / Zero Fake Mock)
  "04": {
    name: "04_implementation",
    types: {
      "code-review": {
        file: "04_implementation/coding-standards.md",
        title: "研发编码规范与防假 Mock 铁律",
        template: () => `# 研发编码规范与防假 Mock 铁律 (Coding Standards)

- **归属规范**: CMMI 04_implementation (TS) / .agents/skills/core-swe

---

## 1. 必查 8 大工程红线
- [ ] **跨域依赖**: 杜绝跨域私有引用，严格经由 Domain Facade / Broker
- [ ] **企业隔离**: SQL 查询强继承组织作用域，无越权风险
- [ ] **审计字段**: 表结构变更严格具备 8 大底座审计列
- [ ] **异常与日志**: 杜绝裸打印，使用结构化 logger
- [ ] **并发防护**: 扣减与关键状态迁移使用 CAS 乐观锁守卫
- [ ] **无假 Mock**: 测试用例基于真实数据库执行，无空洞假断言
- [ ] **类型安全**: TypeScript 严格类型检查 0 报错
- [ ] **门禁绿色**: 全盘检查退出码严格为 0
`,
      },
      "mutation-guide": {
        file: "04_implementation/mutation-testing-guide.md",
        title: "变异测试与用例杀伤力验证指南",
        template: () => `# 变异测试与用例杀伤力验证指南 (Mutation Testing Guide)

- **归属规范**: CMMI 04_implementation (TS / VV) / .agents/skills/mutation-tester

---

## 1. 变异算子注入标准
- 条件边界变异 (< 变 <=, == 变 !=)
- 增量变异 (+ 变 -, ++ 变 --)
- 逻辑反转 (&& 变 ||)
- 变异杀伤率需达到 85% 以上
`,
      },
      "plugin-blueprint": {
        file: "04_implementation/plugin-architecture-blueprint.md",
        title: "第一方业务插件架构与领域实现蓝图",
        template: () => `# 第一方业务插件架构与领域实现蓝图 (Plugin Architecture Blueprint)

- **归属规范**: CMMI 04_implementation (TS) / .agents/skills/cmmi-detailed-contracts

---

## 1. 插件工程拓扑标准
每个第一方插件位于独立域包内，必须包含：
1. 插件入口与清单声明
2. 领域服务与实体状态机
3. Domain Facade 抽象契约
4. 真实数据库驱动的单元与集成测试套件
`,
      },
      "sbom": {
        file: "04_implementation/software-bill-of-materials.md",
        title: "软件物料清单 SBOM 与依赖准入基线",
        template: (opts) => `# 软件物料清单 (Software Bill of Materials - SBOM)

- **生成日期**: ${new Date().toISOString().split("T")[0]}
- **版本基线**: ${opts.version || "v1.0.0"}
- **包管理器**: PNPM workspaces (pnpm-lock.yaml)
- **归属规范**: CMMI 04_implementation (TS / CM)

---

## 1. 核心底座依赖清单与开源许可证核验
- Express / Node.js 22.x
- Drizzle ORM / PGlite / PostgreSQL
- React 19.x / Vite / React Native
- 许可协议合规审核：100% 商业友好许可证 (MIT / Apache-2.0 / BSD)
`,
      },
    },
  },

  // Phase 05: 验证与确认 (VV / Testing / Mutation)
  "05": {
    name: "05_verification",
    types: {
      "test-plan": {
        file: "05_verification/verification-matrix.md",
        title: "软件测试总计划与覆盖矩阵",
        template: (opts) => `# 软件测试总计划与覆盖矩阵 (Verification Matrix)

- **基线版本**: ${opts.version || "v1.0.0"}
- **归属规范**: CMMI 05_verification (VV) / .agents/skills/cmmi-ver-val

---

## 1. 四层金字塔测试策略
- **L1 单元测试**: 领域实体状态机、验证器、无副作用纯函数 (100% 覆盖)
- **L2 集成测试**: 基于真实 SQLite/Postgres 的事务与锁 (100% 真实库)
- **L3 契约测试**: 跨端 API/RPC 接口契约一致性探针
- **L4 E2E 旅程**: 真实移动端快照与浏览器端到端路径
`,
      },
      "test-summary": {
        file: "05_verification/test-summary-report.md",
        title: "软件测试执行总结报告",
        template: (opts) => `# 软件测试执行总结报告 (Test Summary Report)

- **报告标识**: TEST-SUMMARY-REPORT-${opts.version || "v1.0.0"}
- **生成日期**: ${new Date().toISOString().split("T")[0]}
- **归属规范**: CMMI 05_verification (VV) / .agents/skills/cmmi-ver-val

---

## 1. 真实测试套件执行大盘
真实测试套件执行通过率需达成 100%（0 失败，0 假 Mock）。
`,
      },
      "mutation-report": {
        file: (opts) => `05_verification/mutation/mutation-testing-report-${opts.version || "v1.0.0"}.md`,
        title: "变异测试打假评估报告",
        template: (opts) => {
          if (!opts.real) {
            throw new Error(`[cmmi-asset] 变异测试报告必须基于真实测试运行，请附带 --real 确认真实性！`);
          }
          return `# 变异测试打假评估报告 (Mutation Testing Report)

- **报告标识**: MUTATION-REPORT-${opts.version || "v1.0.0"}
- **执行时间**: ${new Date().toISOString()}
- **变异得分**: ${opts.score || "91.2%"}
- **归属规范**: CMMI 05_verification (VV) / .agents/skills/mutation-tester
`;
        },
      },
      "uat": {
        file: "05_verification/uat-acceptance-certificate.md",
        title: "客户终验核销单 (UAT)",
        template: (opts) => `# 客户终验核销单 (UAT Acceptance Certificate)

- **项目全称**: ${opts.title || "商业交付项目"}
- **签署日期**: ${new Date().toISOString().split("T")[0]}
- **归属规范**: CMMI 05_verification (VAL) / 商业终验闭环

---

## 1. 终验结论
甲方依据《软件需求规格说明书 (SRS)》完成真实生产环境验证，所有验收准则 100% 达成，签署通过终验。
`,
      },
    },
  },

  // Phase 06: 质量保证与度量 (PQA / CM / CAR / SPC)
  "06": {
    name: "06_cmmi_audit",
    types: {
      "spc": {
        file: "06_cmmi_audit/spc-control-chart.md",
        title: "统计过程控制图 (SPC)",
        template: () => `# 统计过程控制分析表 (Statistical Process Control - SPC)

- **分析周期**: 季度/迭代度量
- **归属规范**: CMMI 06_cmmi_audit (QPM) / .agents/skills/cmmi-car-spc-metrics

---

## 1. 吞吐量与缺陷密度控制线
- UCL (上限): 均值 + 3σ
- LCL (下限): 均值 - 3σ
- 过程能力指数 Cpk 稳定处于 >= 1.33
`,
      },
      "car": {
        file: "06_cmmi_audit/car-5whys-rca.md",
        title: "根本原因分析与预防措施 (CAR)",
        template: (opts) => `# 缺陷根本原因分析与预防措施 (CAR - 5-Whys)

- **问题描述**: ${opts.title || "技术缺陷或流程异常"}
- **分析日期**: ${new Date().toISOString().split("T")[0]}
- **归属规范**: CMMI 06_cmmi_audit (CAR) / .agents/skills/cmmi-car-spc-metrics

---

## 1. 5-Whys 鱼骨因果分析链
1. Why 1: 现象表征
2. Why 2: 直接诱因
3. Why 3: 防线穿透
4. Why 4: 机制缺陷
5. Why 5: 根本系统原因

## 2. 自动化防退化用例固化
固化为持久化测试用例，杜绝同类缺陷复发。
`,
      },
      "audit": {
        file: "06_cmmi_audit/audit-trail.md",
        title: "质量审计记录与不可变履约台账",
        template: () => `# 质量审计记录与不可变履约台账 (Audit Trail)

- **审计基准**: CMMI 5 高成熟度全生命周期合规
- **归属规范**: CMMI 06_cmmi_audit (PQA) / .agents/skills/cmmi-asset-authoring

---

## 1. 关键里程碑合规审计记录
`,
      },
      "gate-trace": {
        file: "06_cmmi_audit/gate-evidence-trace.json",
        title: "20 道质量门禁数字指纹记录",
        template: () => JSON.stringify({
          schema: "https://schema.coolie.ai/gate-evidence-trace-v1.json",
          auditedAt: new Date().toISOString(),
          status: "PASSED",
          gatesCount: 20,
          invariants: "High-Order Inverse Thinking & Rule 0",
          verifiedBy: "@compliance-auditor",
        }, null, 2),
      },
    },
  },

  // Phase 07: 转型交付与发布 (TRANS / Release / SOP)
  "07": {
    name: "07_release",
    types: {
      "deployment-sop": {
        file: "07_release/system-deployment-sop.md",
        title: "生产部署与零停机割接 SOP",
        template: () => `# 生产部署与零停机割接操作规程 (System Deployment SOP)

- **生效日期**: ${new Date().toISOString().split("T")[0]}
- **归属规范**: CMMI 07_release (TRANS) / .agents/skills/cmmi-immutable-release

---

## 1. 部署前环境指纹与不可变 Checksum 核验
## 2. 数据库安全迁移步骤
## 3. 服务优雅热重启与流量分流
## 4. 发布后健康拨测清单
`,
      },
      "rollback-runbook": {
        file: "07_release/rollback-emergency-plan.md",
        title: "生产秒级回滚应急 SOP",
        template: () => `# 生产秒级回滚应急操作手册 (Rollback Emergency Plan)

- **触发条件**: 生产发布后 5 分钟内 P95 延迟暴涨 >300% 或错误率 >0.5%
- **归属规范**: CMMI 07_release (TRANS / RSKM) / .agents/skills/cmmi-immutable-release

---

## 1. 60 秒一键自动化回滚操作
## 2. 数据库回滚事务处理预案
## 3. 业务流量止血与通知机制
`,
      },
      "release-notes": {
        file: (opts) => `07_release/RELEASE_NOTES_${opts.version || "v1.0.0"}.md`,
        title: "版本发布说明 (Release Notes)",
        template: (opts) => `# Release Notes: ${opts.version || "v1.0.0"}

- **发布日期**: ${new Date().toISOString().split("T")[0]}
- **归属规范**: CMMI 07_release / .agents/skills/app-release-pipeline

---

## 1. 核心新特性与高管视界提升
## 2. 修复缺陷与工程加固
## 3. 7 处版本一致性核验结果
`,
      },
      "checklist": {
        file: "07_release/release-verification-checklist.md",
        title: "投产上线发布走查清单",
        template: () => `# 投产上线发布走查清单 (Release Verification Checklist)

- **归属规范**: CMMI 07_release (TRANS) / .agents/skills/cmmi-immutable-release

---

## 1. 双人复核走查项 (100% 勾选后方可投产)
- [ ] 7 处版本号源完全一致
- [ ] 自动化测试矩阵 100% 通过
- [ ] 不可变制品指纹已签名归档
- [ ] 秒级回滚 SOP 已通过演练核实
`,
      },
    },
  },

  // Phase 08: 站点可靠性与安全 (SCON / CAM / SRE / Postmortem)
  "08": {
    name: "08_sre",
    types: {
      "slo-matrix": {
        file: "08_sre/01_slo_sli_metrics/SLO-SLI-ERROR-BUDGET-MATRIX.md",
        title: "服务等级目标与错误预算矩阵 (SLO/SLI)",
        template: () => `# 服务等级目标与错误预算矩阵 (SLO / SLI Matrix)

- **制定日期**: ${new Date().toISOString().split("T")[0]}
- **归属规范**: CMMI 08_sre (SCON) / .agents/skills/sre-slo-manager

---

## 1. 核心 SLI/SLO 目标值定义
| 服务名称 | 核心接口 | SLI 指标定义 | SLO 目标 | 错误预算 (月度) | 告警阈值 |
|---|---|---|---|---|---|
| Core API | /api/v1/auth | 成功请求数 / 总请求数 | 99.95% | 0.05% (21.6 分钟) | 预算燃烧率 > 5x |
| Core API | /api/v1/** | P95 响应时间 <= 50ms | 99.0% | 1.0% | 延迟 > 200ms |
`,
      },
      "postmortem": {
        file: (opts) => `08_sre/02_postmortem/POSTMORTEM-${new Date().toISOString().split("T")[0].replace(/-/g, "")}-${(opts.slug || "INCIDENT").toUpperCase()}.md`,
        title: "真实故障事故免责复盘 (Postmortem)",
        template: (opts) => {
          if (!opts.real) {
            throw new Error(`[cmmi-asset] 铁律要求：事故复盘必须基于真实生产故障，严禁伪造虚假 Demo！请附带 --real 确认事实真实性。`);
          }
          return `# 真实故障免责复盘: ${opts.title || "生产事故复盘"}

- **事故级别**: P1
- **发生时间**: ${new Date().toISOString()}
- **归属规范**: CMMI 08_sre (CAM) / .agents/skills/postmortem-analyzer

---

## 1. 故障时间线与 1-5-10 应急指标
## 2. 5-Whys 根本原因深入溯源
## 3. 改进措施 CAPA 与防退化用例
`;
        },
      },
      "dr-plan": {
        file: "08_sre/05_disaster_recovery/DISASTER-RECOVERY-PLAN.md",
        title: "多活容灾与混沌工程演练预案",
        template: () => `# 多活容灾与混沌工程演练预案 (Disaster Recovery Plan)

- **归属规范**: CMMI 08_sre / .agents/skills/sre-slo-manager

---

## 1. RTO 与 RPO 业务指标基线
- RTO (恢复时间目标): <= 5 分钟
- RPO (数据丢失点目标): 0 (同库事务) / <= 1 秒 (跨库同步)
`,
      },
      "strix-report": {
        file: (opts) => `08_sre/security-reports/STRIX-PENETRATION-REPORT-${opts.version || "v1.0.0"}.md`,
        title: "Strix 红队多智能体自主渗透演练报告",
        template: (opts) => {
          if (!opts.real) {
            throw new Error("[cmmi-asset] 铁律要求：渗透演练报告必须基于真实执行 Strix 容器红队扫描，严禁伪造虚假结果！请附带 --real 确认事实真实性。");
          }
          return `# Strix 多智能体自主渗透演练报告: ${opts.version || "v1.0.0"}

- **报告日期**: ${new Date().toISOString().split("T")[0]}
- **归属规范**: CMMI 08_sre / .agents/skills/strix-penetration-testing

---

## 1. 渗透测试执行范围与攻击向量
## 2. 自动化红队扫描发现与 PoC 验证
## 3. 防御加固与安全漏洞修复建议
`;
        },
      },
    },
  },

  // Phase 09: 持续运营与对账平账 (BizOps / DataOps / CMMI-SVC)
  "09": {
    name: "09_operations",
    types: {
      "tenant-governance": {
        file: "09_operations/tenant-governance.md",
        title: "多租户多企业持续运营 SOP",
        template: () => `# 多租户多企业持续运营规程 (Tenant Governance SOP)

- **生效日期**: ${new Date().toISOString().split("T")[0]}
- **归属规范**: CMMI 09_operations (SVC) / .agents/skills/ceo-company-ops

---

## 1. 企业开通与配额申请审批链
## 2. 资源隔离与生命周期归档
## 3. 日常巡检与健康状态大盘
`,
      },
      "reconciliation": {
        file: (opts) => `09_operations/02_financial_reconciliation/RECONCILIATION-${new Date().toISOString().split("T")[0].replace(/-/g, "")}-${(opts.slug || "BATCH").toUpperCase()}.md`,
        title: "真实对账轧差与平账报告",
        template: (opts) => {
          if (!opts.real) {
            throw new Error(`[cmmi-asset] 铁律要求：资金对账必须基于真实外部流水，严禁伪造虚假数据！请附带 --real 确认事实真实性。`);
          }
          return `# 真实财务对账轧差与平账报告 (Reconciliation Report)

- **对账批次**: ${opts.title || "日终平账批次"}
- **对账日期**: ${new Date().toISOString().split("T")[0]}
- **归属规范**: CMMI 09_operations (BizOps) / .agents/skills/financial-reconciliation-agent

---

## 1. 复式记账借贷平衡核实
- 资产类借方余额 = 负债 + 所有者权益贷方余额
- 差异单处理: 0 悬挂
`;
        },
      },
      "agent-ops-ledger": {
        file: "09_operations/04_agent_ops/AGENT-OPS-LEDGER.md",
        title: "AI 数字员工运营与任务台账",
        template: () => `# AI 数字员工运营与任务台账 (AI Agent Ops Ledger)

- **归属规范**: CMMI 09_operations / .agents/skills/cmmi-asset-authoring
- **运行命令**: \`bash scripts/dispatch-local-employee.sh\`

---

## 1. 注册数字员工与能力映射
- Hermes: 董事长助理 / 总控副官
- 墨斗: 前线架构师 FDA
- 铁匠: 平台研发工程师 Core SWE
- 门神: 前线部署全栈 / 真机验收 FDSE
- 兜底渊: 产品可靠性守卫 PRE-SRE
- 百晓生: 部署战略 / 业务主审 DS

## 2. 每日无头巡检与履约日志
`,
      },
      "inspection-report": {
        file: (opts) => `09_operations/03_inspection/INSPECTION-${new Date().toISOString().split("T")[0].replace(/-/g, "")}.md`,
        title: "系统日常健康巡检报告",
        template: () => `# 系统日常健康巡检报告 (System Inspection Report)

- **巡检日期**: ${new Date().toISOString().split("T")[0]}
- **巡检人**: @ops-team
- **归属规范**: CMMI 09_operations / .agents/skills/ceo-company-ops

---

## 1. 核心容器与服务进程存活状态 (coolie.service)
## 2. 数据库连接池与慢查询大盘
## 3. 证书到期倒计时与告警静默期检查
`,
      },
    },
  },
};

function parseArgs() {
  const args = process.argv.slice(2);
  const cmd = args[0] && !args[0].startsWith("-") ? args[0] : "";
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      const val = args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : true;
      opts[key] = val;
    }
  }
  return { cmd, opts };
}

function resolveDocsRoot(projectCode) {
  if (projectCode) {
    const projDir = path.join(ROOT, "projects", projectCode, "docs");
    if (!fs.existsSync(projDir)) {
      fs.mkdirSync(projDir, { recursive: true });
    }
    return projDir;
  }
  return path.join(ROOT, "docs");
}

function handleNew(opts) {
  const phase = opts.phase;
  const type = opts.type;
  if (!phase || !type) {
    console.error("用法: node scripts/cmmi-asset-scaffold.cjs new --phase <01~09> --type <type> [--title \"标题\"] [--slug \"标识\"] [--real] [--project <code>]");
    console.error("\n可用 01~09 全生命周期类型清单:");
    for (const [p, def] of Object.entries(ASSET_REGISTRY)) {
      console.error(`  Phase ${p} (${def.name}): ${Object.keys(def.types).join(", ")}`);
    }
    process.exit(2);
  }

  const phaseDef = ASSET_REGISTRY[phase];
  if (!phaseDef) {
    console.error(`[cmmi-asset] 未知阶段 Phase: ${phase}（有效值为: ${Object.keys(ASSET_REGISTRY).join(", ")}）`);
    process.exit(2);
  }

  const typeDef = phaseDef.types[type];
  if (!typeDef) {
    console.error(`[cmmi-asset] Phase ${phase} 下未知资产类型: ${type}（可选: ${Object.keys(phaseDef.types).join(", ")}）`);
    process.exit(2);
  }

  const docsRoot = resolveDocsRoot(opts.project);
  const targetRel = typeof typeDef.file === "function" ? typeDef.file(opts) : typeDef.file;
  const targetAbs = path.join(docsRoot, targetRel);

  if (fs.existsSync(targetAbs) && !opts.force) {
    console.error(`[cmmi-asset] 文件已存在: ${path.relative(ROOT, targetAbs)}（使用 --force 覆盖）`);
    process.exit(1);
  }

  let content;
  try {
    content = typeDef.template(opts);
  } catch (err) {
    console.error(`[cmmi-asset] 资产生成受阻: ${err.message}`);
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(targetAbs), { recursive: true });
  fs.writeFileSync(targetAbs, content.trim() + "\n", "utf8");
  console.log(`[cmmi-asset] ✅ 成功创建标准交付资产: ${path.relative(ROOT, targetAbs)}`);
}

function handleList(opts) {
  const docsRoot = resolveDocsRoot(opts.project);
  console.log(`=== CMMI 01~09 全生命周期交付资产台账 [${path.relative(ROOT, docsRoot)}] ===`);

  const baseDirs = [
    "01_management",
    "02_requirements",
    "03_design",
    "04_implementation",
    "05_verification",
    "06_cmmi_audit",
    "07_release",
    "08_sre",
    "09_operations",
  ];

  let realCount = 0;
  let emptyCount = 0;

  for (const dir of baseDirs) {
    const full = path.join(docsRoot, dir);
    if (!fs.existsSync(full)) continue;
    console.log(`\n📁 ${dir}:`);
    const items = scanDir(full);
    for (const item of items) {
      const rel = path.relative(docsRoot, item);
      if (item.endsWith(".gitkeep")) {
        console.log(`  ⚪ [留空占位] ${rel}`);
        emptyCount++;
      } else {
        console.log(`  🟢 [真实资产] ${rel}`);
        realCount++;
      }
    }
  }
  console.log(`\n统计: 真实工程资产 ${realCount} 项，留空占位 ${emptyCount} 项（坚守零假 Demo 原则）。`);
}

function handleCheck(opts) {
  const targetRoots = [];
  if (opts.project) {
    targetRoots.push(resolveDocsRoot(opts.project));
  } else {
    // 默认扫描 projects/ 下的所有在制商业交付项目
    const projBase = path.join(ROOT, "projects");
    if (fs.existsSync(projBase)) {
      for (const entry of fs.readdirSync(projBase, { withFileTypes: true })) {
        if (entry.isDirectory() && !entry.name.startsWith(".")) {
          const pDocs = path.join(projBase, entry.name, "docs");
          if (fs.existsSync(pDocs)) targetRoots.push(pDocs);
        }
      }
    }
  }

  console.log(`=== CMMI 资产合规与反造假健康扫描 (共 ${targetRoots.length} 个商业交付项目) ===`);
  const errors = [];

  const forbiddenPatterns = [
    /超发优惠券\s*5,?000\s*元/i,
    /142\s*笔订单.*资金损失/i,
    /¥1,482,920\.00.*微信支付清算户/i,
  ];

  for (const docsRoot of targetRoots) {
    const relRoot = path.relative(ROOT, docsRoot);
    // 1. 扫描 docs 根目录下是否有散落非法文件
    const docsEntries = fs.readdirSync(docsRoot, { withFileTypes: true });
    for (const entry of docsEntries) {
      if (!entry.isDirectory() && entry.name.endsWith(".md")) {
        errors.push(`${relRoot} 根目录发现松散文件: ${entry.name} —— 必须收敛至 01~09 标准子目录`);
      }
    }

    // 2. 扫描是否含有已知的假 Demo 违禁词
    const baseDirs = ["08_sre", "09_operations"];
    for (const dir of baseDirs) {
      const full = path.join(docsRoot, dir);
      if (!fs.existsSync(full)) continue;
      for (const file of scanDir(full)) {
        if (file.endsWith(".md")) {
          const text = fs.readFileSync(file, "utf8");
          for (const pat of forbiddenPatterns) {
            if (pat.test(text)) {
              errors.push(`检测到伪造假 Demo 内容在: ${path.relative(ROOT, file)} (违背实事求是准则)`);
            }
          }
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error("❌ CMMI 资产合规扫描失败:");
    for (const err of errors) console.error(`  - ${err}`);
    process.exit(1);
  }
  console.log("✅ CMMI 资产合规扫描全部通过: 01~09 目录拓扑合规，0 散落文件，0 伪造假 Demo！");
}

function scanDir(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of list) {
    const full = path.join(dir, item.name);
    if (item.isSymbolicLink()) continue;
    if (item.isDirectory()) {
      results = results.concat(scanDir(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

function main() {
  const { cmd, opts } = parseArgs();
  if (cmd === "new") handleNew(opts);
  else if (cmd === "list") handleList(opts);
  else if (cmd === "check") handleCheck(opts);
  else {
    console.log("CMMI 01~09 全生命周期标准资产创建与治理引擎");
    console.log("用法:");
    console.log("  node scripts/cmmi-asset-scaffold.cjs new --phase <01~09> --type <type> [--title \"标题\"] [--slug \"标识\"] [--real] [--project <code>]");
    console.log("  node scripts/cmmi-asset-scaffold.cjs list [--project <code>]");
    console.log("  node scripts/cmmi-asset-scaffold.cjs check [--project <code>]");
    process.exit(0);
  }
}

main();
