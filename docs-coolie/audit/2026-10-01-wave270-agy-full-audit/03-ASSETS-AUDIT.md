# wave270 全量审计 03 — 资产页 (OrgAssetsScreen) 5 域架构与一致性

> **作者:** wave270 全量审计员 3/4 (只读, 不改代码)
> **日期:** 2026-10-01
> **触发:** 老板 "感觉这两天改的内容各种问题, 各种不合理"
> **范围:** Coolie App `OrgAssetsScreen.tsx` 及其 4 个子屏 + 数字员工/业务本体/项目/产物 5 域入口一致性
> **不动任何代码; 只描述现象, 提改进建议**

---

## 0. 一句话

资产页 (OrgAssetsScreen) 不是 5 域, 是 **4 域** (业务本体 / 项目中心 / 数字员工 / 交付产物);
老板要的"5 域"被切到 5 个 `L1-domains` chip (业务 / 项目 / 员工 / 资产 / 模板) 里 — 跟 segmented control 的 4 tab 完全不对齐,
"资产 / 模板"两个 chip 在资产页里没有对应子屏, 但又同时在业务本体 L1 chip 里冒出来.
老板派过的 wave256 (数字员工卡) / wave258 (派活精准 chip) / wave261 (业务本体 5 层下钻) 都是 **单点 UI 升级**, 没做全局一致性审计.

---

## 1. 5 域架构图 (实测, 跟老板描述差 1 域)

```
[TabBar 资产 tab] (TabBar.tsx:27)
  └── OrgAssetsScreen (OrgAssetsScreen.tsx, 538 行)
        ├── 顶部 4 个 chip pill: 例行计划 / 成本核算 / 派活精准 / 更多
        ├── 顶部标题 "资产与组织" + 副标题 "公司名"
        └── [SegmentedControl 4 tab] (OrgAssetsScreen.tsx:204)
              │
              ├── 业务本体 tab → OntologyDomainListScreen.tsx (1317 行, wave261 改)
              │       └── [L1-domains 5 个 chip] 业务 / 项目 / 员工 / 资产 / 模板
              │             └── 点 chip → [L2-types] → [L3-instances] → [L4-properties]
              │
              ├── 项目中心 tab → ProjectsScreen.tsx (1048 行, wave153/200/140)
              │       └── 项目卡 / 状态 chips / 创建项目 FAB / CMMI 六宫格
              │
              ├── 数字员工 tab → AgentsScreen.tsx (660 行, wave256)
              │       └── AssetsAgentCard + AgentDetailSheet 浮层
              │
              └── 交付产物 tab → ArtifactsScreen.tsx (1323 行, wave141/153)
                      └── 卡片流 + 5 种筛选 tabs
```

**核心矛盾:** 老板脑里"5 域" = 业务 / 资产 / 项目 / 员工 / 模板 — 代码里却是 4 个 segmented tab, 而"资产 / 模板"两个域完全消失, **但 OntologyDomainListScreen L1 chip 又冒出 5 个 bucket** (`OntologyDomainListScreen.tsx:97-105` 包含业务/项目/员工/资产/模板/uncategorized).

---

## 2. 4 域各域深挖

### 2.1 业务本体 (OntologyDomainListScreen, 1317 行)

- **入口 (从哪进)**
  - 资产 tab 默认页 (App.tsx:1324-1368)
  - 任务页顶部图标行的「本体」入口 (TabBar.tsx 注释 67 行)
  - 业务本体 L1 chip 长按 Alert → "实例图谱 / 编辑字段" (`OntologyDomainListScreen.tsx:518-543`)
- **子路由**
  - L0 公司 → L1 域 (5 chip) → L2 类型 (FlatList 全显示) → L3 实例 (≤200) → L4 属性 (ScrollView)
  - 屏 2 InstanceGraph (App.tsx:1270, `onOpenInstanceGraph`)
  - 屏 3 SchemaEditor (App.tsx:1262, `onOpenSchemaEditor`)
  - 屏 4 Workbench (App.tsx:1280, 5 视图预设)
  - Web 端 `/ontology` 容器 (App.tsx:1343-1345)
