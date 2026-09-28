# WAVE129 — 数字员工拟人化全流程演练 · QA 报告

- 日期: 2026-09-29
- 公司: `4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e`（xrobinai）
- 客户需求文档: `/tmp/req.docx`《某公司产融智能体应用系统集成服务项目技术规范书》656 段 / 75,521 B
- 环境: Web `https://www.xrobinai.cn/XROA`（Playwright 真点击）；App `Coolie工坊` iPhone 17 Pro 模拟器（agent-device 真点击）
- 角色: 只看界面的 QA（客户视角），与 API 真值对照
- 本次为 wave129 **重跑**：复用上一轮 web 证据，续跑补齐 App 与 QA 报告（上一轮断网猝死）

> 铁律遵守情况：全部结论来自真实 UI 操作（Playwright / agent-device），未用 curl 假装 UI；curl/API 仅用于**真值对照**与**清理临时凭证**；未改任何产品代码；未动 `PAPERCLIP_API_KEY` / `DEPLOYMENT_MODE`；无 APK bump。

---

## 0. 结论速览

**「客户需求 → 交付」这条链路本轮没有真正走通。** 断点不在员工，而在**需求入库**这一段：

1. **Web 生产根本没法上传需求文档** —— 线上前端是旧构建，`需求文档` 上传控件还没部署（源码 HEAD 已有，见 §3 P1-1）。
2. **App 邮箱/密码登录 100% 失败**（`Board authentication required`，§3 P1-2）——普通用户被挡在门外，本轮只能改用 App 的「API Key 登录」通道进入。
3. App 的 工坊对话 附件能传上去，但**带附件时发送会被「附件上传中」永久卡死**（§3 P2-1）；清空附件后文本消息才发得出去。
4. 最终 工坊对话 确实产出了**结构化的交付流水线拆解**（自动建 XROA-135~138 四张子工单 + 依赖链），但那是基于看板自身上下文，**不是基于 req.docx 的内容**（因为消息没带上文档）。

链路完成度：**Web 4/8 ≈ 50%**，**App 5.5/7 ≈ 75%**，**端到端「需求→交付」≈ 55%**（需求一进系统就断）。

---

## 1. 走查步骤与截图索引

### 1.1 Web（Playwright，`scripts/e2e/wave129/`）

| # | 步骤 | 结果 | 证据 |
|---|---|---|---|
| W1 | 打开 `/XROA` 登录（robinschen1989@gmail.com） | ✅ | `web/00-landing.png` `web/01-login-form.png` `web/01-login-filled.png` `web/02-after-login.png` |
| W2 | 项目中心列表 | ✅ 7 个项目 | `web/10-projects-list.png` `web/90-web-01-projects.png` |
| W3 | UI 新建项目（Add Project 对话框） | ✅ 打开 | `web/90-web-02-newproject-dialog.png` `web/11-new-project-dialog*.png` |
| W4 | **在对话框里找「需求文档」上传控件** | ❌ **不存在** | `web/90-web-02-newproject-dialog.png`（DOM 探针 `fileInputs:[] hasLabel:false hasPickBtn:false`）|
| W5 | 建项目（名称「产融智能体应用系统集成服务项目（wave129 UI 走查）」） | ✅ id `93d92498-…b07` | `web/90-web-04-after-create.png` |
| W6 | 项目详情 / 各 Tab / 描述·目标是否被补齐 | ✅ 页面可开；❌ 未补齐（`description:null, goals:[]`） | `web/90-web-05-project-detail-tasks.png` `web/90-web-06-project-config.png` `web/21-tab-*.png` |
| W7 | UI 建任务并指派 core-swe-agent | ✅ 见 §2（XROA-133） | `web/91-web-01..05` `web/90-web-07..08` |
| W8 | 上传 req.docx + 落档 + 自动识别预填名 | ⛔ **无法执行**（控件未部署） | 见 §3 P1-1 |

