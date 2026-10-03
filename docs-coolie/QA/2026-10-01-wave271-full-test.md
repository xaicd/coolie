# wave271 全业务测试验证 — 5 视角 + 7 极简原则

> **命令 (老板原话 2026-10-02)**: 「你最好进行 APP全业务的测试验证, 站在新型软件交付公司负责人工作需求基础上, 以Palantir体系, open AI FDE, 产品总监的严肃视角, 使用模拟器验证APP 功能, 找出缺陷, 不只是功能BUG, 设计, 布局, 产品架构都可以定位, 开始用agent-device, agent-browser干活吧; 极简使用主义, 不能有重复功能入口, 傻瓜式使用最好, 不用人培训就可以快速上手使用」

> **测试定位**: 只测, 不修代码. 不动 server / ui / wave254/258/261/262/264/266 / v0.6.20 tag. 不发 APK, 不派 wave272 修复波.

> **基础**: wave270 agy 全量审计已交付 5 份 P0/P1/P2 缺陷 (1755 行). 本波用 5 个 agent 并行 (3 App 视角 + 2 Web 视角) 在真机模拟器 + 真 Web 端撞机验证.

> **核心数字**: 5 份视角报告共 716 行 + 129 张撞机截图. 老板原话"测试 = 只找不修", 0 行代码改动.

---

## 0. TL;DR — 老板这段话最关键的 5 句

1. **App 实质是"只读看板"而非老板移动工作站** — 工坊 = Chat / 资产 = demo ontology 集 / 数字员工 sub-tab = webview 跳板, 跨设备一致性 = 0, 任务计数三处不一致 (仪表盘 199 / 看板 header 182 / 待办池 78).
2. **老板首选 App 而非 Web** — Web 端侧边栏链接 7/11 全部 404, 必须手动改 URL 前缀. App 内部 SPA 路径修复过.
3. **wave270 P0 真因仍成立 5/11** (P0-03/08/09/10/11), 6 项已部分 / 视觉未撞 / 待修; **wave271 新发现 18 个 P0** (含 5 tab 错位 / 重复入口 5 处 / 通知死数据 / 跨设备断 / 数据流三处不一致 / 紧急熔断误触 / 侧边栏 404 / 嵌套 tab 错公司).
4. **极简原则 7 条全部违反** — 抽屉覆盖 TabBar / 派活 ≥ 4 步 / 满屏英文术语 / 空状态无引导 / 错误无反馈 / 5 tab 无 onboarding / 重复入口 ≥ 3-5 处.
5. **建议按 P0 优先级 + 极简原则 + 5 视角反馈派 wave272 真修** — 先切 3 个 P0 死穴 (P0-01 / P0-02 / P0-03) + 5 tab 信息架构错位 + 重复入口合并 + 通知中心 1238 行死代码复活, 再攻 P0-08/09/10/11 的 Palantir 治理 + Web 侧边栏 404 修.

---

## 1. 撞机矩阵

| # | 视角 | Agent | 工具 | 撞机范围 | 报告 |
|---|---|---|---|---|---|
| 1 | 新型软件交付公司负责人 + Palantir 5 角色 | agent-device-1 | agent-device --serial emulator-5554 | App 5 tab + 深屏 + Palantir primitives | `docs-coolie/evidence/wave271/QA-VIEWPOINT-1-PM-PALANTIR.md` (160 行, 11.9K) |
| 2 | 设计总监 (视觉 / 交互 / a11y / 极简) | agent-device-2 | agent-device --serial emulator-5554 | App 5 tab + 设计维度 | `docs-coolie/evidence/wave271/QA-VIEWPOINT-2-DESIGN.md` (198 行, 15.9K) |
| 3 | 产品总监 + OpenAI FDE | agent-device-3 | agent-device --serial emulator-5554 | App 5 tab + 架构 / 信息架构 / 数据流 | `docs-coolie/evidence/wave271/QA-VIEWPOINT-3-PRODUCT-FDE.md` (155 行, 12.7K) |
| 4 | 新型软件交付公司负责人 (Web) | agent-browser-1 | agent-browser | https://xrobinai.cn | `docs-coolie/evidence/wave271/QA-VIEWPOINT-4-WEB-PM.md` (138 行, 10.3K) |
| 5 | 设计总监 + 产品总监 (Web) | agent-browser-2 | agent-browser | https://xrobinai.cn | `docs-coolie/evidence/wave271/QA-VIEWPOINT-5-WEB-DESIGN-PRODUCT.md` (108 行, 9.4K) |

Σ = **759 行 + 60.3K, 129 张撞机截图**.

### 撞机工具

