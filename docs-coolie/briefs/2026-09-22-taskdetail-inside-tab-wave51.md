# Brief: wave 51 — TaskDetailScreen 不跳出 5 tab 框架 (boss 24:27 '任务列表点击进任务详情, 又是没底部导航了')

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-22 24:27 OOB 「任务列表点击进任务详情, 又是没底部导航了」

老板装 0.5.26 后点任务列表里某个任务 → TaskDetailScreen 整屏覆盖, 底部 5 tab 不渲染.

## 1. 已知现状 (PM 09-22 真查)

```
clients/expo/App.tsx render 逻辑:
{selected ? <TaskDetailScreen> : <5 tab content>}

(从 0.5.21 起就这样, 之前 wave22 修过 '浮层不挡底部 nav' 但只针对中央 + composer 浮层,
TaskDetailScreen 用 selected state 整屏覆盖, 跳过 5 tab 框架, 底部 nav 没了)
```

## 2. 目标

**Coolie工坊 0.5.29 App** TaskDetailScreen 不跳出 5 tab 框架:

A. 选 task → 不覆盖全屏, 而是**在当前 tab 内显示详情 (跟 Coolie Web 一样)**
B. 5 tab 底部 nav **永远可见** (跟中央 [+] 浮层 wave22 修的一样)
C. 顶部 [← 返回] 按钮返回任务列表

## 3. 任务 (4 步)

### 3.1 改 App.tsx render 逻辑

读 `clients/expo/App.tsx`:

```tsx
// 当前
const content = (() => {
  if (selected) {
    return (
      <TaskDetailScreen issue={selected} ... />
    );
  }
  switch (tab) {
    case 'dashboard': return <DashboardScreen ... />;
    case 'tasks': return <TasksScreen ... />;
    ...
  }
})();

// 改成: 选 task 在当前 tab 内显示
const content = (() => {
  switch (tab) {
    case 'dashboard': return <DashboardScreen ... />;
    case 'tasks':
      return selected
        ? <TaskDetailScreen issue={selected} onBack={() => setSelected(null)} ... />
        : <TasksScreen onOpenIssue={(i) => setSelected(i)} ... />;
    case 'inbox':
      return selected
        ? <TaskDetailScreen issue={selected} ... />
        : <InboxScreen onOpenIssue={(i) => setSelected(i)} ... />;
    ...
  }
})();
```

(关键: 选 task 跳详情 留在 'tasks' tab, 底部 nav 还在)

### 3.2 TasksScreen onOpenIssue 不切 tab

读 `clients/expo/App.tsx`:

```tsx
// 当前 (跳 tab = tasks)
onOpenIssue={(issue) => {
  navigateTab("tasks");  // ❌ 跳走, selected 设上, 整屏覆盖
  setSelected(issue);
}}

// 改成: 不切 tab
onOpenIssue={(issue) => {
  setSelected(issue);  // 只设 selected, 在当前 tab 内显示详情
}}
```

(InboxScreen onOpenIssue 同理 — 已在 wave46 fix 过)

### 3.3 back 行为 (左滑 + 物理 back)

读 `clients/expo/App.tsx` (wave28 EdgeSwipeBack + BackHandler):

```tsx
// 当前 (wave28 fix: 左滑 / 系统 back 关 TaskDetail)
const swipeBack = (): boolean => {
  if (selected) return setSelected(null), true;  // ✅ 已支持
  ...
};
```

✓ 左滑 / 系统 back 都能关 selected. **新增**: 详情页顶部 [← 返回] 按钮也调 setSelected(null).

### 3.4 bump 0.5.27 → 0.5.29 (skip 0.5.28, wave50 待 0.5.28) + 模拟器验证

```bash
1. bump 0.5.27 → 0.5.29 (skip 0.5.28 留给 wave50, release-app.sh)
2. Build APK + adb install
3. 测试场景:
   a. 进 [任务] tab → 看到任务列表
   b. 点任务行 → 跳详情 (5 tab 底部 nav 还在)
   c. 详情页 [← 返回] → 回到任务列表
   d. 左缘右滑 → 关详情
   e. 系统 back 键 → 关详情
   f. 进 [收件箱] tab → 点 issue → 跳详情 (5 tab 还在, 收件箱 tab 选中态)
4. 截图 /tmp/emu-evidence/wave51-0.5.29/
5. commit + push + 发版 0.5.29 + 上 COS:
   https://dls.xrobinai.cn/coolie/app/0.5.29/coolie-release.apk
```

## 4. Constraints

- ❌ DON'T 改其他屏幕
- ❌ DON'T bump 0.5.29 之外的版本
- ❌ DON'T 触碰 paperclip 上游
- ❌ DON'T 删 selected state (仍需, 只是 render 逻辑改了)
- ✅ DO 详情在当前 tab 内显示
- ✅ DO 5 tab 底部 nav 永远可见
- ✅ DO 左滑/系统 back/[← 返回] 三种方式都关详情

## 5. semver + PM-CHECKLIST

- 当前 0.5.27 (待 wave49 发版, 但 wave49 跟 wave51 串行)
- 修 UI = patch bump → 0.5.29 ✅
- PM-CHECKLIST 32 项: J1-J3 + I1

## 6. Done definition

4 步全完 + TaskDetailScreen 在当前 tab 内显示 + 5 tab 底部 nav 永远可见 + 左滑/系统 back/[← 返回] 3 方式关详情 + 模拟器验证 + commit + push + 发版 0.5.29 + 上 COS:

```
Coolie工坊 0.5.29: https://dls.xrobinai.cn/coolie/app/0.5.29/coolie-release.apk
```