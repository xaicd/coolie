# Coolie AI 原生商业软件交付工厂控制面平台 · 系统概要设计说明书 (HLD)

> **文档代号**: COOA-HLD-v2.0.0  
> **项目全称**: Coolie AI 原生商业软件交付工厂控制面平台 (AI 原生端到端商业软件交付工厂控制面平台)  
> **基线版本**: v2.0.0 (生产冻结稳定版)  
> **制定日期**: 2026-10-17  
> **归属规范**: CMMI 03_design (TS) / IEEE 1016-2009 / GB/T 8567-2006 (HLD) / .agents/skills/cmmi-tech-solution  

---

## 1. 系统定位与架构愿景 (System Overview & Architectural Vision)

Coolie AI 原生商业软件交付工厂控制面平台 定位为全流程由 AI 数字员工驱动的**「端到端商业软件交付工厂控制面平台 (Foundry Control Plane)」**。平台从软件交付公司的合伙人与总架构师顶层视角出发，解决传统商业交付中“需求漂移、代码腐化、人肉评审滞后、文档与代码两张皮”等顽疾。

系统严格贯彻三层物理生命周期隔离：
1. **第一层：工厂指挥决策中枢 (Console & Mobile Cockpit)**：专属于掌柜、交付总监与前线 FDE，提供全盘态势感知、一句话意图派单、两字审批卡片与移动端随身看盘；
2. **第二层：软件制造工程流水线 (Delivery Foundry Pipeline)**：专属于数字员工（Hermes/墨斗/铁匠/门神/百晓生），从 0 到 1 建造并交付真实工程资产（需求 SRS、架构 HLD、契约 LLD、源码 Repo、全栈测试集、割接 SOP）；
3. **第三层：业务落地运行系统 (Delivered Application)**：专属于客户生产环境（如云南移动企微中台、社区生活服务商用中台等），承载真实业务流水。

---

## 2. 总体 4+1 架构全景视图 (4+1 Architectural View Model)

```
┌────────────────────────────────────────────────────────────────────────┐
│                   1. 逻辑视图 (Logical View)                           │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 驾驶舱层: Web 控制台 (React 19) + 移动端 (Expo SDK 52 / 6寸屏防御) │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │ 控制面层: Express.js 5 REST API + 单人签出锁 + 预算硬熔断 + 审批流 │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │ 活体本体层: Palantir 双核 (8 实体 + 8 动词 + 5 不变量) 反射 263 表 │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │ 数据持久层: Drizzle ORM (PostgreSQL 生产 / PGlite 本地脱机)       │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │ 调度算力层: Hermes 调度中枢 + 7 工具池 + Tailscale 多主机 Mesh     │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.1 逻辑视图 (Logical View)
- **极简人机交互层 (Minimalist UI)**：
  - Web 端：基于 React 19 + Vite 6 + Tailwind CSS 4 构建，支持大盘看板、工单管理与协同文档；
  - 移动端：基于 React Native + Expo SDK 52 构建（`clients/expo/`），严格执行 320dp 几何防撑爆、黄金 5 槽位绝对对称底栏、两字动词按钮与就地防遮挡浮层。
- **控制面编排服务层 (Control Plane Server)**：
  - 基于 Node.js 24.11.0 + Express 5，以 Company 为边界实施行级租户隔离；
  - 核心服务包括心跳调度 (`heartbeat.ts`)、工单原子签出 (`issues.ts`)、实时费用统计与硬熔断 (`costs.ts`)、卡片式审批流 (`approvals.ts`)、交付主线巡检守护 (`routines.ts`)。
- **活体业务本体中枢 (Living Ontology Engine)**：
  - 独立根目录 `/ontology/`，基于 Palantir 活体本体理念构建，定义实体 (Object Types)、动词 (Action Types) 与系统不变量 (Invariants)，对 Drizzle 263 张物理表实施 100% 自动化双向反射审计。
- **数据持久化层 (Persistence Layer)**：
  - 基于 Drizzle ORM，自动适配双模运行：生产环境直连 PostgreSQL 17，本地脱机开发与单测直连内嵌 WebAssembly PGlite。

### 2.2 进程与线程视图 (Process & Concurrency View)
- 单人负责人原子锁（同一时刻唯一执行人持有 Issue 签出锁）；
- 交付主线巡检守护进程 (`scripts/coolie-dev-loop-supervisor.mjs`) 常驻运行，维护小时级生命周期；
- 移动端与 Web 端通过 WebSocket / Server-Sent Events 实现长任务心跳与非阻塞状态同步。

### 2.3 开发与工程视图 (Development & Monorepo View)
- 根目录采用 PNPM Workspaces 架构：`server/`, `ui/`, `clients/expo/`, `clients/h5/`, `packages/db/`, `packages/shared/`, `scripts/`；
- 100% 契约驱动：接口契约与 TypeScript 类型强校验，增量编译 0 报错拦截。

### 2.4 物理部署视图 (Deployment & Topology View)
- 多机网络拓扑：通过 Tailscale Mesh 连接 `mac` (驾驶舱/模拟器), `cwall` (GPU算力), `aja-pc` (交付中台), `tc-coolie-claw` (生产服务)；
- 宿主机穿透调用：全局 `host-exec` 自动映射物理工作区。

### 2.5 核心用例场景视图 (Use Case Scenario View)
- 掌柜自然语言一句话进厂 ➔ Hermes 解析转译排期 Issue ➔ 墨斗 FDA 架构建模 ➔ 铁匠 Core SWE 契约编码 ➔ 门神 FDSE 真机快照走查 ➔ 掌柜手机卡片两字【审批】➔ 自动割接上线。
