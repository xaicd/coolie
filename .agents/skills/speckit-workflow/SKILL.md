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

# 10. 活体本体七模型建模与反死穴审计
node scripts/speckit.cjs ontology inspect
node scripts/speckit.cjs ontology lint [--spec <feature-slug>]
node scripts/speckit.cjs ontology mermaid --spec <feature-slug>
node scripts/speckit.cjs ontology init --spec <feature-slug>
node scripts/speckit.cjs ontology callchain

# 11. 五位一体 Harness 工程安全带与总调度中枢
node scripts/speckit.cjs harness full-audit
node scripts/speckit.cjs harness ontology-audit
node scripts/speckit.cjs harness arch-audit
node scripts/speckit.cjs harness test
```

---

## 三、活体本体 (ODD 七模型) 闭环驱动

Spec-Kit 深度整合《本体驱动软件建模框架 v9.0》，实现业务语义向技术管网的 100% 形式化映射：

1. **立项即建模 (`ontology/`)**：`speckit new` 自动初始化 `manifest.yaml`、`m1-objects.yaml`、`m2-behaviors.yaml`、`m3-rules.yaml`、`m5-actors.yaml`、`m6-flows.yaml`、`mu-views.yaml` 七大声明式 YAML；
2. **编译即拓扑 (`design.md`)**：`speckit build` 自动融合 Mermaid 领域实体 ER 图、状态机跃迁图与 M2 核心业务动词契约清单；
3. **自检即门禁 (`speckit check` / Git Pre-Commit)**：静态拦截 `DEAD_UI_BUTTON`（死按钮）、`UNREFERENCED_USER_ACTION`（孤立动词）、`ILLEGAL_STATE_TRANSITION`（越权状态跃迁）与规则/角色悬空边；
4. **Harness 核心中枢 (`speckit harness`)**：Spec-Kit 成为本地母港与 Harness 五位一体（环境、架构、活体本体、构建、测试）的统一核心入口。

---

## 四、工坊与数字员工分工矩阵

| 阶段 / 步骤 | 主责数字员工 | Spec-Kit 指令 | 产物输出 |
| :--- | :--- | :--- | :--- |
| **G1 需求立项** | Hermes / 墨斗 (FDA) | `speckit new`, `speckit ontology init` | `brief.json`, `ontology/*.yaml` 七模型骨架 |
| **G2 架构设计** | 墨斗 (FDA) | `speckit build` | `design.md` (含 Mermaid ER 与动词契约表) |
| **G3 契约编码** | 铁匠 (Core SWE) | `speckit tasks`, `speckit sync` | `tasks.md`, Git 独立提交, 官方 `issue_documents` |
| **G4 真实验收** | 门神 (FDSE) | `speckit check`, `speckit ontology lint` | `evidence.json`, 零死穴审计报告 |
| **G5 投产安全带** | 兑底渊 (PRE-SRE) | `speckit harness full-audit`, `speckit archive` | `harness-report.json`, 归档区归档 |