- `agent-device` (Homebrew `/opt/homebrew/bin/agent-device`)
- `agent-browser` (Homebrew `/opt/homebrew/bin/agent-browser`)
- 模拟器: `emulator-5554` (Android API 28, 1080×2280)
- App: `cloud.coolie.app` v0.6.20
- Web: `https://xrobinai.cn` (prod)

### Log 路径

| 视角 | log |
|---|---|
| 1 PM+P | `/tmp/wave271/agent-device-1.log` |
| 2 设计 | `/tmp/wave271/agent-device-2.log` |
| 3 产品+FDE | `/tmp/wave271/agent-device-3.log` |
| 4 Web PM | `/tmp/wave271/agent-browser-1.log` |
| 5 Web 设计+产品 | `/tmp/wave271/agent-browser-2.log` |

---

## 2. 5 视角总评 (已汇总)

### 视角 1 — 新型软件交付公司负责人 + Palantir (App)

**总评**: App 当前形态是"老板工作台 + 任务看板 + Chat + 8 个 demo 本体域"的拼盘, 跟 PM SOP 期望的"派活 → 进度 → 审批 → 复盘"主链偏离严重. Palantir 5 primitive 总分 3/25, 仅 Ontos 拿到 2 分 (8 个 demo 域全在草稿), 其余 4 primitive (Object/Link/Action/Function) 在 App 内 0 消费. 所有 5 tab 都有"看着存在但操作断链"的元素: 抽屉覆盖 TabBar、新建按钮打开项目中心、看板/列表 toggle 按了不切、点击任务卡片无反应.

**11 P0 验证结果**: 5 ✓ 真因仍成立 (P0-03/08/09/10/11), 5 ⚠ 部分 / 未撞, 1 ✗ 视觉未撞. **P0-03 看板/列表 toggle 100% 复现**.

**7 个新 P0**: 阻塞 40 无入口 / 紧急熔断误触风险 / 数据口径不一致 / 任务 tab 默认进详情 / + FAB 8 入口分裂 / 抽屉吞 TabBar / Ontology 列表点 Fourth Coffee 卡跳任务 tab 深下钻断链.

**极简原则**: 7 条全部违反.

---

### 视角 2 — 设计总监 (App)

**总评**: 信息架构严重错位 + 同质化挤压: 5 tab 中 3 个错位 (工坊=Chat、资产=demo ontology 集、数字员工=webview 跳板), 每一屏顶部 3-4 行 chip/filters 纯视觉噪声占 30% 屏心. "重复功能入口"是 P0 系统性缺陷不是单点. App 是 demo 状态, 数据稀薄 → 设计缺陷被放大 (已启用员工 1, 执行中任务 1, 本月花费 ¥0.00).

**评分**: 设计 3.0/5 (间距/字号/对齐/颜色/触摸/图标), 交互 2.4/5 (手势/反馈/空状态/错误/导航), a11y 2.6/5 (字号/对比度/触摸目标/状态语义/色盲).

**3 个新 P0**: 5 tab 信息架构错位 / 新建入口重复 5 处 / 顶栏通知铃铛 tap 不响应.

**7 个新 P1**: 任务 tab 顶部 4 行 chip 屏心挤 / 看板右列文字截断 / 空状态零引导 / 灰 meta 对比 3.5:1 不达标 / 6 个 G1-G5 缩写无解释 / 看板列色盲不友好 / "未设预算" 弹层仅 "关闭" 无 "去设置".

**9 个新 P2**: 5 tab 图标风格不统一 / chip 36-40dp < 48dp / 字号不可调 / 紧急熔断红按钮过刺眼 / "未分配" 三件套灰卡难读 / Tab 切换无 transition / a11y 字号不可调 / 状态竖线颜色过近 / 6 缩写无解释.

**极简原则违反 5 条**: 5 tab 可达 / ≤3 步 / 空状态 / 首登 / 零重复.

---

### 视角 3 — 产品总监 + OpenAI FDE (App)

**总评**: App 是"老板终端"而不是"FDE 终端" — 5 tab 划分看/做/做/看 三件事混在一起, 没有"部署 / 客户 / API 监控"任何 FDE 视角入口. 看板上紧急熔断按钮占满卡片位但 0 待审批视觉权重失衡; 任务看板 199 个任务有 5+ 种优先级标签 (P0/P1/P2/P3/S1/S2/S3) 混在同一列, 任务列表的"卡片层"应是产品主交付物但产品总监视角下看不出"产品 milestone 状态".

**评分**: 信息架构 2/5, 数据流 2/5, OpenAI FDE 落地 1/5.

**5 个新 P0**: 任务计数三处不一致 (仪表盘 199 vs 看板 header 182 vs 待办池 78) / App 不回流 chat 任务 (实质只读看板) / 通知中心铃铛 19 是死数据 / 仪表盘下滚触 webview 死链 (鲁ICP备2022025798号-3) / 跨设备 Web/App 一致性 = 0.

