# Coolie App 版本记录

Coolie工坊移动驾驶舱 App（React Native + Expo）版本流水。

---

## v0.6.31

> Released: 2026-10-05 · Android release APK

### 更新

- wave306 ontology stats API + 3 屏适配 (项目进厂即本体域 v2)

---

## v0.6.30

> Released: 2026-10-05 · Android release APK

### 更新

- wave304 回滚 wave302 页面栈 bug (干净版) + 24 commit 实质业务

---

## v0.6.29

> Released: 2026-10-05 · Android release APK

### 更新

- wave302 全局页面栈 + 面包屑 + 滑动返回 (铃铛→任务详情精准返回) + 24 commit 实质业务

---

## v0.6.28

> Released: 2026-10-05 · Android release APK

### 更新

- 极简两字按钮、对称底栏与高管审批治理全面审计

---

## v0.6.27

> Released: 2026-10-04 · Android release APK

### 更新

- 业务本体回归 6 天前经典三层 + 默认域自动自生 + 治理 + Web 审批 + 自动化测试 + 环境隔离 + 双阶段生命周期

---

## v0.6.26

> Released: 2026-10-04 · Android release APK

### 更新

- runtimeVersion 政策 appVersion→fingerprint, 一次安装后 v0.6.x 全走 OTA

---

## v0.6.25

> Released: 2026-10-04 · Android release APK

### 更新

- 原生任务列表分页流式加载 (60fps 200+ 任务) + 底部栏重构 (+ 号直通两张卡建单) + 原生项目分组视图 + 看板对齐 web 架构 (增量分页/状态色调/卡片徽章) + 看门狗健康巡检 + 看板 422 needs-assignee 修 + release-pipeline skill 沉淀 + agy health probe fix + v0.6.24 SHA 修复

---

## v0.6.24

> Released: 2026-10-03 · Android release APK

### 更新

- 原生任务页性能修 (TasksScreen FlatList/SectionList) + 关系图谱L4下钻路由 + 多工具基建加固 + 看板自适应本体加载 + 极速预检与意图梯次分流

---

## v0.6.23

> Released: 2026-10-03 · Android release APK

### 更新

- 修复本体图谱L4下钻路由与多工具基建加固

---

## v0.6.22

> Released: 2026-10-02 · Android release APK

### 更新

- wave282: 本体Tab直连与图谱降噪聚焦+本地派单监控

---

## v0.6.21

> Released: 2026-10-02 · Android release APK

### 更新

- wave275 — 第一刀 P0 真修 (P0-NEW-5 抽屉吞 TabBar / P0-03 看板/列表 toggle / P0-01+P0-02 三元锁死) + 兑底渊发版 0.6.21

---

## v0.6.20

> Released: 2026-10-01 · Android release APK

### 更新

- wave266: 删登录页共享登录按钮 (免密共享入口), 留邮箱密码/API Key/注册 三入口

---

## v0.6.19

> Released: 2026-10-01 · Android release APK + OTA bundle

### 更新

- **wave261** — 业务本体真5 层下钻 (boss 0.6.10 真机截图 18:48 — 75 实体 2100 关系挤成环 + "图谱过大, 已截断显示前 75 个节点" 横幅, boss 问 "本体分层下钻问题解决吗"):
  - **L0 公司 → L1 域 → L2 类型 → L3 实例 → L4 属性** 5 层 UX 真实现, 老板可以一层层点进去, 不再被环图截断.
  - 新 server route `GET /api/companies/:companyId/ontology/levels` (`server/src/services/ontology-graph.ts` `summarizeLevels` + `server/src/routes/ontology-graph.ts` 第 65 行): 返回真实 (不限 MAX_NODES=400) 的 5 域 + 8 entityType + totalNodes / totalEdges 汇总. 客户端拿到总数后决定走图还是列表.
  - **重写 `OntologyDomainListScreen.tsx`** (2021 → 1106 行): 删 wave239/wave244 同屏内嵌环图 (`viewMode==="graph"`), 改 4 状态机 `L1-domains / L2-types / L3-instances / L4-properties`. L2 类型 FlatList 全显示 (不截断), L3 实例走 `coolie.listOntologyInstances(limit=200)` validator 上限, L4 属性 = 实例 metadata + 该 type 的 schema (复用 `getOntologyTypeProperties`).
  - 新 `OntologyDrillBreadcrumb` 组件 (`clients/expo/src/components/OntologyDrillBreadcrumb.tsx` ~150 行): 顶部面包屑 5 段, 每段可点回跳, 末段是当前层级 (chip 高亮). token 化 (alpha(C.accent, 0.18) 当前 / C.ink3 既往 / C.ink4 分隔符 `›`).
  - **`OntologyGraphCanvas.tsx` 替换 wave244 cluster-by-type 为 wave261 自写 force layout** (~150 行): `linkSpring(linkDistance=80)` + `charge(strength=-300)` + `center(0.02)` + `collide(r=18+4)`, 500 次迭代 O(N²) charge. N=75 节点 < 100ms 实测. 节点半径上限从 wave244 的 30 砍到 18 (避免挤压). `layoutMode="force" | "clustered"` prop 保留 cluster 算法 fallback. **不引 d3-force** (native rebuild 风险, wave244 同款原则).
  - **`OntologyInstanceGraphScreen.tsx` ≤30 节点才显示图**: `GRAPH_NODE_LIMIT=30` 阈值, >30 节点顶部出横幅 "实例较多, 已切换为列表视图", 直接转实例列表卡 (避免老板的 75 实例环图挤爆).
  - **`OntologyGraphWorkbenchScreen.tsx` 5 视图预设**: 顶部 chip 行从 4 项 (`project_tree / agent_dashboard / conversation_thread / mixed`) 改为 5 项 `L0 公司 / L1 域 / L2 类型 / L3 实例 / L4 属性`, 每个 map 到 server view + depth. 缩放范围 0.5x - 4x (原来 0.4x - 2.5x 放宽).
  - api-client 扩 `getOntologyLevels()` (`clients/api-client/src/client.ts` ~17 行) + 类型 `OntologyLevelsResponse / OntologyDomainLevel / OntologyEntityTypeLevel` (`clients/api-client/src/types.ts` ~30 行 + index.ts 导出).
  - 删 `OntologyGraphCanvas.tsx` `truncatedBanner` 样式 + "图谱过大, 已截断显示前 N 个节点" 横幅 (drilldown 后不截断, 这个横幅误导老板).
  - **不动** wave250 (7 primitives) / wave245 (调研) / wave244 (节点文字兜底) / wave239 (5 屏存在) / wave237 (17 端点) / wave258 (派活精准) / server 业务 / ontology_properties / ontology_types 数据 / wave222 派活算法 / AGENT_ROLES enum / 13 数字员工相关 scripts / mcp server / h5 client / web ui.
- **bump 0.6.17 → 0.6.19** (`app.json` + `package.json` + `android/app/build.gradle` versionCode 617 → 619). 跳 0.6.18 是为了和并发 session 在打的某波不撞 versionCode.

---

## v0.6.17

> Released: 2026-10-01 · Android release APK + OTA bundle

### 更新

- **wave258** — CMMI 5 阶段 25 任务全 skill 清单 + 删 13 数字员工 + 派活精准浮层 (boss 原话 4 条: "cmmi 角色就挺好的, 5 员工 + 1 传话" + "中文二字技能, 把 cmmi 任务中所有包含的技能都列全了, 方便后续派活精准" + "技能不是 cli 工具, 是 skills, 得区分了" + "不要 13 员工"):
  - 30 个中文 2 字 skill 全集 (`server/src/services/dispatch-skill-matcher.ts` `CMMI_SKILLS`): 调研 / 画图 / 选型 / 研判 / 文档 / 评审 / 立项 / 规划 / 设计 / 编码 / 重构 / 测试 / 修复 / 联调 / 部署 / 运维 / 监控 / 应急 / 命令 / 脚本 / 自动化 / 数据 / 分析 / 报告 / 派活 / 验收 / 调度 / 复盘 / 预算 / 风控. 从 CMMI 5 阶段 25 任务的派活路径反讲.
  - 6 老板团队 skill × tools 矩阵 (`scripts/seed-agent-roles.ts` 真值表, 沿用 wave256 已就位版本):
    - Hermes (PM): skills=[派活/验收/报告/调度/评审/复盘/立项/文档] tools=[agy, claude-glm]
    - 墨斗 (FDA): skills=[调研/画图/选型/研判/文档/设计/立项/规划] tools=[agy, claude-glm]
    - 铁匠 (Core SWE): skills=[编码/重构/测试/修复/联调/文档/设计/评审] tools=[cmd, claude-mm]
    - 兑底渊 (PRE-SRE): skills=[部署/运维/监控/应急/自动化/脚本/命令/风控] tools=[cmd, claude-mm]
    - 门神 (FDSE): skills=[命令/脚本/自动化/部署/联调/测试/调研/文档] tools=[cmd, claude-mm]
    - 百晓生 (DS): skills=[数据/分析/报告/测试/验收/复盘/风控/评审] tools=[claude-mm, claude-glm]
  - 删 13 数字员工 (老板 "不要 13 员工"): 新迁移 `9022_delete_13_digital_employees.sql` `DELETE FROM agents WHERE name IN ('QA Lead', 'Mobile Tester', ...)` — 直接按 name 删, 不依赖 company name. 涉及 6 QA (wave217, QA-Test-Workshop) + 7 Ops (wave220, Coolie-Ops-Control-Room). 公司本身保留, 只删员工.
  - 派活精准匹配 (`server/src/services/dispatch-skill-matcher.ts` + `__tests__/dispatch-skill-matcher.test.ts`): 输入中文 2 字 skill (/ 分隔) → 公司内 6 老板团队 × 评分 (matched / input.length * 100), 降序排序, 平局按名字升序 (Unicode 码点, 非拼音). Hermes chat 反讲用. 算法层与 App 端 `SkillMatcherSheet` 口径一致 (10 unit test 全过).
  - 新 `clients/expo/src/components/SkillMatcherSheet.tsx` (派活精准浮层, ~290 行): 顶部输入框 + 6 员工列表 (按评分排序, 显示 role 徽章 + matched skills 绿色 chip + 评分) + 点员工 → 复制到 clipboard + Toast 提示. 用 react-native 自带 `Clipboard` (不引 expo-clipboard 避免 native module 风险, wave244 同款原则).
  - `OrgAssetsScreen` 顶部加 "🎯 派活精准" 入口 (跟 "更多" / "成本核算" 同级, 不抢 segmented control 的位置).
  - **不动** wave254 (TasksScreen) / wave255 (0.6.15) / wave256 (数字员工卡基线 — `tools` 列 + 中文 2 字 skills + tool chip 行 + 详情 sheet "工具" 段 已在 wave256 113d4af21 落地) / wave244 (图谱) / wave251 (chip 去重) / wave222 (派活算法) / AGENT_ROLES enum (5 角色不变) / `.agents/skills/qa-*` `/ ops-*` 目录 / qa-bootstrap-team / qa-bootstrap-ops 脚本 (改了就违背 "不动 13 数字员工相关 scripts") / mcp server / server 业务代码.
