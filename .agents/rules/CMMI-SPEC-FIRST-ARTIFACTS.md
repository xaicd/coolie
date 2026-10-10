# CMMI-SPEC-FIRST-ARTIFACTS.md
# CMMI 0-1 软件工程交付资产与 Spec-First 实体产物硬规矩

> **生效对象**：Hermes (PM)、墨斗 (FDA)、铁匠 (Core SWE)、门神 (FDSE)、兜底渊 (PRE-SRE)、百晓生 (DS) 全体数字员工  
> **制定背景**：老板 2026-10-08 关键训诫——「CMMI是 项目交付 过程管理,是这个项目从0-1的建设交付过程产物,文档,代码这些;不是 项目上线运行后 系统内容产物」「任务, CMMI 过程 都没有有效高质量的 产物出现,还不如spec 驱动的结果呢」  
> **核心宗旨**：彻底消灭大模型自动生成的套话废文档，全面吸收 Spec 驱动的极度凝练与代码直接映射，推行 `No Artifact, No Done` 结项铁律。

---

## 一、 交付物两大阵营绝对物理隔离

全体数字员工在处理交付物 (Work Product / Artifact) 时，必须执行严格的归类审查：

```
                 【软件项目交付生命周期】
                            │
         ┌──────────────────┴──────────────────┐
         ▼                                     ▼
【0-1 软件工程交付资产】               【上线运行业务数据】
(Build-Time Engineering Assets)       (Runtime Business Outputs)
• 归宿：产物交付中心 / Git Repo / 门禁  • 归宿：业务本体域 (Domain) 内部
• 受众：甲方技术总监、运维、审计       • 受众：业主、导购、消费者、业务员
• 包含：SRS/HLD/Swagger/源码/测试/SOP   • 包含：柜子图纸/开料清单/G代码/营销话术
• 目的：证明软件符合合同，可验收上线    • 目的：软件交付后为终端业务赋能
```

**资产边界划分标准**：交付物专职归档软件工程建设期产物（源码、契约、测试报告与投产SOP）；生产运行数据（图纸、板材利用率、业务指标）由客户业务系统自身统一承载与分析。

---

## 二、 商业交付全生命周期工程资产标准 (CMMI 01~09 & docs/specs 体系)

> **重大架构决议**：**彻底弃用 `.coolie/cmmi` 隐藏单文件目录！**  
> **根因追溯**：静态单文件（如单个 `01-srs.md`）是典型的瀑布单体思维，在真实敏捷交付中，每次工坊会话 (Conversation) 新增功能需求、演进特性或缺陷修复时，单文件结构无法承载多会话、多特性的增量演进。  
> **对齐标准**：全面吸收 `ruoyi-all-next` 现代软件工程标准，将过程文档全面迁移为**规范化的 CMMI `docs/01_management` ~ `docs/09_operations` 全生命周期资产目录**（含架构设计 `docs/architecture/` 与 `docs/03_design/`）、**敏捷全息特性包 `docs/specs/<domain>/<feature-slug>/`** 与 **机器证据库 `docs/artifacts/`**，支持多次会话、多个环境的多文档增量并存与持续演进！

数字员工在执行 WBS 任务与全生命周期交付时，必须标准交付以下工程资产与机器证据库（26 类标准工程资产）：

### 1. 01_management 项目策划与管理 (`docs/01_management/`)
- `project-charter.md`：项目立项章程、权责边界与范围基线；
- `project-plan.md`：综合研发与交付计划、里程碑计划；
- `rskm-risk-ledger.md`：技术与交付风险台账及应对预案；
- `DAR-*.md`：加权决策分析记录（至少 2 正选 + 1 阴性对照）；
- `phase-configuration-management.md`：阶段配置管理基线。

### 2. 02_requirements 需求工程与规格 (`docs/02_requirements/`)
- `software-requirements.md`：EARS 语法（`WHEN...THEN...SHALL`）软件需求规格说明书 (SRS)；
- `requirements-traceability-matrix.md`：双向需求跟踪矩阵 (RTM)；
- `non-functional-reqs.md`：非功能性指标与容量基线 (NFR)；
- `user-requirements.md`：用户原始故事与业务诉求说明 (URS)。

