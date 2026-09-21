# Ontology Workbench — DS 参考设计笔记

本文档记录了对参考实现 **DigitalStaff (DS) 本体工坊** 的观察，作为
`plugin-ontology` UI 对齐的依据。供后续（含 terminal 里的 Claude）继续开发时参考。

## 参考来源

- 参考站点：`http://100.84.124.71:5173/digstaff/ontology/workbench/{domainId}`
  （示例 domain：`ecommerce`）
- 登录：用户 `admin`，租户 `default`。
  - 注意：登录页把密码在**前端做 MD5 摘要**后再发 `POST /digstaff/api/auth/login`
    （字段 `{username, password(md5), tenantSlug}`）。直接用明文调 API 会 403。
  - headless 抓取时需隐藏自动化特征（`navigator.webdriver=undefined`、真实 UA），
    否则登录接口返回 `ACCESS_DENIED`。

## DS 工坊的整体布局（我们对齐的目标）

三栏 + 顶栏 + 底部浮动工具栏：

```
┌ 顶栏: [域选择器 v1.0.0] [图谱|表格|模型|对话|沙盘]      [实时已连接] [保存] [应用▾] ┐
├ 左栏(可折叠)          │ 中间画布                          │ 右栏: 域概览          │
│  - 应用/模块导航       │  - 交互式节点图(ReactFlow 风格)    │   - 域信息(ID/名称/版本/状态)│
│                       │  - 节点按对象类型着色              │   - 应用列表           │
│                       │  - 有向关系连线(带标签)            │   - 统计(节点/关系/类型/跨域)│
│                       │                                   │   - 对象类型列表(N 属性) │
│  ┌ 底部浮动工具栏 ────────────────────────────────┐        │                       │
│  │ [层级][聚类][关系过滤▾] │ [新增节点][连线编辑] │ [模拟演练▾] │                    │
│  └────────────────────────────────────────────┘        │                       │
└──────────────────────────────────────────────────────────────────────────────┘
```

关键观察：
- **打开即工作台**：DS 直接进入某个 domain 的图谱，不是先看 domain 列表。
- 顶部视图切换：图谱 / 表格 / 模型(schema) / 对话 / 沙盘。
- 右侧「域概览」始终可见：域信息 + 统计卡（节点数/关系数/类型数/跨域关系）+ 对象类型清单。
- 底部浮动工具栏分三组：布局(层级)、聚类/过滤、编辑(新增/连线)、模拟演练。
- 节点颜色 = 对象类型（语义分类），运行时按类型 id 派生色相，不用固定 design token。

## 我们(coolie plugin-ontology)的对齐实现

文件：`src/ui/app.tsx` + `src/ui/graph-view.tsx`

- `OntologyPage` → `OntologyWorkbench`：三栏工作台。
  - 顶栏：域下拉选择器 + status 徽章 + 视图切换（图谱/表格/Schema/认知/能力）+ 右栏折叠按钮。
  - 左栏：节点类型树（可拖到画布=按类型建节点；点击=按类型高亮过滤）+ 关系类型列表。
  - 中间：`GraphView`（graph/table/schema 三视图，`hideTabs` 由 host 控制 mode）。
  - 右栏：域概览(InfoRow) + 统计卡(StatCard) + 对象类型列表 + 节点检查器(NodeInspector) + 新建域。
- `graph-view.tsx` 的 `GraphCanvas`：
  - 三种布局：`radial`(环形) / `layered`(按入边深度分层) / `grid`(网格)，底部工具栏切换。
  - 关系过滤下拉（按 relationKey 过滤边）。
  - 连线模式开关（`nodesConnectable`）。
  - 模拟演练：从选中节点计算下游可达集。
  - **右键菜单（重点，务必保留/增强）**：
    - 画布右键：新建节点 / 按类型新建（列出所有 nodeType）/ 适应视图。
    - 节点右键：查看详情、影响推演、重命名、从此节点连线…、下游影响、复制键、聚焦选中、删除。
    - 边右键：重命名关系、反转方向、删除。

## 与 DS 仍有差距 / 待办

- [x] 顶部「实时已连接 / 保存」状态区 —— `TopStatusBar.tsx`（已连接徽章 + 版本 + 快照按钮；
      DS 的「应用」在本数据模型里没有对应概念，刻意不做）。
