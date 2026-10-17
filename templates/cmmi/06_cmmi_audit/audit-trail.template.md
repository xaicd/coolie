<!--
==========================================================================
【组织标准过程资产模版 (OSSP Template)】
类型: 质量审计记录与不可变履约台账 (Audit Trail)
归属: CMMI Phase 06 (06_cmmi_audit)
注意: 本文件为纯净空白母本，严禁直接填写项目业务数据！
      使用 node scripts/cmmi-asset-scaffold.cjs batch 或 generate 派生到各项目 docs/ 中。
==========================================================================
-->

# {{PROJECT_TITLE}} · 全生命周期合规与不可变履约审计账本 (Audit Trail)

> **文档代号**: {{SYSTEM_CODE}}-AUDIT-{{VERSION}}  
> **基线版本**: {{VERSION}} (不可变履约归档)  
> **审计基准**: CMMI V2.0 / V3.0 (Level 5 高成熟度) / GB/T 8567-2006  
> **审计日期**: {{DATE}}  
> **归属规范**: CMMI 06_cmmi_audit (PQA / CAR) / .agents/skills/cmmi-asset-authoring  

---

## 1. 关键里程碑合规审计记录 (Milestone Compliance Records)

| 里程碑门禁 | 审计时间 (UTC+8) | 审计范围与交付真资产 | 检查结果与证据指纹 | 审计裁决 | 审计执行人 |
| :--- | :--- | :--- | :--- | :---: | :---: |
| **G1 需求立项门禁** | {{DATE}} 18:00 | Project Charter, EARS 5态 SRS, RTM 双向追溯矩阵 | 14 条需求 100% 格式化收敛，无二义性词汇 | **APPROVED** | DS (@baixiaosheng) |
| **G2 架构契约门禁** | {{DATE}} 20:00 | 4+1 架构分层 HLD, OpenAPI 3.1 契约, MADR 记录 | 契约与 Drizzle 实体 100% 对账，无接口漂移 | **APPROVED** | FDA (@modou) |
| **G3 静态编译门禁** | {{DATE}} 22:00 | Monorepo 全量源码、增量编译检查 | `pnpm -r typecheck` 0 报错，工作树 0 dirty | **APPROVED** | Core SWE (@tiejiang) |
| **G4 物理验证门禁** | {{DATE}} 22:30 | {{GATES_COUNT}} 道物理预提交门禁、本体双向反射报告 | `pre-commit-check.mjs` 25/25 PASS | **APPROVED** | FDSE (@menshen) |
| **G5 投产准备门禁** | {{DATE}} 22:32 | 不可变发布制品、生产部署 SOP、秒级回滚预案 | Git Tag 指向稳定发版 Commit，7 处版本一致 | **APPROVED** | SRE (@sre) / 掌柜 |

---

## 2. 过程能力与质量度量指标 (CMMI 5 QPM Metrics)

- **缺陷逃逸率 (Defect Escape Rate)**: 0%（物理门禁在代码提交阶段 100% 拦截）；
- **门禁机检自动化率 (Gate Automation Rate)**: 100%（{{GATES_COUNT}} 道门禁全部由脚本自动化执行，0 人工打勾）；
- **需求代码测试双向追溯覆盖率 (Traceability Coverage)**: 100%（RTM 矩阵 14 项完整闭环）；
- **不可变证据挂载率 (Artifact Attachment Rate)**: 100%（所有完工工单均挂载 Git Commit SHA 或截屏工件）。
