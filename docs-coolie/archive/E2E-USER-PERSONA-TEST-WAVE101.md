# E2E 真验报告: 测试员工拟人化装机测试 + 截图 + CMMI 记录 + 派研发 (wave101)

日期: 2026-09-27
执行: claude (wave101, boss 09-26 24:00 OOB 「测试员工要能拟真人访问系统,截图发现问题,定位问题,cmmi记录,研究研发识别任务解决」)
brief: `docs-coolie/briefs/2026-09-26-user-persona-test-with-cmmi-issues-wave101.md`

## 结论 (TL;DR)

| 环节 | 结论 |
|---|---|
| 拟人化装机 (pm clear 净装 0.5.70/570) | ✅ 完成 — 模拟老板从装机 → 登录 → 5 栏 Tab → CMMI 门禁 → 收件箱 → 设置 → 任务详情 → 工坊聊天全流程 |
| 截图真值 | ✅ 17 张 (`clients/expo/replays/evidence/w101-01 ~ w101-17`) |
| 真问题 | ❌ **8 个真问题** (3 critical / 3 high / 1 medium / 1 low), 全部 prod 实测 |
| 真因定位 | ✅ 5 个定位到文件行号; 3 个 (神秘屏/假预算警告/英文欢迎语) 锁定「运行的 JS 与 repo HEAD 不符」主线 |
| CMMI 记录 | ✅ XROA-42 ~ XROA-50 共 9 个 issue 已建在 prod xrobinai 公司 (含环境告警 XROA-50) |
| 派研发 | ✅ 7 个派 core-swe-agent, 1 个 (CHANGELOG rsync) 派 pre-sre-agent, 1 个 (环境告警协调) 派 Hermes; 均已 in_progress |
| 核心发现 | 🔴 **净装第一印象链路全线故障**: 神秘 What's New 屏 (版本号错误) → Chrome 向导挡死登录 → 二次登录 → CMMI 门禁仍要第三次登录。wave98/100 修的 CMMI 自动登录对「升级安装」有效, **净装场景全链未覆盖** |

## 1. 测试环境

- 模拟器: emulator-5554, App `cloud.coolie.app` **v0.5.70 (570)**, `pm clear` 净装 (模拟老板新手机)
- 服务端: prod xrobinai.cn (authenticated 模式), 公司 `xrobinai` (4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e)
- 账号: robinschen1989@gmail.com (XiaoChen, boss 账号)
- 对照: 本地 3100 (local_trusted) 用于排除法; prod journalctl / OTA manifest 交叉验证

## 2. 截图清单 (拟人化路径)

| # | 文件 | 内容 | 发现 |
|---|---|---|---|
| 1 | w101-01-whatsnew.png | 净装首启神秘 What's New 屏 | 🔴 显示「0.5.69 更新内容」(装的是 0.5.70); 3 条 bullet 文案 repo 里不存在 |
| 2 | w101-02-selfcheck.png | 装机自检屏 | 🟡 「本版更新说明未取到」(prod CHANGELOG 滞留 v0.5.68) |
| 3 | w101-03-login.png | Coolie 统一登录表单 | 🔴 「服务协议」弹层自动弹出 (未点击) |
| 4 | w101-04-login-filled.png | 表单已填 | 🔴 协议弹层再次自动弹出 |
| 5 | w101-05-after-login.png | 点登录后 | 🔴 跳到 Web /auth 标准登录页, 邮箱为空 — 需二次登录 |
| 6 | w101-05b-after-signin.png | 二次登录成功页 | 🔴 「正在跳转…Coolie App 正在打开」16s+ 不跳转; 实际在外部 Chrome |
| 7 | w101-06-workspace.png | native 工作空间 | ✅ 真数据 (xrobinai 40 open / 20 blocked) |
| 8 | w101-07-dashboard.png | Tab1 汇览仪表盘 | 🟡 假预算警告「1 个公司已超出预算」(prod 实际 0/0) |
| 9 | w101-08-tasks.png | Tab2 任务列表 | ✅ 真任务 (XROA-99/101/102) |
| 10 | w101-09-chat.png | Tab4 工坊 ChatHome | ✅ 4 智能体卡 |
| 11 | w101-10-orgassets.png | Tab5 资产 OrgAssets | ✅ 11 资产 + CMMI 门禁卡 |
| 12 | w101-11-cmmi-webview.png | 点 CMMI 门禁 | 🔴 WebView 显示登录页 — 自动登录失败 (净装) |
| 13 | w101-12-inbox.png | 收件箱 | ✅ 空态正常 |
| 14 | w101-13/14-settings*.png | 头像 Settings (含滚动到底) | 🟡 无退出登录入口 |
| 15 | w101-15-task-detail.png | 任务 XROA-102 详情 | 🟢 状态 chip 英文 `active` |
| 16 | w101-16-chat.png | 通用智能体聊天屏 | 🟡 欢迎语/示例全英文 |
| 17 | w101-17-chat-reply.png | 发 "hello" 后 | ✅ AI 真回复 (中文!) — 聊天链路通 |

