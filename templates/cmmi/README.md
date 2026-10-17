# CMMI 01~09 组织标准过程资产模板库 (OSSP Templates)

> **最高定位**: 全平台 CMMI 5 高成熟度与 GB/T 8567-2006 组织过程资产库 (Organizational Standard Software Process, OSSP)。  
> **核心原则**: **模版与真实交付物绝对物理隔离**。本目录仅存放标准空白模版与填报指导，严禁混入任何项目真实的业务数据。  

---

## 🏛️ 一、模版与真实交付物双轨物理隔离矩阵

根据 CMMI 5 高成熟度规范与 ISO 9001 质量管理要求，组织标准过程模板（OSSP）与各项目实际产生的工程履约真资产必须实施彻底的物理隔离：

| 资产类型 | 物理存放目录 | 核心职责与内容特征 | 是否允许直接填报业务数据 |
| :--- | :--- | :--- | :---: |
| **组织标准模版库 (OSSP)** | **`templates/cmmi/`** (本目录) | 存放 01~09 全生命周期空白标准模板、章节骨架、EARS 句式范例与填报说明 | **严禁 (仅作为母本)** |
| **工坊平台真实交付资产** | **`docs/01_management/` ~ `docs/09_operations/`** | Coolie 平台本体自身的真实过程资产（包含真实 Git Commit SHA、14 条真实需求、25 道门禁报告） | **是 (平台唯一真理源)** |
| **客户商业项目真实交付资产** | **`projects/<client-slug>/docs/`** | 客户商业项目（如云南移动企微中台、社区生活服务中台）的真实交付资产，随客户工程版本归档 | **是 (客户法定终验资产)** |

---

## 📂 二、01~09 全生命周期标准空白模板清单

- **`01_management/`**:
  - `project-charter.template.md`: 项目立项与范围说明书母本
  - `project-plan.template.md`: 综合研发管理计划与 WBS 里程碑母本
  - `rskm-risk-ledger.template.md`: 风险跟踪管理台账母本 (RSKM)
- **`02_requirements/`**:
  - `software-requirements.template.md`: EARS 5态精准需求规格说明书母本 (SRS)
  - `requirements-traceability-matrix.template.md`: 需求与代码双向跟踪矩阵母本 (RTM)
  - `non-functional-reqs.template.md`: 非功能性需求与性能指标母本 (NFR)
- **`03_design/`**:
  - `architecture-hld.template.md`: 概要设计说明书母本 (HLD - 4+1 视图)
  - `openapi-spec.template.md`: 统一 OpenAPI 3.1 强契约接口规范母本
  - `adr-decision.template.md`: 架构决策记录母本 (MADR)
- **`04_implementation/`**:
  - `coding-standards.template.md`: 工程编码规范与防死穴守则母本
  - `peer-review-record.template.md`: 同行评审与静态代码走查记录母本
- **`05_verification/`**:
  - `test-plan.template.md`: 全栈测试策略与计划母本 (VAL)
  - `test-summary-report.template.md`: 系统测试总结报告母本 (STR)
  - `uat-acceptance-report.template.md`: 客户终验报告与四方签字单母本 (UAT)
- **`06_cmmi_audit/`**:
  - `audit-trail.template.md`: 全生命周期合规与不可变履约审计账本母本 (PPQA)
  - `car-5whys-rca.template.md`: 根本原因分析与预防措施母本 (CAR)
- **`07_release/`**:
  - `system-deployment-sop.template.md`: 生产部署与割接标准作业规程母本 (SOP)
  - `rollback-emergency-plan.template.md`: 生产秒级回滚应急操作手册母本
  - `release-verification-checklist.template.md`: 投产上线发布走查清单母本
- **`08_sre/`**:
  - `slo-sli-matrix.template.md`: 服务等级目标与错误预算矩阵母本 (SLO/SLI)
- **`09_operations/`**:
  - `multi-tenant-governance.template.md`: 多租户行级物理隔离治理手册母本

---

## 🚀 三、如何从模板库一键派生真实项目资产

严禁直接修改本目录下的模板文件！当新建或初始化商业交付项目时，通过平台标准流水线工具从模板库派生：

```bash
# 为指定商业交付项目派生全生命周期核心基线资产
node scripts/cmmi-asset-scaffold.cjs batch --project <项目代号> --title "项目全称" --mode baseline

# 校验目标项目的 CMMI 资产合规性与真实性
bash scripts/harness.sh cmmi-check --project <项目代号>
```
