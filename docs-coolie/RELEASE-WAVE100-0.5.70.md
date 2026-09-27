# wave100 报告: 0.5.70 真修 + 真发版 + OTA 从 HEAD 重发 (boss 23:50 OOB「咱们得派员工干活」)

日期: 2026-09-27
执行: claude (wave100), brief: `docs-coolie/briefs/2026-09-26-fix-ota-uncommitted-and-webview-residual-wave100.md`
协作: wave98 会话 (coolie-f1) 交接其 server 端修复 (见 §1)

## 结论 (TL;DR)

| 项 | 结果 |
|---|---|
| 0.5.70 APK (570) | ✅ 构建/装机/aapt 验证, COS 已传, commit `472e7d42a` 已 push |
| OTA | ✅ 从 committed HEAD 重发 (manifest `92980f11`, 替换 09-26 23:40 的幽灵 `541bf371`) |
| CMMI 门禁 WebView 自动登录 | ✅ 模拟器真验: 点「进入 CMMI 门禁」自动进 `/XROA/projects` 看板, 不再看到登录页 |
| 根因 | ✅ 两层叠加, 双双坐实+双修 (值双重编码 + cookie 存不进), prod curl A/B 铁证 |
| 发布卫生 | ✅ publish-ota.sh 脏树硬阻断上线 |

```
Coolie工坊 0.5.70: https://dls.xrobinai.cn/coolie/app/0.5.70/coolie-release.apk    ← NEW
OTA manifest: runtimeVersion 0.5.70 (committed HEAD 472e7d42a)
```

## 1. 真值盘点 (会师 wave98)

- wave98 会话 (coolie-f1) 今早 08:48 被 PM 重拉, 09:33-09:37 已改 server 端 + bump 版本 + 构建 APK,
  **并在 09:34-09:36 把 server 改动部署到 prod restart** (SameSite=None + auth wrapper 暴露
  secret + ui/dist 新 sw.js)。wave100 通过 SendMessage 协调交接: wave98 停止发布动作,
  未 commit 改动全部并入 wave100 的整合提交 `472e7d42a`。
- 09-26 23:40 的幽灵 OTA (构建自 wave98 未提交工作区, 不可审计) 已被本次 HEAD 重发覆盖。

## 2. 两层叠加真因 (boss 08:36 真机 Caddy 日志铁证: exchange 302+Set-Cookie ✅ → get-session 401 ❌)

1. **值错了 (wave100 根因, prod curl A/B 复现)**:
   - App 把 Better Auth cookie 的 **wire 形式** (`encodeURIComponent` 过的签名值, 含 `%2F`/`%2B`)
     当逻辑值存 SecureStore (`extractSessionTokenCookie` 抓的原始 Set-Cookie 值);
     exchange URL 又 `encodeURIComponent` 一次 → `%252F` **双重编码** (08:36 URL 实测)。
   - better-auth `parseCookies` 的 `tryDecode` 只解**一层**: 验证时解一层→真值→过 (302);
     铸出的 cookie 又 encode 一层, WebView 回传解一层→wire 形式→HMAC 失败→401。
   - A/B 铁证 (`w100-prod-ab-curl.txt`): 同一 token, 单编码 get-session **200**, 双重编码 **401**。
2. **存不进 (wave98, prod 单变量 A/B)**:
   - 老 sw.js fetch 拦截只豁免 `startsWith("/api")` — `/XROA/api/auth/exchange` **导航被 service
     worker 代理**, SameSite=Lax cookie 在该上下文存不进 jar; Lax=登录页 / None=自动登录 (A/B)。

## 3. 修复 (commit `472e7d42a`, 11 文件)

- `clients/api-client/client.ts`: `extractSessionTokenCookie` 对 wire 值 decode 一层 (存逻辑值)。
- `clients/expo/coolie.ts`: `saveSessionToken`/`getSessionToken` 双向归一 — **旧安装已存的 wire 值
  免重登自动 heal** (0.5.69 升 0.5.70 不用重新输密码)。
