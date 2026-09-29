# WAVE142 — 自动路由 WBS 任务 + 激活补产物（S3 沙箱示范）

- 日期: 2026-09-29
- 触发: boss 2026-09-28 实机反馈 ——「任务写已完成但沙箱没东西」「为啥还待规划」「激活一下」
- 公司: xrobinai `4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e`
- 项目: 某公司产融智能体应用系统集成服务项目 `939ff822-140e-480e-9081-b5df284b8272`（52 任务）
- 环境: 生产 `https://www.xrobinai.cn`（board key，临时、3h 过期、用完删）
- 方式: 全部经板级 API（`PATCH assigneeAgentId` / 附件上传 / 工作产品注册）；App 侧真机走查（Android
  `coolie-api28` / `emulator-5556`，装机包 v0.5.96，`adb` + `agent-device` + uiautomator 读控点 + 真截图）

> 纪律: 未改 `PAPERCLIP_API_KEY` / `DEPLOYMENT_MODE`；未动 `clients/expo`；未改任何 server 代码（本次为数据/产物操作，无部署）；发版未触发（无 server 变更）。临时 board token 用完删除。

---

## 0. 结论速览

| 项 | 结果 | 证据 |
|---|---|---|
| A. 45 条 backlog WBS 工作包按 (phase+skills) 自动路由 | ✅ 45/45 落库，`assigneeAgentId` 全部非空；**status 未动**（仍 45 backlog / 6 done / 1 blocked） | §1；`route-wbs-assignees.mjs` |
| B. XROA-76 补产物（附件 + 工作产品） | ✅ 落 1 份 HTML 附件 + 1 条 artifact/paperclip 工作产品（v1，版本链） | §2.2 |
| B. 原型沙箱进入→列表→点击→预览 | ✅ 文件列表显示该产物；点击进预览；WebView **真渲染** HTML（非源码） | §2.3 截图；`app-01/02/03` |
| B. 重置为 in_progress | ⚠️ 已执行 3 次；系统每次在 ~30–70s 内由 core-swe 心跳**自动置回 done**（这是 boss 反馈的根因，非本次 API 能关闭） | §2.4（含时间戳） |

**根因（一句话）**: 系统把「已指派 + 活动状态」的工单交给该员工的**心跳/存活巡检**接管；该员工（core-swe）认为 S3 已交付，于是每次唤醒都把工单写回 `done`。此前它把成果落在**工作区 git 提交**里，**从未登记为工单产物**，所以「已完成却沙箱空空」。本次补上的正是这条产物登记。

---

## 1. A) 自动路由（45 条 backlog WBS 工作包）

工具: `scripts/wave142/route-wbs-assignees.mjs`（默认 DRY-RUN，`APPLY=1` 才写库）。

```sh
API=https://www.xrobinai.cn/api CID=… PID=939ff822-… KEY=<pcp_board_…> \
  node scripts/wave142/route-wbs-assignees.mjs           # dry-run 出表
# 确认后:
… APPLY=1 node scripts/wave142/route-wbs-assignees.mjs   # 逐条 PATCH assigneeAgentId
```

### 1.1 规则表（first match wins；每条命中都带 reason，可对账）

| 序 | 条件 | 路由到 | 依据 |
|---|---|---|---|
| R1 | 阶段 = S6 | **pre-sre-agent** | S6 上线部署/监控拨测/移交培训/运维核验 → 可靠性责任人 |
| R2 | S5 且含 对账/初验/终验 | **ds-agent** | S5 验收类 → 业务方案(DS)主审 |
| R3 | S5 且含 契约/接口 | **core-swe-agent** | S5 接口契约清单 → 契约守护 |
| R4 | S5（其余） | **fdse-agent** | 集成实施/流程嵌入/测试计划与报告 → 交付全栈 |
| R5 | 含 安全隔离/隔离/角色与权限/权限清单/状态机/数据模型/领域模型/守恒 | **fda-agent** | 隔离/权限/领域边界 → 前线架构 |
| R6 | 阶段 = S4 | **fdse-agent** | S4 核心场景开发(8 大功能) → 交付全栈 |
| R7 | 文档类(手册/材料/清单/报告/文档/说明书/规范/设计/方案/计划/应答/调研/确认书) | **core-swe-agent** | 文档交付物 → 平台核心 |
| R8 | 兜底 | 解析描述里的「责任角色」映射 | SRE→pre-sre；测试→fdse；方案顾问→ds；架构/隔离→fda；否则 core-swe |

> 说明: 本批 45 条工单**没有** `metadata.roleTemplate`（issue 表无该字段），所以 R8 兜底改为解析描述里的
> `责任角色:` 行——这是把 boss 规则 D 落到当前数据形态上的等价实现。

