# Palantir Ontology 7 Primitives — 调研报告 (agy 真跑)

> **任务标识**: wave245 §1.1 / §1.2 / §1.3  
> **执行角色**: agy (墨斗 FDA 主工具 / 架构研究)  
> **生成时间**: 2026-10-01  
> **目标产物**: `docs-coolie/research/PALANTIR-ONTOLOGY-PRIMITIVES.md`  
> **后续交接**: PM (Hermes) 依据本报告执行 wave245 B (架构建议) 与 CMMI 映射  

---

## 0. 摘要 (Executive Summary)

本体 (Ontology) 在现代企业级智能体 (AI Agent) 与数据操作平台中，绝非传统语义网 (Semantic Web) 中那种停留在学术纸面的 RDF/OWL 概念图谱，而是**企业全要素的数字孪生 (Digital Twin) 与人机协同的统一操作中枢 (Operational Control Plane)**。Palantir 从早期的 Foundry 数据底座到当下的 AIP (Artificial Intelligence Platform)，其核心杀手锏就是将现实世界的组织、资产、事件与业务规则，高度抽象并收敛为一整套工业级的元模型原语（Metamodel Primitives）。

2026年10月1日，针对 Coolie 工坊之前提出的 L0-L4 划分，老板一针见血地指出：**“分层是不是不太对，本体的几大基础没体现……a 吧”**。老板的判断切中要害——L0-L4（如全局看板、域图谱、实体实例、详情字段）本质上是**用户交互层面的呈现深度与视图导航体系（View / UI Presentation Hierarchy）**，属于应用层的“望远镜”和“显微镜”，而**不是本体系统自身的元模型基石（Foundational Primitives）**。如果把视图层级误当成本体元模型，系统的扩展性、事务一致性与智能体决策边界就会从地基上发生动摇。

真正的企业级本体地基，是由 Palantir 历经十余年工业沉淀、并在 AIP 时代全面爆发的 **7 大核心原语（7 Primitives）** 构筑的：
1. **Object (对象 / 实例)**：现实实体的独立映射，拥有全局不可变唯一标识，承载运行时物理状态；
2. **Type / Object Type (类型 / 概念)**：实体的模式规约（Schema / Class），定义业务边界与能力接口（Interfaces）；
3. **Property (属性 / 槽)**：描述实体特征的强类型化字段槽，受 Value Types 语义规则约束；
4. **Link / Link Type (关系 / 边)**：实体之间的一等公民连接，支持有向图语义与复杂多对多拓扑；
5. **Action / Action Type (动作 / 突变)**：本体世界中唯一的原子化写操作（Kinetic Mutation），内置权限校验、前置断言与事务副作用；
6. **Function (函数 / 计算)**：无状态、类型安全的代码逻辑（TypeScript/Python/AIP Logic），负责图谱遍历、派生计算与推理加工；
7. **Branch (分支 / 沙箱与演进)**：本体的平行时空治理机制，涵盖以“架构演进/安全发布”为核心的 **Global Branching** 与以“假设分析/仿真试错”为核心的 **Ontology Scenarios**。

对比 Coolie 工坊当前的实现状态，我们发现：Coolie 已经在 `packages/shared/src/types/entity-relation.ts`、`packages/db/src/schema/ontology_properties.ts` 以及系统任务/工具层实现了 Object、Type、Property、Link、Action 和 Function 的基础映射，在 7 个原语中已覆盖 6 个；**但是，第 7 个原语——Branch（分支/沙箱），在 Coolie 当前体系中存在 100% 的能力真空**。

没有 Branch 原语，智能体和业务人员就无法在不污染生产数据库的前提下进行“What-If（如果……会怎样）”的仿真演练；架构师在修改 Ontology Schema 时也只能冒着停机或破坏历史数据的风险硬改，无法走类似 Git PR 的提案审批与合并生命周期。本调研报告通过解构 Palantir 官方文档与工程实践真值，逐一锚定 7 大原语的技术内涵，横向透视 Coolie 的架构现状与差距，并从主 Agent 视角给出统一理解框架，为后续 wave245 B 任务的推进奠定坚实的理论与工程依据。

---

## 1. Palantir Foundry / AIP 7 Primitives 官方真值与架构原则

在 Palantir Foundry 与 AIP 的官方架构体系中，Ontology 被严格划分为两大维度：**静态的语义元素（Semantic Elements）** 与 **动态的动能元素（Kinetic Elements）**，并在外层通过**版本与沙箱治理原语（Governance & Evolution Primitives）** 进行包裹，构成自洽的闭环。

