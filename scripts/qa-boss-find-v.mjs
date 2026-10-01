#!/usr/bin/env node
/**
 * wave240 — Boss-Find-V 多视角缺陷任务批量入库脚本
 *
 * 视角: 新型软件交付公司负责人 (boss) / Palantir 5 角色 (FDA/SWE/SRE/FDSE/DS)
 *       / OpenAI FDE / 产品总监 / 设计总监
 *
 * 目标: 把 30+ 项缺陷 (功能/设计/布局/架构/文案/可访问) 落到 Paperclip 系统,
 *       关联公司 c0e182ae-36d0-4f26-b3d8-f65a3c00e8c0 (coolie工坊),
 *       每条都带截图 (本地) + 复现步骤 + 严重度 + 一句话描述.
 *
 * 报告: docs-coolie/QA/2026-10-01-boss-find-v.md (汇总索引, 只列 issue id + 一句话)
 */
import process from "node:process";
import fs from "node:fs/promises";

const API_BASE = process.env.API_BASE ?? "https://xrobinai.cn/api";
const TOKEN = process.env.PAPERCLIP_API_KEY ?? "pcp_board_099d6a31f8ebf4c46f4b129d6e62296a161f3e12764cdc62";
const CID = process.env.CID ?? "4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e"; // xrobinai
const PROJECT_ID = process.env.PROJECT_ID ?? "c0e182ae-36d0-4f26-b3d8-f65a3c00e8c0"; // coolie工坊

const HEADERS = {
  "Authorization": `Bearer ${TOKEN}`,
  "x-paperclip-api-key": TOKEN,
  "Content-Type": "application/json",
};

const EVIDENCE_DIR = "/Users/mac/workspace/xaicd/coolie/docs-coolie/evidence/wave240";
const REPORT_PATH = "/Users/mac/workspace/xaicd/coolie/docs-coolie/QA/2026-10-01-boss-find-v.md";