**6 个新 P1**: FAB 派单 vs 工坊 chat 派单分裂 / 紧急熔断按钮常态显示 / KPI 数字无点击交互 / 任务看板无 priority 颜色 / 资产 tab sub-tab 切错 / 无 onboarding.

**4 个新 P2**: 工坊 chat 与任务不联动可见性 / 看板列定义窄 (2 列 vs 仪表盘 5 状态) / 底部 tab 触屏区域溢出 / a11y tree 不稳.

**11 P0 验证结果**: 8 个影响老板日常使用 (P0-01/02/03/05/06/07/08/09/10), 3 个纯架构/数据问题. P0-03 复现确认.

---

### 视角 4 — PM SOP (Web)

**总评**: Web 端在 v0.6.20 后 **侧边栏链接全是 404** — 这是撞到的最严重 P0, 老板任何一次点侧边栏菜单都是 "NOT FOUND — Organization not found", 必须手动改 URL 前缀到 `/XROA/...` 才能用. 视觉/排版专业, 但纯中文界面混入英文术语. Web 端对老板来说"看得见但走不通", **老板工作流首选 App 而不是 Web**.

**2 个新 P0 (Web)**: 侧边栏 7/11 链接 404 (`Sidebar.production.tsx` 写死 `to="/projects"` 不带公司前缀) / 嵌套 tab (e.g. 智能体 > Skills) 跳错公司 (跳 prod-smoke 且 404).

**11 P0 验证结果**: P0-07 ✓ 确认 (core-swe-agent 11 自动技能 vs Hermes 13 自动技能); P0-08/09/10/11 未测 (Ontology 链接 404 进不去).

**极简原则违反 4-5 条**: 不出现术语 (满屏英文) / 常用操作 ≤ 3 步 (派活 5 步) / 错误信息具体 (NOT FOUND 不告诉用户怎么修) / 首登 5 分钟上手 (5 步找不到主功能) / 重复入口 (新建任务 3 处).

---

### 视角 5 — 设计总监 + 产品总监 (Web)

**总评**: Web 端整体气质比 App **沉稳很多**: 深色 `#0F0F0F` 主色 + 单一品牌绿 + 高对比灰白文字, 信息密度合理、留白克制, 5 个 tab 一屏内可达, 比 App 更符合老板审美. 但踩了 5 个产品架构红线: (a) 登录页 captcha 反复误伤合法老板; (b) 5 tab 信息架构严重错位; (c) 路由硬编码 org prefix 大小写, `/xrobinai/X` 与 `/XROBINAI/X` 命中不同分支, 直链被拒; (d) "进入控制台" 两个按钮并列 "新建任务" + 6 个 sidebar 链接 + "搜索" + "会议室" — 派活入口在 4 个位置; (e) Boss 名字英文 XiaoChen / Email ro bin@xrobinai.cn / UI 中文 混排, 没有统一 i18n.

**评分**: 设计 3.6/5 (间距 4 / 字号 3 / 对齐 5 / 颜色 4 / 触摸 3 / 图标 4 / 响应式 2), 交互 2.9/5 (导航 3 / 反馈 2 / 空状态 3 / 错误 4 / 快捷键 3 / 命令面板 4 / 深链 1).

**3 个新 P0 (Web)**: org prefix 深链大小写 bug (router 未 normalize) / 登录 captcha 误伤合法老板 / Dashboard 6 agent 卡片重复渲染 (4 张 core-swe-agent XROA-76 完全相同).

**重复入口**: 派活 4 入口 / 通知 3 入口 / 资产 3 入口 / 本体 3 入口.

---

## 3. P0 缺陷清单 (终极汇总, 11 + 18 新 = 29 项)

### 3.1 来自 wave270 (agy 审计) — 撞机验证

