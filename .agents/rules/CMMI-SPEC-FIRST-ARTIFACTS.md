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

**绝对红线**：严禁把系统上线后的业务内容（如九夏智居的板件加工图、算料利用率、数控打孔代码）当成 CMMI 软件工程交付物！

---

## 二、 CMMI G1-G5 的唯一合法工程交付物标准

数字员工在执行 WBS 任务或 CMMI 阶段时，仅允许产出以下 7 类工程真资产，严禁生成放之四海皆准的空话长文：

### 1. G1 需求基线 (Requirements Baseline)
- **合法交付物**：
  - **《软件需求规格说明书 (SRS)》**：以 EARS 句式（`WHEN...THEN...SHALL`）精确定义的系统功能清单，严禁使用“尽量”、“可能”等模糊词；
  - **《需求双向跟踪矩阵 (RTM)》**：结构化映射表，每条需求 100% 对应到具体的 HLD 模块与测试用例编号。

### 2. G2 架构与设计基线 (Architecture Baseline)
- **合法交付物**：
  - **《系统架构与概要设计说明书 (HLD)》**：包含微服务拓扑图、技术选型分析 (DAR)、数据多企业隔离方案；
  - **《OpenAPI / Swagger 接口契约定义》**：结构化的 `.yaml` / `.json` 接口定义，直接用于前后端联调与 Mock；
  - **《数据库 ER 图与物理 DDL Migration》**：严谨的表结构与索引设计脚本。

### 3. G3 构造与实现基线 (Build & Construction)
- **合法交付物**：
  - **完整工程源码仓库 (Source Code Repo)**：遵循模块化工程规范，包含完整的构建配置；
  - **编译 0 报错验证包**：执行 `pnpm build` 或对应编译命令，退出码必须为 0；
  - **移动端沙箱高保真可交互原型 (Interactive Prototype)**：能在 Expo/Web 沙箱中点击体验的交互组件或前端页面包。

### 4. G4 验证与确认基线 (Verification & Validation)
- **合法交付物**：
  - **《系统全栈测试用例集 (Test Suite)》**：覆盖正常流、边界值、异常流；
  - **《自动化测试与拟真人真机回归报告》**：真实的单测覆盖率报告、宿主机真机 1080P 全态快照存证、缺陷修复闭环台账。

### 5. G5 交付与投产基线 (Release & Handover)
- **合法交付物**：
  - **《生产环境部署与秒级回滚预案 (Deployment & Rollback SOP)》**：运维一键拉起容器与回滚的确定性步骤；
  - **《用户操作使用手册 / 运维指南》**：交付给甲方技术管理员与使用者的说明文档；
  - **《项目竣工验收报告与终验双方会签单》**：用于商务结算与项目归档的最终闭环凭证。

---

## 三、 结项军规：无物理交付物严禁完成 (No Artifact, No Done)

1. **结项门禁前置校验**：
   - 数字员工在完成任务并调用接口将状态更新为 `done` 时，必须确保该任务已通过 `POST /api/issues/:id/work-products` 挂载了至少一项上述合法工程资产；
   - 严禁空跑！凡是没有挂载交付物、或仅挂载空文件的任务，API 将直接返回 `422 Unprocessable Entity` 物理阻断。
2. **交付物真伪性审查**：
   - 百晓生 (DS) 与 Hermes (PM) 在验收结项时，必须审查交付物的实质性：
     - 代码必须经过编译器检验；
     - 原型必须在沙箱中可正常交互并渲染；
     - 文档必须是结构化可断言的 EARS / OpenAPI / SOP，杜绝假大空模板。

---

## 四、 项目目录结构与 CMMI 过程文档物理归宿规范

老板最高指示：**「项目目录结构默认 PNPM workspace monorepo,如果选择了 开源基座 就 以基座目录结构 为准 再新增 CMMI 各个过程文档 .coolie/cmmi/xxx」**

### 1. 默认目录结构：PNPM Workspace Monorepo
- 自研及全栈商业项目默认采用 **PNPM workspace monorepo** 标准布局：
  ```text
  ├── pnpm-workspace.yaml
  ├── package.json
  ├── packages/           # 共享契约、SDK、DB 模型 (如 shared, db, adapters)
  ├── apps/ 或 server/ ui/ # 核心服务、Web 端、移动原生端
  ├── .coolie/cmmi/       # CMMI 0-1 软件工程过程文档基线 (必须具备)
  └── scripts/            # 自动化编译、门禁与交付脚本
  ```

### 2. 开源基座自适应标准 (Open-Source Base Directory Standard)
- 如果项目立项选择了**开源基座**（如 `ruoyi-all-next` 微服务中台底座、`semantica`、Django、Spring Boot、Next.js 官方脚手架等），**100% 必须以开源基座原生的目录结构为准**；
- **坚决尊重开源基座生态**：严禁强行将其重组为不兼容的结构，保持开源基座原有的 Maven/Gradle/Poetry/PNPM 结构与模块划分。

### 3. CMMI 过程文档物理归宿：`.coolie/cmmi/xxx`
- 无论项目采用默认 PNPM monorepo 还是开源基座，项目全生命周期的 CMMI 过程文档**必须 100% 统一存放在项目根目录下的 `.coolie/cmmi/` 目录中**：
  - `.coolie/cmmi/01-srs.md`：G1 软件需求规格说明书 (EARS 语法) 与需求双向跟踪矩阵 (RTM)
  - `.coolie/cmmi/02-hld.md`：G2 系统概要设计说明书、企业隔离方案与 DAR 技术选型决策表
  - `.coolie/cmmi/03-lld-api.md`：G3 系统详细设计说明书、数据字典与统一 OpenAPI 契约
  - `.coolie/cmmi/04-test-report.md`：G4 界面四态状态机规格、防抖验证与真机集成测试验收报告
  - `.coolie/cmmi/05-deploy-sop.md`：G5 不可变制品指纹、部署架构拓扑与秒级回滚 SOP
  - `.coolie/cmmi/06-spc-metrics.md`：CMMI 5 任务吞吐与缺陷率统计过程控制分析表
  - `.coolie/cmmi/07-car-prevention.md`：CMMI 5 缺陷 5-Why 鱼骨图因果分析与防退化断言表
- **杜绝路径漂移**：严禁使用 `docs/cmmi`、`coolie-docs`、`cmmi-docs` 等私有离散路径，全平台统一以 `.coolie/cmmi/` 为绝对落盘标准。
