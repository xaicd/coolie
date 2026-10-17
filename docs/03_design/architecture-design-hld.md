# Coolie AI 原生商业软件交付工厂控制面平台 · 系统概要设计说明书 (HLD)

> **文档代号**: COOA-HLD-v2.0  
> **项目全称**: Coolie AI-Native Commercial Software Delivery Foundry (AI 原生端到端商业软件交付工厂控制面平台)  
> **基线版本**: v2.0.0 (生产冻结稳定版)  
> **制定日期**: 2026-10-17  
> **归属规范**: CMMI 03_design (TS) / IEEE 1016-2009 / GB/T 8567-2006 (HLD) / .agents/skills/cmmi-tech-solution  

---

## 1. 系统定位与架构愿景 (System Overview & Architectural Vision)

Coolie 定位为全流程由 AI 数字员工驱动的**「端到端商业软件交付工厂控制面平台 (Foundry Control Plane)」**。平台从软件交付公司的合伙人与总架构师顶层视角出发，解决传统商业交付中“需求漂移、代码腐化、人肉评审滞后、文档与代码两张皮”等顽疾。

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
  - 移动端：基于 React Native + Expo SDK 52 构建（`clients/expo/`），严格执行 320dp 几何防撑爆、黄金 5 槽位绝对对称底栏、两字动词按钮与就地浮层防遮挡。
- **控制面编排服务层 (Control Plane Server)**：
  - 基于 Node.js 24 + Express 5，以 Company 为边界实施行级租户隔离；
  - 核心服务包括心跳调度 (`heartbeat.ts`)、工单原子签出 (`issues.ts`)、实时费用统计与硬熔断 (`costs.ts`)、卡片式审批流 (`approvals.ts`)、交付主线巡检守护 (`routines.ts`)。
- **活体业务本体中枢 (Living Ontology Engine)**：
  - 独立根目录 `/ontology/`，基于 Palantir 活体本体理念构建，定义实体 (Object Types)、动词 (Action Types) 与系统不变量 (Invariants)，对 Drizzle 263 张物理表实施 100% 自动化双向反射审计。
- **数据持久化层 (Persistence Layer)**：
  - 生产环境采用 PostgreSQL 17；开发/单测环境自动降级至 WebAssembly 内嵌式 PGlite（`DATABASE_URL=""`），实现零外部依赖开箱即用。
- **算力与数字员工执行层 (Agent Fleet)**：
  - Hermes 调度中枢协调 7 大工具池 (`agy`, `claude`, `cmd` 等)，配置 `--dangerously-skip-permissions` 免交互自主执行。

### 2.2 过程视图 (Process View)
1. **自然语言意图进厂**:
   - 掌柜输入口语 -> Hermes 语法转译器 (`hermes-boss-intent-dispatcher.sh`) -> 控制面正式立项创建 Issue 工单 -> 挂载 ActionType 与 WBS 里程碑。
2. **单人原子签出锁机制**:
   - 智能体接活必须通过 `POST /api/issues/:id/checkout` 获取原子签出锁，同一时刻同一工单绝对单写者，租期心跳自动续期，超时 900s 僵尸回收。
3. **预算熔断与审批卡片**:
   - `costs.ts` 实时累计智能体 Token 开销，触及预算硬停止阈值时立即挂起签出锁，触发掌柜 🔔 审批通知。
4. **Pre-Commit 25 道物理安全门禁**:
   - 提交前强制执行 `scripts/pre-commit-check.mjs`，包含架构拓扑、本体反射、增量编译、i18n 1417 键对称、真机截图存证与物理反向审计。

### 2.3 开发与工程视图 (Implementation View)
- 平台本体遵循 **PNPM Monorepo** 架构：
  - `server/`: 核心 REST API 与控制面业务逻辑；
  - `ui/`: Web 交付大盘管理端；
  - `clients/expo/`: Expo 原生移动端应用；
  - `clients/h5/`: H5 移动驾驶舱；
  - `packages/db/`: Drizzle ORM Schema (263 张物理表) 与数据库迁移；
  - `packages/shared/`: 全平台共享契约、常量、类型与验证器；
  - `ontology/`: 活体业务本体模型定义；
  - `scripts/`: 本地自动化工具链、Harness 调度器与质量门禁。
- 研发提交铁律：**1 Task = 1 Commit & Clean Working Tree (0 dirty, 0 untracked)**。

### 2.4 物理部署视图 (Deployment View)
- 系统依托 Tailscale Mesh 网状网络打通多主机协同：
  - **`mac`** (Mac Studio, `100.84.124.71`): 前线指挥舱、Android/iOS 模拟器、Node 24、brew；
  - **`tc-coolie-claw`** (Ubuntu 24.04, `62.234.59.180`): 生产服务器，承载 coolie 控制面系统服务 (`systemctl status coolie`) 与 Caddy 反向代理；
  - **`cwall`** (Ubuntu 24.04, `100.118.232.61`): 高性能算力节点 (NVIDIA RTX 4090 GPU、376GB 内存)，重型计算与模型推理；
  - **`aja-pc`** (Ubuntu 24.04, `100.101.22.109`): 交付中台 (`wenlv-next` 等业务项目交付)。
  - 容器内通过全局命令 `host-exec` 实现宿主机穿透调用。

---

## 3. 四大不可逾越架构底线 (Architectural Invariants)

| 编号 | 架构底线 | 强制约束与防护机制 | 违规后果与处理策略 |
| :--- | :--- | :--- | :--- |
| **INV-1** | **单人原子签出锁** | 同一工单单写者，心跳丢失 900s 强制解约，DB 层 CAS 校验 | 并发写冲突直接抛出 `409 Conflict` |
| **INV-2** | **活体本体双向反射** | 263 张 Drizzle 物理表与元模型 100% 契合，动词因果拓扑无孤岛 | 门禁 `Gate 4.1` 阻断提交，支持 `--fix` 自动对齐 |
| **INV-3** | **极简两字与 6 寸屏防御** | 核心动作按钮字数 $\le 2$，底栏黄金 5 槽位绝对对称，320dp 几何防撑爆 | 门禁 `Gate 16.2` 与 `Gate 24` 真机走查拦截 |
| **INV-4** | **物理资产完工准则 (No Artifact, No Done)** | 任务标记 `done` 必须挂载远端 Git Commit SHA、在线预览或真机快照 | 服务端直接抛出 `422 Unprocessable Entity` 拒绝流转 |

---

## 4. 架构映射与需求追溯 (Traceability Alignment)
本架构概要设计说明书完全覆盖《软件需求规格说明书 (SRS)》中全部 14 条 EARS 需求，并经由双向需求跟踪矩阵 (RTM) 与 `scripts/cmmi-reverse-audit.mjs` 物理反向审计引擎验证，闭环率达成 **100.0%**。
