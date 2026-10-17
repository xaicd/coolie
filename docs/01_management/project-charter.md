# Coolie AI 原生商业软件交付工厂 · 项目立项与范围说明书 (Project Charter)

> **文档代号**: COOA-CHARTER-v2.0  
> **项目全称**: Coolie AI-Native Commercial Software Delivery Foundry (AI 原生端到端商业软件交付工厂控制面平台)  
> **当前基线**: v2.0.0 (生产与交付稳定版)  
> **批准生效**: 2026-10-17  
> **归属规范**: CMMI 01_management (PLAN / MC) / GB/T 8567-2006 / .agents/skills/cmmi-asset-authoring  

---

## 1. 项目背景与商业交付本质 (Business Background & Core Value)

传统软件外包与数字化交付面临“沟通成本高、需求二义性多、交付周期长、文档与代码严重漂移、人员流动引发代码腐化”五大痛点。在运营商（中国移动/中国电信）及政企数字化转型的大型商业交付场景中，甲方往往需要高昂的监督与驻场成本。

Coolie 定位为全流程由 AI 数字员工驱动的**「端到端商业软件交付工厂 (AI-Native Software Delivery Foundry)」**。平台站在**软件交付公司合伙人与总架构师**的顶层商业视角，建立严格的三层物理生命周期隔离：
1. **第一层：工厂指挥决策中枢 (Console & Mobile Cockpit)**：专属于掌柜、交付总监与前线 FDE，提供高信噪比的大盘态势感知、一句话意图派单、两字审批流与移动端随身看盘；
2. **第二层：软件制造工程流水线 (Delivery Foundry Pipeline)**：专属于数字员工（Hermes/墨斗/铁匠/门神/兜底渊），专注交付真实的软件工程资产（需求 SRS、架构 HLD、契约 LLD、源代码 Repo、全栈测试集、割接与回滚 SOP）；
3. **第三层：业务落地运行系统 (Delivered Application)**：专属于客户生产环境（如云南移动企微中台、社区生活服务商用中台），承载真实的业务生产数据。

**终极法定商业目标**：以甲方客户在真实生产环境中、依据《软件需求规格说明书 (SRS)》签署的《客户终验核销单 (UAT Acceptance Certificate)》为最终法律与商业回款准绳。

---

## 2. 交付范围与边界约束 (Project Scope & Boundaries)

### 2.1 包含范围 (In-Scope)
- **控制面底座 (Paperclip Backbone)**：单人负责人原子签出锁、真实预算硬熔断、原生协同协同文档 (`documents`)、多版本工件总线 (`issue_work_products`)；
- **活体业务本体中枢 (Living Ontology)**：依托 263 张物理表管网，建立“项目即本体域、工坊会话即提议、任务施工即动词血缘”的闭环数字孪生系统，支持 100% 自动化零人工介入机器审计；
- **多主机混合拓扑调度 (Multi-Host Hermes Fleet)**：打通 `mac` (指挥舱)、`cwall` (GPU算力)、`aja-pc` (业务中台)、`tc-coolie-claw` (生产服务) 跨主机透明派单与 `host-exec` 穿透调度；
- **极简两字 UI 驾驶舱 (Minimalist Cockpit)**：Web 与 Expo 原生移动端双端实现 320dp 几何防撑爆、黄金 5 槽位绝对对称底栏、两字动词按钮、就地防遮挡浮层；
- **全生命周期 CMMI 5 资产引擎 (Doc-as-Code Pipeline)**：覆盖 01~09 全阶段标准资产批量生成、双向追溯 (RTM) 与 25 道物理预提交门禁；
- **双开源基座自适应架构**：内建 `yudao-quad-terminal` (Java/Spring Boot 3 四位一体) 与 `ruoyi-all-next` (Next.js 16/React 19 轻量全栈) 双核心交付蓝图。

### 2.2 不包含范围 (Out-of-Scope)
- 客户生产期实时业务交易流水（由交付后的三层业务系统自主承载与管理）；
- 任何未经审批的黑盒自动化生产变更；
- 伪造虚拟数据的假 Demo 与空洞报表（严格遵循“No Artifact, No Done”与真实证据驱动原则）。

---

## 3. 核心干系人与 RACI 权责矩阵 (RACI Governance Matrix)

| 角色 | 智能体标识 | 核心职责 | RACI 角色定位 |
| :--- | :--- | :--- | :---: |
| **掌柜 / CEO** | `@boss` / Operator | 交付商业价值把控、高管卡片审批、预算终审与最终核销回款 | **A** (Accountable) |
| **Hermes 调度中枢** | `@hermes` | 全局意图分发、7 大免交互工具池派单、断网猝死接力与例行巡检 | **R** (Responsible) |
| **墨斗 (FDA 前线架构师)** | `@modou` | 组织租户物理隔离方案、领域模型边界、HLD 与 DAR 架构选型 | **R** (Responsible) |
| **铁匠 (Core SWE 核心研发)** | `@tiejiang` | 静态契约 LLD、领域服务编码、增量编译 0 报错与 1 Task = 1 Commit | **R** (Responsible) |
| **门神 (FDSE 前线部署)** | `@menshen` | 状态机穷举、防御性 UI 交互、移动真机四态快照集成走查 | **R** (Responsible) |
| **百晓生 (DS 业务方案专家)** | `@baixiaosheng` | EARS 5态需求规格收敛、RTM 双向追溯矩阵、业务旅程主审与投产一票否决 | **C** (Consulted) |
| **SRE 稳定与合规守护者** | `@sre` | 不可变制品指纹签名、生产割接 SOP、15 分钟秒级回滚预案与 SLO 监控 | **I** (Informed) |

> **注**: R = 执行者 (Responsible), A = 问责/决策者 (Accountable), C = 咨询/评审者 (Consulted), I = 知情者 (Informed)。遵循**“写的人不查自己”**的同行评审权责分离铁律。