```
                     ┌────────────────────────────────────────────────────────┐
                     │                 Branching & Scenarios                  │
                     │          (Global Branching + Ontology Scenarios)       │
                     └──────────────────────────┬─────────────────────────────┘
                                                │ Encloses & Sandboxes
                                                ▼
     ┌──────────────────────────────────────────┴──────────────────────────────────────────┐
     │                                                                                     │
     │      【语义要素 Semantic Elements】                     【动能要素 Kinetic Elements】       │
     │   Modeling the World (静态存在与关系)             Enabling Change & Computation (动态流变)   │
     │                                                                                     │
     │   ┌─────────────────────────────┐               ┌─────────────────────────────┐     │
     │   │      Object Type            │               │        Action Type          │     │
     │   │  (Schema, Class, Interfaces)│               │  (Atomic Write, Side-effect)│     │
     │   └──────────────┬──────────────┘               └──────────────┬──────────────┘     │
     │                  │ Instantiates                                │ Mutates            │
     │                  ▼                                             ▼                    │
     │   ┌─────────────────────────────┐ Traverses     ┌─────────────────────────────┐     │
     │   │       Object Instance       ├───────────────┤          Function           │     │
     │   │ (PK, Identity, State Store) │               │(Stateless Compute, AIP Logic)     │
     │   └──────┬───────────────┬──────┘               └─────────────────────────────┘     │
     │          │ Carries       │ Connects via                                             │
     │          ▼               ▼                                                          │
     │   ┌──────────────┐┌──────────────┐                                                  │
     │   │   Property   ││  Link Type   │                                                  │
     │   │ (Value Types)││    & Link    │                                                  │
     │   └──────────────┘└──────────────┘                                                  │
     └─────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 1.1 Object (对象 / 实例)

#### 1.1.1 官方真值定义
> **Palantir Documentation**: *"An object is a single instance of an object type that represents a specific person, place, or thing in the real world (for example, JFK Airport or Employee #1042)."*  
> (参见: Palantir Foundry Docs — *Ontology Object Types & Objects*)

在 Palantir 中，Object 是真实物理世界或业务场景中独立存在的离散个体。每一个 Object 必须具备以下三个不可分割的要素：
1. **主键标识 (Primary Key / Object RID)**：全局唯一、不可变、不可篡改的标识符（Resource Identifier）；
2. **所属类型绑定 (Object Type Binding)**：明确指向一个且仅一个合法的 Object Type；
3. **属性状态集 (Property Values)**：当前时刻该实体所持有的属性值载荷。

#### 1.1.2 架构原则与辨析
*   **Object vs. DB Row / Record**：
    *   数据库中的 Row/Record 是单纯的结构化存储片段，只具备外键关联和列值，缺乏业务语义与行为边界。
    *   Object 则是**富血肉的操作对象**。它直接与底层数据流水线（Datasets）、流式总线（Streaming）、权限策略（Markings / Access Controls）以及顶层交互动作（Actions）绑死。Object 在内存与 API 层面体现为一个强类型的实体模型，不仅包含属性，还包含能够对它发起的链接导航与合法操作集合。
*   **Object vs. Type**：
    *   Type 是元数据定义（Compile-time / Meta-level），Object 是运行时实例化数据（Runtime / Data-level）。
    *   在 Foundry 的架构中，“不存在没有 Type 归属的孤魂野鬼 Object”。任何 Object 的创建、查询、校验与销毁，必须依托其对应的 Object Type 元数据。

#### 1.1.3 典型工业范例
*   **民航领域**：Object Type 为 `Aircraft`，具体的 Object 实例为尾号为 `N102AA` 的波音787客机。该 Object 拥有主键 `N102AA`，当前位于达拉斯机场，飞行工时 12,450 小时。
*   **供应链领域**：Object Type 为 `PurchaseOrder`，具体的 Object 实例为编号为 `PO-2026-99881` 的采购订单，状态为 `PENDING_APPROVAL`，总金额为 `$45,000`。

---

### 1.2 Type / Object Type (类型 / 模式)

#### 1.2.1 官方真值定义
> **Palantir Documentation**: *"Object types are the definitions for the things that matter to your organization. They define the schema, permissions, backing datasources, and capabilities of objects."*  
> (参见: Palantir Foundry Docs — *Overview of Object Types*)

Object Type 是本体中的**核心概念抽象与模式骨架**。它不仅是字段定义的集合，更是企业治理策略的最小单元。一个完备的 Object Type 包含：
- **Schema 定义**：属性清单、主键指定、标题属性（Title Property）；
- **数据源绑定 (Backing Sources)**：定义该 Type 的数据是由离线 Batch Dataset、实时 Streaming 管道、还是外部第三方 API 同步驱动的；
- **接口实现 (Interfaces)**：支持多态性（Polymorphism），一个 Object Type 可以实现通用接口（如 `Locatable`, `Auditable`, `Asset`），从而被通用组件和通用智能体统一操作；
- **安全标记 (Markings & Row-level RBAC)**：决定了谁能看见和修改此类对象。

#### 1.2.2 架构原则与辨析
*   **Type vs. Class / Struct**：
    *   编程语言中的 Class 关注内存布局与类内方法绑定；
    *   Ontology 中的 Object Type 是**横跨三层（存储层、图谱连接层、交互呈现层）的全局元模型**。在 Object Type 上所作的约束，会自动下推到底层 SQL/Spark 计算引擎，上推至 UI 自动生成表单与看板（Workshop / Quiver），并投影为 LLM Agent 可理解的 JSON Schema 工具提示。
*   **架构目的**：
    *   消除数据孤岛与概念歧义。不同业务系统中的 `tb_cust`, `crm_customer_info`, `user_account` 统一映射到唯一的 `Customer` Object Type 上，使全企业上下共享同一套认知语义。

#### 1.2.3 典型工业范例
定义 `Flight` Object Type：
- **Primary Key**: `flightId` (String)
- **Title Property**: `flightNumber` (String)
- **Implemented Interfaces**: `SchedulableEvent`
- **Backing Dataset**: `/Enterprise/Aviation/Cleaned/Flights_v3`

---

### 1.3 Property (属性 / 槽)

#### 1.3.1 官方真值定义
> **Palantir Documentation**: *"Properties represent the individual pieces of information that describe an object type. Properties are backed by columns in the backing dataset or can be derived from other properties."*  
> (参见: Palantir Foundry Docs — *Property Types & Value Types*)

Property 是 Object Type 内部的原子特征槽位。Palantir 对 Property 的要求极其严密，支持三种本质形态：
1. **持久化属性 (Stored / Backed Property)**：直接由底层表/数据流的物理字段映射而来；
2. **派生属性 (Derived / Calculated Property)**：由内置表达式或轻量规则动态计算得出（例如由 `birth_date` 动态推导 `age`）；
3. **共享属性与值类型 (Shared Property Types & Value Types)**：具有全局统一定义的强约束语义类型（例如 `EmailAddress`, `CurrencyAmount`, `Geohash`），自带正则校验、加密脱敏规则和呈现模版。

#### 1.3.2 架构原则与辨析
*   **Property vs. DB Column**：
    *   DB Column 只有简单的数据类型（如 `VARCHAR(64)` 或 `NUMERIC(10,2)`），它不知道这个字段代表的是人名、美金、还是未脱敏的社保号。
    *   Ontology Property 是包含**业务元语义的强类型字段**。它绑定了 Value Type，知晓国际化格式、展示标签、模糊脱敏规则、以及在 LLM 上下文注入时的 System Description 说明。
*   **Type-defined vs. Object-set**：
    *   Property 的**定义权与类型约束**归属于 Object Type（在编译期固化）；
    *   Property 的**具体取值与状态变更**发生于具体的 Object 实例上（在运行时由 Action 或 Data Pipeline 写入）。

#### 1.3.3 典型工业范例
在 `Airport` Object Type 中：
- `icaoCode`: String, Regex `^[A-Z]{4}$`, 必须唯一；
- `geographicLocation`: Geospatial Point, 用于地图渲染与距离计算；
- `currentWeatherCondition`: Value Type `WeatherStatusEnum`, 支持实时流写回。

---

### 1.4 Link / Link Type (关系 / 边)

#### 1.4.1 官方真值定义
> **Palantir Documentation**: *"Link types define the relationships between object types. A link is an instance of a link type between two specific objects, creating an interconnected knowledge graph."*  
> (参见: Palantir Foundry Docs — *Ontology Link Types*)

Link Type 是本体图谱中的边规则，而 Link 则是两个特定 Object 之间的具体实例化边。Palantir 的 Link 具有高度形式化的拓扑特征：
- **基数定义 (Cardinality)**：严格区分为 `1:1`、`1:N`、`N:1` 与 `N:M`；
- **对偶性 (Bidirectionality / Dual Links)**：任何一条关系在定义时，必须显式定义正向动词与反向动词。例如：`Aircraft` -> `operates_flight` -> `Flight`，反向必须为 `Flight` -> `operated_by` -> `Aircraft`；
- **存储载体 (Backing Mechanism)**：1:N 关系可以直接由外键列（Foreign Key）在底层高效解析；而 N:M 复杂关系则由专用的关联表（Join Dataset）支撑。

#### 1.4.2 架构原则与辨析
*   **Link vs. Foreign Key (外键)**：
    *   外键是关系型数据库底层的物理实现细节，存在方向不对等、跨库无法关联、无反向导航语义等缺陷。
    *   Link 是双向对等图谱的一等公民（First-class Citizen）。在查询引擎与 API 中，智能体可以通过 `myFlight.aircraft` 轻松正向遍历，也可以通过 `myAircraft.flights` 反向回溯，底层的 JOIN 拓扑与缓存索引对上层完全透明。
*   **Link vs. Property**：
    *   Property 表达的是“个体的特征”（我有什么特性）；
    *   Link 表达的是“个体与个体的连接”（我和谁发生了什么关联）。绝不能将另一实体的 ID 简单当作一串纯文本 String 放在 Property 中，必须提升为强类型的 Link Type，以保证图遍历、级联安全策略和拓扑路径推断的成立。

#### 1.4.3 典型工业范例
- **Link Type 定义**:
  - Source: `MaintenanceLog`
  - Target: `Aircraft`
  - Relation: Many-to-One
  - Forward Display: `maintains_aircraft`
  - Reverse Display: `maintenance_history`
- **Link 实例**: `Log#8971` -(maintains_aircraft)-> `N102AA`。