- [x] 「对话」视图 —— 驾驶舱 `SandboxTab`（9-op JSON patch + diff + 快照抽屉）。
- [x] 对象类型显示「N 属性」计数 —— 左侧类型树已显示；之前恒为 0 是写入链路丢字段（2026-09-15 修复）。
- [x] 跨域关系统计 —— 右侧「统计」面板已有「跨域关系」卡。
- [x] 节点属性面板编辑 —— `NodeInspector` → `NodePropertyEditor` → `update-node`。
- [x] 表格视图按 schema 推导列 —— 2026-09-15 对齐：选中对象类型后按 `propertiesSchema`
      生成属性列（上限 4 列）+ 「共 N 条记录」表头 + 按类型过滤。
- [x] 模型视图展示属性 —— 2026-09-15 对齐：对象类型卡片内联列出 `name: type` + 「N 属性」徽章。
- [x] 对象类型右键菜单 —— 2026-09-15 对齐并**做成真写库**：属性 / 智能补全 / 建立关系 /
      动作 / 删除。DS 的 `SchemaTypeContextMenu`（添加属性 / 定义动作 / 智能补全 / 建立关系 /
      移除类型）在两个调用点（`SchemaOverviewPanel.tsx`、`WorkbenchSidebar.tsx`）都只传了
      `onClose`，5 个回调全是 undefined —— 每项只弹 prompt/confirm + 成功 toast，**不落库**；
      「智能补全」更是直接 toast 一句写死的文案。我们这几项都走真实的 `update-node-type` /
      `create-relation-type` / `delete-node-type`。
- [ ] **沙盘（Playground）视图** —— DS 有：4 张演练卡 + 实时运行日志 + 4 个 KPI 卡。
      我们的对应能力分散在别处（图谱右键「影响推演」、右侧统计面板），没有聚合页。
- [ ] 底部「聚类」按钮 —— DS 有；我们暂用左侧类型过滤代替（`graph-view.tsx` 的
      `clusterMode` 已支持 off / byType / colorByType，只是没有 DS 那个按钮形态）。

## 2026-09-15 实测补充（Playwright 截图 + DOM dump）

抓取方式：`node scripts/capture-ds-workbench.mjs`（截图落在 `screenshots/ds-workbench/`）。
该脚本已处理 DS 的两个坑：登录页要 **前端 MD5** 后的密码，且 headless 必须隐藏
`navigator.webdriver`、使用真实 UA，否则 `/api/auth/login` 返回 `ACCESS_DENIED`。

以 DS 的 `ecommerce` 域为基准实测：

- **对象类型 16 个，每个 8–15 个属性**：Product 15、Review 14、Order 14、Customer 14、
  Coupon 13、SKU 12、Promotion 12、Address 12、OrderItem 11、Category 10、Refund 10、
  Warehouse 10、Inventory 10、Payment 9、Brand 8、Shipment 8。
  → 对照：修好之前我们的对象类型 **属性全为 0**（SAA 域 6/6 空壳），这是「连 UML 都不如」的来源。
- **实例规模**：19 个节点 / 22 条关系 / 18 个关系类型 / 0 跨域关系。
- **表格视图**：默认列 `NAME | NODETYPE | LIFECYCLESTATE`，顶部显示「共 N 条记录」；
  按左侧选中的对象类型过滤。右侧「域概览 → 对象类型」对每个类型显示「**N 属性**」。
- **模型视图**：标题「SCHEMA 结构规范 / 16 类型」；左树分 NodeTypes(16) / RelationTypes(18)，
  提示「点击或右键左侧 Schema 项查看与编辑规范；右键包含：添加属性、定义 Action 动作、
  AI 自动补全字段等功能」。
- **对话视图**：标题「AI 对话式精准 Schema 编辑 / Foundry AI Copilot Engine」；顶栏有
  **治理审批开关**、**快照历史**、**目标选择器**（`全局（AI 自动定位）`）、「隐藏 Schema 对比」；
  内置 3 条示例指令；右侧「Schema 模型实时 Diff 预览」逐属性列出 `name: type`
  （如 `productId: string`、`status: enum`）。
