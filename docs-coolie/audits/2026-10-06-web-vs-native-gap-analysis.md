# web 端 ontology plugin vs 原生 App v0.6.43 差距审计 (wave346)

日期: 2026-10-06 · 执行: 铁匠 (forge-core-swe) · 基线 commit: `a737221ff` (release v0.6.43)

老板问题: 「列 web 端 ontology plugin 还有什么原生缺」。

## 0. 一句话结论

**原生 v0.6.43 缺的不是"实现"而是"接线"—— wave342 写好的 12 个只读视图 + 14 视图三级选择器 + SVG 图谱 + Schema 编辑器全部在仓库里零引用（孤儿代码）；真正从零缺失的只有两层：全部写操作（域管理 / 类型 CRUD / 数据管道 / 认知·能力闭环）和 AI 副手（ask-aide 流式对话/编辑/快照）。**

## 1. 关键事实（比差距表更重要的发现）

**v0.6.43 发布说明与实际 APK 不符。** 时间线（git log 可证）：

| commit | 内容 |
|---|---|
| `3f2650751` (wave342) | OntologyDomainListScreen 升级为 5 组(总览/结构/数据/资产/运维) × 14 视图三级选择器 + 新增 `components/ontology/` 12 只读视图 + coolie.ts 10 个只读 list GET |
| `5691d8eb6` (v0.6.43 发版前) | 同一 Screen 砍掉 884 行，回退为 wave344 极简版（只读域列表 + 快照详情 + 新建 + 熔断），**但 12 个视图组件、SVG 图谱、coolie.ts 10 个 GET 全部留在盘上** |
| `a737221ff` (v0.6.43 release) | 发布说明仍写「wave342 原生本体工作台 5 视图组 14 视图」—— 实际 APK 里 14 视图一个都不可达 |

当前 HEAD 孤儿代码清单（grep 全仓零 import 引用）：

| 孤儿文件 | 来源 | 行数 | 状态 |
|---|---|---|---|
| `clients/expo/src/components/ontology/*View.tsx` (12 个) + `shared.tsx` | wave342 | 33–149/个 | 零引用 |
| `clients/expo/src/components/OntologyGraphView.tsx` (SVG 同心圆图谱) | wave325 | ~300 | 零引用（wave344 删了图谱入口） |
| `clients/expo/src/screens/OntologySchemaEditorScreen.tsx` (全功能属性编辑器) | wave239 | — | 仍挂在 App.tsx:1255，但唯一入口 `onOpenSchemaEditor` 在现版 Screen 中已不解构使用 → **不可达死路** |
| `coolie.ts` 10 个 `listOntology*` 包装 (754–845 行) | wave342 | — | 仅被孤儿视图调用 → 连带死代码 |

副作用：`OrgAssetsScreen.tsx:159` 与 `App.tsx:1362` 传给 Screen 的 `onOpenWebOntology / onOpenSchemaEditor / onOpenWorkbench` 三个 props 全部无人消费。

## 2. 对照范围

- **web**: `packages/plugins/plugin-ontology/src/ui/app.tsx`（5280 行工作台，`WorkbenchView` 15 枚举 = 4 主视图 + 数据流 3 + 资产 6 + 运维 2），辅助 Tab 文件 SandboxTab/ChatTab/DatasetsTab/ConnectorsTab/TransformsTab/graph-view/workbench/TopStatusBar/BootstrapPanel/SnapshotDrawer/LegacyImportWizardModal。另注：web 还有独立非插件页 `ui/src/pages/OntologyGraphPage.tsx`（wave154/155 对象图谱 3 预设），原生 wave337 曾对齐其 API，wave344 后入口也没了。
- **原生**: `clients/expo/src/screens/OntologyDomainListScreen.tsx`（wave344 极简版，实际挂载于 资产>本体）+ 上述孤儿组件。取数面: `clients/expo/src/coolie.ts`。

## 3. 主表：15 个 web view × 原生 v0.6.43

图例: ✅ 可用 · 🔶 组件在仓但孤儿（不可达） · ❌ 无

