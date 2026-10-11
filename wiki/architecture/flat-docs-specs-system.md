# 架构支柱：开放式扁平敏捷特性库与 CMMI 01~09 体系

- **彻底弃用 .coolie/cmmi 隐藏单文件目录**；
- **CMMI 01~09 全生命周期 26 类工程资产规范归宿**：
  - `docs/01_management/`：立项章程、综合计划、风险台账、DAR 决策分析、阶段配置计划
  - `docs/02_requirements/`：EARS 语法软件需求规格 (SRS)、跟踪矩阵 (RTM)、NFR
  - `docs/03_design/`：MADR 架构决策 (ADR)、HLD 设计、数据库模型 ERD、接口契约
  - `docs/04_implementation/`：编码规范、变异测试指南、插件隔离蓝图、SBOM
  - `docs/05_verification/`：测试计划、测试总结大盘、变异测试报告、客户终验单
  - `docs/06_cmmi_audit/`：统计过程控制 (SPC)、CAR 5-Whys、配置审计单、门禁追踪
  - `docs/07_release/`：部署割接 SOP、秒级回滚 Runbook、版本发布说明、发版清单
  - `docs/08_sre/`：SLO/SLI 矩阵、容灾演练方案、5-Whys 事故复盘、Strix 渗透报告
  - `docs/09_operations/`：多租户开通 SOP、数字员工台账、常态巡检报告、财务对账平账单
- **敏捷特性规格全息包**：
  - `docs/specs/<domain>/<feature-slug>/`：由 Kiro SDD 引擎 (`npm run spec:ops`) 驱动，内聚 brief.json, requirements.md, design.md, tasks.md, spec.json, runbook.json
- **机器证据库与工作流流水**：
  - `docs/artifacts/`：静态扫描、高并发压测、环境指纹与工作流执行历史 (`workflow-runs/`)
