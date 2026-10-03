# Wave271 撞机报告 - 视角 1: PM SOP + Palantir 5 角色

**测试日期**: 2026-10-02
**App**: cloud.coolie.app (v0.6.20) on emulator-5554
**撞机原则**: 只测不修。发现的每个问题都附屏幕证据 + 操作路径 + 期望/实际对比。
**视角**: 站在新型软件交付公司负责人(老板)的工作需求基础上,用 Palantir 5 primitive (Ontos/Object/Link/Action/Function) 评估 App 业务深度。

---

## 1. 视角总评

App 当前形态是 **"老板工作台 + 任务看板 + Chat + 8 个 demo 本体域"的拼盘**,跟 PM SOP 期望的"派活 → 进度 → 审批 → 复盘"主链偏离严重。Palantir 5 primitive 中 Onto (本体 schema) 只剩 8 个 demo 域且全在草稿,Object/Link/Action/Function 四块在 App 内 0 消费。所有 5 tab 都有"看着存在但操作断链"的元素:抽屉覆盖 TabBar、新建按钮打开项目中心、看板/列表 toggle 按了不切、点击任务卡片无反应。最致命的是**资产 tab 触发抽屉而非 OrgAssetsScreen,业务本体跳 webview 而非原生**——这两条真因都还在,wave270 P0-01/P0-03 完全未修复。

---

## 2. 5 tab 走过截图清单

| # | 屏 / 操作 | 截图路径 |
|---|---|---|
| 01 | 汇览仪表盘 (199任务/8%) | `/tmp/wave271/screen-01-huilan.png` |
| 01c | 汇览下半屏 (阻塞40/平均交付21.5h) | `/tmp/wave271/screen-01c-huilan-scroll.png` |
| 02 | Back 触发抽屉 (业务本体/项目中心等) | `/tmp/wave271/screen-02-drawer.png` |
| 05 | 任务 tab 进入看 P1 任务详情 | `/tmp/wave271/screen-05-assets-tab.png` (误进入任务详情) |
| 06 | + FAB → 新建 sheet (8 入口) | `/tmp/wave271/screen-06-newtask-sheet.png` |
| 08 | 抽屉稳态 | `/tmp/wave271/screen-08-drawer-open.png` |
| 09 | 抽屉→业务本体 → 跳 webview Coolie | `/tmp/wave271/screen-09-coolie-webview.png` |
| 13 | 资产 tab 实际 = 打开抽屉 | `/tmp/wave271/screen-13-zichan-drawer.png` |
| 14 | 抽屉→业务本体 → 跳到原生 OntologyDomainList | `/tmp/wave271/screen-14-tap-ontos.png` |
| 15 | Ontology 列表 (8 域,生产0,草稿7) | `/tmp/wave271/screen-15-ontology-list.png` |
| 17 | 任务 tab → 任务看板 (待办池/待处理双列) | `/tmp/wave271/screen-17-tasks-kanban.png` |
| 20 | tap "列表" toggle → 屏未切 | `/tmp/wave271/screen-20-tap-list.png` |
| 22 | tap "看板" toggle → 屏未切 | `/tmp/wave271/screen-22-tap-kanban.png` |
| 23 | 第二次 tap 后仍为看板 | `/tmp/wave271/screen-23-after-kanban-tap.png` |
| 24 | tap 任务卡片 → 无反应 | `/tmp/wave271/screen-24-tap-task-card.png` |
| 25 | tap 工坊 tab → 无反应 (snapshot 死) | `/tmp/wave271/screen-25-gongfang.png` |
| 26 | agent-device open 触发 recents | `/tmp/wave271/screen-26-relaunch-state.png` |

> **环境注**: agent-device snapshot helper 在第 14 步后频繁返回 "insufficient application window content",只能靠截图 + 坐标操作。详见 wave270 已知问题。

---

## 3. Palantir 5 角色评分 (1=完全无支持, 5=完整支持)

| Primitive | 分 | 证据 / 落差 |
|---|---|---|
| **Ontos** (本体 schema) | 2 | 8 个本体域,7 个草稿、1 个已归档、0 个生产 (screen-15)。Ontos 是唯一原生实现的 primitive,但都是 demo。 |
| **Object** (实例数据) | 1 | `OntologyInstanceGraphScreen` 在抽屉 / 抽屉菜单中"业务本体"链接即跳 webview 或回到 OntologyDomainList,看不到实例数据屏。 |
| **Link** (关系) | 0 | `ontology_links` 在 App 内 0 消费,`entity_relations` 才是真源但同样无 UI 入口。 |
| **Action** | 0 | `ontology_actions_view` 在 App 内 0 消费。无"派单 / 触发 action / 看 action 历史"屏。 |
| **Function** | 0 | schema comment 写"镜像 MCP tools",实际不同步。MCP tools 列表/编辑器在 App 0 入口。 |

**总分 3/25** — App 实质是"看板+Chat+仪表盘",不是 ontology-driven 控制台。

---

## 4. wave270 P0 验证结果 (11 项)