### 1.2 App（agent-device，iPhone 17 Pro 模拟器）

| # | 步骤 | 结果 | 证据 |
|---|---|---|---|
| A1 | 启动 App（dev build，v0.5.89）| ✅ | `app/00-whatsnew.png` |
| A2 | **邮箱/密码登录** | ❌ `Board authentication required` | `app/01-login.png` `app/01b-login-error.png` |
| A3 | 改走「API Key 登录」→ 选公司 xrobinai | ✅ | `app/01c-login-apikey-toggle.png` `app/02-dashboard.png` |
| A4 | 项目中心（资产 Tab → 📁 项目中心）| ✅ 7 个项目 | `app/03-projects-center.png` `app/04-projects-bottom.png` |
| A5 | 项目卡展开 →「创建任务」→ **验预选** | ✅ 已预选「某公司产融智能体应用系统集成服务项目」 | `app/05-project-card-expanded.png` `app/06-createtask-preselect.png` |
| A6 | 填标题 + 指派 core-swe-agent → 建真任务 | ✅ XROA-134 | `app/07-task-created-alert.png` |
| A7 | 「查看任务」→ **验筛选** | ✅ 筛选条＝该项目，今日 51 | `app/08-tasks-filtered-by-project.png` |
| A8 | 工坊对话 上传同一 req.docx | ⚠️ 文件确实到达服务端，但**发送被卡死** | `app/09-chat-attachment-staged.png` `app/11-chat-upload-blocked.png` |
| A9 | 发「按这份规范书拆解交付流水线」→ 看产出 | ✅ 有**结构化拆解**（但未用文档内容） | `app/10-chat-sent.png` `app/12-chat-reply.png` `app/13-chat-breakdown.png` |

---

## 2. API 真值对照（read-only）

| 对象 | UI 所见 | API 真值 | 一致? |
|---|---|---|---|
| 项目总数 | 7 | 7 | ✅ |
| Web 新建项目 `93d92498` | 计划中 / 0 任务 / 无描述 | `status=planned, taskCount=0, description=null, goals=[]` | ✅（但“未补齐”本身是缺陷 P3-2）|
| Web 建任务 XROA-133 | 建成功 | `projectId=ba961c1a…`(wave129 项目) `assignee=core-swe-agent` `responsibleUserId=CtCx…`(真 owner) `status=done` | ✅ |
| App 建任务 XROA-134 | 弹「任务已创建」 | `projectId=939ff822…`(某公司项目) `assignee=core-swe-agent` `responsibleUserId=CtCx…` `status=done` | ✅ 预选生效 |
| 工坊对话 docx 上传 | 已选 1 个附件（随后清空）| XROA-2 下新增 **2 条 75,521 B 附件**（21:42:54Z），即 req.docx | ✅ 文件到位（但见 P2-1）|
| 拆解产出 | 4 张子工单 | XROA-135(in_progress)/136(blocked)/137(blocked)/138(todo)，`parentId=XROA-2`，assignee 分别为 fda-agent/…/pre-sre-agent/ds-agent | ✅ |
| 阻塞任务数 | App 大盘「阻塞 39」 | `status=blocked` = 39 | ✅ |
| **任务总数** | App 大盘「164 个任务」| API issues = **124** | ❌ 见 P3-3 |
| App 版本 | 自检页 v0.5.89；原生 `CFBundleShortVersionString=0.1.0` | app.json=0.5.89 | ❌ 见 P3-4 |

---

## 3. 问题分级