- **bump 0.6.16 → 0.6.17** (`app.json` + `package.json` + `android/app/build.gradle` versionCode 616 → 617).

---

## v0.6.16

> Released: 2026-10-01 · Android release APK + OTA bundle

### 更新

- **wave256** — 数字员工卡显示职责 / 技能 / 真名 (boss 0.6.10 真机截图 18:22 — 5 员工都显示「空闲」+「claude_local」, 老板看不出区别, Hermes 名字被裁切):
  - 新 `AssetsAgentCard`: 大字真名 (numberOfLines=2, flexShrink 防裁切) + 角色徽章 chip (FDA 红 / Core SWE 蓝 / PRE-SRE 绿 / FDSE 紫 / DS 橙 / 通用灰, 6 色) + 1 行职责 (responsibilities[0]) + 3-5 个技能 chip (末尾 +N 折叠) + 状态点 + 「已完成 N」软指标. 颜色全走 token (alpha() + C.xxx), 不裸写 hex.
  - `AgentsScreen` 列表行整体替换为 `<AssetsAgentCard>`, 详情弹卡 (`AgentDetailSheet`) 头部加 roleLabel + 完整职责 chip 行 (卡片只展示 1 行, 详情展示全部).
  - agents 表加 3 字段 (NULL-safe): `role_label` (text) / `responsibilities` (jsonb string[]) / `skills` (jsonb string[]). 新迁移 `9021_add_agent_role_responsibilities_skills.sql` (3 个 ALTER TABLE ... IF NOT EXISTS). 不破坏上游 wave65 删 title 的简化, 不动 AGENT_ROLES enum.
  - 新 `scripts/seed-agent-roles.ts` (幂等 UPDATE WHERE id): 6 老板团队 (Hermes PM / 铁匠 Core SWE / 铁匠贰号 Core SWE / 门神 FDSE / 墨斗 FDA / 兑底渊 PRE-SRE) + 13 数字员工 (qa-lead / qa-mobile / qa-ios / qa-web / qa-perf / qa-a11y / ops-lead / ops-mobile / ops-ios / ops-web / ops-server / ops-build / ops-release). 每个 agent 的中文职责短语 + 工具技能 (claude-glm / claude-mm / cmd / agy / k6 / playwright / gradle / xcode / pnpm / coscli / ...). 通用 fallback 给上游 5 角色外的 agent.
  - `api-client` `Agent` interface 加 3 字段 (`roleLabel` / `responsibilities` / `skills`), server `GET /api/companies/:id/agents` 自动透传.
  - **不动** wave254 (TasksScreen) / wave255 (0.6.15) / wave239 (5 屏本体) / wave244 (图谱) / wave251 (chip 去重) / server 业务算法 / wave222 (派活算法).
- **bump 0.6.15 → 0.6.16** (`app.json` + `package.json` + `android/app/build.gradle` versionCode 615 → 616).

---

## v0.6.15

> Released: 2026-10-01 · Android release APK + OTA bundle

### 更新

- **wave254** — TasksScreen 拆分去卡死 (reducer + 4 memo 子组件 + stable callback):
  - 19 个 useState 合并到 `useTasksFilter` 的 useReducer (state + actions SET/TOGGLE_MAINLINE/CLEAR_SEARCH/FOCUS_MAINLINE/BUMP_REFRESH)。
  - TasksScreen 拆分到 4 个 memo 子组件 (`TasksScreenHeader` / `TasksScreenSearch` / `TasksScreenFilters` / `TasksScreenViewSwitch`), 各自管各自的 ScrollView。
  - `IssuesList` 加 `stableIssuePress` / `stableIssueLongPress`, `IssueRow` 的 `React.memo` 真正生效 — 36 条 issue 滑动不卡。
  - `handleCreated` 改走 `showSuccessToast` (wave184 Toast 接管), 不再 `Alert`。
  - 保留 13 项功能 (今日/全部/项目分组/列表/看板/状态/指派/项目/排序/只看主线/聚焦主线/搜索/视图切换 + QuickApproval + FAB), 全过 typecheck。
  - 不嵌 FlatList 到外层 ScrollView (避免 nested-scroll warning)。`IssueRow` 已 memo, 父级 callback 不再飘。
- **bump 0.6.14 → 0.6.15** (`app.json` + `package.json` + `android/app/build.gradle` versionCode 614 → 615)。`app.json` 与 `package.json` 历史漂移值 (610 / 0.6.12) 顺手对齐。
- 无服务端改动

---

## v0.6.14

> Released: 2026-10-01 · Android release APK + OTA bundle

### 更新

- **wave251** — 资产 tab 业务本体子屏去重 (3 层 chip → 1 层):
  - **删 `OntologyDomainListScreen` 第 2 层 CATEGORY_CHIPS** (wave239 加, "全部 / 业务本体 / 项目中心 / 数字员工 / 交付产物"): 与 `OrgAssetsScreen` 顶部 SegmentedControl (`TAB_OPTIONS` 🧠 业务本体 / 📁 项目中心 / 👥 数字员工 / 📦 交付产物) 字面 + 语义完全重复; 真机打开资产 tab 出现 "3 层 chip 重复" 就是这个。
  - **保留**: `OntologyDomainListScreen` 第 3 层 `DomainFilter` SegmentedControl (全部 / 生产 / 草稿 / 已归档) — 这是生命周期状态过滤, 与一级分类不冲突, 留。
  - 删 `OntologyCategoryFilter` 类型 / `CATEGORY_CHIPS` 常量 / `categoryFilter` state / 顶部 chip ScrollView / 过滤逻辑 `.filter((d) => categoryFilter === ...)` / 4 个孤儿样式。
  - **范围确认**: 全面扫 13 屏 (`Dashboard / Tasks / TaskKanban / Agents / Artifacts / Projects / BoardChat / Inbox / OntologyDomainList / OrgAssets / Notifications / Search / WhatsNew`), 只有 OntologyDomainListScreen 真正字面重复; 其它屏 chip 行 (TasksScreen 4 行, ArtifactsScreen 3 行, TaskKanbanScreen 3 行) 是不同维度 (scope / 状态 / 筛选 / 视图), 保留。
  - 不动 wave241 报告里的其它 P0/P1 (P0-1 注释 / P0-2 SettingsSheet / P0-3 InboxScreen+TasksScreen 死代码 / P1-1 双层 tab / 等) — 那些是另立任务。
- **bump 0.6.13 → 0.6.14** (`app.json` + `android/app/build.gradle` versionCode 613 → 614). 备注: v0.6.13 已被 wave188 native modules 占用 (2026-09-30 发布), 顺延 1 个版本号。
- 无服务端改动

---

## v0.6.13

> Released: 2026-10-01 · Android release APK + OTA bundle

### 更新

- wave239 — 抄 web 端 本体/插件/图谱 5 屏到 App (按 agy wave238 草图):
  - **屏 1 类型级图谱** (`OntologyDomainListScreen` 增强): 顶部 4 chip (全部 / 业务本体 / 项目中心 / 数字员工 / 交付产物) 横滑过滤; 详情卡加 UUID 行 (长按单独弹出全 UUID); 长按域卡 → Alert 选「实例图谱 / 编辑字段」动作入口。
  - **屏 2 实例级图谱** (`OntologyInstanceGraphScreen`, 新): 实体类型 chip 切换 (project/issue/agent) + 负责人 chip 过滤; 选中节点 1 跳邻居高亮 + 详情卡; 实例列表 + 右下「工作台」FAB。
  - **屏 3 属性编辑** (`OntologySchemaEditorScreen`, 新): SectionList 字段卡 + 增/改/删 + 类型徽标 (String/Enum/Ref/DateTime/Array/Number/Boolean) + 顶部「放弃 / 保存」按钮 (dirty 状态); 实时校验 key (正则) / type 长度 / sample 长度。
  - **屏 4 图谱工作台** (`OntologyGraphWorkbenchScreen`, 新): 沉浸式大画布 + PanResponder 单指拖 + 双指捏合 (scale 0.4-2.5); 顶部 4 chip 视图切换 (类型 / 实例 / 对话 / 混合 — 后三个复用 wave155 视图预设); 左下浮动工具盘 (放大/缩小/居中/全屏); 右下图例按 entityType 颜色分桶; `truncated: true` 时顶部 banner 提示已截断。
  - **屏 5 插件管理** (`PluginManagerScreen` 增强): 顶部搜索栏 + SectionList 分组 (已启用 / 已停用; 搜索时退化为单组)。
- server 新端点 (3 个, 已在 server/src/__tests__/ontology-extras-routes.test.ts 6 个用例覆盖):
  - `GET /api/companies/:id/ontology/instances?entityType=&ownerId=` — 单类型实例列表 + 负责人过滤
  - `GET /api/companies/:id/ontology/types/:typeId/properties` — 类型字段定义
  - `PATCH /api/companies/:id/ontology/types/:typeId/properties` — 字段定义 upsert (Board-only, 写 `ontology.properties.update` 活动日志)
- 新数据库迁移 `9013_add_ontology_properties.sql` + 新表 `ontology_properties` (公司 × 类型唯一约束, jsonb 字段定义 + schemaVersion)
- api-client 加 4 方法: `getOntologyGraph` / `listOntologyInstances` / `getOntologyTypeProperties` / `updateOntologyTypeProperties`
- 新组件 2: `OntologyGraphCanvas` (deterministic 层级布局 + 类型着色, wave239 workbench / instance graph 共用), `SchemaPropertyRow` (字段卡行)
- App.tsx 加 3 个 screen state (`schemaEditorType` / `instanceGraphType` / `ontologyWorkbenchOpen`) + 倒序退栈 + hasSubHeader 屏蔽
- **不动**: wave235 已抄 5 屏其他部分 / wave237 修的 3 端点 / wave230 chip / wave213 Kanban / wave222 算法层; iOS TestFlight 不 bump (老板原话)

