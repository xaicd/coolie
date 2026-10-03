# wave271 撞机视角 4 — Web 端 PM SOP

**测试人**: Claude (MiniMax-M3) — wave271 撞机 agent #4
**视角**: 新型软件交付公司负责人 (PM SOP) — 站在老板每天工作流基础上撞 Web 端
**目标**: `https://xrobinai.cn` (prod)
**日期**: 2026-10-02
**运行 log**: `/tmp/wave271/agent-browser-1.log`
**截图总数**: 41 张 (`/tmp/wave271/web-*.png`)

---

## 1. 视角总评

Web 端在 v0.6.20 (wave266 后) **侧边栏链接全是 404** — 这是撞到的最严重 P0, 老板任何一次点侧边栏菜单都是 "NOT FOUND — Organization not found", 必须手动改 URL 前缀到 `/XROA/...` 才能用。视觉/排版专业, 但**纯中文界面混入英文术语** (Properties / Search inbox… / Originating / Auto mode / Disable parent-child nesting / List view / Board view) 跟 App 中文界面分裂。Web 端对老板来说"看得见但走不通", 反而 App (App 内置 SPA) 的 URL 拼接逻辑是修过的, 这波撞机后**老板工作流首选 App 而不是 Web**。

## 2. Web 走过的截图清单

`/tmp/wave271/web-00-landing.png` (首页/落地页)
`/tmp/wave271/web-01-login.png` (登录页, 仅邮箱密码+注册)
`/tmp/wave271/web-02-dashboard.png` (xrobinai 公司仪表盘)
`/tmp/wave271/web-03-tasks.png` (任务列表 List view)
`/tmp/wave271/web-04-task-detail.png` (任务详情 XROA-210)
`/tmp/wave271/web-05-projects.png` (项目列表 — 但点详情 404)
`/tmp/wave271/web-06-project-detail.png` (项目详情 404 屏)
`/tmp/wave271/web-07-projects-xroa.png` (手动加前缀后项目列表 OK)
`/tmp/wave271/web-08-project-detail.png` (项目详情 tabs)
`/tmp/wave271/web-09-project-milestone.png` (里程碑主线 tab)
`/tmp/wave271/web-10-governance.png` (架构与质量治理控制台)
`/tmp/wave271/web-11-agents.png` (智能体列表 — 侧边栏点进来 404, 手动加前缀 OK)
`/tmp/wave271/web-12-agent-detail.png` (core-swe-agent 详情)
`/tmp/wave271/web-13-agent-skills.png` (core-swe-agent 技能, 11 自动)
`/tmp/wave271/web-14-hermes-skills.png` (Hermes 技能, **13 自动**)
`/tmp/wave271/web-15-inbox.png` (收件箱 — 侧边栏 4 通知)
`/tmp/wave271/web-19-projects.png` 等

## 3. 登录页评估

- **入口**: 仅 2 个 (Sign In 邮箱密码 + Create one 注册)。**没有 API Key 入口** — wave266 删了"共享登录"按钮后, API Key 登录从 Web 登录页消失 (老板得用 BA 端 `/api/auth/exchange?token=...` 自己换, 普通用户不知道)。
- **视觉**: 干净, 暗色模式有切换按钮 (`Switch to dark mode`), ASCII art 装饰图标。 极简, 不杂乱。
- **步骤**: 邮箱+密码 + Sign In, 1 步。
- **限流问题 (P2)**: 多次失败尝试后服务端返 `429 Too many requests` — 没在 UI 暴露给用户, 只在 curl 看得到。老板忘记密码狂点会被静默封。

**额外的非文档登录路径**: 老板 cookie (`__Secure-paperclip-default.session_token=<token>.<HMAC>`) 是通过 `GET /api/auth/exchange?token=pcp_board_xxx&next=/` 由 board token 兑换的。这是 wave100 修过的 BA bridge, 但**登录页没暴露这条** — 实际上登录页只能让普通用户用, board key 用户得会用 API。

## 4. 主菜单结构评估

侧边栏分 2 组:
- **工作**: 任务 / 项目 / 例行任务 / 产物 / Voice / Ontology / 架构治理 (7 项)
- **组织**: 智能体 / 技能 / 连接器 / 审计 (4 项)

顶部独立按钮: 新建任务 / 搜索 / 仪表盘 / 收件箱 (4) / 会议室 (5)