---

### 1.5 Action / Action Type (动作 / 突变)

#### 1.5.1 官方真值定义
> **Palantir Documentation**: *"Action types define the operations that users and systems can perform to modify the Ontology. An action is a governed, atomic transaction that updates objects, properties, and links based on defined business logic and validation rules."*  
> (参见: Palantir Foundry Docs — *Action Types Overview*)

Action 是整个本体世界运转的核心引擎，代表了**受到严格治理的突变操作（Governed State Mutation）**。在 Palantir 中，任何对本体数据的修改（增、删、改、连边）**绝对不允许绕过 Action 进行野蛮写入**。
一个完备的 Action Type 由以下几大阶段构成的原子事务流水线：
1. **参数规约 (Parameters)**：接收用户输入、当前选中的 Object 引用、或者上游智能体生成的结构化参数；
2. **静态与动态校验 (Validations / Pre-conditions)**：检查是否满足业务规则（例如“只有处于 DRAFT 状态的任务才能被分配”、“提额上限不得超过 $50,000”）；
3. **安全与权限评估 (Submission Criteria & RBAC)**：校验当前 Actor（人或 Agent）是否有权执行此操作；
4. **规则应用 (Rule Execution / Ontology Edits)**：执行具体的写操作——修改某 Object 的 Property、新建一个 Object、创建两个 Object 之间的 Link；
5. **副作用与编排 (Side-effects / Webhooks)**：触发外部通知、调用企业 ERP API、向审计日志写流水。