- **沙盘视图**：4 张演练卡（业务事件风暴 / 动作与影响演练 / AI Agent 决策竞技场 /
  实体遥测与全网监控）+ 「沙箱实时运行日志（● LIVE）」+ 4 个 KPI 卡
  （实体节点覆盖度 19/16、拓扑关联连通度 22 条、已注册业务动作集 7 个、实体运行态健康度 100.0%）。
- **顶栏**：`本体工坊 | 域选择器 v1.0.0 | 图谱 表格 模型 对话 沙盘 | 实时已连接 | 保存 | 应用▾`。

### 属性这份差距的根因（已修）

我们的对象类型属性为空**不是渲染问题**，而是写入链路断了：插件有两套写入面，
`usePluginAction()` 只走 `ctx.actions.register`，但 13 个 UI 调用的 action key
（含 `update-node-type` / `delete-node-type` / `run-transform` / `extract-document` 等）
只注册在 `manifest.apiRoutes` 的 `onApiRequest` 面上；且 `create-node-type` 会静默丢弃
`propertiesSchema`。现已改为两面共用同一份 handler，并加了
`tests/action-parity.spec.ts` 做「UI key ↔ worker 注册」一致性防线。

## 2026-09-16 逐项点击实测（Playwright 真点，不是 dump）

截图存档：`screenshots/ds-explore/`（工作台各视图 + 12 个页面）。
**该目录只在本机, 已 gitignore** —— 截图是观察记录不是源码, 界面一变就失真, 所以不入库。
本笔记的每条结论都写明了观测方式, 需要复核时按同样步骤重拍即可。
方法：**菜单/对话框只有点开才存在**。第一轮只 dump DOM 就漏掉了右键菜单和弹窗，
这一轮每个探测都执行真实点击并只记录「点击后新出现的文本」。

### 工作台五视图

**图谱**
- 工具栏：`层级`（布局，无文本变化）、`聚类`（同）、`关系过滤`（下拉，含「全不选」+ 关系类型复选）、
  `新增节点`、`连线编辑`（切为「连线模式中」）、`模拟演练`（下拉 4 项：🔥模拟高并发下单 /
  ⚠️模拟库存异常告警 / 👑模拟VIP权益升级 / 🤖模拟AI巡检派发）。
- **`新增节点` 是按 schema 动态渲染的表单**（最值得抄的一点）：节点名称* / 节点类型*，
  然后按所选类型的 schema 渲染「必需属性」，每个字段带中文说明；**引用型字段带实例选择器**
  （`-- 选择已有的【Product】实体节点 --` → `🔗 [Product] iPhone 15 Pro Max 智能手机商品 (ecom_prod_01)`）；
  `展开可选属性 (10)`；另有「AI 一键生成样例」。— 我们目前只是 `window.prompt` 输一个 label。
- 节点右键：**菜单上方内联展示该节点属性值**（reviewId: REV-8801 / score / content / reviewer）+
  查看详情 / 触发动作 / 影响推演 / 新建连线 / 编辑节点 / 删除节点。
- 连线右键：查看关系 / 删除连线（并显示两端 key）。
- 左栏对象类型右键：Schema Spec / 添加属性 / 定义动作 / 智能补全 / 建立关系 / 移除类型。

**表格**：数据行右键 → 查看详情 / 编辑属性 / 复制数据 / 删除记录。

**模型**：左 Schema 树（NodeTypes / RelationTypes）；NodeType 左键选中后右侧出详情；
NodeType 右键 → 同上的 5 项菜单。

**对话**：`隐藏 Schema 对比` ⇄ `显示 Schema 对比`；
**`全局（AI 自动定位）` 是目标选择器**，展开后可选「域元数据」或聚焦到某个
`NodeType: X` / `RelationType: Y` —— 我们完全没有这个「把 AI 注意力聚焦到某个类型」的能力。

**沙盘**：4 张卡**真跑**并写实时日志。契约穿透报「⚡【属性穿透】校验完成…100% 通过」的**同时**
也抛出 `[DOMAIN_NOT_FOUND] 节点不存在: 6aa01d5090e250122f784505`（一半是坏的）；
巡检报「全域 19 个实体与 22 条拓扑连线运行正常」。

### Palantir 系页面（12 个，均已访问截图）