- **优点**: 中文命名, 老板能看懂 (任务/项目/智能体/连接器都贴合 PM 工作流)。
- **缺点**:
  - **侧边栏链接 7/11 全部 404**: 点 任务 / 项目 / 例行任务 / 产物 / Voice / Ontology / 智能体 → "NOT FOUND — Organization not found" (必须 URL 加 `/XROA/` 前缀)。
  - 5 tab (新建任务/搜索/仪表盘/收件箱/会议室) 全部 OK。
  - 横向"组织"组 (智能体/技能/连接器/审计) 全部 404。
  - 关键 KPI (6 智能体/182 open/40 blocked/$0.00 本月支出/0 审批) 在仪表盘 OK 但读起来仍是英文 "1 进行中的任务 182 open, 40 blocked" — 中英混排。

## 5. 极简原则 7 条违反清单 (Web 端)

1. **5 tab 屏 1-2 步可达** ❌ — 侧边栏点击全是 404, 至少 3-5 步 (改 URL→重输公司前缀→回车)。
2. **常用操作 ≤ 3 步** ❌ — 点 智能体 进不去 (404); 派活路径: 任务 → 新建 → 填表 = 5 步。
3. **不出现术语** ❌ — List view / Board view / Properties / Search inbox… / Originating / Auto mode / Disable parent-child nesting / Tools / Harness / Runtime / Secrets & variables / Permissions / Trust / API Keys / Revisions / Activity / Runs / Costs / Budgets / Tasks / Configuration / Budget / 质量门禁 (CMMI) / 5+2 黄金文档 / RTM 需求穿透 / 过程度量 (SPC 3σ) / 三态活拓扑 (SkyWalking/Chaos) / API 契约中心 (DSH/MCP) — 整个 Agent 详情页 + 项目 tabs **满屏英文术语**。
4. **空状态有引导** ✅ — 项目列表"Add Project"按钮在; 智能体空时 (实际不空) 默认展示已启用 6 个。多数屏无空态文案。
5. **错误信息具体** ❌ — "NOT FOUND — Organization not found" 是死板英文, 不告诉用户怎么修 (没"试试加 /XROA 前缀"提示)。登录错误 "Invalid email or password" 没指出邮箱格式或密码强度。
6. **首次登录 5 分钟内上手** ❌ — 新老板登录后看到的第一个页面就是首页 (公开 landing), "进入控制台"按钮 → login → dashboard → 任务 = 5 步, 再点智能体就 404。至少 5 分钟找不到主功能。
7. **不重复入口** ⚠️ — 新建任务在顶部按钮 + 任务列表 + 详情右栏共 3 处; 项目详情有 12 个 tabs 大量重叠 (Tasks / Configuration / Budget / 质量门禁 都跟全局功能重叠)。

## 6. 11 个 P0 在 Web 端的验证结果

| # | P0 | Web 端结论 |
|---|---|---|
| P0-07 员工 card 技能不一致 | ❌ 确认 | core-swe-agent **11 自动技能**, Hermes **13 自动技能**, ds-agent/fda-agent/fdse-agent/pre-sre-agent 数量差异 (需 wave270 报告对比)。Web 端 Agent 详情 Skills tab "Automatic and detected skills (read-only) N" 直接暴露数字。|
| P0-08 Branch primitive 没做 | 未测 | 跳到 Ontology 链接会 404, 待 wave 后修 |
| P0-09 Function primitive 没做 | 未测 | 同上 |
| P0-10 Action view 0 消费 | 未测 | 任务详情能看到 "Auto mode" 按钮, 但能否消费 Action view 需看 task detail |
| P0-11 ontology_links 死表 | 未测 | Ontology 链接 404 进不去, 待修 |

**额外严重发现 (P0-Web)**:
- **P0-Web-01 侧边栏链接全部不带公司前缀 → 404** — 11 个侧边栏链接 5/5 不可用。`ui/src/components/Sidebar.production.tsx` 写死 `to="/projects"`, `to="/issues"` 等, 没拼接 `companyPrefix`。
- **P0-Web-02 嵌套 tab (e.g. 智能体 > Skills) 跳错公司** — 点 core-swe-agent 的 Skills tab 跳到 prod-smoke 公司且 404。tab 链接路径拼接缺公司前缀。