### P1-1 · Web 生产环境无法上传需求文档（部署落后于源码）
- **现象**：`/XROA` 新建项目对话框**没有任何**「需求文档 / 选择文件」控件；`需求文档`、`选择文件 (多选)`、`analyze-document`、`coolie-docs` 等字符串在生产 bundle 中全为 0 命中。
- **根因（证据）**：线上主 bundle `https://www.xrobinai.cn/assets/index-CR4jE0C_.js` 内联的构建提交是 **`e0f641200`（2026-09-28 02:04:42）**，早于 wave122 的需求文档上传提交（`6c6967f6e` 14:47 / `fc9b6f980` 15:08）。即 **线上前端是旧构建**，源码 HEAD 已经有该功能。
- **影响**：「客户需求入库」这一关键步骤在 Web 上完全不可用 → 自动识别预填名、落档 `coolie-docs/`、后台解析补齐都无法验证。
- **复现**：登录 → 项目中心 → Add Project → 对话框里找不到上传控件（截图 `web/90-web-02-newproject-dialog.png`）。
- **建议**：重新部署 UI（`vite build`）使线上构建与 HEAD 一致。

### P1-2 · App 邮箱/密码登录 100% 失败（`Board authentication required`）
- **现象**：App 输入正确账号密码 → 红字 `Board authentication required`，可稳定复现两次。
- **定位**：`POST /api/auth/sign-in/email` 本身成功（curl 200，两种 host 都通）；失败发生在其后的 `GET /api/auth/get-session`（`clients/expo/src/coolie.ts:790`，未 try/catch）。用 curl 复现「只带未签名 token」→ **401 Board authentication required**；带**完整签名 cookie**（`token.HMAC`）→ 200。说明 App 侧没能把签名后的会话 cookie 正确回放（读不到 `Set-Cookie` / 值不完整）。
- **影响**：所有走邮箱登录的真实用户都进不去（本轮只能改走 App 的「API Key 登录」通道）。
- **复现**：App 登录页填邮箱密码 → 点「登录」→ 红字。截图 `app/01b-login-error.png`。
- **建议**：核对 RN 下 `Set-Cookie` 读取与 cookie 回放（`extractSessionTokenCookie` / RN Headers polyfill），并补一个真机/模拟器的 App 端登录回归。

### P2-1 · App 工坊对话「带附件发送」被永久卡死（重复上传导致计数不匹配）
- **现象**：附件已成功上传到服务端（XROA-2 出现 **2 条** 75,521 B 附件），但点「发送」永远弹「**附件上传中 / 请等附件上传完毕再发送**」，无论等多久。
- **根因（推断）**：`BoardChatScreen` 发送前置判断 `uploadedAttachmentIds.length !== stagedAttachments.length` 即拦截。选文件时「pick 即传」与「boardIssueId 就绪后补传」两个路径都触发，同一文件被传了**两次**（服务端 2 条即证），`uploadedAttachmentIds` 变成 2，而 `staged.length` 是 1 → **计数永不相等，发送被永久锁死**。
- **影响**：用户无法发送带附件的消息（只能「清空附件」后才能发文本）→ 直接破坏「上传规范书 → 让员工拆解」这条主链路。
- **复现**：工坊 → 添加附件 → 文件 → 选 req.docx → 发送（截图 `app/09`→`app/11`）。
- **建议**：上传去重（按 `uri:size`，已有 `seen` 集合逻辑，补到补传路径）或改用「按附件 id 是否齐全」而非等长判断。

### P2-2 · Web 线上 UI 构建落后（功能缺失的根因面）
- 同 P1-1 的构建指纹证据。除需求文档上传外，**线上与 HEAD 的差异范围未逐项核对**，属需收口项（建议以 `e0f641200..HEAD` 的 UI 提交逐条比对）。

### P2-3 · 工坊对话不渲染超链接（CLI 终端模式）
- **现象**：助手自己说「当前是 CLI 终端模式，不渲染超链接，`[文字](URL)` 会原样打印成文字，手机端点不开」，只能让用户「长按复制 → 浏览器粘贴」。
- **影响**：拆解产出的工单链接在 App 里**不可点**，客户拿不到「一键跳转」的交付体验。
- **证据**：`app/13-chat-breakdown.png` 中回复正文与历史消息。

