<!--
==========================================================================
【组织标准过程资产模版 (OSSP Template)】
类型: 数据库底座设计与 8 大审计字段规范 (erd)
归属: CMMI Phase 03 (03_design)
注意: 本文件为纯净空白母本，严禁直接填写项目业务数据！
      使用 node scripts/cmmi-asset-scaffold.cjs batch 派生到各项目 docs/ 中。
==========================================================================
-->

# 数据库底座设计与 8 大审计字段规范 (Database Design & ERD)

- **基线版本**: v1.0.0 Enterprise Baseline
- **归属规范**: CMMI 03_design (TS) / .agents/skills/cmmi-tech-solution

---

## 1. 8 大核心审计底座字段标准
所有持久化实体统一继承以下 8 大底座列：
`id`, `company_id` / `tenant_id`, `created_by`, `created_at`, `updated_by`, `updated_at`, `deleted_at`, `version`.