## 7. 我新发现的 Web 端 P0/P1/P2

### P0-Web-03: 登录页无 API Key 入口
老板手工或 board key 用户没法用 Web 登录, 必须用 curl 调 exchange 端点。普通新用户没 board key 也看不到登录路径。

### P0-Web-04: 中英混排严重, 老板看不懂的英文术语屏
Agent 详情页 13 个 tab 全英文: Overview / Instructions / Skills / Harness / Runtime / Secrets & variables / Tools / Permissions / Trust / API Keys / Revisions / Activity / Runs / Costs / Budgets. 项目详情 12 个 tab 也是英中混排。

### P1-Web-01: 限流无 UI 反馈
"Too many requests" 只在 curl 看得到, UI 端"Invalid email or password" 不区分封禁/密码错。老板狂试会被静默封号。

### P1-Web-02: Sidebar 不显示公司
当前公司"xrobinai"只显示在 OrgSwitcher button 文字里, 侧边栏没持久 banner 提醒老板"现在在哪个公司操作"。

### P1-Web-03: Dashboard KPI 数字不显著
"6 已启用智能体 / 182 open / 40 blocked / $0.00 本月支出 / 0 待处理审批" 5 个 KPI 字号一致, 无颜色/图标区分紧急程度。182 open + 40 blocked 没"红色警示"。

### P1-Web-04: 任务状态切换 "Change status" 没快捷键
每个任务都有"Change status (current: Backlog)"按钮, 但散落在每行, 批量改状态没有 bulk-action — wave270 已说任务看板无 bulk-assign, Web 端同样没有。

### P2-Web-01: 首页 "进入控制台" 按钮无 tooltip
新用户不知道点了会跳到 `/login` (其实是回首页, 因为 SPA 路由), 跟按钮文字不符。

### P2-Web-02: Dark mode 切换按钮极小
`Switch to dark mode` 按钮在右上角, 文字+emoji 拥挤, 没图标按钮。

### P2-Web-03: 404 屏没引导
侧边栏点错 → 死板英文 "NOT FOUND — Organization not found", 没"返回仪表盘"或"换公司"快捷按钮 (只有底部 Open dashboard / Go home 文字链)。

## 8. 推荐改进

### 立即修 (P0)
1. **侧边栏链接拼接公司前缀**: `ui/src/components/Sidebar.production.tsx` 把 `to="/projects"` 改为 `to={`/${companyPrefix}/projects`}`, 同步修 Sidebar.tsx (legacy) + SidebarStarredProjects.tsx + SidebarProjects.tsx。理由: 老板每次点侧边栏都 404 是不可接受的可用性灾难。
2. **嵌套 tab 路径补前缀**: Agent 详情 13 个 tab + 项目详情 12 个 tab 都需要在链接里拼 `companyPrefix`。
3. **登录页加 API Key 入口**: 在"Sign In"旁加"Sign in with API Key"按钮, 复用 wave100 的 BA bridge。

### 中等修 (P1)
4. **中英混排统一**: Agent 详情 + 项目详情 tab 全部翻成中文 (App 是全中文的, Web 也要对齐)。
5. **Dashboard KPI 加颜色**: blocked/紧急审批红色, OK 绿色, 老板一眼看到红 = 优先处理。
6. **限流 UI 暴露**: 登录失败后区分"密码错"和"被封禁", 给用户明确等待时间。

### 低优 (P2)
7. **404 屏加引导**: "没找到 {公司名} — 你是 [切换公司] 还是 [返回仪表盘]?"
8. **Dark mode 改为图标按钮**: 删 emoji, 用 lucide 图标。
9. **首页 "进入控制台" 改文案**: 老板点进去看到的是首页不是控制台, 按钮误导。

---

**截图总数**: 41 张, 路径前缀 `/tmp/wave271/web-*.png`
**运行 log**: `/tmp/wave271/agent-browser-1.log`
**关键证据**:
- 侧边栏链接 404 截图: `web-06-project-detail.png` (项目点详情 404), `web-11-agents.png` (智能体 404)
- 手动加前缀 OK 截图: `web-07-projects-xroa.png` (加 /XROA/ 才正常), `web-11-agents.png` (重命名为 19 后是 agents list OK)
- P0-07 截图: `web-13-agent-skills.png` (11 自动) vs `web-14-hermes-skills.png` (13 自动)