| view | web 实现 (ctx.data / ctx.actions / UI) | 原生 v0.6.43 实现 | 差距 | 缺什么 |
|---|---|---|---|---|
| **domains** 本体域列表 | `list-domains`+`domain-project-links`+`company-projects`; `create-domain`/`update-domain`/`transition-domain`/`delete-domain`/`link-resource`/`unlink-resource`/`seed-sample-domains`; 列表·卡片双模式、分类徽章、全量详情 modal、生命周期推进按钮、4 步旧系统接入向导、文件夹目录扫描建域 | ✅ 极简版: `listOntologyDomains`+`getOntologySnapshot`(前 5 域预取/详情抽样); `createOntologyDomain`(三字段 modal)、`seedSampleDomains`+`seedDomainSamples`、`setDomainLifecycle`(熔断/解锁) | 中 | 重命名、draft→active→deprecated→archived 完整生命周期迁移（原生只有 lock/unlock）、注销、关联/解除项目、接入向导(`extract-document`等)、目录扫描建域 |
| **graph** 图谱 | `domain-detail`(nodes/edges/nodeTypes/relationTypes/services)+`list-views`; `create/update/delete-node`、`create/update/delete-edge`、`ai-extend-from-node`、`create-view`; ReactFlow 画布 + 左类型树(拖拽建节点/右键 9 项菜单) + 节点检查器 + 影响推演(BFS 上下游) + 9 项统计面板 | 🔶 wave325 SVG 同心圆图谱组件在仓零引用；挂载的只有快照详情里的节点/边**抽样列表**（非图） | 大 | 交互图谱整体接线（组件已有）；类型树、右键菜单、节点/边 CRUD、影响推演、AI 扩展、保存视图全部无 |
| **table** 表格 | GraphView table 模式: 域内实例表格 | 🔶 `TableView` 在仓零引用（且走 `listOntologyInstances` 控制面 9 类实体，与 web 的域内节点表不同源） | 大 | 接线 + 数据源语义对齐 |
| **schema** 结构 | GraphView schema 模式: 属性 schema 行编辑(rows↔JSON)、`ai-suggest-fields` 智能补全、`ai-edit-schema` 对话式编辑、`enrich-property-descriptions`、node/relation-type CRUD | 🔶 `SchemaView` 只读清单在仓零引用；⚠️ 全功能 `OntologySchemaEditorScreen` 也在仓但入口死路 | 大 | 接线 + 复活 SchemaEditor 入口即可点亮编辑层（本地已有 GET/PATCH types/:id/properties 通道） |
| **sandbox** 驾驶舱 | `describe-domain`+`aide-history`+`aide-snapshots`; `ask-aide`(**流式 usePluginStream**)、`aide-abort`/`aide-clear-session`/`aide-create-snapshot`/`aide-restore-snapshot`、对话·编辑双模式(LLM JSON→editOps)、`ai-bootstrap-plan`/`abort` 空域 AI 初始化、`architecture-diagram` 导出 | 🔶 `SandboxView` 只读仪表(计数+类型分布+抽样)在仓零引用 | 极大 | AI 副手整体: 流式对话、编辑模式、快照、AI 初始化、架构图导出——原生 0% |
| **datasets** 数据集 | `list-datasets`; `create-dataset`(name/format 4 种) | 🔶 `DatasetsView` 只读清单在仓零引用 | 中 | 接线 + 新建动作 |
| **connectors** 连接器 | `list-connectors`+`list-datasets`; `create-connector`(type 5 种) | 🔶 `ConnectorsView` 只读清单在仓零引用 | 中 | 接线 + 新建动作 |
| **transforms** 转换 | `list-transforms`+`list-datasets`; `create-transform`(sql/python)、`run-transform` | 🔶 `TransformsView` 只读清单在仓零引用 | 中 | 接线 + 新建 + **run 执行**动作 |
| **cognition** 认知 | `list-cognition-jobs`+`cognition-job`(draft); `create-cognition-job`、`ingest-cognition-files`(粘贴代码提取)、`publish-cognition-job`(发布到域) | 🔶 `CognitionView` 只读任务清单在仓零引用 | 大 | 接线 + 建/提取/发布三动作（闭环后半段全无） |
| **capabilities** 能力 | `list-capability-gaps`+`capability-resolutions`; `create-capability-gap`、`acquire-capability`(name/license/source) | 🔶 `CapabilitiesView` 只读缺口清单在仓零引用 | 大 | 接线 + 建/触发获取动作 + 解决轨迹读 |
| **actions** 动作 | `list-action-types`+`list-node-types`; `create-action-type`(kind 7 种/适用类型)、`delete-action-type`; 图谱右键「动作」预填 | 🔶 `ActionsView` 只读清单在仓零引用 | 中 | 接线 + 建/删动作 |
| **functions** 函数 | `list-functions`; `create-function`(query/action/webhook+version)、`delete-function` | 🔶 `FunctionsView` 只读清单在仓零引用 | 中 | 接线 + 建/删函数 |
| **interfaces** 接口 | `list-interfaces`; `create-interface`、`delete-interface` | 🔶 `InterfacesView` 只读清单在仓零引用 | 中 | 接线 + 建/删接口 |
| **dialogue** 对话 | `ChatTab` = PlaceholderTab 占位（等 ontology.dialogue 事件流） | 故意不搬（wave342 定调: App 工坊 tab 已承载会话流，防重复入口） | 无 | 无（by design，且 web 自己也是占位） |
| **manage** 治理 | `domain-evaluation`+`domain-pipeline`+`describe-domain`+`list-sub-projects`; `create-eval`、`create-simulation-scenario`、`create-dataset/connector/transform`、`architecture-diagram`; 评估/模拟仪表 + 管道三表 + 治理概览(业务系统+服务清单 L0-L4 分层) | 🔶 `ManageView` 在仓零引用——**且内容不同源**: 用 `getOntologyGraphStats`+`listOntologyResourceLinks`(图谱统计+挂链)，不含 web 的评估/模拟/管道/业务系统 | 大 | 接线 + 补齐同源数据（domain-evaluation/domain-pipeline/describe-domain/list-sub-projects） |