- **关键操作**
  - L1 chip 长按 → 紧急熔断 (wave244 kill switch) (`OntologyDomainListScreen.tsx:246-264`)
  - L1 头部「新建」按钮 → 新域 modal (文件夹 / 手动双模) (`OntologyDomainListScreen.tsx:896`)
  - L3 实例下钻 → L4 属性 (`drillToInstance`, 234-240 行)
- **跟其它域的交叉**
  - 项目 → 业务: `work_product` / `attachment` 实体类型在 "资产" chip (`OntologyDomainListScreen.tsx:783`), 跟 ArtifactsScreen 直接相关
  - 员工 → 业务: `agent` 实体类型 (`OntologyDomainListScreen.tsx:782`), 跟 AgentsScreen 直接相关
  - **但是**: 这是"实体分类", 不是"导航入口"; 用户在项目中心看项目卡, 没法直接跳到该项目的业务本体 `project` 实体
  - **缺失**: 项目 → 业务本体 `project` 实体 跨域导航 (P2)

### 2.2 项目中心 (ProjectsScreen, 1048 行)

- **入口**
  - 资产 tab 第二个 segmented 选项
  - 任务页顶部"项目"图标行 (从 OrgAssetsScreen 间接)
  - **DashboardScreen "项目" 卡 (DashboardScreen.tsx:65 注释提到 "目的地全部有更短路径 (底栏 Tab / Tab5 资产段 / 任务页)")** — 三重入口
- **子路由**
  - 项目卡展开面板 (本地 state, 不是真路由) (`ProjectsScreen.tsx:259-583`)
  - 6 宫格 CMMI 门禁 → 跳 Web 容器 `/projects/<id>/rtm` `/baseline` `/spc` `/living-topology` (`ProjectsScreen.tsx:455-530`)
  - 「项目控制台」 → Web `/projects/<id>` (`ProjectsScreen.tsx:540-549`)
  - 「查看任务」 → 任务 tab (走 `onOpenProjectTasks`)
  - 「创建任务」 → CreateTaskModal 弹窗 (走 `onCreateTaskForProject`, `App.tsx:1337`)
  - 「查看产物」 → 切到 Artifacts tab + 项目筛选 (`OrgAssetsScreen.tsx:230-233`)
- **关键操作**
  - 状态 chips 筛选 (全部/进行中/计划中/已暂停/已完成) (`ProjectsScreen.tsx:24-32`)
  - 「极速立项」FAB → CreateProjectSheet 弹窗 (1151 行, 双通道立项 wave156)
  - 展开项目卡 → 6 宫格 G1~G5 + SPC 稳定性 (`ProjectsScreen.tsx:454-530`)
- **跟其它域的交叉**
  - 项目 → 任务 (查任务/建任务) — 跨域 OK
  - 项目 → 产物 (查看产物) — 跨域 OK, 但切 tab 时筛选态保留靠 `artifactsProjectId` (`OrgAssetsScreen.tsx:107-109`)
  - 项目 → 业务本体 (`project` 实体) — **缺失**, 必须走 Web 容器
  - 项目 → 数字员工 (项目负责人/任务分配) — **缺失**, 必须走任务 tab

### 2.3 数字员工 (AgentsScreen, 660 行)

- **入口**
  - 资产 tab 第 3 个 segmented 选项 (OrgAssetsScreen.tsx:238-243)
  - SearchScreen 搜员工 (走 `onOpenAgent` → AgentDetailScreen, App.tsx:1182-1185)
  - 任务详情 "分配智能体" chip (TaskDetailScreen.tsx:262-270) → AgentPickerSheet (TaskDetailScreen.tsx:456)
  - 创建任务弹窗 "指派" 下拉 (CreateTaskModal.tsx:415) → AgentPickerSheet
  - **派活精准 chip (SkillMatcherSheet)** — OrgAssetsScreen.tsx:183-192
- **子路由**
  - AssetsAgentCard 整卡 → AgentDetailSheet (AgentsScreen.tsx:493-499) (浮层,不是路由)
  - 派活精准 chip → SkillMatcherSheet (OrgAssetsScreen.tsx:267-271)
