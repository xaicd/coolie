# Coolie 交付工厂三大中枢命脉全景真理源 (Master Pillars & Architecture SSOT)

> **最高定位**: 全平台**标准 CI/CD 流程、系统架构中枢、CMMI 5 工程规范**的唯一权威总索引与不可变真理源 (Single Source of Truth, SSOT)。  
> **核心原则**: 脱水去冗、保留骨架、代码守卫、实证闭环。任何文档精简或规则演进，**严禁削弱或遗漏本文件所定义的任何工程基石**！

---

## 🏛️ 命脉一：全平台系统架构与物理拓扑全景 (System Architecture & Topology)

### 1. 物理环境网络拓扑与主机矩阵 (Multi-Host Topology)
全平台数字员工体系运行于多机混合拓扑中，依托 Tailscale 网状网络与 SSH 互联互通：

| 主机节点标识 | 系统与架构 | 核心职责与独占硬件能力 | 默认工作区映射 | 穿透调用通道 |
| :--- | :--- | :--- | :--- | :--- |
| **`mac`** (Mac Studio) | macOS arm64 (Darwin) | 前线指挥驾驶舱、Android 模拟器、Xcode/iOS 模拟器、Node 24、brew | `/host-workspace` | 本地执行 / host-exec |
| **`cwall`** | Ubuntu 24.04 x86_64 | 高性能算力节点 (NVIDIA RTX 4090 GPU、376GB 内存)，重型计算与模型推理 | `./workspace` ➜ `/root/workspace` | `ssh cwall` / Tailscale |
| **`aja-pc`** | Ubuntu 24.04 x86_64 | 文旅交付与业务中台 (`wenlv-next` 等业务项目交付) | `./workspace` ➜ `/root/workspace` | `ssh aja-pc` / Tailscale |
| **`tc-coolie-claw`** | Ubuntu 24.04 x86_64 | 生产服务器，承载 coolie 控制面系统服务 (`systemctl status coolie`) | `./workspace` ➜ `/root/workspace` | `ssh tc-coolie-claw` |

