# WAVE136 — 数字员工拟人化全链路复测 · QA 报告

- 日期: 2026-09-29
- 公司: `4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e`（xrobinai）
- 客户需求文档: `/tmp/req.docx`《某公司产融智能体应用系统集成服务项目技术规范书》（75,521 B，与 wave129 同一份）
- 环境:
  - Web `https://www.xrobinai.cn/XROA`（Playwright 真点击，`scripts/e2e/wave129/lib.mjs` 复用；本轮脚本在 scratchpad，见 §7）
  - App `Coolie工坊` **Android 发布包 v0.5.93**（Release APK 装机在 `emulator-5556`／`coolie-api28`；用 `agent-device` + `adb` 真点击）
- 对照基线: `docs-coolie/evidence/wave129/QA-REPORT.md`（端到端 ≈ **55%**）
- 上位清单: `doc/plans/2026-09-28-wave135-p3-checklist.md`

> 铁律遵守: 结论均来自**真实 UI 操作**（Playwright 点击／agent-device 点击 + adb 真机截图）；curl 仅用于
> **真值对照**（响应头、API 口径）与 **setup**（建一张验证用 work product）；未用 curl 假装 UI。
> 未改 `PAPERCLIP_API_KEY` / `DEPLOYMENT_MODE`。`COOLIE_RELEASE_COMPANY_ID` 未设置，发版 DS gate 按脚本跳过。

---

## 0. 结论速览

wave129 断在「需求一进系统就断」（Web 生产没有需求文档上传控件、App 邮箱登录挂掉）。
本轮这两个**入口都通了**，并且把老板点名的那条 —— **HTML 交付产物必须能预览、不能是文本** —— 在服务端与 App 两端都修好并真机验证：

| | wave129 | wave136 |
|---|---|---|
| 端到端「客户需求 → 交付」（估算） | ≈ 55% | **≈ 80%** |
| Web | 4/8 ≈ 50% | **8/8** |
| App | 5.5/7 ≈ 75% | **6.5/7 ≈ 93%** |

仍未走通的、如实标注：
1. **描述已补齐、`goals` 未补齐**（P3-2 半通）：需求文档被解析出描述并回填，但目标清单为 0 —— 这份规范书里没有「目标/里程碑/交付/功能模块」标题下的列表项，解析器按设计不产出目标。属**文档形态**而非崩溃。
2. **拆解 → 员工交付 → 回写 → done 这一段本轮没重跑**（时间/员工预算），只验证到「需求入库 → 建单 → 交付产物可预览」。该段 wave134 的 `responsibleUserId` 伪用户 → 403 修复未在本轮复验。
3. App 装机自检页的「**本版更新说明未取到**」仍在（version.json 里有 releaseNotes，App 侧没取到）；不影响 OTA/版本一致性判定。

---

## 1. 逐环节对照表