### 3. 03_design 系统架构与技术解决方案 (`docs/03_design/`)
- `ADR-*.md`：MADR 架构决策记录；
- `architecture-design-hld.md`：微服务拓扑、分层架构与租户数据隔离设计；
- `database-design-erd.md`：数据库物理模型与 ER 拓扑；
- `interface-contracts/` 与 `api-specifications.md`：统一 OpenAPI / RESTful 契约。

### 4. 04_implementation 构造实现与防假 (`docs/04_implementation/`)
- `coding-standards.md`：代码规范清单与 8 大防假红线；
- `mutation-testing-guide.md`：变异测试指引与存活突变体拦截；
- `plugin-blueprint.md`：业务插件隔离与通信蓝图；
- `software-bill-of-materials.md`：软件物料清单 (SBOM)。

### 5. 05_verification 验证确认全栈验收 (`docs/05_verification/`)
- `test-plan.md`：全栈测试验证计划；
- `test-summary-report.md`：真实测试套件执行大盘（100% 退出码 0）；
- `mutation-report.md`：真实变异测试报告（必须带 `--real`）；
- `uat-acceptance-certificate.md`：客户终验核销单（法定商务结算闭环凭证）。

### 6. 06_cmmi_audit 质量保证与度量审计 (`docs/06_cmmi_audit/`)
- `spc-control-chart.md`：统计过程控制 (SPC) 缺陷与吞吐控制图；
- `car-5whys-rca.md`：CAR 5-Whys 根因分析与纠正防退化用例；
- `audit-trail.md`：配置审计与质量合规台账；
- `gate-trace-record.md`：全生命周期门禁追踪。

### 7. 07_release 生产投产与秒级回滚 (`docs/07_release/`)
- `system-deployment-sop.md`：生产环境部署规程与环境拓扑；
- `rollback-emergency-plan.md`：生产割接故障秒级原子回滚预案；
- `RELEASE_NOTES_*.md`：产品版本发布说明；
- `release-verification-checklist.md`：发版前夕 7 处版本一致性核对清单。

### 8. 08_sre 站点可靠性保障 (`docs/08_sre/`)
- `01_slo_sli_metrics/SLO-SLI-ERROR-BUDGET-MATRIX.md`：SLO/SLI 99.95% 可用性与错误预算矩阵；
- `disaster-recovery-plan.md`：双活容灾演练与混沌工程预案；
- `02_postmortem/POSTMORTEM-*.md`：生产故障 5-Whys 无指责复盘台账（未发生事故时严格保留 `.gitkeep` 留空）；
- `strix-penetration-report.md`：Strix 多智能体红队真实渗透演练报告（必须带 `--real`）。

### 9. 09_operations 商业化持续运营 (`docs/09_operations/`)
- `tenant-governance.md`：多租户企业入驻审批与配额治理规程；
- `agent-operations-ledger.md`：数字员工运营流水、自动化造数与清数记录；
- `system-inspection-report.md`：常态化系统健康巡检报告；
- `02_financial_reconciliation/RECONCILIATION-*.md`：日终财务平账对账与资产守恒凭证（未发生流水时严格保留 `.gitkeep` 留空）。

### 10. 敏捷特性全息规格包 (`docs/specs/<domain>/<feature-slug>/`)
- 由 Spec-Kit SDD 引擎 (`npm run speckit:new`) 驱动，内聚 10~15 件套：
  - `brief.json`：声明式特性元数据与需求源头；
  - `spec.md` / `requirements.md`：EARS 语法需求分析；
  - `plan.md` / `design.md`：架构设计、API 契约与风险分析；
  - `tasks.md`：Wave 阶段任务分解图谱与 1 Task = 1 Commit 取证看板；
  - `checklist.md`：质量审查清单；
  - `spec.json`：机器可读规格定义；
  - `evidence.json` / `runbook.json`：可执行验证剧本与门禁证据账本。

### 11. 不可篡改机器证据库 (`docs/artifacts/`)
- `security-scan-result.json`：静态代码分析、CVE 漏洞扫描；
- `load-test-result.json`：真实高并发压测吞吐 (QPS)、P95/P99 延迟；
- `env-fingerprint.json`：构建依赖的唯一 SHA256 指纹；
- `harness-trace-latest.json`：架构门禁守卫追踪；
- `workflow-runs/`：Kiro 工作流运行历史记录。

---

## 三、 可验证结项准则：无物理交付物严禁结项 (No Artifact, No Done)

