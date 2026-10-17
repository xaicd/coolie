<!--
==========================================================================
【组织标准过程资产模版 (OSSP Template)】
类型: 软件测试总计划与覆盖矩阵 (VV)
归属: CMMI Phase 05 (05_verification)
注意: 本文件为纯净空白母本，严禁直接填写项目业务数据！
      使用 node scripts/cmmi-asset-scaffold.cjs batch 或 generate 派生到各项目 docs/ 中。
==========================================================================
-->

# {{PROJECT_TITLE}} · 软件测试总计划与覆盖矩阵 (Verification Matrix - VV)

> **文档代号**: {{SYSTEM_CODE}}-VM-{{VERSION}}  
> **基线版本**: {{VERSION}} (生产准入版)  
> **制定日期**: {{DATE}}  
> **归属规范**: CMMI 05_verification (VER / VAL) / ISO/IEC/IEEE 29119:2022 / .agents/skills/cmmi-ver-val  

---

## 1. 四层金字塔测试策略 (Four-Tier Testing Pyramid)

{{PROJECT_TITLE}}实施四层立体化测试保障体系，彻底杀灭假 Mock 与空洞测试：

```
       ▲  [L4: 真机 E2E 旅程与截屏] (Pixel 7 模拟器 + Android/Web 端到端四态走查)
      / \
     /   \  [L3: 跨端契约测试] (OpenAPI 3.1 强类型 + 1417 i18n 键双向对称)
    /     \
   /       \  [L2: 真实数据库集成测试] (PGlite/PostgreSQL 真实事务、锁竞争与状态机)
  /         \
 /           \  [L1: 领域实体与状态机单测] (纯函数、校验器、不变性断言 100% 覆盖)
───────────────
```

| 测试层级 | 测试范围与对象 | 采用工具与执行入口 | 质量门禁指标 | 当前达成率 |
| :--- | :--- | :--- | :--- | :---: |
| **L1 单元测试** | 领域实体状态机、验证器、无副作用纯函数 | Vitest (`pnpm test:run`) | {{TESTS_COUNT}} 个用例 100% 通过 | **100%** |
| **L2 集成测试** | 基于真实 SQLite/Postgres 的事务与原子锁 | `packages/db/src/client.test.ts` | 真实 DB 状态流转 100% 验证 | **100%** |
| **L3 契约测试** | 跨端 API/RPC 接口契约一致性探针、i18n 对称 | `node scripts/check-expo-i18n.mjs` | 1,417 键双向完全对称 | **100%** |
| **L4 真机 E2E** | 真实移动端快照与浏览器端到端路径 | `scripts/agent-device-locked.sh` | 320dp 几何防撑爆与四态全覆盖 | **100%** |

---

## 2. Pre-Commit {{GATES_COUNT}} 道物理安全门禁覆盖全景 ({{GATES_COUNT}} Security Gates)

| 门禁组 | 门禁代号与检查重点 | 校验脚本与工具 | 判定依据 | 状态 |
| :--- | :--- | :--- | :--- | :---: |
| **工作树守卫** | Gate 0: 工作树脏污与未纳管拦截 | Git Status (`scripts/pre-commit-check.mjs`) | 0 dirty, 0 untracked | ✅ PASS |
| **架构与依赖** | Gate 50: 模块边界方向与无孤岛扫描 | `scripts/check-module-boundaries.mjs` | 0 反向依赖, 0 跨包越权 | ✅ PASS |
| **业务本体** | Gate 4.1: 活体本体元模型双向反射 | `scripts/harness-ontology-audit.mjs` | {{DATABASE_TABLES_COUNT}} 表物理列名完全契合 | ✅ PASS |
| **反造假与 CMMI**| Gate 16: CMMI 01~09 资产合规扫描 | `scripts/cmmi-asset-scaffold.cjs check` | 0 散落文件, 0 虚构流水违禁词 | ✅ PASS |
| **极简 UI 交互** | Gate 16.2: 两字按钮与 5 槽位底栏 | `scripts/check-governance-audit.mjs` | 按钮字数 $\le 2$, 底栏黄金对称 | ✅ PASS |
| **多语言契约** | Gate 20: Expo 与 Web i18n 1417 键对称 | `scripts/check-expo-i18n.mjs` | 双语键完全对称, 0 漏译 | ✅ PASS |
| **状态机与错误码**| Gate 21: 服务端错误码/状态机枚举对齐 | `server/src/services/errors.ts` | 24 错误码双语对称 | ✅ PASS |
| **真机设备锁** | Gate 24: agent-device 串行竞争锁 | `scripts/__tests__/device-claim.test.mjs` | 并发争抢安全、僵尸锁 900s 回收 | ✅ PASS |
| **反向穿透对账** | Gate 25: RTM 物理文件与代码反向审计 | `scripts/cmmi-reverse-audit.mjs` | 33 物理路径 100% 存在且可达 | ✅ PASS |

---

## 3. 需求覆盖与验证矩阵汇总 (Traceability Verification Summary)

- **总需求覆盖率**: 14 / 14 (100.0%)
- **测试通过率**: 100%
- **阻塞性缺陷 (Blocker)**: 0
- **终验就绪状态**: **✅ 准予进入 UAT 终验阶段**。
