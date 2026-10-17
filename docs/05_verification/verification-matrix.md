# 软件测试总计划与覆盖矩阵 (Verification Matrix)

- **基线版本**: v1.0.0
- **归属规范**: CMMI 05_verification (VV) / .agents/skills/cmmi-ver-val

---

## 1. 四层金字塔测试策略
- **L1 单元测试**: 领域实体状态机、验证器、无副作用纯函数 (100% 覆盖)
- **L2 集成测试**: 基于真实 SQLite/Postgres 的事务与锁 (100% 真实库)
- **L3 契约测试**: 跨端 API/RPC 接口契约一致性探针
- **L4 E2E 旅程**: 真实移动端快照与浏览器端到端路径
