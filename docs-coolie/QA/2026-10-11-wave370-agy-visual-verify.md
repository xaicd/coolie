# wave370 测试工单 — 墨斗 agy 验 v0.6.53 视觉强对比真机验证报告

> **任务**: wave370 · 视觉强对比真机验证 (老板拍 'agy 呢' 用墨斗 agy 验 v0.6.53)
> **执行员工**: 墨斗 (modou-fda) · `modou-fda` · Palantir Delta 前线架构与领域规划
> **调度中枢**: Hermes·Echo · `echo|Echo|业务战略|Hermes·Echo|local` · 宿主 local · 项目 Coolie 本地施工总社
> **底层引擎**: agy-gemini3.8 · **工作仓库**: `/Users/mac/workspace/xaicd/coolie` · **分支**: `main` · **日期**: 2026-10-11
> **被测交付**: v0.6.53 wave370 视觉强对比修复 (`commit 937af5ceca` + `commit a15e375ce1`)
> **执行环境**: Docker 容器 `agy-ubuntu-container` 穿透宿主机 Mac，通过 `agent-device` 驱动 Android 真实模拟器 (`emulator-5554`)

---

## 0. TL;DR (前线架构师总评)

1. **版本与更新闭环**: 
   - 生产 OTA 源 (`https://xrobinai.cn/ota/manifest`) 已成功同步至 `0.6.53`。
   - Android 模拟器启动 `cloud.coolie.app` 后，成功接收到 OTA 更新提示，一键「重启」完成平滑加载，装机自检确认进入 **Coolie 0.6.53 已就绪** 状态。
2. **长按清空闭环验证通过 (100% 达标)**:
   - 长按顶栏铃铛图标，成功弹出原生对话框 `清空所有未读`，文案 `当前 20 条未读消息, 全部标记为已读?`，按钮严格遵守两字规范 (`取消` / `清空`)。
   - 点击「清空」后，调用 `useNotificationsStore.markAllRead()`，顶栏角标数字瞬间清空，红点彻底消除，通过 wave369 持久化修复断言。
3. **🚨 发现重大架构级断裂与死代码缺陷 (CRITICAL ARCHITECTURAL FINDING)**:
   - **代码层**: commit `937af5ceca` 在 `clients/expo/src/screens/NotificationsScreen.tsx` 中完美实现了 4 项视觉强对比特性 (`rowUnread` 背景透明度 0.18、`rowRead` 透明度 0.62、`leftBar` 3px 纵向蓝条、`rowTitleUnread` 700 vs 400 加粗、`unreadDot` 10x10 红点)。
   - **运行时断裂**: 经真机点击铃铛查证，`clients/expo/App.tsx` (L1056) 在历史治理波次中将 `notificationsOpen ?` 的目标屏幕**重定向绑为了 `<InboxScreen>` (收件箱)**，而 `NotificationsScreen` 仅在文件头部被 import 但**从未被渲染**（沦为孤立死代码 Dead Component）。
   - **体验影响**: 用户点击铃铛实际看到的是「收件箱」（显示工单/审批任务列表），看不到任何 `NotificationsScreen.tsx` 的通知列表样式；点开工单返回后铃铛红点不会扣减（-1 未发生）。

---

## 1. 5 步真机验证执行记录与截图存证

所有测试均通过 `agent-device` 在 Mac 宿主机 `emulator-5554` 真实运行，存证截图已同步至 `/tmp/` 与 `docs-coolie/QA/screenshots/`。

