<!--
==========================================================================
【组织标准过程资产模版 (OSSP Template)】
类型: 软件需求规格说明书 (SRS - EARS 5态精准规格)
归属: CMMI Phase 02 (02_requirements)
注意: 本文件为纯净空白母本，严禁直接填写项目业务数据！
      使用 node scripts/cmmi-doc-generator.cjs --type req 或 --all 动态派生落盘。
==========================================================================
-->

# {{PROJECT_TITLE}} · 软件需求规格说明书 (SRS - EARS 5态精准规格)

> **文档代号**: {{SYSTEM_CODE}}-SRS-{{VERSION}}  
> **项目全称**: {{PROJECT_TITLE}}  
> **基线版本**: {{VERSION}} (生产冻结基线)  
> **制定日期**: {{DATE}}  
> **适用标准**: ISO/IEC/IEEE 29148:2018 / GB/T 8567-2006 (SRS) / EARS 规范 / .agents/skills/cmmi-req-spec  

---

## 1. 业务上下文与系统定位 (System Overview & Context)

{{PROJECT_TITLE}} 是由 AI 数字员工全自主驱动的商业软件交付工厂控制面。为消除需求二义性、确保大模型编码准确度与代码质量抗退化，本系统全量功能需求强制使用 **EARS (Easy Approach to Requirements Syntax) 5 态精准句式** 定义，严禁使用“尽量”、“高效”、“大概”等不可机检的修饰词。

---

## 2. EARS 5态精准句式需求规格清单 (EARS Requirements Catalog)

{{SRS_REQUIREMENTS_LIST}}

---

## 3. 业务不变量与验收准则 (System Invariants & Acceptance Criteria)
1. **INV-1 (单人负责不变量)**: 任何进行中的任务只能有唯一 Assignee，任何并发写尝试均以乐观锁失败拒绝；
2. **INV-2 (资金与预算守恒不变量)**: 实际花费金额 + 剩余预算 = 批准总预算，超支即刻硬停；
3. **INV-3 (物理交付不变量)**: 1 Task = 1 Commit，且工单完工时必须具备可验证远端 Commit SHA。
