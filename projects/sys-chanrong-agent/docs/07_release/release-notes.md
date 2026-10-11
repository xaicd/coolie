# 产融商业保理与供应链金融智能体系统 首期规范基线发布说明 (Release Notes v1.0.0-BASELINE)

> **所属业务系统**: 产融商业保理与供应链金融智能体系统 (`SYS_CHANRONG_AGENT`)
> **所属本体域**: `enterprise-core`
> **技术栈**: `node / react / python-vision / docker`
> **存储介质**: `git_repo`
> **基线版本**: `v1.0.0-BASELINE`
> **发布类型**: 首期规范基线冻结（工程地基与 CMMI 01~09 规范基线）
> **规范**: CMMI CM（配置管理）／对应技能 `cmmi-immutable-release`
> **产出任务**: `init-baseline·T3` 执行门禁校验与首期基线发布（wave369）

---

## 1. 发布概述

本次发布冻结本项目的第一份**规范基线 (Norm Baseline)**：多企业隔离持久化层、统一 API 契约、
管理面/编排面物理边界、运行时门禁与不可篡改审计链的**设计与规范产物的初始冻结版本**，以及支撑其
可断言性的 G1~G5 门禁脚本。冻结后，后续 G1→G5 阶段的文档、契约与代码均以本基线为唯一可断言真源；
任何变更走 CCB（变更请求）流程，不得静默漂移。

**本基线包含**：CMMI 01~09 规范资产、`docs/specs/core/init-baseline/` 敏捷特性包、G1~G5 门禁脚本，以及需求/设计/契约/ERD 的一致性基线。

**本基线不包含（实事求是声明）**：运行期系统代码与生产部署。工程地基的可运行实现（`packages/db`、
`packages/shared`、`server/src` 的源码级落地，即 `tasks.md` 中 T1~T4 的代码部分）归属于后续 P2/P3 阶段；
本阶段交付的是「可断言的地基规范」，非「已上线的业务系统」。

## 2. G1~G5 门禁校验结果（真实执行，退出码全 0）

| 门禁 | 检查脚本 | 校验内容 | 退出码 | 结论 |
| :--- | :--- | :--- | :---: | :---: |
| G1 需求 | `node scripts/verify-reqs.mjs` | SRS 含 `REQ-` 编号与 EARS `SHALL` 语句，RTM 映射正常 | 0 | ✅ PASS |
| G2 架构 | `node scripts/check-fork-surface.mjs` | 分层拓扑 / `company_id` 隔离 / DAR 加权矩阵 / 需求全覆盖 / 待决事项 | 0 | ✅ PASS |
| G3 契约 | `node scripts/check-contracts.mjs` | `npx tsc --noEmit` 0 编译/契约报错 | 0 | ✅ PASS |
| G4 验收 | `node scripts/run-tests.mjs` | 真实测试套件（地基阶段按空集通过，见 §6 声明） | 0 | ✅ PASS |
| G5 投产 | `node scripts/check-release-baseline.mjs` | 部署 SOP 含制品校验和与秒级回滚 | 0 | ✅ PASS |

> G2 覆盖率证据：12 条 `REQ-CR-###` 全部在 HLD 选型落地表中登记，需求覆盖校验通过。
> 真实脚本原始输出见 `docs/artifacts/baseline-gate-evidence.json`。

## 3. 配置项与不可变指纹

- **配置项 (CI) 覆盖**：`docs/01_management` ~ `docs/09_operations`、`docs/specs/`、`scripts/`。
- **指纹算法**：逐文件 `SHA-256`，再对 `{sha256}  {path}` 排序清单整体取 `SHA-256`，得到**基线清单指纹**。
- **清单指纹与逐项指纹**：见 `docs/artifacts/baseline-gate-evidence.json`（机器证据库）。
- **回滚锚点**：本基线对应仓库 `main` 分支的一次冻结提交；回滚即 `git revert` 至上一基线（见 §7）。

## 4. 基线内容（CMMI 01~09 拓扑）

| 阶段 | 目录 | 核心资产 |
| :--- | :--- | :--- |
| 01 立项与策划 | `docs/01_management/` | 立项书、项目综合计划、风险台账 |
| 02 需求工程 | `docs/02_requirements/` | EARS SRS、用户需求、RTM 双向矩阵、UAT 核销单 |
| 03 架构设计 | `docs/03_design/` | HLD 概要设计、数据库 ERD（8 审计底座列 + `company_id` 隔离） |
| 04 编码实现 | `docs/04_implementation/` | 研发编码规范与防假 Mock 铁律、变异测试与用例杀伤力指南 |
| 05 验证确认 | `docs/05_verification/` | 集成测试与全栈验收报告 |
| 06 质量保证 | `docs/06_quality_assurance/` | 配置审计（PCA/FCA）、CAR 缺陷预防 |
| 07 投产发布 | `docs/07_release/` | 本发布说明、生产部署与不可变配置管理 SOP |
| 08 SRE | `docs/08_sre/` | SLO/SLI 与错误预算矩阵 |
| 09 持续运营 | `docs/09_operations/` | 多企业租户治理 SOP |

## 5. 首批需求基线

- **工程地基需求**：`REQ-BASE-001` ~ `REQ-BASE-012`（隔离注入、审计底座列、统一契约、离线 License 门禁、模块边界、人类复核、哈希链审计、真实验证、门禁联动、越权拒绝、防腐层）。
- **业务场景需求**：`REQ-CR-001` ~ `REQ-CR-012`（企业档案、单证 OCR、Agent 中枢、授信流转、系统集成、安全合规）。
- 双向追溯：`docs/02_requirements/rtm-traceability-matrix.md`（BR ↔ REQ ↔ HLD ↔ LLD ↔ TC ↔ 门禁）。

## 6. 未发生事实留空声明（实事求是）

本基线严格遵循「零假 Demo」准则，以下事实**尚未发生，一律留空**，不得伪造：

- 未发生生产部署与割接（`docs/07_release/system-deployment-sop.md` 为规范模板，非实战记录）。
- 未发生生产故障事故（`docs/08_sre/` 事故复盘区保留 `.gitkeep`）。
- 未发生财务对账差异（`docs/09_operations/` 对账区保留 `.gitkeep`）。
- 运行期测试集尚无真实用例（G4 按空集通过，待实现阶段补齐真实数据库测试）。

## 7. 发布与回滚

- **发布动作**：将本基线冻结提交打标 `v1.0.0-BASELINE`，并挂载至 `init-baseline·T3` 工单工件总线。
- **秒级回滚**：`git revert <baseline-commit>`（纯文档/契约冻结，不涉及运行时数据迁移）；详细割接与回滚见
  `docs/07_release/system-deployment-sop.md`。

## 8. 签署

| 角色 | 姓名/工号 | 结论 |
| :--- | :--- | :--- |
| 产出执行 (FDA) | 墨斗 (Inkstick) · `modou-fda` | 门禁校验 G1~G5 全绿，首期规范基线冻结 |
| 质量门禁 (FDSE) | 门神 · `emp_fdse` | 待 G4 真实测试用例补齐后复核 |
| 投产发布 (PRE-SRE) | 兑底渊 · `emp_sre` | 待 P5 阶段实战投产 |
| 老板 / 最高交付总控 | （待签署） | — |