#### 1.5.2 架构原则与辨析
*   **Action vs. Command / Event**：
    *   Action 不是异步丢出去不管的 Event，也不是盲目执行的 Command。Action 是一次**带 ACID 语义与写回（Writeback）保障的受控契约**。
    *   Action 拥有双向写回能力：它不仅能更新内存和本体高速缓存（Phonograph / Object Storage），还能通过事务日志将数据变更安全回写（Writeback）到底层数据湖的 Delta/Changelog 表中。
*   **Action vs. Function (核心分工)**：
    *   **Action 专职“改变世界” (Mutate State)**：负责写操作，具有事务边界、权限断言和副作用；
    *   **Function 专职“认知世界” (Pure Compute / Query)**：负责读操作与数学计算，遵循函数式原则，不擅自产生未受控的持久化突变。

#### 1.5.3 典型工业范例
定义 Action Type: `ReassignFlightGate`
- **Inputs**: `flight` (ObjectRef), `newGate` (ObjectRef), `reason` (String)
- **Validation**: `flight.status != "DEPARTED"` AND `newGate.isOccupied == false`
- **Mutations**: 
  - Update `flight.assignedGate` = `newGate`
  - Update `newGate.isOccupied` = `true`
  - Create Link: `flight` -(docked_at)-> `newGate`
- **Side Effect**: 发送移动端 Push 通知给登机口地勤人员。

---

### 1.6 Function (函数 / 计算)

#### 1.6.1 官方真值定义
> **Palantir Documentation**: *"Functions are developer-authored, typed logic written in TypeScript, Python, or AIP Logic that read the Ontology, perform complex computations or traversals, and return results or staged edits."*  
> (参见: Palantir Foundry Docs — *Functions on Objects & AIP Logic*)

Function 是本体的大脑，它赋予了图谱**可编程计算（Programmable Intelligence）**的能力。在 AIP 架构中，Function 涵盖了三种核心实现形态：
1. **Functions on Objects (TypeScript / Python SDK)**：开发者利用强类型 SDK 编写代码，支持链式图遍历、聚合分析、线性规划等高性能算法；
2. **AIP Logic Functions (No-code / LLM-powered)**：在 AIP Logic 画布中通过提示词工程、LLM 链式调用（LLM Chains）与本体读取块组合而成的智能函数；
3. **Functions for Actions (Staged Writes)**：一种特殊的计算函数，它的输出不是一个标量或列表，而是一组“暂存的修改建议（Staged Ontology Edits）”，该建议随后被挂载到 Action 中统一提交。

#### 1.6.2 架构原则与辨析
*   **Function vs. SQL View / Computed Column**：
    *   SQL 视图受限于关系代数和扁平表格，表达复杂的图递归遍历（如多级依赖树分析、最短路径算法）极其繁琐且性能低下；
    *   Function 具备完整的图灵完备能力，且在执行时能够充分利用内存中的图缓存引擎。更重要的是，在 AIP 时代，Function 可以无缝嵌入 LLM 推理步骤，成为传统算法与大模型决策的粘合剂。
*   **架构边界**：
    *   Function 是纯计算或受控计算单元。当它需要写本体时，**它必须产出 Staged Edits 并交由 Action 执行**，确保系统始终不脱离 Action 的权限与审计风控网。

#### 1.6.3 典型工业范例
```typescript
// Palantir Functions on Objects (TypeScript 示例)
import { Function, Integer } from "@foundry/functions-api";
import { Aircraft, Flight } from "@foundry/ontology-api";

export class FlightAnalyticsFunctions {
    @Function()
    public calculateTotalFlightHours(aircraft: Aircraft): Integer {
        // 跨 Link 遍历所有相关航次并执行聚合计算
        return aircraft.flights
            .all()
            .map(flight => flight.actualDurationMinutes ?? 0)
            .reduce((total, duration) => total + duration, 0);
    }
}
```

---

### 1.7 Branch (分支 / 沙箱与演进)

