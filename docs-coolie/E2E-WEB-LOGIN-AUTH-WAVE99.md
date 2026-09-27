# E2E 真验报告: web 登录 + 后续访问 + 后台鉴权 (wave99)

日期: 2026-09-27
执行: claude (wave99, boss 09-26 23:42 OOB 「你得先e2e 测试下web登录，及后续访问，后台鉴权」)
brief: `docs-coolie/briefs/2026-09-26-e2e-test-web-login-auth-wave99.md`

## 结论 (TL;DR)

| 层 | 结论 |
|---|---|
| **Server 端全链路 (真 prod, curl)** | ✅ **全部通过** — 登录 → cookie → get-session → companies → dashboard → exchange (raw/signed/pct 三种形式) → 返回 cookie 再登录 → /XROA HTML 真页面 |
| **后台鉴权** | ✅ 负例全对 — 无 cookie 403 / 错密码 401 / 假 token exchange 401 (server log 有 `invalid_token` trace) |
| **App 端 (adb, 0.5.69/569)** | ✅ 登录进工作区 (真数据) / session 跨 force-stop 持久 / 点 CMMI 门禁 WebView 自动登录进真看板 (不再看到登录页) |
| **净装 (uninstall→install) WebView** | ⚠️ 模拟器上显示登录页 — **判为本机环境伪阴性** (Mac TUN 代理脑裂, 见 §4), 非 prod 链路缺陷; 真机不受影响 |
| **0.5.70 打包** | ❌ 不打 — 未发现 committed 代码存在需修的真缺陷 ("出真修才打包") |

## 1. Server 端 E2E 真验 (真 prod, 2026-09-27 09:06-09:07)

账号: robinschen1989@gmail.com (XiaoChen, userId `CtCxJJuva2SacStByNr58GpQSLMiTjSi`)

| # | 真验 | 结果 |
|---|---|---|
| 1 | `POST /api/auth/sign-in/email` → cookie jar | **200**, `Set-Cookie: __Secure-paperclip-default.session_token=<signed>` (jar 实测 79 字符) |
| 2 | cookie → `GET /api/auth/get-session` | **200** 真 session |
| 3 | cookie → `GET /api/companies` | **200** (xrobinai 等 3 家真公司) |
| 4 | cookie → `GET /api/companies/4cafeb9a…/dashboard` | **200** 真数据 (6 active agents / 40 open / 20 blocked) |
| 5 | `GET /api/auth/exchange?token=…&next=/XROA/projects` — **raw(32)/signed(77)/pct-encoded 三种** | **全部 302** + `Set-Cookie: __Secure-paperclip-default.session_token=…; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800; Secure` + `location: /XROA/projects` |
| 6 | exchange 返回 cookie → `get-session` | **200** 真登录 (同一 userId) |
| 7 | exchange cookie → `/XROA/ontology`、`/XROA/projects` | **200** HTML 真页面 (6648B SPA shell) |

负例 (后台鉴权):

| 场景 | 结果 |
|---|---|
| 无 cookie → `/api/companies` | **403** `{"error":"Board access required"}` |
| 错密码 sign-in | **401** `INVALID_EMAIL_OR_PASSWORD` |
| bogus token → exchange | **401** (prod log: `[bridge] invalid_token tokenLen=32 tokenHead=deadbeefdead…`) |

Server log 真值 (`w99-server-bridge-log.txt`): 三种 token 形式的 validate/ok trace 全在,
raw 走 db session hit, signed/pct 走 Better Auth getSession, `secure=true` (X-Forwarded-Proto 经 Caddy 正确传递)。

## 2. App 端 E2E (emulator-5554, 0.5.69 versionCode 569)

流程: `adb install` → 启动 → 登录 → 工作区 → 汇览 Dashboard → 点「进入 CMMI 门禁」。

| 步骤 | 真值 |
|---|---|
| 登录 | `w99-01`→`w99-04`: 进工作区, xrobinai 6 agents 真数据 (prod log 有对应 okhttp 读请求 200) |
| Dashboard CMMI 卡 | `w99-06`: CMMI 质量工程卡 + 进入 CMMI 门禁按钮 |
| **点 CMMI 门禁 → WebView** | `w99-07`: **自动登录进 `/XROA/projects` 看板** (Coolie工坊 真项目列表), 不是登录页 ✅ |
| force-stop 重启 | `w99-09`: 直接进 Dashboard (session 持久, 免登录) |
| 再点 CMMI 门禁 | `w99-13`: WebView 仍自动登录 (cookie 跨进程重启持久) ✅ |

App 端 prod log 佐证: 09:10-09:11 窗口 okhttp UA 的 dashboard/approvals/labels/agents/projects/issues 全 200 带 cookie。

## 3. [bridge] logcat 未打出的真因 (排查结论, 非功能缺陷)