| 路由 | 页面 | 关键内容 |
|---|---|---|
| `ontology/domains` | 本体管理 | 17 个本体域；聚合统计（对象类型 170 / 实体节点 170 / 拓扑关系 199）；来源筛选（全部来源/蓝图克隆/自主创建/官方预置）；列设置；表格含行业大类、来源类型、各类计数、状态、操作 |
| `ontology/app/ecommerce` | 业务应用门户 | 4 KPI + **5 个页签：大屏 / 数据 / 拓扑 / 动作 / 助手** + 派驻/复制/样例；对象类型卡片标「属性: 15 项」「深入数据工坊」 |
| `ontology/market` | 知识蓝图库 | 0 个蓝图（空态，未做） |
| `ontology/bootstrap` | 对话式本体建设 | 对话面板 + 实时 Schema 预览 |
| `ontology/:d/pipeline` | 数据管道 | Source → Transform → Sink（空态） |
| `ontology/:d/eval` | AIP 评估仪表盘 | 评估次数 / 平均分 / A-B 测试 / Golden 数据集 / 趋势 / 模型排行 |
| `ontology/:d/agents` | 员工编制 | 总编制 / 在岗 / 离线 / 负荷 + 派驻 |
| `ontology/:d/simulation` | 仿真推演 | **空白页（0 文本，疑似坏了）** |
| `ontology/:d/designer` | 本体编织器 | 左侧能力类型（框架/语言/工具/模式/基础设施）拖到画布建节点 + 整理 / 保存图谱 |
| `ontology/:d/app-builder` | 应用构建器 | 生成代码 / CRUD 页面，按对象类型生成 |
| `ontology/:d/chat-edit` | 对话式编辑（独立页） | **治理审批: 关闭 / 版本历史 (0) / 隐藏预览 / 全局（AI 自动定位）** + 5 条示例指令 + 逐字段 Schema 预览 |
| `admin/evolution-studio` | 演进中心 | 需求描述 / 本体设计 / 快捷模板（CRUD管理、审批流、文件上传、统计报表）+ AI 扩写 / 直接分析 |

### 我们仍缺的能力（按性价比排序）

1. **图谱「新增节点」的 schema 驱动表单**（含引用型字段的实例选择器）—— 我们现在只有 prompt 输 label。
2. **节点右键内联显示属性值**。
3. **对话的目标选择器**（把 AI 聚焦到某个 NodeType / RelationType）。
4. 图谱「模拟演练」的语义化场景（我们只有一个「下游可达」）。
5. 沙盘视图；业务应用门户（5 页签）；本体编织器；应用构建器；评估看板 / 员工编制 / 数据管道。
6. 本体管理页的聚合统计与来源筛选。

**注意不要照抄的**：沙盘「契约穿透」自己会抛 DOMAIN_NOT_FOUND；`simulation` 是空白页；
`market` 是空态；`SchemaTypeContextMenu` 的回调全部未接（详见上节）。



- 插件 UI 构建：`node esbuild.config.mjs`（在本目录）。产物 `dist/ui/index.js`。
- 宿主前端构建：`ui/` 目录 `npx vite build`。
  - **坑**：`ui/dist/sw.js` 的 `__PAPERCLIP_BUILD_ID__` 占位符会被构建替换，
    重复构建前需要 `cp ui/public/sw.js ui/dist/sw.js` 还原，否则构建报
    "service worker is missing the __PAPERCLIP_BUILD_ID__ placeholder"。
    （已在 `ui/src/lib/vite-sw-build-id.ts` 加幂等判断缓解。）
- 宿主如何加载插件 UI：`ui/src/plugins/slots.tsx`
  - 插件 bundle 用 `data:` URI 动态 import（不是 blob:，避免 null-origin 跨模块 import 限制）。
  - 通过 `new Function("u","return import(u)")` 绕过 Vite 的 modulepreload 包装
    （Vite 会对 `import(expr)` 调 `new URL(spec, import.meta.url)`，对 data:/blob: 抛错）。
  - `rewriteBareSpecifiers` 把 `react`/`react-dom`/`react/jsx-runtime`/`@paperclipai/plugin-sdk/ui`
    的裸导入改写成宿主 bridge 提供的 shim data: URI；并把 esbuild CJS 产物里的
    `__require("react")` 运行时调用替换为 bridge 的 react 对象
    （否则 use-sync-external-store 等 CJS 依赖会抛 "Dynamic require of react is not supported"）。
