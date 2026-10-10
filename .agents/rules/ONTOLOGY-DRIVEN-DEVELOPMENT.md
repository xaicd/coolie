# ONTOLOGY-DRIVEN-DEVELOPMENT.md
# 活体本体驱动开发 (ODD: Ontology-Driven Development) 最高工程法典

> **生效对象**：全体数字员工（Hermes、墨斗/FDA、铁匠/Core SWE、门神/FDSE、兜底渊/PRE-SRE、百晓生/DS）与人类开发者  
> **核心宪章**：对齐《Coolie 根本大纲与工程宪法》公理三（活体业务本体即中枢与真业务物理并轨铁律）与《AGENTS.md》  
> **核心宗旨**：彻底终结“面向裸 SQL 表增删改查、伪报表孤岛、无行动假孪生”的旧软件时代，确立**「活体业务本体 (Living Ontology) 作为全平台唯一控制与决策中枢」**，让软件研发真正以现实世界业务实体与闭环业务行动为驱动源泉。

---

## 一、 ODD 本质与传统开发模式范式革命

传统软件开发与本体驱动开发 (ODD) 的本质区别：

| 维度 | 传统模式 (Table-Centric / CRUD) | 本体驱动开发模式 (Ontology-Driven Development) |
| :--- | :--- | :--- |
| **核心驱动源** | 物理数据库表结构 (`CREATE TABLE`) | **现实世界活体业务实体与闭环行动 (Object Types + Action Types)** |
| **业务逻辑归宿** | 散落在 Controller、Service、存储过程各处 | **本体动词规则契约 (ActionType Pre-conditions & Side-effects)** |
| **数据关系呈现** | 外键连接、联表 SQL、难以穿透的黑盒关系 | **语义链接拓扑网络 (Semantic Links & Living Knowledge Graph)** |
| **状态机与履约** | 散落的 if-else 状态判定，缺乏因果溯源 | **状态迁移动词与不可变履约机器证据 (Audit Trail & Immutable Evidence)** |
| **大盘与报表** | 静态 SQL 聚合死报表，无法穿透真实业务 | **活体对象穿透视标 (Living Metrics)，一键直达原始实体与操作流水** |
| **研发交付标准** | 接口通了、有假数据即交差 | **真实业务旅程走通、闭环行动触发、产生不可变证据凭据** |

---

## 二、 业务双核基石 (The Dual-Core Foundations)

全体数字员工在开展需求分析、架构设计与编码实现时，必须从“业务双核”出发：

```
                    【活体业务本体 (Living Ontology)】
                                   │
         ┌─────────────────────────┴─────────────────────────┐
         ▼                                                   ▼
【活体业务实体 (Object Types)】                     【闭环业务行动 (Action Types)】
• 现实世界的活体数字孪生 (Digital Twins)           • 驱动业务闭环演进的动词行动
• 包含：企业、项目、订单、板材、设备、工单等       • 包含：立项进厂、出图优化、排版开料、验收核销
• 强绑定 8 大审计列与 CompanyId 物理隔离          • 具备严格前置门禁守卫 (Pre-conditions)
• 拥有高信噪比属性 (Properties) 与语义链接拓扑    • 执行产生状态变更并落盘不可变机器证据 (Evidence)
```

### 1. 活体业务实体 (Object Types) 规范
- **现实映射第一性**：Object 必须是现实世界中真实存在的物理或概念实体，严禁为了技术偷懒捏造脱离业务的“中间伪实体”；
- **强组织边界隔离**：全盘所有 Object 必须强制隶属于公司 (`company_id`)，严禁出现无归属全局裸实体；
- **语义链接完整性**：实体间的关系必须显式声明链接类型（如 `Order HAS_ITEM Product`、`Project BELONGS_TO Domain`），杜绝隐式隐晦关联。

### 2. 闭环业务行动 (Action Types) 规范
- **动词闭环原则**：每一个 Action 必须是一个完整的业务动词（如 `approve_proposal`、`checkout_task`、`verify_gate`），严禁只有泛化的“update”；
- **前置守卫与权限 (Guards & Pre-conditions)**：Action 执行前必须强制校验操作者身份、实体当前状态是否允许流转以及预算/门禁约束；
- **不可变证据沉淀 (Evidence Required)**：Action 执行的副作用除更新实体属性外，**必须**向履约账本或审计总线写入机器证据（包括 Commit SHA、测试报告指纹、快照 URI 或审批签名），**No Evidence, No Action Done**！

---

## 三、 ODD 三大物理并轨铁律 (Three Physical Integration Axioms)

### 铁律一：项目即本体域 (Project as Domain)
1. **创建即并轨**：在创建新项目 (`Project`) 时，控制面在事务内原子初始化绑定其专属的本体域 (`ontology_domains`)，并在 `ontology_resource_links` 中记录 `role = "owner"` 的因果血缘；
2. **严禁裸项目**：系统坚决拒绝任何未绑定本体域的“流浪项目”。每个项目进厂的第一秒，就必须明确其本体资产与数据隔离边界。

### 铁律二：会话即本体提议 (Conversation as Proposal)
1. **意图结构化转译**：在工坊 (Board Chat) 中，数字员工 Hermes / 墨斗 接收到掌柜或用户的业务诉求时，不得随意就地修改底层数据，必须转译为结构化的 **提议卡片 (Proposal Card)**；
2. **两字审批落地**：提议卡片明确标注文档/模型变更差异 (Diff)，经由掌柜【确认】或【驳回】两字按钮审批通过后，原子落盘并应用至本体。