- **关键操作**
  - 列表头 chips 筛选 (全部 / 在线 / 异常) (`AgentsScreen.tsx:442-451`)
  - 卡点 → AgentDetailSheet (660 字节)
  - 详情页 启用/暂停 → `coolie.updateAgent` (`AgentsScreen.tsx:138-152`)
- **跟其它域的交叉**
  - 员工 → 任务 (AgentDetailSheet 底部"最近指派任务"列表, 点跳 `onOpenIssue`) (`AgentsScreen.tsx:303-307`)
  - 员工 → 产物 (按 Agent 筛选产物, ArtifactsScreen 行 477-521)
  - **冲突**: AgentDetailSheet "最近指派任务" 与 ProjectsScreen 项目卡 "任务计数" 同源不同步, taskCount 用 wave256 的 listIssues 200 限 (`AgentsScreen.tsx:383`), 项目卡用 project.taskCount (`ProjectsScreen.tsx:387`), 两者口径不一致

### 2.4 交付产物 (ArtifactsScreen, 1323 行)

- **入口**
  - 资产 tab 第 4 个 segmented 选项 (OrgAssetsScreen.tsx:245-253)
  - 项目卡 "查看产物" → 切到产物 tab 并筛项目 (`OrgAssetsScreen.tsx:230-233`)
  - 任务详情 "查看原型" → 沙箱 (`TaskDetailScreen.tsx:1041-1062`)
- **子路由**
  - 卡片 → 预览弹窗 (`previewArtifact`) (ArtifactsScreen.tsx:343-386)
  - 版本 → ArtifactVersionSheet (ArtifactsScreen.tsx:188)
  - 外部打开 → ExternalOpenSheet (`openInExternalApp`)
- **关键操作**
  - 顶部 SegmentedControl 5 tabs (全部 / 5+2黄金文档 / 文档 / 图片 / 代码原型) (`ArtifactsScreen.tsx:71-77`)
  - 项目 chip 筛选 + 清除 (`ArtifactsScreen.tsx:455-474`)
  - 按员工 chip 筛选 (从产物反推 distinct agents) (`ArtifactsScreen.tsx:265-276, 499-519`)
  - 搜索 (ArtifactsScreen.tsx:424-440)
- **跟其它域的交叉**
  - 产物 → 项目 (`selectedProjectId` 反向项目定位) — OK
  - 产物 → 员工 (`selectedAgentId` 反向员工定位) — OK
  - 产物 → 沙箱/Diff (`onOpenSandbox`, `onOpenDiff`, ArtifactsScreen.tsx:343-386) — OK
  - **缺失**: 产物 → 任务详情 (`artifact.issue` 字段已有, `ArtifactsScreen.tsx:60`, 但 UI 没暴露"查看所属任务"按钮)

---

## 3. 数字员工 card 全链路

### 3.1 5 个入口的真相 (跟老板假设不完全一样)

老板的"5 个入口"假设实际有 4 处, 派活精准那个 chip 跟前 4 处职能不同:

| 入口 | 文件:行 | 触发 | 实际能做什么 |
|---|---|---|---|
| 1. 资产 tab 数字员工 | OrgAssetsScreen.tsx:238-243 → AgentsScreen | segmented tab 切换 | 浏览全部员工 + 详情 + 启停 |
| 2. SearchScreen 搜员工 | App.tsx:1182-1185 → AgentDetailScreen | 全局搜索 | 跳到员工详情 |
| 3. 任务详情 "改派" | TaskDetailScreen.tsx:262-270 → AgentPickerSheet | 点分配智能体 chip | 列出全部员工单选,触发 PATCH |
| 4. 创建任务 "指派" | CreateTaskModal.tsx:415 → AgentPickerSheet | 新建任务指派下拉 | 列出全部员工单选 (首项"自动派发") |
| 5. 派活精准 | OrgAssetsScreen.tsx:183-192 → SkillMatcherSheet | 顶部 chip | **只能复制到剪贴板**, 不能真派活 |

**真派活的唯一路径: 入口 3/4 → AgentPickerSheet** (`AgentPickerSheet.tsx:32-130`)。其余入口只能看不能派活。

### 3.2 card 内容一致性