| 步骤 | 验证目标 | 真机交互行为 | 结果状态 | 证据截图 |
|---|---|---|---|---|
| **步骤 1 & 2** | App 启动与 v0.6.53 加载 | `agent-device open cloud.coolie.app --foreground`，检测 OTA 提示并点击「重启」 | ✅ 成功加载 v0.6.53 bundle | 控制台自检日志 |
| **步骤 3** | 铃铛真貌初态捕获 | 进主屏仪表盘，顶栏右上角展示铃铛图标与未读徽标 (显示 20) | ✅ 成功展示未读角标 | `/tmp/agy-bell.png`<br>`docs-coolie/QA/screenshots/agy-bell.png` |
| **步骤 4** | 进通知页看已读/未读区别 | 点击顶栏铃铛图标，呼出详情屏 | ⚠️ 界面弹出 `InboxScreen` (收件箱)，未渲染 `NotificationsScreen` | `/tmp/agy-list.png`<br>`docs-coolie/QA/screenshots/agy-list.png` |
| **步骤 5** | 点开单条验证铃铛扣减 | 在列表中点击一条任务进入 TaskDetail，返回主屏查验铃铛 | ⚠️ 因落地为 Inbox，未触及 `useNotificationsStore.markRead`，铃铛数字保持 20 未变 | `/tmp/agy-after.png`<br>`docs-coolie/QA/screenshots/agy-after.png` |
| **步骤 6** | 长按铃铛弹窗清空 | 长按顶栏铃铛，弹出清空确认对话框；点击「清空」 | ✅ 弹窗两字按钮合规；点击「清空」后角标瞬间消除为 0 | `/tmp/agy-longpress.png`<br>`docs-coolie/QA/screenshots/agy-longpress.png` |

---

## 2. 4 项视觉强对比点深度审计 (墨斗 FDA 视觉/UI 专审)

在 `clients/expo/src/screens/NotificationsScreen.tsx` 中的代码实现与真机映射对照分析：

```tsx
// clients/expo/src/screens/NotificationsScreen.tsx (commit 937af5ceca)
rowUnread: { backgroundColor: "rgba(94, 106, 210, 0.18)" },
rowRead: { backgroundColor: "transparent", opacity: 0.62 },
leftBar: { width: 3, alignSelf: "stretch", borderRadius: 2, backgroundColor: C.accent, marginRight: -7 },
leftBarSpacer: { width: 3, marginRight: -7 },
rowTitle: { color: C.ink, fontSize: 14, fontWeight: "500" },
rowTitleUnread: { fontWeight: "700", color: C.ink },
rowTitleRead: { fontWeight: "400", color: C.ink3 },
rowBodyRead: { color: C.ink4 },
unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.err, marginLeft: 6 },
```

### 逐项视觉审美审计结论：

1. **rowUnread 背景透明度 0.18 vs rowRead 0.62**:
   - **代码设计**: 极为优秀。原 0.06 (6%) 在 OLED 暗黑模式下几乎与背景融合，提升到 0.18 后能清晰建立通知卡片未读色块层级；已读卡片透明度降至 0.62，形成强烈的前后景对比。
   - **真机现状**: 因屏幕被 `InboxScreen` 拦截，用户在当前真机版本**无法看到此背景透明度对比**。
2. **leftBar 左侧 3px 蓝条**:
   - **代码设计**: 3px 纵向主色蓝条 (`C.accent`，Linear 设计语言)，配有对齐补偿 `leftBarSpacer` 确保已读卡片无位移跳动，交互精致度达标。
   - **真机现状**: 在当前真机版本**无法看到此蓝条**。
3. **rowTitleUnread 加粗 700 vs rowTitleRead 400**:
   - **代码设计**: 未读字体采用 700 纯白加粗，已读降为 400 次级灰 (`C.ink3`)，层级分明，扫一眼即可定位重点。
   - **真机现状**: 在当前真机版本**无法看到此字体粗细差异**。
4. **unreadDot 10x10 红点**:
   - **代码设计**: 由原 8x8 放大至 10x10，圆角 5px，右侧增加 6px 外边距，醒目且不与右侧留白冲突。
   - **真机现状**: 在当前真机版本**无法看到此红点**。

---

## 3. 架构根因与溯源分析 (Root Cause Analysis)

