# 需求双向跟踪矩阵 (Requirements Traceability Matrix - RTM)

- **基线版本**: v1.0.0
- **更新日期**: 2026-10-17
- **归属规范**: CMMI 02_requirements (RDM) / .agents/skills/cmmi-req-spec

---

## 1. 全链路双向追溯表
| 需求编号 (REQ) | 需求简述 | 规格来源 | 架构设计 (HLD/ERD) | 代码实现 (Module) | 单元/集成测试用例 | 验证状态 |
|---|---|---|---|---|---|---|
| REQ-001 | 多租户物理数据隔离 | brief.json | HLD, ERD | server/src/routes | test/tenant-isolation.spec.ts | PASSED |