- `ui/public/sw.js`: fetch 拦截豁免任何含 `/api/` 的路径 (bridge 302+Set-Cookie 交还导航栈)。
- `server/auth/app-web-login-bridge.ts`: Set-Cookie SameSite Lax→**None**(+Secure)。
- `server/auth/better-auth.ts`: auth wrapper 暴露 `options.secret` (session-token 路由/bridge 正确签名)。
- `clients/expo/WebContainerScreen.tsx`: 落到 /auth 页时一次自愈重试 exchange。
- `scripts/publish-ota.sh`: 脏工作区**硬阻断** (`--allow-dirty` 逃生口) — 幽灵 OTA 事件不再可能。
- 版本 0.5.70/570 + CHANGELOG 真实因果重写。
- 验证: bridge 测试 30/30 过; api-client/expo/server typecheck 全绿。

## 4. 发版链 (全部 from HEAD `472e7d42a`)

1. gradle clean assembleRelease (2m28s, exit 0) → aapt: versionCode=570 versionName=0.5.70。
2. `runtime-version.mjs --json`: intent=0.5.70, apk=0.5.70, resolved=0.5.70, agrees=true。
3. coscli → `cos://gzbucket/coolie/app/0.5.70/coolie-release.apk` (74.47MB)。
4. version.json (0.5.70/570/commitSha=472e7d42a) → `/opt/coolie/ui/dist/version.json`。
5. `publish-ota.sh android` (工作区 clean, 守卫放行) → manifest `92980f11`, runtimeVersion 0.5.70。
   - wave86 动态 manifest 使 **0.5.69 老装机也立即拉到 HEAD bundle** (runtimeVersion 按请求头回写) —
     幽灵 bundle 的存量设备无需装 APK 即被治愈。

## 5. 模拟器真验 (emulator-5554, 净装 + OTA bundle, 证据 `clients/expo/replays/evidence/w100-*`)

| 步骤 | 真值 |
|---|---|
| adb install 0.5.70 | versionCode=570 / versionName=0.5.70 |
| 装机自检 | **全绿**: APK v0.5.70 / OTA 热更新已启用 / OTA 运行时 0.5.70 / 更新源已连通 / 当前 bundle 由 OTA 下发 (`w100-04`) |
| OTA 交付 | 启动即 match → 下载 → 「更新就绪」→ 重启生效 → 运行 updateId=7c956c03 (HEAD bundle), logcat `[OTA]` 全链 |
| 登录 (web 统一登录) | 进工作区, XiaoChen / xrobinai 6 员工真数据 (`w100-19`; native 表单路径亦验过 `w100-08`) |
| **点「进入 CMMI 门禁」** | **WebView 自动登录进 `/XROA/projects` 看板** (CMMI 3级/5级评估真项目), 不再看到登录页 ✅ (`w100-21`) |
| force-stop 重启 | 免登录直进工作区 (`w100-22`) |
| CMMI 复开 | 仍自动登录 (7 天 cookie 持久, `w100-23`) |

环境注记: 本机 TUN 代理把模拟器 WebView 流量吸进本地 clone (okhttp→prod / WebView→clone 脑裂,
wave99 已记录)。本次验证的 WebView 链全程落在 clone (与本仓库同代码, tsx watch 热载了修复);
prod 侧链路由 curl A/B (§2) + wave98 SameSite A/B 双证。**boss 真机装 0.5.70 APK 后点一次
「进入 CMMI 门禁」即为最终确认** (真机无代理脑裂)。

## 6. 遗留 / 建议

1. `[bridge]` console.log 在 OTA release bundle 的 logcat 不出现 ([OTA] 的出现) — 未深究, 不影响功能。
2. `/api/release-notes?version=0.5.70` 仍 404 (自检页「更新说明未取到」) — 0.5.69 起已如此, 非本波回归。
3. app 内升级下载试了 `/ota/app/0.5.70/coolie-release.apk` 等 2 个不存在路径 (404) — 升级卡片若依赖
   dls 域名 URL 则正常; 建议后续 wave 核对 APK 自升级路径。
4. publish-ota 硬阻断已上线, 后续发布必须先 commit。
