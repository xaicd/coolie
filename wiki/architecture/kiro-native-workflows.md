# 架构支柱：Kiro SDD 原生多智能体工作流引擎与配方体系

- **核心运行引擎**：
  工作流是把 SDD 规格从静态 Markdown 推向多智能体自动化执行的核心引擎。
- **物理单一真源与软链接桥接**：
  - 单一真源：`.agents/workflows/*.workflow.json`
  - Kiro IDE 原生软链接桥接：`.kiro/workflows -> ../.agents/workflows`
- **6 大核心工作流与商业配方体系**：
  1. `feature-delivery.workflow.json`：全生命周期新特性交付
  2. `bugfix.workflow.json`：缺陷排查与红绿验证 (5-Whys + Red-to-Green)
  3. `architecture-refactor.workflow.json`：架构债务消除与渐进演进
  4. `security-patch.workflow.json`：安全加固与 PoC 红蓝渗透验证
  5. `business-recipes/commercial-backend-module.workflow.json`：商用微服务后端模块交付 (活体本体建模 -> 2PC 契约预检 -> 微服务编码 -> 跨端转译 -> 变异测试 -> 不可变核销)
  6. `business-recipes/quad-terminal-feature.workflow.json`：四位一体多端特性交付 (EARS需求 -> 四端架构 -> 后端契约 -> Vue3中台 -> 微信小程序 -> Expo原生App -> 拟真人走查)
- **新 SOA 架构两大工程机制**：
  - **场景配方优先 (Recipe First)**：80% 工业级成熟流程走固定步骤模板与门禁，20% 探索性任务走动态 DAG；
  - **两阶段写操作 (2PC Prepare / Commit)**：数据写入类工序强制 Prepare（预检无破坏性变更、输出影响面摘要与 prepareToken）后方可 Commit 写入，保障履约安全；
  - **步骤级最小输入资产切片**：步骤间只传递该步骤所需输入与前序工件，彻底杜绝全量历史上下文拼接引发的 E2BIG 险情。
- **统一工作流 CLI 引擎 (`scripts/workflow-engine.cjs`)**：
  - `pnpm run workflow:list`：检视全量配方清单与依赖
  - `pnpm run workflow:business-list`：快捷筛选商业交付场景配方清单
  - `pnpm run workflow:check`：DAG 有向无环图深度扫描、语法与 2PC phase 门禁校验
  - `pnpm run workflow:dry-run`：模拟展开输出 Mermaid DAG、角色指令、2PC 阶段与产出工件路径
  - `pnpm run workflow:run`：驱动执行脚手架并落盘执行流水
  - `pnpm run workflow:advance`：因果推进阶段、同步项目本地工件并联动控制面任务
  - `pnpm run workflow:new`：脚手架生成新配方模板
