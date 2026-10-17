<!--
==========================================================================
【组织标准过程资产模版 (OSSP Template)】
类型: 项目立项书与范围说明书 (charter)
归属: CMMI Phase 01 (01_management)
注意: 本文件为纯净空白母本，严禁直接填写项目业务数据！
      使用 node scripts/cmmi-asset-scaffold.cjs batch 派生到各项目 docs/ 中。
==========================================================================
-->

# 项目立项与范围说明书 (Project Charter)

- **项目全称**: {{PROJECT_TITLE}}
- **基线版本**: {{VERSION}}
- **生效日期**: 2026-10-17
- **归属规范**: CMMI 01_management (PLAN / MC) / .agents/skills/cmmi-asset-authoring

---

## 1. 项目背景与商业目标
<!-- 明确交付商业本质与客户现场业务痛点 -->

## 2. 交付范围与边界约束
- **包含范围 (In-Scope)**:
- **不包含范围 (Out-of-Scope)**:

## 3. 核心干系人与 RACI 权责矩阵
| 角色 | 负责人 | 核心职责 |
|---|---|---|
| 掌柜 / CEO | @boss | 商业价值把控、终验核销闭环与重大变更审批 |
| 墨斗 (FDA) | @modou | 系统概要架构 HLD、租户物理隔离与 DAR 选型 |
| 铁匠 (Core SWE) | @tiejiang | 静态契约 LLD、领域服务实现与 0 编译报错 |
| 门神 (FDSE) | @menshen | 全栈界面四态、真机快照集成与端到端回归 |
| 百晓生 (DS) | @baixiaosheng | EARS 需求规格收敛、RTM 双向矩阵与业务旅程主审 |