> 📌 **穿透工具**: 系统全局安装 [`host-exec`](file:///usr/local/bin/host-exec)，容器内遇宿主机独占硬件工具（模拟器、显卡、`systemctl`）自动穿透。

### 2. 双物理世界与生命周期彻底解耦铁律 (Dual-World Physical Isolation)
- **世界一：Coolie 工坊平台自身建设 (`coolie-dev`)**：
  - 物理承载：Mac 宿主机（前线指挥舱、模拟器、Metro 8081、Node 24）；
  - 职责：建设控制面系统、移动端原生 APP、数字员工协作机制、工具链与调度器；
  - 关切：**研发体验流畅迅捷**，根除墨迹、繁杂、断流与假死，高频自主 Loop 稳定保活。
- **世界二：商业客户项目交付工厂 (`coolie-prod`)**：
  - 物理承载：云端生产服务器集群（`tc-coolie-claw` + `aja-pc` + `cwall`）；
  - 职责：承载各行业商业交付项目（如云南移动企微、九夏智居中台等）；
  - 关切：**契约守恒与客户终验**，100% 落实 CMMI 01~09 过程真资产，现场 0 故障。

### 3. 六位一体超级集成体架构 (Super-Foundry 6-in-1 Architecture)
1. **控制面中枢 (Paperclip Backbone)**：单人负责人原子签出锁、预算硬熔断、原生协同文档 (`documents`)、工件总线 (`issue_work_products`)；
2. **认知与决策 (Palantir Living Ontology)**：以 263 张物理表为底座，业务实体 (Object Types) + 业务动词 (Action Types) 双核贯通，任务施工挂载因果血缘；
3. **过程与质量 (CMMI 5 High Maturity)**：G1 需求 $\rightarrow$ G2 架构 $\rightarrow$ G3 契约 $\rightarrow$ G4 验证 $\rightarrow$ G5 投产全链路资产化；
4. **底座与工程 (Adaptive Blueprints)**：
   - **`yudao-quad-terminal`**：Java 17/21 + Spring Boot 3 + Vue3 + Uni-App + Expo 原生 App（19 行业域，政企信创、多端全覆盖）；
   - **`ruoyi-all-next`**：TypeScript + Next.js 16 + React 19 + Tailwind + Prisma（极速打样、纯 Web / POC 原型）；
5. **极简人机驾驶舱 (Minimalist Cockpit)**：6 寸屏 320dp 几何防撑爆、黄金 5 槽位绝对对称底栏、两字极简 UI、LIFO 就地调用栈；
6. **算力与调度中枢 (Flat Agent Fleet)**：Hermes 统筹调度 7 大免交互工具池（`agy`, `claude-glm`, `claude-mm`, `cmd`, `copilot`, `kiro-cli`, `hermes`）。

---

## 🚀 命脉二：标准 CI/CD 流程与发版全景 (Standard CI/CD Pipelines & SOPs)

全平台 CI/CD 流程分为**本地门禁、云端流水线、生产割接、移动端打包与秒级回滚**五大标准环节：

```
代码编写 ──> [Gate 0: Pre-Commit 25道硬守卫] ──> Git Commit & Push
                     │ (拦截编译报错/规范违规)
                     ▼
             [Gate 1: GitHub Actions 21条云端CI流水线]
                     │ (自动化单测 / 端到端 E2E / 多架构构建)
                     ▼
             [Gate 2: 生产环境 7步无缓存部署 (release.sh)]
                     │ (Pre-commit ➜ Commit ➜ 远端构建 ➜ 7步拨测)
                     ▼
             [Gate 3: 移动端原生包与 OTA 增量发版]
                     │ ├── 原生 APK: release-app.sh (7处版本一致性机检)
                     │ └── Expo OTA: publish-ota.sh (防 Caddy 兜底陷阱)
                     ▼
             [Gate 4: 线上异常秒级回滚预案 (rollback-latest.sh)]
```

### 1. 提交前本地 25 道机检硬门禁 (Pre-Commit Gates)
- **触发命令**: `pnpm pre-commit`（或由 git commit 钩子自动触发 [`scripts/pre-commit-check.mjs`](file:///host-workspace/xaicd/coolie/scripts/pre-commit-check.mjs)）；
- **门禁清单**:
  - `Gate 1`: 根目录白名单骨架守卫与 `MEMORY.md` ≤ 8KB 硬门禁；
  - `Gate 2`: 敏感凭据与私钥泄漏硬拦截；
  - `Gate 3`: 违禁词与涉密标识审计；
  - `Gate 4`: 核心全生命周期交付审计（[`scripts/check-governance-audit.mjs`](file:///host-workspace/xaicd/coolie/scripts/check-governance-audit.mjs)）；
  - `Gate 5`: 暂存受影响包 TypeScript 增量类型检查（0 报错）。

### 2. 自动化测试四轨统筹流水线
- **触发命令**: `pnpm test:mcp:all`（[`scripts/run-mcp-tests.mjs`](file:///host-workspace/xaicd/coolie/scripts/run-mcp-tests.mjs)）；
- **执行内容**:
  - `Track 1`: 全量 95 项 MCP CLI 契约与端到端测试 (`mcp-call.test.mjs`, 20/20 PASS)；
  - `Track 2`: QA 页面级四态与 320dp 几何防遮挡存证走查 (`qa-mcp-e2e-suite.mjs`, 10/10 PASS)；
  - `Track 3`: `@paperclipai/mcp-server` 95 项工具 Vitest 契约单测 (`src/tools.test.ts`, 96/96 PASS)；
  - `Track 4`: 自动化测试向真实用户自动化运营履约闭环测试 (`ops-autonomous-user-engine.test.mjs`, 17/17 PASS)。

### 3. 服务端生产部署 7 步铁律 (Server Deployment SOP)
- **核心脚本**: [`scripts/release.sh`](file:///host-workspace/xaicd/coolie/scripts/release.sh) 与 [`scripts/deploy-server.sh`](file:///host-workspace/xaicd/coolie/scripts/deploy-server.sh)；
- **部署七步法**:
  1. `Pre-commit` 门禁本地全绿；
  2. `Commit` 生成不可变 SHA；
  3. 远端拉取最新基线；
  4. 无缓存构建生产镜像与资源；
  5. 重建并重启生产服务进程；
  6. 线上健康 7 步拨测（HTTP 200 / API Ping / DB 连接）；
  7. 登记部署履约账本。

### 4. 移动端原生 App 打包与 OTA 增量发版
- **原生 App 打包**:
  - 核心脚本: [`scripts/release-app.sh`](file:///host-workspace/xaicd/coolie/scripts/release-app.sh)；
  - 守卫规范: [`scripts/version-consistency-check.sh`](file:///host-workspace/xaicd/coolie/scripts/version-consistency-check.sh) 强制 7 处版本号源（`app.json`, `package.json`, `build.gradle`, `CHANGELOG`, `version.json`, `manifest`, `git tag`）严格一致。
- **Expo OTA 纯 JS 热更新**:
  - 核心脚本: [`scripts/publish-ota.sh`](file:///host-workspace/xaicd/coolie/scripts/publish-ota.sh)；
  - 避坑守卫: 必须规避 Caddy 生产兜底将 manifest 路由成 HTML 的陷阱，launchAsset 强制附带 SHA-256 hash。

### 5. 秒级回滚预案 (Rollback SOP)
- **触发命令**: `pnpm release:rollback` 或运行 [`scripts/rollback-latest.sh`](file:///host-workspace/xaicd/coolie/scripts/rollback-latest.sh)；
- **回滚机制**: 基于生产上一版本备份原子软链切换，秒级复原系统可用性。

---

## 📐 命脉三：CMMI 5 软件工程全生命周期规范 (Engineering Specifications)

### 1. G1~G7 质量门禁流水线
```
G1 需求规格 (SRS) ──> G2 架构设计 (HLD) ──> G3 静态契约 (LLD) ──> G4 真实验证 (VER/VAL) ──> G5 投产上线 ──> G6/G7 运营复盘
```
- **G1 需求门禁**: 严谨 EARS 规格，双向需求跟踪矩阵 (RTM)，消除二义性（[`cmmi-req-spec`](file:///host-workspace/xaicd/coolie/.agents/skills/cmmi-req-spec/SKILL.md)）；
- **G2 架构门禁**: 租户物理隔离方案、DAR 加权决策选型矩阵、FDA 一票否决权（[`cmmi-tech-solution`](file:///host-workspace/xaicd/coolie/.agents/skills/cmmi-tech-solution/SKILL.md)）；
- **G3 编译门禁**: OpenAPI 契约、TypeScript 强类型 SDK、Monorepo 全仓 **0 编译报错**（[`cmmi-detailed-contracts`](file:///host-workspace/xaicd/coolie/.agents/skills/cmmi-detailed-contracts/SKILL.md)）；
- **G4 验收门禁**: 四态真机截图、320dp 几何防遮挡、白屏探测、变异测试杀灭假 Mock（[`cmmi-ver-val`](file:///host-workspace/xaicd/coolie/.agents/skills/cmmi-ver-val/SKILL.md)）；
- **G5 投产门禁**: 7 处版本一致、不可变制品指纹、SRE 秒级回滚预案（[`cmmi-immutable-release`](file:///host-workspace/xaicd/coolie/.agents/skills/cmmi-immutable-release/SKILL.md)）；
- **G6~G7 运营门禁**: Google SRE SLO/SLI 度量、5-Whys CAR 缺陷根本原因复盘。

### 2. 五大不可逾越的物理工程红线
1. **No Artifact, No Done（无工件不完工）**：工单标为 `done` 时强制挂载实质性物理工程资产（Commit SHA、测试报告、真机快照、不可篡改账本）；
2. **1 Task = 1 Commit & Clean Working Tree**：工单完工提交后工作树必须保持 `0 dirty, 0 untracked`，严禁 `git stash` 掩埋未完工代码；
3. **单一人原子签出锁 (Single Assignee Checkout Lock)**：接单必须先原子签出上锁，杜绝多 Agent 冲突踩踏；
4. **极简两字 UI 契约**：移动端所有核心操作按钮文案严格 `≤ 2 字`（如“同意”、“驳回”、“新建”、“查询”、“核销”）；
5. **6 寸屏极限物理视口防御**：必须严格适配 `320px~332px` 极限窄视口，底部触控组件遮挡率 `≤ 5.0%`。

---

## 🧭 权威导航索引总表 (Quick Links)

| 核心领域 | 权威真理源文档 | 核心执行脚本 / 门禁 |
| :--- | :--- | :--- |
| **进场首屏** | [`MEMORY.md`](file:///host-workspace/xaicd/coolie/MEMORY.md) (≤8KB 极简全景) | `git status` / `pnpm check:governance` |
| **战略愿景** | [`GOALS.md`](file:///host-workspace/xaicd/coolie/GOALS.md) (北极星愿景与架构大纲) | `pnpm check:token-gates` |
| **最高宪法** | [`AGENTS.md`](file:///host-workspace/xaicd/coolie/AGENTS.md) (平台 12 大公理体系) | [`scripts/pre-commit-check.mjs`](file:///host-workspace/xaicd/coolie/scripts/pre-commit-check.mjs) |
| **架构 HLD** | [`docs/03_design/architecture-design-hld.md`](file:///host-workspace/xaicd/coolie/docs/03_design/architecture-design-hld.md) | `node scripts/check-module-boundaries.mjs` |
| **标准 CI/CD** | [`docs/07_release/system-deployment-sop.md`](file:///host-workspace/xaicd/coolie/docs/07_release/system-deployment-sop.md) | [`scripts/release.sh`](file:///host-workspace/xaicd/coolie/scripts/release.sh) / [`scripts/release-app.sh`](file:///host-workspace/xaicd/coolie/scripts/release-app.sh) |
| **MCP 四轨验证**| [`docs-coolie/specs/2026-10-17-full-stack-api-and-page-mcp-inventory.md`](file:///host-workspace/xaicd/coolie/docs-coolie/specs/2026-10-17-full-stack-api-and-page-mcp-inventory.md) | [`scripts/run-mcp-tests.mjs`](file:///host-workspace/xaicd/coolie/scripts/run-mcp-tests.mjs) (`pnpm test:mcp:all`) |
| **运营履约** | [`.agents/rules/TEST-TO-OPS-AUTONOMOUS-USER-STANDARD.md`](file:///host-workspace/xaicd/coolie/.agents/rules/TEST-TO-OPS-AUTONOMOUS-USER-STANDARD.md) | [`scripts/ops-autonomous-user-engine.mjs`](file:///host-workspace/xaicd/coolie/scripts/ops-autonomous-user-engine.mjs) |
