<!--
==========================================================================
【组织标准过程资产模版 (OSSP Template)】
类型: 统一对外接口契约与 OpenAPI 规范 (api-spec)
归属: CMMI Phase 03 (03_design)
注意: 本文件为纯净空白母本，严禁直接填写项目业务数据！
      使用 node scripts/cmmi-asset-scaffold.cjs batch 派生到各项目 docs/ 中。
==========================================================================
-->

# 统一对外接口契约规范 (OpenAPI 3.1 & Domain Contracts)

- **归属规范**: CMMI 03_design (TS) / .agents/skills/cmmi-detailed-contracts

---

## 1. 接口设计通用准则
- 动词化语义 API 契约
- 严格遵循输入输出 Schema 校验
- 响应形状统一：`{ code: 0, data: T, msg: "success" }`
