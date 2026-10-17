<!--
==========================================================================
【组织标准过程资产模版 (OSSP Template)】
类型: 变异测试与用例杀伤力验证指南 (mutation-guide)
归属: CMMI Phase 04 (04_implementation)
注意: 本文件为纯净空白母本，严禁直接填写项目业务数据！
      使用 node scripts/cmmi-asset-scaffold.cjs batch 派生到各项目 docs/ 中。
==========================================================================
-->

# 变异测试与用例杀伤力验证指南 (Mutation Testing Guide)

- **归属规范**: CMMI 04_implementation (TS / VV) / .agents/skills/mutation-tester

---

## 1. 变异算子注入标准
- 条件边界变异 (< 变 <=, == 变 !=)
- 增量变异 (+ 变 -, ++ 变 --)
- 逻辑反转 (&& 变 ||)
- 变异杀伤率需达到 85% 以上