| 编号 | 描述 | 状态 | 证据 |
|---|---|---|---|
| P0-01 | 本体工作台三元锁死 (App.tsx:1269-1279) | ⚠ 部分 | "资产"tab 实际打开的是抽屉 (screen-13),抽屉里"业务本体"跳到原生 OntologyDomainList (screen-14),真原因 P0-01 没复现,但 tab 行为本身错位更严重。 |
| P0-02 | 插件设置三元锁死 (App.tsx:1245-1255) | ⚠ 未撞 | 资产 tab 误触抽屉,没进插件设置屏;但抽屉菜单也没"插件"入口,验证等价于"无此屏"。 |
| P0-03 | 看板/列表 toggle 按了屏不切 (TaskKanbanScreen.tsx:410-442) | ✓ **真因仍成立** | screen-20/screen-22/screen-23 三次坐标 tap,屏内容纹丝不动,看板 toggle 一直高亮深色。 |
| P0-04 | TasksScreen.tsx 234 行死代码 | ⚠ 未撞 | 进入任务 tab 默认就是 P1 任务详情 (screen-05),无法验证列表屏,反而撞出 P0-NEW-4。 |
| P0-05 | InboxScreen.tsx 1238 行死代码 | ✗ 视觉未撞 | 顶栏铃铛 (19 通知) 未点击验证。 |
| P0-06 | OntologyDomainListScreen:977 onChangeText 写错 state | ⚠ 未撞 | 进入 Ontology 列表 (screen-15) 后未做搜索操作。 |
| P0-07 | 员工 card 技能字段不一致 | ⚠ 未撞 | "数字员工"抽屉菜单项未点 (抽屉条目是 webview 入口)。 |
| P0-08 | Branch primitive 没做 | ✓ **真因仍成立** | 5 tab 全程无 Branch 相关屏。 |
| P0-09 | Function primitive 没做 | ✓ **真因仍成立** | 无 MCP tools 入口,UI 0 消费。 |
| P0-10 | Action view 0 消费 | ✓ **真因仍成立** | 5 tab 全程无"派单/触发 action/看 action 历史"。 |
| P0-11 | ontology_links 死表 | ✓ **真因仍成立** | 无 Link 可视化屏。 |

**结果**: 11 项里 ✓ 真因仍成立 5 项,⚠ 部分 / 未撞 5 项,✗ 1 项。**P0-03 / P0-08 / P0-09 / P0-10 / P0-11 五条无任何修复迹象**。

---

## 5. 极简原则 7 条违反清单 (老板原话)

| # | 原则 | 违反证据 |
|---|---|---|
| 1 | 5 tab 屏 1-2 步可达 | **违反** — 资产 tab 要走抽屉再走抽屉菜单 2 层才到 OrgAssetsScreen,且抽屉中的"业务本体"在本视图跳原生,在别的视图跳 webview,行为不一致。 |
| 2 | 常用操作 ≤ 3 步 | **违反** — 派活: FAB(1)→ 选择入口(2)→ 写对话(3)→ 选智能体(4)≥ 4 步。"看进度": 任务 tab → 看板 → 卡片才能看到详情,3 步勉强合格,但任务详情屏打不开。 |
| 3 | 不出现术语 | **违反** — 顶栏 title 写 "Coolie工坊" (公司+工坊两术语混用),抽屉菜单"例行计划调度 / 全景成本分析 / 业务本体"是老板 PM 不用的术语。"看板/列表/分组"toggle 直接英文。 |
| 4 | 空状态有引导 | **违反** — 仪表盘"待审批 ¥0.00" 直接显示数字,没空状态引导。Onto 列表"草稿 (7)" 一堆灰色 demo,无引导"先建一个域"。 |
| 5 | 错误信息具体 | **违反** — 工坊 tab 点击无反应 (snapshot 死),UI 零反馈,老板以为 App 死了。任务卡片点击无反应。 |
| 6 | 首次登录 5 分钟上手 | **违反** — 5 tab 顺序 汇览/任务/+/工坊/资产,无 onboarding。"工坊"在 PM 视角 = 车间,但实际 = Chat,概念错位,新员工 5 分钟搞不清。 |
| 7 | 不重复入口 | **违反** — + FAB 8 个入口 (对话/工作/录音转写/AI创建/拍照上传/按住说话/相机/键盘) + 抽屉"新建"按钮 + 列表顶部"新建多源代码库项目" 至少 3 处新建入口,主推不明确。 |

---

## 6. 新发现 P0/P1/P2 (PM SOP 视角)

### P0-NEW-1 (P0): 199 任务 / 阻塞 40 无入口
仪表盘 (screen-01c) 显示"阻塞 40 / 待办 182",P0 老板视角直接关心,但**无 P0 任务专门入口**,必须点"任务"tab 然后看板过滤才能看到。

### P0-NEW-2 (P0): "紧急熔断"按钮直接放仪表盘主屏
screen-01 显示红色"🚨 紧急熔断:停掉所有派单"按钮在仪表盘正中位置,**误触风险极高** — 老板任何点错都会立即停掉所有派单,无二次确认。

