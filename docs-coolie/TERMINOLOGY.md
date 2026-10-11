# 术语表 (TERMINOLOGY) — 消除 "coolie" 命名冲突

> **背景**:"coolie" 指向**两个不同项目**,极易混淆。本表钉死统一代号。改动/迁移前先读。
> **硬规则:禁止单独用 "coolie" 指代任一方,必须用下面的代号。**

| 代号 | 是什么 | 仓库 | 角色 |
|---|---|---|---|
| **TARGET**(本仓库) | paperclip 的 fork(MIT 控制平面) | `xaicd/coolie` | **迁移目标 / 定开底座**。本仓库即 TARGET。 |
| **SRC**(源) | DigitalStaff —— 用户旧系统(曾改名"苦力/Coolie",`coolie.cloud`) | `xaicd/DigitalStaff` | **迁移源**。仅作能力参考,clean-room 重写,不搬实现。 |

- 迁移方向恒为 **SRC → TARGET**。
- 本仓库内部包名 `@paperclipai/*`、环境变量 `PAPERCLIP_*` 是 fork 内部标识,**不改**(改了破坏基线);对外展示品牌 P1 已改为 "Coolie"(`ui/src/branding.ts`)。
- SRC(DigitalStaff)的 `AGENTS.md` 自称 "Coolie/苦力" —— 那是 **SRC 旧品牌自述**,与本仓库无关,读到时按 SRC 理解。
- 完整版术语表见 SRC 仓库 `rewrite/TERMINOLOGY.md`。

## 概念名 (别串味)

- **公司 (company)** = 平台**唯一**的隔离与归属单元。`companies` 就是边界,`company_id` 遍布业务表,
  **一个客户 = 一个 company**。想给平台再加一层 "tenant" 是错的 —— 那会变成"第二个身份要和第一个保持同步"。
  历史文档里写"租户隔离 / 本体属于租户 / 租户生命周期"的地方,一律按 **公司** 读。
- `ontology_tenants` / `tenant_id`(`migrations/016_tenants_and_keys.sql`、`017_members.sql`,
  以及 `packages/ontology-core/src/auth/`)是**本体自己的旧身份模型**,为当初设想的"独立部署"准备的,
  **插件模式下是惰性的** —— 只有 standalone MCP 会校验它,插件 worker 从不校验。
  读到时按"本体内部的残留概念"理解,**不要拿它给平台加一层租户**。

## 系统、本体域、本体模型与代码位置 (层级绝不混淆)

| 层级 | 术语 | 英文 | 概念本质 | 典型例子 | 在 Coolie 哪个位置强制 |
|---|---|---|---|---|---|
| **L1 平台隔离** | **公司** | Company | 平台唯一顶级租户/组织边界 | `acme` 公司 (`companies` 表) | `company_id` |
| **L2 工程载体** | **业务系统** | Business System | 具体的软件代码工程或客户端 | 若依后台 `ruoyi-all-next`、移动端 `clients/expo` | `ontology_business_systems` / `projects` |
| **L3 业务限界** | **本体域** | Ontology Domain | 业务概念隔离的命名空间容器 | 电商域 `ecommerce`、仓储进销存域 `wms`、财务域 `finance` | `ontology_domains` 表 (`slug`) |
| **L4 架构图纸** | **本体模型** | Ontology Model | 域内的实体属性、拓扑与状态机 | `Order` 对象、`price` 属性、`HAS_ITEM` 关系、`refund` 状态迁移动作 | `ontology_node_types` / `relation_types` / `action_types` |
| **L5 代码实现** | **代码落点** | Code Location | 具体的源码目录与文件树 | `prisma/schema.prisma`、`src/modules/order/`、`src/app/(admin-pages)/admin/order/` | 物理目录树与 FDA G1 白名单 |

- **严禁把「本体域」与「本体模型」混同**：域是“房间”，模型是“房间里的图纸与规则”。一个本体域可以有多套模型演进快照。
- **严禁把「业务系统」与「本体域」混同**：系统是代码工程（如 Next.js 后台 / React Native APP），本体域是业务逻辑边界（如仓储物流）。一个业务系统可以连接消费多个本体域，一个本体域也可由多个业务系统共同呈现。

## Dev 与 Prod 环境定位与项目边界 (环境绝不串味)

| 环境 | 运行拓扑 | 核心职责 | 专属项目/公司范围 | 严禁事项 |
|---|---|---|---|---|
| **Dev 环境 (工坊建设面)** | Mac 宿主机 + 内嵌 PGlite (`localhost:3100`) + Hermes + 6 数字员工工具池 | **专事 Coolie 工坊自身建设与造物中枢**：平台自举、功能迭代、架构演进、COOA-XX 派单施工 | 专属承载「Coolie 本地施工总社」公司与 Coolie 自身开发工单 | 严禁与生产客户数据库直连混淆 |
| **Prod 环境 (客户交付面)** | 腾讯云生产服务器 (`tc-coolie-claw` / `https://xrobinai.cn`) | **专事面向企业客户的真实商业与业务交付**：产融智能体、多组织隔离、对外业务运营 | 仅承载真实客户商业项目（如「产融智能体平台」等） | **严禁在生产环境创建或保留 `coolie工坊` 等自身开发项目**，绝不把 Dev 施工数据带上生产！ |

