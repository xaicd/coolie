# Spec: 对标微软 Ontology-Playground 升级本体插件完整功能建设

- 日期：2026-09-24
- 提出人：老板（本次会话）
- 老板原话：「从 https://github.com/microsoft/Ontology-Playground 能反推 映射 当前 本体插件 完整功能 建设吗」
- 对应动作：形成 Spec 三件套（Requirements + System Design + Tasks）
- 优先级：**P1**（战略演进级能力补齐）
- 状态：PROPOSED — 待评审
- 基线代码：`main` @ `cbf160bdf`

---

# 第一部分：需求规格（Requirements）

## 1. 背景与对标

### 1.1 现状与痛点
Coolie 现有本体插件（`packages/plugins/plugin-ontology`）继承了 Palantir Foundry / DigitalStaff 的企业级控制面哲学，具备完整的企业隔离、37 张底层模型表（18 个 migration）、AST 逆向工程（Java/Spring/Proto/DDL）、数据管道（Source→Transform→Sink）、AI 员工编制和高危应急熔断闸门（50ms 锁死）。
但在**用户交互体验、直观可视化建模、标准互操作性与资产样板体系**上，存在显著短板：
1. **缺乏所见即所得的可视化设计器**：用户无法在拓扑画布上直观拉线建立关系或增删实体属性，主要依赖表单与只读拓扑浏览；
2. **缺乏状态撤销/重做（Undo/Redo）**：误操作容错率低，缺乏交互草稿会话；
3. **缺乏标准语义协议互通**：无法导入导出 W3C 标准 RDF/XML、OWL 格式，难以与外部数据中台（如 Microsoft Fabric IQ）和主流知识图谱工具互通；
4. **缺乏开箱即用的行业认知蓝图市场**：内置样例散落在代码 JSON 中，缺乏可视化市场（Market Gallery）供用户一键克隆成熟行业体系；
5. **对话探查（Chat）未激活**：`ChatTab` 处于占位态，缺乏自然语言到图谱实体（NL2Ontology）的即时关联探查。

