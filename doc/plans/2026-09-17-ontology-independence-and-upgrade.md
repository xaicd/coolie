# 本体体系升级:以「文档」为界,让 ontology 独立于 Paperclip 与 DSH

日期:2026-09-17
状态:方案(第一步已实现,见文末「已落地」)

## 1. 为什么是现在,以及为什么从「文档」开始

用户提出:**独立运行刚好从这里开始,Paperclip / DSH / ontology 三方。**

学习的对象是 Microsoft Ontology Playground。它给出的最有价值的不是内容,而是一个**架构事实**:

> 它是个**零后端的纯静态应用**。一个 IIFE 文件(`ontology-embed.js`,约 200KB 级)加一个 CSS,
> 宿主页面只写 `<div class="ontology-embed" data-ontology-inline="<base64 JSON>">` 和一段
> `<script src>`,本体就被渲染出来了。**没有后端、没有数据库、没有鉴权。**
> 三种数据来源:目录 id(`catalogue.json` 静态文件)、一个 URL(RDF 或 JSON)、**内联 base64**。

也就是说:**本体是可以以「文档」形态旅行的。**

这直接决定了三方边界该怎么切:

| 方 | 职责 | 依赖 |
|---|---|---|
| **Paperclip** | 谁能做什么:工单、角色、审批、人机协作 | 数据库、用户体系 |
| **DSH** | 执行平面:agent + MCP 工具总线,逐步硬拦截 | 被执行的系统 |
| **ontology** | 语义底座:类型、可信事实、映射、视图、图查询 | **只需一份文档** |

前两方各自都需要一个运行中的系统。**只有本体可以只靠一份文档活着** —— 而它一旦能,
「本体属于租户」「定期 fork Paperclip 注意影响面」「不同环境维护不同智能体」这三条
约束就同时松开了:模型可以在环境之间、实例之间、甚至 Paperclip 不在场时被读取。

所以升级的第一步不是加功能,是**定义一个本体文档格式**。文档就是接口。

## 2. 从 Playground 学到的东西(逐条,含实测)

### 2.1 数据模型:和我们几乎同构,差异是真实的

他们的模型(`src/data/ontology.ts:3-54`):

```
Ontology { name, description, entityTypes[], relationships[] }
EntityType { id, name, description, properties[], icon, color }
Property { name, type, isIdentifier?, unit?, values?, description? }
Relationship { id, name, from, to, cardinality, description?, attributes? }
RelationshipAttribute { name, type }
```

对照我们:

| 维度 | 他们 | 我们 | 判断 |
|---|---|---|---|
| 类型键 | `id`,小写 slug | `key`,小写 slug | 一致 |
| 属性集合 | **有序数组** `Property[]` | **扁平 map**(jsonb) | **关键差异** —— 见 2.4 |
| 属性类型 | `string/integer/decimal/double/date/datetime/boolean/enum` | `string/number/boolean` + `format` + `enum` | 他们的更细;我们的 `format` 是拆开的,要对齐 |
| 关系端点 | 扁平 `from`/`to` 字段 | metadata bag 里的 `sourceNodeTypeKey`/`targetNodeTypeKey` | 他们的更好,见 2.5 |
| 基数 | `one-to-many`(连字符) | `one_to_many`(下划线) | **拼写不同,必须映射** |
| **关系属性** | **有** `attributes[]` | **无** | 真实缺口,见 2.6 |
| shared property / interface | **没有**(和我们一样) | 声明了但未实现 | 双方都没解决;我们更差(表存在却无写入者) |
| 实例数据 | `EntityInstance` 存在,**不参与序列化** | 我们在库里 | 文档格式默认**不含实例**,见 §4 |

**他们也没有 shared property,也没有 interface。** 这不是我们独有欠债,是他们明确选择
「属性归类型所有」。但他们的 `ont:relationshipAttributeOf` 说明:**属性可以属于关系**,
这是他们做而我们完全没做的一件事。

### 2.2 他们的建模规范(可直接变成我们的校验规则)

`docs/authoring-guide.md` 里是硬规矩,不是建议:

- 实体 `id`:小写 slug,URL 安全,域内唯一。**不允许 `entity1`/`entity2`。**
- 实体 `name`:**单数名词**,标题大小写("Customer"、"Work Order")。**禁止 "Item"/"Thing" 这类泛名。**
- 实体 `description`:**一句话,以冠词开头**("A person who…")。**每个实体都必须有。**
- 属性 `name`:camelCase 且可读(`loyaltyTier`,不是 `lt` 或 `field3`)。
- 每个实体 **3–8 个属性**,类型要混合(否则没东西可查)。
- **每个实体必须至少一个 `isIdentifier: true` 的属性。**(他们没有这个连构建都拒绝)
- 关系 `name`:**必须是动词**("places"、"contains"、"teaches")。**名词式("ownership")不行** ——
  边上读起来不通。1–2 个词,长了图上会重叠。
