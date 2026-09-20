# DigitalStaff 的本体驱动 + Spec 驱动开发模式 → Coolie 落地审计

- 审计日期：2026-09-20
- 仓库：`/Users/mac/workspace/xaicd/coolie`
- 检出状态：`main` @ `2023ae59e`（v0.3.5 热修）。`release/0.5.0` @ `0df489620` 是另一条线，
  见 §1.3「本审计的两份代码基线」。
- 性质：**只读审计，未改动任何源码**。唯一新增文件是本报告。
- 参考实现：**DigitalStaff (DS)** —— 只以本仓库内留存的实测证据为准（截图 + 点击实测记录），
  没有 DS 源码可读，全部结论都是黑盒观察。
- 证据来源：
  1. `screenshots/ds-explore/`（21 张，2026-09-16 逐项真点实测存档）
  2. `packages/plugins/plugin-ontology/DS_REFERENCE.md`（DS 工作台三栏布局、点击探测记录、DS 侧缺陷清单）
  3. Coolie 侧代码（路径与行号在正文逐条给出）

---

## 0. 证据与边界（先读这一段）

### 0.1 截图清单（本文所有 DS 结论的引用源）

| 文件 | 大小 | 拍到的内容 | 本次复核 |
|---|---|---|---|
| `01-graph.png` | 288 KB | 图谱视图：19 节点全展开，右侧「域概览」 | ✅ vision 读到节点/关系标签 |
| `02-graph-canvas-menu.png` | 257 KB | 画布右键 → **实为「创建节点」弹窗覆盖全屏** | ⚠️ 见 0.2 |
| `03-graph-node-menu.png` | 257 KB | 节点右键 → 同上，仍是「创建节点」弹窗 | ⚠️ 见 0.2 |
| `04-graph-edge-menu.png` | 257 KB | 连线右键 → 同上，仍是「创建节点」弹窗 | ⚠️ 见 0.2 |
| `05-graph-sidebar-type-menu.png` | 257 KB | 左栏类型右键 → 同上，弹窗 + 背景虚化 | ⚠️ 见 0.2 |
| `06-table.png` | 264 KB | 表格视图：`NAME / NODETYPE / LIFECYCLESTATE`，「共 19 条记录」 | ✅ |
| `08-schema.png` | 192 KB | 模型视图：`SCHEMA 结构规范`，左树 NodeTypes(16) | ✅ |
| `11-chat.png` | 312 KB | 对话视图：`AI 对话式精准 Schema 编辑` + 右侧逐字段 Diff | ✅ 逐字段转录 |
| `12-playground.png` | 316 KB | 沙盘：4 张演练卡 + 实时日志 + 4 张 KPI | ✅ |
| `page-ontology_domains.png` | 293 KB | 本体管理：17 个本体域 + 4 张聚合统计卡 | ✅ |
| `page-ontology_bootstrap.png` | 76 KB | 对话式本体建设：对话面板 + Schema 预览 | ✅ |
| `page-ontology_app_ecommerce.png` | 196 KB | 业务应用门户：4 KPI + 页签 + 对象类型卡 | ⚠️ 部分可读 |
| `page-ontology_ecommerce_chat-edit.png` | 117 KB | 独立对话式编辑页：治理审批 / 版本历史 / 目标选择器 | ✅ 顶栏转录 |
| `page-ontology_ecommerce_eval.png` | 51 KB | AIP 评估仪表盘：评估次数 / 平均分 / A-B / Golden | ✅ 指标名转录 |
| `page-ontology_ecommerce_agents.png` | 38 KB | 员工编制：总编制 / 在岗 / 离线 / 负荷 | ✅ |
| `page-ontology_ecommerce_app-builder.png` | 71 KB | 应用构建器：CRUD 页面 / 生成代码 / 列表列 / 表单字段 | ✅ |
| `page-ontology_ecommerce_designer.png` | 55 KB | 本体编织器：能力类型palette（框架/语言/工具/模式/基础设施） | ✅ |
| `page-ontology_ecommerce_pipeline.png` | 35 KB | 数据管道：`暂无数据管道`（空态） | ✅ 空态确认 |
| `page-ontology_ecommerce_simulation.png` | 7.6 KB | 仿真推演：**整页空白，0 文本** | ✅ 空页确认 |
| `page-ontology_market.png` | 45 KB | 知识蓝图库：`0 个行业认知蓝图`（空态） | ✅ 空态确认 |
| `page-admin_evolution-studio.png` | 66 KB | 演进中心：需求描述 → 本体设计 + 快捷模板 + AI 扩写 | ✅ |

### 0.2 关于 `02–05` 四张「菜单」截图（必须纠正的读图结论）

文件名为 `*-menu.png`，但**四张画的都是同一个「创建节点」弹窗盖在画布上**（尺寸 257 KB 完全一致，
内容一致到字段值 `Product_lgvi` 都相同）。也就是说这批抓取把「新增节点」弹窗留在了页面上，
**画布右键 / 节点右键 / 连线右键 / 左栏类型右键这四类菜单在图上不可读**。

本文对右键菜单的描述因此**不引用这四张图**，只引用 `DS_REFERENCE.md` 里的逐项点击探测记录
（那份记录是「点击后只记录新出现文本」得来的，比截图可靠）。这是一个抓取工具的行为缺陷，
不是 DS 的功能缺陷——记在这里以免下一个人再次误读。

### 0.3 DS 侧不该抄的东西（先立这个清单）

审计 DS 时最容易被它的页签数量震住。以下是实测**已经坏掉/空着**的部分，抄之前先看清：

| 表面 | 实测状态 | 证据 |
|---|---|---|
| 沙盘「契约穿透」演练 | 报 `⚡【属性穿透】校验完成…100% 通过` 的**同时**抛 `[DOMAIN_NOT_FOUND] 节点不存在: 6aa01d5090e250122f784505` | `DS_REFERENCE.md` 2026-09-16 节 |
| `/:domainId/simulation` 仿真推演页 | **整页空白**（0 文本） | `page-ontology_ecommerce_simulation.png` |
| `ontology/market` 知识蓝图库 | **0 个蓝图**，纯空态 | `page-ontology_market.png` |
| `SchemaTypeContextMenu`（对象类型右键 5 项） | 两个调用点都只传了 `onClose`，5 个回调**全是 undefined**——每项只弹 prompt + toast，**不落库**；「智能补全」是写死文案 | `DS_REFERENCE.md` |
| 统计口径 | 右侧「对象类型 (16)」与统计卡「17 类型数」自相矛盾；画布上读到的关系标签有 30 条，面板却写「17 类型数 / 22 关系数」 | `06-table.png` + `01-graph.png` |

**结论：DS 值得抄的是它的「信息架构 + 交互动词」，不是它的完成度。**
凡本文建议落地的项，若 DS 自己那页是空的（market / simulation），优先级一律下调，
理由写在 §5 的 `risk` 列。

### 0.4 本审计的两份代码基线（重要）

| | `main` @ `2023ae59e`（当前检出） | `release/0.5.0` @ `0df489620` |
|---|---|---|
| `server/src/services/build-orchestrator.ts` | **484 行** | **958 行**（`+501/-27`） |
| `server/src/config/build-orchestrator.json` | 不存在 | 存在（21 行，限流策略） |
| `clients/expo/src/components/BuildProgressCard.tsx` | 302 行 | 382 行（`+80`） |
| 限流：per-worker cool-down（cmd 180s / claude 30s） | 无 | 有 |
| 其它 | v0.3.4 / v0.3.5 热修 | `docs-coolie/security-audit-2026-09-20.md` |

