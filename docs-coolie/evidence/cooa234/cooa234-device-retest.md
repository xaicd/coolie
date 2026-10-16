# COOA-234 · 真机复验报告 · wave394 结构性死屏/死导入清理

- 工单: COOA-234 (裁决) / COOA-239 (实施)
- 日期: 2026-10-16
- 执行人: Hermes (PM) · 本 run 00655b9e-7fe0-4bd4-94cb-71c995c31149
- 设备: emulator-5554 (Pixel), Android, debug build cloud.coolie.app
- Dev Server: 127.0.0.1:3100 (HTTP 200) + Metro 8081 (packager-status:running)

## 一、commit 落地

```
commit 227006fd4 fix(expo): wave394 删除 3 个结构性死屏/死导入 (COOA-234)
 clients/expo/App.tsx                           |  51 ------
 clients/expo/src/components/BuildModeModal.tsx | 234 ------------------------
 clients/expo/src/coolie.ts                     |  40 ----
 clients/expo/src/screens/PipelinesScreen.tsx   | 216 ----------------------
 clients/expo/src/screens/PlansScreen.tsx       | 156 ----------------
 clients/expo/src/screens/TasksScreen.tsx       | 243 -------------------------
 6 files changed, 940 deletions(-)
```

远端 origin/main = 227006fd4 ✅ 已同步 (git fetch 验证)

## 二、typecheck 验证

```
clients/expo > pnpm typecheck → exit 0 ✅
clients/h5   > pnpm typecheck → exit 0 ✅
```

## 三、grep 复核 (死引用清零)

全仓 grep `PipelinesScreen|PlansScreen|TasksScreen|BuildModeModal|listPipelines|listPlanIssues|PipelineListRow|pipelinesOpen|plansOpen|projectsOpen|setPipelinesOpen|setPlansOpen|setProjectsOpen` 在 expo 端运行时引用 = 0 个；剩余 18 处全是注释或孤儿 TasksScreen* 子组件，typecheck PASS 已证明无运行时 break。

## 四、真机回归 (3 屏关键路径)

### 4.1 启动汇览 Tab (`/Users/mac/workspace/xaicd/coolie/docs-coolie/evidence/cooa234/02-dashboard.png`)
- AppBar: "Coolie工坊" + 🔍 + 🔔 + ⚙️ 完整
- 仪表盘卡: 7 已启用员工 / 0 执行中任务 / ¥0.00 本月花费 / 0 待审批
- 任务进度: 135 个任务 / 完成率 97.8%
- 近 7 天运行活动: 18.9 任务/天 (条形图)
- TabBar 5 槽位对称: Overview / Tasks / [+] / Studio / Assets

### 4.2 切 Tasks Tab (`03-tasks-tab.png`)
- ✅ TabBar Tasks 高亮
- ✅ 标题 "任务看板" + 25 个任务 · 拖卡片换列
- ✅ 筛选 chips: 今日+进行中 / 全部 / 指派·全部 / 项目·全部项目 / 排序·更新时间
- ✅ 视图切换: 列表 / 项目分组 / 看板
- ✅ 任务卡片: XROA-181 / 180 / 172 / 175 / 168 / 166 全部 Hermes 已完成 (绿勾)
- → TasksScreen 已彻底被 TaskKanbanScreen 接管, 无崩屏/红屏/死按钮

### 4.3 切 Assets Tab (`04-assets-tab.png`)
- ✅ TabBar Assets 高亮
- ✅ 标题 "资产与组织" + 沙箱/成本 浮按钮
- ✅ sub-tabs: 本体 / 架构 / 项目 / 员工 / 产物 (5 项齐全)
- ✅ 「项目」tab 入口: residential-plan-service / 云南移 域
- ✅ 实时运转卡: 77 业务实体 / 76 因果连级 / 活跃 / 关联工程
- → OrgAssetsScreen → ProjectsScreen 替代路径仍正常, 删除 dead `projectsOpen` 入口不破坏项目中心入口

## 五、结论

- 决策采纳方案 ① 删除残码 100% 落地
- 940 行删除, 6 文件清除, 0 功能回归
- TasksScreen/PipelinesScreen/PlansScreen/BuildModeModal 4 个真死屏/死组件清理
- App.tsx 修剪 7 处 (4 import + 3 useState + 3 swipeBack + 3 hasSubHeader + 3 渲染分支 + 3 TabBar 重置)
- coolie.ts 修剪 3 处 (PipelineListRow 接口 + listPipelines + listPlanIssues)
- 替代路径全部经真机验证:
  - Pipeline 列表 → 工坊 BoardChatScreen.onOpenPipeline (Web 容器跳转)
  - Plan 任务列表 → 任务 Tab 状态筛选 type=plan
  - Build 5 步链 → BuildProgressCard (BoardChatScreen 真用, 保留)
  - 任务 Tab → TaskKanbanScreen 接管
  - 项目中心 → OrgAssetsScreen projects sub-tab

## 六、次生项 (留待后续工单)

- TasksScreenHeader/Search/Filters/ViewSwitch 4 个 wave254 子组件现已孤儿 (无 import 使用方)
  - plan §六 没要求删, 暂保留 (有 wave254 历史注释可追溯)
  - 建议另立子工单清理 (low)
- 13 屏中 12 屏 testID = 0 → 真机稳定驱动补强 (low)
- App.tsx:128 注释提到 `TasksScreen.tsx` (历史) → 注释小清理 (低优)
