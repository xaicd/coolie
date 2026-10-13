---
name: speckit-workflow
description: Coolie Spec-Kit 规格驱动开发 (SDD) 全生命周期执行法典。适用于接到「SDD规格开发」「1Task=1Commit」「特性骨架拆解」「从Spec生成任务」「代码核销」时启用。
---

# Coolie Spec-Kit SDD 全流程操作指南

Coolie Spec-Kit 是面向 AI 时代商业交付工厂的现代**规格驱动开发 (Specification-Driven Development)** 引擎，完美贯通现实业务需求、工程架构设计、任务分解与不可变证据闭环。

---

## 一、Spec-Kit 核心设计原则

1. **Spec First & No Spec, No Code**：严禁在未建立规格前盲目手写代码；需求与设计必须先收敛至 `specs/<domain>/<feature>/` 或 `docs/specs/<domain>/<feature>/`；
2. **1 Task = 1 Commit**：每一个拆解出的任务（T1, T2, T3...）必须对应一次独立可验证的 Git Commit；
3. **波次编排 (Wave Delivery)**：
   - **Wave 1 (地基)**：数据表结构、实体模型、多租户强隔离过滤；
   - **Wave 2 (业务)**：核心业务服务、API 控制器、统一 OpenAPI 契约；
   - **Wave 3 (验收)**：单元与变异测试、四态 UI 防御、生产回滚 Runbook。
4. **控制面与物理工作区双向血缘 (Dual-Track Provenance)**：通过 `speckit sync` 将物理规格与 Paperclip 控制面工单、子任务和不可变工件（`workspace_file`）原子绑定。

---

## 二、统一 CLI 控制台指令字典 (`scripts/speckit.cjs`)

```bash
# 1. 环境与宪法初始化
node scripts/speckit.cjs init
node scripts/speckit.cjs constitution

# 2. 建立新特性规格骨架
node scripts/speckit.cjs new --name <feature-slug> --domain <domain> --title "<特性中文标题>" --type feature

# 3. 建立缺陷修复规格骨架
node scripts/speckit.cjs new --name <bugfix-slug> --domain <domain> --title "<缺陷修复标题>" --type bugfix

# 4. 编译展开规格文档 (生成完备 Markdown 与 Mermaid 波次任务图)
node scripts/speckit.cjs build --name <feature-slug>

# 5. 检视任务大盘与波次依赖 (自动基于真实 Git Log 核实 1 Task = 1 Commit)
node scripts/speckit.cjs tasks --spec <feature-slug>
node scripts/speckit.cjs tasks --spec <feature-slug> --task T1

# 6. 双向同步规格至 Paperclip 控制面 (工单、子任务与工件总线)
node scripts/speckit.cjs sync --spec <feature-slug>

# 7. 规格健康度扫描与防认知污染检查
node scripts/speckit.cjs health
node scripts/speckit.cjs check --spec <feature-slug>

# 8. 归档已交付完毕的规格
node scripts/speckit.cjs archive --name <feature-slug>

# 9. CMMI 全生命周期资产巡检
node scripts/speckit.cjs cmmi check
```

---

## 三、工坊与数字员工分工矩阵

| 阶段 / 步骤 | 主责数字员工 | Spec-Kit 指令 | 产物输出 |
| :--- | :--- | :--- | :--- |
| **G1 需求立项** | Hermes / 墨斗 (FDA) | `speckit new` | `brief.json`, `requirements.md` |
| **G2 架构设计** | 墨斗 (FDA) | `speckit build` | `design.md`, DAR 技术选型表 |
| **G3 契约编码** | 铁匠 (Core SWE) | `speckit tasks`, `speckit sync` | `tasks.md`, Git 独立提交, 契约 LLD |
| **G4 真实验收** | 门神 (FDSE) | `speckit check` | `evidence.json`, 真机快照凭证 |
| **G5 投产归档** | 兑底渊 (PRE-SRE) | `speckit archive` | `runbook.json`, 归档归档区 |