AssetsAgentCard (`AssetsAgentCard.tsx`) 显示字段:
- 角色徽章 (5 CMMI 角色: FDA 红 / Core SWE 蓝 / PRE-SRE 绿 / FDSE 紫 / DS 橙 + 通用灰兜底) — `AssetsAgentCard.tsx:52-58`
- 大字真名 (2 行 max) — `AssetsAgentCard.tsx:112`
- 头像 (1 字首字母) — `AssetsAgentCard.tsx:119-123`
- 1 行职责 (responsibilities[0] or "通用执行") — `AssetsAgentCard.tsx:91, 126`
- 状态 (idle / 在派 / 在线 / 异常 等) — `AssetsAgentCard.tsx:22-30`
- 已完成任务数 (taskCount) — `AssetsAgentCard.tsx:135-137`
- skill chip 行 (4-8 个中文 2 字, 末尾 +N 折叠, wave258) — `AssetsAgentCard.tsx:143-158`
- tool chip 行 (1-3 个英文 cli, monospace, wave258) — `AssetsAgentCard.tsx:161-172`

AgentDetailSheet (详情浮层) 显示字段:
- 头像 + 真名 + 角色徽章 + 状态 + 适配器 (`AgentsScreen.tsx:162-182`)
- Token 用量 4 stat (输入/缓存/输出/计费) — `AgentsScreen.tsx:184-198`
- 职责 chip 行 (全部) — `AgentsScreen.tsx:211-222`
- 配置: 适配器 / 心跳状态 / 技能清单 (skillNames 合并 skills + desiredSkills + entries) — `AgentsScreen.tsx:230-263`
- 工具 chip 行 (英文 cli) — `AgentsScreen.tsx:265-277`
- 最近指派任务 5 条 — `AgentsScreen.tsx:280-320`
- 启停按钮 — `AgentsScreen.tsx:325-345`

**问题 P0-1**: AgentDetailSheet 的"技能清单"取自 `getAgentSkills` (`AgentsScreen.tsx:86`) 合并了 skills / desiredSkills / entries 三个源 (`AgentsScreen.tsx:124-136`), AssetsAgentCard 只取 `agent.skills` (`AssetsAgentCard.tsx:89`) — **同一员工的技能 chip 在 card 和详情里不一致** (e.g. 详情显示 "调研/画图", 卡片只显示 "调研").

**问题 P0-2**: card `responsibilities[0]` 取一行 (`AssetsAgentCard.tsx:91`), 详情取 `agent.responsibilities` 全部 (`AgentsScreen.tsx:215`), 卡片兜底"通用执行"跟详情空时直接不显示 — **不一致兜底**.

### 3.3 派活精准 chip 重复问题 (wave258)

`OrgAssetsScreen.tsx:183-192` 的 "派活精准" chip (🟡 闪电) 打开 `SkillMatcherSheet.tsx`, 该 sheet 只能:
- 输入中文 2 字技能 (用 / 分隔) (`SkillMatcherSheet.tsx:138-147`)
- 匹配算法本地 (跟 server `dispatch-skill-matcher.ts` 同算法, `SkillMatcherSheet.tsx:85-102`)
- 匹配成功 → 点员工 → **复制到剪贴板** ("派活给 <name> (matched: <skills>) 评分 N"), 关闭 (`SkillMatcherSheet.tsx:112-122`)
- **不做真派活**: "不动 Hermes chat 派活逻辑 — 老板说派活精准但没说要现在做端到端; 这次只做 UI 给 PM 用" (SkillMatcherSheet.tsx:14 注释)

**问题 P1-1**: 老板原话是 "方便后续派活精准", 但实际是 "精准预览 + 复制粘贴" — 不能直接派活。
真派活入口是 AgentPickerSheet (3 个入口), 用户从派活精准预览完, 还需:
- 复制 → 切到任务 tab → 点任务 → 改派 → 在 AgentPickerSheet 里找同一个员工 → 选

**重复 chip**:
- 资产 tab 员工域 (`AgentsScreen` 头部 chips 已能筛选全员)
- 派活精准 chip (`OrgAssetsScreen` 顶部)
- 创建任务/任务详情 AgentPickerSheet