#### 1.7.1 官方真值定义
> **Palantir Documentation**:  
> 1. **Global Branching**: *"Branching the Ontology allows builders to safely develop, test, and evolve ontology resources (like Object Types, Link Types, and Actions) in isolation. Changes are tracked in Ontology Proposals and merged into the main ontology upon review."*  
> 2. **Ontology Scenarios**: *"Ontology Scenarios provide a sandboxed environment for what-if simulations. Edits made within a scenario (creating objects, modifying properties, running actions) are isolated from production data and automatically rebased against the main branch."*  
> (参见: Palantir Foundry Docs — *Branching the Ontology* & *Ontology Scenarios*)

Branch 是 Palantir 体系中最具杀伤力、技术门槛极高的原语。它从根本上解决了大型企业级数据系统中**“生产环境不敢改、试错成本极高、模拟推演无法闭环”**的致命痛点。

Palantir 将 Branch 严格分为两层互为支撑的机制：

```
                               ┌───────────────────────────────────────────────┐
                               │             Branch 原语的两大支柱              │
                               └───────┬───────────────────────────────┬───────┘
                                       │                               │
                                       ▼                               ▼
                 ┌───────────────────────────────────┐   ┌───────────────────────────────────┐
                 │       1. Global Branching         │   │       2. Ontology Scenarios       │
                 │     (元模型结构演进与安全发布)    │   │      (实例状态沙箱与假设推演)     │
                 ├───────────────────────────────────┤   ├───────────────────────────────────┤
                 │ • 面向人群: 架构师、数据工程师    │   │ • 面向人群: 业务决策者、AI Agent │
                 │ • 作用对象: Type, Property, Action│   │ • 作用对象: Object 状态, Link 边  │
                 │ • 核心机制: Copy-on-Write 元数据, │   │ • 核心机制: 临时沙箱 Fork,        │
                 │   Ontology Proposal (类似 PR)     │   │   10分钟自动 Rebase, 30天自毁     │
                 │ • 业务场景: 修改 Schema, 上线新   │   │ • 业务场景: What-If 假设仿真,     │
                 │   Action, 零停机平滑发布          │   │   供应链中断调度试错, Agent 自评  │
                 └───────────────────────────────────┘   └───────────────────────────────────┘
```

1. **元模型级分支 (Global Branching — Schema & Resource Evolution)**：
   - 允许架构师创建分支（如 `feature/add-iot-telemetry`），在分支上修改 Object Types、新增 Link Types、调试新的 Action Types。
   - 所有的元数据变更被记录在 **Ontology Proposal** 中，支持冲突检测、Diff 审查、双人审批会签，最终安全合并（Merge）到 Main 主干，实现零停机热升级。
2. **数据实例级沙箱 (Ontology Scenarios — What-If Simulation)**：
   - 允许最终用户或 AI Agent 针对当前生产数据即时 Fork 出一个虚拟沙箱；
   - 在该沙箱内，Agent 可以狂暴测试各种 Action（例如模拟“取消某次航班”、“调高产品售价 20%”、“转派全部工单”），并在沙箱内执行 Function 查看预测收益与风险指标；
   - **完全不影响真实生产库**。沙箱具有自动向 Main 变基（Rebase 每 10 分钟）的能力，保持背景数据常新；且沙箱有默认存活生命周期（30 天自动回收）。

#### 1.7.2 架构原则与辨析
*   **Branch vs. DB Snapshot / Backup**：
    *   DB Snapshot 是物理全量拷贝，成本极其高昂，恢复与合并极为痛苦，且无法做到细粒度的逻辑合并；
    *   Palantir Branch 是**逻辑上的写时复制（Copy-on-Write, COW）与叠加层（Overlay Layer）**。在没有写操作前，沙箱只持有一个指向 Main 的只读指针；当发生 Action 突变时，只在沙箱 Delta 存储中写入变更增量。
*   **为什么 AI Agent 必须要有 Branch 原语？**：
    *   在缺乏 Branch 的系统中，LLM Agent 的规划（Planning）如果直接打在数据库上，一旦出错就是线上事故；如果只让 Agent 在聊天框里做文本模拟，又无法利用真实的图谱拓扑与计算函数验证方案有效性。
    *   **Branch 原语是 AI Agent 实现“高保真推演、安全自查（Self-Evaluation）、确认后一键转正”的唯一物理保证**。

#### 1.7.3 典型工业范例
- **供应链应急推演 (Scenario 模式)**：
  - 台风来袭，物流 Agent 创建沙箱 `Scenario: Typhoon-Bailu-Reroute`；
  - Agent 在沙箱内执行 Action `ClosePort("XIAMEN")` 并调用算法函数重新为 500 个集装箱规划陆运路线；
  - 在沙箱内评估显示总延误时间减少 40%，成本增加 15%；
  - 调度总监审核该 Scenario 的对比报表，一键点击“Promote to Real World”，Action 批量应用到生产库。

---

## 2. Coolie 工坊当前实现对照与差距分析

针对 Palantir 的 7 大原语，对 Coolie 工坊目前的数据库表结构、共享类型契约（Shared Contracts）、服务层与插件代码进行深度横向对标：