### 1.2 对标基准：Microsoft Ontology-Playground
微软开源项目 [microsoft/Ontology-Playground](https://github.com/microsoft/Ontology-Playground) 面向 Microsoft Fabric IQ，是当前工业界公认极具生产力的本体交互与教学沙盒。
**定位互补策略**：
- **吸纳其长**：所见即所得的分栏可视化设计器、50 步撤销重做、W3C RDF/XML 与 OWL 双向保真编解码、行业样板库（Catalogue）、轻量化嵌入式挂件（Embed Widget）以及自然语言映射（NL2Ontology）；
- **守我护城河**：保留 Coolie 原有的企业多租户隔离（`company_id`）、Action 动作执行与状态机、代码逆向认知（AST 扫描）、高危安全闸门（Emergency Kill-Switch）、数据管道与数字员工（Agent）控制面协同。

---

## 2. User Stories（用户故事）

- **US1（业务架构师）**：作为业务架构师，我想在一个分栏所见即所得的可视化设计器中直观创建实体类型、配置属性数据类型，并通过在画布上拉线定义关系基数（1:1、1:N、N:N），以便高效完成领域建模，而不需要手写 JSON 或切换多个表单。
- **US2（建模工程师）**：作为建模工程师，我在进行复杂拓扑调整时，希望能随时按 `Ctrl+Z` / `Ctrl+Y` 撤销和重做最近 50 次操作，并在草稿态满意后一键原子落库，避免误操作污染生产本体。
- **US3（跨平台集成者）**：作为数据平台工程师，我想把在 Microsoft Fabric IQ 或 Protégé 中导出的标准 `.owl` / `.rdf` 文件直接导入 Coolie，或将 Coolie 的业务本体无损导出为 OWL 语义标准，以便打通跨系统知识资产流动。
- **US4（新企业租户）**：作为刚入驻工坊的企业负责人，我想在「行业认知蓝图市场」中直接按零售、电商、医疗、金融等行业浏览成熟样板，并一键克隆安装至当前工坊，以便零门槛启动业务。
- **US5（业务操作员与开发人员）**：作为业务人员，我想在输入框输入「哪些客户下了订单？」等自然语言，系统能在图谱上自动高亮并命中相关实体与关系链路；同时在任务详情页能直接内嵌可交互的轻量级图谱挂件。

---

## 3. Acceptance Criteria（EARS 验收标准）

### 3.1 可视化设计器与操作栈（Visual Designer & Undo/Redo）
- **AC01 [Event-driven]**: WHEN 用户在设计器画布上右键空白区域，THEN 系统 SHALL 弹出「新建实体类型」浮层，支持配置图标、颜色、主键与属性 Schema。
- **AC02 [Event-driven]**: WHEN 用户从一个实体节点的输出端拉拽连线至另一个实体节点的输入端，THEN 系统 SHALL 打开关系创建弹窗，支持选择或新建关系类型并指定基数（`one_to_one` / `one_to_many` / `many_to_one` / `many_to_many`）。
- **AC03 [State-driven]**: WHILE 用户在可视化设计器中进行建模操作，系统 SHALL 在内存中维持最大 50 步的历史变更栈（Undo/Redo），并在顶栏实时显示撤销与重做按钮可用态。
- **AC04 [Event-driven]**: WHEN 用户按下 `Ctrl+Z`（或 `Cmd+Z`），THEN 系统 SHALL 撤销上一步操作并同步更新 Cytoscape 画布与属性表单；WHEN 按下 `Ctrl+Y`（或 `Cmd+Shift+Z`），系统 SHALL 重做该操作。
- **AC05 [Unwanted]**: IF 设计器中存在断开的非法连线或空实体名称，THEN 系统 SHALL 在界面上显示高亮错误徽标，且 SHALL NOT 允许提交入库。

### 3.2 语义网标准互通（RDF/XML & OWL）
- **AC06 [Event-driven]**: WHEN 用户上传包含标准 OWL Classes、DatatypeProperty、ObjectProperty 的 `.rdf` 或 `.owl` 文件，THEN 系统 SHALL 在客户端或轻量服务端将其完全解析为 Coolie 的 `nodeTypes` 与 `relationTypes`。
- **AC07 [Event-driven]**: WHEN 用户点击「导出为 W3C OWL 标准」，THEN 系统 SHALL 生成语义合规、能被 Microsoft Fabric IQ 正常解析的 RDF/XML 文件并触发浏览器下载。
- **AC08 [Ubiquitous]**: 系统 SHALL 保证经 Coolie 导出的 OWL 格式再重新导入时，实体属性名、数据类型与连线基数保持 100% 双向保真（Round-trip fidelity）。

### 3.3 行业认知蓝图市场（Catalogue & Market）
- **AC09 [Event-driven]**: WHEN 用户打开「行业认知蓝图」页签或在新建域时选择「从蓝图市场克隆」，THEN 系统 SHALL 展示涵盖零售（Retail）、电商（E-Commerce）、金融（Finance）、医疗（Healthcare）、制造（Industry 4.0）等领域的预置蓝图卡片墙。
- **AC10 [Event-driven]**: WHEN 用户点击「一键克隆安装」，THEN 系统 SHALL 在当前公司隔离环境内（`company_id`）自动创建对应的本体域，写入全套实体类型、关系连线与内置示例数据，并记入 `ontology_package_installs`。

### 3.4 自然语言探查与嵌入挂件（NL2Ontology & Embed Widget）
- **AC11 [Event-driven]**: WHEN 用户在探查搜索框输入自然语言业务查询，THEN 系统 SHALL 调用轻量意图提取器高亮命中的实体类型与跳转路径。
- **AC12 [Event-driven]**: WHERE 用户或系统调用独立挂件脚本 `ontology-embed.js`，挂件 SHALL 能在容器内独立渲染只读或轻交互的 Cytoscape 图谱，且自适应宿主页面的明暗主题。

---

## 4. 边界 / Out of Scope（明确不做）

1. ❌ **不破坏多租户与公司隔离**：所有导入、导出、设计、蓝图安装均必须在严格的 `company_id` 下运行，严禁跨租户泄漏或引入无公司归属的全局孤岛。
2. ❌ **不退化为纯静态无后端架构**：微软 Playground 是零后端的纯静态网页，而 Coolie 核心价值是带权限审计、持久化存储与事务保护的控制面；我们只借鉴前端交互，底层依然依赖 PostgreSQL/PGlite 与 Express API。
3. ❌ **不废弃现有 AST 逆向与数据管道**：已有的 Java/Spring/Proto/DDL 逆向扫描及 Source→Transform→Sink 数据虚拟化管道保持完全不变，新功能为平级增强。
4. ❌ **暂不在第一期重构全套在线在线协同编辑（CRDT）**：设计器以当前用户的本地会话草稿（Draft Session）为主，不引入多光标协同。

---

## 5. 文件范围（白名单）

```
packages/ontology-core/
├── src/codecs/
│   ├── rdfXmlParser.ts          (W3C RDF/XML 与 OWL 解析器)
│   ├── rdfXmlSerializer.ts      (W3C RDF/XML 导出序列化器)
│   └── rdfXml.test.ts           (往返双向保真单测)
└── src/cognition/               (保持既有代码扫描 AST 提取器)

packages/plugins/plugin-ontology/
├── src/ui/
│   ├── DesignerTab.tsx          (分栏可视化本体设计器主入口)
│   ├── designer/
│   │   ├── DesignerCanvas.tsx   (交互式 Cytoscape 画布：拖拽连线/加节点)
│   │   ├── DesignerSidebar.tsx  (实体与属性属性 Inspector)
│   │   └── useDesignerStore.ts  (50 步 Undo/Redo 前端状态机)
│   ├── MarketTab.tsx            (行业认知蓝图市场画廊卡片墙)
│   ├── NlQueryBar.tsx           (NL2Ontology 自然语言探查高亮栏)
│   ├── app.tsx                  (挂载 DesignerTab 与 MarketTab 页签)
│   └── LegacyImportWizardModal.tsx (支持 OWL/RDF 格式导入选项)
├── src/widget/
│   └── ontology-embed.ts        (独立导出的嵌入式轻量图谱挂件构建入口)
├── src/worker.ts                (增加蓝图市场与格式转换路由 actions)
└── src/manifest.ts              (声明新增的 actions 契约)
```

**明确不动**：
- `server/src/routes/` 核心鉴权逻辑；
- `clients/expo/` 原生桥接层（仅消费共享 API）；
- `packages/db/src/schema/` 既有 18 个 migration 历史结构（采用增量无损兼容）。

---

## 6. 验收 Gate (PM-RELEASE-CHECKLIST 子集)

- [ ] `packages/ontology-core` 中 RDF/OWL 解析器与序列化器 round-trip 测试覆盖率 100%
- [ ] 可视化设计器支持画布连线新建关系，撤销/重做 50 步严格无内存泄漏
- [ ] 蓝图市场支持至少 5 个预置行业模板的一键克隆入库，公司边界隔离正确
- [ ] `pnpm -r typecheck` 0 报错
- [ ] `pnpm --filter @paperclipai/plugin-ontology test` 全部绿灯
- [ ] UI 符合 Linear 暗黑设计规范 (`C` 色彩体系)，无裸 hex / 裸样式断言

---

# 第二部分：技术方案（System Design）

## 7. 技术架构与数据流

### 7.1 交互架构与数据流图

```
                ┌──────────────────────────────────────────────────────────┐
                │             用户交互层 (Web Workbench / Embed)            │
                └────────────┬─────────────────────────────┬───────────────┘
                             │                             │
                     [自然语言探查 / 拖拽建模]        [OWL/RDF 文件上传 / 导出]
                             ▼                             ▼
                ┌───────────────────────────┐ ┌────────────────────────────┐
                │ useDesignerStore          │ │ @paperclipai/ontology-core │
                │ (50-level Undo/Redo 状态栈)│ │ (RDF/OWL Codec 引擎)       │
                └────────────┬──────────────┘ └────────────┬───────────────┘
                             │                             │
                   [原子提交 / 草稿发布]               [语义 AST 转换]
                             ▼                             ▼
                ┌──────────────────────────────────────────────────────────┐
                │          plugin-ontology Worker (Express Actions)        │
                │  - import-document / export-owl                          │
                │  - install-market-blueprint                              │
                │  - batch-mutate-graph                                    │
                └────────────────────────────┬─────────────────────────────┘
                                             │
                                  [写入审计 / Company 隔离]
                                             ▼
                ┌──────────────────────────────────────────────────────────┐
                │           PostgreSQL / PGlite 存储层                     │
                │  - ontology_domains / ontology_node_types                │
                │  - ontology_relation_types / ontology_edges              │
                │  - ontology_audit_logs / ontology_package_installs       │
                └──────────────────────────────────────────────────────────┘
```

### 7.2 模块边界与关键组件设计

#### 1. 可视化设计器状态机 (`useDesignerStore.ts`)
- **状态结构**：
  ```ts
  interface DesignerState {
    domainId: string;
    past: HistorySnapshot[];    // 最大长度 50 的撤销历史
    present: OntologyDraft;     // 当前编辑中的草稿拓扑
    future: HistorySnapshot[];  // 重做历史
    selectedEntityId: string | null;
    isDirty: boolean;
    // 动作
    undo: () => void;
    redo: () => void;
    addNodeType: (nodeType: Partial<NodeType>) => void;
    updateNodeType: (id: string, patch: Partial<NodeType>) => void;
    connectNodes: (sourceId: string, targetId: string, relation: Partial<RelationType>) => void;
    saveChanges: () => Promise<void>;
  }
  ```
- **连线交互**：利用 Cytoscape.js 的 `edgehandles` 扩展，允许用户在节点间拖拽手柄拉出动态连接线，释放时挂起候选连线并唤起关系配置面板。

#### 2. W3C 语义网标准 Codec (`rdfXmlParser.ts` & `rdfXmlSerializer.ts`)
- **数据结构映射**：
  - `owl:Class` $\leftrightarrow$ `OntologyNodeType`
  - `owl:DatatypeProperty` $\leftrightarrow$ `properties_schema` 内部的基础字段（`string`, `number`, `boolean`, `datetime`）
  - `owl:ObjectProperty` $\leftrightarrow$ `OntologyRelationType`
  - `owl:minCardinality` / `owl:maxCardinality` $\leftrightarrow$ `relationType.cardinality` (`one_to_one`, `one_to_many`, `many_to_many`)
- **解析策略**：客户端采用轻量级 XML DOM 解析器与 RDF 前缀解析规则，纯函数实现，保证无外部厚重依赖且可运行于浏览器与 Node 环境。

#### 3. 独立嵌入挂件 (`ontology-embed.js`)
- 基于 Vite 的库模式（`build.lib`），构建包含最小化 Cytoscape 运行时与 Fluent/Linear 双主题 CSS 的 IIFE/ESM bundle，体积控制在 120KB 以内（Gzip）。

### 7.3 API 接口契约增补

所有新增端点挂载在 `/api/plugins/paperclipai.plugin-ontology/actions/` 命名空间下：

1. **导出 OWL 标准文件**：
   - 动作：`export-owl`
   - 请求：`POST /actions/export-owl { companyId: string, domainId: string }`
   - 响应：`{ success: true, mimeType: "application/rdf+xml", content: string, filename: string }`
2. **导入 OWL 标准文件**：
   - 动作：`import-owl`
   - 请求：`POST /actions/import-owl { companyId: string, domainId: string, rdfContent: string }`
   - 响应：`{ success: true, importedNodeTypes: number, importedRelationTypes: number }`
3. **获取蓝图市场列表**：
   - 动作：`list-market-blueprints`
   - 请求：`POST /actions/list-market-blueprints { companyId: string, category?: string }`
   - 响应：`{ blueprints: MarketBlueprintItem[] }`
4. **一键克隆安装蓝图**：
   - 动作：`install-market-blueprint`
   - 请求：`POST /actions/install-market-blueprint { companyId: string, blueprintId: string, targetSlug: string }`
   - 响应：`{ domainId: string, stats: { nodeTypes: number, relationTypes: number } }`

### 7.4 安全、权限与审计
- **鉴权模型**：继承宿主会话与 Bearer Token 验证，所有请求严格解出 `companyId`；
- **越权防御**：严禁通过 `blueprintId` 跨租户拉取未公开的私有域；预置蓝图为纯模板，安装时在当前租户执行原子 `INSERT`，无全局状态交叉；
- **审计记录**：每一次设计器草稿原子落库，均调用 `ctx.activity.log` 生成企业级审计轨迹，并在 `ontology_audit_logs` 记录变更前后快照 Diff。

---

# 第三部分：实施任务清单（Tasks & Roadmap）

## 8. 分阶段执行拆解（4 个阶段）

```
[Phase 1: 可视化设计器与撤销重做] ──► [Phase 2: 蓝图市场与样板体系]
                 │                                    │
                 ▼                                    ▼
[Phase 3: W3C RDF/OWL 互操作引擎]  ──► [Phase 4: NL2Ontology 与独立挂件]
```

### Phase 1: 可视化设计器交互补齐 (Visual Designer & Undo/Redo)
- [ ] **T1.1** [前端/状态机]: 在 `plugin-ontology` 实现 `useDesignerStore.ts`，内置 50 步栈深度的 Undo/Redo 与变更检测机制。
- [ ] **T1.2** [前端/画布]: 改造 `graph-view.tsx` 为 `DesignerCanvas.tsx`，启用 Cytoscape 连线交互手柄（Edgehandles），支持画布内拉线建关联。
- [ ] **T1.3** [前端/侧边栏]: 开发 `DesignerSidebar.tsx`，支持实时选中节点/关系后编辑属性列表、切换类型、配置基数。
- [ ] **T1.4** [前后端联调]: 实现设计器草稿「保存并落库」逻辑，原子调用批量写入接口，验证审计日志产生。

### Phase 2: 行业认知蓝图市场 (Market & Catalogue Gallery)
- [ ] **T2.1** [资产整理]: 将内置 7 大领域（零售、电商、金融、制造、教育等）样本模型标准化为统一的 `Blueprint` 结构化配置。
- [ ] **T2.2** [后端 Action]: 完善 `list-market-blueprints` 与 `install-market-blueprint` 端点，实现零配置一键克隆落库。
- [ ] **T2.3** [前端卡片墙]: 开发 `MarketTab.tsx`，支持按行业筛选、查看图谱概览、一键克隆安装。
- [ ] **T2.4** [新建流程串联]: 在新建本体域弹层中与本次刚落成的「文件夹目录接入」并列加入「从蓝图库克隆」模式。

### Phase 3: W3C 语义网标准协议互通 (RDF/XML & OWL Round-trip)
- [ ] **T3.1** [核心层/解析器]: 在 `packages/ontology-core` 编写 `rdfXmlParser.ts`，支持标准 OWL Class / Properties 到内部 NodeTypes / RelationTypes 的 AST 解析。
- [ ] **T3.2** [核心层/生成器]: 编写 `rdfXmlSerializer.ts`，根据当前本体域生成完全兼容 Microsoft Fabric IQ 的标准 RDF/XML。
- [ ] **T3.3** [测试验证]: 编写往返双向保真测试 `rdfXml.test.ts`，导入导出断言差异 0 丢失。
- [ ] **T3.4** [前端交互集成]: 在设计器与导入向导中增加「导出 OWL 文件」与「导入 OWL/RDF」入口。

### Phase 4: 自然语言探查与独立嵌入挂件 (NL2Ontology & Embed Widget)
- [ ] **T4.1** [自然语言映射]: 激活工作台 `NlQueryBar.tsx`，实现轻量规则/LLM 实体抽取，输入自然语言后在 Cytoscape 画布高亮命中链路。
- [ ] **T4.2** [挂件打包]: 配置独立打包管线输出 `dist/ontology-embed.js`，支持单标签无依赖在任何网页中嵌入。
- [ ] **T4.3** [宿主协同]: 在 Paperclip 的 Issue 详情或讨论卡片中测试内嵌挂件，验证跨场景图谱预览能力。

---

## 9. 派单建议与交付标准

- **派单分工**：
  - **门神（cmd / 架构师）**：负责 Phase 1 的 Undo/Redo 状态机与 Phase 3 的 `packages/ontology-core` RDF/OWL 编解码核心算法与单测。
  - **铁匠（claude / 全栈）**：负责 Phase 1 的 Cytoscape 画布拖拽交互、Phase 2 蓝图市场前后端串联与 Phase 4 独立挂件输出。
- **发布节奏**：
  - 本 Spec 采取渐进式交付：Phase 1+Phase 2 构成 **v0.6.0-beta**；Phase 3+Phase 4 构成 **v0.6.0 完整版**。