1. **结项门禁前置校验**：
   - 任务更新为 `done` 时，必须确保该任务已通过 `POST /api/issues/:id/work-products` 或 `POST /api/issues/:id/documents` 挂载了上述工程资产或机器证据；
   - 完工状态由控制面工件总线提供的实质性资产凭证作为唯一认证依据 (No Artifact, No Done)。
2. **交付物实质性审查**：
   - 源码资产通过编译器与自动化测试集校验；
   - 交互原型在沙箱中实现正常渲染与状态流转；
   - 过程文档遵循结构化可断言的 EARS / OpenAPI / SOP 规范，直接映射底层工程；
   - 机器证据库具备可验证的时间戳与物理运行指纹。

---

## 四、 项目目录结构与基座极速派生 (Hatching) 规范

老板最高指示：**「项目目录结构默认 PNPM workspace monorepo,如果选择了 开源基座 就 以基座目录结构 为准，弃用生硬的 .coolie/cmmi/，全面采用 ruoyi-all-next 的扁平 docs/specs/ 与 docs/ 开放结构；同时必须继承 Paperclip 原生能力，以 Paperclip 总产品架构师视角审视」**

### 1. 平台本体仓库 vs 客户交付项目工作区（严格分界）
- **Coolie 平台本体仓库 (Platform Repo)**：
  - 100% 遵从 Paperclip 官方目录标准（`server/`, `ui/`, `packages/`, `cli/`, `skills/`, `doc/`）；
  - **平台规划必须集中**：长周期设计与方案统一放进 `doc/plans/YYYY-MM-DD-slug.md`（upstream Rule 5 铁律），严禁私建孤岛目录；工单级临时 plan 直接更新控制面 `issue_documents`。
- **客户交付项目工作区 (Client Project Workspaces)**：
  - **自研全栈工程**：默认采用 **PNPM workspace monorepo** 标准布局；
  - **开源基座工程**：100% 保持基座原生架构（零侵入、零污染），完全尊重其原有包管理与工程生态。

### 2. 默认自研目录结构：PNPM Workspace Monorepo
- 自研及全栈商业项目默认采用 **PNPM workspace monorepo** 标准布局：
  ```text
  ├── pnpm-workspace.yaml
  ├── package.json
  ├── .agents/
  │   ├── skills/         # CMMI 00~09 阶段化专属技能库
  │   └── workflows/      # Kiro 原生工作流配方单一真源 (4大配方)
  ├── .kiro/
  │   └── workflows -> ../.agents/workflows # Kiro IDE 原生桥接软链接
  ├── packages/           # 共享契约、SDK、DB 模型 (如 shared, db, adapters)
  ├── apps/ 或 server/ ui/ # 核心服务、Web 端、移动原生端
  ├── docs/               # 开放式全生命周期工程文档目录 (彻底弃用 .coolie/cmmi/)
  │   ├── 01_management/  # 项目立项书、综合计划、风险台账、DAR决策分析
  │   ├── 02_requirements/# EARS 5态软件需求规格 (SRS)、跟踪矩阵 (RTM)、NFR
  │   ├── 03_design/      # MADR架构决策、HLD设计、数据库模型 ERD、统一契约
  │   ├── 04_implementation/ # 编码规范、变异测试指南、插件蓝图、SBOM
  │   ├── 05_verification/# 测试计划、测试总结大盘、变异报告、客户终验单
  │   ├── 06_cmmi_audit/  # 统计过程控制 (SPC)、CAR 5-Whys、配置审计单
  │   ├── 07_release/     # 部署割接 SOP、秒级回滚 Runbook、版本发布说明
  │   ├── 08_sre/         # SLO/SLI 矩阵、容灾演练、5-Whys 复盘、渗透报告
  │   ├── 09_operations/  # 多租户开通 SOP、数字员工台账、财务对账平账单
  │   ├── specs/          # 【敏捷特性规格包】docs/specs/<domain>/<feature-slug>/
  │   └── artifacts/      # 机器证据库与工作流运行流水 (workflow-runs/)
  ├── wiki/               # OpenWiki (LLM-Wiki) 动态自愈知识大脑 (openwiki 软链接)
  └── scripts/            # 自动化编译、门禁、工作流引擎与交付脚本
  ```

### 3. 开源基座自适应与极速骨架派生 (Zero-Git-History Hatching)
- **替代缓慢臃肿的 Git Clone**：
  采用 `degit xaicd/ruoyi-all-next#main <dir>` 或 `hatch.sh` 机制，免下载 500MB+ Git 历史包，秒级生成独立纯净工程；