## 交付生命周期：CMMI 工程资产 vs 运行时业务数据 (生命周期绝不混淆)

| 资产类型 | 英文 | 概念本质 | 典型交付产物 | 面向人群与终极用途 | 错误混淆反例 |
|---|---|---|---|---|---|
| **CMMI 0-1 软件工程资产** | Build-Time Engineering Assets | **把一个软件项目从 0 到 1 建设、开发、验证并最终交付客户的工程资产** | SRS 需求规格、OpenAPI Swagger 契约、编译 0 报错源码 Repo、真机全栈测试报告、部署 SOP、终验单 | 甲方技术负责人、项目经理、质量审计员（用于商务结算与系统投产） | 严禁：把系统上线运行后的数据（如算料清单）当成工程交付物 |
| **运行时业务数据/产物** | Runtime Business Outputs | **软件系统交付上线运行后，最终终端业务用户使用系统时产生的内容数据** | 业主玄关柜图纸、板材开料利用率 76.42%、数控打孔 G 代码、企微导购客资表 | 最终业务用户（业主、导购、业务员，用于日常生产和业务运转） | 严禁：把业务运行记录充当 CMMI 任务完成凭据，混入工厂交付看板 |

## 项目目录结构规范与 CMMI 过程文档归宿 (目录标准绝不混淆)

| 工程类型 | 目录结构标准 | CMMI 过程文档存放位置 | 规范要求 |
|---|---|---|---|
| **自研/全栈默认工程** | **PNPM workspace monorepo** | `docs/specs/` & `docs/architecture/` | 根目录具备 `pnpm-workspace.yaml`，子包划分 `packages/`、`apps/` 或 `server/`、`ui/`；敏捷特性规格扁平落盘于 `docs/specs/`，总体架构归档于 `docs/architecture/`，彻底废弃 `.coolie/cmmi/` 隐藏单文件 |
| **开源基座工程 (如 RuoYi)** | **开源基座原生目录结构** | `docs/specs/` & `docs/architecture/` | 100% 尊重开源基座自身的工程组织、模块划分与构建工具链，严禁强行破坏基座结构；在其根目录下通过开放的 `docs/specs/` 与 `docs/architecture/` 承载特性演进与架构规格 |

## 超级集成体：控制面原生实体 (Primary) vs 代码工作区映射 (Secondary)

| 层级 | 实体/机制 | 英文 | 概念本质 | 作用与生命周期 | 错误反例 |
|---|---|---|---|---|---|
| **控制面第一公民 (Primary)** | **原生文档 (Issue Document)** | `issue_documents` | 具备版本追溯与协同批注的第一真理文档 | 承载 `plan`、`srs`、`hld`、`lld`，支持高管在移动端/Web 端在线逐行划线批注，沙箱销毁依然持久存在 | 严禁：仅在本地磁盘写死一个孤立 md 文件，导致云端高管打不开、看不到 |
| **控制面第一公民 (Primary)** | **原生工件总线 (Work Product)** | `issue_work_products` | 具备评审状态与版本链的资产元数据 | 承载 PR、Commit、分支、沙箱服务，支持 `review_state` 审核与 `versionGroupId` 多版本链 | 严禁：任务口头标记 Done 却不在工件总线挂载有效实体 |
| **控制面第一公民 (Primary)** | **远端不可变证据 (Attachment)** | `issue_attachments` | 通过 `register_deliverable` 入库的不可变附件 | 承载真机四态快照、测试视频 (.mp4/.webm)、离线打包制品，在任务 Artifacts 抽屉直观呈现 | 严禁：把本地磁盘临时绝对路径直接作为交付物发给高管 |
| **代码工程载体 (Secondary)** | **工作区文件 (Workspace File)** | `workspace_file` | Git 仓库中受版本控制的物理源码与文本 | 通过 `issue_work_products` 的 `resourceRef: { kind: "workspace_file", relativePath: "..." }` 建立与控制面的双向血缘映射 | 严禁：暴力篡改开源基座的代码结构，强行塞入不兼容的目录 |

## 工坊自举证道 (Dogfooding / Self-Building Foundry)

- **核心定义**：Coolie 平台自身完全由宿主机本地 AI Agent 团队（Hermes 掌柜 + 墨斗 FDA + 铁匠 Core SWE + 门神 FDSE + 兑底渊 PRE-SRE + 百晓生 DS）基于 Coolie 平台架构自举迭代。
- **全生命周期自验证**：本产品自身的从 0 到 1 全部研发、测试、审计与发版环节，就是检验本产品是否真正达成“控制面中枢、活体本体驱动、CMMI 5 质量门禁、极简人机驾驶舱”的唯一终极真理检验场！

*本表与任何历史文档的裸 "coolie" 用法冲突时,以本表为准。*