`main..release/0.5.0` 有 3 个提交未进 main（pacing、build 模式、security audit）；
`release/0.5.0..main` 有 6 个提交未进该分支。**两份都读了**，正文引用处会标明是哪一份。
按 `docs-coolie/BRANCHING.md` §1「我们的代码只放 `main`」，本报告提交到 `main`。

---

## 1. DS 到底在做什么

### 1.1 一句话

DS 把「一家公司的业务」建模成一棵树状的**本体域（domain）**：域里定义**对象类型**和**关系类型**
（= 元模型 / schema），再往里灌**实体节点**与**关系连线**（= 实例 / 数据），
然后让 **AI 员工（agent）**、**应用构建器**、**评估/沙盘**都挂在这同一份本体上。
用户侧的入口不是表单，是**对话**：说一句业务描述，DS 产出 schema 变更的 **diff 预览**，
确认后落库，再由此长出应用与 agent。

它有两条互相咬合的环：

- **本体驱动环**：对象类型 → 属性 schema → 实体 → 关系 → 动作 → 评估/沙盘（对，模型自己可被运行、可被评估）
- **Spec 驱动环**：自然语言 → 结构化 schema 草案 → diff → 落库 → 应用/员工/管道（模型自己可以被「生成」出来）

DS 的全部页签是这两条环的不同截面。

### 1.2 逐面走查（每个面：做什么 → 在 DS 哪里 → 在 Coolie 对应什么）

| # | DS 面 | 做什么（截图实证） | 在 DS 的位置 | Coolie 对应物 |
|---|---|---|---|---|
| 1 | **图谱** | 交互式节点图。节点按对象类型着色，有向边带标签。`06-table.png` 右栏给出规模：**19 节点 / 22 关系 / 17 类型 / 0 跨域关系 / 对象类型 16 个**，每个类型标「N 属性」（Product 15、Review 14、Order 14…） | `/digstaff/ontology/workbench/{domainId}` 顶栏页签「图谱」 | ✅ `graph-view.tsx`（2373 行，`radial/layered/grid` 三布局、关系过滤、右键菜单、影响推演）——**视图有，编辑器半成品**，见 §2.6 |
| 2 | **表格** | `NAME / NODETYPE / LIFECYCLESTATE` 三列 + 「共 19 条记录」，按左侧选中类型过滤。行右键 = 查看详情/编辑属性/复制数据/删除记录 | 同上顶栏「表格」 | ✅ `app.tsx` 表格视图（按 `propertiesSchema` 推导列，上限 4 列，2026-09-15 对齐） |
| 3 | **模型** | 标题 `SCHEMA 结构规范`；左树 `NodeTypes (16)` / `RelationTypes`；提示「点击或右键左侧 Schema 项查看与编辑规范；右键包含：添加属性、定义 Action 动作、AI 自动补全字段等功能」 | 同上顶栏「模型」 | ✅ `schema` 视图 + `NodeInspector`（但**没有 Action 类型与 AI 补全**这两个右键动词） |
| 4 | **对话** | `AI 对话式精准 Schema 编辑`。顶栏：**治理审批开关**、**快照历史**、**隐藏 Schema 对比**、**目标选择器 `全局（AI 自动定位）`**。右侧「Schema 模型实时 Diff 预览」**逐属性列出** `productId: string` / `status: enum` / `detailImages: array` / `publishTime: datetime` / `isFragile: boolean` / `taxRate: number` / `specValues: object` | 同上顶栏「对话」 | ⚠️ **`dialogue` 视图是 `PlaceholderTab`**（`ChatTab.tsx` 明文「等待 worker 暴露 `ontology.dialogue` 事件流」）。DS 这一面是 Coolie 最缺的一面 |
| 5 | **沙盘** | 4 张演练卡（业务事件风暴 / 动作与影响链 / AI Agent 决策竞技场 / 实体遥测）**真跑并写实时日志**；4 张 KPI：实体节点覆盖率 19/16 100%、拓扑关联连通度 22 条、已注册业务动作集 7 个、实体运行态健康度 100.0% | 同上顶栏「沙盘」 | ⚠️ 无聚合页。能力散落在别处：图谱右键「影响推演」+ 右侧统计。数据侧 `plugin-ontology` 有 `ontology_simulation_scenarios` 表与 `/simulation-scenarios` 路由 |
| 6 | **本体管理** | `本体管理 17 个本体域`。4 张聚合卡：托管域 17 / 对象类型 170 / 实体节点 170 / 拓扑关系 199。来源筛选：全部来源 / 蓝图克隆 / 自主创建 / 官方预置。表格列：行业大类、来源类型、对象类型、实体节点、关系连线 | `/digstaff/ontology/domains` | ✅ `DomainsTab` + `DomainList`（`app.tsx:2942`）。⚠️ 无聚合统计卡、无来源筛选（`bootstrap_source` / `is_built_in` / `forked_from` 列都在表里，只是没上 UI） |
| 7 | **对话式本体建设** | `通过自然语言描述业务领域，自动生成本体 Schema`。左：对话面板（示例「我要管理合同，合同有甲方、乙方、条款、金额、有效期」）。右：**Schema 预览**（「Schema 预览将在对话开始后实时展示」） | `/digstaff/ontology/bootstrap` | ⚠️ **无对应物**。这是 spec 驱动环的入口，Coolie 只有 `SandboxTab`（9-op JSON patch 驾驶舱），是「改」不是「建」 |
| 8 | **对话式编辑（独立页）** | 顶栏：`治理审批: 关闭` / `版本历史 (0)` / `隐藏预览` / `全局（AI 自动定位）`。注：本张截图里对话区是**空的**（无示例指令），与工作台内「对话」页签不是同一个状态 | `/digstaff/ontology/{d}/chat-edit` | ⚠️ 同 #4 |
| 9 | **AIP 评估仪表盘** | 指标名：总评估次数 / 平均得分 / 活跃 A-B 测试 / Golden 数据集 / 最近 7 天评分趋势 / Top 模型排行 / Golden Dataset / A/B 测试 | `/digstaff/ontology/{d}/eval` | ⚠️ 后端齐全（`ontology_evals`、`ontology_golden_datasets`、`ontology_prompt_templates`、`ontology_aip_logics` + `/evals`、`/golden-datasets`、`/aip-logics` 路由），**UI 只有 `EvaluationSection` 且只挂在 `ManageTab` 里**（`app.tsx:3164`，调用点 3764 / 4105） |
| 10 | **员工编制** | 总编制 / 在岗 / 离线 / 负荷 + 派驻 | `/digstaff/ontology/{d}/agents` | ✅ 反向：Coolie 的员工是控制面一等公民（`agents` 表、`AGENT_ROLES`、`teams-catalog`），DS 反而是弱项 |
| 11 | **数据管道** | `暂无数据管道`；`创建 Source → Transform → Sink 管道来同步数据` | `/digstaff/ontology/{d}/pipeline` | ⚠️ 后端齐全（`ontology_datasets` / `ontology_connectors` / `ontology_transforms` + UI `DatasetsTab` / `ConnectorsTab` / `TransformsTab`）——**这一面 Coolie 比 DS 做得多** |
| 12 | **本体编织器** | `本体编辑器`。左 palette「能力类型」：框架(React/Next.js/Spring)、语言(TypeScript/Python/Go)、工具(Docker/Webpack/Vite)、模式(MVC/Event-Driven/CQRS)、基础设施(K8s/PostgreSQL/Redis)。拖到画布建节点 + `整理` / `保存图谱` + 统计（节点/关系） | `/digstaff/ontology/{d}/designer` | ❌ **无对应物**。注意：它编的是**技术栈图谱**，不是业务本体——是「第二张图」 |
| 13 | **应用构建器** | `应用构建器`，页签 `CRUD 页面`，按对象类型（Product/SKU/…）生成，字段分组：`列表列` / `表单字段` / `搜索字段`，按钮 `生成代码` | `/digstaff/ontology/{d}/app-builder` | ⚠️ 近似物是 `plugin-ontology` 的 `views`/`resource-links` 表 + `/architecture-diagram` 路由，**无生成器 UI** |
| 14 | **知识蓝图库（market）** | `知识蓝图库`，`0 个行业认知蓝图 — 装载后 AI 员工即获该领域业务推理能力`。筛选：全部 / 行业分类 | `/digstaff/ontology/market` | ⚠️ 后端有 `ontology_package_installs`（「marketplace install records + 结果：新增了哪些 node type / relation」）+ `/package-installs` 路由；**无 UI**。但 DS 自己是空态 → **优先级低** |
| 15 | **演进中心** | `演进中心 (Evolution Center)`，`能力自主扩展平台 · 独立隔离环境`。两步：**需求描述 → 本体设计**。快捷模板：CRUD管理 / 审批流 / 文件上传 / 统计报表。输入框提示「输入几个关键词即可，例如：订单管理、客户CRM、库存管理…」，试一试气泡：订单管理 / 客户CRM / 库存管理 / 项目看板 / 知识库 / 工单系统。按钮：`AI 扩写` / `直接分析` | `/digstaff/admin/evolution-studio` | ❌ **无对应物**。⚠️ 这一面才是最该抄的——它就是 spec 驱动环的完整前门 |
| 16 | **业务应用门户** | 4 KPI（实体节点总数 / 全网关系连线 / 业务对象类型 / 数字员工编制）+ 5 页签（大屏 / 数据 / 拓扑 / 动作 / 助手）+ 对象类型卡标「属性: 15 项」「深入数据工坊」 | `/digstaff/ontology/app/{domainId}` | ⚠️ `ontology_business_systems` / `ontology_sub_projects` 表 + `/business-systems`、`/sub-projects` 路由都在，**无 UI** |

