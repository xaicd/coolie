# wave271 evidence QA-REPORT (汇总索引)

> **命令 (老板原话 2026-10-02)**: 「你最好进行 APP全业务的测试验证... 使用模拟器 验证APP 功能, 找出缺陷, 不只是功能BUG, 设计, 布局, 产品架构 都可以定位, 开始用agent-device, agent-browser干活吧; 极简使用主义, 不能有重复功能入口, 傻瓜式使用最好, 不用人培训就可以快速上手使用」

> **测试定位**: 只测, 不修代码. 不动 server / ui / wave254/258/261/262/264/266 / v0.6.20 tag.

> **基础**: wave270 agy 全量审计 (1755 行). wave271 用 5 agent 并行 (3 App + 2 Web) 真机模拟器 + 真 Web 端撞机.

## 1. 撞机矩阵

5 个并行 agent 撞机 (3 App + 2 Web), 各产 1 份视角报告:

| # | 视角 | Agent | 工具 | 报告 | 行数 |
|---|---|---|---|---|---|
| 1 | 新型软件交付公司负责人 + Palantir 5 角色 (App) | agent-device-1 | agent-device --serial emulator-5554 | [`QA-VIEWPOINT-1-PM-PALANTIR.md`](QA-VIEWPOINT-1-PM-PALANTIR.md) | 160 |
| 2 | 设计总监 (App) | agent-device-2 | agent-device --serial emulator-5554 | [`QA-VIEWPOINT-2-DESIGN.md`](QA-VIEWPOINT-2-DESIGN.md) | 198 |
| 3 | 产品总监 + OpenAI FDE (App) | agent-device-3 | agent-device --serial emulator-5554 | [`QA-VIEWPOINT-3-PRODUCT-FDE.md`](QA-VIEWPOINT-3-PRODUCT-FDE.md) | 155 |
| 4 | 新型软件交付公司负责人 (Web) | agent-browser-1 | agent-browser | [`QA-VIEWPOINT-4-WEB-PM.md`](QA-VIEWPOINT-4-WEB-PM.md) | 138 |
| 5 | 设计 + 产品总监 (Web) | agent-browser-2 | agent-browser | [`QA-VIEWPOINT-5-WEB-DESIGN-PRODUCT.md`](QA-VIEWPOINT-5-WEB-DESIGN-PRODUCT.md) | 108 |

Σ = **759 行报告**.

## 2. 撞机 log 路径

- App agent 1: `/tmp/wave271/agent-device-1.log` (22 行)
- App agent 2: `/tmp/wave271/agent-device-2.log` (~5 行)
- App agent 3: `/tmp/wave271/agent-device-3.log` (~2 行)
- Web agent 1: `/tmp/wave271/agent-browser-1.log` (3000+ 行)
- Web agent 2: `/tmp/wave271/agent-browser-2.log` (~50 行)

> **注**: log 行数 ≠ 报告行数. log 是撞机命令时间戳记录, agent 实际撞机截图 + 报告在另一处写.

## 3. 截图清单

`/tmp/wave271/*.png` — **129 张** App 撞机截图 + Web 撞机截图.

按视角分布:
- App 视角 1: ~50+ 张 (screen-00 ~ screen-26, 含列表/看板切换 + 抽屉 + 业务本体)
- App 视角 2: 26+ 张 (覆盖 5 tab + 4 sub-tab + 弹层)
- App 视角 3: 24 张 (覆盖 5 tab + 抽屉 + 任务看板)
- Web 视角 4: 41 张 (web-00 ~ web-23+, 覆盖 12+ 路由 + 13 Agent tab)
- Web 视角 5: 41 张 (覆盖登录页 + 任务 + 项目 + 智能体)

## 4. 总报告

`/Users/mac/workspace/xaicd/coolie/docs-coolie/QA/2026-10-01-wave271-full-test.md` (415 行, 33K)

