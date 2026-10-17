# CMMI G2 架构与方案设计工程过程资产包 (Architecture & Technical Solution)

> **项目名称**: Coolie AI 原生商业软件交付工厂控制面平台 (Coolie AI-Native Foundry Control Plane)  
> **责任工匠**: 墨斗 (Inkstick · modou-fda · 前线架构师 FDA) / 铁匠 (Core-SWE)  
> **门禁状态**: G2 架构与隔离门禁 (`gate_g2_arch`) 已经全部就绪并通过自检  
> **基线版本**: v2.0.0 (生产冻结稳定版)  
> **基线日期**: 2026-10-17  
> **归属规范**: CMMI 03_design (TS / DAR) / .agents/skills/cmmi-tech-solution  

---

## 资产索引与工程清单

| 资产文件 | 类别与规范 | 核心内容摘要 |
|---|---|---|
| [`dar-base-selection.md`](./dar-base-selection.md) | CMMI DAR 选型矩阵 | 4 套方案加权评估（总权重 100%），裁定选用 Paperclip + Node/React/Expo 极简全栈架构 |
| [`architecture-design-hld.md`](./architecture-design-hld.md) | 系统概要设计说明书 (HLD) | 4+1 架构视图、控制面/流水线/交付应用三层物理生命周期隔离、四大不可逾越架构底线 |
| [`database-design-erd.md`](./database-design-erd.md) | 数据库与 ERD 设计 | 263 张标准物理表 DDL 与索引规范、8 大通用审计字段、PostgreSQL 生产与 PGlite 脱机双模 |
| [`interface-contracts.md`](./interface-contracts.md) | 统一 API 契约协议规范 (LLD) | 24 个两字核心动词与 HTTP 映射、Company 多租户行级隔离、统一错误码双语契约 |
| [`interface-contracts/openapi-spec.md`](./interface-contracts/openapi-spec.md) | 机器可读 OpenAPI 3.1 契约 | 完整的控制面 RESTful 接口机器交互规格全集 |
| [`screenshot-automation-spec.md`](./screenshot-automation-spec.md) | 自动化截图流水线规范 | Playwright + 宿主机模拟器穿透 + `device-claim.sh` 串行设备锁 + 320dp 几何防撑爆真机四态走查 |
| [`adr/ADR-001-monorepo-and-control-plane-architecture.md`](./adr/ADR-001-monorepo-and-control-plane-architecture.md) | 架构决策记录 001 | 采用 PNPM Monorepo 与 Express/React/Expo 作为控制面全栈架构 |
| [`adr/ADR-002-atomic-checkout-and-budget-hard-stop.md`](./adr/ADR-002-atomic-checkout-and-budget-hard-stop.md) | 架构决策记录 002 | 单人原子签出锁 (Single-Assignee Task Checkout) 与预算硬停自动熔断机制 |
| [`adr/ADR-003-minimalist-ui-and-six-inch-mobile-defense.md`](./adr/ADR-003-minimalist-ui-and-six-inch-mobile-defense.md) | 架构决策记录 003 | 极简两字 UI 交互契约、黄金对称 5 槽位底栏与 6 寸屏几何防御 |
| [`adr/ADR-004-hermes-multi-host-mesh-dispatch.md`](./adr/ADR-004-hermes-multi-host-mesh-dispatch.md) | 架构决策记录 004 | Hermes 多宿主机网状拓扑调度与 host-exec 穿透调用机制 |
| [`adr/ADR-005-dual-blueprints-adaptive-hatching.md`](./adr/ADR-005-dual-blueprints-adaptive-hatching.md) | 架构决策记录 005 | 商业项目两大开源交付底座 (yudao-quad-terminal 与 ruoyi-all-next) 自适应派生与正交物理隔离 |
| [`adr/ADR-006-living-ontology-and-cmmi-gates.md`](./adr/ADR-006-living-ontology-and-cmmi-gates.md) | 架构决策记录 006 | 采用活体业务本体 (Living Ontology) 与 CMMI 5 物理反向审计守卫作为交付中枢 |