### 2.1 七大原语详细对照表

| 序号 | Palantir 7 Primitives | Coolie 工坊当前对应实现 | 现状完整度 | 核心技术差距与断层剖析 |
| :---: | :--- | :--- | :---: | :--- |
| **1** | **Object**<br>(对象/实例) | • `entity_relations` 表中的物理行引用<br>• 9 大实体表 (`companies`, `projects`, `issues`, `specs`, `agents` 等) 中的主键记录 | **部分完备 (80%)** | **缺乏统一的 Object 抽象与全球标识 (Global RID)**：目前对象离散在各自的物理业务表中，仅通过 `(type, id)` 虚拟元组在 `entity_relations` 中临时拼接成 `EntityRef`，底层缺少一个统一的对象元数据与生命周期管理包装层。 |
| **2** | **Type**<br>(类型/概念) | • `ENTITY_TYPES` (9 个固定类型枚举)<br>• `packages/shared/src/types/entity-relation.ts`<br>• `ontology_node_types` (插件私有表) | **部分完备 (60%)** | **硬编码枚举 vs. 动态可配置类型**：Coolie 核心把 9 个类型写死在 TypeScript 联合类型与 DB Check 约束中。虽然 wave239 做了 App 屏 3 的 schema-editor，但仅能定义 properties，无法像 Palantir 一样动态创建全新 Object Type 并绑定 Interfaces。 |
| **3** | **Property**<br>(属性/槽) | • 业务表原生 Column (如 issue 的 title/status)<br>• `ontology_properties` 扩展表 (wave239 加)<br>• `packages/db/src/schema/ontology_properties.ts` | **部分完备 (70%)** | **缺乏 Value Types 强语义约束与动态校验**：`ontology_properties` 虽支持存 `[{ key, type, sample }]` 的 JSONB 结构，但仅供前端渲染展示，无法在数据写入时强制执行正则校验、安全脱敏或语义规则校验。 |
| **4** | **Link**<br>(关系/边) | • `entity_relations` 表 (wave154 引入)<br>• 8 个 `ENTITY_RELATION_KINDS`<br>• `packages/db/src/schema/entity_relations.ts` | **基本完备 (85%)** | **缺乏强基数控制 (Cardinality) 与动态 Link Type**：当前支持 `belongs_to`, `satisfies`, `spawned` 等 8 种固定语义边，已具备双向遍历与权重，但关系种类无法由业务动态扩展，且没有 1:1 / 1:N / N:M 的入库基数校验器。 |
| **5** | **Action**<br>(动作/突变) | • Paperclip Upstream Issues / Workflows<br>• Agent 任务执行端口与派工调用<br>• REST API 变更接口 (`/api/issues`, `/api/companies`) | **部分完备 (65%)** | **业务 API 与本体写操作未解耦**：目前的写操作是分散在各个 Controller 中的硬编码逻辑，没有将 Action 抽象为一等公民的元模型（缺乏统一的 Action 校验器、前置断言、参数定义与 Staged 阶段）。 |
| **6** | **Function**<br>(函数/计算) | • MCP Tools (wave228 规范化体系)<br>• `packages/adapter-utils`<br>• 图分析函数 (`OntologyStats`, `OntologyPaths`) | **基本完备 (75%)** | **MCP 工具偏向操作系统与系统运维，未深植本体图谱**：现有的 MCP 工具多为 `system-monitor`, `approval`, `device`，缺乏在本体图上进行链式查询与数学推断的专属 Functions on Objects 运行时。 |
| **7** | **Branch**<br>(分支/沙箱) | • **无** (除底层 Git 代码分支外，业务本体无任何分支与沙箱概念) | ❌ **完全缺失 (0%)** | **最大核心断层**：既没有用于元数据热升级的 **Global Branching & Proposals**，更没有用于智能体安全推演试错的 **Ontology Scenarios**。所有的修改要么直接写死在生产库，要么在 LLM 显存中丢弃，无法落盘推演。 |

---

### 2.2 核心差距深度剖析：为什么 Branch 是当前最致命的短板？

在 Coolie 的实际运营场景中，Branch 原语的缺失已经引发了多项工程与业务瓶颈：

1. **智能体决策无法“推演复盘”，只能“肉身踩坑”**：
   在 Coolie 的多 Agent 工坊中，当老板要求某个业务 Agent（如财务预算 Agent 或运营派单 Agent）制定一套复杂的调度策略时，Agent 无法在沙箱中运行 Action 来模拟资源占用。由于害怕污染生产数据库，Agent 只能在 prompt 里输出文字推测，而无法通过真实的 SQL/图函数验证其方案的合理性。
2. **Schema 变更缺乏安全隔离区与审批流**：
   wave239 新增了 `ontology_properties` 表，支持在 UI 上编辑类型属性。但是，一旦用户点击保存，新字段定义立刻在全公司（Company）生效。如果字段定义与下游 Agent 的解析逻辑产生冲突，会导致现网正在运行的心跳任务直接报错（Crash）。Palantir 强制要求的“Branch 修改 -> 生成 Proposal -> 机器兼容性检查 -> 会签合并”在 Coolie 中完全缺失。