| # | 环节 | wave129 结果 | wave136 结果 | 证据 |
|---|---|---|---|---|
| W1 | Web 登录 `/XROA` | ✅ | ✅ | `web/w136-01-projects.png` |
| W2 | Web 需求文档上传控件存在 | ⛔ 控件未部署 | ✅ `fileInputs:["需求文档"]` | `web/w136-02-newproject-dialog.png` `w136-03-doc-picked.png` |
| W3 | 上传 docx → 自动识别预填项目名 | ⛔ 无控件 | ✅ 预填「某公司产融智能体应用系统集成服务项目」 | `web/w136-03-doc-picked.png`；notes.json |
| W4 | Web 建项目 | ✅ | ✅ `30f50ce1-30d0-4879-b7a9-b57af05a39dc` | `web/w136-04-after-create.png` |
| W5 | 新建项目后 描述/目标 被后台补齐（**P3-2**） | ❌ `description=null,goals=[]` | ⚠️ 描述✅ / 目标 0 | `web/w136-05-project-detail.png`；`GET /api/projects/:id` → `description="某公司产融智能体应用系统集成服务项目 技术规范书"` |
| W6 | 建任务 + 指派（**P3-1** 预选） | ✅（App）/ ❌（Web） | ✅ Web 全局 New Task **预选当前项目** | `web/w136-07-newtask-preselected.png`；POST `/issues` payload `projectId=30f50ce1…`；XROA-139 |
| W7 | **HTML 交付产物上传** | — | ✅ `contentType=text/html` 3428 B | `web/w136-09-issue-detail-after-upload.png`；notes.json |
| W8 | **HTML 交付产物能预览（不是源码）** | — | ✅ 浏览器渲染出看板（标题/表格/脚本跑起来） | `web/w136-11-html-attachment-rendered.png`；curl -I 见 §2 |
| A1 | App 启动（发布包）+ 装机自检 | ⚠️ dev build 版本不可信 | ✅ `APK 版本 v0.5.93` / `OTA 热更新 已启用` / `OTA 运行时 0.5.93` / 更新源连通 | `app/w136-01-selfcheck.png` |
| A2 | App 登录 / 公司选择 | ⚠️ 邮箱登录 401 | ✅ 会话在位 → 选 `xrobinai` | `app/w136-02-company-picker.png` |
| A3 | App 仪表盘任务总数口径（**P3-3**） | ❌ 164 vs API 124 | ✅ **131 = API `progress.total` 131** | `app/w136-03-dashboard.png`；§2 |
| A4 | App 打开该任务 | ✅ | ✅ XROA-139 详情 | `app/w136-05-task-detail.png` |
| A5 | **App 原型沙箱渲染 HTML 交付物** | — | ✅（见 §3 过程；0.5.91→0.5.93 三次真机迭代） | `app/w136-07-sandbox-rendered.png`（渲染成功）；`app/w136-06-sandbox-0591-404.png`、`app/w136-06b-sandbox-0592-still-404.png`（两次失败留证） |
| A6 | App 构建/发版版本一致性（**P3-4**） | ❌ 原生 0.1.0 vs JS 0.5.89 | ✅ APK=0.5.93=OTA 运行时=app.json | §2；`app/w136-01-selfcheck.png` |
| E1 | 工坊对话按文档拆解 | ⚠️ 拆解了但没用文档 | ⏭ 本轮未重跑 | — |
| E2 | 员工交付 + 回写 + done | ⚠️ 受 wave134 阻塞 | ⏭ 本轮未重跑 | — |

---

## 2. 真值对照（read-only，非 UI 冒充）

### 2.1 HTML 附件内容端点响应头（`curl -I`，带 Web 会话 cookie）

```
HTTP/2 200
content-type: text/html; charset=utf-8
content-disposition: inline; filename="xroa-dashboard.html"
content-security-policy: sandbox allow-scripts; default-src 'none'; img-src 'self' data: blob:;
                         style-src 'unsafe-inline'; script-src 'unsafe-inline';
                         font-src 'self' data:; media-src 'self' blob: data:; connect-src 'none'
x-content-type-options: nosniff
content-length: 3428
```

`?download=1` 时 → `content-disposition: attachment; filename="xroa-dashboard.html"`（下载豁免保留）。

**为什么这样不会造成 cookie/同源风险**：`sandbox` 不含 `allow-same-origin`，文档被赋予**不透明源**——
读不到 `document.cookie`、拿不到 localStorage/sessionStorage、够不到宿主页面，所以上传者写的脚本无法以
观看者的会话身份行动；`connect-src 'none'` 另外断掉 fetch/XHR/WebSocket 外发。`?download=1` 与
`Content-Disposition` 的下载路径未变。

### 2.2 仪表盘口径

```
GET /api/companies/4cafeb9a…/dashboard
progress: { total: 131, open: 115, inProgress: 1, blocked: 40, done: 15, cancelled: 1,
            completionRatePercent: 11.5 }
```
App 仪表盘显示 **131 个任务 / 完成率 11.5%** —— 与 API **完全一致**（wave129 的 164 vs 124 已不复现）。

### 2.3 版本 / OTA（P3-4）

| 位置 | 值 |
|---|---|
| `clients/expo/app.json` | `version 0.5.93` / `versionCode 593` |
| 装机 APK 自检页 | `APK 版本 v0.5.93` |
| 原生 `EXPO_RUNTIME_VERSION`（release-app.sh 断言） | 0.5.93 |
| 生产 `/ota/manifest` `runtimeVersion` | 0.5.93 |
| 生产 `/version.json` `version` | 0.5.93（200） |
| App 自检页 | `OTA 热更新 已启用` / `OTA 运行时 0.5.93` / `当前运行 bundle: OTA 下发` |

wave129 的「JS 0.5.89 vs 原生 0.1.0 + OTA 未启用」是 **Metro dev build 的假象**；发布包三处版本一致、OTA 生效。

---

## 3. 老板点名的这条：HTML 交付产物真预览