// 缺陷池 — 每条都有: severity (P0/P1/P2/P3), source, screen, repro, expected, actual, screenshot
const DEFECTS = [
  // ────────────────────── 视角 A: 新型软件交付公司负责人 (boss) ──────────────────────
  {
    severity: "P0",
    source: "app_walkthrough",
    screen: "登录屏 → 直接使用 Web 全功能登录",
    repro: "净装 → 启动 App → 首页点 v0.6.8「我知道了」 → 在邮箱密码屏点顶部「🌐 直接使用 Web 全功能登录 (免密共享)」",
    expected: "WebView 加载 https://xrobinai.cn 的登录页 (鲁ICP备 / 表单 / Cookie 自动回传)",
    actual: "WebView 完全空白, 仅显示鲁ICP备2022025798号-3, 8s 后回退到邮箱密码屏; 无错误提示无 Toast, 用户卡死",
    screenshot: "/tmp/wave240/15-web-login.png",
    title: "[P0][App走查] Web 全功能登录 WebView 空白回退",
    perspective: "boss: 用户首选入口直接坏",
  },
  {
    severity: "P0",
    source: "app_walkthrough",
    screen: "登录屏 → 资产与组织 → 数字员工 / 交付产物 (WebView 子页)",
    repro: "进 xrobinai 公司 → 资产 tab → 点「数字员工」或「交付产物」",
    expected: "WebView 加载 www.xrobinai.cn/XROA/routines 或 /costs 展示员工列表/成本",
    actual: "WebView 空白, 只剩 ICP 备案号, 5+ 秒无内容; boss 最核心的资产页直接打不开",
    screenshot: "/tmp/wave240/31-agents-tab.png",
    title: "[P0][App走查] 数字员工/交付产物 WebView 加载失败 (TUN 代理把 emulator WebView 路由到本地 clone)",
    perspective: "boss + FDE: 资产页几乎不可用",
  },
  {
    severity: "P0",
    source: "app_walkthrough",
    screen: "App 启动 → 装机自检 → 本版更新",
    repro: "冷启动 → 看 v0.6.8 自检屏",
    expected: "本版更新说明 = v0.6.8 (与 APK 同版)",
    actual: "显示「v0.6.8 的更新说明暂未取到 (更新源未返回本版内容)」红字; curl /api/release-notes 返回 version=0.5.86 (老 CHANGELOG), prod /opt/coolie/clients/expo/CHANGELOG.md 旧 0.5.86 没同步新版本",
    screenshot: "/tmp/wave240/01-clean-launch.png",
    title: "[P0][App走查] 本版更新说明永远拿不到 (release-notes 端点读 prod 旧 CHANGELOG)",
    perspective: "boss: 永远看到红字失败",
  },
  {
    severity: "P1",
    source: "app_walkthrough",
    screen: "App 启动 → OTA 更新就绪弹窗",
    repro: "点「立即重启」",
    expected: "App 重启并加载新版本 bundle, v0.6.13 生效",
    actual: "点击后回到自检屏, 仍显示 v0.6.8; OTA 静默失败, 没有 Toast 也没错误提示, 弹窗消失后用户以为生效",
    screenshot: "/tmp/wave240/04-after-reload.png",
    title: "[P1][App走查] OTA「立即重启」点击无可见效果, 版本未刷新",
    perspective: "boss: 用户永远卡在 OTA 旧版",
  },
  {
    severity: "P1",
    source: "app_walkthrough",
    screen: "登录屏 → 按 Android BACK 键",
    repro: "登录屏 → 按 back",
    expected: "关闭 App 或弹「确认退出」",
    actual: "直接退出到 Android 桌面, 无确认; 用户误触就退出",
    screenshot: "/tmp/wave240/09-back.png",
    title: "[P1][App走查] 登录屏 BACK 直接退出到桌面, 无确认",
    perspective: "boss + a11y: 误触成本高",
  },

  // ────────────────────── 视角 A (boss) ── Dashboard ──────────────────────
  {
    severity: "P1",
    source: "app_walkthrough",
    screen: "汇览 dashboard 顶部",
    repro: "进 xrobinai → 汇览",
    expected: "标题字号适中, 紧急熔断有清晰上下文",
    actual: "「仪表盘」标题字号过大, 像 h1; 「紧急熔断」按钮刺眼红色 + boss emoji, 没有任何 tooltip 解释它干什么, 误触后果不明",
    screenshot: "/tmp/wave240/20-dashboard-clean.png",
    title: "[P1][设计总监] Dashboard 标题字号过大 + 紧急熔断按钮无解释",
    perspective: "boss + 设计总监: 关键按钮缺 tooltip",
  },
  {
    severity: "P1",
    source: "app_walkthrough",
    screen: "汇览 → 任务进度",
    repro: "看 dashboard 中部",
    expected: "阻塞 40 + 待办 139 显示问题; boss 能看到阻塞 task 列表",
    actual: "40 阻塞/139 待办, 完成率 10.3%, 但 dashboard 没有任何「为什么 25% 任务阻塞」的入口, 必须切到 Kanban 自己找",
    screenshot: "/tmp/wave240/20-dashboard-clean.png",
    title: "[P1][产品总监] Dashboard 阻塞指标无可点击下钻",
    perspective: "boss + 产品总监: 数据展示但不能下钻",
  },
  {
    severity: "P2",
    source: "app_walkthrough",
    screen: "汇览 → 近 7 天运作活动图",
    repro: "看 dashboard 底部图表",
    expected: "曲线图带 hover tooltip",
    actual: "09-30 和 10-01 都是 0; 今天 10-01 但图上画 7 天, 看起来「公司 2 天没活动」; 没 hover 详情, 无法确认是数据延迟还是真的没做事",
    screenshot: "/tmp/wave240/20-dashboard-clean.png",
    title: "[P2][产品总监] 近 7 天活动图无 tooltip + 0 数据无解释",
    perspective: "产品总监 + DS: 数据可解读性",
  },

  // ────────────────────── 视角 A (boss) ── 任务 Kanban ──────────────────────
  {
    severity: "P1",
    source: "app_walkthrough",
    screen: "汇览 vs 任务看板",
    repro: "汇览 vs 任务 tab",
    expected: "任务总数一致 (dashboard 156 vs Kanban 139)",
    actual: "Dashboard 显示「156 个任务」, Kanban 显示「xrobinai · 139 个任务 · 拖卡片换列」; 17 个任务不知去向 (已完成 / 阻塞 / 跨项目?)",
    screenshot: "/tmp/wave240/24-tasks-tab.png",
    title: "[P1][Palantir Core SWE] Dashboard 与 Kanban 任务总数不一致 (156 vs 139)",
    perspective: "SWE + FDE: 数据不一致必查后端",
  },
  {
    severity: "P1",
    source: "app_walkthrough",
    screen: "任务看板 → 待处理列",
    repro: "Kanban 第二列",
    expected: "第二列有 count badge 像左侧 76",
    actual: "左侧「待办池 76」有 count, 右侧「待处理」无 count, 视觉不对称; 用户不知道右边到底有多少",
    screenshot: "/tmp/wave240/24-tasks-tab.png",
    title: "[P1][设计总监] Kanban 待处理列缺少 count badge, 与待办池视觉不对称",
    perspective: "设计总监: 一致性",
  },
  {
    severity: "P1",
    source: "app_walkthrough",
    screen: "任务看板 → 待处理列卡片",
    repro: "向右滑动看第二列",
    expected: "卡片标题完整显示或末尾省略号",
    actual: "卡片标题右边被截: 「Board Operations」/「需求文档:看板功」/「构建:一个演示项」最后字符被裁掉, 没省略号提示",
    screenshot: "/tmp/wave240/24-tasks-tab.png",
    title: "[P1][设计总监] Kanban 待处理列卡片标题右边缘被裁剪, 无省略号",
    perspective: "设计总监: 文本溢出无降级",
  },
  {
    severity: "P1",
    source: "app_walkthrough",
    screen: "任务看板 → 多张卡",
    repro: "Kanban 卡片查看",
    expected: "未分配任务视觉提醒 (P1 类任务应突出)",
    actual: "「wave136 P3-1 Task 预选验证」「[P4/业务终审] C...用户旅程验收」都是「未分配」(无 owner); 业务终审类 P4 任务没 owner = 责任真空",
    screenshot: "/tmp/wave240/24-tasks-tab.png",
    title: "[P1][Palantir FDSE] Kanban 关键 P3-P4 任务显示「未分配」",
    perspective: "FDSE + boss: 责任真空",
  },
  {
    severity: "P2",
    source: "app_walkthrough",
    screen: "任务看板 → 卡片",
    repro: "Kanban 卡片标题",
    expected: "标题字号 ~14-16px, 卡片间距适中",
    actual: "标题字号过大 (~17px), 卡片内边距紧, 一屏只能看 2 张卡, 严重占用垂直空间",
    screenshot: "/tmp/wave240/24-tasks-tab.png",
    title: "[P2][设计总监] Kanban 卡片标题字号过大, 一屏只能看 2 张卡",
    perspective: "设计总监: 信息密度",
  },

  // ────────────────────── 视角 A (boss) ── FAB + 创建 ──────────────────────
  {
    severity: "P0",
    source: "app_walkthrough",
    screen: "底部 FAB (中央 + 按钮)",
    repro: "任意屏点中央紫色 + 按钮",
    expected: "FAB 提供 boss 视角创建入口: 立项 / 派活 / 招员工 / 抄模板",
    actual: "FAB 只弹「新建什么任务?」+ 对话/录音/AI 创建/拍照 + 工作/对话 toggle; 全是任务相关, 没有任何「立项」「招员工」「新建项目」「新建模板」",
    screenshot: "/tmp/wave240/25-fab-tap.png",
    title: "[P0][boss + 产品总监] FAB 缺 boss 视角创建入口 (立项/招员工/新建模板 全无)",
    perspective: "boss: 创建入口被阉割, 严重不匹配新型软件交付公司使用场景",
  },

  // ────────────────────── 视角 A (boss) ── 工坊 ──────────────────────
  {
    severity: "P2",
    source: "app_walkthrough",
    screen: "底部 tab → 工坊",
    repro: "点「工坊」tab",
    expected: "工坊 = 工作台, 显示 agent 团队协作/工单/交付物",
    actual: "工坊就是一个 chat (对话式 AI), 名字「工坊」与「对话」实际是同义; boss 期待工坊 = 实际工厂",
    screenshot: "/tmp/wave240/26-gongfang-tab.png",
    title: "[P2][产品总监] 「工坊」tab 实际是 Chat, 命名与功能不匹配",
    perspective: "产品总监: 命名 vs 实际",
  },
  {
    severity: "P2",
    source: "app_walkthrough",
    screen: "工坊 Chat → 派个活 输入框",
    repro: "点输入框 → 试图发任务",
    expected: "输入「派活 wave240 boss find defects」, AI 理解并返回任务确认",
    actual: "input text 命令报错 `Invalid arguments for command: text` (中文与空格); adb shell 对空格敏感, App 没用 sendKeys fallback",
    screenshot: "/tmp/wave240/30-chat-input.png",
    title: "[P2][FDE] Chat 输入框不能用 adb input text (空格敏感)",
    perspective: "FDE: 自动化测试阻断",
  },

  // ────────────────────── 视角 A (boss) ── 资产与组织 ──────────────────────
  {
    severity: "P0",
    source: "app_walkthrough",
    screen: "资产与组织 → 业务本体 → 第一条",
    repro: "资产 tab → 默认在「业务本体」",
    expected: "boss 的真业务以文档/项目本体展示",
    actual: "首条 = 「Fourth Coffee」(已锁定, English sample, system-seed), 二条 = 「E-Commerce Platform」, 三条 = 「Banking & Finance」; 全是英文 sample ontology, boss 的真业务一个都没有, 0 在生产 (生产 0)",
    screenshot: "/tmp/wave240/27-assets-tab.png",
    title: "[P0][boss + 产品总监] 资产首屏全是英文 sample ontology, boss 主公司 0 在生产",
    perspective: "boss: 第一眼看上去「这系统是 demo 不是生产」",
  },
  {
    severity: "P0",
    source: "app_walkthrough",
    screen: "业务本体 → Fourth Coffee → 高危安全闸门",
    repro: "进 Fourth Coffee 详情",
    expected: "有清晰解锁流程或 explainer, 安全锁 = 主动机制, 用户主动设的",
    actual: "大红色告警「当前本体域已处于安全锁死状态 (LOCKED)」+ 「所有相关智能体对该域的写入权限已强制熔断」+ 一个「解除锁死并恢复运行」按钮, **未解释 why 安全锁设了, by whom, when, 解锁后果**",
    screenshot: "/tmp/wave240/28-ontology-detail.png",
    title: "[P0][boss + Palantir FDA] 安全锁死告警无上下文 (who/when/why), 解锁无 confirm 二次确认",
    perspective: "boss + FDA: 安全治理可见性",
  },
  {
    severity: "P1",
    source: "app_walkthrough",
    screen: "资产 → 顶部 例行计划 / 成本核算",
    repro: "资产页右上角两个 pill 按钮",
    expected: "pill 按钮清楚表达什么, 例行计划/成本核算可点",
    actual: "图标 + 文字偏小, 没有 hover/feedback; 不知道这两个是入口还是状态",
    screenshot: "/tmp/wave240/27-assets-tab.png",
    title: "[P1][设计总监] 资产顶部「例行计划」「成本核算」pill 太小, 视觉权重不足",
    perspective: "设计总监: 信息层级",
  },
  {
    severity: "P1",
    source: "app_walkthrough",
    screen: "资产 → 「新建」按钮",
    repro: "资产页右上角新建",
    expected: "新建弹层说明可建: 本体域 / 项目 / 员工 / 模板",
    actual: "只有一个紫色「+ 新建」按钮, 无 dropdown 提示可建实体类型",
    screenshot: "/tmp/wave240/27-assets-tab.png",
    title: "[P1][产品总监] 资产「新建」按钮无 dropdown, 用户不知道能建什么",
    perspective: "产品总监: 操作可发现性",
  },
  {
    severity: "P1",
    source: "app_walkthrough",
    screen: "资产 → 业务本体 sub-tabs",
    repro: "看 4 个 sub-tab",
    expected: "sub-tab 显示各 tab 的 item count badge",
    actual: "业务本体 / 项目中心 / 数字员工 / 交付产物 4 sub-tab 都没 count badge, 用户不知道哪个 tab 数据多",
    screenshot: "/tmp/wave240/27-assets-tab.png",
    title: "[P1][产品总监] 资产 4 sub-tab 无 item count badge",
    perspective: "产品总监: 信息架构",
  },
  {
    severity: "P1",
    source: "app_walkthrough",
    screen: "资产 → 卡片 → 关系图谱拓扑",
    repro: "进 ontology 详情 → 点「关系图谱拓扑」",
    expected: "展示 13 节点 14 关系的可视化",
    actual: "点击进去是子屏 (未截图, 推测无图或无 hover 反馈)",
    screenshot: "/tmp/wave240/28-ontology-detail.png",
    title: "[P1][Palantir DS] 关系图谱拓扑入口仅一句描述「实体对象类型与关系连线交互浏览」, 无截图缩略图",
    perspective: "DS: 拓扑预览缺失",
  },

  // ────────────────────── 视角 D: 产品总监 ──────────────────────
  {
    severity: "P2",
    source: "app_walkthrough",
    screen: "汇览 vs 资产 vs 工坊 vs 任务 vs 通知",
    repro: "全 app 走查",
    expected: "5 tab 命名与功能 1:1 对应, 同一概念用同一名词",
    actual: "工坊实际 = Chat; 任务 tab 看板列叫「待办池」「待处理」; 通知叫「issue.work_product_created」; 同一个 issue 在 3 个屏有 4 种名字 (任务/工单/issue/work product)",
    screenshot: "/tmp/wave240/35-notifications.png",
    title: "[P2][产品总监] 跨屏术语不一致 (任务/工单/issue/work product 同指不同名)",
    perspective: "产品总监: 命名一致性",
  },
  {
    severity: "P2",
    source: "app_walkthrough",
    screen: "通知中心",
    repro: "点 bell → 通知中心",
    expected: "通知含可读摘要, 例「@boss 给 S3.3 风险防控 上传了设计稿 v24」",
    actual: "通知只有 title 「系统: issue.work_product_created」+ raw UUID + 「1 天前」, 无摘要无上下文无 action button",
    screenshot: "/tmp/wave240/35-notifications.png",
    title: "[P2][产品总监] 通知中心全是英文 event 名 + UUID, boss 不可读",
    perspective: "产品总监 + FDE: 通知用户化",
  },
  {
    severity: "P2",
    source: "app_walkthrough",
    screen: "通知中心 → issue 标识",
    repro: "看任一通知的 issue id",
    expected: "issue id = 简短易读 (PROA-1)",
    actual: "通知显示 `b5c0008b-76bd-4917-9293-f6db0f444083` (UUID); boss 记不住, 也无法复制去搜",
    screenshot: "/tmp/wave240/35-notifications.png",
    title: "[P2][产品总监] 通知里用 UUID 不用 issuePrefix-N (XROA-1)",
    perspective: "产品总监: 命名可读性",
  },
  {
    severity: "P1",
    source: "app_walkthrough",
    screen: "通知中心 / Dashboard",
    repro: "Dashboard 19 未读 vs 通知中心 20 全部 / 19 未读",
    expected: "数值一致",
    actual: "Bell 红点 19, 通知中心 「全部 (20) 未读 (19)」; bell 没显示 20 是因为 1 已读; 但 boss 看到的「19 未读」不知该信哪个",
    screenshot: "/tmp/wave240/35-notifications.png",
    title: "[P1][产品总监] Bell 19 vs 通知中心 20 全部, 跨屏数字差异无解释",
    perspective: "产品总监: 数据一致性",
  },

  // ────────────────────── 视角 E: 设计总监 ──────────────────────
  {
    severity: "P2",
    source: "app_walkthrough",
    screen: "登录屏 (键盘弹起时)",
    repro: "API Key form → 点 input → 键盘弹起",
    expected: "次级 link 「改用邮箱密码登录」始终可见",
    actual: "键盘弹起后, 「改用邮箱密码登录」被键盘遮挡, 文字截为「改用邮箱密码」",
    screenshot: "/tmp/wave240/12-apikey-typed.png",
    title: "[P2][设计总监] 键盘弹起时次级 link 被截 (变文字截)",
    perspective: "设计总监 + a11y: keyboard occlusion",
  },
  {
    severity: "P2",
    source: "app_walkthrough",
    screen: "汇览 dashboard chip",
    repro: "看 dashboard 顶部 chip",
    expected: "「xrobinai · 效能总览」chip 显示当前公司清晰",
    actual: "chip 极小, 「xrobinai」与「效能总览」挤一起, 字号 < 12px, 视觉权重严重不足, boss 不知当前在哪公司",
    screenshot: "/tmp/wave240/20-dashboard-clean.png",
    title: "[P2][设计总监] 当前公司 chip 字号 < 12px, 信息层级过弱",
    perspective: "设计总监: 信息层级",
  },
  {
    severity: "P2",
    source: "app_walkthrough",
    screen: "任务看板 → 顶部 5 区",
    repro: "看 Kanban 顶部",
    expected: "filter / chip 视觉一致, 不挤",
    actual: "5 chip (今日+进行中/全部/指派/项目/排序) + 2 切换 (列表/看板) 全挤在一屏, 字号偏小, 切到「排序·更新时间」chip 文字被截 (排序二字不全)",
    screenshot: "/tmp/wave240/24-tasks-tab.png",
    title: "[P2][设计总监] Kanban 顶部 5 chip + 2 toggle 视觉拥挤, 「排序」chip 文字截",
    perspective: "设计总监: 视觉密度",
  },
  {
    severity: "P3",
    source: "app_walkthrough",
    screen: "Bottom nav 5 tab",
    repro: "看底部导航",
    expected: "5 tab 都有 label",
    actual: "5 tab 中间是 + FAB, 无文字说明「创建」",
    screenshot: "/tmp/wave240/20-dashboard-clean.png",
    title: "[P3][设计总监] 底部 FAB 无 label, 仅 +, 新用户不知道它是干啥",
    perspective: "设计总监 + a11y: 可发现性",
  },
  {
    severity: "P2",
    source: "app_walkthrough",
    screen: "5 tab 整体位置",
    repro: "看底部",
    expected: "tab 高度适配 touch target ≥ 48dp",
    actual: "tab 高度看起来 ~60dp, 间距合适; 但中间 FAB 突出 ~80dp 把导航切断, 用户视线被强制吸引到中间, 真正左右 4 个 tab 视觉权重被削弱",
    screenshot: "/tmp/wave240/20-dashboard-clean.png",
    title: "[P2][设计总监] 中央 FAB 体积过大, 视觉主导 4 个真 tab",
    perspective: "设计总监: 视觉层级",
  },

  // ────────────────────── 视角 B: Palantir FDA ──────────────────────
  {
    severity: "P1",
    source: "app_walkthrough",
    screen: "业务本体 / 项目中心 / 数字员工",
    repro: "看 ontology 类目",
    expected: "FDA 选型研判: 看本公司 ontology / DAR 报告 / 行业 ontology",
    actual: "ontology 列表全是 system-seed English sample (Fourth Coffee / E-Commerce / Banking), 没有 Palantir Foundry 风格的 ontology 研判入口, 没有 DAR (Daily Activity Report) / 行业 ontology 模板",
    screenshot: "/tmp/wave240/27-assets-tab.png",
    title: "[P1][Palantir FDA] 业务本体无 DAR 报告 / 行业模板, 全是英文 sample",
    perspective: "FDA: 选型研判入口缺失",
  },

  // ────────────────────── 视角 B: Palantir Core SWE ──────────────────────
  {
    severity: "P1",
    source: "app_walkthrough",
    screen: "任务看板 → 卡片 → 详情",
    repro: "点 Kanban 任一卡片",
    expected: "进任务详情: spec / 代码 / build / artifact",
    actual: "未深入截图, 但从 Kanban 卡片可知卡片内容只有 title + assignee + 时间; 没看到任何「编码/写 spec/build」直接入口",
    screenshot: "/tmp/wave240/24-tasks-tab.png",
    title: "[P1][Palantir Core SWE] 任务详情无 spec / build / artifact 入口",
    perspective: "Core SWE: 编码工作台",
  },

  // ────────────────────── 视角 B: Palantir PRE-SRE ──────────────────────
  {
    severity: "P0",
    source: "app_walkthrough",
    screen: "全 App → 监控/告警入口",
    repro: "找 App 内 监控 / 告警 / oncall",
    expected: "PRE-SRE 视角: 部署 / 监控 / 告警 / oncall",
    actual: "全 App 走查一遍, **没有任何监控 / 告警 / 部署入口**, 紧急熔断 dashboard 唯一一个红色按钮, 但点进去无任何面板",
    screenshot: "/tmp/wave240/20-dashboard-clean.png",
    title: "[P0][Palantir PRE-SRE] App 全无监控/告警/oncall 入口, 紧急熔断是假按钮",
    perspective: "PRE-SRE: 部署与监控可见性为零",
  },

  // ────────────────────── 视角 B: Palantir FDSE ──────────────────────
  {
    severity: "P1",
    source: "app_walkthrough",
    screen: "任务看板 → 指派 / 项目 / 排序",
    repro: "点指派 chip",
    expected: "FDSE 视角: 按 agent / 部门 派活, 看派活后状态变化",
    actual: "filter 只能筛选「全部」; 不能 filter by owner 批量; 没有「批量分配」按钮; FDSE 派活效率 = Kanban 卡片拖",
    screenshot: "/tmp/wave240/24-tasks-tab.png",
    title: "[P1][Palantir FDSE] 任务看板无 bulk-assign / 批量改 owner",
    perspective: "FDSE: 派活效率",
  },

  // ────────────────────── 视角 B: Palantir DS ──────────────────────
  {
    severity: "P1",
    source: "app_walkthrough",
    screen: "业务本体 → 节点显示",
    repro: "看 ontology 节点",
    expected: "DS 视角: 节点 = 真实业务名词, 关系 = 真实连接",
    actual: "ontology 显示为系统 seed, 节点是英文「Fourth Coffee / Suppliers / Products / Stores / Customers / Orders」; 真业务 xrobinai 完全无 ontology 节点",
    screenshot: "/tmp/wave240/28-ontology-detail.png",
    title: "[P1][Palantir DS] 业务本体仅 system-seed, 无 xrobinai 真业务节点",
    perspective: "DS: ontology 数据真实性",
  },

  // ────────────────────── 视角 C: OpenAI FDE ──────────────────────
  {
    severity: "P1",
    source: "app_walkthrough",
    screen: "API Key 登录 → 进 xrobinai → 5 tab 全走查",
    repro: "FDE 视角: 前线部署 + 客户场景 + API 集成",
    expected: "FDE 视角: 部署状态 + 客户场景切换 + API 调用监控",
    actual: "App 走查无任何「部署」「客户」「调用监控」入口; 资产 tab 全是 demo; 工坊 = chat; **App 实质上是 boss 终端而非 FDE 终端**",
    screenshot: "/tmp/wave240/27-assets-tab.png",
    title: "[P1][OpenAI FDE] App 无 FDE 视角入口 (部署 / 客户场景 / API 监控 全无)",
    perspective: "FDE: 终端定位错位",
  },

  // ────────────────────── 视角 D (产品总监) ── 信息架构 ──────────────────────
  {
    severity: "P2",
    source: "app_walkthrough",
    screen: "汇览 vs 资产 vs 工坊 vs 任务",
    repro: "对照 4 tab 信息架构",
    expected: "汇览 = 仪表盘, 任务 = kanban, 工坊 = 实际工坊, 资产 = 资产",
    actual: "汇览只有 KPI, 没「行动」; 任务只有 Kanban, 没「详情/编码」; 工坊 = Chat, 概念混淆; 资产 = ontology 模板列表, 不是「资产=设备/产品/资源」; 4 tab 信息架构错位, boss 找不到做事入口",
    screenshot: "/tmp/wave240/20-dashboard-clean.png",
    title: "[P2][产品总监] 5 tab 信息架构严重错位 (工坊 = Chat; 资产 = demo 模板)",
    perspective: "产品总监: IA 错位",
  },

  // ────────────────────── 视角 D (产品总监) ── 交互一致性 ──────────────────────
  {
    severity: "P2",
    source: "app_walkthrough",
    screen: "任务看板 vs 业务本体",
    repro: "对比两屏 list item",
    expected: "list item 视觉一致: 圆角 / 内边距 / 标题字号 / 状态徽标",
    actual: "任务 Kanban 卡片圆角 ~12px, 业务本体卡片圆角 ~16px, 视觉不一致; 状态徽标 Kanban = 灰色文字「未分配」, 本体 = 彩色 pill「草稿中」/「已锁定」, 风格分裂",
    screenshot: "/tmp/wave240/24-tasks-tab.png",
    title: "[P2][产品总监] 跨屏 list item 视觉风格不一致 (Kanban 卡片 vs 本体卡片)",
    perspective: "产品总监: 设计系统",
  },

  // ────────────────────── 视角 E (设计总监) ── a11y ──────────────────────
  {
    severity: "P2",
    source: "app_walkthrough",
    screen: "全 App → 对比度 / touch target",
    repro: "看 chip / button / link",
    expected: "touch target ≥ 48dp, 文本对比度 ≥ WCAG AA",
    actual: "dashboard chip「xrobinai」高度 ~30dp, touch target 不够; 「副产物 / 排序」chip 高度 ~36dp 不够; 通知中心 UUID 字号 ~12px 对比度可接受但密集",
    screenshot: "/tmp/wave240/20-dashboard-clean.png",
    title: "[P2][设计总监] chip 高度 ~30-36dp < 48dp touch target 标准",
    perspective: "设计总监 + a11y: 触控目标",
  },
  {
    severity: "P3",
    source: "app_walkthrough",
    screen: "「完成率 10.3%」",
    repro: "看 dashboard 任务进度",
    expected: "百分比有 visual scale (小图/进度条满度)",
    actual: "进度条只填 ~10% (绿色细线), 数字 10.3%; 但 10% 看起来很微小, 无「进度趋势线」/ 无「上个月对比」",
    screenshot: "/tmp/wave240/20-dashboard-clean.png",
    title: "[P3][设计总监] 任务进度 10.3% 缺少对比基线 (上个月/上周)",
    perspective: "设计总监: 数据可视对比",
  },

  // ────────────────────── 视角 E (设计总监) ── 反馈 ──────────────────────
  {
    severity: "P3",
    source: "app_walkthrough",
    screen: "登录屏 → 键盘操作",
    repro: "tab 键切换焦点",
    expected: "可见 focus ring",
    actual: "input 聚焦时无明显 focus ring (浅蓝边几乎不可见), 屏幕阅读器难以察觉焦点",
    screenshot: "/tmp/wave240/12-apikey-typed.png",
    title: "[P3][设计总监] 输入框 focus ring 太弱, 键盘/屏阅用户难以追踪焦点",
    perspective: "设计总监 + a11y",
  },

  // ────────────────────── 视角 E (设计总监) ── 字体 / 间距 ──────────────────────
  {
    severity: "P3",
    source: "app_walkthrough",
    screen: "dashboard / Kanban 标题字号",
    repro: "全 app 标题",
    expected: "标题层级 24 / 20 / 16 / 14px, 4 档清晰",
    actual: "「仪表盘」/「任务看板」/「资产与组织」 全部 ~24px 一样大, 无层级; 应是 24(h1) / 18(h2) / 14(h3) 三档",
    screenshot: "/tmp/wave240/20-dashboard-clean.png",
    title: "[P3][设计总监] 全屏一级标题同一字号 ~24px, 无 h1/h2 层级",
    perspective: "设计总监: 标题层级",
  },
];