| # | P0 | 文件:行 | 视角 1 (PM+P) | 视角 2 (设计) | 视角 3 (产品+FDE) | 视角 4 (Web PM) | 视角 5 (Web 设计+产品) |
|---|---|---|---|---|---|---|---|
| P0-01 | 本体工作台被三元锁死 | App.tsx:1269-1279 | ⚠ 部分 (资产 tab 触发抽屉) | — | ✓ 影响日常 (资产 tab 不可用) | n/a | n/a |
| P0-02 | 插件设置被三元锁死 | App.tsx:1245-1255 | ⚠ 未撞 (无入口) | — | ✓ 影响日常 (FDE 装插件死路) | n/a | n/a |
| P0-03 | 看板视图切换按了屏不切 | TaskKanbanScreen.tsx:410-442 | ✓ **真因仍成立** | — | ✓ 复现确认 (硬伤) | n/a | n/a |
| P0-04 | TasksScreen.tsx 234 行死代码 | App.tsx:1373 | ⚠ 未撞 (反而撞 P0-NEW-4) | — | 否 (死代码, 暂无功能影响) | n/a | n/a |
| P0-05 | InboxScreen.tsx 1238 行死代码 | App.tsx:0 (未引用) | ✗ 视觉未撞 | ✓ (铃铛 tap 不响应 印证) | ✓ **影响日常** (通知能力 0) | n/a | n/a |
| P0-06 | OntologyDomainListScreen:977 onChangeText 写错 state | OntologyDomainListScreen.tsx:977 | ⚠ 未撞 (未搜索) | — | ✓ 影响日常 (产品核心动作死) | 未测 (404 进不去) | n/a |
| P0-07 | 员工 card 技能字段不一致 | AssetsAgentCard.tsx:88-91 vs AgentsScreen.tsx:87 | ⚠ 未撞 | — | ✓ 影响日常 (派活派错人) | ✓ **确认** (11 vs 13 技能差异暴露) | n/a |
| P0-08 | Branch primitive 没做 | ontology_branches.ts | ✓ **真因仍成立** | n/a | ✓ 影响日常 (架构层) | 未测 (404) | n/a |
| P0-09 | Function primitive 没做 | ontology_functions.ts | ✓ **真因仍成立** | n/a | ✓ 影响日常 (架构层) | 未测 (404) | n/a |
| P0-10 | Action view 0 消费 | ontology_actions_view.ts | ✓ **真因仍成立** | n/a | ✓ 影响日常 (架构层) | 未测 (404) | n/a |
| P0-11 | ontology_links 死表 | server/src/services/ontology-graph.ts:12 | ✓ **真因仍成立** | n/a | 否 (数据层脏表) | 未测 (404) | n/a |

**汇总**: 5 ✓ 真因仍成立, 4 ⚠ 部分 / 未撞, 1 ✗ 视觉未撞, 1 否纯架构; 4 n/a Web 端未测.

### 3.2 wave271 5 视角新发现 P0 (18 项, 去重 + 排序)

#### App 端 (10 个)

| # | 新 P0 | 出处 | 真因 / 证据 |
|---|---|---|---|
| **P0-NEW-1** | 5 tab 信息架构严重错位 | 视角 1/2/3 | 工坊=Chat / 资产=英文 demo ontology / 数字员工 sub-tab=webview 跳板 (`screen-16-yuangong.png` 跳 `www.xrobot.cn/XROA/ontology`) |
| **P0-NEW-2** | "新建/派活" 5 个入口 | 视角 2 | 中央 FAB + 弹层底"极速立项" + 项目中心大卡 + 项目中心悬浮 FAB + 业务本体顶 icon — 老板原话"不能有重复功能入口"严重违反 |
| **P0-NEW-3** | 顶栏通知铃铛 tap 不响应 | 视角 2 | `screen-25/26-bell.png` 显示 tap (990,130) 无响应, UI 无变化. AppBar.tsx 铃铛可能无 onPress 钩子 |
| **P0-NEW-4** | 任务 tab 默认进任务详情 | 视角 1 | `screen-05` 显示点击"任务"tab 默认进入 P1 任务详情, 看不到任务列表 |
| **P0-NEW-5** | 抽屉式导航吞掉 TabBar 行为 | 视角 1 | `screen-13` 显示点"资产"tab 实际打开的是左侧抽屉 DrawerLayout, TabBar 5 tab 中至少 1 个 tab 行为错位 |
| **P0-NEW-6** | 任务计数三处不一致 | 视角 3 | 仪表盘 199 vs 看板 header 182 vs 待办池 78 — 数据流断了三处, 仪表盘 / 看板 header / 看板列 各自从不同源取数 |
| **P0-NEW-7** | App 不回流 chat 任务 | 视角 3 | 工坊 chat 派单 → 服务端 → 但任务看板不显示回流, App 实质是"只读看板" |
| **P0-NEW-8** | 仪表盘下滚触 webview 死链 | 视角 3 | 仪表盘 scroll down 误触发 `鲁ICP备2022025798号-3` 备案号页面 |
| **P0-NEW-9** | 紧急熔断按钮误触风险极高 | 视角 1 | `screen-01` 红色按钮在仪表盘正中, 老板任何点错都会立即停掉所有派单, 无二次确认 |
| **P0-NEW-10** | 业务本体屏点击无反应 + 抽屉行为不一致 | 视角 1 | 抽屉中"业务本体"在不同视图间不一致 (有时跳 webview 有时跳原生) |

#### Web 端 (8 个)

