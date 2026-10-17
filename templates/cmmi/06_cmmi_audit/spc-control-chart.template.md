<!--
==========================================================================
【组织标准过程资产模版 (OSSP Template)】
类型: 统计过程控制图 (SPC) (spc)
归属: CMMI Phase 06 (06_cmmi_audit)
注意: 本文件为纯净空白母本，严禁直接填写项目业务数据！
      使用 node scripts/cmmi-asset-scaffold.cjs batch 派生到各项目 docs/ 中。
==========================================================================
-->

# 统计过程控制分析表 (Statistical Process Control - SPC)

- **分析周期**: 季度/迭代度量
- **归属规范**: CMMI 06_cmmi_audit (QPM) / .agents/skills/cmmi-car-spc-metrics

---

## 1. 吞吐量与缺陷密度控制线
- UCL (上限): 均值 + 3σ
- LCL (下限): 均值 - 3σ
- 过程能力指数 Cpk 稳定处于 >= 1.33