这三个入口都在做"列员工"这件事, 但视觉/职能差异巨大 (列表 vs 匹配 vs 单选), 老板容易晕。

**问题 P1-2**: `OrgAssetsScreen.tsx:184-192` 派活精准 chip 跟同行的"例行计划" / "成本核算" chip 视觉一致 (3 个一样的 extraPill 样式), 但派活精准实际打开的是"匹配 sheet" 而非"Web 容器" — 用户预期是"快捷入口", 实际是"辅助决策工具", 放错了位置。

---

## 4. 业务本体 5 层下钻 (wave261) 实际结构

### 4.1 真分层 (vs PM 瞎做的 L0-L4)

`OntologyDomainListScreen.tsx` 的 5 层定义 (`OntologyDomainListScreen.tsx:45-68, 97-105`):

- **L0 公司** — breadcrumb 第一段, 永远显示 (`OntologyDomainListScreen.tsx:348-358`)
- **L1 域** — 5 chip: 业务 / 项目 / 员工 / 资产 / 模板 (server 端 `GET /levels` 返回 `domains`, `OntologyDomainListScreen.tsx:150-168`)
- **L2 类型** — server `byEntityType` 按 entityType 聚合 (`OntologyDomainListScreen.tsx:185-201`)
- **L3 实例** — server `GET /instances?entityType=...&limit=200` (`OntologyDomainListScreen.tsx:203-224`)
- **L4 属性** — server `/types/:typeId/properties` 拉 schema + 实例自身 metadata (`OntologyDomainListScreen.tsx:669-763`)

**真分层没问题**, 但 **5 个 chip 的内容映射有 bug**:

```ts
// OntologyDomainListScreen.tsx:779-786
const MAP: Record<string, string[]> = {
  业务: ["issue", "spec", "conversation", "comment"],
  项目: ["project"],
  员工: ["agent"],
  资产: ["work_product", "attachment"],
  模板: [],   // ← 模板域的 entityType 列表是空数组
};
```

**问题 P0-3**: 点 "模板" chip 进 L2-types 时 `allowed = []` → `filterEntityTypesForDomain` 返回 `allTypes` (789 行兜底, `if (allowed.length === 0) return allTypes;`), **模板 chip 实际上显示全部类型**, 跟"业务" chip 内容完全一样, 失去分类意义。

### 4.2 5 层入口的 UI 一致性

各层顶部结构 (`OntologyDomainListScreen.tsx:387-764`):

- L1 header: 标题 + 副标题 + 3 个 icon 按钮 (Web端/刷新/新建) (`391-432`)
- L2 header: `OntologyDrillBreadcrumb` (面包屑, 标题 + 描述卡) (`577-617`)
- L3 header: `OntologyDrillBreadcrumb` (`626-664`)
- L4 header: `OntologyDrillBreadcrumb` (`674-761`)

**一致性问题**:
- L1 有 3 个 icon 按钮 (Web/刷新/新建), L2/L3/L4 只有面包屑, 刷新靠下拉 (`RefreshControl` 在 FlatList 里)
- L2 显示 hero card 包含 L2 类型数 (`600`), L3 显示 hero card 含实例数 (`651-657`), L4 没有数, 只显示实例名 (`688-701`)
- 视觉分层: L1 chip 卡片 + 6 个 entityType pill 截断 (`DomainChipCard` 829-842, 只显示前 6, 多的 +N 折叠), L2 直接 FlatList 全显示 (wave261 老板要求"全显示不截断"), **L1 仍截断, L2 不截断** — 设计不一致

### 4.3 Force layout 替换 cluster 后还有什么问题

`OntologyGraphCanvas.tsx:36-37`:
```ts
const FORCE_ITERATIONS = 500;
const MAX_PAIRS_FOR_FORCE = 400;
```