## 3. 真问题清单 (8 个, 已全部建 CMMI issue)

| Issue | Severity | 问题 | 真因 |
|---|---|---|---|
| [XROA-42](/XROA/issues/XROA-42) | critical | 净装首启神秘 What's New H5 屏 + 版本号错 (0.5.69) + 立即弹 OTA「更新就绪」 | 渲染源不在 repo/APK bundle/OTA bundle(u16)/SPA/version.json 任何一处; APK embedded id 145711f4 ≠ OTA 7c956c03; 待深查 (TUN 劫持 / 未入版本控制 H5 / 打包脏树) |
| [XROA-43](/XROA/issues/XROA-43) | high | 自检屏「本版更新说明未取到」 | prod `/opt/coolie/clients/expo/CHANGELOG.md` 滞留 v0.5.68 (mtime 09-26 23:04), wave100 未 rsync → `/api/release-notes?version=0.5.70` 404 (server/src/routes/release-notes.ts:127) |
| [XROA-44](/XROA/issues/XROA-44) | critical | 登录跳外部 Chrome 需二次登录 + 卡「正在跳转」+ 净装被 Chrome 首跑向导连挡 3 屏 | repo WebLoginScreen 是内嵌 WebView (WebLoginScreen.tsx:189), 实机行为外跳 Chrome — 与 XROA-42 幽灵 bundle 主线一致; 深链回跳无兜底 |
| [XROA-45](/XROA/issues/XROA-45) | critical | 净装后 CMMI 门禁 WebView 不共享登录态 (仍登录页) | wave98/100 修复只覆盖升级安装; 净装登录发生在外部 Chrome, cookie 进了 Chrome store, App WebView store 无 session |
| [XROA-46](/XROA/issues/XROA-46) | high | Settings 页无退出登录 | CHANGELOG 0.5.69: 收件箱齿轮是登出唯一入口 (InboxScreen.tsx:386) — 不可发现 |
| [XROA-47](/XROA/issues/XROA-47) | low | 状态 chip 英文 `active` | TaskDetailScreen.tsx:36 STATUS_LABEL 缺 active 键, 207 行回退原值 |
| [XROA-48](/XROA/issues/XROA-48) | medium | 聊天欢迎语/示例全英文 (AI 却中文回复) | 文案不在 repo BoardChatScreen — XROA-42 主线; 或后端下发无 i18n |
| [XROA-49](/XROA/issues/XROA-49) | high | 假预算警告「1 个公司已超出预算」 | prod dashboard API 实测 monthSpend=0/monthBudget=0/activeIncidents=0 — 无任何超预算信号; 警告文案不在 repo DashboardScreen — XROA-42 主线 |
| [XROA-50](/XROA/issues/XROA-50) | high | 环境告警 (meta): XROA-42/44/45/48/49 修复前先真机复现 | Mac TUN 代理栈伪造前科 (wave94/96/99); prod REST 面仅创建+列表开放, 评论/PATCH 404 |

## ⚠️ 环境告警 (XROA-50, 修复前必读)