### P2-4 · 看板助手稳定性（历史 `hermes-error`）
- 工坊历史消息含 `[hermes-error] Board assistant failed (exit 130)`（截图 `app/12/13` 历史区）。属**看板对话可靠性**问题，本轮未复现新实例，记录待观察。

### P3-1 · Web 项目页「新建任务」不预选当前项目
- 从某项目详情页点「New Task」，Project 选择器仍是占位「Project」（`PROJECT PRESELECTED ON OPEN: false`）。App 端是预选的（A5 ✅），两端行为不一致。

### P3-2 · UI 新建项目后 描述/目标 未被后台补齐
- 新建项目 `93d92498` 落库即 `description=null, goals=[]`，详情页也无解析补齐痕迹（无法上传文档 → 无输入 → 无补齐）。

### P3-3 · App 大盘任务总数与 API 不一致
- 大盘「164 个任务」vs API issues 124（阻塞 39 二者一致）。疑为统计口径/缓存问题，建议对齐口径。

### P3-4 · App 版本号不一致 + OTA 未启用（dev build）
- JS 自检页显示 v0.5.89，但原生 `CFBundleShortVersionString=0.1.0`；自检页自述「这台设备上的 App 没开 OTA——很可能是旧 APK」。本轮为 Metro dev build（无内嵌 bundle / 无 OTA），非发布包；记录以免与真实安装包混淆。

### 已知缺陷（**不重复诊断**，指向 WAVE134）
- 若看到**历史**任务受阻 / 员工交不上活而判 `blocked`，属掌柜已定位的 **responsibleUserId 伪用户 → agent 回写 403（RESPONSIBLE_USER_UNAVAILABLE）→ 任务 blocked**，正在由 **WAVE134** 修复。详见 `docs-coolie/audit/WAVE134-RESPONSIBLE-USER-403.md`。
- 本轮**新写入**的对象（XROA-133/134/135~138）`responsibleUserId` 均为真 owner `CtCxJJuva2SacStByNr58GpQSLMiTjSi`，**未见**该缺陷在新路径复现。

---

## 4. 链路完成度

| 段落 | 步骤完成 | 说明 |
|---|---|---|
| Web：登录→项目中心→新建项目 | ✅ | — |
| Web：需求文档上传/落档/自动识别 | ⛔ 0/3 | 生产无控件（P1-1）|
| Web：描述·目标补齐 | ⛔ | 无输入源 |
| Web：建任务+指派 | ✅ | XROA-133，projectId/assignee/responsibleUser 均正确 |
| **Web 小计** | **4/8 ≈ 50%** | |
| App：登录 | ⚠️ partial | 邮箱登录挂掉；仅 API Key 通道可用（P1-2）|
| App：项目中心 | ✅ | |
| App：项目卡创建任务·预选 | ✅ | |
| App：建真任务 | ✅ | XROA-134 |
| App：查看任务·筛选 | ✅ | |
| App：工坊对话上传 docx | ⚠️ partial | 文件到位但发送被卡死（P2-1）|
| App：发拆解消息→结构化产出 | ✅ | XROA-135~138（未用文档内容）|
| **App 小计** | **5.5/7 ≈ 75%** | |
| **端到端「客户需求 → 交付」** | **≈ 55%** | 需求入库段断；员工侧拆解能跑 |

---

## 5. 缺口清单（具体到 页面 + 按钮 + 步骤）

