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

*本表与任何历史文档的裸 "coolie" 用法冲突时,以本表为准。*