本 wave 采集环境是 **Mac + Android 模拟器 (TUN 代理栈)**, 该环境有已归档的伪造前科 (wave94/96/99):
- auth 写请求被本地克隆吸收 (wave96 注册幽灵)
- 渲染 repo/OTA/server 都不存在的 UI 与假数据 (wave94 假 401 / 假公司名)
- WebView 流量 split-brain (wave99)

因此 **XROA-42 (神秘屏) / XROA-44 (Chrome 登录链) / XROA-45 (CMMI 净装) / XROA-48 (英文欢迎语) / XROA-49 (假预算警告)** 五个 issue 的现象在真机上可能不成立 — 研发动手前必须先真机/干净网络复现; 复现不了降级 backlog。**XROA-43 (CHANGELOG rsync) / XROA-46 (Settings 无登出) / XROA-47 (STATUS_LABEL 缺键)** 三个是 repo/prod 可直接确认的, 不受环境告警影响。

另: prod REST 面 (x-paperclip-api-key) 只有创建+列表路由开放, `PATCH /api/issues/:id` 与 `POST /api/issues/:id/comments` 均 404 — 本告警因此以独立 issue (XROA-50) 而非各 issue 评论的形式交付。

### 上游 (Paperclip) 对照

- XROA-47: fork App 层新代码的字典遗漏, 上游无此屏
- XROA-43: fork 的发版 rsync 流程缺陷, 上游无此部署形态
- XROA-42/44/45/48/49: 均与「运行的 JS ≠ repo HEAD」主线纠缠, 需先查 XROA-42 定源再判断上游是否也有

## 4. 真因定位方法存档 (供研发复用)

1. **排除法搜渲染源**: 神秘屏文案对 repo 源码 / APK `assets/index.android.bundle` (UTF-8 明文) / OTA `.hbc` (**UTF-16LE 字符串表 — UTF-8 搜不到!**) / prod SPA 全部 277 chunks / version.json 逐一二进制级搜索
2. **OTA 链路真值**: prod journalctl `[ota-manifest] served` 行含 manifestId/bundleHash/rewritten; 请求头 `expo-embedded-update-id` 直接暴露 APK 内嵌 update id
3. **实测结论**: APK embedded `145711f4` (commitTime 09-27 09:49 打包) ≠ OTA manifest `7c956c03` (01:51 publish, 自述从 committed HEAD 重发) — **APK 与 OTA 不是同一份代码**; 且设备渲染的 UI 文案在两者中都搜不到 → 仍有一个未定位的渲染源 (最高嫌疑: Mac TUN 代理把设备 bundle 下载劫持到本地克隆, 因为 prod 日志只有 /manifest 请求、无 bundle 下载记录)
4. **假警告核实**: App 显示「1 个公司已超出预算」当刻 curl prod dashboard API — 数据全 0, 判定为 App 端假渲染

## 5. 派研发 (拟人化分析)

| Issue | Assignee | 理由 |
|---|---|---|
| XROA-42/44/45/46/47/48/49 | core-swe-agent | App 代码层修复主力 (登录链/WebView cookie/i18n/UI) |
| XROA-43 | pre-sre-agent | prod rsync/部署流程所有 |
| XROA-50 | Hermes (ceo) | 协调环境告警: 决定 5 个受影响 issue 的真机复现排期与降级 |

9 个 issue 均已 in_progress (assignee 被自动唤醒)。

## 6. 测试中已验证为「好」的部分 (不需要修)

- 工作空间/仪表盘/任务列表/资产页数据真值与 prod API 完全一致 (6 active / 40 open / 20 blocked / 66 全部)
- 工坊聊天端到端真实可用 (hello → 中文回复, 会话创建)
- 收件箱空态文案得体; Settings 账户/版本信息正确 (0.5.70 / 570 / production)
- server 端 release-notes 端点行为正确 (无版本节时 404, 不拿旧版充数 — wave95 契约保持)

## 7. 建议老板下一步

1. 先看 XROA-42 (主线 — 三个 critical 的共同根源可能在同一份幽灵代码)
2. XROA-43 是 5 分钟修 (rsync 一个文件), 可立即让 pre-sre-agent 处理
3. 发版 checklist 增加「净装 pm clear 回归」— 本 wave 3 个 critical 全在净装路径, 升级安装路径 wave99 已验过是好的