### 1.3 对 Coolie 的含义

DS 的功能面基本可以按「**元模型 / 实例 / 运行 / 生成**」四层归位，而 Coolie 的 `plugin-ontology`
把前三层的**数据模型**几乎一比一搬过来了（18 个 migration，见 §2.2），缺的是：

1. **前门**（DS #7 bootstrap、#15 evolution-studio）：把一句话变成结构化 schema 草案。
2. **中门**（DS #4 对话 + diff 预览）：把草案变成可审阅的变更并落库。
3. **后门**（DS #13 app-builder、#14 market）：把本体变成应用与可复用资产。
4. **横切**（DS #5 沙盘、#9 评估、#12 编织器）：把本体变成可运行、可度量、可演进的系统。

**而这四处，恰好正是 Coolie 控制面本来就擅长的东西**（issue 树、审批、agent 编制、构建编排）。
所以结论不是「再抄一个 DS」，而是「用 Coolie 的编排能力，把 DS 的四道门补上」——见 §4。

---

## 2. 本体驱动（Ontology-driven）

### 2.1 DS 的元模型，从截图里读出来的事实

- **对象类型 16 个**，属性数 8–15（`06-table.png` 右栏逐条可读）：
  Product 15、Review 14、Order 14、Customer 14、Coupon 13、SKU 12、Promotion 12、Address 12、
  OrderItem 11、Category 10、Refund 10、Warehouse 10、Inventory 10、Payment 9、Brand 8、Shipment 8。
  合计 **约 182 个属性 / 16 类型 = 平均 11.4**。
- **属性类型词汇表**（`11-chat.png` 右侧 diff 逐行可读）：
  `string` / `number` / `boolean` / `enum` / `array` / `object` / `datetime`。**没有 `reference` 这个类型名**，
  但 `productId: string` / `categoryId: string` / `brandId: string` 显然是外键（唯一编号），
  且「创建节点」弹窗对这几个字段渲染的是**实例选择器**（`[Product] iPhone 15 Pro Max 智能手机商品 (ecom_prod_01)`），
  说明引用关系是用 **字段命名约定 + UI 侧识别**实现的，不是元模型里的一等公民。
- **关系类型**：`01-graph.png` 画布上读到 30 个关系标签，全部是同一种形态——15 个 `HAS_*`
  （`HAS_SKU`、`HAS_CATEGORY`、… `HAS_REVIEW`）+ 15 个 `BELONGS_TO_*`（`BELONGS_TO_SPU`、…）。
  这是**聚合根 → 子实体 / 子实体 → 聚合根**的双向扇出。⚠️ 但这 30 与面板上的「22 关系数 / 17 类型数」
  对不上（见 §0.3 最后一行），**面板数字为准，标签只作词汇表证据**。
- **生命周期**：表格视图有一列 `LIFECYCLESTATE`，19 个实例**全部是 `active`**。
- **域版本**：`电商平台 v1.0.0`；域 ID `ecommerce`；状态 `active`。顶栏有 `保存` 与 `应用▾`。
- **快照**：对话页顶栏有 `快照历史 (0)`；`DS_REFERENCE.md` 记录 `TopStatusBar` 有快照按钮。
- **治理**：对话页与独立编辑页都有 `治理审批: 关闭` 开关——**schema 变更可以走审批门**。
- **评估 / 沙盘**：见 §1.2 #5 / #9。
- **域规模**：`本体管理` 17 个域 / 170 对象类型 / 170 实体节点 / 199 关系。
  来源分类：全部来源 / 蓝图克隆 / 自主创建 / 官方预置。

### 2.2 映射：DS → Coolie `plugin-ontology`

`packages/plugins/plugin-ontology`（plugin id `paperclipai.plugin-ontology`，独占 schema
`plugin_ontology_b62f8af3e9`，18 个 migration）。**映射表里 Coolie 侧全部是已存在的真实表/路由**：