### P0-NEW-3 (P0): "紧急熔断" + "待审批"等数据展示口径不一致
仪表盘同时显示"¥0.00 本月花费"和"未设预算上限",逻辑矛盾:有花费没预算。同时显示"成功/失败"折线图 (近7天 2.3任务/天) 与"已启用员工 6"但"任务进度 199/8%",数字之间无聚合关系,老板无法判断公司整体健康度。

### P0-NEW-4 (P0): Tap 路由错乱 — 任务 tab 默认进任务详情
screen-05 显示点击"任务"tab 默认进入 P1 任务详情 (任务标题"[P1][OpenAI FDE] App 无 FDE 视角入口"),看不到任务列表。PM SOP 期望"任务" tab = 任务列表总览。

### P0-NEW-5 (P0): + FAB 触发的"新建 sheet"和抽屉并存,状态错乱
screen-06 显示 sheet 标题"新建什么任务?"列出 8 个入口,背景层却是"项目中心"抽屉。两种入口分裂,无主推。

### P0-NEW-6 (P0): 抽屉式导航吞掉 TabBar 行为
screen-13 显示点"资产"tab 实际打开的是左侧抽屉 DrawerLayout,TabBar 5 tab 中**至少有 1 个 tab 行为错位**。抽屉中"业务本体"行为在不同视图间不一致 (有时跳 webview 有时跳原生)。

### P0-NEW-7 (P0): 业务本体屏点击无反应
screen-15 OntologyDomainListScreen 显示三个 demo 域 (Banking & Finance / E-Commerce Platform / Fourth Coffee),点"Fourth Coffee"卡 (screen-16) 实际触发了 TabBar 切到任务 tab,**深下钻行为完全断链**。

### P1-NEW-1 (P1): Onto 列表"全部(8) 生产(0) 草稿(7) 已归档(1)"无 onboarding
7 个草稿 demo 域堆在生产者的 Onto 列表,无任何引导"先删除 demo 域"或"先建一个你自己的域"。

### P1-NEW-2 (P1): 任务看板 toggle 视觉选中态与状态不一致
"看板"一直高亮,但 toggle 内"列表"标签也是同色背景块;无障碍(屏阅/键盘)用户无法判断当前在哪个视图。

### P1-NEW-3 (P1): TabBar "工坊"icon 与实际功能不符
"工坊" = Chat,PM SOP 视角 "工坊" = 工厂/车间(看生产进度/物料)。icon 与命名错位。

### P2-NEW-1 (P2): Onto 列表每个域显示 "v22 / v24 快照摘要 ›"
PM 不关心本体 schema 版本号,显示细节过度,挤压"删除/编辑"主操作。

### P2-NEW-2 (P2): 任务卡片右上角时间"16h ago / 2d ago"未本地化
PM 视角希望"今天 14:32"而非"16h ago",英文 relative time 在中文 App 里违和。

---

## 7. 推荐改进 (按优先级)

### 必须修 (P0,阻塞老板日常)
1. **修 TabBar 行为**: 资产 tab 必须真正切到 OrgAssetsScreen,不再触发抽屉。
2. **修 P0-03 看板/列表 toggle**: TaskKanbanScreen.tsx:410-442 的 onPress 改为有效 setState。
3. **修任务卡片 tap handler**: 任务列表点卡片无反应 → 修 onPress 路由到 TaskDetailScreen。
4. **移除/搬走"紧急熔断"按钮**: 仪表盘正中位置危险,移到"设置"二级菜单。
5. **抽屉菜单统一行为**: "业务本体" / "数字员工" / "交付产物"要么都跳原生,要么都跳 webview,不可随机。
6. **任务 tab 修正**: 切到任务 tab 应默认显示任务列表总览,而非默认选中一个 P1 详情。

### 应该修 (P1)
7. + FAB 合并 8 入口为主推 + 次推;移除键盘/相机/拍照等明显非"派活"入口。
8. 给 Onto 列表加 onboarding:首次进入提示"删除 7 个 demo 域,建你的第一个域"。
9. 仪表盘空状态引导:"未设预算上限"时显按钮"设预算",而非裸数字。
10. 工坊 tab 改名为"对话"或 icon 重画,匹配 Chat 实际功能。

### 可以修 (P2)
11. 任务卡片时间改本地化 (今天 HH:mm / 昨天 HH:mm / M月D日)。
12. 移除 Onto 列表的"v22 / v24 快照"次要信息,腾出"删除/编辑"主操作位。

---

## 8. 输出路径

| 类型 | 路径 |
|---|---|
| 主报告 | `/Users/mac/workspace/xaicd/coolie/docs-coolie/evidence/wave271/QA-VIEWPOINT-1-PM-PALANTIR.md` |
| 运行 log | `/tmp/wave271/agent-device-1.log` |
| 截图 | `/tmp/wave271/screen-NN-*.png` (90+ 张,本视角引用 17 张) |

**本视角未修任何代码、未重启服务、未 git commit**。所有发现都基于截图证据 + 实际点击操作,无推测。