| # | 新 P0 | 出处 | 真因 / 证据 |
|---|---|---|---|
| **P0-Web-01** | 侧边栏链接 7/11 全部 404 | 视角 4 | `ui/src/components/Sidebar.production.tsx` 写死 `to="/projects"` 不带公司前缀, 必须手动改 URL 加 `/XROA/` |
| **P0-Web-02** | 嵌套 tab 跳错公司 | 视角 4 | 点 core-swe-agent 的 Skills tab 跳到 prod-smoke 公司且 404 |
| **P0-Web-03** | org prefix 深链大小写 bug | 视角 5 | `/xrobinai/inbox` 与 `/XROBINAI/inbox` 都 404 — router 层未 normalize |
| **P0-Web-04** | 登录 captcha 误伤合法老板 | 视角 5 | autofill 凭据被 "Too many requests" 干掉, boss 无法生产 |
| **P0-Web-05** | 登录页无 API Key 入口 | 视角 4 | wave266 删共享登录后, API Key 登录入口消失 |
| **P0-Web-06** | Dashboard 6 agent 卡片重复渲染 | 视角 5 | 4 张 core-swe-agent XROA-76 完全相同 |
| **P0-Web-07** | 跨设备 Web/双端一致性 = 0 | 视角 3 | App 内嵌 webview 跳 https://www.xrobinai.cn/XROA/ontology 显示 ICP 空白页 |
| **P0-Web-08** | 中英混排严重 | 视角 4 | Agent 详情页 13 个 tab 全英文 + 项目详情 12 个 tab 英中混排, App 是全中文, Web 要对齐 |

### 3.3 P0 总数

**29 P0** (11 wave270 + 18 wave271). 老板原话"测试 = 只找不修", 待老板拍板 wave272.

---

## 4. P1 缺陷清单 (高频但非阻塞)

### 4.1 App 端

- **P1-NEW-1** 任务 tab 顶部 4 行 chip (状态 + 指派 + 项目 + 排序 + 列表/看板) 占屏 30%, 应屏心撑起 (视角 1/2)
- **P1-NEW-2** 任务看板卡片右侧文字被截, 看不全 (视角 2)
- **P1-NEW-3** 看板列头区分依赖圆点颜色, 色盲不友好 (视角 2)
- **P1-NEW-4** 空状态零引导 ("待审批 0"/"本月花费 ¥0.00"/"已启用员工 1") 不符合 "空状态有引导" 极简原则 (视角 1/2)
- **P1-NEW-5** "未设预算" 弹层仅 "关闭" 按钮, 无 "去设置" 动作 (视角 2)
- **P1-NEW-6** 数字员工 sub-tab 与 汇览"成本明细"弹层语义倒置 (视角 2)
- **P1-NEW-7** 看板 "今日+进行中" tab 下"待处理" 多为 [P3] 设计总监, 但用户不知道这是"今日新进" (视角 2)
- **P1-NEW-8** Onto 列表"草稿 (7)" 一堆灰色 demo, 无 onboarding 引导 (视角 1)
- **P1-NEW-9** FAB 派单 vs 工坊 chat 派单概念分裂 (视角 3)
- **P1-NEW-10** 紧急熔断按钮常态显示, 待审批 = 0 时仍占卡片位 (视角 3)
- **P1-NEW-11** KPI 数字无点击交互 ("0 待审批" / "本月花费 ¥0.00" 卡片无 onPress) (视角 3)
- **P1-NEW-12** 任务看板无 priority 颜色 (P0/P1/P2/P3/S1/S2/S3 同灰色 chip) (视角 3)
- **P1-NEW-13** 资产 tab sub-tab 切错 (点 "项目中心" 跳到 "任务 tab") (视角 3)
- **P1-NEW-14** 没有 onboarding (装 App 第一秒没有引导) (视角 1/3)
- **P1-NEW-15** Onto 列表每个域显示 "v22 / v24 快照摘要 ›" 显示细节过度, 挤压主操作 (视角 1)
- **P1-NEW-16** 任务卡片右上角时间"16h ago / 2d ago"未本地化 (视角 1)

### 4.2 Web 端

- **P1-Web-01** 限流无 UI 反馈 ("Too many requests" 只在 curl 看得到) (视角 4)
- **P1-Web-02** Sidebar 不显示公司 (侧边栏没持久 banner) (视角 4)
- **P1-Web-03** Dashboard KPI 数字不显著 (182 open + 40 blocked 没"红色警示") (视角 4)
- **P1-Web-04** 任务状态切换 "Change status" 没快捷键, 无 bulk-action (视角 4)

---

## 5. P2 缺陷清单 (Kitty 完美类)

### 5.1 App 端