**原话**：「交付产物，交互原型沙箱，html 之类的，前端框架能直接运行的你得能让我预览，总不能是文本吧」。

### 3.1 改了什么

- **服务端** `server/src/attachment-types.ts` / `routes/issues.ts`：`text/html` 与 `application/xhtml+xml`
  进入 `INLINE_ATTACHMENT_TYPES`；`GET /attachments/:id/content` 对 html 下发
  `text/html; charset=utf-8` + `Content-Disposition: inline` + 上面的沙箱 CSP；文件名 `.html/.htm`
  在「客户端只报了 generic 二进制」时兜底推断为 `text/html`（上传与响应两侧都做）。
- **App** `clients/expo/src/screens/PrototypeSandboxScreen.tsx`：原来任何 `/attachments/` URL 都被
  `fetch().text()` 后丢进 markdown 渲染器（于是 `generateMarkdownHtml` 把 HTML 转义成可见源码）。
  现在先探 `content-type`：是 html 就**带凭据取回正文 + `baseUrl` 注入 WebView 渲染真页面**；
  其它文本仍走 markdown。
- **Web** `ui/src/lib/issue-attachments.ts`（`isHtmlAttachment`）+ `IssueAttachmentsSection.tsx` /
  `task-chat/TaskChatProtocolCard.tsx`：html 附件用 `<iframe sandbox="allow-scripts">` 内联预览；
  任何「打开」入口也因为服务端改成 inline 而**直接渲染页面**而不是下载。

  > 说明（避免夸大）：默认的 task-chat shell 下，**用户上传**的 html 附件在评论气泡里是
  > 一个 chip，点开（服务端已 inline）就是渲染好的页面 —— 本轮 Web 证据走的就是这条
  > （`w136-11`）。**内联 iframe** 覆盖的是 classic 任务界面与 agent 交付物（work product /
  > artifact）资源卡这两处。原「显示源码」症状在两端都已消除。

### 3.2 App 真机迭代（诚实记录，含两次失败）

| 版本 | 现象 | 根因（证据） | 处置 |
|---|---|---|---|
| 0.5.91 | 沙箱里是 `{"error":"Attachment not found"}` | WebView 没带任何凭据（Android `sharedCookiesEnabled` 无效） | 见 0.5.92 |
| 0.5.92 | 仍 404 | 生产日志：WebView 先请求 `/api/auth/exchange` → 302 + Set-Cookie，**但跟随到附件 URL 的请求没有 cookie**（旧内核 WebView 丢了 302 的 Set-Cookie；`loadUrl` 的自定义 Cookie 头被系统忽略） | 见 0.5.93 |
| 0.5.93 | ✅ 版面渲染出来：`app/w136-07-sandbox-rendered.png` 有 KPI 卡 / 表格 / 渐变徽标；uiautomator 读到的文本含页面脚本改过的标题 `XROA 交付看板 · 已渲染` 与走动的时钟 `…上午10:02:44` —— **脚本在跑，证明是渲染不是源码** | RN 侧用 `credentials:"include"`（原生 cookie jar，与 App 其它 API 同一套凭据）取回正文，`baseUrl` 注入渲染 | `app/w136-07-sandbox-rendered.png` |

> 0.5.92 的诊断直接来自生产服务端访问日志（`journalctl -u coolie`）：同秒内先 302 后 404，
> 且 404 那次请求的 header 里**没有 `cookie`**。这是「真验证据优先」——不猜，读日志。

---

## 4. P3 遗留清账

| 项 | 状态 | 说明 |
|---|---|---|
| **P3-1** Web 项目页「New Task」不预选当前项目 | ✅ 修好并复测 | 新增 `DialogContext.defaultProjectId` + `setDefaultProjectId`；`ProjectDetail` 挂载时注册当前项目；`NewIssueDialog` 在 `newIssueDefaults.projectId` 缺省时回落到它。复测：项目页点**全局** New Task → 提交 payload `projectId` = 当前项目（`w136-07`）。App 端本就有预选，两端行为一致。 |
| **P3-2** 新建项目后 描述/目标 未补齐 | ⚠️ 半通 | 服务端解析补齐**是通的**：上传后首次查询即得 `description`（来自文档）。`goals` 为 0 是这份规范书的形态（无目标类标题下的列表项）——解析器设计如此，不是回归。UI 侧补了「已上传，正在解析补齐」提示 + 失效项目详情缓存，刷新可见。 |
| **P3-3** App 大盘任务总数口径 | ✅ 复验通过 | 131 = API `progress.total`（§2.2）。 |
| **P3-4** App 版本不一致 + OTA 未启用 | ✅ 复验通过 | 发布包三处版本一致、OTA 启用（§2.3）；走查说明写清「dev build 版本号不可信」。 |