| DS 概念 | Coolie 实现 | 状态 |
|---|---|---|
| 本体域（domain, v1.0.0, lifecycle） | `ontology_domains`（含 `version`、`category`、`is_built_in`、`forked_from`、`lifecycle_state`、`governance_policy`、`bootstrap_source`、`stats`、`seed_schema_version`） | ✅ 表/路由/UI 都有 |
| 对象类型（16 个，N 属性） | `ontology_node_types.properties_schema`（属性不是独立表，与 Foundry 一致） | ✅ |
| 属性（string/enum/array/…） | `properties_schema` 内的字段对象 | ✅（**但无类型校验器**，见 §2.5） |
| 关系类型（HAS_*/BELONGS_TO_*） | `ontology_relation_types`（含 `cardinality`: one_to_one / one_to_many / many_to_one / many_to_many） | ✅ |
| 实体节点（19 个） | `ontology_nodes`（含 `lifecycle_state`: active→stale→deprecated→archived、乐观锁 `version`） | ✅ |
| 关系连线（22 条，跨域） | `ontology_edges`（`source_domain_id` / `target_domain_id` / `is_cross_domain`） | ✅ |
| Action 动作（「已注册业务动作集 7 个」） | `ontology_action_types`（`api_contract`、`state_transitions`、`emits_events`、`required_permissions`、`idempotent`） | ✅ 表/路由有，**UI 无** |
| 接口/多态 | `ontology_interfaces` + `implements_interfaces` / `extends_interfaces` | ✅ 表/路由有，**UI 无** |
| 函数 | `ontology_functions`（版本化、带权限） | ✅ 表/路由有 |
| 快照历史 | `ontology_domain_snapshots`（不可变 schema 快照，用于版本审计/回滚）+ `ontology_audit_logs`（23 种事件、before/after） | ✅ 表/路由有，**UI 无** |
| 治理审批开关 | `ontology_proposals` + `/proposals/:id/decision` + 控制面 `approvals` | ✅ 表/路由有，**UI 无** |
| 数据管道（Source→Transform→Sink） | `ontology_datasets` / `ontology_connectors` / `ontology_transforms`（`/:id/run`） | ✅ **有 UI**（`DatasetsTab`/`ConnectorsTab`/`TransformsTab`）——超过 DS |
| 评估 / Golden / 提示词 / AIP 逻辑 | `ontology_evals` / `ontology_golden_datasets` / `ontology_prompt_templates` / `ontology_aip_logics` | ✅ 表/路由有，**UI 仅 ManageTab 内嵌** |
| 沙盘 / 仿真场景 | `ontology_simulation_scenarios`（多策略 + 结果 + 推荐策略） | ✅ 表/路由有，**无 UI** |
| 知识蓝图 market | `ontology_package_installs`（装了什么包、装了以后新增了哪些类型） | ✅ 表/路由有，**无 UI** |
| 业务应用门户 | `ontology_business_systems`（含 `ontologyBinding`/`domainGovernance`/`domainCopilotConfig`/`runtimeStats`）+ `ontology_sub_projects` | ✅ 表/路由有，**无 UI** |
| 员工编制 | `ontology_members`（另有控制面 `agents`） | ✅ 表/路由有 |
| 第二张图（UModel，阿里 UModel 风） | `ontology_umodel_entities`（16 类）/ `ontology_umodel_links`（27 类）/ `entity_sets` / `telemetry` | ✅ 表/路由有，**无 UI** |
| 旧仓库认知（DS `RepoCognitionJob`） | `ontology_cognition_jobs`（9 态可续跑管线）+ `AstExtractor`（TS/JS/Vue、Python、Go、Java/Kotlin、SQL DDL）+ `/cognition-jobs/*` | ✅ 表/路由/AST 有，UI 有 `CognitionTab` |

**读法：DS 的元模型面，Coolie 已经不缺表了。缺的是「人能用它」的那一半。**

### 2.3 Coolie 的样本本体 vs DS 的样本本体（规模差）

`packages/plugins/plugin-ontology/src/samples/ontology-domains.json`（7 个域）：

| 域 | 对象类型 | 属性 | 关系类型 |
|---|---|---|---|
| retail (1) | 6 | 33 | 7 |
| retail (2) | 5 | 24 | 6 |
| finance | 5 | 25 | 6 |
| healthcare | 5 | 25 | 6 |
| manufacturing | 5 | 25 | 5 |
| education | 5 | 23 | 6 |
| food | 12 | 48 | 13 |
| **合计** | **43** | **203** | **49** |

对照 DS 的 `ecommerce` 单个域：**16 类型 / 182 属性**。
换算成密度：**DS ≈ 11.4 属性/类型；Coolie 样本 ≈ 4.7 属性/类型**（203/43）。

`DS_REFERENCE.md` 记录过这个差距的成因：早期 Coolie 的对象类型**属性全为 0**
（SAA 域 6/6 空壳），根因不是渲染而是**写入链路断了**——插件有两套写入面
（`usePluginAction()` 走 `ctx.actions.register`；13 个 UI 调用的 key 只注册在 `manifest.apiRoutes`
的 `onApiRequest` 面），且 `create-node-type` 曾静默丢弃 `propertiesSchema`。
2026-09-15 已修为两面共用同一 handler，并加了 `tests/action-parity.spec.ts` 防回归。

→ **可验证的结论**：属性密度低是「样本写得浅」，不是「存不下」。但 4.7 vs 11.4 的差距说明
**样本本体还不到 DS 那种「能撑起一个应用」的精细度**，这正是 §4 里 spec 生成器要解决的事。

### 2.4 DS 有、Coolie 完全没有的四个面

| 缺什么 | DS 的形态（证据） | Coolie 现状 | 差距性质 |
|---|---|---|---|
| **可视化图编辑器** | 「创建节点」弹窗**按 schema 动态渲染**：选类型后列出「必需属性」，每个字段带中文说明；引用型字段带**实例选择器**（`-- 选择已有的【Product】实体节点 --`）；`展开可选属性 (10)`；`AI 一键生成样例` | `graph-view.tsx`（2373 行）有画布、三布局、关系过滤、右键菜单、影响推演，**但新建节点只弹一个 `window.prompt` 输 label** | **半成品**：数据层完整（`ontology_nodes`/`ontology_edges` + 递归 CTE 的 `findPath`/`findImpact`），缺的是**写侧表单** |
| **评估 / 沙盘 harness** | 评估仪表盘 8 个指标区块；沙盘 4 张卡真跑 + 实时日志 + 4 张 KPI | 表与路由齐全，UI 只有 `ManageTab` 内嵌的 `EvaluationSection` | **缺聚合页**，不是缺引擎 |
| **域市场（market）** | `知识蓝图库`，**0 个蓝图**（空态） | `ontology_package_installs` + `/package-installs` 路由；无 UI | **DS 自己也没做** → 优先级最低 |
| **演进中心** | 需求描述 → 本体设计；快捷模板 CRUD/审批流/文件上传/统计报表；`AI 扩写` / `直接分析` | **零**（服务端、插件、UI 都没有） | **真缺**，且是最有价值的一处 |

### 2.5 缺口清单里最容易漏掉的一条：没有 schema 校验器

`normalizeBuildPlan` 那种「模型输出必须完整覆盖 5 个 phase 否则整体回退」的防御，
在 `plugin-ontology` 的**属性 schema 写入路径上没有对应物**：`create-node-type` 接受
任意 `propertiesSchema`，没有类型白名单、没有 required 校验、没有引用字段命名约定校验。
DS 侧至少还有个 UI 层约定（`*Id` = 引用）。所以 §4 的第一件事是**把 spec 的校验放在
写库之前**，而不是指望 UI 拦住。

### 2.6 一个必须点名的既有缺陷回响

`DS_REFERENCE.md` 记载：DS 的 `SchemaTypeContextMenu`（对象类型右键 5 项）**回调全是 undefined**，
点了只弹 prompt + toast，不落库。Coolie 那 5 项（属性 / 智能补全 / 建立关系 / 动作 / 删除）
**是真的写库**（走 `update-node-type` / `create-relation-type` / `delete-node-type`），
并由 `tests/action-parity.spec.ts` 守着。