### 1.2 分发结果（读回实测，非预期值）

| 员工 | 条数 | WBS |
|---|---|---|
| core-swe-agent | 20 | S1.1–S1.6, S2.1/2.3/2.4/2.5/2.6, S3.1–S3.6/3.8/3.10, S5.7 |
| fdse-agent | 12 | S4.1–S4.8, S5.1–S5.4 |
| pre-sre-agent | 8 | S6.1–S6.8 |
| fda-agent | 3 | S2.2 隔离方案, S3.7 数据模型与状态机, S3.9 角色与权限清单 |
| ds-agent | 2 | S5.5 对账证据, S5.6 初验报告 |

**合计 45 = 全部 backlog**；`backlog 仍未指派` = 0（API 回读）。status 保持 `45 backlog / 6 done / 1 blocked` 不变。

### 1.3 逐条路由表（identifier | phase | newAssignee）

| identifier | phase | newAssignee | 命中规则 |
|---|---|---|---|
| XROA-85 | S1 | core-swe-agent | R7 文档类 |
| XROA-86 | S1 | core-swe-agent | R7 文档类 |
| XROA-87 | S1 | core-swe-agent | R7 文档类 |
| XROA-88 | S1 | core-swe-agent | R7 文档类 |
| XROA-89 | S1 | core-swe-agent | R7 文档类 |
| XROA-90 | S1 | core-swe-agent | R7 文档类 |
| XROA-91 | S2 | core-swe-agent | R7 文档类 |
| XROA-92 | S2 | fda-agent | R5 安全隔离 |
| XROA-93 | S2 | core-swe-agent | R7 文档类 |
| XROA-94 | S2 | core-swe-agent | R7 文档类 |
| XROA-95 | S2 | core-swe-agent | R7 文档类 |
| XROA-96 | S2 | core-swe-agent | R7 文档类 |
| XROA-97 | S3 | core-swe-agent | R7 文档类 |
| XROA-98 | S3 | core-swe-agent | R7 文档类 |
| XROA-99 | S3 | core-swe-agent | R7 文档类 |
| XROA-100 | S3 | core-swe-agent | R7 文档类 |
| XROA-101 | S3 | core-swe-agent | R7 文档类 |
| XROA-102 | S3 | core-swe-agent | R7 文档类 |
| XROA-103 | S3 | fda-agent | R5 数据模型与状态机 |
| XROA-104 | S3 | core-swe-agent | R7 文档类 |
| XROA-105 | S3 | fda-agent | R5 角色与权限清单 |
| XROA-106 | S3 | core-swe-agent | R7 文档类 |
| XROA-107 | S4 | fdse-agent | R6 S4 核心场景开发 |
| XROA-108 | S4 | fdse-agent | R6 |
| XROA-109 | S4 | fdse-agent | R6 |
| XROA-110 | S4 | fdse-agent | R6 |
| XROA-111 | S4 | fdse-agent | R6 |
| XROA-112 | S4 | fdse-agent | R6 |
| XROA-113 | S4 | fdse-agent | R6 |
| XROA-114 | S4 | fdse-agent | R6 |
| XROA-115 | S5 | fdse-agent | R4 S5 集成实施 |
| XROA-116 | S5 | fdse-agent | R4 S5 流程嵌入规范 |
| XROA-117 | S5 | fdse-agent | R4 S5 测试计划 |
| XROA-118 | S5 | fdse-agent | R4 S5 测试报告 |
| XROA-119 | S5 | ds-agent | R2 对账证据 |
| XROA-120 | S5 | ds-agent | R2 初验报告 |
| XROA-121 | S5 | core-swe-agent | R3 接口契约清单 |
| XROA-122 | S6 | pre-sre-agent | R1 S6 |
| XROA-123 | S6 | pre-sre-agent | R1 |
| XROA-124 | S6 | pre-sre-agent | R1 |
| XROA-125 | S6 | pre-sre-agent | R1 |
| XROA-126 | S6 | pre-sre-agent | R1 |
| XROA-127 | S6 | pre-sre-agent | R1 |
| XROA-128 | S6 | pre-sre-agent | R1 |
| XROA-129 | S6 | pre-sre-agent | R1 |

---

## 2. B) 激活 XROA-76（S3 详细设计与 CMMI 文档）+ 补产物 + 沙箱真验

- 工单: XROA-76 `fed81b00-84f0-4856-972c-bc492d2b2e14`
- 原状态: `done`，assignee core-swe-agent，**work-products 0，attachments 0**（实测，坐实 boss 反馈）
- 历史评论: 2 条 agent（core-swe，报「已交付 commit ec615f2 / 1a7ee89」）+ 2 条 system
  （`Paperclip needs a disposition…` / `could not resolve… missing disposition`）