- **实体超过 10 个** → 布局就乱了;**聚焦 5–8 个核心概念**,更大的域要拆。

最后这条对我们特别重要:我们的对象类型可以上千,而**人是看不过来的**。
这正是「结构图必须策展、不能全量铺开」的规范依据。

### 2.3 RDF/OWL:可以作为**交换格式**采纳,**不需要推理机**

实测结论(`src/lib/rdf/**`):

- 它用的是 **极浅 OWL**:`owl:Class`、`owl:DatatypeProperty`(+`rdfs:domain`)、
  `owl:ObjectProperty`(+`rdfs:domain`/`rdfs:range`)。
  **基数、标识符、单位、枚举值全部是自定义 `ont:` 注解,不是 OWL 限制** ——
  没有 `owl:Restriction`、没有 `owl:FunctionalProperty`、没有类表达式。
  所以**采纳这个格式不会引入任何推理**,红线不破。
- **但有一处必须诚实**:`rdfs:domain`/`rdfs:range` **是有标准 RDFS 蕴含的** ——
  一个 RDFS 感知的消费者会推导出「该属性的主语属于那个类」。这是一个轻微的语义承诺。
  若要严格无语义,应把它们写成普通注解或直接不写。**这条要作为明确决策记录,而不是默认忽略。**

要采纳就必须自己补六件事(他们这几处都不够):

1. **类型映射** —— 我们的 `format: "date"` 要落到 `xsd:date`,他们的 `date` 是独立类型。
2. **显式属性顺序** —— 见 2.4,**最大的必补项**。
3. **显式 slug** —— 他们的 id 靠 URI 片段 + 大小写变换重建(`uncapitalize(URI fragment)`),
   改名就会变。我们应把 slug 作为独立注解写出来。
4. **有损导入诊断** —— 他们**完全没有**警告通道:域未匹配的属性、端点无法解析的关系、
   未知基数,全部**静默丢弃或静默强转**(未知基数 → 强制 `one-to-many`)。
   我们应该收集并上报,而不是继承这个行为。
5. **固定词汇表命名空间** —— 他们的 `ont:` 前缀绑在**每个本体自己的 base URI** 上,
   本体一改名注解 URI 就变了。我们要定义并集中管理一个固定的命名空间。
6. **关系属性** —— 若将来加,照抄他们的再化模式(无 `rdfs:domain` 的
   `DatatypeProperty` + `ont:relationshipAttributeOf` 回指)。

**明确不采纳**:`fabric.ts` 整个文件。那是 Microsoft Fabric 的 JSON/base64 私有契约,
与 RDF 无关,而且是有损的(丢掉描述、单位、枚举、图标、颜色、基数、关系属性)。

### 2.4 属性顺序:他们的办法我们接不住(这是最硬的发现)

他们的属性顺序**只在 XML 文档序里幸存** —— 模型侧是数组(`Property[]`),
序列化按数组顺序写,解析按文档顺序读,往返测试**按位置断言**,所以顺序被隐式保住。

**没有 `ont:order`、没有 `rdf:List`、没有 `ont:index`。任何会重排三元组的工具都会静默丢掉顺序。**

而我们的存储是 **Postgres jsonb —— jsonb 不保留键顺序**。所以:

> **他们那个办法无法转移。我们必须自己加显式的序数注解(两个方向都要),这是新工作。**

这和我们已知的缺口是同一个:**Schema 页的字段顺序和来源对不上。**
一件事,两个面。

### 2.5 关系端点:他们存对了,我们存错了地方

他们:`Relationship { from, to }` —— 一等字段,序列化直接写进 `rdfs:domain`/`rdfs:range`。

我们:端点在 `ontology_relation_types.metadata` 这个 jsonb 袋子里
(`relationEndpoints.ts` 是唯一的读取方)。这是我们踩过的坑的根源 ——
`RELATION_TYPE_COLS` 漏掉 `metadata` 时,**关系类型的端点全部消失,结构图画不出任何一条线**,
而且不报错。

文档格式里端点必须是一等字段。库里的列是否迁移另议,但**交换格式不能重复这个错误**。

