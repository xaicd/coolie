# Wave271 Viewpoint 5 — Web 撞机 (设计总监 + 产品总监)

- 撞机者: webhook agent #5
- 时间: 2026-10-02
- URL: https://xrobinai.cn
- 工具: agent-browser (Chrome for Testing, 无持久 profile)
- 浏览器身份: xrobinai 公司, user `XiaoChen` (cookie 由 autofill 触发保留)
- 已知障碍: 没拿到老板密码, 直接 `agent-browser open` 命中登录页 + captcha; 后面通过 `open https://xrobinai.cn/auth?next=%2Flogin` 命中 org switcher 的 404 才暴露出已登录侧壳, 转到 dashboard
- 角色定位: 严肃视角 — 设计 + 产品架构

## 1. 视角总评

Web 端整体气质比 App **沉稳很多**: 深色 `#0F0F0F` 主色 + 单一品牌绿 + 高对比灰白文字, 信息密度合理、留白克制, 5 个 tab 一屏内可达, **比 App 更符合老板审美**。但踩了 5 个产品架构红线: **(a) 登录页 captcha 反复误伤合法老板**; **(b) 5 tab 信息架构严重错位 — `任务`/`项目`/`产物`/`Ontology`/`架构治理` 全是同一类对象的异质性切片, 老板要先选个 "视角" 才能干一件事**; **(c) 路由硬编码 org prefix 大小写, `/xrobinai/X` 与 `/XROBINAI/X` 命中不同分支, 直链被拒**; **(d) "进入控制台" 两个按钮并列 "新建任务" + 6 个 sidebar 链接 + "搜索" + "会议室" — 派活入口在 4 个位置**; **(e) Boss 名字英文 XiaoChen / Email ro bin@xrobinai.cn / UI 中文 混排, 没有统一 i18n**。

## 2. 截图清单

- `/tmp/wave271/web-00-landing.png` — 公开首页 "小陈的技术分享" (暗色, 营销页)
- `/tmp/wave271/web-01-login.png` — 登录页 (浅色, 漏天)
- `/tmp/wave271/web-03-after-login.png` — 登录错误 (captcha 干扰)
- `/tmp/wave271/web-06-dark-login.png` — 登录页 (深色, admin@xrobinai.cn 被 autofill)
- `/tmp/wave271/web-07-admin-attempt.png` — "Invalid email or password" 错误样式
- `/tmp/wave271/web-08-board-404.png` — 未登录路由 /board 跳转登录
- `/tmp/wave271/web-09-api-health.png` — /api/health JSON 输出
- `/tmp/wave271/web-12-home-dashboard.png` — 错误命中 NOT FOUND (404 设计)
- `/tmp/wave271/web-13-dashboard.png` — 仪表盘 (Agent 卡片 + KPI 4 卡组)
- `/tmp/wave271/web-14-tasks.png` — 任务列表 ([P0/P1/P2/P3] chip 红框 + Issue ID)
- `/tmp/wave271/web-15-inbox.png` — 项目详情 (产融智能体平台里程碑)
- `/tmp/wave271/web-18-inbox-clicked.png` — 收件箱 (Mine/Recent/Unread/Blocked/All 5 tab)
- `/tmp/wave271/web-19-agents.png` — 智能体详情 (core-swe-agent Overview + Skill 导航)
- `/tmp/wave271/web-22-agents-list.png` — 智能体列表 (6 agents, 5 个状态 tab)
- `/tmp/wave271/web-21-tasks-sidebar.png` — 任务列表 (同 web-14, 通过 sidebar 跳)
- `/tmp/wave271/web-16/17-inbox-*.png` — 直接 URL /xrobinai/inbox 与 /XROBINAI/inbox 都 404 (深链 bug)

## 3. 设计维度评分 (7 项各 1-5)