---

## 5. 本轮新发现 / 仍未通

| # | 现象 | 级别 | 说明 |
|---|---|---|---|
| N1 | 装机自检页「本版更新说明未取到」 | P3 | `/version.json` 有 `releaseNotes 0.5.93`，App 侧没取到本版文案（提示「更新源未返回本版内容」）。不影响 OTA 与版本判定。 |
| N2 | 同一 runtimeVersion 仍弹「更新就绪」 | P3 | 内嵌 bundle 与 OTA 下发 bundle 同为 0.5.93，App 仍提示「后台已下载完毕，是否重启」；不影响使用，但会打扰。 |
| N3 | `description` 补齐了、`goals` 没有 | P2 | 见 §4 P3-2。需要产品决策：是放宽解析规则，还是接受「目标要人填」。 |
| N4 | 链路段 E1/E2（拆解→交付→回写→done）未重跑 | — | 本轮预算放在「入口 + 交付物预览」；该段上次的阻塞项是 wave134 的 `responsibleUserId`→403，未复验。 |

---

## 6. 完成度小结

| 段落 | 步骤完成 | 说明 |
|---|---|---|
| Web：登录 / 项目中心 / 新建项目对话框 | ✅ 3/3 | — |
| Web：需求文档上传 + 落档 + 自动识别预填 | ✅ 3/3 | wave129 的 P1-1 已随生产部署消失 |
| Web：描述·目标补齐 | ⚠️ 1/2 | 描述✅，目标未产出（文档形态） |
| Web：建任务 + 指派 + **预选** | ✅ 2/2 | P3-1 修复生效 |
| Web：HTML 交付物上传 + **真渲染** | ✅ 2/2 | 端到端可复现 |
| **Web 小计** | **8/8** | 相对 wave129 的 4/8 |
| App：发布包启动 / 版本一致性 / OTA | ✅ 3/3 | P3-4 复验 |
| App：登录 / 公司选择 | ✅ 1/1 | 会话通道可用 |
| App：仪表盘口径 | ✅ 1/1 | P3-3 复验 |
| App：任务浏览 / 详情 | ✅ 1/1 | — |
| App：**原型沙箱渲染 HTML 交付物** | ✅ 1/1 | 0.5.93 真机验证 |
| **App 小计** | **6.5/7 ≈ 93%** | 相对 wave129 的 5.5/7 |
| **端到端「客户需求 → 交付」** | **≈ 80%** | 需求入库→建单→交付物预览已闭环；缺「拆解/员工交付/回写」复跑 |

---

## 7. 复跑脚本与证据

- 复用: `scripts/e2e/wave129/lib.mjs`（Playwright 登录/截图工具），本轮脚本以它为基础。
- 本轮脚本（放在 session scratchpad，未入库，避免 fork-surface 噪音）:
  - `wave136-web.mjs` — 登录→项目中心→需求文档上传→建项目→描述补齐→**全局 New Task 预选（P3-1）**→建任务
  - `wave136-html-web.mjs` — 打开 HTML 附件内容 URL，断言渲染（标题/表格/脚本）
- 证据目录:
  - `docs-coolie/evidence/wave136/web/` — `w136-01..11-*.png` + `notes.json`（含 POST payload/响应）
  - `docs-coolie/evidence/wave136/app/` — 装机自检 / 公司选择 / 仪表盘 / 任务详情 / 沙箱
- App 发版: `0.5.91` → `0.5.92`（exchange 桥，真机证伪）→ `0.5.93`（正文注入，真机通过）。

## 8. 清理

- 本轮库内新增: `docs-coolie/evidence/wave136/**`、代码修复（见 commit）、`scripts/fork-surface.json` 声明。
- 生产: 部署走 `scripts/deploy-coolie.sh`（护栏：同步/构建前后 `/version.json` 与 `/ota/manifest` 均须 200，均通过）；
  App 发版走 `scripts/release-app.sh`（COS 200 + version.json scp + publish-ota）。
- 验证用对象（保留供复查）: 项目 `30f50ce1…`、任务 `XROA-139`、附件 `b6595fca…`（`xroa-dashboard.html`）、
  work product `fa747684…`。未创建任何临时 API key。