### 铁律三：任务即动词血缘 (Task as Action Execution & Provenance)
1. **WBS 任务明确绑定 Action**：工单任务 (Issue) 必须清晰锚定其驱动的业务动词（`ActionType`）；
2. **双轨交付物映射**：任务交付物统一以 Paperclip 控制面工件 (`issue_work_products`) 为凭证，并挂载本地项目文件相对路径 (`metadata.resourceRef.relativePath`)，实现代码提交与本体履约血缘双向贯通。

---

## 四、 CMMI 01~09 与本体全生命周期协同映射

本体不是静态的数据库表，它伴随软件工程全生命周期逐步由浅入深生长：

```
【G1·需求规格】 ──> 业务实体识别 (Object Types) + 用户故事动词定义 (Action Types)
      │
【G2·架构设计】 ──> 确立领域边界 (Domain Boundaries) + 实体关系拓扑 (Links) + DAR选型
      │
【G3·契约编码】 ──> 固化 OpenAPI 详细契约 + 业务动词 Handler 实现 (0 编译报错守卫)
      │
【G4·真机验收】 ──> 驱动真实 ActionType 旅程走查 + 真机四态快照存证为机器证据
      │
【G5·不可变投产】──> 提取发版制品 SHA-256 不可变指纹 + 绑定部署拓扑实体
      │
【G6·韧性保障】 ──> 监控 Object 活跃度与 Action 调用 SLO/SLI 燃烧率
      │
【G7·持续运营】 ──> 多租户开通治理 + 资金与库存日终平账轧差对账
```

---

## 五、 八大正向业务契约与机器硬门禁 (Eight Positive Prescriptive Contracts)

全体数字员工在开展架构设计、编写代码、审查 PR 或执行门禁时，必须严格遵守以下八大正向契约（遵循 RFC 2119 规范）：

- ✅ **契约 1【实体动词成双契约 (Object-Action Parity)】**：每个业务实体 (Object Type) 必须配套声明并实现至少一个业务动词 (`ActionType`)，让实体在业务生命周期中具备明确的驱动生命线；
- ✅ **契约 2【事务真实执行契约 (Transactional Execution)】**：所有 ActionType 必须提供落盘的 TypeScript/SQL 事务 Handler 与真实返回值，确保每一次业务行动都能产生确定性的状态跃迁；
- ✅ **契约 3【履约机器证据契约 (Immutable Evidence)】**：Action 执行完毕后必须向履约账本或审计总线写入不可变机器证据（Evidence / Run Log / Audit），确保每一步动作皆有因果溯源；
- ✅ **契约 4【企业组织隔离契约 (Company Scoping)】**：所有 Object 和 Action 的查询与变更必须在输入层强制注入 `companyId` 组织物理边界，确保客户私域数据具备物理级安全屏障；
- ✅ **契约 5【大盘活体穿透契约 (Penetrative Living Metrics)】**：驾驶舱与大盘的所有指标必须具备本体可解释性，支持点击任意视标一键下钻穿透至底层的真实 Object 记录与 Action 履约流；
- ✅ **契约 6【真实沙箱验证契约 (Real-DB Sandbox)】**：涉及本体业务规则与状态机流转的测试，必须运行在本地 PGlite 嵌入式数据库或物理库之上，基于真实数据执行断言；
- ✅ **契约 7【全盘模型内聚契约 (Schema Cohesion)】**：优先深度复用全盘 263 张物理表成熟模型与业务管网，保持系统的高内聚、低熵演进与极简人机交互；
- ✅ **契约 8【Schema 受控迁移契约 (Controlled Migration)】**：本体元数据与数据表演进必须统一通过 Drizzle migration 脚本进行声明式版本管理，确保生产环境变更平滑有序。

---

## 六、 数字员工在 ODD 体系中的职责分工

| 角色 | 数字员工代表 | ODD 核心职责与产出物 |
| :--- | :--- | :--- |
| **前线业务方案专家 (DS)** | **百晓生 / 掌柜** | 深入客户现场调研，提取现实业务实体与业务故事动词，负责 G1 需求本体建模与 G7 日终平账对账 |
| **前线架构师 (FDA)** | **墨斗 (Modou)** | 负责本体域边界划分、Object Types 属性规范、链接关系拓扑与 ActionType 状态机设计（G2 架构 HLD） |
| **平台核心研发 (Core SWE)** | **铁匠 (Tiejiang)** | 编写 ActionType 的服务端执行逻辑、API 契约守卫，保障 0 编译报错与单向依赖无环性（G3 编码） |
| **前线全栈工程师 (FDSE)** | **门神 (Menshen)** | 负责驱动客户端/移动端调用 ActionType 完整业务旅程，采集四态快照并固化为不可变机器证据（G4 验收） |
| **投产守卫与韧性专家 (PRE-SRE)** | **兜底渊 (Duidiyuan)** | 审核 Action 执行证据的防篡改性，看守全系统实体资金与资产守恒，执行投产秒级回滚与 SRE 稳定性监控（G5/G6） |

---

## 七、 落地检查与门禁执行

在每次代码提交、工单流转与发版审查前，统一执行以下检查以确保 ODD 合规：

```bash
# 1. 检查全生命周期工作流与本体配方静态门禁
npm run workflow:check

# 2. 检查本体域与资源链接绑定守卫测试
pnpm --filter @paperclipai/server test src/__tests__/project-ontology-bootstrap.test.ts

# 3. 检查全面管局审计与宪法级防退化守卫
node scripts/check-governance-audit.mjs
```

> **结语**：本体驱动不是一句空洞口号，而是贯穿立项、设计、编码、测试到投产的完整工程律法。坚持以真实业务实体为靶心，以闭环业务动词为血脉，打造不可战胜的 AI 原生商业软件交付工厂！