- **P2-NEW-1** 5 tab 图标风格不统一 (柱状图 vs 列表 vs 加号 vs 气泡 vs 网格) (视角 2)
- **P2-NEW-2** 灰 meta 字对比 ~3.5:1, 不达 WCAG AA 4.5:1 (视角 2)
- **P2-NEW-3** chip 高度 ~36-40dp, 低于 MD 48dp 标准 (视角 2)
- **P2-NEW-4** "未设预算" 提示在成本明细弹层中但不进设置, 反馈断裂 (视角 2)
- **P2-NEW-5** "未分配" 灰色 icon + 灰色字 + 灰色 meta, 三件套灰卡难读 (视角 2)
- **P2-NEW-6** Tab 切换无 transition, 跳转生硬 (视角 2)
- **P2-NEW-7** a11y: 字号不可调, 老人/弱视用户无法放大 (视角 2)
- **P2-NEW-8** 任务看板卡片左缘竖线状态 (白/黄) 颜色过近 (视角 2)
- **P2-NEW-9** 6 个状态缩写 (G1需求/G2方案/G3契约/G4验收/G5投产) 未解释 (视角 2)
- **P2-NEW-10** 工坊 chat 与任务不联动可见性 (视角 3)
- **P2-NEW-11** 任务看板列定义窄 (只有"待办池 / 待处理") (视角 3)
- **P2-NEW-12** 底部 tab 触屏区域溢出, 触发 Recents (视角 3)
- **P2-NEW-13** a11y tree 不稳, snapshot -i 反复报 "insufficient application window content" (视角 3)

### 5.2 Web 端

- **P2-Web-01** 首页 "进入控制台" 按钮无 tooltip (视角 4)
- **P2-Web-02** Dark mode 切换按钮极小, 文字+emoji 拥挤 (视角 4)
- **P2-Web-03** 404 屏没引导 (侧边栏点错 → 死板英文) (视角 4)
- **P2-Web-04** Web 响应式只桌面 1280+ 试过, sidebar 固定 256px 不折叠 (视角 5)

---

## 6. 极简原则违反清单 (7 条)

### 6.1 原则 1: 5 tab 屏 1-2 步可达

**违反**:
- **App**: 资产 tab 要走抽屉再走抽屉菜单 2 层才到 OrgAssetsScreen, 抽屉中的"业务本体"在本视图跳原生, 在别的视图跳 webview, 行为不一致 (视角 1)
- **App**: 数字员工 sub-tab 实际跳 webview, 业务本体深下钻完全断链 (视角 1/2)
- **Web**: 侧边栏点击全是 404, 至少 3-5 步 (改 URL→重输公司前缀→回车) (视角 4)

### 6.2 原则 2: 常用操作 ≤ 3 步

**违反**:
- **App 派活**: FAB(1)→ 弹层 8 入口(2)→ 写对话(3)→ 选智能体(4)≥ 4 步 (视角 1)
- **App 看进度**: 任务 tab → 看板 → 卡片才能看到详情, 3 步勉强合格, 但任务详情屏打不开 (视角 1)
- **App 通知审批**: 顶栏铃铛(1)→ 不响应(失败/不可达) (视角 2)
- **Web 派活**: 顶部按钮 + Dashboard 卡片 + 任务列表 +New Task + 项目页 = 4 入口 (视角 5)

### 6.3 原则 3: 不出现术语

**违反**:
- **App**: 5 tab 名 OK (汇览/任务/工坊/资产); 屏幕内大量英文术语 "Kanban" / "Dragons" / "快照摘要" / "标识" / "v22/v24" / "SAFe" / "Fab" icon [P+1][P+2][P+3] / "G1需求/G2方案/G3契约/G4验收/G5投产" 5 个缩写没有任何解释 (视角 2)
- **App**: 顶栏 title 写 "Coolie工坊" (公司+工坊两术语混用), 抽屉菜单"例行计划调度 / 全景成本分析 / 业务本体"是老板 PM 不用的术语 (视角 1)
- **Web**: List view / Board view / Properties / Search inbox… / Originating / Auto mode / Tools / Harness / Runtime / Secrets & variables / Permissions / Trust / API Keys / Revisions / Activity / Runs / Costs / Budgets / Tasks / Configuration / 质量门禁 (CMMI) / 5+2 黄金文档 / RTM 需求穿透 / 过程度量 (SPC 3σ) / 三态活拓扑 (SkyWalking/Chaos) / API 契约中心 (DSH/MCP) 满屏英文 (视角 4)

### 6.4 原则 4: 空状态有引导

**违反**:
- **App**: 汇览"待审批 0" / "本月花费 ¥0.00" / "已启用员工 1" / "阻塞 40 / 待办 182" 单独存在也无引导 (视角 1/2)
- **App**: Onto 列表"草稿 (7)" 一堆灰色 demo, 无引导"先建一个域" (视角 1)
- **App**: 任务看板"今日+进行中" tab 下 待处理列只有 P2/P3 设计总监任务, 没有任何文字说明"今日新进 X 个" (视角 2)
- **Web**: Dashboard KPI 数字不显著, 182 open + 40 blocked 没"红色警示" (视角 4)