**这说明 Coolie 已经有一处结构性优势：插件的 UI 动词背后是真写入。**
§4 的方案要复用这一点，而不是绕开它去另起一套。

---

## 3. Spec 驱动工作流

### 3.1 DS 的链条（从截图拼出来）

```
自然语言描述
   │  「我要管理合同，合同有甲方、乙方、条款、金额、有效期」
   │  「订单管理」/「客户CRM」/「库存管理」（演进中心的快捷关键词）
   ▼
[ 演进中心 evolution-studio ]  需求描述 ──AI 扩写──▶ 本体设计
   │                             └─直接分析─┘        （快捷模板：CRUD/审批流/文件上传/统计报表）
   │
   ├──────────────▶ [ 对话式本体建设 bootstrap ]  左对话 / 右「Schema 预览（实时展示）」
   │
   ▼
结构化 schema 草案（= spec）
   │  「对话式编辑 chat-edit」右侧「Schema 模型实时 Diff 预览」逐属性列出 name: type
   │   例：productId: string / status: enum / detailImages: array / publishTime: datetime
   ▼
[ 治理审批 (开/关) ] ──[ 快照历史 ]──▶ 落库（顶栏「保存」/「应用▾」）
   ▼
长出来的东西：应用（app-builder CRUD 页面）、AI 员工（agents）、数据管道（pipeline）、
              评估（eval）、沙盘（simulation）、市场蓝图（market）
```

**DS 的关键设计判断**：spec 不是一份文件，而是一个**带 diff 预览的待确认变更集**。
用户在「看到每个字段变成什么样」之后才点确认。这比「生成一份 YAML 让 AI 去执行」可信得多，
也是最该抄的一点。

### 3.2 Coolie 最近的亲戚：BoardChat + build 模式

Coolie 已经有一条**形状很接近**的链，只是缺中间那一环：

| 环节 | Coolie 现状（真实路径） | 与 DS 的差距 |
|---|---|---|
| 自然语言入口 | `POST /api/board/chat/stream`（`server/src/routes/board-chat.ts`，452 行）。spawn 本机 `hermes chat --yolo --oneshot --quiet --max-turns 40 -m ${BOARD_CHAT_MODEL ?? "glm-5.3-flash"}`，system prompt 来自 `skills/paperclip-board/SKILL.md`。有实验开关 `enableConferenceRoomChat`、`local_trusted`/`authenticated` 门、并发 ≤3、120s 超时 | ✅ 形状相同 |
| 结构化产物 | ⚠️ **concierge 会把 `%%ACTIONS%%…%%/ACTIONS%%` 结构化信号在落盘前 `stripActionSignals` 掉**，只留散文。它能写 issue `plan` 文档（`skills/paperclip-board/SKILL.md` §Hiring Plan Loop：`PUT /api/issues/{id}/documents/hiring-plan`），但**不是 schema 结构** | ❌ **缺 spec 这个产物类型** |
| 分解成任务 | `issue_plan_decompositions` 表 + `GET/POST /api/issues/:id/accepted-plan-decompositions`（接受 plan revision → 生成子 issue，带 `blockedByIssueIds` / `blockParentUntilDone`）；`suggest_tasks` 交互；`skills/paperclip-converting-plans-to-tasks/SKILL.md` | ✅ 已有，且是「已接受」才能分解——**正好是天然的审批点** |
| 排序 + 派工 | `server/src/services/build-orchestrator.ts`（main 484 行 / 0.5.0 958 行）：`/^(build\|开发\|做)\s+/i` 触发 → hermes 出 5 段 JSON 计划（`PLANNER_SYSTEM_PROMPT`，60s 超时，`normalizeBuildPlan` 要求 5 个 kind 各一次且顺序固定，否则整体回退 `templateBuildPlan`）→ 建父 issue（`originKind: "build_plan"`）+ 5 个子 issue，除第一段外全部 `blocked`，靠 `issue_relations`(`type: "blocks"`) 的顺序门推进；`BUILD_AGENT_TYPE_ROLE_CHAIN` 把 `arch/dev/qa/pm` 映射到公司角色链，末端兜底 `general` | ✅ **这就是 DS 演进中心的下半段** |
| 跑 | 唤醒被派工者即让 adapter spawn CLI；0.5.0 加了 per-worker cool-down（cmd 180s / claude 30s，`server/src/config/build-orchestrator.json` 热加载），冷却中的步骤 park 而非失败，`BuildProgressCard` 显示「等待限流冷却 · 剩余 Xm Ys」 | ✅ |
| 树级控制 | `server/src/services/issue-tree-control.ts`（1215 行）+ `issue_tree_holds` / `issue_tree_hold_members` 表，mode = `pause`/`resume`/`cancel`/`restore`；`POST /api/issues/:id/tree-control/preview` | ✅ DS 无对应 |

### 3.3 Coolie spec 驱动链的缺口（三条，按重要性）

1. **没有 spec 这个一等产物**。plan 文档是自由文本（`documents` + `document_revisions` + `issue_documents`，
   key 约定为 `plan`）；本体侧只有 9-op JSON patch（`src/aide/editOps.ts`）作用于**已存在的**域。
   → 缺少「域还不存在时，描述 → 结构化 schema」的这一跳。
2. **没有 builder agent**。build 模式的 5 段产出的是**代码类**交付物（需求/设计/实现/测试/发布），
   没有任何一段会去**创建本体域、写 `propertiesSchema`、建关系类型**。
   → 需要新增一种「本体建设」的 step kind，或新增一个 builder 角色。
3. **concierge 不能落库**。它刻意 strip 掉结构化信号，能力被限制在「说话 + 写文档」。
   → spec 落库必须由一个**新的、有明确职责边界的**服务做（服务端服务，不是让 concierge 自己调 API）。

**另外一个被忽略的点**：`plugin-ontology` 的 `dialogue` 页签是 `PlaceholderTab`，
注释写着等 `ontology.dialogue` 事件流。**DS #4「对话 + diff 预览」在 Coolie 是空壳**——
这意味着即使将来 spec 生成好了，也**没有地方让用户看 diff 并点确认**。

---

## 4. Coolie 0.5.0 的具体建议：`build-on-spec` 模式

### 4.1 一句话

> 把 DS 的两条环（本体驱动 + spec 驱动）合并成**一条**：
> **board chat 说人话 → hermes 产出 Ontology Spec → 审批过 → `plugin-ontology` 建域/建类型/建关系
> → 按对象类型分解成 issue 树 → build orchestrator 派工并跑。**
>
> 也就是把 DS 的「演进中心 + bootstrap + chat-edit + app-builder」串成一条链，
> 而链条的每一节都复用 Coolie 已经有的原语（issue 树、blocked-by 顺序门、审批、树级 hold、限流派工）。
> **这是 DS-on-Coolie 的超集**：DS 只有「生成」，Coolie 多了「谁做、按什么顺序做、做不动怎么办、能暂停/取消」。

### 4.2 端到端流程（每一步注明复用什么、新增什么）