---

## v0.6.13

> Released: 2026-09-30 · Android release APK + OTA bundle

### 更新

- wave188 6 个 expo-* 原生模块最小集成 demo: 之前 App 只装了 17 个 expo-* 库, 还有 6 个老板可能用得上的没装 (`expo-task-manager` / `expo-background-fetch` / `expo-location` / `expo-sharing` / `expo-print` / `expo-notifications`), 现在统一装上, 版本锁到 SDK 52 bundledNativeModules 对齐 (task-manager ~12.0.6 / background-fetch ~13.0.4 / location ~18.0.10 / sharing ~13.0.0 / print ~14.0.1 / notifications ~0.29.14)。在 **设置 → 原生模块** 加一入口, 打开 `NativeModulesScreen` (新屏, 走 Sheet 模式), 6 节每节一个按钮 + 结果回执:
  - **expo-task-manager** — 模块顶层 `defineTask` 注册 `coolie-demo-task`, 按按钮用 `BackgroundFetch.registerTaskAsync` 真正挂上, 列已注册任务
  - **expo-background-fetch** — 注册 15min 周期, `getStatusAsync()` 读系统状态 (available / denied / restricted)
  - **expo-location** — `requestForegroundPermissionsAsync` + `getCurrentPositionAsync` (Balanced), 显示经纬度
  - **expo-sharing** — 写临时 `coolie-share-demo.txt`, 调系统分享面板
  - **expo-print** — HTML 渲染成 PDF, `printToFileAsync` 出 URI 后直接走 sharing
  - **expo-notifications** — 5s 后本地推送 (`SchedulableTriggerInputTypes.TIME_INTERVAL`), Android 13+ 自动弹 `POST_NOTIFICATIONS` 权限
  - `app.json` 加 4 个 config plugin (task-manager / background-fetch / location / notifications) + Android 权限 (`ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` / `POST_NOTIFICATIONS`) + iOS `NSLocationWhenInUseUsageDescription`
  - 后续不接 FCM/APNs (服务端 APNs 证书是另一波) / 后台定位 (`UIBackgroundModes` 复杂权限)
  - 无服务端改动

---

## v0.6.12

> Released: 2026-09-30 · Android release APK + OTA bundle

### 更新

- wave186 网络感知 (NetInfo): 之前关 WiFi/飞行模式后所有 fetch 静默失败, 用户不知道是「网断了」还是「server 崩了」; 现在装 `@react-native-community/netinfo` 11.4.1 (RN 0.76 已把 NetInfo 从 core 抽出, 必须显式装), App 顶层监听网络变化 — 断网弹 Toast「网络已断开: 操作可能失败, 请检查网络连接」, 恢复弹 Toast「网络已恢复」(均 3s info Toast, 不抢焦点)。新增 `src/network.ts` (useNetworkStatus hook + setupNetworkListener), 启动期断网不弹 (避免骚扰)。`App.tsx` 顶层 useEffect 复用 setupOTAListener 同款位置挂监听。无服务端改动。

---

## v0.6.11

> Released: 2026-09-30 · Android release APK + OTA bundle

### 更新

- wave185 登录页 / 输入屏键盘挡输入框: `App.tsx` 的公共壳 `Surface` 加 `KeyboardAvoidingView` (iOS `behavior="padding"` 自动抬升, Android 由 `adjustResize` + ScrollView 自动让位), 一次性覆盖 `SignInScreen` / 公司选择 / 审批裁决 3 个整屏表单壳; 独立屏 `RegisterScreen` (5 输入框) 也补 KAV。老板实测「点完密码看不见自己敲了什么」修好, 0 副作用 (已经自带 KAV 的 7 个屏未碰)。

---

## v0.6.10

> Released: 2026-09-30 · Android release APK + OTA bundle

### 更新

- wave184 自写 Toast 通知系统：之前关键操作要么弹 `Alert.alert` 阻塞打断, 要么完全静默 (老板实测「登录失败没看到提示」「点退出不知道有没有用」), 现在所有轻量回执走顶部滑入淡出的 Toast, 不抢焦点、不打断、自动消失 (success 2-3s / info 3s / error 5s)。新增 zustand queue store (`src/stores/toast.ts`) + 单例宿主 (`src/components/ToastHost.tsx`), 配色沿用 Linear 令牌 (surface 背景 + 状态色左条 + icon), 走 RN 内建 `Animated.timing` (useNativeDriver:true, 不占 JS 线程), 无新增依赖。`src/ui/toast.ts` 重写 — 调用点零改动 (TaskKanbanScreen 已用 showSuccessToast/showErrorToast, 自动从 Alert 变成真 Toast)。App.tsx 关键路径加 Toast: 登录失败 / 已退出登录 / 缓存已清理 / 缓存清理失败 / iOS 升级路径打开失败 / APK 下载失败 / 任务已创建 / 无法打开 Pipeline — 共 8 处, 全部从阻塞 Alert 改成不抢焦点的 Toast。Click-to-dismiss 已支持 (用户可点 Toast 提前关掉)。

---

## v0.6.9

> Released: 2026-09-30 · Android release APK + OTA bundle

### 更新

- wave178 全屏兜底 ErrorBoundary: 之前任何屏 render 抛错都是裸红屏/白屏, 老板截图没法分析; 现在 App 根挂一个 `ErrorBoundary` (root scope), 崩了显示友好兜底屏 (图标 + 「出了点问题」+ 错误摘要/堆栈 + 「重启 App」+ 「只重试这一屏」按钮); 「重启 App」走 `Updates.reloadAsync()` (OTA 唯一稳的重启方式), 失败降级到 retry 把 boundary state 复位; 堆栈自动剔除 node_modules / RN 内置栈帧, 只留用户代码

---

## v0.6.8

> Released: 2026-09-30 · Android release APK + OTA bundle

### 更新

- wave216 真修本体域节点 UUID 显示: 之前 wave163 只在服务端 entity_relations hydrate 把 id 换成真名, 但 Expo 端 `OntologyDomainListScreen` 把 `nodeTypeId` (UUID) 当 typeKey, 又把 typeKey 当 label 兜底, 结果节点下面一片 UUID; 现在加 UI 层防御 (`safeDisplay` + `isUuidLike`), 任何 label/key 落到裸 UUID 或 `type:uuid` 时改用中文占位 (`(未命名实体)` / `(未归类对象)`), truncate 28 字符; 节点抽样和底部详情卡也走了同一路径, 老板截图那种 `0791cb57-4d94-…` 不再出现

---

## v0.6.5

> Released: 2026-09-30 · Android release APK

### 更新

- wave213 双端任务看板 + 拖拽换状态: App 任务 tab 改看 Kanban (TaskKanbanScreen), 5 列横向滚动, 卡片长按拖到另一列即时换状态; 服务端新端点 `PATCH /api/companies/:companyId/issues/:id/status` 做状态转换合法性校验 (backlog→todo 需指派 / in_progress→done 需产物); 拖拽有震动反馈, 失败回弹 + Alert 提示原因

---

## v0.6.2

> Released: 2026-09-30 · Android release APK

### 更新

- wave157 开发基座(5 默认模块, 无业务域) + App 实例目标可切换 + 模板预设收敛; 含 wave153 登录修复

---

## v0.6.0

> Released: 2026-09-29 · Android release APK

### 更新

- wave146 init script + wave147 spec-driven + wave148 多对话 + wave144 board-chat 修复 + wave149 浏览器打开按钮

---

## v0.5.97

> Released: 2026-09-29 · Android release APK

### 更新

- wave142 WBS 任务自动路由 + 交付物激活补产物(S3 沙箱示范) + 看板/工坊对话内联渲染 HTML 交付物

---

## v0.5.96

> Released: 2026-09-29 · Android release APK

### 更新

- wave138c 原型沙箱(文件列表+预览)+空态+入口体检 + App全屏巡检(壳内渲染)

---

## v0.5.95

> Released: 2026-09-29 · Android release APK

### 更新

- wave141 交付产物按项目筛选 + 交付物版本管理: 同一交付物多次修改形成 v1/v2/v3 版本链, 内容相同不重复上传, 交付产物页与原型沙箱显示最新版与版本数, 可按项目筛选

---

## v0.5.94

> Released: 2026-09-29 · Android release APK

### 更新

- wave140 CMMI WBS 拆解 + 里程碑主线任务(自动草案/门禁联动/主线视图)

---

## v0.5.93

> Released: 2026-09-29 · Android release APK

### 更新

- wave136 原型沙箱: HTML 交付物改用「带凭据取回正文 + baseUrl 注入 WebView」渲染(不再依赖 WebView cookie 存储), 真机可直接看到页面

---

## v0.5.92

> Released: 2026-09-29 · Android release APK

### 更新

- wave136 原型沙箱修复: 会话登录下 WebView 交付物预览的鉴权(exchange 桥), Android 装机包可直接渲染 HTML 交付物; Web 项目页 New Task 预选当前项目; 需求文档解析补齐提示

---

## v0.5.91

> Released: 2026-09-29 · Android release APK

### 更新

- wave136 HTML交付物真预览(App沙箱直接渲染页面) + Web项目页New Task预选当前项目/需求文档解析补齐提示 + 拟人全链路复测

---

## v0.5.90

> Released: 2026-09-29 · Android release APK

### 更新

- wave135 修 App 邮箱/密码登录 401(Board authentication required) + 工坊带附件发送死锁(重复上传) + 大盘任务总数口径；Web 生产重新部署需求文档上传

---

## v0.5.89

> Released: 2026-09-29 · Android release APK

### 更新

- wave132 缺陷记录到任务：新建任务支持类型(任务/缺陷)+严重度P0-P3+复现步骤+截图证据，列表/详情显示缺陷徽章与严重度并支持仅缺陷/P0筛选，项目显示缺陷数

---

## v0.5.88

> Released: 2026-09-28 · Android release APK

### 更新

- wave126 项目中心项目卡「创建任务」直接打开新建任务弹窗并预选该项目（服务端据此绑定项目主工作区）；「查看任务」跳转任务页并自动套用该项目筛选

---

## v0.5.87

> Released: 2026-09-28 · Android release APK

### 更新

- wave125 任务列表对齐 web 功能：状态/指派/项目筛选、列表/分组(按项目)/看板(按状态分列)三视图切换、排序（更新时间/创建时间/标题）、今日+进行中/全部 范围切换