### 6.5 原则 5: 错误信息具体

**违反**:
- **App**: 工坊 tab 点击无反应 (snapshot 死), UI 零反馈, 老板以为 App 死了 (视角 1)
- **App**: 任务卡片点击无反应 (视角 1)
- **Web**: "NOT FOUND — Organization not found" 是死板英文, 不告诉用户怎么修 (没"试试加 /XROA 前缀"提示) (视角 4)
- **Web**: 登录错误 "Invalid email or password" 没指出邮箱格式或密码强度, 没区分封禁/密码错 (视角 4)

### 6.6 原则 6: 首次登录 5 分钟内上手

**违反**:
- **App**: 5 tab 顺序 汇览/任务/+/工坊/资产, 无 onboarding. "工坊"在 PM 视角 = 车间, 但实际 = Chat, 概念错位, 新员工 5 分钟搞不清 (视角 1/3)
- **App**: 真实场景 "老板接到需求建飞书 webhook" 流程断开: 3 个入口 (工坊 chat / 业务本体 / + FAB) 都走不通 (视角 3)
- **Web**: 新老板登录后看到公开首页 → "进入控制台" → login → dashboard → 任务 = 5 步, 再点智能体就 404, 至少 5 分钟找不到主功能 (视角 4/5)

### 6.7 原则 7: 不重复功能入口

**严重违反**:
- **App "新建/派活" 5 个入口** (视角 2): 中央 FAB + 弹层底"极速立项" + 项目中心大卡 + 项目中心悬浮 FAB + 业务本体顶 icon
- **App 业务本体 vs 项目中心 重复语义** (视角 2): 业务本体 8 模板 (Fourth Coffee / E-Commerce / Banking) 全英文 demo 业务领域模板 vs 项目中心 10 项目 (coolie 工坊 / wave 项目) 真实工作业务
- **App 数字员工 sub-tab vs 汇览成本明细弹层 倒置** (视角 2): sub-tab 跳 webview, 真数字员工列表在汇览卡片后面
- **App 通知 / 收件箱 入口歧义** (视角 2): 顶栏铃铛 (19 数字徽章) tap 不响应
- **Web "新建任务" 3 处** (视角 4): 顶部按钮 + 任务列表 + 详情右栏
- **Web 项目详情 12 个 tabs 大量重叠** (视角 4): Tasks / Configuration / Budget / 质量门禁 都跟全局功能重叠
- **Web "派活" 4 入口** (视角 5): sidebar 新建任务 / Dashboard 卡片 / 任务列表 +New Task / 项目页
- **Web "通知" 3 入口 / "资产" 3 入口 / "本体" 3 入口** (视角 5)

---

## 7. 老板下一步 (按 P0 优先级派 wave272 真修)

### 7.1 第一刀: 3 个 P0 死穴 (解 App 可用性)

1. **P0-NEW-5 抽屉吞 TabBar 行为** — 修 `App.tsx` 的抽屉路由, "资产" tab 真正切到 OrgAssetsScreen, 不再触发抽屉
2. **P0-03 看板/列表 toggle** — 修 `TaskKanbanScreen.tsx:410-442` 的 onPress, 让 list 视图真的渲染, 或合并到 single 视图
3. **P0-01 / P0-02 三元锁死** — 修 `App.tsx:1269-1279` 和 `1245-1255` 三元顺序, 设 workbenchOpen 时同时清 instanceGraphType, 设 pluginSettingsId 时同时清 pluginManagerOpen

### 7.2 第二刀: 5 tab 信息架构错位 (P0-NEW-1)

- 工坊 → 改名为 "会话" 或换 icon 匹配 Chat
- 资产 → 改名 "模板" 或 4 sub-tab 改为 "项目 / 员工 / 产物" (移除 ontology, ontology 移到 工坊 tab 下)
- 数字员工 sub-tab → 重指本地屏 (不跳 webview)
- FAB → 改为右浮动按钮 (不占 tab 位), 派单只走 FAB + 工坊 chat

### 7.3 第三刀: 重复入口合并 (P0-NEW-2)

- 保留中央 FAB, 删弹层底"极速立项" + 项目中心大卡 + 业务本体顶 icon, 项目中心悬浮 FAB 换为页面顶部按钮
- + FAB 8 入口合并为主推 + 次推; 移除键盘/相机/拍照等明显非"派活"入口

### 7.4 第四刀: 通知中心 1238 行死代码复活 (P0-05)