```
① 输入        BoardChat「建域 电商平台：要有商品、SKU、订单、支付、退款、优惠券…」
              │ 复用：POST /api/board/chat/stream（board-chat.ts）
              │ 新增：触发词 建域|建模|domain （与 build|开发|做 并列，同一条正则表）
              ▼
② 出 Spec     hermes 用第二个 system prompt 产出 Ontology Spec（JSON，见 4.3）
              │ 复用：build-orchestrator.ts 的 spawn/超时/大小上限/JSON 提取/整体回退模式
              │       （requestPlanFromHermes 的 60s 超时 + PLAN_MAX_OUTPUT_BYTES + extractPlanJson）
              │ 新增：ONTOLOGY_SPEC_SYSTEM_PROMPT + normalizeOntologySpec（全有或全无，不合并）
              ▼
③ 存 Spec     写进父 issue 的文档，key = ontology-spec
              │ 复用：documents / document_revisions / issue_documents（plan 文档同一套机制 → 天然有版本历史，
              │       对应 DS 的「快照历史」；revision restore 对应 DS 的回滚）
              │ 新增：spec 作为 document key 的约定 + 预览 UI
              ▼
④ 看 Diff     聊天流里渲染 SpecDiffCard：逐对象类型列出 name: type（DS `11-chat.png` 的形态）
              │ 复用：BuildProgressCard 的聊天流内卡片模式（clients/expo/src/components/BuildProgressCard.tsx）
              │ 新增：SpecDiffCard（web + expo 两处）
              ▼
⑤ 审批        spec → ontology_proposals（或控制面 approvals）→ 人工批准
              │ 复用：ontology_proposals + /proposals/:id/decision（插件侧）、approvals（控制面）、
              │       issue_plan_decompositions 的「accepted」语义
              │ 新增：把「spec 被批准」变成实例化的前置条件（DS「治理审批: 开启」的等价物）
              ▼
⑥ 实例化      POST /domains → /node-types（含 properties_schema）→ /relation-types → /action-types
              │ 复用：plugin-ontology 全部已存在的路由与表
              │ 新增：provisioner 服务（幂等键 = buildId；写 bootstrap_source: "build_spec"；
              │       落库前先取 ontology_domain_snapshots 以便一键回滚）
              ▼
⑦ 分解        按 spec 的 nodeTypes 分组，把 5 段计划展开成子 issue（每个类型组一个 impl 任务）
              │ 复用：issue_plan_decompositions 的 accepted-plan → children 机制、
              │       issueService.create({ blockedByIssueIds }) 的 blocks 边、
              │       issue-tree-control 的 tree hold（做不动时整棵树 pause/cancel）
              │ 新增：nodeType → issue 的映射规则
              ▼
⑧ 派工 + 跑   build orchestrator 按 BUILD_AGENT_TYPE 选人、唤醒、限流冷却
              │ 复用：build-orchestrator.ts（0.5.0 版含 per-worker cool-down + park/release）
              │ 新增：（不需要）— 这是本方案最省的一节
              ▼
⑨ 验收        子 issue 关闭 → 父 build issue 关闭 → 用 ontology_evals / simulation-scenarios 跑一次回归
              │ 复用：ontology_evals / ontology_golden_datasets / ontology_simulation_scenarios / /evals
              │ 新增：把「评估通过」作为父 issue done 的验收条件
```

**与 DS 的逐点对应**：

| DS 环节 | `build-on-spec` 环节 | 谁更强 |
|---|---|---|
| 演进中心「需求描述 → 本体设计」 | ①→② | DS 有快捷模板；Coolie 有真实 agent 编制 |
| bootstrap「对话 + Schema 实时预览」 | ①→④ | 平手（Coolie 多了聊天流内联） |
| chat-edit「治理审批 + 快照历史 + Diff」 | ③→⑤ | **Coolie 更强**（DS 的审批只是一个开关，Coolie 的 `approvals`/`proposals` 是带状态的流程） |
| 落库（保存 / 应用▾） | ⑥ | **Coolie 更稳**（幂等 + 可回滚快照） |
| app-builder「生成 CRUD 应用」 | ⑦→⑧ | **Coolie 更强**（不是生成代码，是生成**有人做**的任务） |
| eval / simulation | ⑨ | 平手（两边 UI 都不完整） |
| market 蓝图库 | ⑨ 之后（把跑通的域导出为 package） | DS 空态 |

### 4.3 Ontology Spec v0（建议形状）

字段名**刻意全部取自 `plugin-ontology` 现有列**，不做二次翻译：

```jsonc
{
  "specVersion": "0.1",
  "domain": {
    "slug": "ecommerce",
    "name": "电商平台",
    "category": "retail",
    "bootstrapSource": "build_spec",     // ontology_domains.bootstrap_source
    "lifecycleState": "draft"            // draft → active → deprecated → archived
  },
  "nodeTypes": [
    {
      "key": "Product",
      "label": "商品(SPU)",
      "layer": "aggregate_root",         // aggregate_root | child_entity | action | state | event | generic
      "propertiesSchema": [
        { "key": "productId", "type": "string", "required": true,
          "description": "商品唯一编号（平台全局唯一）", "reference": "Product" },
        { "key": "status", "type": "enum", "required": true,
          "values": ["draft", "on_sale", "off_shelf"] },
        { "key": "detailImages", "type": "array", "required": false }
      ]
    }
  ],
  "relationTypes": [
    { "key": "HAS_SKU", "label": "包含 SKU",
      "sourceType": "Product", "targetType": "SKU",
      "cardinality": "one_to_many" }     // ontology_relation_types.cardinality
  ],
  "actionTypes": [
    { "key": "placeOrder", "label": "下单", "appliesTo": "Order",
      "stateTransitions": [{ "from": "created", "to": "paid" }],
      "requiredPermissions": ["order:write"], "idempotent": true }
  ],
  "seedNodes": [
    { "type": "Product", "key": "ecom_prod_01",
      "label": "iPhone 15 Pro Max 智能手机商品",
      "properties": { "title": "…", "status": "on_sale" } }
  ],
  "buildSteps": [
    { "kind": "requirements", "title": "需求梳理", "assignedAgentType": "pm",
      "nodeTypes": ["Product", "SKU", "Order"] }
  ]
}
```

内置词汇表（= validator 的白名单，来自截图实证）：
`type ∈ {string, number, boolean, enum, array, object, datetime}`
`layer ∈ {aggregate_root, child_entity, action, state, event, generic}`
`cardinality ∈ {one_to_one, one_to_many, many_to_one, many_to_many}`
`kind ∈ {requirements, design, impl, test, release}`（沿用 `BUILD_STEP_KINDS`，不新造）

**校验规则必须"全有或全无"**，照抄 `normalizeBuildPlan` 的判断：任一 nodeType 的
`propertiesSchema` 非法、任一 relationType 引用了不存在的 `sourceType`/`targetType`，
就**整份拒绝并回退**，而不是"修一部分"。理由与 build-orchestrator 注释里写的一样：
半模型半兜底的产物比纯兜底更难推理。

### 4.4 服务端接口草图

```
POST /api/build/spec/start      { companyId, prompt }        → { specId, spec, planSource, unassignedAgentTypes }
POST /api/build/spec/:specId/approve                          → { domainId, created: { nodeTypes, relationTypes, actionTypes } }
POST /api/build/spec/:specId/instantiate                      → 幂等，重复调用返回同一 domainId
GET  /api/build/spec/:specId                                  → spec + approval 状态 + 已建对象
```

