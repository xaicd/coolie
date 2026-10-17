<!--
==========================================================================
【组织标准过程资产模版 (OSSP Template)】
类型: 生产秒级回滚应急 SOP (rollback-runbook)
归属: CMMI Phase 07 (07_release)
注意: 本文件为纯净空白母本，严禁直接填写项目业务数据！
      使用 node scripts/cmmi-asset-scaffold.cjs batch 派生到各项目 docs/ 中。
==========================================================================
-->

# 生产秒级回滚应急操作手册 (Rollback Emergency Plan)

- **触发条件**: 生产发布后 5 分钟内 P95 延迟暴涨 >300% 或错误率 >0.5%
- **归属规范**: CMMI 07_release (TRANS / RSKM) / .agents/skills/cmmi-immutable-release

---

## 1. 60 秒一键自动化回滚操作
## 2. 数据库回滚事务处理预案
## 3. 业务流量止血与通知机制