- 自写 force simulator (无 d3-force 依赖, 避 native rebuild)
- **但**: 仍仅在屏 2 / 屏 4 / L1 长按弹屏 2 时使用 — 即业务本体 L2/L3/L4 详情页 (主路径) **根本不用图**, 只用列表
- 老板截图 "75 节点挤成环" 是 wave244 cluster 布局问题, wave261 改用 L2→L3 列表后, 这张图除了"实例图谱"入口外, **没人再打开**
- **问题 P2-1**: Force layout 的 500 次迭代 / 400 边 cap 是 75 节点场景的实测值, 大数据 (>200 节点) 会出现抖动或未收敛; 现在屏 4 workbench 5 视图预设能放大缩小, 老板放大后可能掉帧 (无虚拟化, `OntologyGraphCanvas.tsx:122-156` 一次渲染所有节点)

---

## 5. 重复入口 / 信息架构错 / 走不通路径

### 5.1 P0 缺陷 (老板用得上但跑不通)

| ID | 文件:行 | 现象 | 老板出处 |
|---|---|---|---|
| **P0-1** | `AgentsScreen.tsx:124-136` vs `AssetsAgentCard.tsx:89` | 同一员工在 card (只 skills) 和详情 (skills+desiredSkills+entries) 显示的技能 chip 不一致 | wave256 |
| **P0-2** | `AssetsAgentCard.tsx:91` vs `AgentsScreen.tsx:211-222` | card 职责兜底"通用执行"跟详情空时无显示, 两屏不统一 | wave256 |
| **P0-3** | `OntologyDomainListScreen.tsx:786, 789` | "模板" L1 chip `allowed = []` → `filterEntityTypesForDomain` 兜底返回全部 entityType, 跟"业务" chip 完全一样 | wave261 |
| **P0-4** | `ProjectsScreen.tsx:367-378` | CMMI 门禁 G1~G5 chip 全部显示绿色 ✓, 但实际项目不一定通过 — **老板会被假绿骗到** | wave108/140 注释 446 行 |

### 5.2 P1 缺陷 (老板能凑合用但不对劲)

| ID | 文件:行 | 现象 | 老板出处 |
|---|---|---|---|
| **P1-1** | `SkillMatcherSheet.tsx:14, 112-122` | 派活精准 chip 只能复制粘贴, 不能真派活 — 老板要的是"方便后续派活精准", 现在只是"预览", 真派活还得切到任务 tab | wave258 |
| **P1-2** | `OrgAssetsScreen.tsx:184-192` | 派活精准 chip 跟"例行计划 / 成本核算" 视觉一致 (都是打开 Web 容器), 但实际是打开 SkillMatcherSheet, 视觉跟职能不符 | wave258 |
| **P1-3** | `OrgAssetsScreen.tsx:31` | `OrgAssetTab` 类型只有 4 个 key (`ontology / projects / agents / artifacts`), 但 `initialTab` 传 `tab === "agents" / "artifacts" / "ontology"` 时强制转 3 个 (App.tsx:1328), "projects" tab 没有初始入口, 老板点不到 — 实际上从资产 tab 切过去才会显示 | OrgAssetsScreen 头部 |
| **P1-4** | `App.tsx:1328` | `initialTab={tab === "agents" ? "agents" : tab === "artifacts" ? "artifacts" : "ontology"}` 三元表达式, 没有 `projects` 分支, 但 OrgAssetsScreen 4 个 tab 都有 — 看似允许实则不平等 | App.tsx 路由 |
| **P1-5** | `ProjectsScreen.tsx:259` | 项目列表用 `.map()` + `<ScrollView>`, 不是 FlatList, 100+ 项目时滚动性能差 | 通用 |
| **P1-6** | `ArtifactsScreen.tsx:241-250` | 错误时记 `loadError` 显示 banner, 但 `setLoading(false)` 写在 finally (247-250), 加载中跟错误同时显示 banner — 视觉混乱 | wave153 修 |
| **P1-7** | `OntologyDomainListScreen.tsx:97-105` | L1 chip "资产 / 模板" 两个域跟 segmented control "项目 / 数字员工 / 交付产物" 完全重叠 — 老板在业务本体和资产 tab 看的是同一批 entityType (project/agent/work_product), 但分类桶不一致 | wave261 + OrgAssetsScreen |
| **P1-8** | `TabBar.tsx:106` | `tab === "assets" || (tab === "agents" || tab === "ontology" || tab === "artifacts")` — 4 个 tab 共享底部 "资产" 高亮态, 但每个 tab 顶部 title 是 "资产与组织", 老板分不清当前在哪个 | wave10 |