- **分级 Profiles 阶梯**：
  - `base`：平台核心底座 (shared + system + infra) - 仅 ~50MB，秒级极速编译；
  - `minimal`：底座 + 低代码/AI大模型网关；
  - `standard`：全量 17 域与客户端 NPC 全能力中台。
- **工程自动化重构**：
  结合 `project:init` 自动重置包名、命名空间、端口与 SQLite/PG 本地库，建立独立的全新 git init 首提交。

### 4. 开放式工程文档物理归宿与控制面双向绑定 (`docs/` & `docs/specs/`)
- 当项目采用 Doc-as-Code 模式时，项目全生命周期的工程文档在工作区根目录下**统一存放在 `docs/` 开放目录中**：
  - `docs/01_management/` 至 `docs/09_operations/`：全生命周期 26 类工程过程资产基线；
  - `docs/specs/<domain>/<feature-slug>/`：敏捷特性的全息内聚包（brief.json, requirements.md, design.md, tasks.md, spec.json, runbook.json），由 Kiro SDD 引擎 (`npm run spec:ops`) 驱动；
  - `docs/artifacts/`：不可篡改机器证据库与工作流运行记录（`workflow-runs/`）；
  - `.agents/workflows/`（与 `.kiro/workflows`）：Kiro SDD 原生多智能体工作流配方。
- **杜绝私有隐藏目录与单文件僵化**：
  - 彻底弃用 `.coolie/cmmi` 隐藏目录与把所有需求硬塞在一个单文件的瀑布式旧方案；
  - 本地 `docs/` 与 `docs/specs/` 仅作为 Doc-as-Code 工作副本，**必须通过 `resourceRef` 挂载至 Paperclip 控制面 `issue_work_products`**，控制面才是审批、结项门禁与高管审查的唯一法定真理源！

---

## 五、 超级集成体双轨闭环规范：控制面原生实体与工作区血缘映射

站在 **Paperclip 总产品架构师** 与 **交付工厂总架构师** 的高度，交付资产必须遵循**控制面第一公民优先，代码工作区无侵入映射**的双轨闭环铁律：

### 1. 控制面原生实体第一原则 (Primary Control-Plane Entities)
- **过程规格文档**：优先通过 Paperclip 控制面原生文档接口（`POST /api/issues/:id/documents`）挂载为 `issue_documents`（`key: "plan"`、`key: "srs"`、`key: "hld"`、`key: "lld"`）。
  - **高管体验**：Web 端与移动端直接原生预览，支持高管在线逐行划线批注、评审打回，沙箱销毁依然持久存在；
- **测试证据与不可变产物**：100% 通过 `register_deliverable` 或 `skills/paperclip/scripts/paperclip-upload-artifact.sh` 上传为持久化 Attachment，点亮任务 **Artifacts 标签页**，保证离线可看、销毁不丢。

### 2. 代码工作区无侵入映射 (Secondary Workspace Mapping)
- 源码、配置文件及工程内部文档（Doc-as-Code），通过 Paperclip 原生 `issue_work_products` 登记：
  ```json
  {
    "type": "artifact",
    "provider": "paperclip",
    "title": "SRS 需求规格说明书与 RTM 追踪矩阵",
    "metadata": {
      "resourceRef": {
        "kind": "workspace_file",
        "relativePath": "docs/02_requirements/software-requirements.md"
      }
    }
  }
  ```
- 建立控制面任务与代码库物理文件的不可变双向血缘映射（项目级工程文档位于 `docs/01_management` ~ `docs/09_operations`，敏捷特性全息包位于 `docs/specs/<domain>/<feature-slug>/`），绝不暴力篡改开源基座，绝不造成本地孤岛。

### 3. 工坊自举证道 (Dogfooding / Self-Building Truth)
- **事实基准**：本产品 COOLIE 工坊本身就是由宿主机 `COOLIE DEV` 本地 AI AGENT 团队（Hermes、墨斗、铁匠、门神、兑底渊、百晓生）基于本平台完全自主建设与迭代；
- **自验证要求**：本产品自身的从 0 到 1 全部工程过程、门禁、任务与交付资产，就是检验本产品是否真正达到“活体本体中枢、控制面主线、CMMI 5 质量门禁、极简人机驾驶舱”的终极活体证据！