### 2.1 动作

1. `PATCH /issues/fed81b00… { assigneeAgentId: core-swe, status: "in_progress" }` → 200（assignee 保持 core-swe）
2. 上传演示附件（HTML，可被沙箱真渲染）→ 201
3. 注册工作产品 → 201（自动进入版本链 v1）

### 2.2 产物（读回，可审计）

| 对象 | 值 |
|---|---|
| 附件 id | `6e024e5e-b6a5-4140-adde-619dd6f629cf` |
| 附件 | `S3-detailed-design-demo.html` · `text/html` · 3583 B · 路径 `/api/attachments/6e024e5e…/content` |
| 工作产品 id | `56ca1701-6de8-4cf5-bff0-eb3258e9428a`（`artifact` / `paperclip`） |
| 版本 | `versionNumber=1` `isLatest=true`，版本组 `ff52d107-b73e-40ed-9719-d501f1580be7` |
| 标题 | S3 详细设计说明书（沙箱演示条目）· summary: demo entry for sandbox rendering |

附件正文顶部带 **「⚠️ 演示条目 · demo entry for sandbox rendering」** 横幅，明确标注这是沙箱渲染示范、非正式交付。
（源文件见 `S3-详细设计说明书-演示条目.html`。）

### 2.3 原型沙箱真验（App 真机，v0.5.96 / Android `coolie-api28`）

路径: App → 任务 → 搜索 `XROA-76` → 任务详情 →「原型沙箱」→ 列表 → 点文件 → 预览。

| 步骤 | 控制点真值（uiautomator） | 截图 |
|---|---|---|
| 任务详情 | `已完成 · 中 · core-swe-agent · fed81b00…`，按钮「原型沙箱」 | `app-01-task-detail.png` |
| 沙箱列表 | `列表 (1)` / `全部 1` `网页 1` `图片 0` `视频 0` `文档 0`；行 = `🌐 S3-detailed-design-demo.html · 网页 · 3.5 KB · 09-29 15:32 · v1 · 交付物 ›` | `app-02-sandbox-list.png` |
| 沙箱预览 | 顶部 `‹ 列表 · SNAPSHOT · 刷新 · 浏览器打开`；`[webview] "S3 详细设计与 CMMI 文档 — 交付物（沙箱演示条目）"`，正文可见横幅与各 S3.x 标题 | `app-03-sandbox-preview.png` |

**判定**: 列表→点击→预览三步真机走通；预览是 **WebView 真渲染的 HTML 页面**（有紫色页头、卡片、标题），
不是源码文本。「沙箱没东西」已修复。

### 2.4 状态为何停在 done（如实标注）

`in_progress` 三次实测，每次都被系统自动置回 `done`：

| # | 置 in_progress（UTC） | 置回 done（UTC） | 间隔 | 谁把它置回 |
|---|---|---|---|---|
| 1 | 07:31:51 | 07:32:31 | 40s | agent core-swe（`issue.updated from=in_progress to=done` + 评论） |
| 2 | 07:34:55 | 07:35:26 | 31s | 同上（wake `automation`） |
| 3 | 07:55:43 | ~07:56:55 | ~72s | 同上 |

**机制**: 工单一旦是「已指派 + `todo`/`in_progress`」，心跳存活巡检（`heartbeat.ts`，`TIMER_ACTIONABLE_ISSUE_STATUSES`）
会唤醒该员工；core-swe 复核后认为自己已完成 → 写回 `done`。PATCH 路由本身对 `done→in_progress` 并不入队唤醒
（`statusChangedFromClosedToTodo` 只匹配 `→todo`），所以这是**后台巡检**的行为，API 侧没有开关。

**结论**: 只要 core-swe 仍指派且认为工作已完成，用 API 无法让它长期停在 `in_progress`。要长期停留需系统侧改动
（例如：暂停该 agent 的自动处置，或给 board 一个状态锁/「静默」标记）。当前**产物已入系统**，done 不再「空」。
最终实时状态以看板为准。

---

## 3. 未做 / 遗留

- **未改 server 代码** → 无需加固部署/发版（boss 纪律：发版只在 server 改时连带）。
- **未动 `clients/expo`**。
- A) 只做指派，**未改 status**（boss 明确要求）——若希望 backlog 任务立刻被心跳接活，需另行把它们推进到
  `todo`/`in_progress`（本次未做）。
- 45 条 backlog 现已是「有主」状态；其中 S3.7/S3.9/S2.2 的产物归 fda（隔离/权限/状态机边界），其余文档归 core-swe。
- 复现脚本: `scripts/wave142/route-wbs-assignees.mjs`（DRY-RUN 默认）。