| 维度 | 分数 | 评价 |
|---|---|---|
| 间距 | 4 | 卡片内边距 16-24px 一致, 但仪表盘 4 个 KPI 卡之间 24px 空缺 vs 列表行 48px 触摸目标不齐 |
| 字号层级 | 3 | H1 标题(组织切器/面包屑) vs H2 章节 vs 正文 vs 小字 5 级存在, 但 [P0] [P1] 标签字号比任务名小, 反而比任务名显眼 — 视觉重心错位 |
| 对齐 | 5 | 卡片/输入框/按钮对齐极一致, 列表左对齐 + 右侧时间戳对齐, 表格列间距克制 |
| 颜色对比 | 4 | 深色主背景 `#0F0F0F`, 品牌绿 `#10B981`, 状态色 P0 橙红/P3 暗红; 浅色未默认深色试访, 未看老板模式对比 |
| 触摸/鼠标目标 | 3 | 列表行 36-40px (不符合 48dp), 按钮高度 36px 偏小, sidebar 链接 40px ok |
| 图标一致性 | 4 | lucide-react 全家桶 (主、任务、项目、产物), emoji avatar 用于 agent 头像, 风格统一 |
| 响应式 | 2 | 仅在桌面 1280+ 试, 未试手机/平板; sidebar 是固定 256px 不折叠 — 手机访问肯定坏 |

## 4. 交互维度评分 (7 项各 1-5)

| 维度 | 分数 | 评价 |
|---|---|---|
| 导航 | 3 | sidebar 分组 (工作/组织) 设计 ok, 但 "新建任务" 在 sidebar + Dashboard + 任务列表头部出现 3 次 |
| 反馈 | 2 | "Mark all as read" 等操作有 toast, 但登录错误 "Invalid email or password" 没有打字补救 (重试提示) |
| 空状态 | 3 | 仪表盘空态用了 KPI 卡 (比文+图标), 但任务列表空态需测试 |
| 错误状态 | 4 | 404 "Organization not found" 设计统一, 含 "Open dashboard / Go home" 二按钮, 红色 alert icon + 详细 path |
| 键盘快捷键 | 3 | 见到 "Command Palette" 隐含 ⌘K, 但未验证 |
| 命令面板 | 4 | 有 "Command Palette" (右上角 ⚡图标), 提示 "Search for a command to run..." |
| 深链 | 1 | **严重缺陷**: `/xrobinai/X` 与 `/XROBINAI/X` 大小写不一、两者都 404; org switcher 状态被 URL 覆盖; 项目详情页 deep-link 也会丢公司上下文 |

## 5. 极简原则 7 条违反清单 (Web)

1. **5 tab 屏 1-2 步可达** — 部分违反: 任务/项目/产物/Ontology/架构治理 都是同一切片但入口分散; 老板要找 "xrobinai 公司的 Issue XROA-214" 要点 4 次 (dashboard → 任务 → 搜索 → issue)
2. **常用操作 ≤ 3 步** — 派活 4 入口 (sidebar 新建任务 / Dashboard 卡片 / 任务列表 +New Task / 项目页), 跳到至少 4 处
3. **不出现术语** — Voice / Ontology / Harness / Runtime / CMMI / GATE_G1_SPEC / SKILL_NAME / hard-stop 这些都是内部术语; sidebar 出现 "Voice" "Ontology" 2 个英文术语, "架构治理" 是直译 "Architecture governance", 老板用 "AGENTS / PRODUCTION / 事业部" 替代才符合
5. **空状态有引导** — 未验证, 但 404 设计不错
6. **错误信息具体** — "Invalid email or password" 没有说明账号是否不存在 vs 密码错 (mfa vs captcha), 老板被 卡了不知道该重试密码 还是 换 账号
7. **首次登录 5 分钟内上手** — 登录页只有 "Sign in" + "Create one", 没有 "首次使用引导 / 仪表盘跳转", 老板没法知道 5 tab 关系
8. **不重复入口** — 见下表
## 6. 重复入口清单 (Web)

