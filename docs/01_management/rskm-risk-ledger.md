# 风险跟踪管理台账 (Risk Register - RSKM)

- **登记日期**: 2026-10-17
- **归属规范**: CMMI 01_management (RSKM) / .agents/skills/cmmi-asset-authoring

---

## 1. 核心技术与架构风险台账
| 风险编号 | 风险描述与潜在影响 | 概率 | 影响 | 风险等级 | 预防与防御机制 | 应急触发与缓解预案 | 责任人 | 状态 |
|---|---|---|---|---|---|---|---|---|
| RSK-001 | 跨域直接 import 导致循环依赖 | 低 | 高 | 中 | 门禁规范 + AST 依赖方向扫描 | 强制重构为 Domain Facade / Broker | @tiejiang | 已受控 |