| # | 页面 | 按钮/控件 | 复现步骤 | 期望 | 实况 |
|---|---|---|---|---|---|
| G1 | Web · 项目中心 → Add Project 对话框 | 「选择文件 (多选)」/`input[aria-label=需求文档]` | 登录→项目中心→Add Project→向下滚动 | 出现需求文档上传区，可传 req.docx 并自动预填名称 | 控件不存在（线上旧构建）|
| G2 | Web · 项目详情 · Configuration | — | 上传后查看描述/目标 | 后台解析补齐描述/目标/文档 | 无解析，`description=null goals=[]` |
| G3 | App · 登录页 | 「登录」（邮箱密码） | 填账号密码→登录 | 进入公司/看板 | 红字 `Board authentication required` |
| G4 | App · 工坊 | 「添加附件」→「文件」→选 req.docx→「发送」 | 见 §1.2 A8 | 发送成功并让员工读文档 | 弹「附件上传中」永久卡死，须「清空」后才能发文本 |
| G5 | App · 工坊 | 回复中的工单链接 | 看拆解产出 | 可点击跳转 | 纯文本不可点（CLI 终端模式）|
| G6 | Web · 项目详情（任意）| 「New Task」 | 打开建单框 | 预选当前项目 | Project 为空占位 |
| G7 | App · 仪表盘 | 任务总数 | 对比 API | 与 API 一致 | 164 vs 124 |

---

## 6. 复跑脚本（可重放）

- `scripts/e2e/wave129/lib.mjs` — Playwright 登录/截图工具
- `scripts/e2e/wave129/web-flow.mjs` — 登录→新建项目→探需求文档上传→建项目→详情→建任务
- `scripts/e2e/wave129/web-task2.mjs` — 项目内建任务+指派，含 POST payload 与 API 回读
- `scripts/e2e/wave129/web-truth.mjs` — 只读 API 真值（项目/任务/员工）
- App 侧用 `agent-device`（`AGENT_DEVICE_STATE_DIR=/tmp/ad-wave129/adstate`）驱动；App 重建步骤见 §7。

## 7. App 复现环境说明（供复查）

- 模拟器 `iPhone 17 Pro`（UDID `41180815-…69B97`），`Xcode 27.0`。
- 仓库旧 dev build 缺 `expo-document-picker` 原生模块（`ios/Podfile.lock` 无该 pod），直接跑会 `Cannot find native module 'ExpoDocumentPicker'`；本轮执行了本地重建：
  - `cd clients/expo && npx expo run:ios`（触发 prebuild + pod install，装上 `ExpoDocumentPicker (13.0.3)`）；
  - Xcode 27 拒绝 pod 的 `IPHONEOS_DEPLOYMENT_TARGET` 9.0/12.0，**仅在**（gitignored 的）`ios/Podfile` 的 `post_install` 里加了一段把 pod 目标统一钳到 15.1 的本地补丁（**非产品代码**）；
  - `pod install` + `xcodebuild -workspace Coolie.xcworkspace -scheme Coolie -configuration Debug -sdk iphonesimulator -destination 'id=41180815-…' -derivedDataPath build/DerivedData build` → **BUILD SUCCEEDED**；
  - `xcrun simctl install booted …/Debug-iphonesimulator/Coolie.app`；
  - Metro：`cd clients/expo && npx expo start --port 8081`；
  - `agent-device open cloud.coolie.app --platform ios --device "iPhone 17 Pro" --metro-host 127.0.0.1 --metro-port 8081 --relaunch`。
- 为让 App 的文件选择器能选到 docx：把 `/tmp/req.docx` 拷进模拟器本地存储
  `…/CoreSimulator/Devices/<udid>/data/Containers/Shared/AppGroup/EB97D1D7-…/File Provider Storage/req.docx`（该 group = `group.com.apple.FileProvider.LocalStorage`，即「我的 iPhone」）。
- 临时凭证：为走通 App「API Key 登录」，通过 Web 会话创建了一张临时 board key，**走查结束已删除**（`DELETE /api/board-api-keys/df3405b3-…` → `{"ok":true}`）。未触碰 `PAPERCLIP_API_KEY` / `DEPLOYMENT_MODE`。

## 8. 清理

- 临时 board API key 已删除；本地 HTTP(8099) 文件服务与 Metro 已停止。
- 本轮库内新增：`docs-coolie/evidence/wave129/{web,app}` 截图 + 本报告 + `scripts/e2e/wave129/*`（重放脚本）。
- 未修改任何产品代码；`ios/` 为 gitignored，Podfile 本地补丁不入库。
