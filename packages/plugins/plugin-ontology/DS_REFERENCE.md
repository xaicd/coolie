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

- [ ] 顶部「实时已连接 / 保存 / 应用▾」状态区（DS 有，我们暂无）。
- [ ] 「对话」「沙盘」视图（DS 有，我们用 认知/能力 替代）。
- [ ] 对象类型显示「N 属性」计数（需后端补 nodeType 的属性 schema）。
- [ ] 跨域关系统计（我们目前只统计域内）。
- [ ] 节点属性面板编辑（DS 点节点可编辑属性；我们的 NodeInspector 目前只读+改名/删）。
- [ ] 底部「聚类」按钮（DS 有，我们暂用类型过滤代替）。

## 构建 / 验证要点

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