### 5.3 P2 缺陷 (技术债)

| ID | 文件:行 | 现象 |
|---|---|---|
| **P2-1** | `OntologyGraphCanvas.tsx:122-156` | 无虚拟化, 大图 (>100 节点) 老板放大时帧率掉, force layout 500 iter 每次重渲 |
| **P2-2** | `OntologyDomainListScreen.tsx:977` | `onChangeText={setDisplayName /* placeholder state, see below */}` — 注释掉实际是 bug, TextInput onChange 接错 setter, 显示字段名错乱 |
| **P2-3** | `OrgAssetsScreen.tsx:152-202` | 顶部 extraPillsRow 用 `flexWrap: "wrap"` (OrgAssetsScreen.tsx:435), 多公司时 org switcher + 4 个 chip 会换行, 视觉跳动 |
| **P2-4** | `AgentsScreen.tsx:383` | `coolie.listIssues(company.id, { limit: 200 })` 每次刷员工列表都拉 200 条任务算 taskCount, N+1 查询 (N 个员工), 无缓存 |
| **P2-5** | `AgentsScreen.tsx:99-117` | "最近指派任务" 也走 listIssues 然后 client filter, 5 条/详情, 每次开详情重拉 |

---

## 6. 性能 / 渲染问题

| 屏 | 行数 | 主渲染 | 分页 | 备注 |
|---|---|---|---|---|
| OntologyDomainListScreen | 1317 | L1: FlatList (`468`); L2/L3: FlatList; L4: ScrollView | L3 `limit: 200` validator max (188 行) | L1 `byDomain` 不分页 (server 端一次性返回所有域) |
| ProjectsScreen | 1048 | `ScrollView` + `.map()` (259-587) | 无分页 (105 行 `listProjects` 一次性返回) | 100+ 项目会卡 |
| ArtifactsScreen | 1323 | `FlatList` (528-539) | `limit: 50` (228 行) | 加载中/错误 banner 可能并存 (P1-6) |
| AgentsScreen | 660 | `ScrollView` + `.map()` (466-502) | 无分页 (378 行 `listAgents` 一次性返回) | 拉 200 issues 算 taskCount (P2-4) |

**主要瓶颈**:
- **ProjectsScreen** 没用 FlatList, 项目卡展开后内容很多 (展开态有 200+ 行), 100 个项目时主线程渲染压力大
- **AgentsScreen** 每次 refresh 都拉 200 issues (`AgentsScreen.tsx:383`), 大公司 N+1
- **ArtifactsScreen** `limit: 50` 但搜索/筛选条件变 → 旧响应丢弃 (`ArtifactsScreen.tsx:215`), 老板快速切筛选时屏闪

---

## 7. P0 / P1 / P2 缺陷总结表

| 严重度 | 数量 | 关键问题 |
|---|---|---|
| P0 | 4 | card/详情技能不一致 / 职责兜底不一致 / "模板" chip 等于"业务" chip / CMMI 假绿 |
| P1 | 8 | 派活精准不派活 / chip 视觉跟职能不符 / initialTab 三元不等式 / 4 tab 共享高亮 / 项目列表不用 FlatList / 错误 banner 跟 loading 并存 / L1/L2 chip 分类重叠 / 顶部 title 不分 tab |
| P2 | 5 | 图无虚拟化 / setDisplayName bug / org switcher 换行 / N+1 查询 / 5 条任务 client filter |

---

## 8. 推荐改造方案 (老板拍板才动)

### 8.1 5 域 vs 4 tab 路线 (二选一)

**路线 A — 真做 5 域 (推荐)**
- segmented control 加第 5 个 tab "模板", 内部路由到 OrgAssetsScreen 第 5 个子屏 (新建一个 `TemplatesScreen`, 复用 wave244 的紧急熔断做"模板域"治理)
- 改 `OrgAssetTab` 类型加 `"templates"`
- L1 chip 5 个跟 5 tab 完全对齐 (业务 / 项目 / 员工 / 资产 / 模板)
- 业务本体里 5 个 chip 跟 segmented 5 tab 名称一致 (合并 / 拆解随你)