现象: WebContainerScreen mount 应打 `[bridge] token=…` / `[bridge] targetUrl=…`
(源码 `clients/expo/src/screens/WebContainerScreen.tsx:119,142`), 实际 logcat 一条没有;
而同一 build 的 `[OTA] check manifest` console.log 正常出现 (证明 release 未剥 console.log)。

真因: **设备实际运行的是 09-26 23:40 发布的 OTA bundle (manifest.android.json, id `541bf371`),
该 bundle 构建自未提交的 wave98 实验工作区** (wave98 只有 brief commit `8eb922314`, 无 release commit;
APK 23:37 构建 / OTA 23:40:10 rsync, 均晚于 wave97 23:28)。该实验 bundle 行为与 committed 源码不同:

- 默认登录屏是 native 表单 (committed 源码 `App.tsx:274` 默认 `"web"` = WebLoginScreen);
- WebView 在 App 启动时即初始化 (WebViewFactory 09:15:27.799, 早于任何 tap);
- 无 `[bridge]` console.log 路径。

验证: 当前 manifest 的 launchAsset `index-0e86ae….hbc` 内含 `[bridge]` 字符串但行为不符;
`manifest.android.json` id 与设备 `[OTA] listener setup … updateId=541bf371` 一致, `isUpdateAvailable=false`。

**风险提示 (给 boss/PM): 生产 OTA 目前 serving 一个构建自未提交代码的 bundle, 不可审计、不可复现。
建议后续 wave 决定: 要么从 committed HEAD 重发 OTA, 要么把 wave98 的实验改动补 commit。**
(wave99 按约束「DON'T 改 wave84-98 release」未动它。)

## 4. 净装测试的伪阴性 (环境, 非产品缺陷)

净装 (uninstall → install → 全新登录 → 点 CMMI): WebView 显示登录页 (`w99-16`)。深挖后判定**本机环境伪阴性**:

- 本机 Mac TUN 代理拦截模拟器对 xrobinai.cn 的 HTTPS: **auth 写入被本地克隆 (127.0.0.1:3100, 本仓库 dev server) 吸收, 读请求转发到 prod** → 脑裂。
- 铁证 (`w99-proxy-splitbrain-evidence.txt`): 净装窗口 09:20-09:31 prod 只看到 **132 次 `GET /api/auth/session-token` 全 401** (WebView 内 probe 轮询被转发到 prod, 但克隆签的 cookie prod 不认), **0 次 sign-in POST、0 次 exchange** (被克隆吸收)。
- 即: 净装链路在模拟器上根本没走到 prod 的 exchange。而 prod exchange 整链已被 §1 curl+server log 双证通过。
- 真机 (boss 手机, 无此代理) 不存在脑裂: committed 代码链路 = WebLoginScreen 登录 (cookie 直入 WebView 共享 jar) + probe `/api/auth/session-token` 返 signed token 存 SecureStore + CMMI → exchange (§1 已证 signed 形式 302+Set-Cookie) + cookie Max-Age 7 天持久。链路闭合。

## 5. 决策: 不打 0.5.70

brief 约束「出真修才打包」。本次 E2E:

- server 端无缺陷 (全链路真值通过);
- committed 客户端代码在净装链路上的唯一"失败"复现被证明是本机代理环境伪阴性;
- 唯一真问题是 §3 的 OTA bundle 漂移 (发布卫生问题), 但修它需要重发 OTA, 与「DON'T 改 wave84-98 release」冲突, 留给 boss/PM 决策。

## 6. 证据文件 (`clients/expo/replays/evidence/`)

- `w99-01-login-screen.png` — App 登录屏
- `w99-04-workspace-after-login.png` — 登录进工作区 (真数据)
- `w99-06-dashboard-cmmi-card.png` — Dashboard CMMI 卡
- `w99-07-webview-auto-login-projects.png` — **核心: WebView 自动登录进 /XROA/projects 看板**
- `w99-09-session-persist-after-forcestop.png` — force-stop 后免登录
- `w99-14-fresh-install-login.png` / `w99-15-fresh-login-ok.png` / `w99-16-fresh-webview-login-page.png` — 净装三步 (§4 伪阴性)
- `w99-server-bridge-log.txt` — prod [bridge] 全 trace
- `w99-server-req-summary.txt` — prod 请求汇总
- `w99-logcat-rn.txt` — 设备 ReactNativeJS logcat
- `w99-proxy-splitbrain-evidence.txt` — 脑裂铁证

## 7. 遗留 / 建议

1. **OTA bundle 漂移** (§3): 生产 serving 未提交代码, 建议补 commit 或从 HEAD 重发 (需 boss 决策)。
2. **真机复验**: 请 boss 在真机点一次「进入 CMMI 门禁」确认看到看板 (模拟器受代理污染无法替代)。
3. 本机调试时, 模拟器 E2E 结论要打折扣: auth 类真验以 Mac 侧 curl (直连 prod) 为准。