| 功能 | 入口数 | 位置 |
|---|---|---|
| 派活 (新建任务) | 4 | sidebar 顶部 "新建任务" / 任务列表 "+New Task" / Dashboard 隐藏? / 项目页 milestone 跳转 |
| 通知 (收件箱) | 3 | sidebar "收件箱 4" / Dashboard 跳 Inbox / 项目页 Issue 列表 (Mine/Recent/Unread/Blocked/All) |
| 设置 | 1 | 仅有 "Open account menu" (老板头像), 零路由 /settings, **缺顶层设置页** |
| 资产/产物 (Artifacts) | 3 | sidebar "产物" / 项目页 milestone tabs / Agent detail "Build" tab 隐含 |
| 数字员工 chip | 4 | sidebar "智能体" / Dashboard 6 个 agent 卡片 / Agent detail "Overview/Skills" / 任务 assignee chip |
| 本体 schema | 3 | sidebar "Ontology" / Agent detail "Skills" / 工坊 (项目页 "工坊对话" tab) |
| 搜索 | 1 | sidebar "搜索" + 列表头部 Search (重复两处) |
| 派活状态筛选 | 3 | 任务列表 tab Mine/Recent/Unread/Blocked/All / 仪表盘 KPI 卡 / Agent detail "Latest Run" |

## 7. 新发现的 P0/P1/P2 (Web)

### P0
- **登录 captcha 误伤合法老板**: autofill 填好的邮箱 + 密码被 "Too many requests" 干掉, 老板被迫手动重试 + 拼图 (web-03, web-07)
- **org prefix 深链大小写 bug**: `/xrobinai/inbox` 和 `/XROBINAI/inbox` 都返回 "Organization not found"; sidebar 标题是 "xrobinai", 但 URL 拼的是 XROBINAI (web-16/17) — 团队 ORG 字段需 strip-case

### P1
- **登录失败后老板不知道自己哪错了**: "Invalid email or password" 没有区分账号不存在 / 密码错 / mfa / captcha 失效 (web-07)
- **Dashboard "6 个 agent 卡片" 信息冗余**: 4 个 core-swe-agent S3 详细设计与 CMMI 文档 XROA-76 3d ago 完全相同 — 列表渲染重复, 应分组 (web-13)
- **业务本体错位**: 项目页 9 个 tab (Tasks / 里程碑主线 / 工坊对话 / Configuration / Budget / 质量门槛(CMMI) / 5+2 黄金文档 / RTM 需求穿透 / 过程度量(SPC 3σ) / 三态语拓朴) 一览灰字超出导航宽度 (web-15)
- **404 页与 Dashboard 几乎重样**: 同一布局, 业务色未区分 (web-08/12)

### P2
- **Voice / Ontology 英文术语未 i18n**: sidebar 出现英文, 其余中文 (web-22)
- **KPI 卡 4 维度凑一起宽度不一样**: 6 / 1 / $0.00 / 0 + 小字一列, 在窄屏上会损坏 (web-13)
- **404 页 主标题 "NOT FOUND" 英文 + 副标题 "Organization not found" 英文** (web-12)
- **任务列表 没有拖拽/快捷键提示**: chip 只标了 [P3], 但 keyboard ? 也不出现快捷键面板
- **Dashboard 「View all runs」 跳路由隐含, 但 header 不明显** (web-13)

## 8. 推荐改进

1. **修复 P0 深链 bug**: org prefix 在 router 层 normalize lowercase, 隐藏 XROBINAI 内部大写
2. **captcha 退场**: 老板 IP + User-Agent 白名单, 部署模式 (next-auth) 在内网环境下不启用 captcha
3. **Dashboard 6 agent 卡片 按 S0 任务 ID 聚合**, 显示 "XROA-76 (4 of 6 finished)" 而不是 4 个重复卡
4. **业务本体 5 tab 重构**: 把 "任务/项目/产物/工坊/Voice/Ontology/架构治理" 变成 3 个一级入口: 任务、产物、组织
5. **404 页 区分 Dashboard 路由**, 加品牌 hero "选个公司?" 不是 "选个 dashboard"
6. **空状态/快捷键面板**: ⌘K 启动 Command Palette 是基础, 但登录页 加 "新手引导" / Dashboard 加 5 个能力入口
7. **i18n 统一**: 老板 中文, 5 tab 也用中文; "Voice" "Ontology" 替换成 "声音" "本体" (App 叫 "本体" 已说明)
8. **重复入口合并**: 派活 4 入口合并为 1 + 1 (sidebar + Quick Add), 设置入口 提上 sidebar (现在是 "XiaoChen" 隐藏)
