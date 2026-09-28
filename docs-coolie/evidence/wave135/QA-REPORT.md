# WAVE135 — 修 wave129 拟人走查挖出的缺陷 · QA 报告

- 日期: 2026-09-28
- 来源缺陷: `docs-coolie/evidence/wave129/QA-REPORT.md`
- 环境: Web `https://www.xrobinai.cn/XROA`（Playwright 真点击）；App `Coolie工坊` iPhone 17 Pro 模拟器（agent-device 真点击 + Metro dev build）
- 公司: xrobinai `4cafeb9a-…`（Web）／`prod-smoke-1789989524` `b0080331-…`（App 工坊附件回归）
- 纪律: 每项都有真证据（Playwright / 模拟器截图 + API 回读）；未动 `PAPERCLIP_API_KEY` / `DEPLOYMENT_MODE`；未用 agy。

---

## 0. 结论速览

| # | 缺陷 | 状态 | 真验 |
|---|---|---|---|
| P1-A | Web 生产传不了需求文档（构建滞后源码） | ✅ 修复并部署 | bundle hash 变更 + 上传控件探针 + 真上传 201 |
| P1-B | App 邮箱/密码登录 100% 401 | ✅ 修复 | 模拟器登录→选公司→仪表盘；冷启动/跨公司复验 |
| P2-C | 工坊带附件发送死锁（重复上传） | ✅ 修复并部署 | 模拟器发出消息 + 服务端仅 1 份附件 |
| P3-3 | App 大盘任务总数 164 vs API 124 | ✅ 修复 | 改用 `progress.total` |
| P3-1/2/4 | Web 建单预选项目 / 描述目标补齐 / 版本显示 | ⏳ 方案见清单 | `doc/plans/2026-09-28-wave135-p3-checklist.md` |

---

## 1. P1-A · Web 生产无法上传需求文档

### 1.1 真因（比 wave129 更深一层）
wave129 判「线上是旧构建」正确，但**根因不是没重新部署，而是部署本身一直没换掉被服务的文件**：

- 线上 `/XROA/` 由 **Express** 直出（响应头 `x-powered-by: Express`），Express 优先用
  `server/ui-dist/index.html`，其次才是 `../../ui/dist`（`server/src/app.ts:1098`）。
- `scripts/deploy-coolie.sh` 只重建 `ui/dist`，**从不刷新 `server/ui-dist`**；
  而 `server/ui-dist` 是 gitignore 的本地构建产物、**未被 rsync 排除**，于是每次部署
  把本地那份陈旧副本（09-28 02:46）同步过去，把新构建盖掉。
- 结果：每次部署都「built ui」，`ui/dist` 是新的，但**线上服务的是 `server/ui-dist` 的旧包**
  (`index-CR4jE0C_.js`) —— 是 prod 落后源码一整天的真因。

### 1.2 修复
- `scripts/deploy-coolie.sh`：`--exclude='server/ui-dist'`，并在 UI 构建后**在远端**执行
  `rm -rf server/ui-dist && cp -r ui/dist server/ui-dist`。
- `scripts/deploy-tc-coolie-claw.sh`（release-app.sh 驱动的姊妹部署）：同样 `--exclude='server/ui-dist'`。
- 按修好的路径重新部署 `main`。

### 1.3 真验（部署后）
- bundle: `assets/index-CR4jE0C_.js` → **`assets/index-qjKMkIak.js`**（服务端 index.html 的
  `<script src="/assets/index-qjKMkIak.js">`）；该 bundle 命中 `需求文档` / `选择文件` / `coolie-docs`。
- Playwright 真点击（`scripts/e2e/wave135/web-upload.mjs`）：
  - 新建项目对话框 DOM 探针：`{"fileInputs":["需求文档"],"hasLabel":true,"hasPickBtn":true}`（wave129 时全为 false/[]）；
  - 真上传 `/tmp/req.docx` → `POST .../projects/analyze-document` **200**，自动识别名
    「某公司产融智能体应用系统集成服务项目」；
  - 建项目 `POST .../projects` **201**（id `4bdac8e6-…`）→ 落档 `POST .../projects/4bdac8e6-…/documents` **201**。
- `https://www.xrobinai.cn/version.json` 仍 **200**（值在本次发版时更新为 0.5.90，见 §4）。

---

## 2. P1-B · App 邮箱/密码登录 100% 失败

