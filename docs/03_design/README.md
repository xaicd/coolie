# CMMI G2 架构与方案设计工程过程资产包 (Architecture & Technical Solution)

> **项目名称**: 社区生活服务商用中台 (Community Life Service Commercial Hub)  
> **责任工匠**: 墨斗 (Inkstick · modou-fda · 前线架构师 FDA)  
> **门禁状态**: G2 架构与隔离门禁 (`gate_g2_arch`) 已经全部就绪并通过自检  
> **基线日期**: 2026-10-10  

---

## 资产索引与工程清单

| 资产文件 | 类别与规范 | 核心内容摘要 |
|---|---|---|
| [`dar-base-selection.md`](./dar-base-selection.md) | CMMI DAR 选型矩阵 | 4 套方案加权评估（权重和 100%），裁定选用 Yudao-Cloud JDK17 5 模块裁剪定制版 |
| [`architecture-design-hld.md`](./architecture-design-hld.md) | 系统概要设计说明书 (HLD) | 总体拓扑、微服务拆分、FDA 4 大不可逾越边界约束（租户隔离/领域防腐/RBAC防自批/资金守恒）、10 项 NFR 落地手段 |
| [`database-design-erd.md`](./database-design-erd.md) | 数据库与 ERD 设计 | 29 张标准物理表 DDL 与索引规范、8 大通用审计底座字段、国密 SM4-GCM 敏感数据加密 |
| [`interface-contracts.md`](./interface-contracts.md) | 统一 API 契约协议规范 (LLD) | 24 个两字核心动词与 HTTP 动作映射、4 大业务主线 RESTful 契约、防自批自审拦截规范 |
| [`screenshot-automation-spec.md`](./screenshot-automation-spec.md) | 自动化截图流水线规范 | Playwright + 宿主机模拟器穿透 + 双重防伪水印，覆盖规范书 7 大 ★ 核心佐证模块与真机四态，带秒级激活开关 |
| [`adr/ADR-001-base-selection.md`](./adr/ADR-001-base-selection.md) | 架构决策记录 001 | 采用 Yudao-Cloud JDK17 5 模块裁剪定制版作为生活服务中台基座 |
| [`adr/ADR-002-tenant-isolation.md`](./adr/ADR-002-tenant-isolation.md) | 架构决策记录 002 | 服务端网关解析 JWT 与 MyBatis-Plus AST 语法树层级强制多租户隔离 |
| [`adr/ADR-003-transaction-and-reconciliation.md`](./adr/ADR-003-transaction-and-reconciliation.md) | 架构决策记录 003 | 家政履约状态机、分布式事务补偿与双向对账守恒断言 |
| [`adr/ADR-004-clearing-and-settlement.md`](./adr/ADR-004-clearing-and-settlement.md) | 架构决策记录 004 | 交易结算引擎与资金轧差自动化对账流水线 |
| [`adr/ADR-005-yudao-quad-terminal-microservices-and-outbox.md`](./adr/ADR-005-yudao-quad-terminal-microservices-and-outbox.md) | 架构决策记录 005 | Yudao 四位一体多端微服务与可靠消息最终一致性 (Transactional Outbox) |
| [`adr/ADR-006-living-ontology-and-cmmi-gates.md`](./adr/ADR-006-living-ontology-and-cmmi-gates.md) | 架构决策记录 006 | 采用活体业务本体 (Living Ontology) 与 CMMI 5 物理反向审计守卫作为交付中枢 |

