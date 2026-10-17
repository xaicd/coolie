<!--
==========================================================================
【组织标准过程资产模版 (OSSP Template)】
类型: 系统总体架构概要设计说明书 (HLD)
归属: CMMI Phase 03 (03_design)
注意: 本文件为纯净空白母本，严禁直接填写项目业务数据！
      使用 node scripts/cmmi-doc-generator.cjs --type hld 或 --all 动态派生落盘。
==========================================================================
-->

# {{PROJECT_TITLE}} · 系统总体架构概要设计说明书 (HLD)

> **文档代号**: {{SYSTEM_CODE}}-HLD-{{VERSION}}  
> **项目全称**: {{PROJECT_TITLE}} ({{PROJECT_SUBTITLE}})  
> **基线版本**: {{VERSION}} (生产冻结稳定版)  
> **制定日期**: {{DATE}}  
> **归属规范**: CMMI 03_design (TS) / IEEE 1016-2009 / GB/T 8567-2006 (HLD) / .agents/skills/cmmi-tech-solution  

---

## 1. 系统定位与架构愿景 (System Overview & Architectural Vision)

{{PROJECT_TITLE}} 定位为全流程由 AI 数字员工驱动的**「端到端商业软件交付工厂控制面平台 (Foundry Control Plane)」**。平台从软件交付公司的合伙人与总架构师顶层视角出发，解决传统商业交付中“需求漂移、代码腐化、人肉评审滞后、文档与代码两张皮”等顽疾。

系统严格贯彻三层物理生命周期隔离：
1. **第一层：工厂指挥决策中枢 (Console & Mobile Cockpit)**：专属于掌柜、交付总监与前线 FDE，提供全盘态势感知、一句话意图派单、两字审批卡片与移动端随身看盘；
2. **第二层：软件制造工程流水线 (Delivery Foundry Pipeline)**：专属于数字员工（Hermes/墨斗/铁匠/门神/百晓生），从 0 到 1 建造并交付真实工程资产（需求 SRS、架构 HLD、契约 LLD、源码 Repo、全栈测试集、割接 SOP）；
3. **第三层：业务落地运行系统 (Delivered Application)**：专属于客户生产环境（如云南移动企微中台、社区生活服务商用中台等），承载真实业务流水。

---

## 2. 总体 4+1 架构全景视图 (4+1 Architectural View Model)

{{HLD_MERMAID_ARCHITECTURE}}

### 2.1 逻辑视图 (Logical View)
- **极简人机交互层 (Minimalist UI)**：
  - Web 端：基于 React 19 + Vite 6 + Tailwind CSS 4 构建，支持大盘看板、工单管理与协同文档；
  - 移动端：基于 React Native + Expo SDK {{EXPO_SDK}} 构建（`clients/expo/`），严格执行 320dp 几何防撑爆、黄金 5 槽位绝对对称底栏、两字动词按钮与就地防遮挡浮层。
- **控制面编排服务层 (Control Plane Server)**：
  - 基于 Node.js {{NODE_VERSION}} + Express 5，以 Company 为边界实施行级租户隔离；
  - 核心服务包括心跳调度 (`heartbeat.ts`)、工单原子签出 (`issues.ts`)、实时费用统计与硬熔断 (`costs.ts`)、卡片式审批流 (`approvals.ts`)、交付主线巡检守护 (`routines.ts`)。
- **活体业务本体中枢 (Living Ontology Engine)**：
  - 独立根目录 `/ontology/`，基于 Palantir 活体本体理念构建，定义实体 (Object Types)、动词 (Action Types) 与系统不变量 (Invariants)，对 Drizzle {{DATABASE_TABLES_COUNT}} 张物理表实施 100% 自动化双向反射审计。
- **数据持久化层 (Persistence Layer)**：
  - 基于 Drizzle ORM，自动适配双模运行：生产环境直连 PostgreSQL 17，本地脱机开发与单测直连内嵌 WebAssembly PGlite。

### 2.2 进程与线程视图 (Process & Concurrency View)
- 单人负责人原子锁（同一时刻唯一执行人持有 Issue 签出锁）；
- 交付主线巡检守护进程 (`scripts/coolie-dev-loop-supervisor.mjs`) 常驻运行，维护小时级生命周期；
- 移动端与 Web 端通过 WebSocket / Server-Sent Events 实现长任务心跳与非阻塞状态同步。

### 2.3 开发与工程视图 (Development & Monorepo View)
全栈仓库采用 PNPM Workspaces 单体多包工程架构：

{{HLD_WORKSPACE_PACKAGES_TABLE}}

### 2.4 物理部署视图 (Deployment & Topology View)
全平台数字员工体系运行于多机混合拓扑中，依托 Tailscale Mesh 网状网络与 SSH 互联互通：

{{HLD_DEPLOYMENT_TOPOLOGY}}

### 2.5 核心用例场景视图 (Use Case Scenario View)
掌柜自然语言一句话进厂 ➔ Hermes 解析转译排期 Issue ➔ 墨斗 FDA 架构建模 ➔ 铁匠 Core SWE 契约编码 ➔ 门神 FDSE 真机快照走查 ➔ 掌柜手机卡片两字【审批】➔ 自动割接上线。