### 3.1 路由断裂历史根因
- 在 `commit ee1451c222` (wave302/governance: 落地极简两字按钮、对称底栏) 中，为简化导航结构，作者将 `App.tsx` 中的子屏路由修改为：
  ```tsx
  // clients/expo/App.tsx:1056
  ) : notificationsOpen ? (
    <InboxScreen
      company={company}
      initialTab={inboxInitialTab}
      onBack={() => setNotificationsOpen(false)}
      ...
  ```
- 此时 `NotificationsScreen` 的引用保留在 `App.tsx:67`，但渲染分支被全量替换为 `InboxScreen`。
- 后续 wave364 与 wave370 的研发同学在接到“修复通知中心已读/未读视觉强对比”的需求时，直接搜索并修改了 `NotificationsScreen.tsx`，误以为修改该文件即可在真机生效，未能识别出组件在宿主容器中已被替换的断裂。

### 3.2 体验与业务模型冲突
- **铃铛模型**: 铃铛徽标读取的是 `useNotificationsStore`（数据源为 `/api/notifications`，聚合流）。
- **收件箱模型**: 落地页展示的是 `InboxScreen`（数据源为 `/api/inbox` + `listIssues`，任务/审批/提到我的事务集合）。
- **点击行为**: 用户在 `InboxScreen` 中点击某个工单，触发的是 `onOpenIssue(issueItem)` 打开 `TaskDetailScreen`，不会触发通知已读消除接口 (`/api/notifications/:id/read`)，导致**点开一个少一个**的体验在此路径下无法闭环。

---

## 4. 墨斗 FDA 破局与架构整改建议 (Architectural Recommendations)

为了让老板亲自拍板的「视觉强对比」与「点开一个少一个」在真机完美落地，建议下一工单按如下方案闭环：

### 方案 A (推荐 · 职责单一与极简回归):
1. **还原专属通知中心**: 将 `App.tsx` 中的 `notificationsOpen ?` 重新指向 `<NotificationsScreen company={company} onBack={popScreen} ... />`。
2. **打通视觉与状态**: 如此，commit `937af5ceca` 的所有强对比视觉设计 (`rowUnread`, `leftBar`, `unreadDot`, `700加粗`) 立即在真机点亮；且 `openNotification` 原生带有的 `markRead(item.id)` 将在用户点击时立刻触发，铃铛角标精准递减 -1。
3. **收件箱定位**: 收件箱作为大盘级工单归档中枢，可通过快捷手势或专属入口访问，不再与铃铛通知混淆。

### 方案 B (融合方案 · 收件箱承载通知流):
若产品总控决定不再保留独立的 `NotificationsScreen`，则需执行代码重构：
1. 将 `NotificationsScreen.tsx` 中的强对比样式与渲染逻辑迁移合并到 `InboxScreen.tsx`。
2. 在 `InboxScreen` 的工单点击回调中，联动调用 `useNotificationsStore.getState().markRead(...)`，打通红点消减。
3. 彻底删除无引用的 `NotificationsScreen.tsx`，消除死代码。

---

## 5. 遵守约束与执行边界

- **不调 sub-agent**: 100% 由直属员工【墨斗】独立完成。
- **不动 git / 不 reset --hard**: 未篡改或重置任何既有代码仓库分支。
- **真实设备与真实数据**: 100% 依托 Mac 宿主机 Android 模拟器与 live OTA 生产环境进行穿透验证，无伪造 mock 数据。
- **产物存证完整**: 4 张关键交互态高清 PNG 截图已全部落盘于 `docs-coolie/QA/screenshots/` 及宿主机 `/tmp/`。

---

## 6. 签字栏

| 角色 | 员工姓名 | 审查结论 / 签署时间 |
|---|---|---|
| **FDA (前线架构/视觉审视)** | 墨斗 (Inkstick / `modou-fda`) | `[2026-10-11 · v0.6.53 真机视觉审计完成 · 长按清空闭环通过 · 揭露 NotificationsScreen 路由死代码真因 · 待派单整改]` |
| **PM (业务战略中枢)** | Hermes·Echo (`Hermes·Echo·业务战略`) | `[wave370 调度核销]` |