落点建议（**不新开路由树**，挂在现有 `buildRoutes(db, {…})` 上，`server/src/routes/build.ts` 现 94 行）：

- `server/src/routes/build.ts`（扩到 ~200 行）
- `server/src/services/ontology-spec-planner.ts`（新，~220 行；spawn 逻辑从 build-orchestrator 抽出复用）
- `server/src/services/ontology-spec-validator.ts`（新，~180 行；纯函数，最易测）
- `server/src/services/ontology-provisioner.ts`（新，~380 行；调 plugin-ontology 路由 / 或直接写库）
- `packages/shared/src/ontology-spec.ts`（新，~250 行；类型 + 常量 + 校验，server 与 UI 共用）

### 4.5 验收标准（这一版方案怎么算成立）

1. `建域 电商平台：商品、SKU、订单、支付、退款、优惠券` 一句话，产出 spec 且**每段都有 `name: type`**。
2. spec 里 Product 至少有 8 个属性（对齐 DS 的密度下限，而不是 Coolie 样本的 4.7 均值）。
3. 非法 spec（如 `relationTypes` 引用不存在的类型）**整份被拒**，`planSource` 如实报 `rejected`。
4. 审批前 `ontology_domains` 里**没有**新增行；审批后**有**，且 `bootstrap_source = "build_spec"`。
5. 幂等：`instantiate` 连调 3 次，域仍然只有 1 个。
6. 落库后可一键回滚到 `ontology_domain_snapshots` 里的前置快照。
7. 5 段 issue 全部建成，除第一段外全部 `blocked`，且 `blockedBy` 指向上一段。
8. 树级 hold 能对整棵 build 树 `pause` / `cancel`。
9. `pnpm test` 绿；`server/` 与 `clients/expo/` tsc 0 错误。

---

## 5. 缺口工作项与成本

成本单位是 **LOC + 影响面 + 风险**，不是日历时间（本仓库惯例：不给时间估算）。
参照系：`plugin-ontology/src/ui/app.tsx` 4187 行、`graph-view.tsx` 2373 行、
`issue-tree-control.ts` 1215 行、`build-orchestrator.ts` 484→958 行。
所以下面 100–600 行量级的估算意味着"半个到两个既有文件"。

### P0 — 让 `build-on-spec` 成立（约 1.4k LOC）

| ID | 工作项 | 落点 | LOC | 依赖 | 风险 |
|---|---|---|---|---|---|
| **W1** | Ontology Spec 类型 + 常量 + 纯函数校验器 | `packages/shared/src/ontology-spec.ts` + 测试 | ~300 | 无 | 低。纯函数，但**词表必须先定死**，否则每次加字段都要改三处 |
| **W2** | Spec 规划器（hermes 第二套 prompt + 解析 + 整体回退） | `server/src/services/ontology-spec-planner.ts` | ~220 | W1 | 中。**模型可能产出假 ID**（DS 沙盘的 `DOMAIN_NOT_FOUND` 就是这个坑）→ 引用型字段一律先当字符串，不预先造 key |
| **W3** | Spec 文档持久化 + 审批门 | 扩 `server/src/routes/build.ts`、复用 `documents` / `ontology_proposals` | ~180 | W1 | 中。**审批前不得有任何写入**，需要测试守住 |
| **W4** | Provisioner（spec → domains/node-types/relation-types/action-types，幂等 + 前置快照） | `server/src/services/ontology-provisioner.ts` | ~380 | W1, W3 | **高**。跨进程写插件命名空间 + 幂等键 + 回滚，是全清单里最需要集成测试的一项 |
| **W6** | nodeType → 子 issue 分解规则 | 扩 `build-orchestrator.ts`（+`issue_plan_decompositions`） | ~300 | W1, W4 | 中。**别动 5 段主链**——`dependsOn` 由代码推导而非模型给（现有注释明确"模型不得弱化顺序门"），扩在子层 |

### P1 — 让人看得见、信得过（约 1.2k LOC）

| ID | 工作项 | 落点 | LOC | 依赖 | 风险 |
|---|---|---|---|---|---|
| **W5** | SpecDiffCard + 审批 UI（web + expo 两处） | `clients/expo/src/components/SpecDiffCard.tsx`、`ui/src/pages/BoardChat.tsx` | ~520 | W2, W3 | 中。**web 侧目前完全没有 build 集成**（`ui/src/pages/` 里搜 `build/start` 零命中），等于补一条新链路 |
| **W7** | 图谱 schema 驱动「新建节点」表单 + 引用型实例选择器 | `plugin-ontology/src/ui/`（`graph-view.tsx` + 新 form 组件） | ~650 | W1 | 中。这是 DS 最值得抄的一处（`02-graph-canvas-menu.png` 的弹窗），但 `graph-view.tsx` 已 2373 行，**注意别继续膨胀**——建议新文件 |

### P2 — DS 平价长尾（约 1.1k LOC，优先级可议）

| ID | 工作项 | 落点 | LOC | 依赖 | 风险 |
|---|---|---|---|---|---|
| **W8** | 评估 / 沙盘聚合页（把已有的 `/evals`、`/simulation-scenarios` 上 UI） | `plugin-ontology/src/ui/`（从 `ManageTab` 里把 `EvaluationSection` 提出来 + 新增沙盘） | ~480 | 无（表/路由都现成） | 中。**DS 的 simulation 页是空白的**，别拿它当验收基准；KPI 口径要自己定义 |
| **W9** | 域市场 UI（`ontology_package_installs`）+ 域导出/导入 | `plugin-ontology/src/ui/`、扩 `/package-installs` | ~320 | 无 | **低价值**：DS 自己 `0 个蓝图`。建议**先做"导出当前域为 package"这一半**，市场浏览后置 |
| **W10** | 本体「对话」页签（`ontology.dialogue` 事件流） | `plugin-ontology/src/ui/ChatTab.tsx`（现为 `PlaceholderTab`）+ worker | ~260 | W1 | 中。需要一个新的事件通道；**没有它，spec diff 只能塞在聊天流里，放不进本体页** |

### 5.1 最小可验证切片（建议的第一步）

只做 **W1 + W2 + W4**（约 900 LOC，其中 W1/W2 是几乎无风险的纯逻辑），
用**现有**的 `/api/build/start` 同款接口先跑通：

> 一句话 → spec JSON（日志里可见）→ 直接建域（暂时不要审批、不要 UI、不要分解）

跑通后再按 W3 → W6 → W5 的顺序补审批、分解、可视化。这样**每一步都有一个可回滚的检查点**，
也不会一次性改动 `build-orchestrator.ts`（它同时被 main 与 release/0.5.0 两条线持有，见 §0.4，
**冲突面最贵**）。W2/W4 是新增文件，两条线都能干净地合。

### 5.2 成本之外的两个非代码前提

1. **`release/0.5.0` 与 `main` 必须先归一**。pacing 那 3 个提交只在这条支线里，
   而本方案要在 build-orchestrator 上继续加东西。按 `BRANCHING.md` §7，
   "内容不在 main 里"本身就是待办项。**先合，再改**。
2. **词表冻结**。`type` / `layer` / `cardinality` / `kind` 四个白名单一旦写进 spec v0，
   插件迁移、UI、校验器、planner prompt 会同时依赖它。**改词的代价远高于加字段**。