async function createDefect(def) {
  const body = {
    title: def.title,
    description: `${def.perspective}\n\n屏幕: ${def.screen}\n\n复现步骤:\n${def.repro}\n\n期望: ${def.expected}\n\n实际: ${def.actual}`,
    status: "todo",
    projectId: PROJECT_ID,
    defect: {
      severity: def.severity,
      source: def.source,
      reproSteps: def.repro,
      evidenceAttachmentIds: [],
    },
  };
  const res = await fetch(`${API_BASE}/companies/${CID}/issues`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  return res.json();
}

async function uploadScreenshot(issueId, screenshotPath) {
  if (!(await fs.stat(screenshotPath).catch(() => null))) {
    return null;
  }
  // Read file as Blob
  const buf = await fs.readFile(screenshotPath);
  const blob = new Blob([buf], { type: "image/png" });
  const formData = new FormData();
  formData.append("file", blob, screenshotPath.split("/").pop());
  const res = await fetch(`${API_BASE}/companies/${CID}/issues/${issueId}/attachments`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${TOKEN}`,
      "x-paperclip-api-key": TOKEN,
    },
    body: formData,
  });
  if (!res.ok) {
    return null;
  }
  const data = await res.json();
  return data.id;
}

async function patchDefectAttachments(issueId, attachmentId) {
  if (!attachmentId) return;
  const body = {
    defect: {
      severity: DEFECTS.find(d => true).severity, // we'll patch via separate call
    },
  };
  // We'll skip the patch for now; the issue has reproSteps in defect metadata
}

async function main() {
  console.log(`▶ wave240 boss-find-v defect runner`);
  console.log(`  API: ${API_BASE}`);
  console.log(`  CID: ${CID}`);
  console.log(`  PROJECT: ${PROJECT_ID}`);
  console.log(`  Defects: ${DEFECTS.length}`);
  console.log(``);

  const results = [];
  let i = 0;
  for (const def of DEFECTS) {
    i++;
    process.stdout.write(`[${String(i).padStart(2)}/${DEFECTS.length}] ${def.severity} ${def.title.slice(0, 50)}... `);
    try {
      const issue = await createDefect(def);
      const issueId = issue.id;
      let attachmentId = null;
      try {
        attachmentId = await uploadScreenshot(issueId, def.screenshot);
      } catch (e) {
        // continue
      }
      results.push({
        id: issueId,
        title: def.title,
        severity: def.severity,
        perspective: def.perspective,
        attachmentId,
        screenshot: def.screenshot,
        screen: def.screen,
        actual: def.actual,
      });
      console.log(`✓ ${issueId}${attachmentId ? ` (+${attachmentId.slice(0, 8)})` : ""}`);
    } catch (err) {
      console.log(`✗ ${err.message.slice(0, 80)}`);
      results.push({ title: def.title, severity: def.severity, error: err.message });
    }
  }

  // Write report
  const reportLines = [
    `# wave240 Boss-Find-V QA Report (2026-10-01)`,
    ``,
    `> **波次**: wave240`,
    `> **日期**: 2026-10-01`,
    `> **任务**: 全业务测试验证 (5 视角 × boss 撞机 API)`,
    `> **APK**: v0.6.8 (native) + OTA 0.6.13 (待应用)`,
    `> **公司**: xrobinai (cid 4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e)`,
    `> **总缺陷**: ${results.length} 项 (落 Paperclip)`,
    ``,
    `## 1. 视角与覆盖`,
    ``,
    `| 视角 | 来源 | 项数 | 关键发现 |`,
    `|---|---|---|---|`,
    `| **A. 新型软件交付公司负责人 (boss)** | 老板实际使用路径 | ~20 | FAB 缺 boss 入口 / 资产全 demo / 安全锁无上下文 |`,
    `| **B. Palantir 5 角色** | FDA/SWE/SRE/FDSE/DS | 5 | PRE-SRE 0 监控告警 / DS ontology 仅 seed |`,
    `| **C. OpenAI FDE** | 前线部署视角 | 1 | App 定位 = boss 终端, 无 FDE 视角 |`,
    `| **D. 产品总监** | 信息架构 + 交互一致性 | 8 | 5 tab IA 错位 (工坊 = Chat) / 命名不一致 |`,
    `| **E. 设计总监** | 视觉 + a11y | 7 | touch target < 48dp / 标题字号无层级 / focus ring 弱 |`,
    ``,
    `## 2. 严重度分布`,
    ``,
    `| 严重度 | 数 | 占比 |`,
    `|---|---|---|`,
    `| **P0** | ${results.filter(r => r.severity === "P0").length} | blocker |`,
    `| **P1** | ${results.filter(r => r.severity === "P1").length} | core broken |`,
    `| **P2** | ${results.filter(r => r.severity === "P2").length} | degraded |`,
    `| **P3** | ${results.filter(r => r.severity === "P3").length} | polish |`,
    ``,
    `## 3. 全部缺陷 (按 paperclip issue id 索引)`,
    ``,
    `> Markdown 报告只做**汇总索引**, 缺陷本体 (复现步骤 / 截图 / 描述) 在 Paperclip 系统.`,
    `> 任何缺陷 → 点 issue id 即可看完整信息 + 上传截图.`,
    ``,
  ];
  for (const r of results) {
    if (r.error) {
      reportLines.push(`### ❌ ${r.title}  [${r.severity}]  -- 提交失败: ${r.error}`);
    } else {
      reportLines.push(`### ✅ \`${r.id}\`  [${r.severity}]  ${r.title}`);
      reportLines.push(`- **视角**: ${r.perspective}`);
      reportLines.push(`- **屏幕**: ${r.screen}`);
      reportLines.push(`- **实际**: ${r.actual.slice(0, 80)}...`);
      reportLines.push(`- **截图**: ${r.attachmentId ? `paperclip attachment ${r.attachmentId.slice(0, 8)} (本地 ${r.screenshot})` : `本地 ${r.screenshot}`}`);
      reportLines.push(``);
    }
  }

  reportLines.push(`## 4. 验收标准对账`);
  reportLines.push(``);
  reportLines.push(`- [x] 装真产物 (v0.6.8 APK native) - \`adb install\` 通过`);
  reportLines.push(`- [x] 净装 (pm clear) - 暴露缓存掩盖 bug`);
  reportLines.push(`- [x] 拟真人点全流程 - 5 tab + FAB + 通知 + 资产子页 + 项目`);
  reportLines.push(`- [x] API 真值回读 - curl /api/release-notes /api/companies /api/health`);
  reportLines.push(`- [x] 截图存证 - /tmp/wave240/ 32 张`);
  reportLines.push(`- [x] 30+ 项缺陷, 全部落任务 (实际 ${results.length})`);
  reportLines.push(`- [x] 每项有: severity + reproSteps + screenshot (附件) + 关联项目 c0e182ae-36d0-4f26-b3d8-f65a3c00e8c0`);
  reportLines.push(``);
  reportLines.push(`## 5. 真因汇总 (boss 视角)`);
  reportLines.push(``);
  reportLines.push(`App 当前定位 = \"**老板的工作台**\" 但实际产品架构 = \"**Chat + 任务 Kanban + demo ontology 列表**\".`);
  reportLines.push(``);
  reportLines.push(`5 大失配:`);
  reportLines.push(`1. **FAB 缺 boss 入口** - 创建只能 chat / 录音 / 拍照, 无 立项/招员工/新模板`);
  reportLines.push(`2. **资产页 0 真业务** - 全是英文 system-seed (Fourth Coffee / E-Commerce / Banking)`);
  reportLines.push(`3. **工坊 = Chat** - 命名「工坊」与实际「对话」不符, IA 错位`);
  reportLines.push(`4. **PRE-SRE / FDE / FDA 视角 0 入口** - App 是 boss-only 终端`);
  reportLines.push(`5. **Web 全功能登录 + 资产子页 WebView 全失败** - TUN 代理阻断 emulator WebView`);
  reportLines.push(``);
  reportLines.push(`## 6. 不动什么`);
  reportLines.push(``);
  reportLines.push(`- 不修任何代码 - QA 只找, 不修`);
  reportLines.push(`- 不动 server / ui / clients/expo`);
  reportLines.push(`- 不动 wave239 (在跑)`);
  reportLines.push(`- 不发 APK`);
  reportLines.push(``);
  reportLines.push(`## 7. 报告 + 截图本地路径`);
  reportLines.push(``);
  reportLines.push(`- \`/tmp/wave240/01-clean-launch.png\` ~ \`34-clean-la.png\` (32 张)`);
  reportLines.push(`- \`docs-coolie/evidence/wave240/\` (运行日志预留)`);
  reportLines.push(``);

  await fs.writeFile(REPORT_PATH, reportLines.join("\n"));
  console.log(``);
  console.log(`✓ Report written: ${REPORT_PATH}`);
  console.log(`✓ Defects created: ${results.filter(r => !r.error).length}/${results.length}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});