### 2.6 关系属性:他们做,我们没做

```
RelationshipAttribute { name: string; type: string }
```
RDF 侧是「无 `rdfs:domain` 的 `DatatypeProperty` + `ont:relationshipAttributeOf` 回指」。
`quantity` 挂在 `contains` 上,而不是挂在 `Order` 或 `Product` 上。

这正是我们转换样例时**丢掉那 3 个属性**的原因 —— 我们无处安放。
这是一个**真实的、有具体证据的**缺口。

### 2.7 独立交付形态(直接可抄的部分)

`src/embed.tsx` 全文 47 行:找 `.ontology-embed` 容器 → 读 data 属性 → `createRoot` 挂载 →
暴露 `window.OntologyEmbed.init()` 供动态 DOM 重挂。三种数据来源,其中**内联 base64**
是关键:不需要任何网络请求就能显示一份本体。

## 3. 采纳 / 重建 / 拒绝

| 项 | 决定 | 理由 |
|---|---|---|
| 「本体即文档」的交付形态 | **采纳** | 独立性的全部依据;零后端已验证可行 |
| 有序属性数组(`ont:order` 形式) | **采纳并自建** | jsonb 接不住他们的隐式方案 |
| 端点为一等字段 | **采纳** | 我们放在 metadata 袋子里的做法已经出过事故 |
| 关系属性 | **采纳(文档层先支持)** | 有 3 个具体被丢弃的实例为证 |
| RDF/OWL 作为交换格式 | **采纳,但补 6 项** | 无语义承诺(除 domain/range,需显式决策) |
| 建模规范 → 校验规则 | **采纳** | 可直接变成 `validateDomainDocument` 的规则集 |
| `fabric.ts` | **拒绝** | 私有有损契约,与 RDF 无关 |
| 静默丢弃 / 静默强转 | **拒绝** | 与我们「有损就必须上报」的既有原则冲突 |
| `icon` / `color` | **拒绝** | 色值写进 `ui/**` 会撞 token 门禁;我们的类型没有 icon 列 |
| 他们的 `EntityInstance` 进文档 | **本期拒绝** | 文档默认只带模型;实例另行导出 |

## 4. 文档格式的设计约束

1. **不含租户、不含 company id。** 文档是**模型**,不是租户。
   这一条直接对应「本体属于租户,不属于工单」的反面:**文档属于谁由持有者决定,不由内容声明。**
2. **显式顺序。** 属性是有序数组,序数写进格式。
3. **端点一等字段。**
4. **带格式版本 + 自身指纹**(规范序列化后的哈希),这样同一份模型在两处可以比对。
5. **带来源**:从哪个 domain、哪个 schema 版本、什么时候导出。但**不带**目标环境的身份。
6. **有损必须上报**:导入时任何不认识的东西都要收集成诊断,而不是丢弃。
7. **实例数据默认不含**,可选包含(导出选项)。

## 5. 路线

- **P1(本文件同批落地)**:文档格式 + 校验 + 往返测试,放在 `ontology-core`(host-free),
  这样独立服务与插件共用同一实现。
- **P2**:HTTP/MCP 暴露导出与导入(agent 只读导出;导入是写入路径,**必须走提案闸门**)。
- **P3**:独立查看器 —— 读文档、无数据库、无 Paperclip。这是「独立运行」的验收物。
- **P4**:RDF 交换(按 2.3 的六项补齐 + 有损诊断)。
- **P5**:属性顺序落到库层(单独迁移),连同 Schema 页的顺序显示。
- **P6**:关系属性落到库层。

## 6. 与既有红线的对齐

- **AI 是提案者,人是发布者** —— 文档的**导出是只读**;文档的**导入是写入**,因此走提案。
- **本体属于租户,不属于工单** —— 文档里没有工单/角色/任务/会话的任何概念;
  校验会拒绝这些键(与 `layering.spec.ts` 的既有规则一致)。
- **不要学术派 OWL / 推理机** —— 格式只读浅子集;`domain`/`range` 的 RDFS 蕴含作为
  **显式决策**记录,不默认忽略。
- **不同环境维护不同智能体** —— 文档正是环境之间搬运模型的手段,不需要 schema 级租户。
- **定期 fork 注意影响面** —— 全部新增落在 `packages/ontology-core` 与我们自己的
  `scripts/`,`ui/**` 与宿主零改动。

## 已落地

- `packages/ontology-core/src/document/` —— 文档格式、规范化、校验、往返。
- 序数、端点、关系属性的处理见该目录的模块注释。