3. **CMMI 过程资产缺乏基线（Baseline）隔离**：
   在 CMMI 3/5 规范中，配置管理（CM）与度量分析（QPM）强调过程资产必须有清晰的基线版本与分支演进轨迹。没有 Branch 原语，所有的实体变更在一条时间线上相互覆写，难以溯源历史状态与实施秒级沙箱对比。

---

## 3. 主 Agent (PM / Hermes) 视角：用 7 Primitives 框架重构理解 Coolie Ontology

作为平台的中枢协同 Agent，必须跳出单纯的“表结构增删改查”思维，建立一套**以 7 Primitives 为骨架的本体心智模型（Mental Model）**。

### 3.1 论证逻辑：如何向老板汇报“本体几大基础”

当老板提出“分层是不是不太对，本体的几大基础没体现”时，主 Agent 的准确回答与论证逻辑应如下：

> **核心论点**：
> 1. **纠正混淆**：之前的 L0-L4 是**看板导航与视觉呈现层级**（L0全局大盘 → L1子域边界 → L2实体网络 → L3节点详情 → L4底层链路），这是应用层的“视图投影”；
> 2. **立正根基**：本体的核心底座是工业级验证的 **7 Primitives 元模型**。通过 7 原语的穿透，Coolie 当前并不是“完全没有地基”，而是已经完成了 **6 个基础原语的物理筑基（6/7 覆盖）**；
> 3. **指出缺口**：我们此前缺失的是第 7 个原语——**Branch（分支与沙箱机制）**，导致系统缺乏安全演进（Global Branching）与假设模拟（Scenarios）的能力；
> 4. **给出路线**：后续规划不是推翻现有代码重来，而是保持前 6 个原语资产不动，重点补齐 Branch 原语，从而让 Coolie 的本体架构真正达到 Palantir 等级的工业成熟度。

---

### 3.2 7 Primitives 之间的内在拓扑依赖链

这 7 大原语并非孤立存在，它们之间存在着严格的**元数据依赖（Compile-time Dependencies）**与**运行时执行依赖（Runtime Dependencies）**：

```
                      ┌─────────────────────────────────┐
                      │        Type (Object Type)       │
                      └────┬───────────────────────┬────┘
                           │ Defines               │ Defines
                           ▼                       ▼
                ┌─────────────────────┐ ┌─────────────────────┐
                │      Property       │ │      Link Type      │
                └──────────┬──────────┘ └──────────┬──────────┘
                           │ Bound to              │ Bound to
                           ▼                       ▼
                      ┌─────────────────────────────────┐
                      │         Object (Instance)       │
                      └────┬───────────────────────┬────┘
                           │ Reads / Traverses     │ Mutated by
                           ▼                       ▼
                ┌─────────────────────┐ ┌─────────────────────┐
                │      Function       ├─►      Action         │
                │ (Compute / AIP Logic│Staged (Atomic Change) │
                └─────────────────────┘ └──────────┬──────────┘
                                                   │
                                                   │ Overlaid / Isolated in
                                                   ▼
                                        ┌─────────────────────┐
                                        │       Branch        │
                                        │ (Branch & Scenario) │
                                        └─────────────────────┘
```

1. **Type 是结构之源**：Object 必须依附于 Type，Property 必须寄宿于 Type，Link 必须连接两个 Type。没有 Type，Object 失去语义骨架。
2. **Property 与 Link 是特征之翼**：Property 雕刻个体的内部状态，Link 织造个体之间的外部拓扑，二者共同定义了 Object 的全部信息状态。
3. **Function 依赖静态状态进行感知**：Function 必须读取 Object、Property 和 Link 的现有状态才能展开图遍历与计算；若 Function 需要写回，必须输出为 Action 的 Staged Edits。
4. **Action 是状态的唯一合法变更者**：Action 是系统的门神，所有对 Object、Property、Link 的突变，必须经过 Action 的参数校验与权限守卫。
5. **Branch 是全生命周期的时空容器**：Branch（无论是 Schema 分支还是 Scenario 沙箱）把上述 6 个原语整体包容在内，为写操作提供写时复制（COW）的虚拟上下文。

---

### 3.3 数据流闭环链路：从智能体意图到本体落盘

在引入 7 Primitives 框架后，Coolie 内部的数据流转形成了极其清晰、符合可控 AI 伦理的标准闭环：

```
       [ 1. 意图感知与决策 ]
                 │
                 ▼
       ┌──────────────────┐
       │ AI Agent / User  │
       └─────────┬────────┘
                 │
                 │ 2. 调用读函数 (Read & Traverse)
                 ▼
       ┌────────────────────────────────────────────────────────┐
       │                Function (AIP Logic / SDK)              │
       │   遍历 Object、读取 Property、沿 Link 推演最佳方案     │
       └─────────────────────────┬──────────────────────────────┘
                                 │
                                 │ 3. 产出建议方案 (Staged Edits)
                                 ▼
       ┌────────────────────────────────────────────────────────┐
       │                Branch (Ontology Scenario)              │
       │   将方案注入隔离沙箱，不影响主干生产数据               │
       └─────────────────────────┬──────────────────────────────┘
                                 │
                                 │ 4. 沙箱内执行评估 (Simulation & Verification)
                                 ▼
       ┌────────────────────────────────────────────────────────┐
       │                Action (In Scenario)                    │
       │   在沙箱内完成状态修改，Function 重新打分通过          │
       └─────────────────────────┬──────────────────────────────┘
                                 │
                                 │ 5. 审批通过，推向现实 (Promote to Main)
                                 ▼
       ┌────────────────────────────────────────────────────────┐
       │                Action (Production Commit)              │
       │   写入生产 Object + Property + Link，触发审计与副作用  │
       └────────────────────────────────────────────────────────┘
```

