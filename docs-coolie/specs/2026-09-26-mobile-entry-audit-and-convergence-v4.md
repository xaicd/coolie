# 移动端入口审计与收敛规格 v4.0 (Entry Audit & Convergence)

- **文档编号**: SPEC-COOLIE-MOBILE-002
- **版本**: v4.0.0 (对 SPEC-COOLIE-MOBILE-001 v3.1.0 的修订)
- **创建日期**: 2026-09-26
- **触发**: boss 22:14 OOB「更复杂了」+ 22:4x「原生 APP 入口没有重构成功，只是在堆加东西」
- **审计范围**: 5 Tab + AppBar + 路由面全量入口（175 个可点入口逐一点名）

---

## 1. 审计结论：堆加是事实，不是感觉

全量盘点（2026-09-26，HEAD `0df9e3c86`）：

| 屏 | 入口数 | 判定 |
|---|---|---|
| Tab 1 汇览 | 20 | **5 个重复入口指向项目中心**；工坊/本体/流水线各出现 2 次 |
| Tab 2 任务 | 39 | 6 个「编排钮」把工程工具箱混进任务流 |
| Tab 3 派工 | 12 | 健康，无收敛需求 |
| Tab 4 工坊 | 26 + **4 处死 UI** | 历史抽屉 `setShowHistory` 永不被调用；Workspace/返回钮永不渲染 |
| Tab 5 资产 | **48** | 三个产品塞一个 Tab（本体 25 + 员工 8 + 产物 15）+ 2 个 header pills |
| ProjectsScreen | 28 | CMMI 六宫格 + 5 个重复深链（G4→SPC 与「SPC 控制」同目标） |
| App.tsx | 8 TabKey 只渲染 5 | `inbox` 挂载但**不可达**；InboxScreen 是死路由 |

**v3.1.0 的失效原因**：它用 EARS 写了「零怪异按钮」（一次性删除），但没有写**入口预算**——之后每个 wave 的 diff 都是 `+1 卡片/+1 pill/+1 瓷砖`，没有任何机制拦截加法。spec 管住了「不许出现什么」，没管住「不许超过多少」。

## 2. 收敛原则：老板三时刻 + 单一真入口

每个入口必须归入四类之一，否则降级或删除：

- **花钱**：成本/预算 —— 唯一真入口在 Tab 1
- **卡点**：审批/待办 —— 主入口 AppBar 🔔 + 任务 Tab 浮卡，其余全部为深链消费场景
- **失控**：熔断/回滚 —— 公司级在 Tab 1 header，域级在本体详情内
- **资产**：本体/项目/员工/产物 —— 唯一真入口在 Tab 5

**重复入口一律删除，只留最短路径的那一个。**

## 3. 需求与 EARS 验收标准

### 3.1 Tab 1 汇览收敛（20 → ≤10）
- **R1.1** 首屏只保留：熔断 header 钮、4 张 StatTile、本体态势卡、成本燃尽卡、审批待办卡。
- **EVENT-01**: WHEN 汇览屏渲染完成, 系统应当呈现 **≤6 个导航类入口**（不含 StatTile 整块与下拉刷新）。
- **EVENT-02**: WHEN 任何入口的目标地已有更短路径可达（TabBar 或 AppBar）, 系统应当**删除该入口**——具体：quick chips×6、quick actions×4、项目中心入口卡、CMMI footer×2 全删。
- **STATE-01**: WHILE 设置与「检查更新」入口存在, 它们应当只出现在 SettingsSheet 内, 不得占用汇览首屏。

### 3.2 Tab 2 任务收敛（39 → ≤30）
- **R2.1** 删除 header 4 icons（工坊/本体/产物/设置——AppBar 与 TabBar 已覆盖同目标）。
- **R2.2** 6 个编排钮收敛为 1 个「工程 ▾」（Build/Pipeline/Plan/CMMI 深链收进抽屉）；「项目」「仓库绑定」移入 Tab 5 项目段。
- **EVENT-03**: WHEN 任务屏首屏渲染, 导航类入口应当 ≤5（搜索、视图切换、FAB、工程 ▾、审批浮卡）。

### 3.3 Tab 4 工坊死代码清理
- **EVENT-04**: WHEN 代码库中存在不可达 UI（无 opener 的抽屉/按钮/路由）, 发布前应当删除或修复激活——本轮：会话历史抽屉（修复为 header 可开）、Workspace 钮、ChatHeader 返回钮、`onOpenSettings` 死解构、InboxScreen 不可达路由（给 🔔 通知页让出深链槽位或删除）。

### 3.4 Tab 5 资产收敛（48 → ≤36）
- **R4.1** 删除 header 2 pills（例行计划→Tab 1 快捷、成本核算→Tab 1 成本卡）。
- **R4.2** 本体段「注入示例域」从 header 降级到空态；新建 Modal 内部按钮记账但不算导航预算。
- **EVENT-05**: WHEN 任一资产子屏渲染, 其首屏导航类入口应当 ≤8。

### 3.5 全局预算与守门（防止复发）
- **UBIQUITOUS-10 (zero-net-add)**: 系统应当维持「新增一个导航入口必须删除或降级一个等价入口」的净零规则。
- **UBIQUITOUS-11 (入口预算)**: 全 App 导航类入口总数应当 ≤120（当前基线 175, 含 Modal 内功能钮）。
- **G2 门禁**: `node scripts/check-mobile-entry-budget.mjs`（新增, grep `onPress|onPressIn` 计数对照 `scripts/mobile-entry-budget.json`）在每次触及 `clients/expo/src/screens/**` 的 PR 中通过。
- **G3 门禁**: `clients/expo` tsc 0 错误 + Metro bundle 导出通过（沿用 v3.1.0）。

### 3.6 App.tsx 结构化（1680 行）
- **R6.1** 路由表、返回栈、Modal 注册拆分为 `src/navigation/` 独立模块；App.tsx 仅保留装配。
- **CONSTRAINT-01**: 拆分不得改变任何 EARS 既有的行为（纯结构重构, 零功能变更）。

## 4. 实施顺序（建议 3 个独立 wave）

1. **wave A 删除+死代码**（纯减法, 零新功能, 风险最低）: EVENT-02/04 + 3.4 前半。
2. **wave B 重组**: 3.1 / 3.2 / 3.4 剩余 + ProjectsScreen 重复深链去重。
3. **wave C 守门+拆分**: 3.5 预算脚本 + 3.6 App.tsx 拆分。

## 5. 基线快照（2026-09-26, 供预算脚本对照）

| 文件 | 可点入口 | 预算 |
|---|---|---|
| DashboardScreen.tsx | 20 | 10 |
| TasksScreen.tsx | 39 | 30 |
| NewTaskPage.tsx | 12 | 12 |
| BoardChatScreen.tsx | 26 | 22 |
| OrgAssetsScreen.tsx | 48 | 36 |
| ProjectsScreen.tsx | 28 | 24 |
| AppBar.tsx | 2 | 2 |
| **合计** | **175** | **≤136** |