---

## 6. 五分钟版总结

1. **DS 的价值不在页签数量，在两条环**：本体驱动（对象/关系/属性 → 实例 → 动作 → 评估/沙盘）
   和 spec 驱动（一句话 → schema 草案 → diff → 落库 → 长出应用/员工/管道）。
2. **Coolie 的 `plugin-ontology` 已经把 DS 的元模型几乎一比一搬完了**（18 个 migration：
   `ontology_domains` / `ontology_node_types` / `ontology_relation_types` / `ontology_nodes` /
   `ontology_edges` / `ontology_action_types` / `ontology_interfaces` / `ontology_functions` /
   `ontology_domain_snapshots` / `ontology_audit_logs` / `ontology_proposals` / `ontology_evals` /
   `ontology_simulation_scenarios` / `ontology_package_installs` …），
   **缺的不是表，是「人能用它」的那一半**：其中 20+ 个面（action-types / interfaces / functions /
   snapshots / audit-logs / proposals / evals / simulation / package-installs / business-systems /
   sub-projects / umodel / views / resource-links …）表与路由都是活的，但**一个 UI 入口都没有**。
3. **DS 缺的恰好是 Coolie 的强项**：谁做、按什么顺序做、做不动怎么办、能不能暂停。
   Coolie 已有 `issue_relations`(`blocks`) 顺序门、`issue_plan_decompositions`「已接受 plan → 子任务」、
   `issue_tree_holds`（pause/resume/cancel/restore）、带限流冷却的 build orchestrator。
4. **落地路径是一条链**：board chat → Ontology Spec（新产物）→ 审批 → `plugin-ontology` 实例化 →
   按对象类型分解 issue → build orchestrator 派工。P0 约 1.4k LOC（W1+W2+W3+W4+W6），
   最小切片约 900 LOC（W1+W2+W4）。
5. **两个前置**：先把 `release/0.5.0` 的 3 个提交并回 `main`（否则要改的
   `build-orchestrator.ts` 两份分叉），以及**冻结 spec 词表**（`type`/`layer`/`cardinality`/`kind`）。

**并且不要照抄 DS 已经坏掉的部分**：空白 `simulation` 页、`0 个蓝图` 的 market、
回调全 undefined 的 `SchemaTypeContextMenu`、自相矛盾的统计口径、
以及「校验完成 100% 通过」同时抛 `DOMAIN_NOT_FOUND` 的沙盘契约穿透。

---

## 附录 A：Coolie 侧证据索引（供复核）

| 证据 | 路径 / 行号 |
|---|---|
| 插件清单、命名空间 | `packages/plugins/plugin-ontology/src/manifest.ts`（id `paperclipai.plugin-ontology`；`namespaceSlug: "ontology"` → schema `plugin_ontology_b62f8af3e9`） |
| 18 个 migration | `packages/plugins/plugin-ontology/migrations/001…018_*.sql` |
| 视图集合 | `src/ui/app.tsx:243` `WorkbenchView = graph \| table \| schema \| cognition \| capabilities \| dialogue \| sandbox \| actions \| functions \| interfaces \| datasets \| connectors \| transforms \| domains \| manage` |
| 对话页签是占位 | `src/ui/ChatTab.tsx`（`PlaceholderTab`, `futureChannel="ontology.dialogue"`） |
| 评估 UI 只在 ManageTab | `src/ui/app.tsx:3164`（`EvaluationSection`），调用点 `3764` / `4105` |
| 域列表 | `src/ui/app.tsx:2942`（`DomainList`） |
| 样本本体规模 | `src/samples/ontology-domains.json`（7 域 / 43 类型 / 203 属性 / 49 关系类型） |
| DS 参考笔记 | `packages/plugins/plugin-ontology/DS_REFERENCE.md` |
| board chat | `server/src/routes/board-chat.ts`（452 行；`hermes chat --yolo --oneshot --quiet --max-turns 40`；`skills/paperclip-board/SKILL.md`） |
| build 模式路由 | `server/src/routes/build.ts`（94 行，`POST /build/start`，`assertBoard` + `local_trusted`/`authenticated` 门） |
| build 编排器 | `server/src/services/build-orchestrator.ts`（main 484 行；`BUILD_STEP_KINDS`、`BUILD_AGENT_TYPE_ROLE_CHAIN:72`、`PLANNER_SYSTEM_PROMPT:162`、`normalizeBuildPlan:204`、`createBuildPlanIssues:385`） |
| 限流（仅 0.5.0） | `server/src/config/build-orchestrator.json` + `DEFAULT_BUILD_ORCHESTRATOR_CONFIG`（958 行版） |
| 树级 hold | `server/src/services/issue-tree-control.ts`（1215 行）、`issue_tree_holds` / `issue_tree_hold_members` |
| blocks 边 | `packages/db/src/schema/issue_relations.ts`（`type: "blocks"`，唯一索引 `company_edge_uq`） |
| plan → 子任务 | `packages/db/src/schema/issue_plan_decompositions.ts`、`server/src/routes/issues.ts`（accepted-plan-decompositions） |
| 文档与版本 | `packages/db/src/schema/documents.ts` / `document_revisions.ts` / `issue_documents.ts`（key `plan` 为约定） |
| 移动端接入 | `clients/expo/src/screens/BoardChatScreen.tsx:499`（`/api/build/start`）、`:546`（`isBuildPrompt`）、`:922`（`BuildProgressCard`） |
| web 端无接入 | `ui/src/pages/` 搜 `build/start` **零命中** |
| 分支约定 | `docs-coolie/BRANCHING.md` §1（我们的代码只放 `main`）、§7（"内容不在 main 里"是待办） |

## 附录 B：DS 侧截图引用一览

正文引用到的截图（按 §0.1 清单）：
`01-graph.png`（19 节点 + 30 个关系标签 + 域概览）、`06-table.png`（16 个对象类型及其属性数、
`LIFECYCLESTATE`、共 19 条记录）、`08-schema.png`（`SCHEMA 结构规范` / `NodeTypes (16)` / 右键提示语）、
`11-chat.png`（`AI 对话式精准 Schema 编辑` / 治理审批 / 快照历史 / 目标选择器 / 逐字段 Diff）、
`12-playground.png`（4 演练卡 / 实时日志 / 4 KPI）、`page-ontology_domains.png`（17 域 / 4 聚合卡 / 来源筛选）、
`page-ontology_bootstrap.png`（对话式本体建设 / Schema 预览）、`page-ontology_app_ecommerce.png`（4 KPI / 对象类型卡）、
`page-ontology_ecommerce_chat-edit.png`（治理审批 / 版本历史 / 隐藏预览）、`page-ontology_ecommerce_eval.png`（8 个指标区块）、
`page-ontology_ecommerce_agents.png`（总编制/在岗/离线/负荷）、`page-ontology_ecommerce_app-builder.png`（CRUD 页面 / 生成代码）、
`page-ontology_ecommerce_designer.png`（能力类型 palette）、`page-ontology_ecommerce_pipeline.png`（空态）、
`page-ontology_ecommerce_simulation.png`（空白页）、`page-ontology_market.png`（0 个蓝图）、
`page-admin_evolution-studio.png`（需求描述 → 本体设计 / 快捷模板 / AI 扩写）。
**`02–05` 因弹窗遮挡未采信，见 §0.2。**