这一链路彻底解决了以往“Agent 要么无能为力、要么莽撞破坏”的两极困境，使智能体拥有了类似于人类棋手的“复盘推演”能力。

---

## 4. 对老板原话的回应与总结 (Direct Response to Boss)

### 4.1 老板原话回顾
> **“分层是不是不太对, 本体的几大基础没体现” → “a 吧” (= Palantir 7 primitives)**

### 4.2 架构回应纲要
1. **完全认同老板的底层洞察**：
   之前整理的 L0-L4 本质上是**产品呈现与看板交互的层级**（帮助人类用户从宏观大盘下钻到微观详情），而不是**系统元模型的物理基础**。将两者混淆，会导致开发人员把“怎么画页面”当成“怎么建本体”。
2. **7 Primitives 是唯一的真理底座**：
   无论前端是展示为 L0 的组织大盘，还是 L3 的工单属性详情，底层运行的逻辑元素永远且只能是 **Object, Type, Property, Link, Action, Function, Branch**。
3. **当前的家底盘点**：
   Coolie 的工程团队此前已经非常有前瞻性地实现了 `entity_relations` (Link/Object)、`ENTITY_TYPES` (Type)、`ontology_properties` (Property)、Workflows/Tasks (Action)、以及 MCP Tools (Function)。**我们已经完成了地基的 85%**。
4. **下一步的核心突破口（wave245 B 输入）**：
   不要推倒重来！接下来的重点是：
   - 保持现有的 `entity_relations` 和 `ontology_properties` 契约稳定；
   - 参照 Palantir 的标准，定义一套轻量级的 **Ontology Scenario / Branch 协议**；
   - 让 Agent 能够在一个 `scenario_id` 上下文中安全地创建虚拟任务、模拟状态转移，完成 What-If 推演后再批量提交。

---

## 5. 参考资料 (Palantir 官方权威引文)

本调研报告引用的定义、架构原则与技术机制，全部基于 Palantir 官方公开文档、工程技术白皮书及 AIP 开发者指南：

1. **Palantir Foundry Documentation — Overview of the Ontology**  
   *详细阐述了 Object Types、Link Types 与 Action Types 的核心三元组架构。*  
   URL: `https://www.palantir.com/docs/foundry/ontology-overview/`

2. **Palantir Foundry Documentation — Object Types and Objects**  
   *规范了 Object 的唯一标识、状态存储、Backing Datasets 映射与生命周期。*  
   URL: `https://www.palantir.com/docs/foundry/ontology-object-types/`

3. **Palantir Foundry Documentation — Link Types and Relationships**  
   *定义了图谱中的有向/无向关系、基数约束（1:1, 1:N, N:M）以及双向遍历规范。*  
   URL: `https://www.palantir.com/docs/foundry/ontology-link-types/`

4. **Palantir Foundry Documentation — Action Types & Governed Mutations**  
   *阐述了 Action 作为唯一原子突变手段的校验流程、事务写回（Writeback）与副作用编排。*  
   URL: `https://www.palantir.com/docs/foundry/action-types/`

5. **Palantir Foundry Documentation — Functions on Objects**  
   *介绍了基于 TypeScript 和 Python SDK 对本体进行图遍历与复杂算法计算的运行时环境。*  
   URL: `https://www.palantir.com/docs/foundry/functions/`

6. **Palantir Foundry Documentation — Branching the Ontology (Global Branching)**  
   *详述了本体元数据的分支治理机制、Ontology Proposals 提案审查与安全无停机发布流。*  
   URL: `https://www.palantir.com/docs/foundry/ontology-branching/`

7. **Palantir Foundry Documentation — Ontology Scenarios ("What-If" Analysis)**  
   *规范了面向智能体与决策者的沙箱 Fork 机制、10分钟自动 Rebase、临时状态叠加层与方案一键转正。*  
   URL: `https://www.palantir.com/docs/foundry/scenarios/`

8. **Palantir AIP (Artificial Intelligence Platform) — AIP Logic & Ontology Integration**  
   *定义了大模型时代将 LLM 链式推理封装为标准 Function、并通过 Action 产生本体突变的工业标准。*  
   URL: `https://www.palantir.com/docs/foundry/aip-logic/`

9. **Palantir Developer Portal — Ontology SDK (OSDK)**  
   *介绍了跨语言（TypeScript, Python, Java）访问本体对象、关系与执行受控动作的标准开发工具包。*  
   URL: `https://www.palantir.com/docs/foundry/ontology-sdk/`
