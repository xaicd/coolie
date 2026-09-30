# wave167 ScreenContainer 规格 (10 个屏统一包 TabBar + StatusBar)

- **文档编号**: SPEC-COOLIE-MOBILE-007 (续 SPEC-COOLIE-MOBILE-002 v4.0)
- **wave**: wave167
- **触发**: boss 报告 10 个屏「没 TabBar, 违反硬规矩」
- **设计**: 把 shell-level 单 TabBar **下放**给每个屏, 新增 `<ScreenContainer>` 抽象。
- **范围**: 列出 10 个屏 + 5 个连带屏 (Dashboard/Tasks/TaskDetail/Projects/Pipelines/Plans/Sandbox/SpecEditor/WebContainer/ApprovalFocusDetail) — 因为 shell TabBar 移除后必须有人补。

> 与 brief 的「10 个屏」关系: brief 点名 10 个。决策 = 抽象 ScreenContainer 后, **凡是挂载在 shellContent 里的屏都统一套上** —— 不然壳层 TabBar 删了, 这 10 个之外的屏 (Dashboard 等 5 tab 主屏) 就裸奔。**「10 个」是 brief 的「点名」, 不是「排除其他」**。

---

## 1. 现状 (2026-09-30 摸底)

`clients/expo/App.tsx` 当前:
- 唯一 `<TabBar>` 渲染在 `shellContent` 之后, 走 flex 流贴底
- 所有挂在 shellContent 里的屏共享这个 TabBar
- 屏文件层看不到自己的 TabBar, 改屏要碰 shell

**实测**: 5 tab 在所有屏都见 (含 brief 提的 10 个), 没有「TabBar 缺失」问题。但 brief 想要的「每屏自带 TabBar」硬规矩没有显式落到屏文件。

## 2. 需求与验收

### 2.1 新增 `ScreenContainer` 组件

**REQ-1**: `clients/expo/src/components/ScreenContainer.tsx` 新文件, 导出 `<ScreenContainer>` + 类型。

**EARS**:
- **EVENT-01**: WHEN 调用 `<ScreenContainer tab={tab} onChange={onChange} onCreate={onCreate}>{children}</ScreenContainer>`, THEN 必须渲染 (a) SafeAreaView + Android paddingTop, (b) `<StatusBar style="light" />`, (c) `children`, (d) 底部 `<TabBar tab onChange onCreate>` —— 顺序自上而下。
- **EVENT-02**: WHEN `nested={true}`, THEN **不**渲染 `<TabBar>` (只渲染 SafeAreaView + StatusBar + children) —— 给 OrgAssetsScreen 内部 4 个 segmented 子层 (Ontology/Projects/Agents/Artifacts) 用, 避免双层 TabBar。
- **EVENT-03**: WHEN 屏挂载在 shellContent 里, THEN 屏必须能被 `tab` prop 拿到当前活动 tab, 这样底栏高亮态正确。

### 2.2 改 `App.tsx` shell

**REQ-2**: shell 移除底部 `<TabBar>` (line 1257-1283), 改由每个屏自带。

**EARS**:
- **EVENT-04**: WHEN `App.tsx` 渲染 shell, THEN 不再在 shell 层挂 `<TabBar>`, 转由每个屏的 `<ScreenContainer>` 挂。
- **EVENT-05**: WHEN 用户在任一屏底栏点击 `onChange(key)`, THEN 必须重置所有 subpage state (composeOpen / selected / projectsOpen / pipelinesOpen / plansOpen / agentDetail / gitCredentialsOpen / searchOpen / notificationsOpen / focusedApprovalId / createTaskProjectId / tasksFilterProjectId / sandboxContext / diffContext / webContainerTarget / specIssue / onboardingOpen) + `navigateTab(key)`。
- **EVENT-06**: WHEN 用户点中央 `+`, THEN 触发 `setComposeOpen(true)`。

### 2.3 改 10 个屏文件 + 5 个连带屏

**REQ-3**: brief 列出的 10 个屏 + 5 tab 主屏 (Dashboard/TaskKanban/TaskDetail/BoardChat/OrgAssets) + 7 个子屏 (AgentDetail/Notifications/Search/GitCredentials/Pipelines/Plans/Projects/Sandbox/CodeDiff/WebContainer/SpecEditor/ApprovalFocusDetail) — 共 22 个屏, 全部接受 `tab/onChange/onCreate` props。

