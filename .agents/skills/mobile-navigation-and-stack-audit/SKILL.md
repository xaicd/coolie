---
name: mobile-navigation-and-stack-audit
description: Coolie 移动端无感就地导航、LIFO 调用栈完整性与防乱跳审计技能。用于排查或重构移动端页面跳转、修复实体跨 Tab 乱跳、保持调用方上下文不丢失、受控管理复合屏子 Tab 状态、以及使用 agent-device 驱动 Android/iOS 模拟器进行端到端点击快照审计。
---

# 移动端无感就地导航与调用栈完整性审计技能 (Mobile Navigation & Stack Audit)

本技能用于规范和指导 Coolie 移动原生端（React Native / Expo）的页面流转与架构治理，彻底消灭“跨 Tab 传送门”与“上下文丢失”问题。

---

## 1. 核心架构原理 (Architecture Design)

移动端与 Web 端的本质区别在于**空间维度认知**：
- **Web 端**：页面以单 URL 线性驱动（如 `/tasks/:id`），页面跳转通常伴随浏览器 History 入栈；
- **移动端**：**底栏 5 大槽位是永久的空间锚点**，实体详情（如工单、员工、审批、代码对比）在心智上属于**临时检视（In-place Inspector）**，而非目的地。

### 1.1 顶层抽屉化三元链 (Top-Level Overlay Chain)
所有实体详情必须提升为 `App.tsx` 外层 Shell 的顶层抽屉，其优先级高于底栏 Tab 分支：

```tsx
// clients/expo/App.tsx
content = (
  <SafeAreaView style={styles.shell}>
    {/* 全局顶栏: 当存在二级页面或实体详情时隐藏，由各子屏 ScreenHeader 承载返回 */}
    {!hasSubHeader && <AppBar ... />}

    <View style={styles.shellContent}>
      {focusedApprovalId ? (
        <ApprovalFocusDetail ... />
      ) : selected ? (
        taskDetail // 顶层任务详情抽屉
      ) : agentDetail ? (
        <AgentDetailScreen ... />
      ) : searchOpen ? (
        <SearchScreen ... />
      ) : notificationsOpen ? (
        <InboxScreen ... />
      ) : ...
      ) : tab === "dashboard" ? (
        <DashboardScreen ... />
      ) : tab === "tasks" ? (
        <TaskKanbanScreen ... />
      ) : null}
    </View>

    {/* 底栏 5 大槽位常驻 */}
    <TabBar tab={tab} onChange={...} />
  </SafeAreaView>
);
```

### 1.2 绝不横跳规则 (Inspect In-Place)
当用户在收件箱、全局搜索、工坊 Chat、产物列表、计划中心点击任意工单时：
- ✅ **正确**：仅设置 `setSelected(issueItem)`，浮层自然就地盖上；
- ❌ **严重违规**：调用 `navigateTab("tasks")`！这会破坏调用方所处的 Tab，导致返回时永久迷失在任务看板。

---

## 2. 状态受控与调用栈出栈铁律 (LIFO Stack & Controlled State)

### 2.1 复合视图状态提升 (Controlled Sub-Tabs)
凡是包含内部 Tab 的多标签复合屏（如 `OrgAssetsScreen` 的本体/架构/项目/员工/产物，`InboxScreen` 的全部/@我/审批/阻塞）：
- **反模式**：内部维护 `useState(initialTab)`。当打开全屏代码审查（`CodeDiffScreen`）或沙箱时，父组件卸载；关闭后重新以 `initialTab` 挂载，用户被莫名踢回第 1 个 Tab。
- **正解**：在 `App.tsx` 提升状态，以受控属性传递：
  ```tsx
  const [assetsTab, setAssetsTab] = useState<OrgAssetTab>("ontology");

  // 挂载
  <OrgAssetsScreen
    activeTab={assetsTab}
    onTabChange={setAssetsTab}
    ...
  />
  ```

### 2.2 出栈与手势返回对齐 (SwipeBack & HardwareBack)
出栈函数必须与视觉层级严格逆向匹配（LIFO）：
```tsx
const swipeBack = (): boolean => {
  // 1. 浮层与子模态优先退出
  if (diffContext) return setDiffContext(null), true;
  if (focusedApprovalId) return setFocusedApprovalId(null), true;
  if (selected) return setSelected(null), true;
  if (agentDetail) return setAgentDetail(null), true;
  if (searchOpen) return setSearchOpen(false), true;
  if (notificationsOpen) return setNotificationsOpen(false), true;
  ...
  // 2. 实体与模态退完后，退 Tab 历史
  if (tabHistoryRef.current.length > 0) return goBackTab(), true;
  // 3. 最外层交由防误触机制处理
  return false;
};
```

---

## 3. 真机端到端审计走查 SOP (Using `agent-device`)

当重构或新增涉及页面流转的能力时，必须在 Mac 宿主机 Android 模拟器上跑通以下闭环测试并截图存证：

### 3.1 核心审计场景
1. **大盘审批直达**：Dashboard 点击「待审批」-> 必须直达收件箱审批 Tab -> 点击返回 -> 必须回到 Dashboard；
2. **全局搜索闭环**：顶栏搜索 -> 输入关键字并出现联想 -> 点击工单 -> 进入详情 -> 点击【‹ 返回】-> 必须留在搜索结果页（输入框关键字不丢失）；
3. **收件箱穿透闭环**：收件箱点入工单 -> 详情页返回 -> 必须回到收件箱原位置（不切到任务 Tab）；
4. **产物与沙箱切页**：进入资产「产物」Tab -> 点击「代码」-> 查看 Diff -> 点击返回 -> 必须依然停留在「产物」Tab（绝不跌落回本体）；
5. **两字按钮一致性**：所有返回动作必须收敛为【‹ 返回】或【返回】，严禁出现多余修饰词。

### 3.2 自动化驱动指令示例
```bash
# 1. 宿主机截屏与快照
bash scripts/host-exec.sh "/opt/homebrew/bin/agent-device --serial emulator-5585 snapshot"
bash scripts/host-exec.sh "/opt/homebrew/bin/agent-device --serial emulator-5585 screenshot /Users/mac/workspace/xaicd/coolie/screenshots/audit/xxx.png"

# 2. 模拟点击与输入
bash scripts/host-exec.sh "/opt/homebrew/bin/agent-device --serial emulator-5585 tap @e20"
bash scripts/host-exec.sh "/opt/homebrew/bin/agent-device --serial emulator-5585 fill @e21 '看板'"
```

---

## 4. 门禁验证与交付合规

改动完成后，必须依次执行并通过：
1. `cd clients/expo && npx tsc --noEmit`（0 编译报错）；
2. `bash scripts/check-governance-audit.sh`（全面通过第 12 项调用栈完整性门禁）；
3. 将高分辨率截图归档至 `screenshots/audit/`。
