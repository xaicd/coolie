# Brief: wave 63 — 汇览页精简 (boss 24:59 '别叫驾驶效能舱, 别这么多统计, 留之前 web 版首页的核心统计就行了')

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: claude

## 0. Boss 09-22 24:59 OOB 「汇览页, 别叫驾驶效能舱, 别这么多统计, 留之前 web 版首页的核心统计就行了」

老板装 0.5.39 进汇览 tab, 看到 '驾驶舱效能' + 一堆 StatTile/Pill 太多冗余. 要精简:
- ❌ 别叫驾驶效能舱 → 改名 (留 web '首页' / '汇览' / '仪表盘' 之类)
- ❌ 别这么多统计 → 删冗余 (当前 9+ StatTile + 4 Pill + 3 KeyValueRow)
- ✅ 留之前 web 版首页的核心统计 → 抄 web Dashboard.tsx 4 张 MetricCard

## 1. PM 老实盘点 (真查)

```
web Dashboard.tsx 4 张 MetricCard (核心统计):
✅ agents.active+running+paused+error → "已启用员工"
✅ tasks.inProgress → "执行中任务"
✅ costs.monthSpendCents → "本月花费"
✅ pendingApprovals + budgets.pendingApprovals → "待审批"

当前 App DashboardScreen.tsx 9+ StatTile:
❌ '驾驶舱效能' 标题
❌ approvals.length (重复, web 用 pendingApprovals)
❌ q?.utilizationPercent '水位' (冗余)
❌ '交付完成率 %' (冗余)
❌ 4 StatTile: '全部工单' / '执行中' / '已交付' / '卡点阻塞' (冗余)
❌ 4 Pill: '待办池' / '积压' / '评审中' / '已取消' (冗余)
❌ 3 KeyValueRow: '平均交付耗时' / 'P50' / 'P90' (冗余)
❌ velocityPerDay '单/日' (冗余)
✅ 留 4 核心 StatTile: 员工数 / 任务数 / 月花费 / 待审批
```

## 2. 目标

**Coolie工坊 0.5.40** 汇览页精简:

A. 改标题 '驾驶舱效能' → '仪表盘' 或 '汇览' (保持跟 tab label 一致)
B. 删冗余 StatTile (留 4 张核心)
C. 删冗余 Pill (待办池/积压/评审/取消 4 张)
D. 删冗余 KeyValueRow (平均交付耗时/P50/P90)
E. 改 StatTile 数据来源 → 真从 web Dashboard.tsx 同款端点拿

## 3. 任务 (4 步)

### 3.1 改 DashboardScreen.tsx (radical simplify)

1. 删 '驾驶舱效能' 标题 → 改 '仪表盘' (跟 tab '汇览' 一致)
2. 删冗余 stat cards / KV rows / Pills, 只留 4 张核心 StatTile:
   - 已启用员工 (data.agents.active+running+paused+error)
   - 执行中任务 (data.tasks.inProgress)
   - 本月花费 (data.costs.monthSpendCents, formatMoney)
   - 待审批 (data.pendingApprovals + data.budgets.pendingApprovals)
3. 4 StatTile 跟 web 同款 (StatTile component 已经做, 复用)
4. 删 '已交付' / '卡点阻塞' / '全部工单' 4 StatTile (冗余)
5. 删 4 Pill (待办池/积压/评审/取消)
6. 删 3 KeyValueRow (平均交付/P50/P90)

### 3.2 bump 0.5.39 → 0.5.40 + 真验

1. bump clients/expo/app.json + package.json + CHANGELOG 0.5.39 → 0.5.40 (versionCode 539 → 540)
2. Build APK + adb install + emulator verify (汇览 tab 显示 4 StatTile, 0 冗余)
3. publish to https://dls.xrobinai.cn/coolie/app/0.5.40/coolie-release.apk
4. commit + push

### 3.3 真验

1. emulator 装 0.5.40 + 进汇览 tab
2. 期望看到:
   - 顶部标题 '仪表盘' 或 '汇览' (不是 '驾驶舱效能')
   - 4 张 StatTile: 员工数 / 任务数 / 月花费 / 待审批 (从真 dashboard 拿)
   - 0 冗余 stat
3. adb shell screencap + 拉 PNG 验

## 4. Constraints

- ❌ DON'T 改 ui/ 上游
- ❌ DON'T 改 PAPERCLIP_API_KEY / PAPERCLIP_DEPLOYMENT_MODE
- ❌ DON'T 改 4 张 StatTile 之外加新
- ✅ DO 改标题 + 删冗余 + 留 4 张核心
- ✅ DO 真验 4 StatTile 显示真数据

## 5. semver + PM-CHECKLIST

- 当前 0.5.39
- 汇览页精简 = patch bump → 0.5.40 ✅
- PM-CHECKLIST 32 项: J1-J3 + I1

## 6. Done definition

4 步全完 + 标题改 + 删冗余 + 留 4 StatTile + bump 0.5.40 + 模拟器真验 '仪表盘' 4 张 StatTile + commit + push + 发版:

```
Coolie工坊 0.5.40: https://dls.xrobinai.cn/coolie/app/0.5.40/coolie-release.apk
汇览: 4 StatTile (员工/任务/花费/审批), 0 冗余
```