### 2.1 真因（与 wave129 的推断「读不到 Set-Cookie」不同）
模拟器**实测**（Metro 日志）：
```
[diag] signInEmail token? true len 77 cookieName __Secure-paperclip-default.session_token
[diag] stored sessionToken len 77 signed? true            ← 签名 cookie 提取、存储都正常
[diag] A explicit-cookie+origin  401 {"error":"Board authentication required"}
[diag] B jar-only                200 {"session":{...}}    ← 同一签名值，交给原生 jar → 200
[diag] C explicit-cookie-no-origin 401
```
即：App 成功拿到并保存了**带 HMAC 的签名 cookie**；但从 wave70 起共享客户端把它**手写成 `Cookie`
请求头回放**。RN 原生层自己管 cookie jar（`RCTHTTPRequestHandler.mm`：`HTTPShouldSetCookies=YES`
+ `HTTPCookieAcceptPolicy=Always`），**手写 `Cookie` 头会让原生层丢弃/破坏 jar 里的会话 cookie** —— 请求
到服务端就没有可用会话，401。curl 侧对照：同一签名值直接作 `Cookie` 头 → 200；裸 token → 401。

### 2.2 修复
`clients/expo/src/coolie.ts` 共享客户端的 `getAuthHeader`：**不再手写 `Cookie`**，会话 cookie 交给
平台 jar 在 `credentials:"include"` 请求上自动回放；`Authorization: Bearer` 只留给 agent/board API Key。
存储的 session token 仍保留，仅供 WebView 的 `/api/auth/exchange` 桥用（WebView 有自己的 cookie store）。

### 2.3 真验（模拟器，production）
- 冷启动登录（邮箱 `robinschen1989@gmail.com`）→ 无红字 → 进「选择要进入的公司」→ 选 `xrobinai`
  → 仪表盘加载（`app-01-login-dashboard.png`）。
- **冷启动**: `simctl terminate` 后重开 → 直接从持久化的 cookie jar 恢复会话（`app-02-coldstart-company-select.png`）。
- **跨公司切换**: 选 `prod-smoke-1789989524` → 其仪表盘（0 任务）正常加载（`app-03-crosscompany-dashboard.png`）。
- token 过期刷新: jar cookie Max-Age=604800；过期即回登录页并可用同一流程重新登录（登录链已打通）。

---

## 3. P2-C · 工坊带附件发送死锁

### 3.1 真因
`BoardChatScreen` 旧的附件上传有**两条路径**：`handlePickAttachment` 的「即选即传」与
`useEffect` 的「boardIssueId 就绪后按 `staged.slice(uploaded.length)` 补传」。同一文件被传两遍，
服务端落 2 条附件，`uploadedAttachmentIds.length(2) !== stagedAttachments.length(1)` **恒成立**，
发送守卫永远弹「附件上传中」。wave129 证据：XROA-2 下出现 2 条 75,521 B 附件。

### 3.2 修复
- 远端 id 挂到附件**身份**上（`StagedAttachmentLocal.remoteId`），删除按下标对齐的 id 数组。
- 上传按 staged id **幂等去重**：已有 remoteId 直接返回；在飞的复用同一 promise
  （并发路径不会各传一份）；失败记 `error` 停在队列，点发送时重试（不会 effect↔state 死循环）。
- 发送守卫改为**按附件身份**判断齐全，而非比数组长度。
- 补一个前置：全新公司还没有常驻 `Board Operations` issue 时，**server 新增**
  `POST /api/board/chat/issue`（find-or-create，复用 stream 路径同一套逻辑），由 App 上传前解析，
  否则「新公司第一次带附件发送」无 issue 可传。

### 3.3 真验（模拟器 + 服务端回读）
- 模拟器工坊 → 添加附件 → 文件 → `req.docx`：staged 后无「上传失败」，`ensureBoardIssue`
  在远端建出常驻 issue 并上传成功。
- 点「工坊今日花销」快捷气泡发送 → **无「附件上传中」**，用户消息落地并进入「正在连接会话助手…」
  （`app-04-workshop-attachment-sent.png`）。
- 服务端回读（`scripts/e2e/wave135/truth.mjs`，认证态 API）：
  ```json
  {"company":"prod-smoke-1789989524","issueId":"8fdcbd42-…",
   "totalAttachments":1,"reqDocxCount":1,
   "reqDocx":[{"name":"req.docx","size":75521}]}
  ```
  **只 1 份**（wave129 时是 2 份）。

---

## 4. 发版与部署

- server + UI: `scripts/deploy-coolie.sh`（安全 rsync，排除 `ui/ota`、`version.json`、`data`、
  `clients/expo`，并新增排除 `server/ui-dist`）+ 重建 + restart；护栏全程通过：
  `version.json` / `ota/manifest` 同步前后均 200，`/api/health` ok。
- App: `0.5.90 / 590`（`scripts/release-app.sh 0.5.90 … --skip-server-deploy`）：APK →
  `cos://gzbucket/coolie/app/0.5.90/coolie-release.apk`；`version.json` scp 复核 200；OTA 发布 0.5.90。
- 证据目录: `docs-coolie/evidence/wave135/`（web / app 截图 + 本报告 + 重放脚本
  `scripts/e2e/wave135/*`）。