**EARS**:
- **EVENT-07**: WHEN 屏挂载, THEN 屏的 `<SafeAreaView>` 替换为 `<ScreenContainer tab={...} onChange={...} onCreate={...}>{原来的内容}</ScreenContainer>` —— 屏文件层显式声明 TabBar 归属。
- **EVENT-08**: WHEN 屏嵌在 OrgAssetsScreen segmented 子层 (Ontology/Projects/Agents/Artifacts), THEN 用 `nested={true}` —— 内部不渲染 TabBar (外层 OrgAssetsScreen 已渲染)。

### 2.4 QA

**REQ-4**: 模拟器装 APK (当前 bundle 0.6.5 + OTA), 走遍下列 10 个屏, 每个屏截图, 确认:
- 底部 5 tab + 中央 FAB 可见
- 5 tab 高亮态正确 (与活动 tab 对齐)
- 切 tab 时子页正确 reset
- 点中央 "+" 弹出 composeOverlay

**EARS**:
- **EVENT-09**: WHEN 截图 10 个屏, THEN 每个屏底栏 `汇览·任务·[+]·工坊·资产` 必须 5 个图标 + 中央 FAB 全见, 且只有 1 个高亮。
- **EVENT-10**: WHEN 从「数字员工」屏点底栏「任务」, THEN 必须直达 TaskKanban 根界面 (没有 agent detail 子页残留)。

## 3. 边界 / 例外

### 3.1 NewTaskPage (composeOverlay)
- 浮层, 当前 `bottom: TAB_BAR_HEIGHT` 让位给 shell TabBar
- 新方案: 浮层内 ScreenContainer 自带 TabBar, `bottom` 改 `0`
- 副作用: 浮层高度会短 64px (TAB_BAR_HEIGHT), 浮层内容底部不与 TabBar 重叠

### 3.2 InboxScreen (孤儿)
- `clients/expo/src/screens/InboxScreen.tsx` 定义但 `App.tsx` 没 import (SPEC-COOLIE-MOBILE-002 v4.0 EVENT-04 已点名)
- 仍按 brief 7 号屏要求包 `<ScreenContainer>` 内部, 不删 (h5 客户端可能在用, 改动最小)
- App.tsx 不 import, 仅维持 wrap

### 3.3 不动 release / 版本
- 当前 `clients/expo/app.json` version 0.6.5, versionCode 605 (并发 session 留的)
- brief 说「发版 0.6.4」, 与现状不符
- **决策**: 不擅自动 app.json / package.json; release-app.sh 由 PM 协调并发 session 后再跑
- OTA 当前 bundle (wave214 修) 已发, 设备装机 0.6.5 自动拉到

## 4. 文件改动清单

| 类型 | 路径 | 内容 |
|---|---|---|
| 新增 | `clients/expo/src/components/ScreenContainer.tsx` | ScreenContainer 组件 (~50 行) |
| 改 | `clients/expo/App.tsx` | 1) 加 `resetSubpages` helper; 2) 删 shell TabBar; 3) 给每个屏 mount 处套 `<ScreenContainer>`; 4) composeOverlay.bottom 改 0 |
| 改 | 22 个屏文件 | `<SafeAreaView style={styles.safeArea}>` → `<ScreenContainer tab={tab} onChange={onChange} onCreate={onCreate}>...</ScreenContainer>` |
| 改 | `OrgAssetsScreen.tsx` | 加 `nested` prop 透传到 4 个子层 (Ontology/Projects/Agents/Artifacts) |

## 5. 风险

| 风险 | 缓解 |
|---|---|
| 屏文件改一行容易漏 (22 个) | 用 Edit tool + grep 验证; 漏一个 = 该屏 TabBar 双重 |
| 双 TabBar (屏自带 + shell 没删干净) | 测试时专门 uiautomator dump 验「底部 1 个 NavBar 节点」 |
| StatusBar 双重 (屏自带 + ScreenContainer) | expo-status-bar last-wins, 无视觉问题, 接受 |
| App.tsx 改动大 (~100 行) | 用 Edit 一次只改一处, typecheck 跟 |
| 0.6.4 vs 0.6.5 release 不一致 | 不动 app.json; 报告里说清 |

## 6. QA 产物

- `docs-coolie/evidence/wave167/screens/01-agent-detail.png`
- `docs-coolie/evidence/wave167/screens/02-agents.png`
- ... 共 10 张
- `docs-coolie/evidence/wave167/QA-REPORT.md` — 汇总 10 张验证 + uiautomator 节点证据