---

## v0.5.86

> Released: 2026-09-28 · Android release APK

### 更新

- wave122 新建项目可上传需求文档（自动落档 coolie-docs）；上传后按文档自动识别并预填项目名；board 助手交付产物铁律（产物必须上传为工单附件）

---

## v0.5.85

> Released: 2026-09-28 · Android release APK

### 更新

- wave121 极速立项「模板源」与「组织托管」拆分为两个独立属性（boss 13:13 反馈「模板源与组织托管是两个属性，不是二选一，组织托管是自动识别上传远端用的」）：代码源一行仅保留 Git 仓库地址 / 本地目录两种来源，原先被塞进同一行单选的「组织托管 (robinschen1990)」抽出为独立开关行（自动识别远端组织、默认 robinschen1990、可关闭），二者自由组合 —— 本地目录 + 组织托管可同时生效；提示语更新为「自动识别并上传至远端组织」，服务端新增 hostedRemote 字段表达「本地源 + 托管远端」并保留旧行为

---

## v0.5.84

> Released: 2026-09-28 · Android release APK

### 更新

- wave120 原生任务指派/改派：任务详情「分配智能体」行改为可点，打开员工底部选择器（列出本公司员工 + 在线状态，含「未分配」清除项），选中即乐观更新并 PATCH /api/issues/:id（assigneeAgentId，传 null 清除），失败回滚并提示；新建任务「负责人」改用同一选择器

---

## v0.5.83

> Released: 2026-09-28 · Android release APK

### 更新

- wave119 彻底重构「极速立项」原生抽屉（对齐 Web 端完整能力与 CreateTaskModal 稳固全高弹窗）：
  1. 布局修复：重构为稳固全高安全弹窗架构，顶部把手与标题（带关闭叉号）固定、底部「取消」与「一键立项并开工」操作栏常驻贴底，中间表单自适应高度并流畅滚动，彻底解决真机被底边推挤遮挡、软键盘顶起导致只看得到“项目名称”的问题；
  2. 预设对齐：完整引入四大复杂开源项目底座预设（RuoYi-All-Next 自有全栈底座、Spring Cloud Alibaba 微服务治理、RuoYi-Vue-Pro 企业全栈脚手架、JeecgBoot 低代码微服务），点击一键预填项目名称、切换至 Git 模式并填入仓库；
  3. 多源模式：完整提供 Git 仓库地址（支持添加多仓库 Multi-Repo 与删除、支持 Gitee/GitLab/自建Git/GitHub/SSH）、本地工作区物理目录绑定（绝对路径 cwd）与无代码库（纯规划管理）三大模式。

---

## v0.5.82

> Released: 2026-09-28 · Android release APK

### 更新