包含:
- §0 TL;DR (老板原话 5 句核心结论)
- §1 撞机矩阵
- §2 5 视角总评 (已汇总)
- §3 P0 缺陷清单 (29 项: 11 wave270 + 18 wave271)
- §4 P1 缺陷清单 (20 项)
- §5 P2 缺陷清单 (17 项)
- §6 极简原则违反清单 (7 条)
- §7 老板下一步 (9 刀派 wave272 顺序)
- §8 不动边界
- §9 验证
- §10 老板下一步

## 5. 撞机环境

- 模拟器: `emulator-5554` (Android API 28, 1080×2280)
- App: `cloud.coolie.app` v0.6.20
- Web: `https://xrobinai.cn` (prod)
- agent-device: Homebrew `/opt/homebrew/bin/agent-device`
- agent-browser: Homebrew `/opt/homebrew/bin/agent-browser`

## 6. 不动边界 (老板要求)

- **不改任何代码** ✓
- **不动 server / ui** ✓
- **不动 wave254/258/261/262/264/266 / v0.6.20 tag** ✓
- **不发 APK** ✓
- **不发 wave272 修复波** ✓ (等老板拍板)

## 7. 关键发现速查 (老板第一眼要看)

### 7.1 终极 P0 (29 项)

**11 wave270 + 18 wave271 = 29**. 详见 [`QA/2026-10-01-wave271-full-test.md` §3](../../QA/2026-10-01-wave271-full-test.md).

**Top 5 最影响老板日常使用 (PM SOP + 产品 + FDE 三视角共识)**:
1. **P0-NEW-5 抽屉吞 TabBar 行为** — "资产" tab 触发抽屉而非 OrgAssetsScreen
2. **P0-03 看板/列表 toggle 按了屏不切** — 老板日常用死循环
3. **P0-01 / P0-02 三元锁死** — 本体工作台 + 插件设置进不去
4. **P0-NEW-6 任务计数三处不一致** — 数据流断了, 老板不知信哪个
5. **P0-05 InboxScreen 1238 行死代码 + P0-NEW-3 顶栏铃铛 tap 不响应** — 通知能力 = 0

**Web 端最严重**:
- **P0-Web-01 侧边栏 7/11 链接 404** — 老板点任何侧边栏菜单都 "NOT FOUND"
- **P0-Web-02 嵌套 tab 跳错公司** — Agent > Skills 跳 prod-smoke 公司

### 7.2 极简原则违反 (5/7 条全部违反)

详见 §6. 老板原话"极简使用主义, 不能有重复功能入口, 傻瓜上手" — 7 条中 5 条系统违反.

### 7.3 5 视角共识

| 维度 | 视角 1 (PM+P) | 视角 2 (设计) | 视角 3 (产品+FDE) | 视角 4 (Web PM) | 视角 5 (Web 设计+产品) |
|---|---|---|---|---|---|
| **总评** | 只读看板 | 5 tab 错位 + 重复入口 | 实质是只读看板 | 首选 App 而非 Web | App 比 Web 沉稳 |
| **新 P0** | 7 | 3 | 5 | 2 | 3 |
| **新 P1** | 3 | 7 | 6 | 4 | — |
| **新 P2** | 2 | 9 | 4 | 3 | 1 |
| **极简违反** | 7/7 | 5/7 | 7/7 | 5/7 | 5/7 |

### 7.4 老板下一步 (按 P0 优先级 + 极简原则 + 5 视角反馈)

§7 派 wave272 真修 9 刀顺序, 第一刀先切 3 个 P0 死穴, 预计 7-10 天.

---

## 8. 老板原话"测试 = 只找不修" 守约

- 0 行代码改动
- 0 个 service / route / UI 改动
- 0 个 git commit
- 0 个 restart / redeploy

---

**总报告路径**: `/Users/mac/workspace/xaicd/coolie/docs-coolie/QA/2026-10-01-wave271-full-test.md`
**本索引路径**: `/Users/mac/workspace/xaicd/coolie/docs-coolie/evidence/wave271/QA-REPORT.md`