**路线 B — 砍成 4 域 (省事)**
- OntologyDomainListScreen 的 `MAP` 加 `模板: ["spec"]` 或 `模板: ["document"]` 让 "模板" chip 真的有内容
- 把"模板"chip 合并进"业务"chip (业务本体包含 spec)
- segmented control 不变

### 8.2 数字员工 card 一致性

- **P0-1 修**: `AgentDetailSheet` 也只取 `agent.skills` (跟 card 同源), 不合并 `desiredSkills/entries` (避免数据源漂移); 想要的合并到上游 `AgentRow.skills`
- **P0-2 修**: card 兜底改 "未配置职责" 跟详情空态统一
- **P1-1 修**: 派活精准 chip 派活结果直接调 `coolie.updateIssue(assigneeAgentId)` — 但老板需要先确认是不是真要做端到端 (SkillMatcherSheet.tsx:14 注释说"不做")
- **P1-2 修**: 派活精准 chip 单独配色 (跟"例行计划 / 成本核算"区分) 或文案改 "🔍 匹配预览"

### 8.3 性能 / 渲染

- ProjectsScreen 主列表改 FlatList + `numColumns={1}`, 保留展开态在 FlatList header 渲染 (复杂, 但 100+ 项目必须改)
- AgentsScreen `listIssues(limit: 200)` 改 server 端聚合 API: `GET /api/companies/:id/agents/with-stats` 返回 `[{ agent, taskCount }]`
- ArtifactsScreen `reqSeqRef` (ArtifactsScreen.tsx:199) 已经做了过期响应丢弃, 但 banner + loading 同时显示 (P1-6) 改成 `setLoading(false)` 移到 try/catch 之外的 finally 早退

### 8.4 信息架构

- **TabBar 4 tab 共享高亮**: 改为 4 tab 各有独立 title (`OrgAssetsScreen` 标题随 segmented 切换: "业务本体" / "项目中心" / "数字员工" / "交付产物")
- **业务本体 L1 chip 5 域** 跟 **segmented 4 tab** 严格 1:1 映射, 或者业务本体 L1 chip 砍到 4 个
- 项目卡"任务计数" 跟 AgentDetailSheet "最近任务" 同源 — 都从 `coolie.listIssues` + 服务端过滤, 不要 client filter

---

## 9. 老板会问的 5 个问题 (回答)

1. **"5 域在哪儿?"** — 不存在。Segmented control 是 4 域 (业务/项目/员工/产物), 业务本体 L1 chip 是 5 域 (业务/项目/员工/资产/模板), 两者对不齐。
2. **"派活精准能用吗?"** — 半成品。只能预览 + 复制, 不能真派活。真派活走 `AgentPickerSheet` (3 个入口: 任务详情/创建任务/SearchScreen)。
3. **"员工卡片准吗?"** — 不准。卡片只取 `agent.skills`, 详情取 skills+desiredSkills+entries, 同员工两屏不一样。
4. **"业务本体下钻到几层了?"** — 4 层可用 (L0 公司 → L1 域 → L2 类型 → L3 实例 → L4 属性)。但 "模板" chip 点进去跟 "业务" chip 完全一样 (P0-3)。
5. **"老板什么时候能看到变化?"** — P0-3 模板 chip 修一下就 5 分钟; P0-1/P0-2 技能职责一致性需 server 端拉同一份数据, 1 小时; P1-1 派活真做端到端需 wave273+。

---

## 10. 一句话给老板

**资产页是 "4 个 tab + 5 个 chip" 两套并存的信息架构**, 老板派的 wave256/wave258/wave261 都是单点升级, 没动 "5 域 vs 4 tab" 这个根矛盾。
数字员工 card 在列表看技能、详情看技能, 两屏数据源不一致 (P0-1), 老板看到 chip 数量不一样会立刻察觉;
派活精准 chip 是个复制粘贴工具, 不能真派活 (P1-1), 想端到端派活必须走任务 tab 的 AgentPickerSheet。

— 写于 2026-10-01, 不动任何代码, 等老板拍板 wave271 是否开做.