**主表 15 行**。跨视图补充（web 有、原生无）:

| 面 | web | 原生 |
|---|---|---|
| 顶栏快照 | TopStatusBar `snapshot-domain` 一键快照 | 无 |
| 右统计面板 | 域概览 + 9 StatCard + NodeInspector + BootstrapPanel + 新建域表单 | 无（快照详情承担了只读部分） |
| 旧系统接入 | 4 步向导 (`extract-document`/`create-business-system`/`import-architecture`) | 无 |
| 反向差距: **一键熔断** | web 无（只有 transition-domain 归档） | ✅ 原生独有 EmergencyKillSwitch（滑脱 50ms 锁死 + actor/reason/deviceInfo 审计）—— web 端反而缺 |

## 4. 缺的 API（原生 coolie.ts / api-client 无对应方法）

原生现有 ontology 面: 读 `listOntologyDomains` / `getOntologySnapshot` / `getOntologyGraph` / `getOntologyPaths` / `getOntologyGraphStats` / `listOntologyInstances` / `listOntologyResourceLinks`（+ 10 个孤儿 `listOntology*` 包装）；写仅 4 个: `createOntologyDomain` / `seedSampleDomains` / `seedDomainSamples` / `setDomainLifecycle`。

**缺读（7）**: `domain-detail`（域详情聚合: 类型+图+服务一次拉）、`list-views`、`describe-domain`、`aide-history`、`aide-snapshots`、`domain-evaluation`、`capability-resolutions`、`cognition-job`（单任务 draft）
**缺写（38）**: `update-domain` / `transition-domain`(完整迁移) / `delete-domain` / `link-resource` / `unlink-resource` / `create·update·delete-node-type`(3) / `create·update·delete-relation-type`(3) / `create·update·delete-node`(3) / `create·update·delete-edge`(3) / `create·delete-action-type`(2) / `create·delete-function`(2) / `create·delete-interface`(2) / `create-dataset` / `create-connector` / `create-transform` / `run-transform` / `create-cognition-job` / `ingest-cognition-files` / `publish-cognition-job` / `create-capability-gap` / `acquire-capability` / `create-eval` / `create-simulation-scenario` / `ai-suggest-fields` / `ai-edit-schema` / `ai-extend-from-node` / `enrich-property-descriptions` / `ai-bootstrap-plan` / `ai-bootstrap-abort` / `ask-aide` / `aide-abort` / `aide-clear-session` / `aide-create-snapshot` / `aide-restore-snapshot` / `snapshot-domain` / `architecture-diagram` / `extract-document` / `create-view`
**缺流（1 类）**: `usePluginStream`（ask-aide token 流式）—— 原生 HTTP 面无流式通道等价物

## 5. 建议优先级（供 Hermes 派单参考，非本波实施）

1. **P0 接线（零新代码）**: 恢复一个合规入口把 12 个只读视图挂回去（wave344 反的 5 大反模式别复辟——入口收敛为一级即可），同时复活 `OntologySchemaEditorScreen` 入口。一次发版点亮 13 view 只读层。
2. **P1 补读 API**: `domain-detail` 聚合 1 个端点即可替换 4 个分散孤儿 GET 的拼装。
3. **P2 写操作**: 按老板「极简两字」哲学，移动端只补高频写: 域重命名 + 生命周期推进 + 类型建/删（走既有插件 action HTTP 面，原生已有 `pluginAction` 通道模式可复用）。
4. **P3 AI 副手**: ask-aide 流式是驾驶舱灵魂，但需要原生流式通道（SSE/轮询），工程量大，建议单独立项。
5. **顺手**: v0.6.43 发布说明与实物不符已既成事实，建议在 v0.6.44 说明中澄清「14 视图组件已入库待接线」，避免外部误读。

---
*验证: 全部结论来自 HEAD `a737221ff` 工作区源码 + git log/show；grep 引用清零均以 `clients/expo/src` + `App.tsx` 全仓扫描为准。本波只新增本文档，未动 server/ scripts/ 工具池配置。*
