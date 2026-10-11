# 架构支柱：Kiro SDD 原生多智能体工作流引擎与配方体系

- **核心运行引擎**：
  工作流是把 SDD 规格从静态 Markdown 推向多智能体自动化执行的核心引擎。
- **物理单一真源与软链接桥接**：
  - 单一真源：`.agents/workflows/*.workflow.json`
  - Kiro IDE 原生软链接桥接：`.kiro/workflows -> ../.agents/workflows`
- **4 大内置 SDD 配方**：
  1. `feature-delivery.workflow.json`：全生命周期新特性交付
  2. `bugfix.workflow.json`：缺陷排查与红绿验证 (5-Whys + Red-to-Green)
  3. `architecture-refactor.workflow.json`：架构债务消除与渐进演进
  4. `security-patch.workflow.json`：安全加固与 PoC 红蓝渗透验证
- **统一工作流 CLI 引擎 (`scripts/workflow-engine.cjs`)**：
  - `pnpm run workflow:list`：检视配方清单与依赖
  - `pnpm run workflow:check`：DAG 有向无环图深度扫描与语法校验
  - `pnpm run workflow:dry-run`：模拟展开输出 Mermaid DAG 与角色指令
  - `pnpm run workflow:run`：驱动执行脚手架并落盘执行流水
  - `pnpm run workflow:new`：脚手架生成新配方模板