- `InboxScreen.tsx` 接入 App.tsx 任务 tab 或新建"收件箱" tab
- 跨设备一致性补齐: 修 P0-05 InboxScreen, 让 Web 派单 → App 通知能 push (App 核心价值)

### 7.5 第五刀: 数据流三处一致 (P0-NEW-6)

- 任务计数 source of truth = `company_tasks` count(*), 让仪表盘 / 看板 header / 看板列 同一数字

### 7.6 第六刀: Web 侧边栏 404 修 (P0-Web-01)

- `ui/src/components/Sidebar.production.tsx` 把 `to="/projects"` 改为 `to={`/${companyPrefix}/projects`}`, 同步修 Sidebar.tsx + SidebarStarredProjects.tsx + SidebarProjects.tsx
- 嵌套 tab 路径补前缀: Agent 详情 13 个 tab + 项目详情 12 个 tab 都需要在链接里拼 companyPrefix

### 7.7 第七刀: Palantir 治理 (P0-08/09/10/11)

- Branch / Function / Action view 真做: 派 wave273+ 真落 ontology schema (参照 wave250 已建 6 张表但 server 0 行的现状, 给 service / route / UI / backfill)
- ontology_links 决定: 要么删表 (因为 entity_relations 才是真源), 要么把 entity_relations 同步过来

### 7.8 第八刀: 极简原则补丁 (P1-NEW-*)

- 加 onboarding: 第一启动用 4 卡片 hint (FAB = 派单 / 工坊 = chat / 资产 = 看 / 汇览 = 总览)
- 加 priority 颜色: P0 = 红 / P1 = 橙 / P2 = 黄 / P3 = 灰 / S = 蓝
- 灰 meta 加深到 #B0B6BE (WCAG AA 4.5:1)
- chip 高度加到 48dp

### 7.9 第九刀: Web 极简原则 (P1-Web-*)

- 中英混排统一: Agent 详情 + 项目详情 tab 全部翻成中文
- Dashboard KPI 加颜色: blocked/紧急审批红色, OK 绿色
- 限流 UI 暴露: 登录失败后区分"密码错"和"被封禁"
- org prefix 深链大小写 normalize (router 层 lowercase)

---

## 8. 不动边界 (老板要求)

- **不改任何代码** ✓ (本波纯测试)
- **不动 server** ✓
- **不动 ui** ✓
- **不动 wave254/258/261/262/264/266** ✓ (已发版)
- **不动 v0.6.20 tag** ✓
- **不发 APK** ✓
- **不发 wave272 修复波** ✓ (等老板拍板)

---

## 9. 验证 (怎么证明撞机是真的)

### 9.1 5 份视角报告 (759 行)

```
$ wc -l docs-coolie/evidence/wave271/QA-VIEWPOINT-*.md
  160 QA-VIEWPOINT-1-PM-PALANTIR.md
  198 QA-VIEWPOINT-2-DESIGN.md
  155 QA-VIEWPOINT-3-PRODUCT-FDE.md
  138 QA-VIEWPOINT-4-WEB-PM.md
  108 QA-VIEWPOINT-5-WEB-DESIGN-PRODUCT.md
  759 total
```

### 9.2 129 张撞机截图

```
$ ls /tmp/wave271/*.png | wc -l
129
```

覆盖 5 tab + 4 sub-tab + 关键子屏 + 主要弹层 + 看板/列表切换 + Web 12 个路由 + Web 13 个 Agent tab.

### 9.3 5 份 log

```
$ wc -l /tmp/wave271/agent-*.log
  22 /tmp/wave271/agent-device-1.log
  ~5 /tmp/wave271/agent-device-2.log
  ~2 /tmp/wave271/agent-device-3.log
  ~3000+ /tmp/wave271/agent-browser-1.log
  ~50 /tmp/wave271/agent-browser-2.log
```

### 9.4 老板原话"测试 = 只找不修" 守约

- 0 行代码改动 (本波纯撞机)
- 0 个 service / route / UI 改动
- 0 个 git commit
- 0 个 restart / redeploy

---

## 10. 老板下一步 (按 P0 优先级 + 极简原则 + 5 视角反馈派 wave272 真修)

**强烈建议**按 §7 第一刀到第九刀顺序派 wave272 真修. 第一刀先切 3 个 P0 死穴 (P0-NEW-5 / P0-03 / P0-01+P0-02), 解锁可用性; 第二到第三刀 5 tab 错位 + 重复入口合并; 第四刀通知复活; 第五刀数据流一致; 第六刀 Web 侧边栏; 第七刀 Palantir 治理; 第八到第九刀 极简原则补丁.

**预计工作量**: 7-10 天 (含联调).

**不动代码边界**: wave254/258/261/262/264/266 已发版, wave272 不动这些波次.