- wave118 Web 新建项目「快速填入开源复杂项目预设」补上自有 ruoyi-all-next 底座预设 (RuoYi-All-Next, https://github.com/xaicd/ruoyi-all-next.git), 预设 3 → 4 (企业级全栈底座)
- 随包带上 0.5.81 之后的新提交: expo 原型沙箱按 COOLIE_BASE_URL 解析相对产物 URL + markdown 附件渲染、原生快速建项目、server 实例级 board actor 放行、mcp X-Paperclip-Api-Key 认证

---

## v0.5.81

> Released: 2026-09-27 · Android release APK

### 更新

- wave116 底部导航栏字号优化 (boss 真机 23:00 反馈「底部导航栏字太小了」): 标签 10→13px、图标 22→24px、栏高 60→64px, 五个 tab (汇览/任务/工坊/资产) + 中央 FAB 布局不变
- 随包带上 0.5.80 之后的新提交 (3967d063b: 平台核心工具经 MCP 暴露 + Hermes 连接)

---

## v0.5.80

> Released: 2026-09-27 · Android release APK

### 更新

- wave115 修清空对话后空透明气泡 (清空对话改为硬删行; 历史读路径过滤空/墓碑行)
- wave115 修「正在连接会话助手…」状态行被当消息存库 (存库前过滤 + 历史防御过滤)
- wave115 修 loading 双指示 (蓝点行 + 三点动画行) → 同一时刻只留一个 thinking 指示

---

## v0.5.79

> Released: 2026-09-27 · Android release APK

### 更新

- wave114 项目中心新建按钮改为右下悬浮

---

## v0.5.78

> Released: 2026-09-27 · Android release APK

### 更新

- wave113 修项目中心返回标签溢出: 真因是 `ScreenHeader` 自身不带水平内边距 (由调用方提供), 而项目中心 / Plan / Pipeline / Git 凭证 / 原型沙箱这几屏渲染头部时漏了这层内边距 —— 返回标签(如「任务」)贴在屏幕左缘、比正文的 16px 左边距更靠外, 看起来像溢出/突出 (老板 21:48 截图 资产→项目中心)。已给这些屏的头部补上 16px 内边距, 返回箭头 + 标签完整落在屏幕内。

---

## v0.5.77

> Released: 2026-09-27 · Android release APK

### 更新

- wave112 修 0.5.76 选完公司白屏: 真因是 DashboardScreen 的 D11 成本下钻 Hook 被放在提前 return 之后 — 首帧 loading=true 少跑 4 个 Hook, 数据到达后重渲染多跑 4 个 → "Rendered more hooks than during the previous render" 抛错并卸载整棵 React 树 → 白屏 (HomeScreen 默认 tab 就是 dashboard)。已把该批 Hook 移回提前 return 之上。附带: ①默认登录与退出登录均回原生表单 (老 WebView Chromium <80 解析不了 ES2020 SPA) ②Web 登录加 15s 空白兜底 (页面未报存活自动切回原生) ③登录 prober 401 指数退避 + 25 次封顶停表 ④Web 登录只写 session 槽, 不再污染 bearer 槽

---

## v0.5.76

> Released: 2026-09-27 · Android release APK

### 更新

- wave111 修 0.5.75 选公司进入后闪退: ①旧 WebView (Chromium 66/73) 登录页无限重载环 — localStorage 不持久时 ZH_CN_ENSURE 反复 reload, 加单次护栏 ②登录 prober 双实例+永不停表修复 ③部署 rsync 不再抹 OTA 分发目录 (0.5.75 起所有 OTA 下载 404 的根因), OTA 恢复下发

---

## v0.5.75

> Released: 2026-09-27 · Android release APK

### 更新

- wave110 审计收尾: ①审批卡决策辅助 — 发起人+等待时长+批准/驳回后果一行话, 老板不再盲签 ②员工技能 chip 可点下钻职责描述 ③QA 审计 17 项全部清账入库 docs-coolie/specs/2026-09-27-app-qa-audit-and-closure.md

---

## v0.5.74

> Released: 2026-09-27 · Android release APK

### 更新

- wave109: ①修 D03 会话桥永久登出真因 — 部署重启窗口(约10秒服务不可达)曾把冷启动设备全部登出, 现在只区分「明确拒鉴」才清凭证, 瞬态故障保留 token 下次启动自动恢复 ②本月花费格下钻原生成本面板 (按员工花费排序 + 输入→输出token + 预算水位条) ③字重 700→600 统一 10 处 + 纯白清理 ④新增移动端入口预算守门脚本 (zero-net-add 可执行化, 全屏余量 1-36)

---

## v0.5.73

> Released: 2026-09-27 · Android release APK

### 更新

- wave108 审计清账: 项目卡 CMMI 重复深链去重 + 六宫格伪数据改真实交付物名 + 术语统一「总办」→「会话助手」; 含 wave107 外部应用一键直达 + wave105 公司级紧急熔断 (红 chip/banner/解除) + release-app 自动联动 server 部署 + skills.sh 首批 15 个可选技能入库

---

## v0.5.72

> Released: 2026-09-27 · Android release APK

### 更新

- wave105 公司级紧急熔断: 董事会一键停掉全公司派单 (companies.status paused, heartbeat 自动停派), Dashboard 顶部红 chip + paused 状态红底 banner + 解除熔断按钮, board-only 鉴权 + reason 必填 + activity_log 留痕, 6 个 vitest 全过 (CEO 拒熔/幂等/必填 reason/resume 闭环/notPaused 无副作用)

---

## v0.5.70

> Released: 2026-09-27 · Android release APK + OTA bundle

### 更新

wave98+wave100 修 App 内点「进入 CMMI 门禁」仍看到 web 登录页 (boss 23:36 OOB)。prod Caddy 日志铁证 (09-27 08:36 真机): exchange 302+Set-Cookie 成功但紧接的 get-session 401 — **两层叠加真因**, 两层都修:

- **值错了 (wave100 根因)**: App 把 Better Auth cookie 的 wire 形式 (encodeURIComponent 过的签名值, 含 `%2F`/`%2B`) 当逻辑值存进 SecureStore, exchange URL 又 encode 一次 → `%252F` 双重编码。server 验证时 better-auth parseCookies 只 tryDecode 一层 → 验得过 (302), 但铸出的 cookie 再 encode 一层 → WebView 回传时只解一层得到 wire 形式 → HMAC 校验失败 → 401。修: api-client `extractSessionTokenCookie` 解码 wire 值; App `saveSessionToken`/`getSessionToken` 双向归一 (顺带 heal 旧版本已存的 wire 形式值, 不用重登)
- **存不进 (wave98)**: 老 sw.js 的 fetch 拦截只豁免 `startsWith("/api")`, `/XROA/api/auth/exchange` 导航被 service worker 代理, Lax cookie 在该上下文存不进 jar。修: sw.js 改豁免任何含 `/api/` 的路径 (bridge 302+Set-Cookie 交还浏览器导航栈); bridge Set-Cookie SameSite=Lax → None (+Secure) —— prod 单变量 A/B 实证 Lax=登录页 / None=自动登录
- 配套: server auth wrapper 暴露 `options.secret` (session-token 路由 + bridge 对 raw DB token 正确签名); WebContainerScreen 落到 /auth 页时一次自愈重试 exchange (覆盖旧 SW 更新窗口期)
- **OTA 发布卫生 (wave100)**: publish-ota.sh 从 warning 升级为硬阻断 — 工作区不干净拒绝发布 (09-26 23:40 曾从未 commit 工作区发出过一份幽灵 OTA bundle, 不可审计不可复现; 本次 0.5.70 OTA 从 committed HEAD 重发)

---

## v0.5.69

> Released: 2026-09-26 · Android release APK + OTA bundle

### 更新

- wave97 删资产 Tab 设置齿轮 (boss 23:28 OOB「派97」): wave96 漏删的 ⚙️ 齿轮 (75929afe0 重构加回) 从资产 Tab 两个子页 (业务本体域列表头 + 数字员工列表头) 彻底移除
- 保留 4 子分类 chip (业务本体/项目中心/数字员工/交付产物) + 业务本体 Web图谱按钮 + 新建 + 注入示例域; 收件箱齿轮保留为设置 (登出/OTA/Git 凭证) 唯一入口

---

## v0.5.68

> Released: 2026-09-26 · Android release APK + OTA bundle

### 更新

- wave96 修真机「录音开启就停不了」: 语音录音五重防线 (多组件状态广播同步 + 30 秒看门狗自动切断 + 录音中再按强制停 + 手指滑出自动停 + 异常兜底复位), 全部语音入口空录音保护
- wave96 精简 (boss 22:14 OOB「更复杂了」): 仪表盘删「业务本体态势」大卡, CMMI 卡收敛到 1 项 + 1 按钮, 删熔断 modal、设置齿轮、检查更新按钮 (wave76 已删被重构加回的 3 个回归)
- 任务页精简: 删 6 个编排图标卡 (Build/Pipeline/Plan/项目/仓库绑定/CMMI门禁)、右上角 4 个入口 icon、看板/分列/漏斗等视图切换, 只留任务列表 + 新建任务
- 任务 Tab 只显示「今日 + 进行中」, 与收件箱 Tab (@提及/审批/阻塞) 分工不重叠 (boss 09-25 OOB「任务导航与收件箱是不是功能重复了」)
- 修 WebView 自动登录: session cookie 回放改用实例真实 cookie 名 (`__Secure-paperclip-default.session_token`, 登录时从 Set-Cookie 捕获持久化), 此前按猜测别名回放被 Better Auth 静默忽略, bridge 取不到 token 落回登录页

---

## v0.5.67

> Released: 2026-09-26 · Android release APK + OTA bundle

### 更新

- wave95 — 移动端 Super-Shell 5 栏全功能重构 + 企业 CMMI/活拓扑独立治理插件化 (@paperclipai/plugin-governance)
- 重构移动端五大导航底座（工坊/对话/本体/任务/资产），彻底根除「独立 Web 全功能」割裂按钮 (`22c17a392`)
- 将企业 CMMI 5+2 门禁、活拓扑与 API 生命周期抽离为独立官方插件 `@paperclipai/plugin-governance` (`1e89603b3`)
- 实现原生与 Web 双向安全 JSBridge 握手通道、互动式 CMMI 质量门禁抽屉与组织资产沉淀 (`75929afe0`)
- 仪表盘增加移动端一键紧急制动安全阀弹窗 (Emergency Kill Switch Modal) (`ad03144ab`)
- 为底部 Tab 栏与中央悬浮呼叫按钮增加触觉震动反馈 (Haptics) (`18561bc54`)
- WhatsNew 更新说明真值修复: 远端 /api/release-notes 优先 + 失败重试, 离线兜底只精确匹配本版本, 拉取期间显示「正在获取」—— 不再拿旧版本内容充数 (boss 27:38 OOB「新包提示更新内容得是真实数据」)
- Spec v3.1.0 移动端无损 Super-Shell 规范与产融智能体集成规范固化

## v0.5.66

> Released: 2026-09-26 · Android release APK + OTA bundle

### 更新

- wave94 — 打包 boss Claude 后 2 commit (boss 27:35 OOB「打新包, 发生产」)
  - `296481625` feat(expo): directly use Web full-feature login in native app with seamless session synchronization — App 直接用 Web 全功能登录 (WebLoginScreen + 无缝 session 同步)
  - `b7c6a2bb8` feat(expo): surface Web full console, CMMI golden docs, living topology and multi-source projects on native app — 原生端 surface Web 全控制台 + CMMI 金档 + 活拓扑 + 多源项目
  - 这 2 commit 未进 0.5.65 APK, 本版装入

## v0.5.65

> Released: 2026-09-26 · Android release APK + OTA bundle

### 更新

- wave92 — server rebuild + restart 部署 a11f38871 /api/auth/session-token + bridge cookie 签名修复 (boss 27:31 OOB「0.5.64了 + 还是要再登录」)
  - 真因: a11f38871 的 /api/auth/session-token 一直没部署到生产 (404), 且 Better Auth 1.7.x 通过 getSignedCookie 读 session cookie, 要求 cookie 值带 44 位 base64 HMAC 签名; 服务器返回/桥接回写的裸 session token 永远无法通过 web 端校验 → 点驾驶舱Web 还是登录页
  - server: /api/auth/session-token 返回签名后的 cookie 值; /api/auth/exchange 对裸 token 签名后再写 Set-Cookie (9db148ebd)
  - 真验: 签名 cookie → session-token 200; exchange 302 Set-Cookie 按 WebView 方式回放 → 200; 裸 token fallback 路径同样 200
  - wave93 真因 (boss 12:07 真机 trace): App 的 bridge URL 带 /XROA 前缀 (`/XROA/api/auth/exchange`) 落到 SPA 兜底, 200 HTML 无 Set-Cookie → WebView 还是登录页; server 现把 /XROA/api/* 重写到 /api/*, next 绝对 URL 取 pathname (302 → /XROA/dashboard + 签名 cookie), 已装 0.5.64 无需升级即生效

## v0.5.64

> Released: 2026-09-26 · Android release APK + OTA bundle

### 更新

- wave90 — 修旧密码登不上 + 打包 boss Claude 后 1 commit
  - 真因: 0.5.56 (wave80) 起 App 邮箱登录后把 Better Auth session token 当 Bearer 存进共享凭据, 后续每个请求 (含登录后第一步 get-session) 都带 `Authorization: Bearer <session token>`, 服务器 agent-key 中间件校验失败直接 401「Agent token did not verify」, 掩盖了完全有效的 session cookie → 密码明明正确却报登录失败
  - 修法: session token 单独存 `coolie.sessionToken` (仅供 WebView `/api/auth/exchange` 桥用), Bearer 只发真正的 agent/board API key; 登录 → get-session 纯 cookie 直接过
  - server 新增 `GET /api/auth/session-token` (board 会话/密钥取当前会话 token, 兜底 WebView 桥与重启回填)
  - RN fetch Set-Cookie 提取兜底 (getSetCookie 缺失时读 raw headers map)
  - 打包 boss Claude 后 1 commit `c2c5d7ee8` feat(projects): expand multi-source repository support (未进 0.5.63 APK, 本版装入)
  - 附带发现: wave89 发的 OTA bundle 是从当时未提交的实验工作区导出的, 内含半成品登录改版 (登录后不出网请求、假公司页); 且 `/ota/manifest` 路由会把客户端 runtime 回写进 manifest, 0.5.64 原生壳也拉到并加载了这份旧 JS。本版 OTA 从已验证的干净工作区重发, 顶掉污染 bundle

---

## v0.5.63

> Released: 2026-09-26 · Android release APK

### 更新

- wave89 — WhatsNew 动态读 release notes: server 公开 /api/release-notes 从 CHANGELOG 抽版本节, App/h5 装机自检屏远端优先+本地兜底, 启动预热 version.json 缓存

---

## v0.5.62

> Released: 2026-09-25 · Android release APK + OTA bundle

### 更新

- wave88 — 打包 boss Claude 后 2 commit (boss 09-23 27:24 OOB 「派下」)
  - `173ce98d2` feat(mobile): native CMMI governance state block (RTM/SPC tabs) + enterprise audit spec
  - `f509fd6c2` feat(cmmi): reverse-scaffold 模式 — 从 RuoYi / JeecgBoot 老项目反推生成 CMMI 文档脚手架
  - 这 2 commit 未进 0.5.61 APK，本版装入

---

## v0.5.61

> Released: 2026-09-25 · Android release APK + OTA bundle

### 更新

- wave87 — 修 HEAD 既有 17 失败测试 + adapter-utils 7 TS error (boss 09-23 27:22 OOB 「派」)
  - 根因 1: 本机 `packages/adapter-utils/node_modules/acpx` 被覆盖成未打补丁的实体目录 → 恢复指向 patched 0.12.0 的 symlink (7 个 TS error 全消, 无源码改动)
  - 根因 2: `packages/db` migration journal 缺 9004 条目 (wave80 漏同步) → 补齐
  - 根因 3: 测试环境泄漏 — `~/.claude/settings.json` 的 ANTHROPIC_AUTH_TOKEN 被 AI connection 巡检扫到 (10 个失败, 测试补 `cwd` 隔离); 全局 `/opt/homebrew/bin/paperclipai` 劫持 worktree provisioning (5 个失败, 测试加 PATH shadow); fork 改了报错文案没同步断言 (1 个); template barrel export 没 mock (1 个)
  - 全仓 vitest 0 失败 + typecheck 0 error, 无产品行为变化

---

## v0.5.60

> Released: 2026-09-25 · Android release APK + OTA bundle

### 更新

- wave86 — OTA 触发链 debug + 真验 (boss 09-23 27:18 OOB 「0.5.55 为啥不更新」+ 27:19 派)
  - 真因: dls 上的 0.5.55 APK 是陈旧构建 (包名 `com.coolie`、零 expo-updates 配置)，从不检查更新; OTA 链路本身对 0.5.56+ 装机实测健康 (详见 `docs-coolie/OTA-STALE-APK-0.5.55-wave86.md`)
  - 客户端加 `[OTA]` 全链观测日志 + 每 60s 主动复查更新 + 弹窗去重
  - 生产 Caddy 加访问日志: `expo-runtime-version` 等请求头落盘，manifest 拉取可追溯

---

## v0.5.59

> Released: 2026-09-25 · APK + OTA bundle

### 更新

- wave85 — 打包今天 boss Claude 21 commit (boss 27:17 OOB 「派」)
  - `feat(cmmi): absorb open source IEEE and ISO standards into CMMI skills references and templates` (30dc3d4ce)
  - `feat(cmmi): solidify cmmi documents into executable skills templates and project scaffolding tool` (adde24484)
  - `feat(expo): support opening prototypes and document previews in QQ browser and external apps` (6c480bf14)
  - `feat(deliverables): support disk, git, and oss multi-storage backends and design management module` (032dde072)

---

## v0.5.58

> Released: 2026-09-25 · APK + OTA bundle

### 更新

- wave84 — 排查 + 修 App ↔ Web cookie 共享 + 打包 boss Claude 后 8 commit (boss 27:11 OOB)
  - **根因 (wave84 bridge bug)**：`server/src/auth/app-web-login-bridge.ts` 的
    `validateAppWebLoginBridgeToken` 在 HTTPS 请求里构造
    `Cookie: paperclip-default.session_token=<token>`，但 Better Auth 在 HTTPS 上
    只识别 `__Secure-paperclip-default.session_token`。bridge 永远命中空查询，
    永远 401 → WebView 拿不到 Set-Cookie → 老板装 0.5.57 APK 仍要单独登录 web。
  - **修法**：让 `validateAppWebLoginBridgeToken` 接受 `secure` 参数（由
    `isAppWebLoginBridgeRequestSecure(req)` 决定），HTTPS 走
    `__Secure-` 前缀，与 `buildAppWebLoginBridgeCookie` 对齐。Bridge 现在
    真验: 302 + `set-cookie: __Secure-paperclip-default.session_token=...; Path=/;
    HttpOnly; SameSite=Lax; Max-Age=604800; Secure` + 跟 next 重定向到登录态。
  - **debug log**：`[bridge] token=xxx URL=yyy` + `[bridge] ok|invalid_token|
    missing_token` adb logcat 抓 trace，定位真因用。
  - **测试**：`__tests__/app-web-login-bridge.test.ts` 加 2 个用例覆盖
    secure=true/false 时 cookie 名前缀。
  - **boss Claude 后 8 commit**：CMMI 治理 + ontology + 项目同步按钮（详见 server
    rebuild log）。

---

## v0.5.57

> Released: 2026-09-25 · OTA bundle only (no APK)

### 更新

- wave82 — 修 `scripts/runtime-version.mjs` aapt2 解析 bug (boss 27:03 OOB)
  - **根因**：expo-updates 把 `EXPO_RUNTIME_VERSION` 编译成 Android string resource，
    meta-data 里写的是资源引用 `@0x7f120082`，不是字面值。`aapt2 dump xmltree`
    看不到引用解析后的值，正则只吃字面字符串，静默回落 app.json 意图，
    publish-ota.sh 用错值 → 装机 App「下了不装」。
  - **修法**：切换到 `aapt2 dump resources` 读 `string/expo_runtime_version` 的
    default-config 值；xmltree 路径保留为 debug-only。
  - **测试**：`tests/ota-runtime/runtime-version.test.ts`（10 个用例）覆盖
    xmltree 资源引用返回 null、resources 解析多 config 优先级、
    `readApkRuntimeVersion` 端到端读到 0.5.56 真值。
  - **结果**：现在 `runtime-version.mjs` 读到 APK 真值，0.5.57 manifest 的
    runtimeVersion 不再漂移。

---

## v0.5.56

> Released: 2026-09-24 · Android release APK

### 更新

- wave80 — App 登录 ↔ Web 全功能 共享 (boss 26:59 OOB 「App 登录与 Web 全功能 登录不共享」)
  - **server 新增 `/api/auth/exchange`**：用 `expo-secure-store` 里的 session token 写 `Set-Cookie` 并 302 跳转到目标页，WebView 的 cookie jar 自动有登录态
  - **App 端 `signInEmail` 返 `{token, user}`**：登录后立即把 Better Auth 颁发的 session token 持久化到 `expo-secure-store`
  - **`WebContainerScreen` 注入 `?exchange=<token>`**：首屏加载前先拉一次 SecureStore，命中即让 WebView 走 bridge 链路，最终落地到 XROA 时已带 cookie，不再二次登录
  - **防 open redirect**：`next` 参数被限制为同源根相对路径，绝对 URL/协议相对 URL 一律回退到 `/`

---

## v0.5.55

> Released: 2026-09-24 · Android release APK

### 更新

- wave79 升级发版 boss Claude 后 3 commit (boss 26:57 OOB 「看看更新内容, 升级发版」)
  - **dashboard 丰富 (39751de35)**: 登录后首页新增快速操作入口 + 7天活动趋势图 + 任务进度条 + 员工状态卡 + 预算卡
  - **webcontainer 修双层导航 (8a2e632bb)**: 消除 WebContainer 内嵌双层导航, 仪表盘接入快速操作入口
  - **webcontainer Phase 3 沉浸优化 + i18n (443a9dbe0)**: 350+ 词条 i18n 补丁层 / 中文保活 / Paperclip 脱敏

---

## v0.5.54

> Released: 2026-09-24 · Android release APK

### 更新

- wave77 打包 boss Claude 4fbb4c92e 大改造 (boss 26:51 OOB 「打包发布」) — Hybrid WebContainer + 多源仓库 + 项目中心 + ontology parity
  - 新增 WebContainerScreen: 原生壳内嵌 Web 全功能工作台 (sharedCookies 免二次登录 / 导航控制 / 物理返回键 / 进度条 / 错误恢复), 入口: AppBar Web全功能, 项目 Web全量, 本体 Web图谱, 流水线
  - 新增 ProjectsScreen: 原生项目列表 (状态筛选 / Git-本地标签 / 指标卡)
  - NewProjectDialog 支持 4 源模式: Git URL / 本地目录 / GitHub OAuth / 无
  - normalizeProjectRepositoryUrl 兼容 Gitee / GitLab / 自建 Git
  - api-client: Project 类型增强, listIssues 增 projectId 过滤
  - plugin-ontology: Microsoft Ontology-Playground 功能对齐

---

## v0.5.53

> Released: 2026-09-24 · Android release APK

### 更新

- wave76 删 AppBar 中间设置齿轮图标 + 检查升级按钮 (boss 26:42 OOB 「首页 顶部 中间的设置按钮去掉」+ 26:44 OOB 「中间 设置+检查升级按钮去掉」): 验证 0.5.53 装包 (versionCode 553) AppBar 中间只有 Coolie工坊 标题, 无 设置/检查升级 按钮, 保留 🔔 通知 + 🔍 搜索 + 驾驶舱Web. 注意: AppBar.tsx 自 wave73 起本就没有这两个按钮, 0.5.53 release commit 主要是 bump 版本号 + CHANGELOG entry

---

## v0.5.52

> Released: 2026-09-24 · Android release APK

### 更新

- **wave75 生产 board chat 旧对话清理** (boss 26:39 OOB 「生产对话清理一下吧」): 老板装 0.5.51 后在工坊对话框看到旧历史 (含 'Paperclip' 旧自我称呼 + miniMax-M3 主动纠错回复). 这版清掉生产 server 上 `4cafeb9a-...` (xrobinai) 公司 created_at < 2026-09-22 的所有 board chat 评论 (软删保留 deleted_at + deleted_by_user_id audit) + chat_conversations 行. 备份在 `tc-coolie-claw:/tmp/board_chat_backup_20260924_*.sql`. 同时加了 server API `DELETE /api/board/chat/conversations?before=<ISO date>&companyId=<uuid>` (board actor 鉴权, 跟 wave59 PAPERCLIP_API_KEY 兼容) — 老板以后想再清可以走 API 或 `scripts/cleanup-board-chat-history.sh [BEFORE_DATE]`. 未改 issues / agents / users / companies, 未改 PAPERCLIP_API_KEY / PAPERCLIP_DEPLOYMENT_MODE.

---

## v0.5.51

> Released: 2026-09-24 · Android release APK

### 更新

- wave73 UI 文字精简: 保留 AppBar 中间标题 Coolie工坊 (boss 26:35), 删 ChatHeader 工坊标题 + 对话气泡 Coolie 智能体工坊 董事长助理 (boss 26:35), 删 底部驱动 5 角色员工 (boss 26:32)

---

## v0.5.50

> Released: 2026-09-24 · Android release APK

### 修复

- **wave74 修 Audio.Recording 多实例冲突 bug** (boss 26:36 OOB 「新任务 录音bug」): 老板装 0.5.48 APK 进任务 tab 长按 mic 弹错 `Only one Recording object can be prepared at a given time`。根因是 `useRecorder` hook 里 expo-av `Audio.Recording.createAsync()` 异步 + 多次按 mic 没串行 + 卸载时 native Recording 没释放。修法 (`clients/expo/src/useRecorder.ts`):
  - **Module-level singleton**: 把 native Recording 引用提到模块作用域, BoardChatScreen / VoiceInputButton / useVoiceInput 三处共享同一份录音对象, 杜绝多实例 race
  - **useEffect cleanup**: 卸载时如果还在录 → 静默 `unloadAsync` + 复位 iOS audio session (`Audio.setAudioModeAsync({ allowsRecordingIOS: false })`)
  - **并发 start() 防护**: `startPromise` 单例, 第二次按 mic 复用同一个 promise, 不再开新录音
  - **异常路径**: `createAsync` 失败立刻 reset audio mode + 清 ref, 下次按下不被「半成品」阻塞; `stopAndUnloadAsync` 5s timeout 兜底, finally 复位 audio session

---

## v0.5.49

> Released: 2026-09-24 · Android release APK

### 更新

- wave73 UI 文字精简 (boss 26:32 OOB 「左上角工坊 驱动5角色员工 这些描述都不要了」):
  - 删 AppBar 中间 "Coolie工坊" 标题 (`AppBar.tsx`), 仅保留左右两组 icon (通知/搜索 + 驾驶舱Web)
  - 删工坊对话框顶部 idle 状态 "驱动 5 角色员工" 副标题 (`ChatHeader.tsx` + `BoardChatScreen.tsx`), 仅保留 `thinking` / `streaming` 动态文案

---

## v0.5.48

> Released: 2026-09-24 · Android release APK

### 更新

- wave72 Sprint 1.1: OTA onboarding cache 测试 + 真验 — `scripts/test-onboarding-cache.sh` 端到端验证新公司 greeting 已 Coolie 化 + 老公司 snapshot 不迁移 + docs-coolie/OTA-ONBOARDING-CACHE.md 加 testing section + manual test plan

---

## v0.5.46

> Released: 2026-09-24 · Android release APK

### 更新

- P1 剩余 3 件：Inbox 5 分钟静默刷新 / 5 角色 description 全清 / git-ops App 端 4 屏 + PR card

---

## v0.5.45

> Released: 2026-09-24 · Android release APK

### 更新

- wave69: 本地员工跑活 — 收件箱强化 + 5 角色描述删 + 多 agent 编排设计

---

## v0.5.44

> Released: 2026-09-24 · Android release APK

### 更新

- wave68: DS git-ops 同步 (3 件 + 新表 + 真验)

---

## v0.5.43

> Released: 2026-09-24 · Android release APK

### 更新

- wave67: DS 同步 7 人格模板 (boss 25:18 '派' DS 能力同步)
  - 同步 SOUL.md / IDENTITY.md / USER.md / AGENTS.md / TOOLS.md / HEARTBEAT.md / BOOTSTRAP.md 7 件到 `packages/agents/role-templates/templates/`, 翻译到中文 + 替换 DigitalStaff → Coolie 智能体工坊
  - 新增 `user-context-paths.ts` (仿 DS CrushContextPaths)
  - server `loadAgentPersona(roleName)` 加载 7 模板
  - `agents` 表新增 `persona JSONB` 列, create agent 时自动物化
  - board chat spawn hermes 转发 `$AGENT_PERSONA_FILES` env

---

## v0.5.42

> Released: 2026-09-24 · Android release APK

### 更新

- wave66 P2 集中修 5 件 (boss 25:15 '派' audit P2)

---

## v0.5.41

> Released: 2026-09-24 · Android release APK

### 更新

- wave65 P1 集中修 3 件 (boss 25:09 '派' wave64 audit P1):
  - **收件箱彻底修复** — 收件箱 fetch 加退避重试 (2 次) + race-condition 守卫 (`loadReqIdRef`); 旧请求自动丢弃, 防止旧公司/旧 tab 数据覆盖新数据
  - **5 角色员工描述删** — AgentsScreen / AgentDetailScreen 列表/详情/编辑全删 `agent.title` 长描述渲染; clients/h5 `ForRow` / `ParticipantRow` chip 同步 (boss 25:00 '工坊 5 角色员工 描述都去掉')
  - **DS host-preview 端点补** — server `/api/tasks/host-preview/<sessionId>/?token=<jwt>&_t=<bust>` 同源代理; 见 `server/src/routes/tasks-host-preview.ts` (boss 09-23 24:38 续)

---

## v0.5.40

> Released: 2026-09-24 · Android release APK

### 更新

- wave63 汇览精简: 删驾驶舱效能标题+冗余 stat, 留 web 同款 4 张核心 StatTile (员工/任务/花费/审批); clients/h5 镜像同步精简 (boss 24:59 别叫驾驶效能舱)

---

## v0.5.39

> Released: 2026-09-23 · Android release APK

### 更新

- wave62 强制 LLM 回复不用 Paperclip: server/src/routes/board-chat.ts resolveCompanyPersonaLine 加身份要求 (强制) 块; loadBoardSkill 兜底英文模板加 HARD CONSTRAINT (boss 24:58 我是你的 Paperclip 董事会助手, 还是一样)

---

## v0.5.38

> Released: 2026-09-23 · Android release APK

### 更新

- wave61 onboarding-assets 模板替换 Paperclip: greeting.md 'Welcome to Paperclip' → '欢迎来到 Coolie 工坊'; chief-of-staff/AGENTS.md 'You have tools from Paperclip' → '你有来自 Coolie 工坊的工具'; SKILL.md 'first Paperclip task' / 'first task in Paperclip' → Coolie 工坊; default/AGENTS.md 'agent at Paperclip company' → Coolie 智能体工坊 (boss 24:57 '还是有这个')

---

## v0.5.37

> Released: 2026-09-23 · Android release APK

### 更新

- wave60 切身份 'Coolie 智能体工坊 董事长助理': server system prompt 模板前缀按 company 名注入 persona + 兜底移除 Paperclip 字面; clients/expo 顶部 persona 与欢迎语同步; hermes spawn env 加 COMPANY_NAME 透传 (boss 24:54 '咋还没切')

---

## v0.5.36

> Released: 2026-09-23 · Android release APK

### 更新

- wave59 真 PAPERCLIP_API_KEY 鉴权: server 加 x-paperclip-api-key 旁路 (boss 24:50 '我是你的 Paperclip 董事会助手' OOB); production PAPERCLIP_DEPLOYMENT_MODE=authenticated 不变, 同主机 App board concierge 透过该 header 调 127.0.0.1:3100/api/health + /api/companies/4cafeb9a-.../dashboard 实测 200

---

## v0.5.35

> Released: 2026-09-23 · Android release APK

### 更新

- wave56 真仿 DS PreviewWebView.tsx (134 行) 重写任务详情原型沙箱 (boss 24:40 '你确定认真学习 digitalstaff 的预览了吗, 最新的预览'): 删 wave55 仿错的 PreviewPanel 视口切换 (desktop/tablet/mobile), 改用 DS 真工具条 —— [关闭] + URL tag (LIVE / SNAPSHOT) + [刷新] (_t 防缓存换 bust) + [浏览器打开] (Linking.openURL) + RN WebView originWhitelist=["*"]。400 → 318 行
- 注明 DS sessionId-keyed host-preview 代理 (`GET /api/tasks/host-preview/<sessionId>/?token=<jwt>&_t=<bust>`) 与 OSS 快照 (`GET /api/ide-sessions/<id>/snapshots/by-task/<taskId>/url`) 是 DS 后端能力 —— 我们 server/src 缺这两个端点 (grep 验证), 本文件先用 service.url LIVE / workProduct.url SNAPSHOT 顶上, 后续补代理时把 resolvePreviewUrl() 内核换成 buildHostPreviewUrl 即可, 工具条 UI 不动

---

## v0.5.31

> Released: 2026-09-23 · Android release APK

### 更新

- 修收件箱 (boss 09-22 24:35 '收件箱咋又搞坏了'): 复核 `InboxScreen.tsx` 数据加载 — `coolie.getInbox` / `coolie.listIssues` / `coolie.listAgents` / `coolie.listProjects` / `coolie.archiveIssueFromInbox` 都已接真服务端点 (`/api/inbox`, `/api/companies/:id/issues`, `/api/issues/:id/inbox-archive`), 无 mock 数据; 真机 emulator 复测: 4 tabs 渲染、列表加载 boss 账号 34 条 issue、`xrobinai · 任务 34 · 审批 0 · @我 0` 头部胶囊正确

---

## v0.5.30

> Released: 2026-09-23 · Android release APK

### 更新

- 修 APK 签名 (release.keystore + v1+v2+v3 签名)

---

## v0.5.29

> Released: 2026-09-23 · Android release APK

### 更新

- 任务详情改在当前 tab 内渲染, 底部 5 tab 导航常驻 (boss 09-22 24:27 '任务列表点击进任务详情, 又是没底部导航了'); 收件箱点 issue 也留在收件箱 tab

---

## v0.5.27

> Released: 2026-09-23 · Android release APK

### 更新

- 换 MiniMax-M3 配置 (替代 GLM-5.3-flash): board chat 走 hermes minimax-cn provider, 真验 200 OK

---

## v0.5.26

> Released: 2026-09-23 · Android release APK

### 更新

- 工坊对话精简: 标题改「工坊」(原「驾驶舱智能问答」), 副标题「驱动 5 角色员工」, placeholder 精简为「派个活, 或问点什么」; 删顶部历史/设置/刷新三按钮 + 快捷 chips 行 + 状态绿点

---

## v0.5.25

> Released: 2026-09-23 · Android release APK

### 更新

- 收件箱 1:1 抄 Web: 4 tab + 过滤 + 富信息行 + 阻塞分组 + 快捷归档

---

## v0.5.24

> Released: 2026-09-23 · Android release APK

### 更新

- 修 board-chat 静默吞错 + concierge 评论持久化 + 充值指引

---

## v0.5.23

> Released: 2026-09-23 · Android release APK

### 更新

- 砍掉「工作空间」四 Tab 屏 (对话/预览/文件/终端), 工坊 (ChatHome) 一件到底: 再无 [工作空间] 入口, 对话/建单/预览都在工坊里完成

---

## v0.5.21 — commit `2594a71e8`

> Released: 2026-09-22 · Android release APK

### 更新

- 仿豆包新会话页 (空状态 + 模式切换 + 4 chip + 按住说话) + CreateTaskModal 两卡 + 语音转写入标题

---

## v0.5.18 — commit `9384c21af`

> Released: 2026-09-22 · Android release APK

### 更新

- App 打字后点其他按钮不再被吞: 全部 ScrollView 补 keyboardShouldPersistTaps=handled (login/register/composer/各列表页)

---

## v0.5.17 — commit `902122bab`

> Released: 2026-09-22 · Android release APK

### 更新

- App 端左缘右滑返回上一页 (不退 App): EdgeSwipeBack 左缘手势 + 系统返回键/手势导航内滑映射为 App 内返回, 详情/浮层/设置逐层退回, tab 间保留历史
- 修 Alert dialog queue: OTA 不再堆 20+ 条「更新就绪」弹窗排队

---

## v0.5.16 — commit `00ac4c646`

> Released: 2026-09-22 · Android release APK

### 更新

- App 端左缘右滑返回上一页 (不退 App): 新增 EdgeSwipeBack 左缘手势, 详情/浮层/设置逐层退回, tab 间保留历史
- 修系统返回键不退出 App: BackHandler 映射为 App 内返回

---

## v0.5.15 — ⚠️ NOT RELEASED — release commit `dfd328db3`（后 revert 再以 `1c3d08e99` 重放）

> Tagged: 2026-09-22 · ⚠️ APK 实际未发出（见下方说明）

### 更新

- 新建任务浮层 1:1 抄 Coolie Web NewIssueDialog 全字段: 复核人/审批人/看守(+指令) / 指派人模型通道·模型·思考档·--chrome / 执行工作区 / 三条建单提示 / 语音按钮(长按说话转写入标题)

> ⚠️ **本版 APK 实际没真发**（wave27 披露）: wave26 的 release commit 只 bump version + 写 CHANGELOG，
> 跳过了 `scripts/release-app.sh` 的 export / gradle assembleRelease / coscli 上传 / version.json 4-9 步。
> 真正的 release 是 0.5.16 之后才发出。

---

## v0.5.14 — commit `7f5184861`

> Released: 2026-09-22 · Android release APK

### 更新

- 新建任务浮层对齐 Coolie Web NewTaskDialog 全功能: 面包屑标题栏(XROA › New task + 全屏↗ + ✕) / 状态可选并随建单提交 / ⋯二级菜单(标签·信任策略·Markdown编辑器) / 放弃草稿+创建任务双按钮

---

## v0.5.13 — commit `ef493204d`

> Released: 2026-09-22 · Android release APK

### 更新

- 新建任务浮层补齐 Assign(指派人)/项目/执行模式(Mode)/附件 4 字段 — 复用 Coolie Web NewIssueDialog 存量字段与 API 契约

---

## v0.5.12 — commit `536c98489`

> Released: 2026-09-22 · Android release APK

### 更新

- 删除独立的「语音派发」按钮 (全局顶栏 + 新建任务 composer), 只保留会话内长按 mic; 新建任务浮层让出底部导航

---

## v0.5.11 — commit `50d74b7e9`

> Released: 2026-09-22 · Android release APK

### 更新

- 会话内长按 mic 自动转文字, 用户确认后发送

---

## v0.5.10 — commit `6dd65a90c`

> Released: 2026-09-22 · Android release APK

### 更新

- 任务页顶部 3 按钮组: Build 5 步链(就地五步链进度卡) / Pipeline(列表+深链Web编辑器) / Plan(计划任务列表)

---

## v0.5.9 — commit `c41918949`

> Released: 2026-09-22 · Android release APK

### 更新

- 工坊对话智能识别: 建 pipeline / plan / 开 pr 解析后分发到 pipeline 创建 / plan 任务 / GitHub PR workflow

---

## v0.5.8 — commit `87f4dc92e`

> Released: 2026-09-22 · Android release APK

### 更新

- 任务 tab 抄 Coolie Web Tasks 页: 搜索 + 6 视图 (列表/看板/分列/漏斗/排序/分层) + TODAY/YESTERDAY/EARLIER 分组 + [+ 新建任务] 表单 + 顶栏语音派发按钮

---

## v0.5.7 — commit `0e972f48d`

> Released: 2026-09-21 · Android release APK

### 更新

- 语音派发接通: 驾驶舱对话内录音 -> 腾讯ASR 转写 -> 自动建任务; 修复装机 App 连不上实例 (EXPO_PUBLIC base URL 未内联)

---

## v0.5.6 — commit `60e32c93c`

> Released: 2026-09-21 · Android release APK

### 更新

- 语音派发: 驾驶舱对话内录音 -> 腾讯ASR转写 -> 自动建任务 (BoardChatScreen 麦克风按钮)

---

## v0.5.5 — commit `2ddfd85fe`

> Released: 2026-09-21 · Android release APK

### 更新

- **对齐 Coolie Web 风格 (wave10, boss: 参考web做expo)** — 顶部换成原生 appBar (居中标题 "Coolie工坊" + 右侧 [驾驶舱Web] 跳 `coolieweb://` 深链到 Coolie Web App); 底部换成 5 项 tab bar: 汇览 / 任务 / 中央 "+" (新建任务屏) / 员工 / 收件箱。
- **主题色统一** — 颜色令牌抽到 `src/theme.ts`, 与 Coolie Web 完全一致 (bg `#08090A` / panel `#0F1011` / accent `#5E6AD2`)。
- 工坊(对话) / 本体 / 产物 不再占底部栏, 从任务页顶部图标行进入 (入口换位置, 能力不减)。
- **登录修复 (wave7)** — 装机自检 (What's New) 屏提到 App 顶层, 启动即弹 (登录前也弹, 之前挂在 HomeScreen 里未登录永远不弹); 切换「邮箱密码 / API Key」时清空输入并显示 ready 提示, 按钮不再「看起来没反应」。

---

## v0.5.2 — commit `c8e82a0db`

> Released: 2026-09-21 · Android release APK

### 更新

- 装机自检 What's New 屏 + coolie:// 深链 + ChatHome 收编 + e2e 冒烟 3 条

---

## v0.5.1 — commit `05b090cb4`

> Released: 2026-09-21 · Android release APK

### 更新

- ChatHome 预览 + 工作空间 + 本体规范工作流 (SpecDiffCard)

---

## v0.5.0 — commit `8a9e984a5`

> Released: 2026-09-20 · Android release APK

### 更新

- DS build mode + pacing rules + 安全审计 + 阶段 B/C 重组

### 构建模式（DS 式构建）

- 工坊对话里发「build xxx / 开发 xxx / 做 xxx」，自动拆成五步构建链：需求梳理 → 方案设计 → 编码实现 → 测试验收 → 发布上线。每步开一张卡并按环节派给对应类型的员工，前一步完成才唤醒下一步。
- 聊天流内新增**构建进度卡**：五步链 + 每步状态徽标，点环节可直达任务详情。

### 派发限速（限流冷却）

- **按 worker 限速**：同一员工两次派发之间强制冷却——cmd 型默认 3 分钟、claude 型 30 秒。冷却期内的环节挂起, 等下一个可用档期, 不再背靠背连发去撞上游的每分钟限流。
- 进度卡显示**「等待限流冷却 · 剩余 Xm Ys」**并逐秒倒计时, 等待是可见的, 不会被误判成卡死。
- 策略外置在 `server/src/config/build-orchestrator.json`, 改配置即生效, 无需重启。

### 本体驱动构建（建域）

- 工坊对话里发「建域 xxx / 建模 xxx / domain xxx」，自动产出一份**本体规范**（对象类型 + 属性 + 关系），
  聊天流内新增**规范预览卡**：逐对象类型列出 `字段名: 类型`，超出部分折叠计数，附建模建议。
- **审批前不写库**：这一步只在控制面留下一个构建 issue 和一条待审批（`ontology_spec`），
  本体里什么都没有；审批通过后才由服务端调本体插件落域/对象类型/关系类型。
- **规范即本体文档**：格式直接复用 `@paperclipai/ontology-core` 的 `paperclip.ontology/1` 文档，
  合法性由插件自己的 `validateDocument` 判定，客户端与服务端都不另立一份词汇表。
- 规划器不可用、输出不合格式、或插件拒收时，如实显示**未产出规范**并列出原因，不留半成品。
- 落库幂等：同一 slug 重复落地只得到一个域；slug 已被手工域占用时明确报冲突而不是覆盖。

---

## v0.3.5 — commit `2023ae59e`

> Released: 2026-09-20 · Android release APK

### 更新

- 热修: 语音派发 Object is not a function

---

## v0.3.4 — commit `99b2bcf3e`

> Released: 2026-09-20 · Android release APK

### 更新

- release keystore signing

---

## v0.3.3 — commit `ae0530748`

> Released: 2026-09-20 · Android release APK

### 更新

- 原型沙箱: 轻量直开模式(无容器时直接预览 URL + 手填地址)
- 重构: 抽取 12 个共享 UI 组件(AppCard/EmptyState/ErrorRetry/LoadingState/ScreenHeader/SectionHeader/Pill/StatusBadge/SegmentedControl/Sheet/StatTile/KeyValueRow)与 useAsync hook
- 修复: 审批卡点击正确切到任务页(审计 bug 1)

---

## v0.3.2 — commit `5aec7285b`

> Released: 2026-09-20 · Android release APK

### 更新

- 语音派发录音停止修复 + 录音中按钮可点

---

## v0.3.1 — commit `fd99bdcf5`

> Released: 2026-09-20 · Android release APK

### 更新

- 审批点击化 V1+V2: Dashboard 行→详情弹卡，聊天流内嵌 Approve/Reject 按钮 + 详情深链

---

## v0.3.0 — commit `ce1c050bf`

> Released: 2026-09-19 · Android release APK

### 导航与信息架构

- **底部五导航定稿** — 汇览 · 员工 · 工坊 · 任务 · 本体；产物入口收进任务页右上角。
- **全局设置** — 五页右上角常驻齿轮：我的名片（身份/角色/版本徽章）、版本与 OTA 更新、缓存清理、退出登录。
- **应用内升级** — 启动自动检查 `xrobinai.cn/version.json`，新版本弹升级卡片一键下载，告别手动复制链接。
- **Android 适配** — 全屏状态栏避让修复（标题/刷新不再顶到顶）。

### 汇览（统计）

- 待办审批卡（pending 红点角标）· 实时运行卡 · 最近事件时间线。
- 员工维度 Token 用量（输入/缓存/输出/计费）+ 任务树消耗行。

### 员工

- 员工详情浮层：Token 用量卡 · 改头衔 · 暂停/启用（手机端 agent 编排）。
- 技能与配置只读展示 · 最近任务 5 条 · 全部/在线/异常筛选。

### 工坊（对话）

- 后端切换为 **Hermes (GLM) 总办**，摆脱 claude CLI 依赖。
- 会话历史 · 空态快捷提问（花销/员工/审批/交付）· 长按复制。

### 任务

- 列表/看板双视图：看板四列状态，点卡片推进状态，长按改优先级。
- 任务详情：评论流（可回复）· 附件列表 · 消耗统计。

### 本体

- 域生命周期过滤（全部/运行中/草稿/归档/锁定）。
- **关系图谱环形拓扑** — 点击节点查看 Properties Schema 检视卡。
- 空库一键注入微软 Ontology-Playground 示例域（7 个）。

### 产物

- 大图预览浮层 · 按员工筛选。

### 服务端

- 工坊对话 relay 迁移 Hermes；本体/对话/diff 插件自托管默认安装。

---

## v0.2.0 — commit `f963d74c3`

> Released: 2026-09-19 · Android release APK

### 新增功能

- **效能仪表盘** — 六大核心效率指标卡片 + 下拉刷新（车间效率、失败率、交付周期等）。
- **代码查看器** — 内嵌 CodeMirror 6，高亮阅读代码与 Diff；配套 UnifiedDiffViewer 虚拟化滚动。
- **本体域控制台** — 业务本体域列表 + 状态管理，附 EmergencyKillSwitch 紧急熔断开关。
- **产物中心** — 产物卡片流展示（ArtifactsScreen）。
- **原型沙箱** — 内嵌 WebView 预览原型（PrototypeSandboxScreen）。
- **看板聊天流** — 看板消息流式渲染 + QuickApprovalCard 快速审批卡片。
- **OTA 增量更新** — expo-updates 自托管 manifest（`https://xrobinai.cn/ota/manifest`），ON_LOAD 自动检测。
- **Linear 设计系统** — 深色控制平面视觉统一。

### 技术说明

- Expo SDK 52（expo@52.0.0），runtimeVersion 采用 appVersion 策略。
- 依赖修正：expo-updates@0.27.5、expo-constants@17.0.8、expo-image@2.0.7（对齐 SDK52）。

---

## v0.1.0 — commit `608de91a9`

> 初始版本（品牌化 Coolie，一期 5 个 Bug 修复后基线）。
